// Convenience wrapper to instrument server functions with ai_runs tracking.
// Usage:
//   export const runPPS = createServerFn({ method: "POST" })
//     .middleware([requireSupabaseAuth])
//     .handler(withJobTracking("pps", async ({ data, context }) => { ... }));
//
// The wrapper:
//   1. Records a "running" ai_runs row before the handler runs.
//   2. Records "success" with a small summary on normal completion.
//   3. Records "error" with the error message on throw.

import type { RunKind } from "./jobs";
import { recordRunStart } from "./jobs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface AuthedContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
}

type Handler<C extends AuthedContext, TData, TResult> = (args: {
  data: TData;
  context: C;
}) => Promise<TResult>;

export function withJobTracking<TData, TResult>(
  kind: RunKind,
  handler: Handler<AuthedContext, TData, TResult>,
  getParams?: (data: TData) => unknown,
): Handler<AuthedContext, TData, TResult> {
  return async ({ data, context }) => {
    const run = await recordRunStart({
      sb: context.supabase,
      userId: context.userId,
      kind,
      params: getParams ? getParams(data) : (data as unknown),
    });
    try {
      const result = await handler({ data, context });
      await run.finish(result);
      return result;
    } catch (err) {
      await run.fail(err);
      throw err;
    }
  };
}
