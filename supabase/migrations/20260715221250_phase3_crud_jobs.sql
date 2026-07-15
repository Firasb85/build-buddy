-- ============ PHASE 3: CRUD + AI RUNS + JOBS HISTORY ============

-- ============ AI RUNS (jobs history) ============
-- Every server-fn invocation (PPS, forecast, simulate, briefing, anomaly)
-- is recorded here. Used for the Settings > Background jobs panel.
CREATE TYPE public.ai_run_status AS ENUM ('running','success','error');
CREATE TYPE public.ai_run_kind AS ENUM (
  'pps','forecast','simulate','briefing','anomaly','assistant'
);

CREATE TABLE public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  user_id uuid REFERENCES auth.users(id),
  kind ai_run_kind NOT NULL,
  status ai_run_status NOT NULL DEFAULT 'running',
  duration_ms integer,
  params jsonb,
  result_summary jsonb,
  error_message text
);
CREATE INDEX ON public.ai_runs (created_at DESC);
CREATE INDEX ON public.ai_runs (kind, created_at DESC);
CREATE INDEX ON public.ai_runs (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_runs TO authenticated;
GRANT ALL ON public.ai_runs TO service_role;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_runs auth all" ON public.ai_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ objective_settings.custom_weights is already a jsonb ============
-- (Defined in Phase 1 migration.) No change needed.
