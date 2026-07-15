import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WEIGHTS, type Objective } from "./pps.server";
import type { Json } from "@/integrations/supabase/types";

const ObjEnum = z.enum(["default", "maximize_profit", "maximize_service", "reduce_inventory", "protect_cash"]);

export const getObjective = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("objective_settings")
      .select("id,objective,custom_weights,updated_at,updated_by")
      .eq("id", 1)
      .maybeSingle();
    const base = data ?? { id: 1, objective: "default" as Objective, custom_weights: null, updated_at: null, updated_by: null };
    return {
      ...base,
      effective_weights: (base.custom_weights as number[] | null) ?? WEIGHTS[base.objective as Objective],
    };
  });

export const setObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ objective: ObjEnum }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("objective_settings")
      .update({ objective: data.objective, custom_weights: null, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Apply custom weights (6 floats, must sum to 1) to the objective.
 * Used by the "Edit assumptions" flow on the dashboard.
 */
const WeightsSchema = z.object({
  weights: z.array(z.number().min(0).max(1)).length(6),
});

export const setCustomWeights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WeightsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sum = data.weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.01) {
      throw new Error(`Weights must sum to 1.0 (got ${sum.toFixed(3)})`);
    }
    const { error } = await context.supabase
      .from("objective_settings")
      .update({
        custom_weights: data.weights as unknown as Json,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true, weights: data.weights };
  });

/** Clear custom weights and revert to the preset for the current objective. */
export const clearCustomWeights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("objective_settings")
      .update({ custom_weights: null, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
