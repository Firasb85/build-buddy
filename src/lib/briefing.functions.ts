import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withJobTracking } from "./jobs-wrapper";

export const generateBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lang: z.enum(["ar", "en"]) }).parse(input))
  .handler(withJobTracking("briefing", async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: recos }, { data: obj }, { data: kpis }] = await Promise.all([
      sb.from("recommendations").select("action_ar,action_en,reason_ar,reason_en,priority,impact,products(name_ar,name_en,sku,stock_qty,daily_demand)").eq("status", "pending").order("priority", { ascending: false }).limit(5),
      sb.from("objective_settings").select("objective").eq("id", 1).maybeSingle(),
      sb.from("products").select("stock_qty,daily_demand,name_en"),
    ]);
    const objective = obj?.objective ?? "default";
    const totalStock = (kpis ?? []).reduce((a, p) => a + Number(p.stock_qty), 0);
    const totalDemand = (kpis ?? []).reduce((a, p) => a + Number(p.daily_demand), 0);
    const avgStockDays = totalDemand > 0 ? (totalStock / totalDemand).toFixed(1) : "n/a";

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const payload = {
      objective,
      avg_stock_days: avgStockDays,
      top_actions: (recos ?? []).map((r) => ({
        action: data.lang === "ar" ? r.action_ar : r.action_en,
        reason: data.lang === "ar" ? r.reason_ar : r.reason_en,
        priority: r.priority,
        impact: r.impact,
      })),
    };

    const systemAr = `أنت مساعد تنفيذي لمصنع إنتاجي. صياغة الملخص يجب أن تكون قصيرة، حازمة، بلغة قرار. اكتب في 4 فقرات قصيرة:
1) الوضع في جملة واحدة.
2) أهم إجراء يجب اتخاذه اليوم مع السبب المرقم.
3) القيود أو المخاطر.
4) الأثر المتوقع (مالياً وتشغيلياً) بأرقام تقريبية معقولة. استخدم لغة عربية فصحى بلا حشو. لا تخترع أرقاماً غير موجودة في المدخلات.`;
    const systemEn = `You are an executive assistant for a production plant. Keep the briefing terse and decisive.
Write 4 short paragraphs:
1) One-sentence situation.
2) The top action to take today with the numbered reason.
3) Constraints or risks.
4) Expected business impact (financial and operational) with plausible approximate figures. No filler. Do not invent numbers not implied by the input.`;

    const body = {
      model: "openai/gpt-5.5",
      messages: [
        { role: "system", content: data.lang === "ar" ? systemAr : systemEn },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error(data.lang === "ar" ? "تجاوز حد الطلبات. أعد المحاولة لاحقاً." : "Rate limit exceeded, try again later.");
      if (res.status === 402) throw new Error(data.lang === "ar" ? "نفدت أرصدة الذكاء الاصطناعي." : "AI credits exhausted.");
      throw new Error(`AI gateway ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    return { text: content as string, objective, avg_stock_days: avgStockDays };
  }));
