// Pure server logic for §9.3 AI Detect — Anomaly detection + alerts.
// Detects: stockout, overstock, dead stock, low readiness, line down,
// demand anomaly, yield drop, reorder needed, cash risk.

export type AlertKind =
  | "stockout"
  | "overstock"
  | "dead_stock"
  | "low_readiness"
  | "line_down"
  | "demand_anomaly"
  | "yield_drop"
  | "reorder_needed"
  | "cash_risk";

export type AlertSeverity = "info" | "warning" | "critical";

export interface DetectedAlert {
  kind: AlertKind;
  severity: AlertSeverity;
  subject_kind: "product" | "material" | "line";
  subject_id: string;
  title_ar: string;
  title_en: string;
  detail_ar?: string;
  detail_en?: string;
  metric_value?: number;
  threshold_value?: number;
}

export interface ProductSnapshot {
  id: string;
  name_ar: string;
  name_en: string;
  daily_demand: number;
  stock_qty: number;
  stability: number;
  margin_pct: number;
  recent_produced: number[];   // last N days
  recent_shipped: number[];    // last N days
  recent_yield_pct: number[];  // last N days (produced / expected)
}

export interface MaterialSnapshot {
  id: string;
  name_ar: string;
  name_en: string;
  unit: string;
  stock_qty: number;
  reorder_point: number;
  unit_cost: number;
  lead_time_days: number;
}

export interface LineSnapshot {
  id: string;
  name_ar: string;
  name_en: string;
  status: string;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

export function detectAlerts(input: {
  products: ProductSnapshot[];
  materials: MaterialSnapshot[];
  lines: LineSnapshot[];
  /** Open orders value (cash risk context) */
  openOrderValue: number;
  /** Optional: factory daily profit baseline (for cash risk) */
  dailyProfit?: number;
}): DetectedAlert[] {
  const alerts: DetectedAlert[] = [];

  // ---- Products ----
  for (const p of input.products) {
    const days = p.daily_demand > 0 ? p.stock_qty / p.daily_demand : 999;
    if (days < 3) {
      alerts.push({
        kind: "stockout",
        severity: days < 1 ? "critical" : "warning",
        subject_kind: "product",
        subject_id: p.id,
        title_ar: `نفاد وشيك: ${p.name_ar}`,
        title_en: `Stockout risk: ${p.name_en}`,
        detail_ar: `المخزون يكفي ${days.toFixed(1)} يوم فقط.`,
        detail_en: `Stock covers only ${days.toFixed(1)} days.`,
        metric_value: days,
        threshold_value: 3,
      });
    } else if (days > 30) {
      alerts.push({
        kind: "overstock",
        severity: days > 60 ? "warning" : "info",
        subject_kind: "product",
        subject_id: p.id,
        title_ar: `مخزون مرتفع: ${p.name_ar}`,
        title_en: `Overstock: ${p.name_en}`,
        detail_ar: `المخزون يكفي ${days.toFixed(0)} يوم. راجع خطة الإنتاج.`,
        detail_en: `Stock covers ${days.toFixed(0)} days. Review production plan.`,
        metric_value: days,
        threshold_value: 30,
      });
    }

    // Demand anomaly: shipped today/week deviates from mean by > 2σ
    if (p.recent_shipped.length >= 7) {
      const recent = p.recent_shipped.slice(-3);
      const baseline = p.recent_shipped.slice(0, -3);
      const m = avg(baseline);
      const sd = stddev(baseline);
      const r = avg(recent);
      if (sd > 0 && (Math.abs(r - m) > 2 * sd)) {
        alerts.push({
          kind: "demand_anomaly",
          severity: "warning",
          subject_kind: "product",
          subject_id: p.id,
          title_ar: `انحراف في الطلب: ${p.name_ar}`,
          title_en: `Demand anomaly: ${p.name_en}`,
          detail_ar: r > m ? `ارتفاع غير معتاد (${r.toFixed(0)} مقابل متوسط ${m.toFixed(0)})` : `انخفاض غير معتاد (${r.toFixed(0)} مقابل متوسط ${m.toFixed(0)})`,
          detail_en: r > m ? `Unusual spike (${r.toFixed(0)} vs avg ${m.toFixed(0)})` : `Unusual dip (${r.toFixed(0)} vs avg ${m.toFixed(0)})`,
          metric_value: r,
          threshold_value: m + 2 * sd,
        });
      }
    }

    // Yield drop: recent yield below 90% of baseline
    if (p.recent_yield_pct.length >= 5) {
      const recent = avg(p.recent_yield_pct.slice(-3));
      const baseline = avg(p.recent_yield_pct.slice(0, -3));
      if (baseline > 0 && recent < baseline * 0.9) {
        alerts.push({
          kind: "yield_drop",
          severity: recent < baseline * 0.8 ? "critical" : "warning",
          subject_kind: "product",
          subject_id: p.id,
          title_ar: `انخفاض المردود: ${p.name_ar}`,
          title_en: `Yield drop: ${p.name_en}`,
          detail_ar: `المردود ${(recent * 100).toFixed(1)}٪ مقابل ${(baseline * 100).toFixed(1)}٪.`,
          detail_en: `Yield ${(recent * 100).toFixed(1)}% vs ${(baseline * 100).toFixed(1)}%.`,
          metric_value: recent,
          threshold_value: baseline * 0.9,
        });
      }
    }
  }

  // ---- Materials ----
  for (const m of input.materials) {
    if (m.stock_qty < m.reorder_point) {
      alerts.push({
        kind: "reorder_needed",
        severity: m.stock_qty < m.reorder_point * 0.5 ? "critical" : "warning",
        subject_kind: "material",
        subject_id: m.id,
        title_ar: `إعادة طلب: ${m.name_ar}`,
        title_en: `Reorder needed: ${m.name_en}`,
        detail_ar: `المخزون ${m.stock_qty} ${m.unit} تحت نقطة الطلب ${m.reorder_point}.`,
        detail_en: `Stock ${m.stock_qty} ${m.unit} below reorder point ${m.reorder_point}.`,
        metric_value: m.stock_qty,
        threshold_value: m.reorder_point,
      });
    }
  }

  // ---- Lines ----
  for (const l of input.lines) {
    if (l.status === "broken" || l.status === "maintenance") {
      alerts.push({
        kind: "line_down",
        severity: l.status === "broken" ? "critical" : "warning",
        subject_kind: "line",
        subject_id: l.id,
        title_ar: `خط ${l.status === "broken" ? "معطل" : "في صيانة"}: ${l.name_ar}`,
        title_en: `Line ${l.status}: ${l.name_en}`,
        metric_value: 0,
        threshold_value: 1,
      });
    }
  }

  // ---- Cash risk (factory-level) ----
  if (input.dailyProfit !== undefined && input.dailyProfit < input.openOrderValue * 0.05) {
    alerts.push({
      kind: "cash_risk",
      severity: "warning",
      subject_kind: "line",
      subject_id: "ALL",
      title_ar: "مخاطر سيولة",
      title_en: "Cash risk",
      detail_ar: "الربح اليومي لا يغطي الطلبات المفتوحة بهامش مريح.",
      detail_en: "Daily profit does not cover open orders with a comfortable margin.",
      metric_value: input.dailyProfit,
      threshold_value: input.openOrderValue * 0.05,
    });
  }

  // sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return alerts;
}
