import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { runSimulationHandler, listSimulationRuns, listProducts, listLines, listMaterials } from "@/lib/local-api";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { Beaker, Play, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/simulate")({
  component: SimulatePage,
});

function SimulatePage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const lines = useQuery({ queryKey: ["lines"], queryFn: () => listLines() });
  const materials = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });
  const recent = useQuery({ queryKey: ["sim-recent"], queryFn: () => listSimulationRuns() });

  const [horizon, setHorizon] = useState(14);
  const [cashInject, setCashInject] = useState(0);
  const [shiftMult, setShiftMult] = useState(1);
  const [lineOut, setLineOut] = useState<string>("");
  const [demandDeltas, setDemandDeltas] = useState<Record<string, number>>({});
  const [prodDeltas, setProdDeltas] = useState<Record<string, number>>({});

  const compute = useMutation({
    mutationFn: () =>
      runSimulationHandler({
        params: {
          product_demand_delta_pct: demandDeltas,
          product_production_delta_pct: prodDeltas,
          line_capacity_delta_pct: {},
          material_cost_delta_pct: {},
          material_stock_delta: {},
          cash_inject: cashInject,
          line_out: lineOut || null,
          shift_multiplier: shiftMult,
          horizon_days: horizon,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sim-recent"] }),
  });

  const impact = compute.data;
  const productList = (products.data ?? []) as Array<{ id: string; name_ar: string; name_en: string; daily_demand: number; stock_qty: number }>;
  const lineList = (lines.data ?? []) as Array<{ id: string; name_ar: string; name_en: string; status: string }>;
  const materialList = (materials.data ?? []) as Array<{ id: string; name_ar: string; name_en: string; stock_qty: number; reorder_point: number }>;

  const hasChanges = useMemo(() => {
    return Object.keys(demandDeltas).length > 0 || Object.keys(prodDeltas).length > 0 ||
      cashInject !== 0 || shiftMult !== 1 || lineOut !== "";
  }, [demandDeltas, prodDeltas, cashInject, shiftMult, lineOut]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Beaker className="h-6 w-6 text-primary" />
          {t.simulate_title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.simulate_desc}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card-panel p-5 space-y-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">{t.sim_horizon} · {t.settings_objective}</h2>
          <div>
            <label className="label-text">{t.sim_horizon}</label>
            <input className="input-field tabular-nums" type="number" min={1} max={365} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
          </div>
          <div>
            <label className="label-text">{t.sim_shift}</label>
            <select className="input-field" value={shiftMult} onChange={(e) => setShiftMult(Number(e.target.value))}>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x (وردية إضافية)</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x (ليل + نهار)</option>
              <option value={0.5}>0.5x (نصف وردية)</option>
            </select>
          </div>
          <div>
            <label className="label-text">{t.sim_cash_inject}</label>
            <input className="input-field tabular-nums" type="number" value={cashInject} onChange={(e) => setCashInject(Number(e.target.value))} />
          </div>
          <div>
            <label className="label-text">{t.sim_line_out}</label>
            <select className="input-field" value={lineOut} onChange={(e) => setLineOut(e.target.value)}>
              <option value="">{t.sim_line_out_none}</option>
              {lineList.map((l) => (
                <option key={l.id} value={l.id}>{pickName(l, lang)}</option>
              ))}
            </select>
          </div>
          <button
            className="btn-primary w-full"
            disabled={compute.isPending || !hasChanges}
            onClick={() => compute.mutate()}
          >
            <Play className="h-4 w-4" />
            {compute.isPending ? t.computing : t.sim_run}
          </button>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {impact ? <ImpactPanel impact={impact} /> : (
            <div className="card-panel p-8 text-center text-sm text-muted-foreground">
              {hasChanges ? t.sim_run + " →" : t.simulate_desc}
            </div>
          )}
        </div>
      </div>

      <div className="card-panel p-5">
        <h2 className="text-sm font-semibold mb-3">{t.sim_demand_delta} / {t.sim_prod_delta}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-start py-2">{t.product}</th>
                <th className="text-end">{t.demand}</th>
                <th className="text-end">{t.stock}</th>
                <th className="text-end w-32">{t.sim_demand_delta}</th>
                <th className="text-end w-32">{t.sim_prod_delta}</th>
              </tr>
            </thead>
            <tbody>
              {productList.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2">
                    <div className="font-medium">{pickName(p, lang)}</div>
                  </td>
                  <td className="text-end tabular-nums">{Number(p.daily_demand)}</td>
                  <td className="text-end tabular-nums">{Number(p.stock_qty)}</td>
                  <td className="text-end">
                    <input
                      type="number"
                      className="input-field !py-1 !px-2 text-end tabular-nums w-24"
                      value={demandDeltas[p.id] ?? 0}
                      onChange={(e) => setDemandDeltas((d) => ({ ...d, [p.id]: Number(e.target.value) }))}
                    />
                  </td>
                  <td className="text-end">
                    <input
                      type="number"
                      className="input-field !py-1 !px-2 text-end tabular-nums w-24"
                      value={prodDeltas[p.id] ?? 0}
                      onChange={(e) => setProdDeltas((d) => ({ ...d, [p.id]: Number(e.target.value) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t.line} · {lineList.length} ({t.lines}) · {t.materials} · {materialList.length}
        </p>
      </div>

      {(recent.data ?? []).length > 0 && (
        <div className="card-panel p-5">
          <h2 className="text-sm font-semibold mb-3">{t.sim_recent_runs}</h2>
          <div className="space-y-2">
            {((recent.data ?? []) as unknown as Array<{ id: string; created_at: string; result: { delta?: { daily_profit?: number } } }>).map((r) => {
              const profit = r.result?.delta?.daily_profit ?? 0;
              return (
                <div key={r.id} className="flex items-center justify-between text-xs border-b border-border pb-2 last:border-b-0">
                  <span className="text-muted-foreground tabular-nums">{new Date(r.created_at).toLocaleString()}</span>
                  <span className="tabular-nums">Δ profit: <span className={profit >= 0 ? "text-success" : "text-destructive"}>{profit.toFixed(0)}</span></span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ImpactPanel({ impact }: { impact: import("@/lib/simulate.server").SimImpact }) {
  const { t } = useI18n();
  const fmt = (n: number) => `${n.toFixed(0)}`;
  const pctSign = (n: number) => n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`;
  const profitDelta = impact.baseline.daily_profit !== 0
    ? (impact.delta.daily_profit / Math.max(1, Math.abs(impact.baseline.daily_profit))) * 100
    : 0;
  return (
    <>
      <div className="card-panel p-5">
        <h2 className="text-sm font-semibold mb-3">{t.sim_baseline} → {t.sim_simulated}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t.sim_daily_revenue} base={impact.baseline.daily_revenue} new={impact.simulated.daily_revenue} delta={impact.delta.daily_revenue} fmt={fmt} />
          <Metric label={t.sim_daily_profit} base={impact.baseline.daily_profit} new={impact.simulated.daily_profit} delta={impact.delta.daily_profit} fmt={fmt} pctDelta={pctSign(profitDelta)} />
          <Metric label={t.sim_inventory_value} base={impact.baseline.inventory_value} new={impact.simulated.inventory_value} delta={impact.delta.inventory_value} fmt={fmt} />
          <Metric label={t.sim_open_orders} base={impact.baseline.open_orders_value} new={impact.simulated.open_orders_value} delta={impact.delta.open_orders_value} fmt={fmt} />
        </div>
      </div>

      {impact.warnings.length > 0 && (
        <div className="card-panel p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" />
            {t.sim_warnings} ({impact.warnings.length})
          </h2>
          <ul className="text-xs space-y-1">
            {impact.warnings.map((w, i) => (
              <li key={i} className="text-muted-foreground">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-panel p-5">
        <h2 className="text-sm font-semibold mb-3">{t.sim_per_product}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-start py-2">{t.product}</th>
                <th className="text-end">{t.demand}</th>
                <th className="text-end">{t.produced}</th>
                <th className="text-end">{t.stock}</th>
                <th className="text-end">{t.sim_stockout_days}</th>
              </tr>
            </thead>
            <tbody>
              {impact.per_product.map((p) => (
                <tr key={p.product_id} className="border-t border-border">
                  <td className="py-2 font-medium">{p.name_en}</td>
                  <td className="text-end tabular-nums">{p.new_demand.toFixed(0)}</td>
                  <td className="text-end tabular-nums">{p.new_production.toFixed(0)}</td>
                  <td className="text-end tabular-nums">{p.new_stock.toFixed(0)}</td>
                  <td className={"text-end tabular-nums " + (p.stockout_days < 3 ? "text-destructive" : p.stockout_days < 7 ? "text-warning" : "text-success")}>
                    {p.stockout_days.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Metric({ label, base, new: sim, delta, fmt, pctDelta }: { label: string; base: number; new: number; delta: number; fmt: (n: number) => string; pctDelta?: string }) {
  const positive = delta >= 0;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="kpi-label">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{fmt(sim)}</div>
      <div className="text-xs text-muted-foreground tabular-nums">
        was {fmt(base)}
      </div>
      <div className={"mt-1 text-xs tabular-nums " + (positive ? "text-success" : "text-destructive")}>
        {positive ? "+" : ""}{fmt(delta)} {pctDelta && <span className="ml-1">({pctDelta})</span>}
      </div>
    </div>
  );
}
