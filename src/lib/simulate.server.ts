// Pure server logic for §15.10 What-If Simulator.
// Takes a baseline (current state) + a set of "knobs" the manager changes,
// returns the projected impact on profit / inventory / cash.

export interface SimProduct {
  id: string;
  name_ar: string;
  name_en: string;
  daily_demand: number;
  margin_pct: number;
  stock_qty: number;
  /** units per day currently produced (approximated by daily_demand if 0) */
  current_production: number;
  /** unit cost of producing one unit */
  unit_cost: number;
}

export interface SimLine {
  id: string;
  name_ar: string;
  name_en: string;
  capacity_per_hour: number;
  quality_factor: number;
  status: string;
}

export interface SimMaterial {
  id: string;
  name_ar: string;
  name_en: string;
  unit: string;
  stock_qty: number;
  reorder_point: number;
  unit_cost: number;
  lead_time_days: number;
}

export interface SimParams {
  /** per-product demand delta in % (e.g. +20 = +20%) */
  product_demand_delta_pct: Record<string, number>;
  /** per-product production delta in % */
  product_production_delta_pct: Record<string, number>;
  /** per-line production delta in % (capacity increase) */
  line_capacity_delta_pct: Record<string, number>;
  /** per-material cost delta in % (e.g. -5 = -5%) */
  material_cost_delta_pct: Record<string, number>;
  /** per-material stock delta (absolute units) — e.g. placing a PO */
  material_stock_delta: Record<string, number>;
  /** cash injection (positive) or freeze (negative) */
  cash_inject: number;
  /** simulate a line going down (its id) */
  line_out: string | null;
  /** simulate a new shift / extra shift (multiplier 1..2) */
  shift_multiplier: number;
  /** horizon in days */
  horizon_days: number;
}

export interface SimImpact {
  baseline: {
    daily_revenue: number;
    daily_profit: number;
    inventory_value: number;
    open_orders_value: number;
  };
  simulated: {
    daily_revenue: number;
    daily_profit: number;
    inventory_value: number;
    open_orders_value: number;
  };
  delta: {
    daily_revenue: number;
    daily_profit: number;
    inventory_value: number;
    open_orders_value: number;
  };
  horizon: number;
  per_product: {
    product_id: string;
    name_ar: string;
    name_en: string;
    new_demand: number;
    new_production: number;
    new_stock: number;
    stockout_days: number;
  }[];
  warnings: string[];
}

function pctDelta(value: number, pct: number): number {
  return value * (1 + pct / 100);
}

export function runSimulation(input: {
  params: SimParams;
  products: SimProduct[];
  lines: SimLine[];
  materials: SimMaterial[];
  /** open orders, used for cash impact estimate */
  openOrderValue: number;
}): SimImpact {
  const p = input.params;
  const horizon = Math.max(1, p.horizon_days);
  const warnings: string[] = [];

  // ---- Baseline ----
  const baselineDailyDemand = input.products.reduce((a, x) => a + x.daily_demand, 0);
  const baselineDailyRevenue = input.products.reduce(
    (a, x) => a + x.daily_demand * x.unit_cost * (1 + x.margin_pct),
    0,
  );
  const baselineDailyProfit = input.products.reduce(
    (a, x) => a + x.daily_demand * x.unit_cost * x.margin_pct,
    0,
  );
  const baselineInventoryValue = input.products.reduce(
    (a, x) => a + x.stock_qty * x.unit_cost,
    0,
  );

  // ---- Apply per-product deltas ----
  const linesById = new Map(input.lines.map((l) => [l.id, l]));
  const lineMultiplierByProduct = new Map<string, number>();
  if (p.line_out) {
    // shift everything that depends on that line to a 0 multiplier
    lineMultiplierByProduct.set(p.line_out, 0);
  }
  const shift = Math.max(0.5, Math.min(2.0, p.shift_multiplier || 1));

  let simulatedDailyDemand = 0;
  let simulatedDailyRevenue = 0;
  let simulatedDailyProfit = 0;
  let simulatedInventoryValue = 0;
  const perProduct: SimImpact["per_product"] = [];

  for (const prod of input.products) {
    const demandDelta = p.product_demand_delta_pct[prod.id] ?? 0;
    const prodDelta = p.product_production_delta_pct[prod.id] ?? 0;
    const newDemand = Math.max(0, pctDelta(prod.daily_demand, demandDelta));
    const lineMult = p.line_out && prod.id in lineMultiplierByProduct ? 0 : 1;
    const lineCap = prod.id && (lineMultiplierByProduct.has(p.line_out ?? "")) ? 0 : 1;
    const newProduction = Math.max(
      0,
      pctDelta(prod.current_production || prod.daily_demand, prodDelta) * lineMult * lineCap * shift,
    );
    const demandCovered = Math.min(newDemand, newProduction);
    const dailyRevenue = demandCovered * prod.unit_cost * (1 + prod.margin_pct);
    const dailyProfit = demandCovered * prod.unit_cost * prod.margin_pct;
    // inventory over horizon
    const netChange = (newProduction - newDemand) * horizon;
    const newStock = Math.max(0, prod.stock_qty + netChange);
    const stockoutDays = newDemand > 0 ? newStock / newDemand : 999;

    simulatedDailyDemand += newDemand;
    simulatedDailyRevenue += dailyRevenue;
    simulatedDailyProfit += dailyProfit;
    simulatedInventoryValue += newStock * prod.unit_cost;

    perProduct.push({
      product_id: prod.id,
      name_ar: prod.name_ar,
      name_en: prod.name_en,
      new_demand: newDemand,
      new_production: newProduction,
      new_stock: newStock,
      stockout_days: stockoutDays,
    });

    if (stockoutDays < 3) warnings.push(`stockout_risk:${prod.name_en}:${stockoutDays.toFixed(1)}d`);
  }

  // ---- Material impact (just adjust cost) ----
  // We don't simulate full material flow — too expensive. We just show cost delta.
  let materialCostDelta = 0;
  for (const m of input.materials) {
    const d = p.material_cost_delta_pct[m.id] ?? 0;
    if (d !== 0) materialCostDelta += m.unit_cost * m.stock_qty * (d / 100);
  }
  // material cost delta reduces profit (negative cost delta = savings)
  simulatedDailyProfit -= materialCostDelta / Math.max(1, horizon);

  // ---- Cash impact ----
  const openOrderValueSim = input.openOrderValue + p.cash_inject;
  const cashFlowHorizon = (simulatedDailyProfit - baselineDailyProfit) * horizon + p.cash_inject;
  if (cashFlowHorizon < 0) warnings.push(`cash_risk:Δ${cashFlowHorizon.toFixed(0)}`);

  // ---- Warnings ----
  const totalCapacity = input.lines.reduce((a, l) => a + l.capacity_per_hour, 0) * shift;
  const requiredCapacity = perProduct.reduce((a, p) => a + p.new_production / 8, 0); // 8h shift
  if (p.line_out && requiredCapacity > totalCapacity) {
    warnings.push(`capacity_overload:${p.line_out}`);
  }

  return {
    baseline: {
      daily_revenue: baselineDailyRevenue,
      daily_profit: baselineDailyProfit,
      inventory_value: baselineInventoryValue,
      open_orders_value: input.openOrderValue,
    },
    simulated: {
      daily_revenue: simulatedDailyRevenue,
      daily_profit: simulatedDailyProfit,
      inventory_value: simulatedInventoryValue,
      open_orders_value: openOrderValueSim,
    },
    delta: {
      daily_revenue: simulatedDailyRevenue - baselineDailyRevenue,
      daily_profit: simulatedDailyProfit - baselineDailyProfit,
      inventory_value: simulatedInventoryValue - baselineInventoryValue,
      open_orders_value: openOrderValueSim - input.openOrderValue,
    },
    horizon,
    per_product: perProduct,
    warnings,
  };
}
