// Pure server logic for §10 Learning Layer.
// - Records accept/reject signals as learning_signals
// - Computes weekly accuracy of recommendations
// - Auto-adjusts PPS weights based on observed accept/reject pattern

import type { Objective } from "./pps.server";

export type Signal = "accept" | "reject" | "override" | "snooze";

export interface AcceptRejectRecord {
  objective: Objective;
  signal: Signal;
  weight_snapshot?: number[]; // [w1..w6] at decision time
  component_dominant?: number; // index 0..5 of dominant component for the product
}

export interface WeeklyAccuracy {
  week_start: string;
  week_end: string;
  total: number;
  accepted: number;
  rejected: number;
  overrides: number;
  acceptance_rate: number; // 0..1
  by_objective: Record<string, { accept: number; reject: number; total: number }>;
}

export interface WeightTuningSuggestion {
  objective: Objective;
  old_weights: number[];
  suggested_weights: number[];
  rationale_ar: string;
  rationale_en: string;
  expected_accuracy: number;
}

const DEFAULT_WEIGHTS: Record<Objective, number[]> = {
  default: [0.30, 0.25, 0.15, 0.10, 0.12, 0.08],
  maximize_profit: [0.15, 0.40, 0.25, 0.10, 0.05, 0.05],
  maximize_service: [0.45, 0.10, 0.30, 0.05, 0.05, 0.05],
  reduce_inventory: [0.10, 0.20, 0.20, 0.15, 0.25, 0.10],
  protect_cash: [0.20, 0.15, 0.20, 0.10, 0.25, 0.10],
};

/** Aggregate accept/reject signals for a week. */
export function computeWeeklyAccuracy(records: AcceptRejectRecord[], weekStart: Date, weekEnd: Date): WeeklyAccuracy {
  const inWindow = records.filter((r) => true); // caller pre-filters by date
  const total = inWindow.length;
  const accepted = inWindow.filter((r) => r.signal === "accept").length;
  const rejected = inWindow.filter((r) => r.signal === "reject").length;
  const overrides = inWindow.filter((r) => r.signal === "override").length;
  const by_objective: WeeklyAccuracy["by_objective"] = {};
  for (const r of inWindow) {
    const k = r.objective;
    by_objective[k] ??= { accept: 0, reject: 0, total: 0 };
    by_objective[k].total += 1;
    if (r.signal === "accept") by_objective[k].accept += 1;
    if (r.signal === "reject") by_objective[k].reject += 1;
  }
  return {
    week_start: weekStart.toISOString().slice(0, 10),
    week_end: weekEnd.toISOString().slice(0, 10),
    total,
    accepted,
    rejected,
    overrides,
    acceptance_rate: total > 0 ? accepted / total : 0,
    by_objective,
  };
}

/**
 * Suggest adjusted weights based on accept/reject pattern.
 *
 * Heuristic (intentionally simple, per the concept §10.4 example):
 *   - If the dominant component at the time of decision correlates with reject,
 *     reduce that component's weight.
 *   - If accept correlates with a component, increase that component.
 *   - Cap the change per cycle at 5% (sum stays at 1).
 */
export function suggestWeightTuning(input: {
  objective: Objective;
  records: AcceptRejectRecord[];
}): WeightTuningSuggestion {
  const base = [...DEFAULT_WEIGHTS[input.objective]];
  if (input.records.length === 0) {
    return {
      objective: input.objective,
      old_weights: base,
      suggested_weights: base,
      rationale_ar: "لا توجد بيانات كافية بعد. سيتم التعلم بعد أول أسبوع.",
      rationale_en: "Not enough data yet. Learning will start after the first week.",
      expected_accuracy: 0,
    };
  }
  const componentEffect: number[] = [0, 0, 0, 0, 0, 0];
  let totalAccept = 0, totalReject = 0;
  for (const r of input.records) {
    if (!r.component_dominant || !r.weight_snapshot) continue;
    const idx = r.component_dominant;
    if (idx < 0 || idx > 5) continue;
    const w = r.weight_snapshot[idx] ?? 0;
    if (r.signal === "accept") { componentEffect[idx] += w; totalAccept += 1; }
    if (r.signal === "reject") { componentEffect[idx] -= w; totalReject += 1; }
  }
  // Scale the effect to a 5% total shift, distributed by absolute effect
  const totalAbs = componentEffect.reduce((a, b) => a + Math.abs(b), 0);
  const SHIFT = 0.05;
  const scaled = componentEffect.map((e) => totalAbs > 0 ? (e / totalAbs) * SHIFT : 0);
  const suggested = base.map((w, i) => Math.max(0.01, w + scaled[i]!));
  // Renormalize to sum=1
  const sum = suggested.reduce((a, b) => a + b, 0);
  const normalized = suggested.map((w) => w / sum);

  const acceptanceRate = (totalAccept + totalReject) > 0 ? totalAccept / (totalAccept + totalReject) : 0;

  return {
    objective: input.objective,
    old_weights: base,
    suggested_weights: normalized,
    rationale_ar: `معدل القبول ${(acceptanceRate * 100).toFixed(0)}٪. تعديل طفيف (±5٪) على المكونات الأكثر تأثيراً.`,
    rationale_en: `Acceptance rate ${(acceptanceRate * 100).toFixed(0)}%. Mild adjustment (±5%) on most influential components.`,
    expected_accuracy: Math.min(0.95, 0.6 + 0.3 * acceptanceRate),
  };
}
