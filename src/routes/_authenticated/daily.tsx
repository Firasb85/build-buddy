import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listProducts, listLines, submitDailyEntry, listRecentDailyEntries } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { useState } from "react";
import { ClipboardEdit } from "lucide-react";

export const Route = createFileRoute("/_authenticated/daily")({
  component: DailyPage,
});

function DailyPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const lines = useQuery({ queryKey: ["lines"], queryFn: () => listLines() });
  const entries = useQuery({ queryKey: ["daily-entries"], queryFn: () => listRecentDailyEntries() });

  const [productId, setProductId] = useState("");
  const [lineId, setLineId] = useState("");
  const [produced, setProduced] = useState("0");
  const [shipped, setShipped] = useState("0");
  const [received, setReceived] = useState("0");
  const [notes, setNotes] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      submitDailyEntry({
        entry_date: new Date().toISOString().slice(0, 10),
        product_id: productId,
        line_id: lineId || null,
        produced: Number(produced),
        shipped: Number(shipped),
        received_material_qty: Number(received),
        notes: notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-entries"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setSavedOk(true);
      setProduced("0"); setShipped("0"); setReceived("0"); setNotes("");
      setTimeout(() => setSavedOk(false), 2000);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardEdit className="h-6 w-6 text-primary" /> {t.daily_title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.daily_desc}</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (productId) submit.mutate(); }}
        className="card-panel p-6 grid gap-4 md:grid-cols-2"
      >
        <div>
          <label className="label-text">{t.product}</label>
          <select className="input-field" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">—</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{pickName(p, lang)} · {p.sku}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-text">{t.line}</label>
          <select className="input-field" value={lineId} onChange={(e) => setLineId(e.target.value)}>
            <option value="">—</option>
            {(lines.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>{pickName(l, lang)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-text">{t.produced}</label>
          <input className="input-field tabular-nums" type="number" min={0} value={produced} onChange={(e) => setProduced(e.target.value)} />
        </div>
        <div>
          <label className="label-text">{t.shipped}</label>
          <input className="input-field tabular-nums" type="number" min={0} value={shipped} onChange={(e) => setShipped(e.target.value)} />
        </div>
        <div>
          <label className="label-text">{t.received_material}</label>
          <input className="input-field tabular-nums" type="number" min={0} value={received} onChange={(e) => setReceived(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label-text">{t.notes}</label>
          <textarea className="input-field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="md:col-span-2 flex items-center gap-3">
          <button className="btn-primary" disabled={submit.isPending || !productId}>
            {submit.isPending ? t.saving : t.submit_entry}
          </button>
          {savedOk && <span className="text-success text-sm">✓ {t.entry_saved}</span>}
          {submit.error && <span className="text-destructive text-sm">{(submit.error as Error).message}</span>}
        </div>
      </form>

      <div className="card-panel p-5">
        <h2 className="text-sm font-semibold mb-3">{t.date} · {t.nav_daily}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-start py-2">{t.date}</th>
                <th className="text-start">{t.product}</th>
                <th className="text-start hidden md:table-cell">{t.line}</th>
                <th className="text-end">{t.produced}</th>
                <th className="text-end">{t.shipped}</th>
              </tr>
            </thead>
            <tbody>
              {(entries.data ?? []).map((e) => {
                const p = (e as { products?: { name_ar: string; name_en: string } }).products;
                const l = (e as { production_lines?: { name_ar: string; name_en: string } }).production_lines;
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="py-2 tabular-nums">{e.entry_date}</td>
                    <td>{p ? pickName(p, lang) : ""}</td>
                    <td className="hidden md:table-cell text-muted-foreground">{l ? pickName(l, lang) : "—"}</td>
                    <td className="text-end tabular-nums">{Number(e.produced)}</td>
                    <td className="text-end tabular-nums">{Number(e.shipped)}</td>
                  </tr>
                );
              })}
              {(entries.data ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">{t.no_data}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
