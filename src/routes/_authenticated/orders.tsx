import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Edit, Trash2 } from "lucide-react";
import { listOrders, listProducts, listCustomers, saveOrder, deleteOrder } from "@/lib/factory.functions";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { EntityDrawer, PageHeader, type DrawerField } from "@/components/entity-drawer";
import { useEntityList } from "@/hooks/use-entity-list";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

interface Order {
  id: string;
  customer_id: string;
  product_id: string;
  quantity: number;
  due_date: string;
  status: string;
  customers?: { name_ar: string; name_en: string } | null;
  products?: { name_ar: string; name_en: string; sku: string } | null;
}

const STATUS_OPTIONS = ["received", "reviewing", "approved", "in_progress", "completed", "cancelled"] as const;

function OrdersPage() {
  const { t, lang } = useI18n();
  const { save, remove, filtered, search, setSearch } = useEntityList<Order>({
    queryKey: ["orders"],
    listFn: listOrders,
    saveFn: saveOrder,
    deleteFn: deleteOrder,
  });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const customersQ = useQuery({ queryKey: ["customers"], queryFn: () => listCustomers() });
  const [editing, setEditing] = useState<Order | null>(null);
  const [open, setOpen] = useState(false);

  const fields: DrawerField[] = [
    {
      key: "customer_id", label: t.field_customer, type: "select", required: true,
      options: ((customersQ.data ?? []) as Array<{ id: string; name_ar: string; name_en: string }>).map((c) => ({ value: c.id, label: pickName(c, lang) })),
    },
    {
      key: "product_id", label: t.field_product, type: "select", required: true,
      options: ((productsQ.data ?? []) as Array<{ id: string; name_ar: string; name_en: string; sku: string }>).map((p) => ({ value: p.id, label: `${pickName(p, lang)} · ${p.sku}` })),
    },
    { key: "quantity", label: t.field_quantity, type: "number", step: 1, min: 1, required: true },
    { key: "due_date", label: t.field_due_date, type: "text", required: true, hint: "YYYY-MM-DD" },
    {
      key: "status", label: t.field_status, type: "select",
      options: STATUS_OPTIONS.map((s) => ({ value: s, label: t[`order_status_${s}`] })),
    },
  ];

  function toForm(o: Order) {
    return {
      customer_id: o.customer_id, product_id: o.product_id,
      quantity: Number(o.quantity), due_date: o.due_date, status: o.status,
    };
  }
  function fromForm(f: Record<string, string | number | boolean | null>) {
    return {
      id: editing?.id ?? undefined,
      customer_id: String(f.customer_id),
      product_id: String(f.product_id),
      quantity: Number(f.quantity),
      due_date: String(f.due_date),
      status: String(f.status) as Order["status"],
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav_orders_crud}
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
                <th className="text-start">{t.product}</th>
                <th className="text-end">{t.field_quantity}</th>
                <th className="text-end">{t.field_due_date}</th>
                <th className="text-start">{t.field_status}</th>
                <th className="text-end px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2/40">
                  <td className="py-3 px-4">{o.customers ? pickName(o.customers, lang) : "—"}</td>
                  <td>{o.products ? pickName(o.products, lang) : "—"}</td>
                  <td className="text-end tabular-nums">{Number(o.quantity)}</td>
                  <td className="text-end tabular-nums">{o.due_date}</td>
                  <td className="text-xs">{t[`order_status_${o.status}`] ?? o.status}</td>
                  <td className="text-end px-4">
                    <div className="inline-flex gap-1">
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
                        onClick={() => { setEditing(o); setOpen(true); }}><Edit className="h-3.5 w-3.5" /></button>
                      <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-destructive/10 text-destructive"
                        onClick={() => { if (confirm(t.confirm_delete_msg)) remove.mutate(o.id); }}>
                        <Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">{t.no_results}</td></tr>
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
