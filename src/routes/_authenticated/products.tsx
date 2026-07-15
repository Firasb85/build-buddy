import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Edit, Trash2 } from "lucide-react";
import { listProducts, listLines, saveProduct, deleteProduct } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { EntityDrawer, PageHeader, type DrawerField } from "@/components/entity-drawer";
import { useEntityList } from "@/hooks/use-entity-list";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

interface Product {
  id: string;
  sku: string;
  name_ar: string;
  name_en: string;
  daily_demand: number;
  margin_pct: number;
  stability: number;
  shelf_life_days: number | null;
  moq: number;
  strategic_weight: number;
  stock_qty: number;
  preferred_line_id: string | null;
  active: boolean;
  production_lines?: { name_ar: string; name_en: string } | null;
}

function ProductsPage() {
  const { t, lang } = useI18n();
  const { query, save, remove, filtered, search, setSearch } = useEntityList<Product>({
    queryKey: ["products"],
    listFn: listProducts,
    saveFn: saveProduct,
    deleteFn: deleteProduct,
  });
  const linesData = useQuery({ queryKey: ["lines"], queryFn: () => listLines() });
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const fields: DrawerField[] = [
    { key: "sku", label: t.field_sku, type: "text", required: true },
    { key: "name_ar", label: t.field_name_ar, type: "text", required: true },
    { key: "name_en", label: t.field_name_en, type: "text", required: true },
    { key: "daily_demand", label: t.field_daily_demand, type: "number", step: 1, min: 0 },
    { key: "margin_pct", label: t.field_margin_pct, type: "number", step: 0.01, min: 0, max: 1 },
    { key: "stability", label: t.field_stability, type: "number", step: 0.01, min: 0, max: 1 },
    { key: "shelf_life_days", label: t.field_shelf_life, type: "number", step: 1, min: 0 },
    { key: "moq", label: t.field_moq, type: "number", step: 1, min: 0 },
    { key: "strategic_weight", label: t.field_strategic_weight, type: "number", step: 1, min: 1, max: 10 },
    { key: "stock_qty", label: t.field_stock_qty, type: "number", step: 1, min: 0 },
    {
      key: "preferred_line_id", label: t.field_preferred_line, type: "select",
      options: ((linesData.data ?? []) as Array<{ id: string; name_ar: string; name_en: string }>).map((l) => ({ value: l.id, label: pickName(l, lang) })),
    },
    {
      key: "active", label: t.field_active, type: "select",
      options: [{ value: "true", label: t.yes }, { value: "false", label: t.no }],
    },
  ];

  function toForm(p: Product) {
    return {
      sku: p.sku,
      name_ar: p.name_ar,
      name_en: p.name_en,
      daily_demand: Number(p.daily_demand),
      margin_pct: Number(p.margin_pct),
      stability: Number(p.stability),
      shelf_life_days: p.shelf_life_days ?? null,
      moq: Number(p.moq),
      strategic_weight: Number(p.strategic_weight),
      stock_qty: Number(p.stock_qty),
      preferred_line_id: p.preferred_line_id ?? "",
      active: p.active,
    };
  }
  function fromForm(f: Record<string, string | number | boolean | null>) {
    return {
      id: editing?.id ?? undefined,
      sku: String(f.sku),
      name_ar: String(f.name_ar),
      name_en: String(f.name_en),
      daily_demand: Number(f.daily_demand),
      margin_pct: Number(f.margin_pct),
      stability: Number(f.stability),
      shelf_life_days: f.shelf_life_days == null || f.shelf_life_days === "" ? null : Number(f.shelf_life_days),
      moq: Number(f.moq),
      strategic_weight: Number(f.strategic_weight),
      stock_qty: Number(f.stock_qty),
      preferred_line_id: f.preferred_line_id === "" ? null : String(f.preferred_line_id),
      active: f.active === true || f.active === "true",
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav_products_crud}
        subtitle={t.products}
        actions={
          <div className="flex items-center gap-2">
            <input
              className="input-field !w-56"
              placeholder={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="btn-primary"
              onClick={() => { setEditing(null); setOpen(true); }}
            >
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
                <th className="text-start py-3 px-4">{t.field_sku}</th>
                <th className="text-start">{t.product}</th>
                <th className="text-end">{t.field_daily_demand}</th>
                <th className="text-end">{t.field_stock_qty}</th>
                <th className="text-end">{t.field_margin_pct}</th>
                <th className="text-end">{t.field_strategic_weight}</th>
                <th className="text-start">{t.line}</th>
                <th className="text-end">{t.field_active}</th>
                <th className="text-end px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-surface-2/40">
                  <td className="py-3 px-4 font-mono text-xs">{p.sku}</td>
                  <td>
                    <div className="font-medium">{pickName(p, lang)}</div>
                  </td>
                  <td className="text-end tabular-nums">{Number(p.daily_demand)}</td>
                  <td className="text-end tabular-nums">{Number(p.stock_qty)}</td>
                  <td className="text-end tabular-nums">{(Number(p.margin_pct) * 100).toFixed(0)}%</td>
                  <td className="text-end tabular-nums">{p.strategic_weight}/10</td>
                  <td className="text-muted-foreground">
                    {p.production_lines ? pickName(p.production_lines, lang) : "—"}
                  </td>
                  <td className="text-end">
                    {p.active ? <span className="text-success text-xs">●</span> : <span className="text-muted-foreground text-xs">○</span>}
                  </td>
                  <td className="text-end px-4">
                    <div className="inline-flex gap-1">
                      <button
                        className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
                        onClick={() => { setEditing(p); setOpen(true); }}
                        title={t.edit_entity}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="grid h-7 w-7 place-items-center rounded-md hover:bg-destructive/10 text-destructive"
                        onClick={() => { if (confirm(t.confirm_delete_msg)) remove.mutate(p.id); }}
                        title={t.delete_entity}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">{t.no_results}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EntityDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${t.edit_entity} — ${pickName(editing, lang)}` : t.add_entity}
        fields={fields}
        toForm={toForm}
        fromForm={fromForm}
        initial={editing}
        saving={save.isPending}
        deleting={remove.isPending}
        onSave={(payload) => {
          save.mutate(payload as Parameters<typeof save.mutate>[0], { onSuccess: () => setOpen(false) });
        }}
        onDelete={(id) => {
          remove.mutate(id, { onSuccess: () => setOpen(false) });
        }}
      />
    </div>
  );
}
