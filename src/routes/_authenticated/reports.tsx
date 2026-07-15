import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { listInputSubmissions, listFactories } from "@/lib/local-api";
import { useI18n } from "@/hooks/use-i18n";
import { useActiveFactory } from "@/hooks/use-active-factory";
import { FileText, TrendingUp, TrendingDown, Package, AlertTriangle, Trash2 } from "lucide-react";
import type { InputSubmission, Factory } from "@/lib/local-db";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Window = "7d" | "30d" | "all";

function ReportsPage() {
  const { t, lang } = useI18n();
  const { factory: activeFactory, factories, setFactory } = useActiveFactory();
  const [windowSel, setWindowSel] = useState<Window>("7d");
  const [factoryFilter, setFactoryFilter] = useState<string>("active"); // active | all | specific id

  // Always fetch all submissions (we'll filter in JS) so the per-factory cards
  // can show in the "all" view.
  const submissions = useQuery({ queryKey: ["input-submissions-all"], queryFn: () => listInputSubmissions({}) });

  const filtered = useMemo(() => {
    const all = (submissions.data ?? []) as InputSubmission[];
    const since = windowSel === "7d" ? Date.now() - 7 * 86400_000 : windowSel === "30d" ? Date.now() - 30 * 86400_000 : 0;
    return all.filter((s) => s.submitted_at && new Date(s.submitted_at).getTime() >= since);
  }, [submissions.data, windowSel]);

  // For per-factory: filter by factory_id
  const effectiveFactoryId = factoryFilter === "active" ? activeFactory?.id
    : factoryFilter === "all" ? null
    : factoryFilter;

  const scopedForAggregate = effectiveFactoryId == null
    ? filtered
    : filtered.filter((s) => s.factory_id === effectiveFactoryId);

  // Compute aggregates
  const inputs = scopedForAggregate.filter((s) => s.kind === "input");
  const outputs = scopedForAggregate.filter((s) => s.kind === "output");
  const num = (s: InputSubmission, k: string) => {
    const v = s.values[k];
    return typeof v === "number" ? v : 0;
  };
  const totalInput = inputs.reduce((a, s) => a + sumNumeric(s), 0);
  const totalOutput = outputs.reduce((a, s) => a + sumNumeric(s), 0);
  const totalWaste = outputs.reduce((a, s) => a + num(s, "waste_kg"), 0);
  const totalShipped = outputs.reduce((a, s) => a + num(s, "shipped_units") + num(s, "shipped_bundles") + num(s, "shipped_boxes"), 0);
  const defectValues = outputs.map((s) => num(s, "defect_pct")).filter((n) => n > 0);
  const avgDefect = defectValues.length > 0 ? defectValues.reduce((a, b) => a + b, 0) / defectValues.length : 0;
  const ratio = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;

  // Per-day series
  const byDay = new Map<string, { input: number; output: number; waste: number; count: number }>();
  for (const s of scopedForAggregate) {
    const day = s.for_date;
    const cur = byDay.get(day) ?? { input: 0, output: 0, waste: 0, count: 0 };
    cur.count += 1;
    if (s.kind === "input") cur.input += sumNumeric(s);
    else {
      cur.output += sumNumeric(s);
      cur.waste += num(s, "waste_kg");
    }
    byDay.set(day, cur);
  }
  const series = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(1, ...series.map(([, v]) => Math.max(v.input, v.output)));

  if (!activeFactory) {
    return <div className="card-panel p-8 text-center text-sm text-muted-foreground">{t.no_factory_selected}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {t.reports_title}
          </h1>
          <p className="text-sm text-muted-foreground">{t.reports_desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input-field !w-44" value={factoryFilter} onChange={(e) => setFactoryFilter(e.target.value)}>
            <option value="active">{t.select_factory} ({activeFactory && (lang === "ar" ? activeFactory.name_ar : activeFactory.name_en)})</option>
            <option value="all">{t.factories} ({factories.length})</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>{lang === "ar" ? f.name_ar : f.name_en}</option>
            ))}
          </select>
          <select className="input-field !w-32" value={windowSel} onChange={(e) => setWindowSel(e.target.value as Window)}>
            <option value="7d">{t.report_window_7d}</option>
            <option value="30d">{t.report_window_30d}</option>
            <option value="all">{t.report_window_all}</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t.report_total_input} value={fmt(totalInput)} icon={Package} />
        <Kpi label={t.report_total_output} value={fmt(totalOutput)} icon={Package} />
        <Kpi label={t.report_total_waste} value={fmt(totalWaste)} icon={Trash2} tone={totalWaste > 0 ? "warning" : "default"} />
        <Kpi label={t.report_avg_defect} value={`${avgDefect.toFixed(1)}%`} icon={AlertTriangle} tone={avgDefect > 5 ? "destructive" : "default"} />
        <Kpi label={t.report_shipped} value={fmt(totalShipped)} icon={TrendingUp} />
        <Kpi label={t.report_produced_per_input} value={`${ratio.toFixed(1)}%`} icon={TrendingDown} />
        <Kpi label={t.report_submissions} value={String(scopedForAggregate.length)} icon={FileText} />
      </div>

      {/* Per-day chart */}
      {series.length > 0 && (
        <div className="card-panel p-5">
          <h2 className="text-sm font-semibold mb-4">{t.report_by_day}</h2>
          <div className="space-y-1.5">
            {series.map(([day, v]) => (
              <div key={day} className="grid grid-cols-[100px_1fr] items-center gap-3 text-xs">
                <div className="tabular-nums text-muted-foreground">{day}</div>
                <div className="space-y-1">
                  <Bar label="in" value={v.input} max={maxDay} color="bg-accent" />
                  <Bar label="out" value={v.output} max={maxDay} color="bg-primary" />
                  {v.waste > 0 && <Bar label="waste" value={v.waste} max={maxDay} color="bg-warning" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {series.length === 0 && (
        <div className="card-panel p-8 text-center text-sm text-muted-foreground">
          {t.form_submissions_empty}
        </div>
      )}

      {/* Per-factory breakdown (only when showing all) */}
      {factoryFilter === "all" && factories.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {factories.map((f) => {
            const inF = filtered.filter((s) => s.factory_id === f.id && s.kind === "input");
            const outF = filtered.filter((s) => s.factory_id === f.id && s.kind === "output");
            const tIn = inF.reduce((a, s) => a + sumNumeric(s), 0);
            const tOut = outF.reduce((a, s) => a + sumNumeric(s), 0);
            return (
              <div key={f.id} className="card-panel p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: f.color }} />
                  <h3 className="text-sm font-semibold">{lang === "ar" ? f.name_ar : f.name_en}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-border p-2">
                    <div className="text-muted-foreground">{t.report_total_input}</div>
                    <div className="text-lg font-bold tabular-nums">{fmt(tIn)}</div>
                  </div>
                  <div className="rounded border border-border p-2">
                    <div className="text-muted-foreground">{t.report_total_output}</div>
                    <div className="text-lg font-bold tabular-nums">{fmt(tOut)}</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {t.report_submissions}: {inF.length + outF.length}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sumNumeric(s: InputSubmission): number {
  let t = 0;
  for (const v of Object.values(s.values)) if (typeof v === "number") t += v;
  return t;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(0);
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof TrendingUp; tone?: "warning" | "destructive" | "default" }) {
  const color = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="card-panel p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="kpi-label">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-10 text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className={"h-full " + color} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <div className="w-16 text-end tabular-nums">{fmt(value)}</div>
    </div>
  );
}
