// Server-side helper to record AI run events into `ai_runs`.
// Used by the createServerFn pipeline so every run is automatically tracked.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type RunKind = "pps" | "forecast" | "simulate" | "briefing" | "anomaly" | "assistant";
export type RunStatus = "running" | "success" | "error";

export interface RecordRunInput {
  sb: SupabaseClient<Database>;
  userId?: string;
  kind: RunKind;
  params?: unknown;
}

export interface RunHandle {
  runId: string;
  startedAt: number;
  finish: (result?: unknown) => Promise<void>;
  fail: (err: unknown) => Promise<void>;
}

/**
 * Insert a "running" row, return a handle that can mark it as success/error.
 * Use:
 *   const run = await recordRunStart({ sb, userId, kind: "pps", params });
 *   try { ...; await run.finish(result); } catch (e) { await run.fail(e); throw e; }
 */
export async function recordRunStart(input: RecordRunInput): Promise<RunHandle> {
  const startedAt = Date.now();
  const { data, error } = await input.sb
    .from("ai_runs")
    .insert({
      kind: input.kind,
      status: "running",
      user_id: input.userId ?? null,
      params: (input.params as never) ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    // best-effort: don't block the actual call
    console.error("[jobs] failed to insert ai_runs row:", error.message);
  }
  const runId = data?.id ?? "00000000-0000-0000-0000-000000000000";
  return {
    runId,
    startedAt,
    async finish(result?: unknown) {
      const summary = summarize(result);
      const { error: e2 } = await input.sb
        .from("ai_runs")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          result_summary: (summary as never) ?? null,
        })
        .eq("id", runId);
      if (e2) console.error("[jobs] failed to update ai_runs:", e2.message);
    },
    async fail(err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const { error: e2 } = await input.sb
        .from("ai_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          error_message: message,
        })
        .eq("id", runId);
      if (e2) console.error("[jobs] failed to update ai_runs:", e2.message);
    },
  };
}

/** Reduce a result object to a small summary for the jobs table. */
function summarize(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ["count", "rows", "results", "alerts", "answer", "objective", "delta", "metric", "horizon"]) {
    if (k in r) {
      const v = r[k];
      if (typeof v === "number" || typeof v === "string") out[k] = v;
      else if (Array.isArray(v)) out[`${k}_count`] = v.length;
    }
  }
  return Object.keys(out).length ? out : null;
}
