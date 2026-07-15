import { createFileRoute } from "@tanstack/react-router";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { useQuery } from "@tanstack/react-query";
import { listProducts, listMaterials, listLines, listCustomers, listOrders } from "@/lib/factory.functions";
import { Package, Boxes, Factory, Users, ShoppingCart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/factory")({
  component: FactoryPage,
});

function FactoryPage() {
  const { t, lang } = useI18n();
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const materials = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });
  const lines = useQuery({ queryKey: ["lines"], queryFn: () => listLines() });
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => listCustomers() });
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => listOrders() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.nav_factory}</h1>
        <p className="text-sm text-muted-foreground">{t.factory_desc}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Package} label={t.products} value={products.data?.length ?? 0} />
        <StatCard icon={Boxes} label={t.materials} value={materials.data?.length ?? 0} />
        <StatCard icon={Factory} label={t.lines} value={lines.data?.length ?? 0} />
        <StatCard icon={Users} label={t.customers} value={customers.data?.length ?? 0} />
        <StatCard icon={ShoppingCart} label={t.orders} value={orders.data?.length ?? 0} />
      </div>

      <Panel title={t.products}>
        <TableRows
          rows={(products.data ?? []).map((p) => ({
            id: p.id,
            cols: [
              pickName(p, lang),
              p.sku,
              <span className="tabular-nums">{Number(p.stock_qty)}</span>,
              <span className="tabular-nums">{Number(p.daily_demand)}</span>,
              <span className="tabular-nums">{(Number(p.margin_pct) * 100).toFixed(0)}%</span>,
            ],
          }))}
          headers={[t.product, "SKU", t.stock, t.demand, t.margin]}
        />
      </Panel>

      <Panel title={t.materials}>
        <TableRows
          rows={(materials.data ?? []).map((m) => ({
            id: m.id,
            cols: [
              pickName(m, lang),
              <span className="tabular-nums">{Number(m.stock_qty)} {m.unit}</span>,
              <span className="tabular-nums">{m.lead_time_days}d</span>,
            ],
          }))}
          headers={[t.material, t.stock, t.lead_time]}
        />
      </Panel>

      <Panel title={t.lines}>
        <TableRows
          rows={(lines.data ?? []).map((l) => ({
            id: l.id,
            cols: [
              pickName(l, lang),
              <span className="tabular-nums">{(Number(l.quality_factor) * 100).toFixed(0)}%</span>,
              <span className="tabular-nums">{Number(l.capacity_per_hour)}/h</span>,
              <span className={l.status === "running" ? "text-success" : "text-warning"}>{l.status}</span>,
            ],
          }))}
          headers={[t.line, t.quality, t.capacity, t.status]}
        />
      </Panel>

      <Panel title={t.customers}>
        <TableRows
          rows={(customers.data ?? []).map((c) => ({
            id: c.id,
            cols: [
              pickName(c, lang),
              <span className="tabular-nums">{c.importance}/10</span>,
              <span className="tabular-nums">{(Number(c.churn_risk) * 100).toFixed(0)}%</span>,
            ],
          }))}
          headers={[t.customer, t.importance, t.churn_risk]}
        />
      </Panel>

      <Panel title={t.orders}>
        <TableRows
          rows={(orders.data ?? []).map((o) => {
            const oo = o as unknown as {
              id: string;
              quantity: number;
              status: string;
              due_date: string | null;
              products?: { name_ar: string; name_en: string };
              customers?: { name_ar: string; name_en: string };
            };
            return {
              id: oo.id,
              cols: [
                oo.customers ? pickName(oo.customers, lang) : "—",
                oo.products ? pickName(oo.products, lang) : "—",
                <span className="tabular-nums">{Number(oo.quantity)}</span>,
                oo.due_date ?? "—",
                oo.status,
              ],
            };
          })}
          headers={[t.customer, t.product, t.quantity, t.due_date, t.status]}
        />
      </Panel>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="card-panel p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value mt-1">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-panel p-5">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function TableRows({ headers, rows }: { headers: string[]; rows: { id: string; cols: ReactNode[] }[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wider text-muted-foreground">
          {headers.map((h, i) => (
            <th key={i} className={i === headers.length - 1 ? "text-end py-2" : "text-start py-2"}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border">
            {r.cols.map((c, i) => (
              <td key={i} className={i === r.cols.length - 1 ? "py-2 text-end" : "py-2"}>{c}</td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={headers.length} className="py-6 text-center text-muted-foreground">—</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
