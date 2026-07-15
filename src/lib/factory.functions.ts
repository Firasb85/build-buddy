import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
