import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listDecisionLog } from "@/lib/decisions.functions";
import { useI18n, pickName } from "@/hooks/use-i18n";

export const Route = createFileRoute("/_authenticated/decisions")({
  component: DecisionsPage,
});

function DecisionsPage() {
  const { t, lang } = useI18n();
  const log = useQuery({ queryKey: ["decision-log"], queryFn: () => listDecisionLog() });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.nav_decisions}</h1>
      <div className="card-panel p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-start py-2">{t.date}</th>
                <th className="text-start">{t.action}</th>
                <th className="text-start">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {(log.data ?? []).map((d) => {
                const r = (d as { recommendations?: { action_ar: string; action_en: string; products?: { name_ar: string; name_en: string } } }).recommendations;
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                    <td>
                      {r ? (lang === "ar" ? r.action_ar : r.action_en) : d.action}
                      {r?.products && <div className="text-xs text-muted-foreground">{pickName(r.products, lang)}</div>}
                    </td>
                    <td>
                      <span className={
                        d.action === "accepted" ? "text-success" :
                        d.action === "rejected" ? "text-destructive" :
                        "text-muted-foreground"
                      }>{d.action}</span>
                    </td>
                  </tr>
                );
              })}
              {(log.data ?? []).length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">{t.no_data}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
