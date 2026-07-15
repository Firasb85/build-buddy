import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  detectAlerts,
  type ProductSnapshot,
  type MaterialSnapshot,
  type LineSnapshot,
} from "./anomaly.server";

/**
 * Run anomaly detection, persist the alerts (deduped by kind+subject), and return the result.
 */
export const detectAndPersistAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

    const [productsRes, materialsRes, linesRes, entriesRes, ordersRes] = await Promise.all([
      sb.from("products").select("id,name_ar,name_en,daily_demand,stock_qty,stability,margin_pct").eq("active", true),
      sb.from("materials").select("id,name_ar,name_en,unit,stock_qty,reorder_point,unit_cost,lead_time_days"),
      sb.from("production_lines").select("id,name_ar,name_en,status"),
      sb.from("daily_entries").select("product_id,entry_date,produced,shipped").gte("entry_date", since),
      sb.from("orders").select("quantity,status,products(margin_pct)").in("status", ["approved", "in_progress", "received", "reviewing"]),
    ]);

    // Group entries by product
    const byProduct = new Map<string, { produced: number[]; shipped: number[]; yield: number[] }>();
    for (const e of entriesRes.data ?? []) {
      const cur = byProduct.get(e.product_id) ?? { produced: [], shipped: [], yield: [] };
      const produced = Number(e.produced ?? 0);
      const shipped = Number(e.shipped ?? 0);
      cur.produced.push(produced);
      cur.shipped.push(shipped);
      if (produced > 0) cur.yield.push(shipped / produced);
      byProduct.set(e.product_id, cur);
    }

    const products: ProductSnapshot[] = (productsRes.data ?? []).map((p: any) => {
      const g = byProduct.get(p.id) ?? { produced: [], shipped: [], yield: [] };
      return {
        id: p.id,
        name_ar: p.name_ar,
        name_en: p.name_en,
        daily_demand: Number(p.daily_demand),
        stock_qty: Number(p.stock_qty),
        stability: Number(p.stability),
        margin_pct: Number(p.margin_pct),
        recent_produced: g.produced,
        recent_shipped: g.shipped,
        recent_yield_pct: g.yield,
      };
    });

    const materials: MaterialSnapshot[] = (materialsRes.data ?? []).map((m: any) => ({
      id: m.id,
      name_ar: m.name_ar,
      name_en: m.name_en,
      unit: m.unit,
      stock_qty: Number(m.stock_qty),
      reorder_point: Number(m.reorder_point),
      unit_cost: Number(m.unit_cost),
      lead_time_days: m.lead_time_days,
    }));

    const lines: LineSnapshot[] = (linesRes.data ?? []).map((l: any) => ({
      id: l.id,
      name_ar: l.name_ar,
      name_en: l.name_en,
      status: l.status,
    }));

    const openOrderValue = (ordersRes.data ?? []).reduce((a: number, o: any) => {
      const margin = Number(o.products?.margin_pct ?? 0);
      return a + Number(o.quantity) * 100 * (1 + margin);
    }, 0);

    const detected = detectAlerts({ products, materials, lines, openOrderValue });

    // Get existing active (non-dismissed) alerts by kind+subject to dedupe
    const { data: existing } = await sb
      .from("alert_states")
      .select("kind,subject_id,id")
      .is("dismissed_at", null);
    const seen = new Set((existing ?? []).map((e: any) => `${e.kind}|${e.subject_id}`));

    const newRows = detected
      .filter((d) => !seen.has(`${d.kind}|${d.subject_id}`))
      .map((d) => ({
        kind: d.kind,
        severity: d.severity,
        subject_kind: d.subject_kind,
        subject_id: d.subject_id,
        title_ar: d.title_ar,
        title_en: d.title_en,
        detail_ar: d.detail_ar ?? null,
        detail_en: d.detail_en ?? null,
        metric_value: d.metric_value ?? null,
        threshold_value: d.threshold_value ?? null,
      }));

    if (newRows.length) await sb.from("alert_states").insert(newRows);

    return { detected: detected.length, new_alerts: newRows.length, alerts: detected };
  });

export const listActiveAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("alert_states")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    (input as { id?: string })?.id ? { id: (input as { id: string }).id } : { id: "" },
  )
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Alert id required");
    const { error } = await context.supabase
      .from("alert_states")
      .update({ dismissed_at: new Date().toISOString(), dismissed_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
