// Pure server logic for §9.6 Executive Assistant (NL chat).
// Interprets user intent, gathers relevant factory state, then either
// returns a structured answer OR delegates to the AI gateway for natural language.

export type Intent =
  | "production_status"
  | "line_status"
  | "compare_suppliers"
  | "top_recommendations"
  | "forecast"
  | "alerts"
  | "stockout"
  | "general";

export interface IntentMatch {
  intent: Intent;
  confidence: number;
  subject?: string;
}

const INTENT_PATTERNS: { intent: Intent; patterns: RegExp[]; subject?: RegExp }[] = [
  {
    intent: "production_status",
    patterns: [
      /حالة.*الإنتاج/i, /الإنتاج.*اليوم/i, /إنتاج اليوم/i, /ما.*الإنتاج/i,
      /production.*today/i, /production status/i, /what.*producing/i, /today.*output/i,
    ],
  },
  {
    intent: "line_status",
    patterns: [
      /حالة.*الخط/i, /خط \d/i, /خطوط.*الإنتاج/i, /عطل/i,
      /line \d/i, /line status/i, /line.*down/i, /broken/i, /which line/i,
    ],
  },
  {
    intent: "compare_suppliers",
    patterns: [
      /قارن.*المورد/i, /الموردين/i, /أفضل مورد/i,
      /compare.*supplier/i, /supplier.*comparison/i, /best supplier/i,
    ],
  },
  {
    intent: "top_recommendations",
    patterns: [
      /توصيات/i, /ماذا.*نفعل/i, /الأولويات/i,
      /recommend/i, /what.*do/i, /priorities/i, /top actions/i,
    ],
  },
  {
    intent: "forecast",
    patterns: [
      /توقع/i, /المستقبل/i, /الطلب.*القادم/i,
      /forecast/i, /predict/i, /next.*demand/i, /next week/i,
    ],
  },
  {
    intent: "alerts",
    patterns: [
      /تنبيهات/i, /مشاكل/i, /مخاطر/i, /ما.*الخطأ/i,
      /alert/i, /issues/i, /risks/i, /what.*wrong/i,
    ],
  },
  {
    intent: "stockout",
    patterns: [
      /نفاد/i, /متى.*ينفد/i, /كم.*يوم/i,
      /stockout/i, /out of stock/i, /when.*run out/i, /days.*left/i,
    ],
  },
];

/** Detect the user's intent from a free-form question. */
export function detectIntent(question: string): IntentMatch {
  const q = question.trim();
  let best: IntentMatch = { intent: "general", confidence: 0 };
  for (const def of INTENT_PATTERNS) {
    for (const p of def.patterns) {
      if (p.test(q)) {
        const c = 0.7 + 0.1 * (def.patterns.indexOf(p));
        if (c > best.confidence) best = { intent: def.intent, confidence: c };
      }
    }
  }
  return best;
}

export interface AssistantContext {
  total_products: number;
  total_lines: number;
  running_lines: number;
  broken_lines: number;
  total_stock: number;
  total_demand: number;
  stock_days: number;
  top_recommendations: { action: string; priority: number; reason: string }[];
  top_alerts: { kind: string; title: string; severity: string }[];
  lines: { name: string; status: string; quality: number }[];
  products: { name: string; stock: number; demand: number; days: number; pps: number }[];
  forecast_summary: { metric: string; horizon: string; likely: number; optimistic: number; pessimistic: number }[];
}

/** Build a short executive-language answer from the context, without LLM. */
export function answerFromContext(question: string, ctx: AssistantContext, lang: "ar" | "en"): string {
  const intent = detectIntent(question);
  if (lang === "ar") {
    switch (intent.intent) {
      case "production_status":
        return `الوضع العام: ${ctx.running_lines} من ${ctx.total_lines} خطوط تعمل. المخزون يكفي ${ctx.stock_days.toFixed(1)} يوم بمتوسط الطلب. أهم توصية: ${ctx.top_recommendations[0]?.action ?? "لا توجد توصيات عاجلة."}`;
      case "line_status":
        return ctx.broken_lines > 0
          ? `يوجد ${ctx.broken_lines} خط معطل. الخطوط العاملة: ${ctx.lines.filter((l) => l.status === "running").map((l) => l.name).join("، ") || "—"}`
          : `كل الخطوط تعمل. (${ctx.running_lines}/${ctx.total_lines})`;
      case "alerts":
        return ctx.top_alerts.length === 0
          ? "لا توجد تنبيهات حرجة الآن."
          : `${ctx.top_alerts.length} تنبيهات نشطة، أهمها: ${ctx.top_alerts[0]?.title ?? "—"}.`;
      case "forecast":
        if (ctx.forecast_summary.length === 0) return "لا توجد توقعات محسوبة بعد. شغّل محرك التوقع أولاً.";
        return `التوقعات المتاحة: ${ctx.forecast_summary.map((f) => `${f.metric} (${f.horizon}): ${f.likely}`).join("، ")}`;
      case "top_recommendations":
        return ctx.top_recommendations.length === 0
          ? "لا توجد توصيات عاجلة."
          : `أهم التوصيات:\n${ctx.top_recommendations.slice(0, 3).map((r, i) => `${i + 1}) ${r.action} (${r.priority})`).join("\n")}`;
      default:
        return `تم استلام سؤالك. الوضع: ${ctx.running_lines}/${ctx.total_lines} خطوط تعمل، ${ctx.stock_days.toFixed(1)} يوم مخزون. اطرح سؤالاً محدداً عن الإنتاج، الخطوط، التوقعات، أو التنبيهات.`;
    }
  } else {
    switch (intent.intent) {
      case "production_status":
        return `Status: ${ctx.running_lines}/${ctx.total_lines} lines running. Stock covers ${ctx.stock_days.toFixed(1)} days at current demand. Top action: ${ctx.top_recommendations[0]?.action ?? "no urgent actions."}`;
      case "line_status":
        return ctx.broken_lines > 0
          ? `${ctx.broken_lines} line(s) are down. Running: ${ctx.lines.filter((l) => l.status === "running").map((l) => l.name).join(", ") || "—"}`
          : `All lines are running. (${ctx.running_lines}/${ctx.total_lines})`;
      case "alerts":
        return ctx.top_alerts.length === 0
          ? "No critical alerts right now."
          : `${ctx.top_alerts.length} active alerts. Top: ${ctx.top_alerts[0]?.title ?? "—"}.`;
      case "forecast":
        if (ctx.forecast_summary.length === 0) return "No forecasts computed yet. Run the forecast engine first.";
        return `Available forecasts: ${ctx.forecast_summary.map((f) => `${f.metric} (${f.horizon}): ${f.likely}`).join(", ")}`;
      case "top_recommendations":
        return ctx.top_recommendations.length === 0
          ? "No urgent recommendations."
          : `Top recommendations:\n${ctx.top_recommendations.slice(0, 3).map((r, i) => `${i + 1}) ${r.action} (${r.priority})`).join("\n")}`;
      default:
        return `Question received. Status: ${ctx.running_lines}/${ctx.total_lines} lines running, ${ctx.stock_days.toFixed(1)} days of stock. Ask about production, lines, forecasts, or alerts.`;
    }
  }
}
