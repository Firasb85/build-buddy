import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { listMaterials, saveMaterial, deleteMaterial } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { EntityDrawer, PageHeader, type DrawerField } from "@/components/entity-drawer";
import { useEntityList } from "@/hooks/use-entity-list";

export const Route = createFileRoute("/_authenticated/materials")({
  component: MaterialsPage,
});

interface Material {
  id: string;
  name_ar: string;
  name_en: string;
  unit: string;
  stock_qty: number;
  reorder_point: number;
  unit_cost: number;
  lead_time_days: number;
}

function MaterialsPage() {
  const { t, lang } = useI18n();
  const { save, remove, filtered, search, setSearch } = useEntityList<Material>({
    queryKey: ["materials"],
    listFn: listMaterials,
    saveFn: saveMaterial,
    deleteFn: deleteMaterial,
  });
  const [editing, setEditing] = useState<Material | null>(null);
  const [open, setOpen] = useState(false);

  const fields: DrawerField[] = [
    { key: "name_ar", label: t.field_name_ar, type: "text", required: true },
    { key: "name_en", label: t.field_name_en, type: "text", required: true },
    { key: "unit", label: t.field_unit, type: "text", required: true },
    { key: "stock_qty", label: t.field_stock_qty, type: "number", step: 1, min: 0 },
    { key: "reorder_point", label: t.field_reorder_point, type: "number", step: 1, min: 0 },
    { key: "unit_cost", label: t.field_unit_cost, type: "number", step: 0.01, min: 0 },
    { key: "lead_time_days", label: t.field_lead_time, type: "number", step: 1, min: 0 },
  ];

  function toForm(m: Material) {
    return {
      name_ar: m.name_ar, name_en: m.name_en, unit: m.unit,
      stock_qty: Number(m.stock_qty), reorder_point: Number(m.reorder_point),
      unit_cost: Number(m.unit_cost), lead_time_days: Number(m.lead_time_days),
    };
  }
  function fromForm(f: Record<string, string | number | boolean | null>) {
    return {
      id: editing?.id ?? undefined,
      name_ar: String(f.name_ar), name_en: String(f.name_en), unit: String(f.unit),
      stock_qty: Number(f.stock_qty), reorder_point: Number(f.reorder_point),
      unit_cost: Number(f.unit_cost), lead_time_days: Number(f.lead_time_days),
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav_materials_crud}
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
                <th className="text-start py-3 px-4">{t.product}</th>
                <th className="text-start">{t.field_unit}</th>
                <th className="text-end">{t.field_stock_qty}</th>
                <th className="text-end">{t.field_reorder_point}</th>
                <th className="text-end">{t.field_unit_cost}</th>
                <th className="text-end">{t.field_lead_time}</th>
                <th className="text-end px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-border/50 hover:bg-surface-2/40">
                  <td className="py-3 px-4 font-medium">{pickName(m, lang)}</td>
                  <td className="text-muted-foreground">{m.unit}</td>
                  <td className={"text-end tabular-nums " + (Number(m.stock_qty) < Number(m.reorder_point) ? "text-destructive" : "")}>
                    {Number(m.stock_qty)}
                  </td>
                  <td className="text-end tabular-nums">{Number(m.reorder_point)}</td>
                  <td className="text-end tabular-nums">{Number(m.unit_cost).toFixed(2)}</td>
                  <td className="text-end tabular-nums">{m.lead_time_days}d</td>
                  <td className="text-end px-4">
                    <div className="inline-flex gap-1">
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
                        onClick={() => { setEditing(m); setOpen(true); }}><Edit className="h-3.5 w-3.5" /></button>
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-destructive/10 text-destructive"
                        onClick={() => { if (confirm(t.confirm_delete_msg)) remove.mutate(m.id); }}>
                        <Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">{t.no_results}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <EntityDrawer
        open={open} onClose={() => setOpen(false)} title={editing ? `${t.edit_entity}` : t.add_entity}
        fields={fields} toForm={toForm} fromForm={fromForm} initial={editing}
        saving={save.isPending} deleting={remove.isPending}
        onSave={(payload) => save.mutate(payload as Parameters<typeof save.mutate>[0], { onSuccess: () => setOpen(false) })}
        onDelete={(id) => remove.mutate(id, { onSuccess: () => setOpen(false) })}
      />
    </div>
  );
}
