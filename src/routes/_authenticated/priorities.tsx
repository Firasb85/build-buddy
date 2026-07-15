import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLatestPPS, runPPS, getObjective, setObjective } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { RefreshCw, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/priorities")({
  component: PrioritiesPage,
});

const OBJS = ["default", "maximize_profit", "maximize_service", "reduce_inventory", "protect_cash"] as const;

function PrioritiesPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const pps = useQuery({ queryKey: ["pps-latest"], queryFn: () => getLatestPPS() });
  const obj = useQuery({ queryKey: ["objective"], queryFn: () => getObjective() });

  const compute = useMutation({
    mutationFn: () => runPPS(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pps-latest"] }),
  });
  const changeObj = useMutation({
    mutationFn: (o: (typeof OBJS)[number]) => setObjective({ objective: o }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["objective"] });
      await runPPS();
      qc.invalidateQueries({ queryKey: ["pps-latest"] });
    },
  });

  const rows = pps.data?.rows ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.nav_priorities}</h1>
        <button className="btn-primary" onClick={() => compute.mutate()} disabled={compute.isPending}>
          <RefreshCw className={"h-4 w-4 " + (compute.isPending ? "animate-spin" : "")} />
          {compute.isPending ? t.computing : t.recompute}
        </button>
      </div>

      <div className="card-panel p-5">
        <div className="text-sm font-semibold mb-3">{t.objective}</div>
        <div className="flex flex-wrap gap-2">
          {OBJS.map((o) => {
            const active = obj.data?.objective === o;
            return (
              <button
                key={o}
                onClick={() => changeObj.mutate(o)}
                disabled={changeObj.isPending}
                className={
                  "rounded-md border px-3 py-2 text-sm transition " +
                  (active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground")
                }
              >
                {t[`obj_${o}` as keyof typeof t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-panel p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-start py-2">{t.product}</th>
                <th className="text-end">{t.pps}</th>
                <th className="text-end hidden md:table-cell">{t.stockout_risk}</th>
                <th className="text-end hidden md:table-cell">{t.profit_impact}</th>
                <th className="text-end hidden md:table-cell">{t.customer_importance}</th>
                <th className="text-end hidden lg:table-cell">{t.line_efficiency}</th>
                <th className="text-end hidden lg:table-cell">{t.material_readiness}</th>
                <th className="text-end hidden lg:table-cell">{t.strategic_weight}</th>
                <th className="text-end">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.product;
                return (
                  <tr key={r.product_id} className="border-t border-border">
                    <td className="py-3">
                      <div className="font-medium">{p ? pickName(p, lang) : "—"}</div>
                      <div className="text-xs text-muted-foreground">{p?.sku}</div>
                    </td>
                    <td className="text-end font-semibold tabular-nums">{r.pps.toFixed(0)}</td>
                    <td className="text-end hidden md:table-cell tabular-nums">{r.components.stockout_risk.toFixed(0)}</td>
                    <td className="text-end hidden md:table-cell tabular-nums">{r.components.profit_impact.toFixed(0)}</td>
                    <td className="text-end hidden md:table-cell tabular-nums">{r.components.customer_importance.toFixed(0)}</td>
                    <td className="text-end hidden lg:table-cell tabular-nums">{r.components.line_efficiency.toFixed(0)}</td>
                    <td className="text-end hidden lg:table-cell tabular-nums">{r.components.material_readiness.toFixed(0)}</td>
                    <td className="text-end hidden lg:table-cell tabular-nums">{r.components.strategic_weight.toFixed(0)}</td>
                    <td className="text-end">
                      {r.constraint_status === "constrained" ? (
                        <span className="inline-flex items-center gap-1 text-warning text-xs">
                          <AlertTriangle className="h-3 w-3" /> {t.constraint_blocked}
                        </span>
                      ) : (
                        <span className="text-success text-xs">{t.constraint_ok}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    {t.no_data}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
