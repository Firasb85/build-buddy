import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeForecast, type ForecastResult, type Horizon, type Metric } from "./forecast.server";

const HorizonSchema = z.enum(["7d", "4w", "3m"]);
const MetricSchema = z.enum(["demand", "inventory", "cash"]);

/** Persist forecast results to DB. */
async function persistForecasts(
  sb: ReturnType<typeof Object>,
  runs: ForecastResult[],
  metric: Metric,
  horizon: Horizon,
) {
  if (runs.length === 0) return;
  const rows = runs.flatMap((r) => {
    const make = (s: "optimistic" | "likely" | "pessimistic") => ({
      metric,
      horizon,
      subject: r.subject,
      scenario: s,
      point_estimate: r[s].point,
      low_estimate: r[s].low,
      high_estimate: r[s].high,
      confidence: r[s].confidence,
      driver_notes: { drivers: r[s].drivers, history: r.history, baseline: r.baseline },
    });
    return [make("optimistic"), make("likely"), make("pessimistic")];
  });
  await sb.from("forecast_runs").insert(rows);
}

/** Aggregate daily entries into a demand series per product over `days` days. */
async function loadDemandSeries(
  sb: any,
  productId: string,
  days: number,
): Promise<{ date: string; value: number }[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("daily_entries")
    .select("entry_date,produced,shipped")
    .eq("product_id", productId)
    .gte("entry_date", since)
    .order("entry_date", { ascending: true });
  // Aggregate shipped by day (proxy for demand)
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const d = String(row.entry_date).slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + Number(row.shipped ?? 0));
  }
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

/** Demand (from orders) by day for a product. */
async function loadOrderDemandSeries(
  sb: any,
  productId: string,
  days: number,
): Promise<{ date: string; value: number }[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("orders")
    .select("due_date,quantity,status")
    .eq("product_id", productId)
    .gte("due_date", since)
    .order("due_date", { ascending: true });
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const d = String(row.due_date).slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + Number(row.quantity ?? 0));
  }
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

/**
 * Run a 3-scenario forecast for one product.
 * - metric=demand: based on shipped + order history
 * - metric=inventory: based on stock movement
 * - metric=cash: based on order value weighted by margin (factory-level, subject="ALL")
 */
export const runForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      metric: MetricSchema,
      horizon: HorizonSchema,
      product_id: z.string().uuid().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const historyDays = 60;

    if (data.metric === "demand") {
      // Per product (or all products summed if no product_id)
      if (data.product_id) {
        const [product, series] = await Promise.all([
          sb.from("products").select("id,name_ar,name_en,sku,daily_demand,stock_qty").eq("id", data.product_id).maybeSingle(),
          loadOrderDemandSeries(sb, data.product_id, historyDays),
        ]);
        if (!product.data) return { results: [] as ForecastResult[] };
        const shippedSeries = await loadDemandSeries(sb, data.product_id, historyDays);
        // combine: take max of order demand vs shipped for each date
        const byDate = new Map<string, number>();
        for (const s of shippedSeries) byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.value));
        for (const s of series) byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.value));
        const merged = [...byDate.entries()].sort().map(([date, value]) => ({ date, value }));
        const result = computeForecast({
          metric: "demand",
          horizon: data.horizon,
          subject: product.data.id,
          unit: "units",
          history: merged,
          currentValue: Number(product.data.daily_demand),
        });
        await persistForecasts(sb, [result], "demand", data.horizon);
        return { results: [result] as ForecastResult[] };
      }
      // all products
      const { data: products } = await sb.from("products").select("id,daily_demand").eq("active", true);
      const results: ForecastResult[] = [];
      for (const p of products ?? []) {
        const series = await loadOrderDemandSeries(sb, p.id, historyDays);
        const result = computeForecast({
          metric: "demand",
          horizon: data.horizon,
          subject: p.id,
          unit: "units",
          history: series,
          currentValue: Number(p.daily_demand),
        });
        results.push(result);
      }
      await persistForecasts(sb, results, "demand", data.horizon);
      return { results };
    }

    if (data.metric === "inventory") {
      if (!data.product_id) {
        // aggregate
        const { data: products } = await sb.from("products").select("id,name_ar,name_en,sku,stock_qty,daily_demand").eq("active", true);
        const results: ForecastResult[] = [];
        for (const p of products ?? []) {
          // approximate inventory series from daily_entries produced-shipped
          const since = new Date(Date.now() - historyDays * 86400_000).toISOString().slice(0, 10);
          const { data: rows } = await sb
            .from("daily_entries")
            .select("entry_date,produced,shipped")
            .eq("product_id", p.id)
            .gte("entry_date", since)
            .order("entry_date");
          let running = Number(p.stock_qty);
          const series: { date: string; value: number }[] = [];
          for (const r of rows ?? []) {
            running = Math.max(0, running - Number(r.shipped ?? 0) + Number(r.produced ?? 0));
            series.push({ date: String(r.entry_date).slice(0, 10), value: running });
          }
          const result = computeForecast({
            metric: "inventory",
            horizon: data.horizon,
            subject: p.id,
            unit: "units",
            history: series,
            currentValue: Number(p.stock_qty),
            threshold: Number(p.daily_demand) * 3, // 3-day threshold
          });
          results.push(result);
        }
        await persistForecasts(sb, results, "inventory", data.horizon);
        return { results };
      }
      // single product
      const { data: product } = await sb.from("products").select("id,stock_qty,daily_demand").eq("id", data.product_id).maybeSingle();
      if (!product) return { results: [] as ForecastResult[] };
      const since = new Date(Date.now() - historyDays * 86400_000).toISOString().slice(0, 10);
      const { data: rows } = await sb
        .from("daily_entries")
        .select("entry_date,produced,shipped")
        .eq("product_id", data.product_id)
        .gte("entry_date", since)
        .order("entry_date");
      let running = Number(product.stock_qty);
      const series: { date: string; value: number }[] = [];
      for (const r of rows ?? []) {
        running = Math.max(0, running - Number(r.shipped ?? 0) + Number(r.produced ?? 0));
        series.push({ date: String(r.entry_date).slice(0, 10), value: running });
      }
      const result = computeForecast({
        metric: "inventory",
        horizon: data.horizon,
        subject: product.id,
        unit: "units",
        history: series,
        currentValue: Number(product.stock_qty),
        threshold: Number(product.daily_demand) * 3,
      });
      await persistForecasts(sb, [result], "inventory", data.horizon);
      return { results: [result] as ForecastResult[] };
    }

    // metric === "cash" — factory-level
    const since = new Date(Date.now() - historyDays * 86400_000).toISOString().slice(0, 10);
    const { data: orders } = await sb
      .from("orders")
      .select("due_date,quantity,status,products(margin_pct)")
      .gte("due_date", since);
    const map = new Map<string, number>();
    for (const o of orders ?? []) {
      const margin = Number((o as { products?: { margin_pct?: number } }).products?.margin_pct ?? 0);
      const cash = Number(o.quantity) * margin * 100; // proxy: 1 unit = 100 SAR
      const d = String(o.due_date).slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + cash);
    }
    const series = [...map.entries()].sort().map(([date, value]) => ({ date, value }));
    const totalOpen = (orders ?? []).reduce((a, o) => a + Number(o.quantity) * 100, 0);
    const result = computeForecast({
      metric: "cash",
      horizon: data.horizon,
      subject: "ALL",
      unit: "SAR",
      history: series,
      currentValue: totalOpen,
    });
    await persistForecasts(sb, [result], "cash", data.horizon);
    return { results: [result] as ForecastResult[] };
  });

/** Get the latest forecast run for display (no recompute). */
export const getLatestForecasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      metric: MetricSchema,
      horizon: HorizonSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // latest run_at for this metric+horizon
    const { data: latest } = await sb
      .from("forecast_runs")
      .select("run_at")
      .eq("metric", data.metric)
      .eq("horizon", data.horizon)
      .order("run_at", { ascending: false })
      .limit(1);
    if (!latest?.[0]) return { runAt: null, results: [] as ForecastResult[] };
    const runAt = latest[0].run_at;
    const { data: rows } = await sb
      .from("forecast_runs")
      .select("subject,scenario,point_estimate,low_estimate,high_estimate,confidence,driver_notes")
      .eq("metric", data.metric)
      .eq("horizon", data.horizon)
      .eq("run_at", runAt);
    // Group by subject
    const bySubject = new Map<string, { subject: string; optimistic?: any; likely?: any; pessimistic?: any }>();
    for (const r of rows ?? []) {
      const cur = bySubject.get(r.subject) ?? { subject: r.subject };
      cur[r.scenario as "optimistic" | "likely" | "pessimistic"] = {
        point: Number(r.point_estimate),
        low: r.low_estimate == null ? null : Number(r.low_estimate),
        high: r.high_estimate == null ? null : Number(r.high_estimate),
        confidence: Number(r.confidence),
        drivers: ((r.driver_notes as { drivers?: string[] } | null)?.drivers) ?? [],
      };
      bySubject.set(r.subject, cur);
    }
    const results: ForecastResult[] = [...bySubject.values()].map((g) => ({
      metric: data.metric,
      horizon: data.horizon,
      subject: g.subject,
      unit: data.metric === "cash" ? "SAR" : "units",
      baseline: ((g.likely as { point?: number })?.point ?? 0),
      history: 0,
      optimistic: g.optimistic ?? { scenario: "optimistic", point: 0, low: 0, high: 0, confidence: 0, drivers: [] },
      likely: g.likely ?? { scenario: "likely", point: 0, low: 0, high: 0, confidence: 0, drivers: [] },
      pessimistic: g.pessimistic ?? { scenario: "pessimistic", point: 0, low: 0, high: 0, confidence: 0, drivers: [] },
    }));
    return { runAt, results };
  });
