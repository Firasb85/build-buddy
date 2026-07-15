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
    const status = data.accept ? "accepted" : "rejected";
    const nowIso = new Date().toISOString();
    const { error } = await context.supabase
      .from("recommendations")
      .update({ status, decided_by: context.userId, decided_at: nowIso })
      .eq("id", data.recommendation_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("decision_log").insert({
      user_id: context.userId,
      recommendation_id: data.recommendation_id,
      action: status,
      notes: data.notes ?? null,
    });
    return { ok: true };
  });
