import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getObjective, setObjective } from "@/lib/local-api";
import { useI18n } from "@/hooks/use-i18n";
import { JobsPanel } from "@/components/jobs-panel";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const OBJS = ["default", "maximize_profit", "maximize_service", "reduce_inventory", "protect_cash"] as const;

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const qc = useQueryClient();
  const obj = useQuery({ queryKey: ["objective"], queryFn: () => getObjective() });
  const change = useMutation({
    mutationFn: (o: (typeof OBJS)[number]) => setObjective({ objective: o }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objective"] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.nav_settings}</h1>
      <div className="card-panel p-6">
        <h2 className="text-sm font-semibold mb-3">{t.settings_lang}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setLang("ar")}
            className={"btn-ghost " + (lang === "ar" ? "!border-primary !text-primary" : "")}
          >{t.lang_ar}</button>
          <button
            onClick={() => setLang("en")}
            className={"btn-ghost " + (lang === "en" ? "!border-primary !text-primary" : "")}
          >{t.lang_en}</button>
        </div>
      </div>
      <div className="card-panel p-6">
        <h2 className="text-sm font-semibold mb-3">{t.settings_objective}</h2>
        <div className="flex flex-wrap gap-2">
          {OBJS.map((o) => (
            <button
              key={o}
              onClick={() => change.mutate(o)}
              disabled={change.isPending}
              className={
                "rounded-md border px-3 py-2 text-sm transition " +
                (obj.data?.objective === o
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground")
              }
            >
              {t[`obj_${o}` as keyof typeof t]}
            </button>
          ))}
        </div>
      </div>
      <JobsPanel />
    </div>
  );
}
