import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EntrySchema = z.object({
  entry_date: z.string(),
  product_id: z.string().uuid(),
  line_id: z.string().uuid().optional().nullable(),
  produced: z.number().nonnegative(),
  shipped: z.number().nonnegative(),
  received_material_qty: z.number().nonnegative().default(0),
  notes: z.string().optional().nullable(),
});

export const submitDailyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EntrySchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { error, data: entry } = await sb.from("daily_entries").insert({
      entry_date: data.entry_date,
      product_id: data.product_id,
      line_id: data.line_id ?? null,
      produced: data.produced,
      shipped: data.shipped,
      received_material_qty: data.received_material_qty,
      notes: data.notes ?? null,
      entered_by: context.userId,
    }).select().maybeSingle();
    if (error) throw new Error(error.message);

    // Update stock quantities atomically-ish (best-effort MVP)
    const { data: prod } = await sb.from("products").select("stock_qty").eq("id", data.product_id).maybeSingle();
    if (prod) {
      const newStock = Math.max(0, Number(prod.stock_qty) + data.produced - data.shipped);
      await sb.from("products").update({ stock_qty: newStock }).eq("id", data.product_id);
    }

    return entry;
  });

export const listRecentDailyEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("daily_entries")
      .select("*,products(name_ar,name_en,sku),production_lines(name_ar,name_en)")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
