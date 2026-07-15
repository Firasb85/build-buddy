import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordRunStart } from "./jobs";

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("products")
      .select("*,production_lines(name_ar,name_en)")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const listMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("materials").select("*").order("name_en");
    return data ?? [];
  });

export const listLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("production_lines").select("*").order("name_en");
    return data ?? [];
  });

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("customers").select("*").order("name_en");
    return data ?? [];
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("orders")
      .select("*,customers(name_ar,name_en),products(name_ar,name_en,sku)")
      .order("due_date", { ascending: true });
    return data ?? [];
  });

// Generic upsert / delete
const rowInput = z.record(z.string(), z.unknown());

export const upsertRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ table: z.string(), row: rowInput }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = new Set(["products", "materials", "production_lines", "customers", "orders"]);
    if (!allowed.has(data.table)) throw new Error("Table not allowed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, data: row } = await context.supabase.from(data.table as any).upsert(data.row as any).select().maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ table: z.string(), id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = new Set(["products", "materials", "production_lines", "customers", "orders"]);
    if (!allowed.has(data.table)) throw new Error("Table not allowed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from(data.table as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ CRUD per entity (typed) ============

const PRODUCT_KEYS = [
  "sku", "name_ar", "name_en", "daily_demand", "margin_pct", "stability",
  "shelf_life_days", "moq", "strategic_weight", "stock_qty", "preferred_line_id", "active",
] as const;
const ProductSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  sku: z.string().min(1),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  daily_demand: z.number().nonnegative().default(0),
  margin_pct: z.number().min(0).max(1).default(0),
  stability: z.number().min(0).max(1).default(0.8),
  shelf_life_days: z.number().int().nullable().default(null),
  moq: z.number().nonnegative().default(1),
  strategic_weight: z.number().int().min(0).max(10).default(5),
  stock_qty: z.number().nonnegative().default(0),
  preferred_line_id: z.string().uuid().nullable().default(null),
  active: z.boolean().default(true),
});
export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const payload = { ...data } as Record<string, unknown>;
    delete payload.id;
    if (!data.id) {
      const { error, data: row } = await sb.from("products").insert(payload as never).select().maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { error, data: row } = await sb.from("products").update(payload as never).eq("id", data.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MaterialSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  unit: z.string().min(1),
  stock_qty: z.number().nonnegative().default(0),
  reorder_point: z.number().nonnegative().default(0),
  unit_cost: z.number().nonnegative().default(0),
  lead_time_days: z.number().int().nonnegative().default(3),
});
export const saveMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MaterialSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const payload = { ...data } as Record<string, unknown>;
    delete payload.id;
    if (!data.id) {
      const { error, data: row } = await sb.from("materials").insert(payload as never).select().maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { error, data: row } = await sb.from("materials").update(payload as never).eq("id", data.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("materials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const LineSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  capacity_per_hour: z.number().nonnegative().default(0),
  status: z.enum(["running", "setup", "idle", "broken", "maintenance"]).default("idle"),
  quality_factor: z.number().min(0).max(1).default(0.95),
});
export const saveLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LineSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const payload = { ...data } as Record<string, unknown>;
    delete payload.id;
    if (!data.id) {
      const { error, data: row } = await sb.from("production_lines").insert(payload as never).select().maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { error, data: row } = await sb.from("production_lines").update(payload as never).eq("id", data.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
export const deleteLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("production_lines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CustomerSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  importance: z.number().int().min(1).max(10).default(5),
  annual_value: z.number().nonnegative().default(0),
  churn_risk: z.number().min(0).max(1).default(0.1),
});
export const saveCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CustomerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const payload = { ...data } as Record<string, unknown>;
    delete payload.id;
    if (!data.id) {
      const { error, data: row } = await sb.from("customers").insert(payload as never).select().maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { error, data: row } = await sb.from("customers").update(payload as never).eq("id", data.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("customers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const OrderSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  due_date: z.string().min(1), // YYYY-MM-DD
  status: z.enum(["received", "reviewing", "approved", "in_progress", "completed", "cancelled"]).default("received"),
});
export const saveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const payload = { ...data } as Record<string, unknown>;
    delete payload.id;
    if (!data.id) {
      const { error, data: row } = await sb.from("orders").insert(payload as never).select().maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { error, data: row } = await sb.from("orders").update(payload as never).eq("id", data.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Jobs panel ============
export const listAiRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_runs")
      .select("id,created_at,finished_at,kind,status,duration_ms,user_id,error_message,params,result_summary")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
