// Pure server logic for PPS (§7) and constraint gate (§8).
// No external I/O — takes inputs, returns computed rows.

export type Objective =
  | "default"
  | "maximize_profit"
  | "maximize_service"
  | "reduce_inventory"
  | "protect_cash";

export const WEIGHTS: Record<Objective, [number, number, number, number, number, number]> = {
  // [stockout_risk, profit_impact, customer_importance, line_efficiency, material_readiness, strategic_weight]
  default: [0.30, 0.25, 0.15, 0.10, 0.12, 0.08],
  maximize_profit: [0.15, 0.40, 0.25, 0.10, 0.05, 0.05],
  maximize_service: [0.45, 0.10, 0.30, 0.05, 0.05, 0.05],
  reduce_inventory: [0.10, 0.20, 0.20, 0.15, 0.25, 0.10],
  protect_cash: [0.20, 0.15, 0.20, 0.10, 0.25, 0.10],
};

export interface ProductInput {
  id: string;
  daily_demand: number;
  margin_pct: number;
  stability: number;
  strategic_weight: number;
  stock_qty: number;
  preferred_line_id: string | null;
  moq: number;
}
export interface LineInput {
  id: string;
  quality_factor: number;
  status: string;
}
export interface BomInput {
  product_id: string;
  material_id: string;
  quantity_per_unit: number;
}
export interface MaterialInput {
  id: string;
  stock_qty: number;
}
export interface CustomerAgg {
  product_id: string;
  weighted_importance: number; // 0..10
  total_open_qty: number;
}

export interface PPSResult {
  product_id: string;
  pps: number;
  components: {
    stockout_risk: number;
    profit_impact: number;
    customer_importance: number;
    line_efficiency: number;
    material_readiness: number;
    strategic_weight: number;
  };
  raw: Record<string, number>;
  constraint_status: "ok" | "constrained";
  constraint_notes: { code: string; detail: string }[];
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function computePPSForAll(input: {
  objective: Objective;
  products: ProductInput[];
  lines: LineInput[];
  bom: BomInput[];
  materials: MaterialInput[];
  customerAgg: Record<string, CustomerAgg>;
}): PPSResult[] {
  const [w1, w2, w3, w4, w5, w6] = WEIGHTS[input.objective];
  const linesById = new Map(input.lines.map((l) => [l.id, l]));
  const matsById = new Map(input.materials.map((m) => [m.id, m]));

  // Precompute max profit-impact for normalization
  const profitScoresRaw = input.products.map((p) => p.margin_pct * Math.max(p.daily_demand, 1));
  const maxProfit = Math.max(1, ...profitScoresRaw);

  return input.products.map((p) => {
    // 1. Stockout risk — lower stock-days => higher risk
    const days = p.daily_demand > 0 ? p.stock_qty / p.daily_demand : 999;
    let riskRaw: number;
    if (days < 3) riskRaw = 1.0;
    else if (days < 7) riskRaw = 0.75;
    else if (days < 14) riskRaw = 0.45;
    else riskRaw = 0.15;
    // Stability tempers spikes — unstable products get more risk weight
    const stockoutScore = clamp01(riskRaw * (1.2 - Math.min(1, p.stability)));

    // 2. Profit impact — normalized 0..1
    const profitRaw = p.margin_pct * Math.max(p.daily_demand, 1);
    const profitScore = clamp01(profitRaw / maxProfit);

    // 3. Customer importance (weighted across open orders)
    const cust = input.customerAgg[p.id];
    const custScore = clamp01((cust?.weighted_importance ?? 5) / 10);

    // 4. Line efficiency
    const line = p.preferred_line_id ? linesById.get(p.preferred_line_id) : undefined;
    const running = line && (line.status === "running" || line.status === "setup" || line.status === "idle");
    const lineScore = clamp01((line?.quality_factor ?? 0.85) * (running ? 1 : 0.35));

    // 5. Material readiness
    const bomForProduct = input.bom.filter((b) => b.product_id === p.id);
    let readinessScore = 1;
    const shortMaterials: string[] = [];
    if (bomForProduct.length) {
      const targetBatch = Math.max(p.moq, Math.max(p.daily_demand, 1));
      const readinessVals = bomForProduct.map((b) => {
        const m = matsById.get(b.material_id);
        const need = b.quantity_per_unit * targetBatch;
        const have = m?.stock_qty ?? 0;
        const r = need > 0 ? Math.min(1, have / need) : 1;
        if (r < 1) shortMaterials.push(b.material_id);
        return r;
      });
      readinessScore = readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length;
    }
    readinessScore = clamp01(readinessScore);

    // 6. Strategic weight
    const strategicScore = clamp01(p.strategic_weight / 10);

    const pps =
      w1 * stockoutScore +
      w2 * profitScore +
      w3 * custScore +
      w4 * lineScore +
      w5 * readinessScore +
      w6 * strategicScore;

    const notes: { code: string; detail: string }[] = [];
    if (readinessScore < 0.7) notes.push({ code: "material", detail: `short:${shortMaterials.length}` });
    if (!running) notes.push({ code: "line", detail: `status:${line?.status ?? "none"}` });
    if (days < 3) notes.push({ code: "stockout", detail: `days:${days.toFixed(1)}` });
    const status: "ok" | "constrained" = readinessScore < 0.5 || !running ? "constrained" : "ok";

    return {
      product_id: p.id,
      pps: Number((pps * 100).toFixed(2)),
      components: {
        stockout_risk: Number((w1 * stockoutScore * 100).toFixed(2)),
        profit_impact: Number((w2 * profitScore * 100).toFixed(2)),
        customer_importance: Number((w3 * custScore * 100).toFixed(2)),
        line_efficiency: Number((w4 * lineScore * 100).toFixed(2)),
        material_readiness: Number((w5 * readinessScore * 100).toFixed(2)),
        strategic_weight: Number((w6 * strategicScore * 100).toFixed(2)),
      },
      raw: {
        stock_days: Number(days.toFixed(2)),
        stability: p.stability,
        margin_pct: p.margin_pct,
        readiness: Number(readinessScore.toFixed(3)),
      },
      constraint_status: status,
      constraint_notes: notes,
    };
  });
}
