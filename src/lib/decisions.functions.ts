import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("recommendations")
      .select("*,products(name_ar,name_en,sku)")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const listDecisionLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("decision_log")
      .select("*,recommendations(action_ar,action_en,products(name_ar,name_en))")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const decideRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      recommendation_id: z.string().uuid(),
      accept: z.boolean(),
      notes: z.string().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const status = data.accept ? "accepted" : "rejected";
    const nowIso = new Date().toISOString();
    // Fetch the recommendation + current objective so we can record a learning signal
    const [{ data: reco }, { data: objRow }] = await Promise.all([
      sb.from("recommendations").select("id,product_id,priority,impact").eq("id", data.recommendation_id).maybeSingle(),
      sb.from("objective_settings").select("objective").eq("id", 1).maybeSingle(),
    ]);
    const currentObjective = objRow?.objective ?? "default";
    const { error } = await sb
      .from("recommendations")
      .update({ status, decided_by: context.userId, decided_at: nowIso })
      .eq("id", data.recommendation_id);
    if (error) throw new Error(error.message);
    await sb.from("decision_log").insert({
      user_id: context.userId,
      recommendation_id: data.recommendation_id,
      action: status,
      notes: data.notes ?? null,
    });
    // Learning signal: capture dominant component (highest value) of the PPS impact
    if (reco) {
      const impact = (reco.impact as Record<string, number> | null) ?? {};
      const entries = Object.entries(impact);
      let dominantIdx = -1;
      let dominantVal = -Infinity;
      entries.forEach(([k, v], i) => {
        if (typeof v === "number" && v > dominantVal) { dominantVal = v; dominantIdx = i; }
      });
      const weightSnapshot = (() => {
        const map: Record<string, number[]> = {
          default: [0.30, 0.25, 0.15, 0.10, 0.12, 0.08],
          maximize_profit: [0.15, 0.40, 0.25, 0.10, 0.05, 0.05],
          maximize_service: [0.45, 0.10, 0.30, 0.05, 0.05, 0.05],
          reduce_inventory: [0.10, 0.20, 0.20, 0.15, 0.25, 0.10],
          protect_cash: [0.20, 0.15, 0.20, 0.10, 0.25, 0.10],
        };
        return map[currentObjective] ?? map.default;
      })();
      await sb.from("learning_signals").insert({
        user_id: context.userId,
        recommendation_id: data.recommendation_id,
        product_id: (reco as { product_id?: string }).product_id ?? null,
        signal: data.accept ? "accept" : "reject",
        objective: currentObjective,
        weight_snapshot: weightSnapshot,
        component_dominant: dominantIdx >= 0 ? dominantIdx : null,
      });
    }
    return { ok: true };
  });
