import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computePPSForAll,
  type Objective,
  type ProductInput,
  type LineInput,
  type BomInput,
  type MaterialInput,
  type CustomerAgg,
} from "./pps.server";

export const runPPS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const [obj, products, lines, bom, materials, orders, customers] = await Promise.all([
      sb.from("objective_settings").select("objective").eq("id", 1).maybeSingle(),
      sb.from("products").select("id,sku,name_ar,name_en,daily_demand,margin_pct,stability,strategic_weight,stock_qty,preferred_line_id,moq").eq("active", true),
      sb.from("production_lines").select("id,quality_factor,status"),
      sb.from("bom_items").select("product_id,material_id,quantity_per_unit"),
      sb.from("materials").select("id,stock_qty"),
      sb.from("orders").select("product_id,customer_id,quantity,status").in("status", ["received","reviewing","approved","in_progress"]),
      sb.from("customers").select("id,importance"),
    ]);

    const productsInput: ProductInput[] = (products.data ?? []).map((p) => ({
      id: p.id,
      daily_demand: Number(p.daily_demand),
      margin_pct: Number(p.margin_pct),
      stability: Number(p.stability),
      strategic_weight: Number(p.strategic_weight),
      stock_qty: Number(p.stock_qty),
      preferred_line_id: p.preferred_line_id,
      moq: Number(p.moq),
    }));
    const linesInput: LineInput[] = (lines.data ?? []).map((l) => ({ id: l.id, quality_factor: Number(l.quality_factor), status: l.status }));
    const bomInput: BomInput[] = (bom.data ?? []).map((b) => ({ product_id: b.product_id, material_id: b.material_id, quantity_per_unit: Number(b.quantity_per_unit) }));
    const matsInput: MaterialInput[] = (materials.data ?? []).map((m) => ({ id: m.id, stock_qty: Number(m.stock_qty) }));

    const custMap = new Map((customers.data ?? []).map((c) => [c.id, Number(c.importance)]));
    const custAgg: Record<string, CustomerAgg> = {};
    for (const o of orders.data ?? []) {
      const imp = custMap.get(o.customer_id) ?? 5;
      const cur = custAgg[o.product_id] ?? { product_id: o.product_id, weighted_importance: 0, total_open_qty: 0 };
      cur.weighted_importance = (cur.weighted_importance * cur.total_open_qty + imp * Number(o.quantity)) / (cur.total_open_qty + Number(o.quantity));
      cur.total_open_qty += Number(o.quantity);
      custAgg[o.product_id] = cur;
    }

    const objective = (obj.data?.objective ?? "default") as Objective;
    const results = computePPSForAll({
      objective,
      products: productsInput,
      lines: linesInput,
      bom: bomInput,
      materials: matsInput,
      customerAgg: custAgg,
    });

    const runAt = new Date().toISOString();
    // Persist snapshot rows
    const rows = results.map((r) => ({
      run_at: runAt,
      objective,
      product_id: r.product_id,
      pps: r.pps,
      components: r.components,
      constraint_status: r.constraint_status,
      constraint_notes: r.constraint_notes,
    }));
    if (rows.length) await sb.from("pps_snapshots").insert(rows);

    // Generate recommendations for top 5 constrained-or-not
    const top = [...results].sort((a, b) => b.pps - a.pps).slice(0, 5);
    const productsById = new Map((products.data ?? []).map((p) => [p.id, p]));
    // clear old pending recos
    await sb.from("recommendations").update({ status: "superseded" }).eq("status", "pending");

    const recoRows = top.map((r) => {
      const p = productsById.get(r.product_id);
      const days = r.raw.stock_days;
      const constrained = r.constraint_status === "constrained";
      return {
        product_id: r.product_id,
        action_ar: constrained
          ? `تفعيل بديل / معالجة قيد ثم إنتاج ${p?.name_ar ?? ""}`
          : `إنتاج ${p?.name_ar ?? ""} بأولوية قصوى`,
        action_en: constrained
          ? `Resolve constraint then produce ${p?.name_en ?? ""}`
          : `Produce ${p?.name_en ?? ""} at top priority`,
        reason_ar: `درجة PPS ${r.pps}. أيام المخزون ${days}. جاهزية ${(r.raw.readiness * 100).toFixed(0)}٪.`,
        reason_en: `PPS ${r.pps}. Stock days ${days}. Readiness ${(r.raw.readiness * 100).toFixed(0)}%.`,
        impact: r.components,
        priority: r.pps,
        status: "pending" as const,
      };
    });
    if (recoRows.length) await sb.from("recommendations").insert(recoRows);

    return { runAt, count: results.length, objective };
  });

export type PPSComponents = {
  stockout_risk: number;
  profit_impact: number;
  customer_importance: number;
  line_efficiency: number;
  material_readiness: number;
  strategic_weight: number;
};

export type PPSRow = {
  product_id: string;
  pps: number;
  components: PPSComponents;
  constraint_status: string;
  constraint_notes: string | null;
  run_at: string;
  products: {
    name_ar: string;
    name_en: string;
    sku: string;
    stock_qty: number;
    daily_demand: number;
  } | null;
};

export const getLatestPPS = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ runAt: string | null; rows: PPSRow[] }> => {
    const sb = context.supabase;
    const { data: latest } = await sb.from("pps_snapshots").select("run_at").order("run_at", { ascending: false }).limit(1);
    if (!latest?.[0]) return { runAt: null, rows: [] };
    const runAt = latest[0].run_at;
    const { data } = await sb
      .from("pps_snapshots")
      .select("product_id,pps,components,constraint_status,constraint_notes,run_at,products(name_ar,name_en,sku,stock_qty,daily_demand)")
      .eq("run_at", runAt)
      .order("pps", { ascending: false });
    return { runAt, rows: (data ?? []) as unknown as PPSRow[] };
  });
