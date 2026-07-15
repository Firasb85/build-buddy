import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { listCustomers, saveCustomer, deleteCustomer } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { EntityDrawer, PageHeader, type DrawerField } from "@/components/entity-drawer";
import { useEntityList } from "@/hooks/use-entity-list";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

interface Customer {
  id: string;
  name_ar: string;
  name_en: string;
  importance: number;
  annual_value: number;
  churn_risk: number;
}

function CustomersPage() {
  const { t, lang } = useI18n();
  const { save, remove, filtered, search, setSearch } = useEntityList<Customer>({
    queryKey: ["customers"],
    listFn: listCustomers,
    saveFn: saveCustomer,
    deleteFn: deleteCustomer,
  });
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);

  const fields: DrawerField[] = [
    { key: "name_ar", label: t.field_name_ar, type: "text", required: true },
    { key: "name_en", label: t.field_name_en, type: "text", required: true },
    { key: "importance", label: t.field_importance, type: "number", step: 1, min: 1, max: 10 },
    { key: "annual_value", label: t.field_annual_value, type: "number", step: 100, min: 0 },
    { key: "churn_risk", label: t.field_churn_risk, type: "number", step: 0.01, min: 0, max: 1 },
  ];

  function toForm(c: Customer) {
    return {
      name_ar: c.name_ar, name_en: c.name_en,
      importance: Number(c.importance), annual_value: Number(c.annual_value), churn_risk: Number(c.churn_risk),
    };
  }
  function fromForm(f: Record<string, string | number | boolean | null>) {
    return {
      id: editing?.id ?? undefined,
      name_ar: String(f.name_ar), name_en: String(f.name_en),
      importance: Number(f.importance), annual_value: Number(f.annual_value),
      churn_risk: Number(f.churn_risk),
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav_customers_crud}
        actions={
          <div className="flex items-center gap-2">
            <input className="input-field !w-56" placeholder={t.search}
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> {t.add_entity}
            </button>
          </div>
        }
      />
      <div className="card-panel p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-start py-3 px-4">{t.customer}</th>
                <th className="text-end">{t.field_importance}</th>
                <th className="text-end">{t.field_annual_value}</th>
                <th className="text-end">{t.field_churn_risk}</th>
                <th className="text-end px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-surface-2/40">
                  <td className="py-3 px-4 font-medium">{pickName(c, lang)}</td>
                  <td className="text-end tabular-nums">{c.importance}/10</td>
                  <td className="text-end tabular-nums">{Number(c.annual_value).toLocaleString()}</td>
                  <td className={"text-end tabular-nums " + (Number(c.churn_risk) > 0.2 ? "text-warning" : "")}>
                    {(Number(c.churn_risk) * 100).toFixed(0)}%
                  </td>
                  <td className="text-end px-4">
                    <div className="inline-flex gap-1">
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
                        onClick={() => { setEditing(c); setOpen(true); }}><Edit className="h-3.5 w-3.5" /></button>
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-destructive/10 text-destructive"
                        onClick={() => { if (confirm(t.confirm_delete_msg)) remove.mutate(c.id); }}>
                        <Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">{t.no_results}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <EntityDrawer
        open={open} onClose={() => setOpen(false)} title={editing ? t.edit_entity : t.add_entity}
        fields={fields} toForm={toForm} fromForm={fromForm} initial={editing}
        saving={save.isPending} deleting={remove.isPending}
        onSave={(payload) => save.mutate(payload as Parameters<typeof save.mutate>[0], { onSuccess: () => setOpen(false) })}
        onDelete={(id) => remove.mutate(id, { onSuccess: () => setOpen(false) })}
      />
    </div>
  );
}
