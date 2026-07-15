import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withJobTracking } from "./jobs-wrapper";
import {
  runSimulation,
  type SimParams,
  type SimProduct,
  type SimLine,
  type SimMaterial,
  type SimImpact,
} from "./simulate.server";
import type { Json } from "@/integrations/supabase/types";

const ParamsSchema = z.object({
  product_demand_delta_pct: z.record(z.string(), z.number()).default({}),
  product_production_delta_pct: z.record(z.string(), z.number()).default({}),
  line_capacity_delta_pct: z.record(z.string(), z.number()).default({}),
  material_cost_delta_pct: z.record(z.string(), z.number()).default({}),
  material_stock_delta: z.record(z.string(), z.number()).default({}),
  cash_inject: z.number().default(0),
  line_out: z.string().nullable().default(null),
  shift_multiplier: z.number().min(0.5).max(2).default(1),
  horizon_days: z.number().int().min(1).max(365).default(14),
});

const RunSimSchema = z.object({
  params: ParamsSchema,
  label_ar: z.string().optional().nullable(),
  label_en: z.string().optional().nullable(),
});

async function loadSimInputs(sb: any) {
  const [productsRes, linesRes, materialsRes, ordersRes] = await Promise.all([
    sb.from("products").select("id,name_ar,name_en,daily_demand,margin_pct,stock_qty").eq("active", true),
    sb.from("production_lines").select("id,name_ar,name_en,capacity_per_hour,quality_factor,status"),
    sb.from("materials").select("id,name_ar,name_en,unit,stock_qty,reorder_point,unit_cost,lead_time_days"),
    sb.from("orders").select("quantity,status,products(margin_pct)").in("status", ["approved", "in_progress", "received", "reviewing"]),
  ]);
  const products: SimProduct[] = (productsRes.data ?? []).map((p: any) => ({
    id: p.id,
    name_ar: p.name_ar,
    name_en: p.name_en,
    daily_demand: Number(p.daily_demand),
    margin_pct: Number(p.margin_pct),
    stock_qty: Number(p.stock_qty),
    current_production: Number(p.daily_demand),
    unit_cost: 100, // baseline proxy
  }));
  const lines: SimLine[] = (linesRes.data ?? []).map((l: any) => ({
    id: l.id,
    name_ar: l.name_ar,
    name_en: l.name_en,
    capacity_per_hour: Number(l.capacity_per_hour),
    quality_factor: Number(l.quality_factor),
    status: l.status,
  }));
  const materials: SimMaterial[] = (materialsRes.data ?? []).map((m: any) => ({
    id: m.id,
    name_ar: m.name_ar,
    name_en: m.name_en,
    unit: m.unit,
    stock_qty: Number(m.stock_qty),
    reorder_point: Number(m.reorder_point),
    unit_cost: Number(m.unit_cost),
    lead_time_days: m.lead_time_days,
  }));
  const openOrderValue = (ordersRes.data ?? []).reduce((a: number, o: any) => {
    const margin = Number(o.products?.margin_pct ?? 0);
    return a + Number(o.quantity) * 100 * (1 + margin);
  }, 0);
  return { products, lines, materials, openOrderValue };
}

export const runSimulationHandler = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunSimSchema.parse(input))
  .handler(withJobTracking("simulate", async ({ data, context }) => {
    const sb = context.supabase;
    const { products, lines, materials, openOrderValue } = await loadSimInputs(sb);
    const impact = runSimulation({
      params: data.params as SimParams,
      products,
      lines,
      materials,
      openOrderValue,
    });
    // persist
    await sb.from("simulation_runs").insert({
      params: data.params as unknown as Json,
      result: impact as unknown as Json,
      label_ar: data.label_ar ?? null,
      label_en: data.label_en ?? null,
      created_by: context.userId,
    });
    return impact;
  }));

export const listSimulationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("simulation_runs")
      .select("id,created_at,params,result,label_ar,label_en")
      .order("created_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });
