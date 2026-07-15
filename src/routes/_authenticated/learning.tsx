import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getWeeklyReview } from "@/lib/learning.functions";
import { useI18n } from "@/hooks/use-i18n";
import { Brain, Check, X, Edit3, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/_authenticated/learning")({
  component: LearningPage,
});

const OBJS = ["default", "maximize_profit", "maximize_service", "reduce_inventory", "protect_cash"] as const;

const COMPONENT_LABELS_AR = ["خطر النفاد", "الأثر الربحي", "أهمية العميل", "كفاءة الخط", "جاهزية المواد", "الوزن الاستراتيجي"];
const COMPONENT_LABELS_EN = ["Stockout risk", "Profit impact", "Customer importance", "Line efficiency", "Material readiness", "Strategic weight"];

function LearningPage() {
  const { t, lang } = useI18n();
  const [objective, setObjective] = useState<(typeof OBJS)[number]>("default");
  const reviewFn = useServerFn(getWeeklyReview);
  const review = useQuery({
    queryKey: ["learning-review", objective],
    queryFn: () => reviewFn({ data: { objective } }),
  });

  const compLabels = lang === "ar" ? COMPONENT_LABELS_AR : COMPONENT_LABELS_EN;
  const r = review.data;
  const acceptanceColor = !r ? "" :
    r.acceptance_rate >= 0.7 ? "text-success" :
    r.acceptance_rate >= 0.4 ? "text-warning" : "text-destructive";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          {t.learning_title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.learning_desc}</p>
      </div>

      <div className="card-panel p-5">
        <label className="label-text">{t.objective}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {OBJS.map((o) => (
            <button
              key={o}
              onClick={() => setObjective(o)}
              className={
                "rounded-md border px-3 py-2 text-sm transition " +
                (objective === o
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground")
              }
            >
              {t[`obj_${o}`]}
            </button>
          ))}
        </div>
      </div>

      {r && r.total === 0 ? (
        <div className="card-panel p-8 text-center text-sm text-muted-foreground">
          {t.learning_no_data}
        </div>
      ) : r ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label={t.learning_total} value={r.total} icon={Edit3} />
            <Stat label={t.learning_accepted} value={r.accepted} icon={Check} tone="success" />
            <Stat label={t.learning_rejected} value={r.rejected} icon={X} tone="destructive" />
            <Stat label={t.learning_overrides} value={r.overrides} icon={Edit3} />
            <Stat label={t.learning_acceptance_rate} value={`${(r.acceptance_rate * 100).toFixed(0)}%`} icon={Lightbulb} tone={acceptanceColor} />
          </div>

          <div className="card-panel p-5">
            <h2 className="text-sm font-semibold mb-4">{t.learning_current_weights} → {t.learning_suggested_weights}</h2>
            <div className="space-y-3">
              {compLabels.map((label, i) => {
                const cur = r.current_weights[i] ?? 0;
                const sug = r.suggested_weights[i] ?? 0;
                const max = Math.max(cur, sug, 0.01);
                const delta = sug - cur;
                return (
                  <div key={label} className="grid grid-cols-[140px_1fr_1fr_80px] items-center gap-3 text-xs">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full bg-muted" style={{ width: `${(cur / max) * 100}%` }} />
                      </div>
                      <span className="tabular-nums w-12 text-end">{(cur * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${(sug / max) * 100}%` }} />
                      </div>
                      <span className="tabular-nums w-12 text-end font-semibold">{(sug * 100).toFixed(0)}%</span>
                    </div>
                    <span className={"tabular-nums text-end " + (delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">{t.learning_rationale}: </strong>
              {lang === "ar" ? r.rationale_ar : r.rationale_en}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t.learning_expected_accuracy}: <strong className="text-foreground tabular-nums">{(r.expected_accuracy * 100).toFixed(0)}%</strong></span>
              <button className="btn-ghost text-xs" disabled title="Auto-apply scheduled in Phase 3">
                {t.learning_apply}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="card-panel p-8 text-center text-sm text-muted-foreground">
          {t.loading}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Check; tone?: "success" | "destructive" | string }) {
  return (
    <div className="card-panel p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={"h-4 w-4 " + (tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary")} />
        <span className="kpi-label">{label}</span>
      </div>
      <div className={"kpi-value mt-1 " + (tone && tone !== "success" && tone !== "destructive" ? tone : "")}>{value}</div>
    </div>
  );
}
