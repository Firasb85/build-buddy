-- ============ PHASE 2: AI LAYER (Forecast, Alerts, Learning, Simulation) ============

-- ============ FORECASTS ============
-- Stores 3-scenario forecast runs (optimistic/likely/pessimistic) per product/metric/horizon.
CREATE TYPE public.forecast_scenario AS ENUM ('optimistic','likely','pessimistic');
CREATE TYPE public.forecast_metric AS ENUM ('demand','inventory','cash');
CREATE TYPE public.forecast_horizon AS ENUM ('7d','4w','3m');

CREATE TABLE public.forecast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  metric forecast_metric NOT NULL,
  horizon forecast_horizon NOT NULL,
  subject text NOT NULL,                   -- e.g. product_id, or "ALL"
  scenario forecast_scenario NOT NULL,
  point_estimate numeric NOT NULL,
  low_estimate numeric,
  high_estimate numeric,
  confidence numeric NOT NULL DEFAULT 0,   -- 0..1
  driver_notes jsonb
);
CREATE INDEX ON public.forecast_runs (run_at DESC);
CREATE INDEX ON public.forecast_runs (metric, horizon, subject, run_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecast_runs TO authenticated;
GRANT ALL ON public.forecast_runs TO service_role;
ALTER TABLE public.forecast_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forecast auth all" ON public.forecast_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ALERT STATES ============
-- Cached, deduped alerts surfaced on the dashboard.
CREATE TYPE public.alert_severity AS ENUM ('info','warning','critical');
CREATE TYPE public.alert_kind AS ENUM (
  'stockout','overstock','dead_stock','low_readiness',
  'line_down','demand_anomaly','yield_drop','reorder_needed','cash_risk'
);

CREATE TABLE public.alert_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind alert_kind NOT NULL,
  severity alert_severity NOT NULL,
  subject_kind text NOT NULL,              -- 'product','material','line'
  subject_id text NOT NULL,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  detail_ar text,
  detail_en text,
  metric_value numeric,
  threshold_value numeric,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES auth.users(id)
);
CREATE INDEX ON public.alert_states (created_at DESC);
CREATE INDEX ON public.alert_states (kind, subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_states TO authenticated;
GRANT ALL ON public.alert_states TO service_role;
ALTER TABLE public.alert_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts auth all" ON public.alert_states FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ LEARNING SIGNALS ============
-- Records when the manager accepts/rejects/overrides a recommendation, plus weekly weight deltas.
CREATE TABLE public.learning_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  recommendation_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  signal text NOT NULL,                    -- 'accept','reject','override','snooze'
  objective text,
  weight_snapshot jsonb,                   -- weights at the time of the decision
  accuracy_score numeric                   -- 0..1, computed later (e.g. did the decision improve outcome?)
);
CREATE INDEX ON public.learning_signals (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_signals TO authenticated;
GRANT ALL ON public.learning_signals TO service_role;
ALTER TABLE public.learning_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning auth all" ON public.learning_signals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ SIMULATION RUNS ============
-- Records past "what-if" simulations so the manager can compare runs.
CREATE TABLE public.simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  params jsonb NOT NULL,                   -- e.g. {products:[{id,demand_delta_pct}], cash_inject:10000}
  result jsonb NOT NULL,                   -- computed impact summary
  label_ar text,
  label_en text
);
CREATE INDEX ON public.simulation_runs (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_runs TO authenticated;
GRANT ALL ON public.simulation_runs TO service_role;
ALTER TABLE public.simulation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "simulation auth all" ON public.simulation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ASSISTANT CONVERSATIONS ============
-- Optional persistence for the chat-based executive assistant.
CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  role text NOT NULL,                      -- 'user' or 'assistant'
  content text NOT NULL,
  context_snapshot jsonb                   -- factory state at the time
);
CREATE INDEX ON public.assistant_messages (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assistant auth all" ON public.assistant_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
