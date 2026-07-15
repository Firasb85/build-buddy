// Local (Dexie) implementations of the previous Supabase server functions.
// Each function returns a Promise and works in the browser only — pages
// call these directly (no useServerFn needed) inside useQuery / useMutation.

import { db, ensureSeeded, resetAndReseed, type Product, type Material, type ProductionLine, type Customer, type Order, type DailyEntry, type ObjectiveSettings, type Recommendation, type DecisionLog, type AiRun, type AlertState, type PpsSnapshot, type ForecastRun, type SimulationRun, type AssistantMessage, type LearningSignal } from "./local-db";
import { computePPSForAll, WEIGHTS, type Objective } from "./pps.server";
import { computeForecast, type ForecastResult } from "./forecast.server";
import { runSimulation, type SimParams, type SimProduct, type SimLine, type SimMaterial } from "./simulate.server";
import { detectAlerts, type ProductSnapshot, type MaterialSnapshot, type LineSnapshot } from "./anomaly.server";
import { answerFromContext, detectIntent, type AssistantContext } from "./assistant.server";
import { computeWeeklyAccuracy, suggestWeightTuning } from "./learning.server";

// Make sure the DB is ready before any read.
async function ready() {
  await ensureSeeded();
}

// ============ AI runs (jobs) ============

export type RunKind = "pps" | "forecast" | "simulate" | "briefing" | "anomaly" | "assistant";
export type RunStatus = "running" | "success" | "error";

async function recordRunStart(input: { kind: RunKind; params?: unknown; userId?: string | null }): Promise<{ runId: string; startedAt: number; finish: (result?: unknown) => Promise<void>; fail: (err: unknown) => Promise<void> }> {
  const startedAt = Date.now();
  const id = crypto.randomUUID();
  await db().ai_runs.put({
    id, created_at: new Date(startedAt).toISOString(), finished_at: null,
    user_id: input.userId ?? null, kind: input.kind, status: "running",
    duration_ms: null, params: (input.params as Record<string, unknown>) ?? null,
    result_summary: null, error_message: null,
  });
  return {
    runId: id, startedAt,
    async finish(result?: unknown) {
      const summary = summarize(result);
      await db().ai_runs.update(id, {
        status: "success", finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt, result_summary: summary,
      });
    },
    async fail(err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await db().ai_runs.update(id, {
        status: "error", finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt, error_message: message,
      });
    },
  };
}

function summarize(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ["count", "rows", "results", "alerts", "answer", "objective", "delta", "metric", "horizon"]) {
    if (k in r) {
      const v = r[k];
      if (typeof v === "number" || typeof v === "string") out[k] = v;
      else if (Array.isArray(v)) out[`${k}_count`] = v.length;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Wrap a function so every call is recorded into ai_runs. */
function withJob<K extends RunKind, A extends unknown[], R>(kind: K, fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const run = await recordRunStart({ kind, params: args });
    try {
      const r = await fn(...args);
      await run.finish(r);
      return r;
    } catch (e) {
      await run.fail(e);
      throw e;
    }
  };
}

// ============ PPS ============

export interface PPSRow {
  product_id: string;
  pps: number;
  components: {
    stockout_risk: number;
    profit_impact: number;
    customer_importance: number;
    line_efficiency: number;
    material_readiness: number;
    strategic_weight: number;
  };
  constraint_status: "ok" | "constrained";
  constraint_notes: { code: string; detail: string }[] | null;
  run_at: string;
  product: Product | null;
}

export async function runPPS(): Promise<{ runAt: string; count: number; objective: string }> {
  await ready();
  const run = await recordRunStart({ kind: "pps" });
  try {
    const [obj, products, lines, bom, materials, orders, customers] = await Promise.all([
      db().objective_settings.get(1),
      db().products.where("active").equals(1 as unknown as never).toArray().catch(() => db().products.toArray()).then((rs) => rs.filter((p) => p.active)),
      db().production_lines.toArray(),
      db().bom_items.toArray(),
      db().materials.toArray(),
      db().orders.toArray(),
      db().customers.toArray(),
    ]);
    const objective = (obj?.objective ?? "default") as Objective;
    const customWeights = obj?.custom_weights ?? undefined;
    const activeProducts = (products as Product[]);
    // Customer agg
    const custMap = new Map((customers as Customer[]).map((c) => [c.id, Number(c.importance)]));
    const custAgg: Record<string, { product_id: string; weighted_importance: number; total_open_qty: number }> = {};
    for (const o of (orders as Order[])) {
      if (!["received", "reviewing", "approved", "in_progress"].includes(o.status)) continue;
      const imp = custMap.get(o.customer_id) ?? 5;
      const cur = custAgg[o.product_id] ?? { product_id: o.product_id, weighted_importance: 0, total_open_qty: 0 };
      cur.weighted_importance = (cur.weighted_importance * cur.total_open_qty + imp * Number(o.quantity)) / (cur.total_open_qty + Number(o.quantity));
      cur.total_open_qty += Number(o.quantity);
      custAgg[o.product_id] = cur;
    }
    const results = computePPSForAll({
      objective,
      products: activeProducts.map((p) => ({
        id: p.id, daily_demand: Number(p.daily_demand), margin_pct: Number(p.margin_pct),
        stability: Number(p.stability), strategic_weight: Number(p.strategic_weight),
        stock_qty: Number(p.stock_qty), preferred_line_id: p.preferred_line_id, moq: Number(p.moq),
      })),
      lines: (lines as ProductionLine[]).map((l) => ({ id: l.id, quality_factor: Number(l.quality_factor), status: l.status })),
      bom: (bom as { product_id: string; material_id: string; quantity_per_unit: number }[]).map((b) => ({ product_id: b.product_id, material_id: b.material_id, quantity_per_unit: Number(b.quantity_per_unit) })),
      materials: (materials as Material[]).map((m) => ({ id: m.id, stock_qty: Number(m.stock_qty) })),
      customerAgg: custAgg,
      customWeights: customWeights ?? undefined,
    });
    const runAt = new Date().toISOString();
    const snapshots: PpsSnapshot[] = results.map((r) => ({
      id: crypto.randomUUID(), run_at: runAt, objective,
      product_id: r.product_id, pps: r.pps, components: r.components,
      constraint_status: r.constraint_status, constraint_notes: r.constraint_notes,
    }));
    if (snapshots.length) await db().pps_snapshots.bulkPut(snapshots);
    // Supersede old pending recos, then create new top 5
    const allPending = await db().recommendations.where("status").equals("pending").toArray();
    for (const r of allPending) await db().recommendations.update(r.id, { status: "superseded" });
    const top = [...results].sort((a, b) => b.pps - a.pps).slice(0, 5);
    const productsById = new Map(activeProducts.map((p) => [p.id, p]));
    const newRecos: Recommendation[] = top.map((r) => {
      const p = productsById.get(r.product_id);
      const days = r.raw.stock_days;
      const constrained = r.constraint_status === "constrained";
      return {
        id: crypto.randomUUID(), created_at: runAt, product_id: r.product_id,
        action_ar: constrained ? `تفعيل بديل / معالجة قيد ثم إنتاج ${p?.name_ar ?? ""}` : `إنتاج ${p?.name_ar ?? ""} بأولوية قصوى`,
        action_en: constrained ? `Resolve constraint then produce ${p?.name_en ?? ""}` : `Produce ${p?.name_en ?? ""} at top priority`,
        reason_ar: `درجة PPS ${r.pps}. أيام المخزون ${days}. جاهزية ${(r.raw.readiness * 100).toFixed(0)}٪.`,
        reason_en: `PPS ${r.pps}. Stock days ${days}. Readiness ${(r.raw.readiness * 100).toFixed(0)}%.`,
        impact: r.components, priority: r.pps, status: "pending",
        decided_by: null, decided_at: null,
      };
    });
    if (newRecos.length) await db().recommendations.bulkPut(newRecos);
    const out = { runAt, count: results.length, objective };
    await run.finish(out);
    return out;
  } catch (e) {
    await run.fail(e);
    throw e;
  }
}

export async function getLatestPPS(): Promise<{ runAt: string | null; rows: PPSRow[] }> {
  await ready();
  const all = await db().pps_snapshots.toArray();
  if (all.length === 0) return { runAt: null, rows: [] };
  all.sort((a, b) => b.run_at.localeCompare(a.run_at));
  const runAt = all[0]!.run_at;
  const rows = all.filter((s) => s.run_at === runAt);
  const products = await db().products.toArray();
  const productById = new Map(products.map((p) => [p.id, p]));
  return {
    runAt,
    rows: rows
      .sort((a, b) => b.pps - a.pps)
      .map((s) => ({
        product_id: s.product_id,
        pps: s.pps,
        components: {
          stockout_risk: s.components.stockout_risk,
          profit_impact: s.components.profit_impact,
          customer_importance: s.components.customer_importance,
          line_efficiency: s.components.line_efficiency,
          material_readiness: s.components.material_readiness,
          strategic_weight: s.components.strategic_weight,
        },
        constraint_status: s.constraint_status,
        constraint_notes: s.constraint_notes,
        run_at: s.run_at,
        product: productById.get(s.product_id) ?? null,
      })),
  };
}

// ============ Recommendations & decisions ============

export async function listRecommendations(): Promise<Recommendation[]> {
  await ready();
  return (await db().recommendations.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
}

export async function listDecisionLog(): Promise<DecisionLog[]> {
  await ready();
  return (await db().decision_log.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
}

export async function decideRecommendation(input: { recommendation_id: string; accept: boolean; notes?: string | null }): Promise<{ ok: true }> {
  await ready();
  const status = input.accept ? "accepted" : "rejected";
  const nowIso = new Date().toISOString();
  const reco = await db().recommendations.get(input.recommendation_id);
  const objectiveRow = await db().objective_settings.get(1);
  const currentObjective = (objectiveRow?.objective ?? "default") as Objective;
  await db().recommendations.update(input.recommendation_id, { status, decided_at: nowIso });
  await db().decision_log.put({
    id: crypto.randomUUID(),
    created_at: nowIso,
    user_id: null,
    recommendation_id: input.recommendation_id,
    action: status,
    notes: input.notes ?? null,
  });
  // Learning signal
  if (reco) {
    const impact = reco.impact ?? {};
    const entries = Object.entries(impact);
    let dominantIdx = -1, dominantVal = -Infinity;
    entries.forEach(([k, v], i) => {
      if (typeof v === "number" && v > dominantVal) { dominantVal = v; dominantIdx = i; }
    });
    const weightMap: Record<string, number[]> = {
      default: [0.30, 0.25, 0.15, 0.10, 0.12, 0.08],
      maximize_profit: [0.15, 0.40, 0.25, 0.10, 0.05, 0.05],
      maximize_service: [0.45, 0.10, 0.30, 0.05, 0.05, 0.05],
      reduce_inventory: [0.10, 0.20, 0.20, 0.15, 0.25, 0.10],
      protect_cash: [0.20, 0.15, 0.20, 0.10, 0.25, 0.10],
    };
    await db().learning_signals.put({
      id: crypto.randomUUID(),
      created_at: nowIso,
      user_id: null,
      recommendation_id: input.recommendation_id,
      product_id: reco.product_id,
      signal: input.accept ? "accept" : "reject",
      objective: currentObjective,
      weight_snapshot: weightMap[currentObjective] ?? weightMap.default,
      component_dominant: dominantIdx >= 0 ? dominantIdx : null,
      accuracy_score: null,
    });
  }
  return { ok: true };
}

// ============ Briefing ============

export async function generateBriefing(input: { lang: "ar" | "en" }): Promise<{ text: string; objective: string; avg_stock_days: string }> {
  await ready();
  const run = await recordRunStart({ kind: "briefing", params: input });
  try {
    const [recos, obj, products] = await Promise.all([
      db().recommendations.where("status").equals("pending").toArray(),
      db().objective_settings.get(1),
      db().products.toArray(),
    ]);
    const objective = obj?.objective ?? "default";
    const totalStock = products.reduce((a, p) => a + Number(p.stock_qty), 0);
    const totalDemand = products.reduce((a, p) => a + Number(p.daily_demand), 0);
    const avgStockDays = totalDemand > 0 ? (totalStock / totalDemand).toFixed(1) : "n/a";
    const productById = new Map(products.map((p) => [p.id, p]));
    const payload = {
      objective,
      avg_stock_days: avgStockDays,
      top_actions: recos.slice(0, 5).map((r) => ({
        action: input.lang === "ar" ? r.action_ar : r.action_en,
        reason: input.lang === "ar" ? r.reason_ar : r.reason_en,
        priority: r.priority,
        impact: r.impact,
        product: productById.get(r.product_id ?? "")?.name_en ?? "",
      })),
    };
    const key = (typeof process !== "undefined" && (process as { env?: Record<string, string> }).env?.LOVABLE_API_KEY) || "";
    let text = "";
    if (key) {
      try {
        const systemAr = `أنت مساعد تنفيذي لمصنع إنتاجي. صياغة الملخص يجب أن تكون قصيرة، حازمة، بلغة قرار. اكتب في 4 فقرات قصيرة:
1) الوضع في جملة واحدة.
2) أهم إجراء يجب اتخاذه اليوم مع السبب المرقم.
3) القيود أو المخاطر.
4) الأثر المتوقع (مالياً وتشغيلياً) بأرقام تقريبية معقولة. لا تخترع أرقاماً غير موجودة في المدخلات.`;
        const systemEn = `You are an executive assistant for a production plant. Keep the briefing terse and decisive. Write 4 short paragraphs:
1) One-sentence situation.
2) The top action to take today with the numbered reason.
3) Constraints or risks.
4) Expected business impact with plausible approximate figures. No filler. Do not invent numbers.`;
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify({
            model: "openai/gpt-5.5",
            messages: [
              { role: "system", content: input.lang === "ar" ? systemAr : systemEn },
              { role: "user", content: JSON.stringify(payload, null, 2) },
            ],
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const content = json?.choices?.[0]?.message?.content;
          if (typeof content === "string" && content.trim().length > 0) text = content.trim();
        }
      } catch { /* fall through */ }
    }
    if (!text) {
      // Deterministic fallback
      const top = payload.top_actions[0];
      if (input.lang === "ar") {
        text = `الوضع: متوسط المخزون ${avgStockDays} يوم.\n\nأهم إجراء: ${top?.action ?? "—"}\nالسبب: ${top?.reason ?? "—"}\n\nالمخاطر: قد يحتاج الأمر إلى تأكيد المواد قبل البدء.\n\nالأثر المتوقع: تحسّن خدمة العملاء وتقليل التكدس في المخازن.`;
      } else {
        text = `Status: average stock ${avgStockDays} days.\n\nTop action: ${top?.action ?? "—"}\nReason: ${top?.reason ?? "—"}\n\nRisks: confirm material availability before starting.\n\nExpected impact: improved customer service and lower warehouse pressure.`;
      }
    }
    const out = { text, objective, avg_stock_days: avgStockDays };
    await run.finish(out);
    return out;
  } catch (e) {
    await run.fail(e);
    throw e;
  }
}

// ============ Objective / weights ============

export async function getObjective(): Promise<ObjectiveSettings & { effective_weights: number[] }> {
  await ready();
  const obj = await db().objective_settings.get(1);
  const base: ObjectiveSettings = obj ?? { id: 1, objective: "default", custom_weights: null, updated_at: new Date().toISOString(), updated_by: null };
  return { ...base, effective_weights: base.custom_weights ?? WEIGHTS[base.objective] };
}

export async function setObjective(input: { objective: Objective }): Promise<{ ok: true }> {
  await ready();
  await db().objective_settings.update(1, {
    objective: input.objective, custom_weights: null,
    updated_at: new Date().toISOString(), updated_by: null,
  });
  return { ok: true };
}

export async function setCustomWeights(input: { weights: number[] }): Promise<{ ok: true; weights: number[] }> {
  await ready();
  const sum = input.weights.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.01) throw new Error(`Weights must sum to 1.0 (got ${sum.toFixed(3)})`);
  await db().objective_settings.update(1, {
    custom_weights: input.weights,
    updated_at: new Date().toISOString(), updated_by: null,
  });
  return { ok: true, weights: input.weights };
}

export async function clearCustomWeights(): Promise<{ ok: true }> {
  await ready();
  await db().objective_settings.update(1, { custom_weights: null, updated_at: new Date().toISOString() });
  return { ok: true };
}

// ============ Forecast ============

async function loadOrderDemandSeries(productId: string, days: number): Promise<{ date: string; value: number }[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const orders = await db().orders.where("product_id").equals(productId).toArray();
  const map = new Map<string, number>();
  for (const o of orders) {
    if (o.due_date < since) continue;
    map.set(o.due_date, (map.get(o.due_date) ?? 0) + Number(o.quantity));
  }
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

async function loadShippedSeries(productId: string, days: number): Promise<{ date: string; value: number }[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const entries = await db().daily_entries.where("product_id").equals(productId).toArray();
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.entry_date < since) continue;
    map.set(e.entry_date, (map.get(e.entry_date) ?? 0) + Number(e.shipped));
  }
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

export async function runForecast(input: { metric: Metric; horizon: "7d" | "4w" | "3m"; product_id?: string | null }): Promise<{ results: ForecastResult[] }> {
  await ready();
  const run = await recordRunStart({ kind: "forecast", params: input });
  try {
    const historyDays = 60;
    const results: ForecastResult[] = [];
    if (input.metric === "demand") {
      const products = await db().products.toArray();
      const targets = input.product_id ? products.filter((p) => p.id === input.product_id) : products;
      for (const p of targets) {
        const orderSeries = await loadOrderDemandSeries(p.id, historyDays);
        const shippedSeries = await loadShippedSeries(p.id, historyDays);
        const byDate = new Map<string, number>();
        for (const s of shippedSeries) byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.value));
        for (const s of orderSeries) byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.value));
        const merged = [...byDate.entries()].sort().map(([date, value]) => ({ date, value }));
        results.push(computeForecast({
          metric: "demand", horizon: input.horizon, subject: p.id, unit: "units",
          history: merged, currentValue: Number(p.daily_demand),
        }));
      }
    } else if (input.metric === "inventory") {
      const products = await db().products.toArray();
      const targets = input.product_id ? products.filter((p) => p.id === input.product_id) : products;
      for (const p of targets) {
        const since = new Date(Date.now() - historyDays * 86400_000).toISOString().slice(0, 10);
        const entries = await db().daily_entries.where("product_id").equals(p.id).toArray();
        const filtered = entries.filter((e) => e.entry_date >= since).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
        let running = Number(p.stock_qty);
        const series: { date: string; value: number }[] = [];
        for (const e of filtered) {
          running = Math.max(0, running - Number(e.shipped) + Number(e.produced));
          series.push({ date: e.entry_date, value: running });
        }
        results.push(computeForecast({
          metric: "inventory", horizon: input.horizon, subject: p.id, unit: "units",
          history: series, currentValue: Number(p.stock_qty),
          threshold: Number(p.daily_demand) * 3,
        }));
      }
    } else {
      // cash
      const orders = await db().orders.toArray();
      const products = await db().products.toArray();
      const productMargin = new Map(products.map((p) => [p.id, Number(p.margin_pct)]));
      const since = new Date(Date.now() - historyDays * 86400_000).toISOString().slice(0, 10);
      const map = new Map<string, number>();
      for (const o of orders) {
        if (o.due_date < since) continue;
        const margin = productMargin.get(o.product_id) ?? 0;
        const cash = Number(o.quantity) * margin * 100;
        map.set(o.due_date, (map.get(o.due_date) ?? 0) + cash);
      }
      const series = [...map.entries()].sort().map(([date, value]) => ({ date, value }));
      const totalOpen = orders.reduce((a, o) => a + Number(o.quantity) * 100, 0);
      results.push(computeForecast({
        metric: "cash", horizon: input.horizon, subject: "ALL", unit: "SAR",
        history: series, currentValue: totalOpen,
      }));
    }
    // Persist
    const rows: ForecastRun[] = results.flatMap((r) => {
      const make = (s: "optimistic" | "likely" | "pessimistic") => ({
        id: crypto.randomUUID(), run_at: new Date().toISOString(),
        metric: r.metric, horizon: r.horizon, subject: r.subject, scenario: s,
        point_estimate: r[s].point, low_estimate: r[s].low, high_estimate: r[s].high,
        confidence: r[s].confidence,
        driver_notes: { drivers: r[s].drivers, history: r.history, baseline: r.baseline } as Record<string, unknown>,
      });
      return [make("optimistic"), make("likely"), make("pessimistic")];
    });
    if (rows.length) await db().forecast_runs.bulkPut(rows);
    const out = { results };
    await run.finish(out);
    return out;
  } catch (e) {
    await run.fail(e);
    throw e;
  }
}

export async function getLatestForecasts(input: { metric: Metric; horizon: "7d" | "4w" | "3m" }): Promise<{ runAt: string | null; results: ForecastResult[] }> {
  await ready();
  const all = await db().forecast_runs.toArray();
  const filtered = all.filter((f) => f.metric === input.metric && f.horizon === input.horizon);
  if (filtered.length === 0) return { runAt: null, results: [] };
  filtered.sort((a, b) => b.run_at.localeCompare(a.run_at));
  const runAt = filtered[0]!.run_at;
  const rows = filtered.filter((f) => f.run_at === runAt);
  const bySubject = new Map<string, { subject: string; optimistic?: any; likely?: any; pessimistic?: any }>();
  for (const r of rows) {
    const cur = bySubject.get(r.subject) ?? { subject: r.subject };
    cur[r.scenario] = {
      point: Number(r.point_estimate),
      low: r.low_estimate == null ? null : Number(r.low_estimate),
      high: r.high_estimate == null ? null : Number(r.high_estimate),
      confidence: Number(r.confidence),
      drivers: ((r.driver_notes as { drivers?: string[] } | null)?.drivers) ?? [],
    };
    bySubject.set(r.subject, cur);
  }
  return {
    runAt,
    results: [...bySubject.values()].map((g) => ({
      metric: input.metric, horizon: input.horizon, subject: g.subject,
      unit: input.metric === "cash" ? "SAR" : "units",
      baseline: g.likely?.point ?? 0, history: 0,
      optimistic: g.optimistic ?? { scenario: "optimistic", point: 0, low: 0, high: 0, confidence: 0, drivers: [] },
      likely: g.likely ?? { scenario: "likely", point: 0, low: 0, high: 0, confidence: 0, drivers: [] },
      pessimistic: g.pessimistic ?? { scenario: "pessimistic", point: 0, low: 0, high: 0, confidence: 0, drivers: [] },
    })),
  };
}

// ============ Simulate ============

export async function runSimulationHandler(input: { params: SimParams; label_ar?: string | null; label_en?: string | null }): Promise<import("./simulate.server").SimImpact> {
  await ready();
  const run = await recordRunStart({ kind: "simulate", params: input });
  try {
    const [products, lines, materials, orders, productsMargin] = await Promise.all([
      db().products.toArray(),
      db().production_lines.toArray(),
      db().materials.toArray(),
      db().orders.toArray(),
      db().products.toArray(),
    ]);
    const simProducts: SimProduct[] = products.map((p) => ({
      id: p.id, name_ar: p.name_ar, name_en: p.name_en,
      daily_demand: Number(p.daily_demand), margin_pct: Number(p.margin_pct),
      stock_qty: Number(p.stock_qty), current_production: Number(p.daily_demand), unit_cost: 100,
    }));
    const simLines: SimLine[] = lines.map((l) => ({
      id: l.id, name_ar: l.name_ar, name_en: l.name_en,
      capacity_per_hour: Number(l.capacity_per_hour), quality_factor: Number(l.quality_factor), status: l.status,
    }));
    const simMaterials: SimMaterial[] = materials.map((m) => ({
      id: m.id, name_ar: m.name_ar, name_en: m.name_en, unit: m.unit,
      stock_qty: Number(m.stock_qty), reorder_point: Number(m.reorder_point),
      unit_cost: Number(m.unit_cost), lead_time_days: m.lead_time_days,
    }));
    const marginById = new Map(productsMargin.map((p) => [p.id, Number(p.margin_pct)]));
    const openOrderValue = orders.reduce((a, o) => {
      if (!["approved", "in_progress", "received", "reviewing"].includes(o.status)) return a;
      const margin = marginById.get(o.product_id) ?? 0;
      return a + Number(o.quantity) * 100 * (1 + margin);
    }, 0);
    const impact = runSimulation({ params: input.params, products: simProducts, lines: simLines, materials: simMaterials, openOrderValue });
    await db().simulation_runs.put({
      id: crypto.randomUUID(), created_at: new Date().toISOString(),
      created_by: null, params: input.params as unknown as Record<string, unknown>,
      result: impact as unknown as Record<string, unknown>,
      label_ar: input.label_ar ?? null, label_en: input.label_en ?? null,
    });
    await run.finish(impact);
    return impact;
  } catch (e) {
    await run.fail(e);
    throw e;
  }
}

export async function listSimulationRuns(): Promise<SimulationRun[]> {
  await ready();
  return (await db().simulation_runs.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
}

// ============ Anomaly / alerts ============

export async function detectAndPersistAlerts(): Promise<{ detected: number; new_alerts: number; alerts: import("./anomaly.server").DetectedAlert[] }> {
  await ready();
  const run = await recordRunStart({ kind: "anomaly" });
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const [products, materials, lines, entries, orders, productsMargin] = await Promise.all([
      db().products.toArray(),
      db().materials.toArray(),
      db().production_lines.toArray(),
      db().daily_entries.toArray(),
      db().orders.toArray(),
      db().products.toArray(),
    ]);
    // Group entries by product
    const byProduct = new Map<string, { produced: number[]; shipped: number[]; yield: number[] }>();
    for (const e of entries) {
      if (e.entry_date < since) continue;
      const cur = byProduct.get(e.product_id) ?? { produced: [], shipped: [], yield: [] };
      cur.produced.push(Number(e.produced));
      cur.shipped.push(Number(e.shipped));
      if (Number(e.produced) > 0) cur.yield.push(Number(e.shipped) / Number(e.produced));
      byProduct.set(e.product_id, cur);
    }
    const productSnaps: ProductSnapshot[] = products.map((p) => {
      const g = byProduct.get(p.id) ?? { produced: [], shipped: [], yield: [] };
      return {
        id: p.id, name_ar: p.name_ar, name_en: p.name_en,
        daily_demand: Number(p.daily_demand), stock_qty: Number(p.stock_qty),
        stability: Number(p.stability), margin_pct: Number(p.margin_pct),
        recent_produced: g.produced, recent_shipped: g.shipped, recent_yield_pct: g.yield,
      };
    });
    const materialSnaps: MaterialSnapshot[] = materials.map((m) => ({
      id: m.id, name_ar: m.name_ar, name_en: m.name_en, unit: m.unit,
      stock_qty: Number(m.stock_qty), reorder_point: Number(m.reorder_point),
      unit_cost: Number(m.unit_cost), lead_time_days: m.lead_time_days,
    }));
    const lineSnaps: LineSnapshot[] = lines.map((l) => ({
      id: l.id, name_ar: l.name_ar, name_en: l.name_en, status: l.status,
    }));
    const marginById = new Map(productsMargin.map((p) => [p.id, Number(p.margin_pct)]));
    const openOrderValue = orders.reduce((a, o) => {
      if (!["approved", "in_progress", "received", "reviewing"].includes(o.status)) return a;
      const margin = marginById.get(o.product_id) ?? 0;
      return a + Number(o.quantity) * 100 * (1 + margin);
    }, 0);
    const detected = detectAlerts({ products: productSnaps, materials: materialSnaps, lines: lineSnaps, openOrderValue });
    // Dedup against existing active alerts
    const existing = await db().alert_states.toArray();
    const activeExisting = existing.filter((a) => a.dismissed_at == null);
    const seen = new Set(activeExisting.map((a) => `${a.kind}|${a.subject_id}`));
    const newRows = detected.filter((d) => !seen.has(`${d.kind}|${d.subject_id}`)).map((d) => ({
      id: crypto.randomUUID(), created_at: new Date().toISOString(),
      kind: d.kind, severity: d.severity, subject_kind: d.subject_kind, subject_id: d.subject_id,
      title_ar: d.title_ar, title_en: d.title_en,
      detail_ar: d.detail_ar ?? null, detail_en: d.detail_en ?? null,
      metric_value: d.metric_value ?? null, threshold_value: d.threshold_value ?? null,
      dismissed_at: null, dismissed_by: null,
    } satisfies AlertState));
    if (newRows.length) await db().alert_states.bulkPut(newRows);
    const out = { detected: detected.length, new_alerts: newRows.length, alerts: detected };
    await run.finish(out);
    return out;
  } catch (e) {
    await run.fail(e);
    throw e;
  }
}

export async function listActiveAlerts(): Promise<AlertState[]> {
  await ready();
  const all = await db().alert_states.toArray();
  return all.filter((a) => a.dismissed_at == null).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
}

export async function dismissAlert(input: { id: string }): Promise<{ ok: true }> {
  await ready();
  await db().alert_states.update(input.id, { dismissed_at: new Date().toISOString() });
  return { ok: true };
}

// ============ Assistant ============

async function buildAssistantContext(): Promise<AssistantContext> {
  const products = await db().products.toArray();
  const lines = await db().production_lines.toArray();
  const recos = (await db().recommendations.toArray()).filter((r) => r.status === "pending");
  const alerts = (await db().alert_states.toArray()).filter((a) => a.dismissed_at == null);
  const forecasts = await db().forecast_runs.toArray();
  const totalStock = products.reduce((a, p) => a + Number(p.stock_qty), 0);
  const totalDemand = products.reduce((a, p) => a + Number(p.daily_demand), 0);
  const stockDays = totalDemand > 0 ? totalStock / totalDemand : 0;
  const lineSummary = lines.map((l) => ({ name: l.name_en, status: l.status, quality: Number(l.quality_factor) }));
  const running = lineSummary.filter((l) => l.status === "running").length;
  const broken = lineSummary.filter((l) => l.status === "broken").length;
  const topRecos = recos.slice(0, 5).map((r) => ({ action: r.action_en, priority: Number(r.priority ?? 0), reason: r.reason_en ?? "" }));
  const topAlerts = alerts.slice(0, 10).map((a) => ({ kind: a.kind, title: a.title_en, severity: a.severity }));
  const productSummary = products.map((p) => {
    const demand = Number(p.daily_demand);
    const stock = Number(p.stock_qty);
    const days = demand > 0 ? stock / demand : 0;
    return { name: p.name_en, stock, demand, days, pps: 0 };
  }).sort((a, b) => a.days - b.days).slice(0, 5);
  // Forecast summary
  const fmap = new Map<string, { metric: string; horizon: string; optimistic: number; likely: number; pessimistic: number }>();
  for (const f of forecasts) {
    const key = `${f.metric}|${f.horizon}`;
    if (!fmap.has(key)) fmap.set(key, { metric: f.metric, horizon: f.horizon, optimistic: 0, likely: 0, pessimistic: 0 });
    const cur = fmap.get(key)!;
    if (f.scenario === "likely") cur.likely = Number(f.point_estimate);
    if (f.scenario === "optimistic") cur.optimistic = Number(f.point_estimate);
    if (f.scenario === "pessimistic") cur.pessimistic = Number(f.point_estimate);
  }
  return {
    total_products: products.length, total_lines: lines.length, running_lines: running, broken_lines: broken,
    total_stock: totalStock, total_demand: totalDemand, stock_days: stockDays,
    top_recommendations: topRecos, top_alerts: topAlerts, lines: lineSummary, products: productSummary,
    forecast_summary: [...fmap.values()].slice(0, 6),
  };
}

export async function askAssistant(input: { question: string; lang: "ar" | "en" }): Promise<{ answer: string; intent: string; used_llm: boolean; context: AssistantContext }> {
  await ready();
  const run = await recordRunStart({ kind: "assistant", params: input });
  try {
    const ctx = await buildAssistantContext();
    const intent = detectIntent(input.question);
    await db().assistant_messages.put({
      id: crypto.randomUUID(), created_at: new Date().toISOString(),
      user_id: null, role: "user", content: input.question, context_snapshot: null,
    });
    let answer = answerFromContext(input.question, ctx, input.lang);
    let usedLLM = false;
    const key = (typeof process !== "undefined" && (process as { env?: Record<string, string> }).env?.LOVABLE_API_KEY) || "";
    if (key) {
      try {
        const systemAr = `أنت مساعد تنفيذي لمصنع إنتاجي. أجب بالعربية الفصحى في 3-6 جمل قصيرة وحازمة. لا تخترع أرقاماً غير موجودة في السياق.`;
        const systemEn = `You are an executive assistant for a production plant. Reply in 3-6 short, decisive sentences. Do not invent numbers.`;
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify({
            model: "openai/gpt-5.5",
            messages: [
              { role: "system", content: input.lang === "ar" ? systemAr : systemEn },
              { role: "user", content: `Context:\n${JSON.stringify(ctx, null, 2)}\n\nQuestion: ${input.question}` },
            ],
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const content = json?.choices?.[0]?.message?.content;
          if (typeof content === "string" && content.trim().length > 0) { answer = content.trim(); usedLLM = true; }
        }
      } catch { /* ignore */ }
    }
    await db().assistant_messages.put({
      id: crypto.randomUUID(), created_at: new Date().toISOString(),
      user_id: null, role: "assistant", content: answer, context_snapshot: ctx as unknown as Record<string, unknown>,
    });
    const out = { answer, intent: intent.intent, used_llm: usedLLM, context: ctx };
    await run.finish(out);
    return out;
  } catch (e) {
    await run.fail(e);
    throw e;
  }
}

export async function listAssistantHistory(): Promise<AssistantMessage[]> {
  await ready();
  const all = await db().assistant_messages.toArray();
  all.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return all.slice(-40);
}

// ============ Learning ============

export async function getWeeklyReview(input: { objective: string }): Promise<{
  week_start: string; week_end: string; total: number; accepted: number; rejected: number; overrides: number;
  acceptance_rate: number; current_weights: number[]; suggested_weights: number[];
  rationale_ar: string; rationale_en: string; expected_accuracy: number;
}> {
  await ready();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const signals = await db().learning_signals.toArray();
  const filtered = signals.filter((s) => s.objective === input.objective && s.created_at >= since);
  const records = filtered.map((s) => ({
    objective: input.objective as Objective,
    signal: s.signal as "accept" | "reject" | "override" | "snooze",
    weight_snapshot: s.weight_snapshot ?? undefined,
    component_dominant: s.component_dominant ?? undefined,
  }));
  const start = new Date(Date.now() - 7 * 86400_000);
  const end = new Date();
  const acc = computeWeeklyAccuracy(records, start, end);
  const tuning = suggestWeightTuning({ objective: input.objective as Objective, records });
  return {
    week_start: acc.week_start, week_end: acc.week_end,
    total: acc.total, accepted: acc.accepted, rejected: acc.rejected, overrides: acc.overrides,
    acceptance_rate: acc.acceptance_rate,
    current_weights: [...WEIGHTS[input.objective as Objective]],
    suggested_weights: tuning.suggested_weights,
    rationale_ar: tuning.rationale_ar, rationale_en: tuning.rationale_en,
    expected_accuracy: tuning.expected_accuracy,
  };
}

// ============ Factory (CRUD) ============

export async function listProducts() { await ready(); return await db().products.toArray(); }
export async function listMaterials() { await ready(); return await db().materials.toArray(); }
export async function listLines() { await ready(); return await db().production_lines.toArray(); }
export async function listCustomers() { await ready(); return await db().customers.toArray(); }
export async function listOrders() { await ready(); return await db().orders.toArray(); }

export async function saveProduct(input: Partial<Product> & { id?: string | null }): Promise<Product> {
  await ready();
  const now = new Date().toISOString();
  if (input.id) {
    const existing = await db().products.get(input.id);
    if (!existing) throw new Error("Product not found");
    const updated: Product = { ...existing, ...input, id: existing.id, updated_at: now };
    await db().products.put(updated);
    return updated;
  }
  const id = crypto.randomUUID();
  const created: Product = {
    id, sku: input.sku ?? "", name_ar: input.name_ar ?? "", name_en: input.name_en ?? "",
    daily_demand: Number(input.daily_demand ?? 0), margin_pct: Number(input.margin_pct ?? 0),
    stability: Number(input.stability ?? 0.8), shelf_life_days: input.shelf_life_days ?? null,
    moq: Number(input.moq ?? 1), strategic_weight: Number(input.strategic_weight ?? 5),
    stock_qty: Number(input.stock_qty ?? 0), preferred_line_id: input.preferred_line_id ?? null,
    active: input.active ?? true, created_at: now, updated_at: now,
  };
  await db().products.put(created);
  return created;
}
export async function deleteProduct(input: { id: string }) { await ready(); await db().products.delete(input.id); return { ok: true as const }; }

export async function saveMaterial(input: Partial<Material> & { id?: string | null }): Promise<Material> {
  await ready();
  const now = new Date().toISOString();
  if (input.id) {
    const existing = await db().materials.get(input.id);
    if (!existing) throw new Error("Material not found");
    const updated: Material = { ...existing, ...input, id: existing.id, updated_at: now };
    await db().materials.put(updated);
    return updated;
  }
  const id = crypto.randomUUID();
  const created: Material = {
    id, name_ar: input.name_ar ?? "", name_en: input.name_en ?? "", unit: input.unit ?? "",
    stock_qty: Number(input.stock_qty ?? 0), reorder_point: Number(input.reorder_point ?? 0),
    unit_cost: Number(input.unit_cost ?? 0), lead_time_days: Number(input.lead_time_days ?? 3),
    created_at: now, updated_at: now,
  };
  await db().materials.put(created);
  return created;
}
export async function deleteMaterial(input: { id: string }) { await ready(); await db().materials.delete(input.id); return { ok: true as const }; }

export async function saveLine(input: Partial<ProductionLine> & { id?: string | null }): Promise<ProductionLine> {
  await ready();
  const now = new Date().toISOString();
  if (input.id) {
    const existing = await db().production_lines.get(input.id);
    if (!existing) throw new Error("Line not found");
    const updated: ProductionLine = { ...existing, ...input, id: existing.id, updated_at: now };
    await db().production_lines.put(updated);
    return updated;
  }
  const id = crypto.randomUUID();
  const created: ProductionLine = {
    id, name_ar: input.name_ar ?? "", name_en: input.name_en ?? "",
    capacity_per_hour: Number(input.capacity_per_hour ?? 0),
    status: (input.status ?? "idle") as ProductionLine["status"],
    quality_factor: Number(input.quality_factor ?? 0.95),
    created_at: now, updated_at: now,
  };
  await db().production_lines.put(created);
  return created;
}
export async function deleteLine(input: { id: string }) { await ready(); await db().production_lines.delete(input.id); return { ok: true as const }; }

export async function saveCustomer(input: Partial<Customer> & { id?: string | null }): Promise<Customer> {
  await ready();
  if (input.id) {
    const existing = await db().customers.get(input.id);
    if (!existing) throw new Error("Customer not found");
    const updated: Customer = { ...existing, ...input, id: existing.id };
    await db().customers.put(updated);
    return updated;
  }
  const id = crypto.randomUUID();
  const created: Customer = {
    id, name_ar: input.name_ar ?? "", name_en: input.name_en ?? "",
    importance: Number(input.importance ?? 5), annual_value: Number(input.annual_value ?? 0),
    churn_risk: Number(input.churn_risk ?? 0.1), created_at: new Date().toISOString(),
  };
  await db().customers.put(created);
  return created;
}
export async function deleteCustomer(input: { id: string }) { await ready(); await db().customers.delete(input.id); return { ok: true as const }; }

export async function saveOrder(input: Partial<Order> & { id?: string | null }): Promise<Order> {
  await ready();
  const now = new Date().toISOString();
  if (input.id) {
    const existing = await db().orders.get(input.id);
    if (!existing) throw new Error("Order not found");
    const updated: Order = { ...existing, ...input, id: existing.id, updated_at: now };
    await db().orders.put(updated);
    return updated;
  }
  const id = crypto.randomUUID();
  const created: Order = {
    id, customer_id: input.customer_id ?? "", product_id: input.product_id ?? "",
    quantity: Number(input.quantity ?? 0), due_date: input.due_date ?? new Date().toISOString().slice(0, 10),
    status: (input.status ?? "received") as Order["status"],
    created_at: now, updated_at: now,
  };
  await db().orders.put(created);
  return created;
}
export async function deleteOrder(input: { id: string }) { await ready(); await db().orders.delete(input.id); return { ok: true as const }; }

// ============ Daily entries ============

export async function submitDailyEntry(input: { entry_date: string; product_id: string; line_id?: string | null; produced: number; shipped: number; received_material_qty?: number; notes?: string | null }): Promise<DailyEntry> {
  await ready();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const entry: DailyEntry = {
    id, entry_date: input.entry_date, product_id: input.product_id,
    line_id: input.line_id ?? null, produced: Number(input.produced), shipped: Number(input.shipped),
    received_material_qty: Number(input.received_material_qty ?? 0),
    notes: input.notes ?? null, entered_by: null, created_at: now,
  };
  await db().daily_entries.put(entry);
  // Update product stock atomically
  const product = await db().products.get(input.product_id);
  if (product) {
    const newStock = Math.max(0, Number(product.stock_qty) + Number(input.produced) - Number(input.shipped));
    await db().products.update(product.id, { stock_qty: newStock });
  }
  return entry;
}
export async function listRecentDailyEntries(): Promise<DailyEntry[]> {
  await ready();
  return (await db().daily_entries.toArray()).sort((a, b) => b.entry_date.localeCompare(a.entry_date)).slice(0, 50);
}

// ============ AI runs list ============

export async function listAiRuns(): Promise<AiRun[]> {
  await ready();
  return (await db().ai_runs.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
}

// ============ Reset ============
export async function resetDb() { await resetAndReseed(); }

// Re-export the metric type for downstream callers
export type Metric = "demand" | "inventory" | "cash";
