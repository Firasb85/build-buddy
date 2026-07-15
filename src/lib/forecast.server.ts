// Pure server logic for §9.4 AI Forecast.
// Three-scenario forecasting: optimistic / likely / pessimistic, with horizon tuning.
// No external I/O — takes historical time-series and current state, returns scenarios.

export type Horizon = "7d" | "4w" | "3m";
export type Scenario = "optimistic" | "likely" | "pessimistic";
export type Metric = "demand" | "inventory" | "cash";

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ScenarioForecast {
  scenario: Scenario;
  point: number;
  low: number;
  high: number;
  /** 0..1 — band tightness confidence */
  confidence: number;
  /** short human-readable driver notes */
  drivers: string[];
}

export interface ForecastResult {
  metric: Metric;
  horizon: Horizon;
  subject: string; // product id, material id, or "ALL"
  unit: string;
  baseline: number;            // current value (today)
  history: number;             // n points used
  optimistic: ScenarioForecast;
  likely: ScenarioForecast;
  pessimistic: ScenarioForecast;
  /** days until exhaustion if metric=='inventory' and trend is downward */
  daysToThreshold?: number;
}

const SCENARIO_PROBABILITY = { optimistic: 0.25, likely: 0.5, pessimistic: 0.25 };

/** Pick horizon-dependent smoothing window. */
function windowForHorizon(h: Horizon): number {
  if (h === "7d") return 7;
  if (h === "4w") return 14;
  return 28; // 3m
}

/** Convert horizon into a "days ahead" estimate. */
function horizonDays(h: Horizon): number {
  if (h === "7d") return 7;
  if (h === "4w") return 28;
  return 90;
}

/** Linear regression slope (per step). */
function slope(points: number[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += points[i]!; sxx += i * i; sxy += i * points[i]!;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

/** Mean absolute deviation — used to widen the band. */
function mad(points: number[]): number {
  if (points.length === 0) return 0;
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  return points.reduce((a, b) => a + Math.abs(b - mean), 0) / points.length;
}

/**
 * Compute a 3-scenario forecast.
 *
 * Methodology (per the concept §9.4 + appendix A.2):
 *   forecast = alpha * moving_average + beta * trend + gamma * seasonal_factor
 *   We collapse seasonal_factor to 1 (no seasonality model in MVP) and use
 *   alpha/beta that vary by scenario to fan out the band.
 */
export function computeForecast(input: {
  metric: Metric;
  horizon: Horizon;
  subject: string;
  unit: string;
  history: DailyPoint[];
  /** current snapshot value (today). For inventory, this is current stock. */
  currentValue: number;
  /** for inventory: a "danger" threshold (reorder point) to compute daysToThreshold */
  threshold?: number;
}): ForecastResult {
  const horizon = input.horizon;
  const hDays = horizonDays(horizon);
  const win = windowForHorizon(horizon);
  const series = input.history.map((p) => p.value);

  // Take a recent window of history
  const recent = series.slice(-Math.max(win * 2, 14));
  const used = recent.length;

  // Moving average (most recent window)
  const lastN = recent.slice(-win);
  const ma = lastN.length > 0
    ? lastN.reduce((a, b) => a + b, 0) / lastN.length
    : input.currentValue;

  // Trend (slope per step) over the same window
  const sl = slope(lastN.length > 0 ? lastN : recent);
  const trendPerStep = sl;
  // Project trend over horizon (use day granularity)
  const trendOverHorizon = trendPerStep * hDays;

  // Variability (MAD) — used to widen the band
  const variability = mad(lastN.length > 0 ? lastN : recent);
  // band width scales with horizon (sqrt) and variability
  const band = variability * Math.sqrt(hDays) * 1.2;

  // Scenario-specific mix: optimistic weights trend up, pessimistic down, likely = pure MA
  const scenarios: Record<Scenario, { alpha: number; beta: number; bandScale: number }> = {
    optimistic: { alpha: 0.55, beta: 0.45, bandScale: 0.9 },
    likely:     { alpha: 0.75, beta: 0.25, bandScale: 1.0 },
    pessimistic:{ alpha: 0.95, beta: -0.05, bandScale: 1.1 },
  };

  const make = (s: Scenario): ScenarioForecast => {
    const cfg = scenarios[s];
    // For demand, we project from MA. For inventory, we apply the same to currentValue.
    const base = input.metric === "inventory" ? input.currentValue : ma;
    const projected = base * cfg.alpha + (base + trendOverHorizon) * cfg.beta;
    const finalBand = Math.max(band * cfg.bandScale, Math.abs(projected) * 0.05);
    const drivers: string[] = [];
    if (Math.abs(trendOverHorizon) > finalBand * 0.5) {
      drivers.push(
        trendOverHorizon > 0
          ? `upward trend (Δ ${trendOverHorizon.toFixed(1)} over ${hDays}d)`
          : `downward trend (Δ ${trendOverHorizon.toFixed(1)} over ${hDays}d)`,
      );
    }
    if (variability / Math.max(1, Math.abs(ma)) > 0.3) {
      drivers.push("high historical variability");
    }
    if (input.metric === "demand" && recent.length < win) {
      drivers.push("limited history (low confidence)");
    }
    // Confidence: more history + lower variability + shorter horizon => higher
    const historyScore = Math.min(1, used / 30);
    const variabilityScore = 1 - Math.min(1, variability / Math.max(1, Math.abs(ma)));
    const horizonScore = 1 - hDays / 120;
    const confidence = Math.max(0.1, Math.min(0.95,
      0.4 * historyScore + 0.4 * variabilityScore + 0.2 * horizonScore,
    ));
    return {
      scenario: s,
      point: Math.max(0, Number(projected.toFixed(2))),
      low: Math.max(0, Number((projected - finalBand).toFixed(2))),
      high: Number((projected + finalBand).toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
      drivers,
    };
  };

  const result: ForecastResult = {
    metric: input.metric,
    horizon: input.horizon,
    subject: input.subject,
    unit: input.unit,
    baseline: input.currentValue,
    history: used,
    optimistic: make("optimistic"),
    likely: make("likely"),
    pessimistic: make("pessimistic"),
  };

  // Days to threshold (for inventory) — based on the pessimistic scenario
  if (input.metric === "inventory" && typeof input.threshold === "number" && input.threshold > 0) {
    const pess = result.pessimistic.point;
    if (pess < input.threshold) {
      const daily = (input.currentValue - pess) / hDays;
      if (daily > 0) {
        result.daysToThreshold = Number(((input.currentValue - input.threshold) / daily).toFixed(1));
      } else {
        result.daysToThreshold = 0;
      }
    }
  }

  return result;
}

/** Probability weights for display, in the order likely/optimistic/pessimistic. */
export const SCENARIO_PROBS: Record<Scenario, number> = SCENARIO_PROBABILITY;
