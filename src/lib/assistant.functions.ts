import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withJobTracking } from "./jobs-wrapper";
import { answerFromContext, detectIntent, type AssistantContext } from "./assistant.server";
import type { Json } from "@/integrations/supabase/types";

const QuestionSchema = z.object({
  question: z.string().min(1).max(2000),
  lang: z.enum(["ar", "en"]),
});

interface RawProduct {
  id: string;
  name_ar: string;
  name_en: string;
  stock_qty: number | null;
  daily_demand: number | null;
  pps_snapshots?: { pps: number }[] | null;
}
interface RawLine { id: string; name_ar: string; name_en: string; status: string; quality_factor: number | null }
interface RawReco { id: string; action_ar: string; action_en: string; reason_ar: string | null; reason_en: string | null; priority: number | null }
interface RawAlert { id: string; kind: string; title_ar: string; title_en: string; severity: string }
interface RawForecast { id: string; metric: string; horizon: string; scenario: string; point_estimate: number; subject: string; run_at: string }

/** Build a fresh assistant context from the live factory state. */
async function buildContext(sb: any): Promise<AssistantContext> {
  const [productsRes, linesRes, recosRes, alertsRes, forecastsRes] = await Promise.all([
    sb.from("products").select("id,name_ar,name_en,stock_qty,daily_demand,pps_snapshots(pps)").eq("active", true).order("created_at").limit(200),
    sb.from("production_lines").select("id,name_ar,name_en,status,quality_factor"),
    sb.from("recommendations").select("action_ar,action_en,reason_ar,reason_en,priority").eq("status", "pending").order("priority", { ascending: false }).limit(5),
    sb.from("alert_states").select("kind,title_ar,title_en,severity").is("dismissed_at", null).order("created_at", { ascending: false }).limit(10),
    sb.from("forecast_runs").select("metric,horizon,scenario,point_estimate,subject,run_at").order("run_at", { ascending: false }).limit(60),
  ]);

  const products = (productsRes.data ?? []) as RawProduct[];
  const totalProducts = products.length;
  const totalStock = products.reduce((a: number, p) => a + Number(p.stock_qty ?? 0), 0);
  const totalDemand = products.reduce((a: number, p) => a + Number(p.daily_demand ?? 0), 0);
  const stockDays = totalDemand > 0 ? totalStock / totalDemand : 0;
  const lines = ((linesRes.data ?? []) as RawLine[]).map((l) => ({
    name: l.name_en,
    status: l.status,
    quality: Number(l.quality_factor ?? 0),
  }));
  const running = lines.filter((l) => l.status === "running").length;
  const broken = lines.filter((l) => l.status === "broken").length;

  const topRecos = ((recosRes.data ?? []) as RawReco[]).map((r) => ({
    action: r.action_en,
    priority: Number(r.priority ?? 0),
    reason: r.reason_en ?? "",
  }));
  const topAlerts = ((alertsRes.data ?? []) as RawAlert[]).map((a) => ({
    kind: a.kind,
    title: a.title_en,
    severity: a.severity,
  }));

  // Products summary (top 5 by stock_days)
  const productSummary = products
    .map((p) => {
      const demand = Number(p.daily_demand ?? 0);
      const stock = Number(p.stock_qty ?? 0);
      const days = demand > 0 ? stock / demand : 0;
      const pps = Number(p.pps_snapshots?.[0]?.pps ?? 0);
      return { name: p.name_en, stock, demand, days, pps };
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);

  // Forecasts — pick latest run for each (metric, horizon), return likely
  const forecastMap = new Map<string, { metric: string; horizon: string; optimistic: number; likely: number; pessimistic: number }>();
  for (const f of (forecastsRes.data ?? []) as RawForecast[]) {
    const key = `${f.metric}|${f.horizon}`;
    if (!forecastMap.has(key)) {
      forecastMap.set(key, { metric: f.metric, horizon: f.horizon, optimistic: 0, likely: 0, pessimistic: 0 });
    }
    const cur = forecastMap.get(key)!;
    if (f.scenario === "likely") cur.likely = Number(f.point_estimate);
    if (f.scenario === "optimistic") cur.optimistic = Number(f.point_estimate);
    if (f.scenario === "pessimistic") cur.pessimistic = Number(f.point_estimate);
  }
  const forecastSummary = [...forecastMap.values()].slice(0, 6);

  return {
    total_products: totalProducts,
    total_lines: lines.length,
    running_lines: running,
    broken_lines: broken,
    total_stock: totalStock,
    total_demand: totalDemand,
    stock_days: stockDays,
    top_recommendations: topRecos,
    top_alerts: topAlerts,
    lines,
    products: productSummary,
    forecast_summary: forecastSummary,
  };
}

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => QuestionSchema.parse(input))
  .handler(withJobTracking("assistant", async ({ data, context }) => {
    const sb = context.supabase;
    const ctx = await buildContext(sb);
    const intent = detectIntent(data.question);

    // Save user message
    await sb.from("assistant_messages").insert({
      user_id: context.userId,
      role: "user",
      content: data.question,
    });

    // Try LLM if key is available, else fall back to deterministic answer
    const key = process.env.LOVABLE_API_KEY;
    let answer: string;
    let usedLLM = false;
    if (key) {
      try {
        const systemAr = `أنت مساعد تنفيذي لمصنع إنتاجي. أجب بالعربية الفصحى في 3-6 جمل قصيرة وحازمة. لا تخترع أرقاماً غير موجودة في السياق. إذا كانت المعلومة غير متوفرة، قل ذلك.`;
        const systemEn = `You are an executive assistant for a production plant. Reply in 3-6 short, decisive sentences. Do not invent numbers not in the context. If info is missing, say so.`;
        const sysMsg = data.lang === "ar" ? systemAr : systemEn;
        const body = {
          model: "openai/gpt-5.5",
          messages: [
            { role: "system", content: sysMsg },
            { role: "user", content: `Context:\n${JSON.stringify(ctx, null, 2)}\n\nQuestion: ${data.question}` },
          ],
        };
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const json = await res.json();
          const content = json?.choices?.[0]?.message?.content;
          if (typeof content === "string" && content.trim().length > 0) {
            answer = content.trim();
            usedLLM = true;
          } else {
            answer = answerFromContext(data.question, ctx, data.lang);
          }
        } else {
          answer = answerFromContext(data.question, ctx, data.lang);
        }
      } catch {
        answer = answerFromContext(data.question, ctx, data.lang);
      }
    } else {
      answer = answerFromContext(data.question, ctx, data.lang);
    }

    // Save assistant response
    await sb.from("assistant_messages").insert({
      user_id: context.userId,
      role: "assistant",
      content: answer,
      context_snapshot: ctx as unknown as Json,
    });

    return { answer, intent: intent.intent, used_llm: usedLLM, context: ctx };
  }));

export const listAssistantHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("assistant_messages")
      .select("id,role,content,created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    return (data ?? []).reverse(); // chronological order for display
  });
