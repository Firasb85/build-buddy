import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { listLines, saveLine, deleteLine } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { EntityDrawer, PageHeader, type DrawerField } from "@/components/entity-drawer";
import { useEntityList } from "@/hooks/use-entity-list";

export const Route = createFileRoute("/_authenticated/lines")({
  component: LinesPage,
});

interface Line {
  id: string;
  name_ar: string;
  name_en: string;
  capacity_per_hour: number;
  status: string;
  quality_factor: number;
}

const STATUS_OPTIONS = ["running", "setup", "idle", "broken", "maintenance"] as const;

function LinesPage() {
  const { t, lang } = useI18n();
  const { save, remove, filtered, search, setSearch } = useEntityList<Line>({
    queryKey: ["lines"],
    listFn: listLines,
    saveFn: saveLine,
    deleteFn: deleteLine,
  });
  const [editing, setEditing] = useState<Line | null>(null);
  const [open, setOpen] = useState(false);

  const fields: DrawerField[] = [
    { key: "name_ar", label: t.field_name_ar, type: "text", required: true },
    { key: "name_en", label: t.field_name_en, type: "text", required: true },
    { key: "capacity_per_hour", label: t.field_capacity, type: "number", step: 1, min: 0 },
    { key: "quality_factor", label: t.field_quality_factor, type: "number", step: 0.01, min: 0, max: 1 },
    {
      key: "status", label: t.field_status, type: "select",
      options: STATUS_OPTIONS.map((s) => ({ value: s, label: t[`line_status_${s}`] })),
    },
  ];

  function toForm(l: Line) {
    return {
      name_ar: l.name_ar, name_en: l.name_en,
      capacity_per_hour: Number(l.capacity_per_hour),
      quality_factor: Number(l.quality_factor),
      status: l.status,
    };
  }
  function fromForm(f: Record<string, string | number | boolean | null>) {
    return {
      id: editing?.id ?? undefined,
      name_ar: String(f.name_ar), name_en: String(f.name_en),
      capacity_per_hour: Number(f.capacity_per_hour),
      quality_factor: Number(f.quality_factor),
      status: String(f.status) as Line["status"],
    };
  }

  const statusColor = (s: string) =>
    s === "running" ? "text-success" :
    s === "broken" ? "text-destructive" :
    s === "maintenance" ? "text-warning" :
    "text-muted-foreground";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav_lines_crud}
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
                <th className="text-start py-3 px-4">{t.line}</th>
                <th className="text-end">{t.field_capacity}</th>
                <th className="text-end">{t.field_quality_factor}</th>
                <th className="text-start">{t.field_status}</th>
                <th className="text-end px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-border/50 hover:bg-surface-2/40">
                  <td className="py-3 px-4 font-medium">{pickName(l, lang)}</td>
                  <td className="text-end tabular-nums">{Number(l.capacity_per_hour)}/h</td>
                  <td className="text-end tabular-nums">{(Number(l.quality_factor) * 100).toFixed(0)}%</td>
                  <td className={"text-xs " + statusColor(l.status)}>{t[`line_status_${l.status}`] ?? l.status}</td>
                  <td className="text-end px-4">
                    <div className="inline-flex gap-1">
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
                        onClick={() => { setEditing(l); setOpen(true); }}><Edit className="h-3.5 w-3.5" /></button>
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-destructive/10 text-destructive"
                        onClick={() => { if (confirm(t.confirm_delete_msg)) remove.mutate(l.id); }}>
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
