import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ObjEnum = z.enum(["default", "maximize_profit", "maximize_service", "reduce_inventory", "protect_cash"]);

export const getObjective = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("objective_settings").select("*").eq("id", 1).maybeSingle();
    return data ?? { id: 1, objective: "default" as const };
  });

export const setObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ objective: ObjEnum }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("objective_settings")
      .update({ objective: data.objective, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
