import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { runForecast, getLatestForecasts, listProducts } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { TrendingUp, TrendingDown, Sparkles, RefreshCw } from "lucide-react";
import type { ScenarioForecast, ForecastResult } from "@/lib/forecast.server";

export const Route = createFileRoute("/_authenticated/forecast")({
  component: ForecastPage,
});

const METRICS = ["demand", "inventory", "cash"] as const;
const HORIZONS = ["7d", "4w", "3m"] as const;

function ForecastPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [metric, setMetric] = useState<(typeof METRICS)[number]>("demand");
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>("7d");
  const [productId, setProductId] = useState<string>("");
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });

  const latest = useQuery({
    queryKey: ["forecast-latest", metric, horizon],
    queryFn: () => getLatestForecasts({ metric, horizon }),
  });

  const compute = useMutation({
    mutationFn: () =>
      runForecast({ metric, horizon, product_id: metric === "cash" ? null : productId || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast-latest"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          {t.forecast_title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.forecast_desc}</p>
      </div>

      <div className="card-panel p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label-text">{t.forecast_metric}</label>
            <select className="input-field" value={metric} onChange={(e) => setMetric(e.target.value as (typeof METRICS)[number])}>
              {METRICS.map((m) => (
                <option key={m} value={m}>{t[`fm_${m}` as keyof typeof t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">{t.forecast_horizon}</label>
            <select className="input-field" value={horizon} onChange={(e) => setHorizon(e.target.value as (typeof HORIZONS)[number])}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>{t[`fh_${h}` as keyof typeof t]}</option>
              ))}
            </select>
          </div>
          {metric !== "cash" && (
            <div>
              <label className="label-text">{t.product}</label>
              <select className="input-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">—</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{pickName(p, lang)} · {p.sku}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button className="btn-primary" disabled={compute.isPending} onClick={() => compute.mutate()}>
          <RefreshCw className={"h-4 w-4 " + (compute.isPending ? "animate-spin" : "")} />
          {compute.isPending ? t.computing_forecast : t.run_forecast}
        </button>
      </div>

      {latest.data && latest.data.results.length > 0 ? (
        <div className="space-y-4">
          {latest.data.results.map((r) => (
            <ForecastRow key={`${r.subject}-${r.horizon}`} result={r} />
          ))}
        </div>
      ) : (
        <div className="card-panel p-8 text-center text-sm text-muted-foreground">
          {t.forecast_empty}
        </div>
      )}
    </div>
  );
}

function ForecastRow({ result }: { result: ForecastResult }) {
  const { t, lang } = useI18n();
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const product = (products.data ?? []).find((p: { id: string }) => p.id === result.subject);
  const subjectLabel = result.subject === "ALL" ? t.appName : product ? pickName(product, lang) : result.subject.slice(0, 6);

  return (
    <div className="card-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{subjectLabel}</h3>
          <p className="text-xs text-muted-foreground">
            {t[`fm_${result.metric}`]} · {t[`fh_${result.horizon}`]} · {t.forecast_baseline} {result.baseline.toFixed(0)} {result.unit}
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t.forecast_history}: {result.history}
        </span>
      </div>

      {typeof result.daysToThreshold === "number" && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          {t.forecast_days_to_threshold}: <span className="font-semibold">{result.daysToThreshold} يوم</span>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ScenarioCard title={t.sc_optimistic} prob={t.sc_prob_optimistic} f={result.optimistic} unit={result.unit} tone="success" />
        <ScenarioCard title={t.sc_likely} prob={t.sc_prob_likely} f={result.likely} unit={result.unit} tone="default" highlight />
        <ScenarioCard title={t.sc_pessimistic} prob={t.sc_prob_pessimistic} f={result.pessimistic} unit={result.unit} tone="warning" />
      </div>

      {result.optimistic.drivers.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          {t.forecast_drivers}: {result.optimistic.drivers.join("، ")}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ title, prob, f, unit, tone, highlight }: {
  title: string;
  prob: string;
  f: ScenarioForecast;
  unit: string;
  tone: "success" | "warning" | "default";
  highlight?: boolean;
}) {
  const { t } = useI18n();
  const colors =
    tone === "success" ? "border-success/40 bg-success/5" :
    tone === "warning" ? "border-warning/40 bg-warning/5" :
    "border-border";
  return (
    <div className={"rounded-lg border p-4 " + colors + (highlight ? " ring-1 ring-primary" : "")}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2">
          {tone === "success" ? <TrendingUp className="h-4 w-4 text-success" /> :
           tone === "warning" ? <TrendingDown className="h-4 w-4 text-warning" /> :
           <Sparkles className="h-4 w-4 text-primary" />}
          {title}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{prob}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{f.point.toFixed(0)} <span className="text-sm text-muted-foreground font-normal">{unit}</span></div>
      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
        {f.low.toFixed(0)} — {f.high.toFixed(0)}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="kpi-label">{t.forecast_confidence}</span>
        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${Math.round(f.confidence * 100)}%` }} />
        </div>
        <span className="tabular-nums font-medium">{(f.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
