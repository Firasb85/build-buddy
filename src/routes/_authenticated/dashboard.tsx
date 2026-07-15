import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runPPS, getLatestPPS } from "@/lib/pps.functions";
import { listRecommendations, decideRecommendation } from "@/lib/decisions.functions";
import { generateBriefing } from "@/lib/briefing.functions";
import { getObjective } from "@/lib/objective.functions";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { Activity, AlertTriangle, RefreshCw, Sparkles, Check, X, TrendingUp, Brain, Bot, BarChart3, FlaskConical, Zap } from "lucide-react";
import { AlertsPanel } from "@/components/alerts-panel";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardWrapper,
});

const ppsQO = queryOptions({ queryKey: ["pps-latest"], queryFn: () => getLatestPPS() });
const recoQO = queryOptions({ queryKey: ["recommendations"], queryFn: () => listRecommendations() });
const objQO = queryOptions({ queryKey: ["objective"], queryFn: () => getObjective() });

function DashboardWrapper() {
  // Ensure user has a profile row (idempotent)
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      await supabase.from("profiles").upsert({ id: data.user.id, email: data.user.email }, { onConflict: "id" });
    });
  }, []);
  return <Dashboard />;
}

function Dashboard() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const runFn = useServerFn(runPPS);
  const briefFn = useServerFn(generateBriefing);
  const decide = useServerFn(decideRecommendation);
  const pps = useQuery(ppsQO);
  const recos = useQuery(recoQO);
  const obj = useQuery(objQO);
  const [briefing, setBriefing] = useState<string>("");
  const [briefLoading, setBriefLoading] = useState(false);

  const compute = useMutation({
    mutationFn: () => runFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pps-latest"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  const decideMut = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) =>
      decide({ data: { recommendation_id: v.id, accept: v.accept } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  const rows = pps.data?.rows ?? [];
  const activeRecos = (recos.data ?? []).filter((r) => r.status === "pending");
  const topFive = [...rows].slice(0, 5);
  const constrainedCount = rows.filter((r) => r.constraint_status === "constrained").length;

  // KPIs derived from PPS snapshot data
  const totalStock = rows.reduce((a, r) => a + Number((r as { products?: { stock_qty?: number } }).products?.stock_qty ?? 0), 0);
  const totalDemand = rows.reduce((a, r) => a + Number((r as { products?: { daily_demand?: number } }).products?.daily_demand ?? 0), 0);
  const stockDays = totalDemand > 0 ? (totalStock / totalDemand).toFixed(1) : "—";
  const avgReadiness = rows.length
    ? Math.round(rows.reduce((a, r) => a + Number(r.components?.material_readiness ?? 0), 0) / rows.length)
    : 0;
  const serviceLevel = rows.length ? Math.max(0, Math.min(100, 60 + avgReadiness / 2)).toFixed(0) : "—";

  async function generate() {
    setBriefLoading(true);
    try {
      const r = await briefFn({ data: { lang } });
      setBriefing(r.text);
    } catch (e) {
      setBriefing(e instanceof Error ? e.message : String(e));
    } finally {
      setBriefLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.nav_dashboard}</h1>
          <p className="text-sm text-muted-foreground">
            {t.objective}: <span className="text-foreground font-medium">{t[`obj_${obj.data?.objective ?? "default"}`] ?? "—"}</span>
            {pps.data?.runAt ? ` · ${new Date(pps.data.runAt).toLocaleString()}` : ""}
          </p>
        </div>
        <button className="btn-primary" disabled={compute.isPending} onClick={() => compute.mutate()}>
          <RefreshCw className={"h-4 w-4 " + (compute.isPending ? "animate-spin" : "")} />
          {compute.isPending ? t.computing : t.recompute}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label={t.kpi_service_level} value={`${serviceLevel}${serviceLevel === "—" ? "" : "%"}`} />
        <KPI label={t.kpi_stock_days} value={stockDays} suffix="d" />
        <KPI label={t.kpi_open_orders} value={String(activeRecos.length)} />
        <KPI label={t.kpi_top_bottleneck} value={String(constrainedCount)} suffix={t.constraint_blocked} accent={constrainedCount > 0} />
      </div>

      {/* AI Agents — Phase 2 quick links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AgentCard to="/forecast" icon={TrendingUp} title={t.nav_forecast} subtitle={t.forecast_desc} />
        <AgentCard to="/simulate" icon={FlaskConical} title={t.nav_simulate} subtitle={t.simulate_desc} />
        <AgentCard to="/assistant" icon={Bot} title={t.nav_assistant} subtitle={t.assistant_desc} />
        <AgentCard to="/learning" icon={Brain} title={t.nav_learning} subtitle={t.learning_desc} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Actions */}
        <section className="card-panel p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> {t.todays_actions}
            </h2>
            <span className="badge-chip">{activeRecos.length}</span>
          </div>
          <div className="mt-4 divide-y divide-border">
            {activeRecos.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {rows.length === 0 ? t.no_data : t.recompute + " →"}
              </p>
            )}
            {activeRecos.map((r) => (
              <div key={r.id} className="py-4 flex items-start gap-3">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary text-sm font-semibold tabular-nums">
                  {Math.round(Number(r.priority ?? 0))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {lang === "ar" ? r.action_ar : r.action_en}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {lang === "ar" ? r.reason_ar : r.reason_en}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    className="grid h-8 w-8 place-items-center rounded-md bg-success/15 text-success hover:bg-success/25"
                    onClick={() => decideMut.mutate({ id: r.id, accept: true })}
                    aria-label={t.accept}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    className="grid h-8 w-8 place-items-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25"
                    onClick={() => decideMut.mutate({ id: r.id, accept: false })}
                    aria-label={t.reject}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI briefing */}
        <section className="card-panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> {t.ai_briefing}
            </h2>
            <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={generate} disabled={briefLoading}>
              {briefLoading ? t.computing : t.generate_briefing}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t.briefing_hint}</p>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
            {briefing || <span className="text-muted-foreground">—</span>}
          </div>
        </section>
      </div>

      {/* PPS Top 5 */}
      <section className="card-panel p-5">
        <h2 className="text-lg font-semibold mb-4">{t.pps} · Top 5</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-start py-2">{t.product}</th>
                <th className="text-end">{t.pps}</th>
                <th className="text-end hidden md:table-cell">{t.stockout_risk}</th>
                <th className="text-end hidden md:table-cell">{t.profit_impact}</th>
                <th className="text-end hidden lg:table-cell">{t.material_readiness}</th>
                <th className="text-end">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {topFive.map((r) => {
                const p = (r as { products?: { name_ar: string; name_en: string; sku: string } }).products;
                return (
                  <tr key={r.product_id} className="border-t border-border">
                    <td className="py-3">
                      <div className="font-medium">{p ? pickName(p, lang) : r.product_id.slice(0, 6)}</div>
                      <div className="text-xs text-muted-foreground">{p?.sku}</div>
                    </td>
                    <td className="text-end font-semibold tabular-nums">{r.pps}</td>
                    <td className="text-end hidden md:table-cell tabular-nums">{r.components.stockout_risk}</td>
                    <td className="text-end hidden md:table-cell tabular-nums">{r.components.profit_impact}</td>
                    <td className="text-end hidden lg:table-cell tabular-nums">{r.components.material_readiness}</td>
                    <td className="text-end">
                      {r.constraint_status === "constrained" ? (
                        <span className="inline-flex items-center gap-1 text-warning text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          {t.constraint_blocked}
                        </span>
                      ) : (
                        <span className="text-success text-xs">{t.constraint_ok}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {topFive.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    {t.no_data}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Alerts panel */}
      <AlertsPanel />
    </div>
  );
}

function KPI({ label, value, suffix, accent }: { label: string; value: string; suffix?: string; accent?: boolean }) {
  return (
    <div className="card-panel p-5">
      <div className="kpi-label">{label}</div>
      <div className={"mt-1 flex items-baseline gap-2 " + (accent ? "text-warning" : "")}>
        <span className="kpi-value">{value}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function AgentCard({ to, icon: Icon, title, subtitle }: { to: string; icon: typeof TrendingUp; title: string; subtitle: string }) {
  return (
    <Link
      to={to}
      className="card-panel p-4 group hover:border-primary/60 hover:bg-surface-2/40 transition"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/20">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">{subtitle}</div>
        </div>
      </div>
    </Link>
  );
}
