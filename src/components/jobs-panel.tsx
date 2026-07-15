import { useQuery } from "@tanstack/react-query";
import { listAiRuns } from "@/lib/local-api";
import { useI18n } from "@/hooks/use-i18n";
import { useState } from "react";
import { Activity, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

interface Run {
  id: string;
  created_at: string;
  finished_at: string | null;
  kind: string;
  status: "running" | "success" | "error";
  duration_ms: number | null;
  user_id: string | null;
  error_message: string | null;
  params: unknown;
  result_summary: unknown;
}

const KIND_COLORS: Record<string, string> = {
  pps: "bg-primary/15 text-primary",
  forecast: "bg-accent/15 text-accent",
  simulate: "bg-success/15 text-success",
  briefing: "bg-warning/15 text-warning",
  anomaly: "bg-destructive/15 text-destructive",
  assistant: "bg-surface-2 text-muted-foreground",
};

export function JobsPanel() {
  const { t } = useI18n();
  const [kindFilter, setKindFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const query = useQuery({
    queryKey: ["ai-runs", kindFilter, statusFilter],
    queryFn: () => listAiRuns(),
    refetchInterval: 5000, // poll for live updates
  });

  const rows: Run[] = ((query.data ?? []) as Run[]).filter((r) =>
    (!kindFilter || r.kind === kindFilter) && (!statusFilter || r.status === statusFilter),
  );

  const stats = {
    total: rows.length,
    success: rows.filter((r) => r.status === "success").length,
    error: rows.filter((r) => r.status === "error").length,
    running: rows.filter((r) => r.status === "running").length,
  };

  return (
    <div className="card-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            {t.jobs_title}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t.jobs_desc}</p>
        </div>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => query.refetch()}>
          <RefreshCw className={"h-3 w-3 " + (query.isFetching ? "animate-spin" : "")} />
          {t.jobs_refresh}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Total" value={stats.total} />
        <Stat label={t.jobs_status_success} value={stats.success} tone="success" />
        <Stat label={t.jobs_status_error} value={stats.error} tone="error" />
        <Stat label={t.jobs_status_running} value={stats.running} tone="running" />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <select className="input-field !w-40" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">All kinds</option>
          <option value="pps">{t.jobs_kind_pps}</option>
          <option value="forecast">{t.jobs_kind_forecast}</option>
          <option value="simulate">{t.jobs_kind_simulate}</option>
          <option value="briefing">{t.jobs_kind_briefing}</option>
          <option value="anomaly">{t.jobs_kind_anomaly}</option>
          <option value="assistant">{t.jobs_kind_assistant}</option>
        </select>
        <select className="input-field !w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All status</option>
          <option value="success">{t.jobs_status_success}</option>
          <option value="error">{t.jobs_status_error}</option>
          <option value="running">{t.jobs_status_running}</option>
        </select>
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface/80 backdrop-blur">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-start py-2 px-2">{t.jobs_col_kind}</th>
              <th className="text-start">{t.jobs_col_status}</th>
              <th className="text-end">{t.jobs_col_duration}</th>
              <th className="text-end">{t.jobs_col_time}</th>
              <th className="text-start">{t.jobs_col_error}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">{t.jobs_empty}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="py-2 px-2">
                  <span className={"inline-flex rounded px-2 py-0.5 text-[10px] font-medium " + (KIND_COLORS[r.kind] ?? KIND_COLORS.assistant)}>
                    {t[`jobs_kind_${r.kind}`] ?? r.kind}
                  </span>
                </td>
                <td>
                  <span className={"inline-flex items-center gap-1 " + (r.status === "success" ? "text-success" : r.status === "error" ? "text-destructive" : "text-warning")}>
                    {r.status === "success" ? <CheckCircle2 className="h-3 w-3" /> :
                     r.status === "error" ? <XCircle className="h-3 w-3" /> :
                     <Loader2 className="h-3 w-3 animate-spin" />}
                    {t[`jobs_status_${r.status}`] ?? r.status}
                  </span>
                </td>
                <td className="text-end tabular-nums">{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</td>
                <td className="text-end tabular-nums text-muted-foreground">
                  {new Date(r.created_at).toLocaleTimeString()}
                </td>
                <td className="text-destructive text-[11px] truncate max-w-xs" title={r.error_message ?? undefined}>
                  {r.error_message ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "error" | "running" }) {
  const color = tone === "success" ? "text-success" : tone === "error" ? "text-destructive" : tone === "running" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={"mt-1 text-2xl font-bold tabular-nums " + color}>{value}</div>
    </div>
  );
}
