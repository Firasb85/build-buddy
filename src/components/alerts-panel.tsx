import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { detectAndPersistAlerts, listActiveAlerts, dismissAlert } from "@/lib/local-api";
import { useI18n } from "@/hooks/use-i18n";
import { AlertTriangle, AlertOctagon, Info, X, RefreshCw } from "lucide-react";

interface AlertRow {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  subject_kind: string;
  subject_id: string;
  title_ar: string;
  title_en: string;
  detail_ar: string | null;
  detail_en: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  created_at: string;
  dismissed_at: string | null;
}

export function AlertsPanel() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ["alerts-active"], queryFn: () => listActiveAlerts() });
  const detect = useMutation({
    mutationFn: () => detectAndPersistAlerts(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-active"] }),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissAlert({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-active"] }),
  });

  const rows: AlertRow[] = (alerts.data ?? []) as AlertRow[];

  // Health color
  const critical = rows.filter((a) => a.severity === "critical").length;
  const warning = rows.filter((a) => a.severity === "warning").length;
  const health = critical > 0 ? "red" : warning > 0 ? "yellow" : "green";
  const healthLabel = health === "red" ? t.alerts_health_red : health === "yellow" ? t.alerts_health_yellow : t.alerts_health_green;
  const healthColor = health === "red" ? "bg-destructive" : health === "yellow" ? "bg-warning" : "bg-success";

  return (
    <section className="card-panel p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className={"h-2.5 w-2.5 rounded-full " + healthColor} />
            {t.alerts_title}
          </h2>
          <span className="badge-chip">{rows.length}</span>
          <span className="text-xs text-muted-foreground">{healthLabel}</span>
        </div>
        <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => detect.mutate()} disabled={detect.isPending}>
          <RefreshCw className={"h-3 w-3 " + (detect.isPending ? "animate-spin" : "")} />
          {t.alerts_run_detection}
        </button>
      </div>

      <div className="mt-4 divide-y divide-border">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.alerts_empty}</p>
        )}
        {rows.slice(0, 8).map((a) => {
          const Icon = a.severity === "critical" ? AlertOctagon : a.severity === "warning" ? AlertTriangle : Info;
          const color = a.severity === "critical" ? "text-destructive" : a.severity === "warning" ? "text-warning" : "text-accent";
          return (
            <div key={a.id} className="py-3 flex items-start gap-3">
              <Icon className={"h-4 w-4 mt-0.5 shrink-0 " + color} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{lang === "ar" ? a.title_ar : a.title_en}</div>
                {(a.detail_ar || a.detail_en) && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {lang === "ar" ? a.detail_ar : a.detail_en}
                  </div>
                )}
              </div>
              <button
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                onClick={() => dismiss.mutate(a.id)}
                aria-label={t.alerts_dismiss}
                title={t.alerts_dismiss}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
