import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeWeeklyAccuracy,
  suggestWeightTuning,
  type AcceptRejectRecord,
} from "./learning.server";
import { WEIGHTS, type Objective } from "./pps.server";

const ObjectiveEnum = z.enum(["default", "maximize_profit", "maximize_service", "reduce_inventory", "protect_cash"]);

export const recordLearningSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      recommendation_id: z.string().uuid().optional().nullable(),
      product_id: z.string().uuid().optional().nullable(),
      signal: z.enum(["accept", "reject", "override", "snooze"]),
      objective: ObjectiveEnum.optional().default("default"),
      weight_snapshot: z.array(z.number()).optional().nullable(),
      component_dominant: z.number().int().min(0).max(5).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { error } = await sb.from("learning_signals").insert({
      user_id: context.userId,
      recommendation_id: data.recommendation_id ?? null,
      product_id: data.product_id ?? null,
      signal: data.signal,
      objective: data.objective ?? "default",
      weight_snapshot: data.weight_snapshot ?? null,
      component_dominant: data.component_dominant ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWeeklyReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input as { objective?: string })?.objective;
    return { objective: (v && ObjectiveEnum.options.includes(v as Objective) ? v : "default") as Objective };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86400_000);
    const weekStartIso = weekStart.toISOString();

    const { data: signals } = await sb
      .from("learning_signals")
      .select("signal,objective,weight_snapshot,component_dominant,created_at,recommendation_id")
      .gte("created_at", weekStartIso);

    const filtered = (signals ?? []).filter((s: any) => s.objective === data.objective);
    const records: AcceptRejectRecord[] = filtered.map((s: any) => ({
      objective: s.objective as Objective,
      signal: s.signal,
      weight_snapshot: s.weight_snapshot ?? undefined,
      component_dominant: s.component_dominant ?? undefined,
    }));

    const accuracy = computeWeeklyAccuracy(records, weekStart, now);
    const tuning = suggestWeightTuning({ objective: data.objective, records });

    return {
      week_start: accuracy.week_start,
      week_end: accuracy.week_end,
      total: accuracy.total,
      accepted: accuracy.accepted,
      rejected: accuracy.rejected,
      overrides: accuracy.overrides,
      acceptance_rate: accuracy.acceptance_rate,
      current_weights: [...WEIGHTS[data.objective]],
      suggested_weights: tuning.suggested_weights,
      rationale_ar: tuning.rationale_ar,
      rationale_en: tuning.rationale_en,
      expected_accuracy: tuning.expected_accuracy,
    };
  });
