import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listDecisionLog } from "@/lib/decisions.functions";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { Download } from "lucide-react";
import { rowsToCsv, downloadCsv, rowsToPdf, type ColumnDef } from "@/lib/export.client";

export const Route = createFileRoute("/_authenticated/decisions")({
  component: DecisionsPage,
});

interface DecisionRow {
  id: string;
  created_at: string;
  action: string;
  notes: string | null;
  recommendations?: { action_ar: string; action_en: string; products?: { name_ar: string; name_en: string } | null } | null;
}

function DecisionsPage() {
  const { t, lang } = useI18n();
  const log = useQuery({ queryKey: ["decision-log"], queryFn: () => listDecisionLog() });
  const rows = (log.data ?? []) as DecisionRow[];

  function exportCsv() {
    const cols: ColumnDef<DecisionRow>[] = [
      { key: "created_at", label: t.date, format: (r) => new Date(r.created_at).toLocaleString() },
      { key: "product", label: t.product, format: (r) => r.recommendations?.products ? pickName(r.recommendations.products, lang) : "" },
      { key: "action_text", label: t.action, format: (r) => r.recommendations ? (lang === "ar" ? r.recommendations.action_ar : r.recommendations.action_en) : "" },
      { key: "status", label: t.status },
      { key: "notes", label: t.notes },
    ];
    downloadCsv(`ai-eos-decisions-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(rows, cols));
  }

  async function exportPdf() {
    const cols: ColumnDef<DecisionRow>[] = [
      { key: "created_at", label: t.date, format: (r) => new Date(r.created_at).toLocaleString() },
      { key: "product", label: t.product, format: (r) => r.recommendations?.products ? pickName(r.recommendations.products, lang) : "" },
      { key: "action_text", label: t.action, format: (r) => r.recommendations ? (lang === "ar" ? r.recommendations.action_ar : r.recommendations.action_en) : "" },
      { key: "status", label: t.status },
      { key: "notes", label: t.notes },
    ];
    await rowsToPdf(`ai-eos-decisions-${new Date().toISOString().slice(0, 10)}.pdf`, "AI-EOS · Decisions Log", rows, cols, { subtitle: new Date().toLocaleString() });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.nav_decisions}</h1>
        {rows.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={exportCsv}>
              <Download className="h-4 w-4" /> {t.export_csv}
            </button>
            <button className="btn-ghost" onClick={exportPdf}>
              <Download className="h-4 w-4" /> {t.export_pdf}
            </button>
          </div>
        )}
      </div>
      <div className="card-panel p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-start py-2">{t.date}</th>
                <th className="text-start">{t.product}</th>
                <th className="text-start">{t.action}</th>
                <th className="text-start">{t.status}</th>
                <th className="text-start">{t.notes}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const r = d.recommendations;
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                    <td>{r?.products ? pickName(r.products, lang) : "—"}</td>
                    <td>
                      {r ? (lang === "ar" ? r.action_ar : r.action_en) : d.action}
                    </td>
                    <td>
                      <span className={
                        d.action === "accepted" ? "text-success" :
                        d.action === "rejected" ? "text-destructive" :
                        "text-muted-foreground"
                      }>{d.action}</span>
                    </td>
                    <td className="text-xs text-muted-foreground">{d.notes ?? "—"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">{t.no_data}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
