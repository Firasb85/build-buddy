import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setCustomWeights, clearCustomWeights, getObjective } from "@/lib/objective.functions";
import { runPPS } from "@/lib/pps.functions";
import { generateBriefing } from "@/lib/briefing.functions";
import { useI18n } from "@/hooks/use-i18n";
import { Sliders, Sparkles, RefreshCw, RotateCcw } from "lucide-react";

const COMPONENT_KEYS = [
  { key: "stockout_risk", ar: "خطر النفاد", en: "Stockout risk" },
  { key: "profit_impact", ar: "الأثر الربحي", en: "Profit impact" },
  { key: "customer_importance", ar: "أهمية العميل", en: "Customer importance" },
  { key: "line_efficiency", ar: "كفاءة الخط", en: "Line efficiency" },
  { key: "material_readiness", ar: "جاهزية المواد", en: "Material readiness" },
  { key: "strategic_weight", ar: "الوزن الاستراتيجي", en: "Strategic weight" },
] as const;

const PRESET_WEIGHTS: Record<string, number[]> = {
  default: [0.30, 0.25, 0.15, 0.10, 0.12, 0.08],
  maximize_profit: [0.15, 0.40, 0.25, 0.10, 0.05, 0.05],
  maximize_service: [0.45, 0.10, 0.30, 0.05, 0.05, 0.05],
  reduce_inventory: [0.10, 0.20, 0.20, 0.15, 0.25, 0.10],
  protect_cash: [0.20, 0.15, 0.20, 0.10, 0.25, 0.10],
};

export function AssumptionsEditor() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const getObj = useServerFn(getObjective);
  const setWeightsFn = useServerFn(setCustomWeights);
  const clearFn = useServerFn(clearCustomWeights);
  const runFn = useServerFn(runPPS);
  const briefFn = useServerFn(generateBriefing);

  const [weights, setWeights] = useState<number[]>(PRESET_WEIGHTS.default);
  const [objective, setObjective] = useState<string>("default");
  const [isCustom, setIsCustom] = useState(false);
  const [langForBriefing, setLangForBriefing] = useState<"ar" | "en">(lang);

  // Load current effective weights on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getObj();
      if (cancelled) return;
      setObjective(r.objective);
      setIsCustom(!!r.custom_weights);
      setWeights((r.effective_weights as number[]) ?? PRESET_WEIGHTS[r.objective] ?? PRESET_WEIGHTS.default);
    })();
    return () => { cancelled = true; };
  }, [getObj]);

  const sum = weights.reduce((a, b) => a + b, 0);
  const sumOk = Math.abs(sum - 1) < 0.01;

  function setW(i: number, v: number) {
    setWeights((w) => {
      const next = [...w];
      next[i] = Math.max(0, Math.min(1, v));
      return next;
    });
  }

  function normalize() {
    if (sum <= 0) return;
    setWeights((w) => w.map((v) => v / sum));
  }

  const apply = useMutation({
    mutationFn: async () => {
      if (!sumOk) throw new Error(t.assumptions_invalid_sum);
      await setWeightsFn({ data: { weights: weights.map((w) => Number(w.toFixed(4))) } });
      await runFn();
    },
    onSuccess: () => {
      setIsCustom(true);
      qc.invalidateQueries({ queryKey: ["pps-latest"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
      qc.invalidateQueries({ queryKey: ["objective"] });
    },
  });

  const clear = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: () => {
      setIsCustom(false);
      setWeights(PRESET_WEIGHTS[objective] ?? PRESET_WEIGHTS.default);
      qc.invalidateQueries({ queryKey: ["objective"] });
    },
  });

  const regenBriefing = useMutation({
    mutationFn: () => briefFn({ data: { lang: langForBriefing } }),
  });

  return (
    <section className="card-panel p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            {t.assumptions_title}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t.assumptions_desc}</p>
        </div>
        <span className={"badge-chip " + (isCustom ? "!border-primary/50 !text-primary" : "")}>
          {isCustom ? t.assumptions_in_use : t.assumptions_preset}
        </span>
      </div>

      <div className="space-y-3">
        {COMPONENT_KEYS.map((c, i) => {
          const max = Math.max(weights[i] ?? 0, ...weights, 0.01);
          return (
            <div key={c.key} className="grid grid-cols-[1fr_2fr_60px] items-center gap-3 text-sm">
              <div className="text-muted-foreground text-xs">{lang === "ar" ? c.ar : c.en}</div>
              <input
                type="range" min={0} max={1} step={0.01}
                value={weights[i] ?? 0}
                onChange={(e) => setW(i, Number(e.target.value))}
                className="w-full"
              />
              <div className="text-end tabular-nums font-medium">{((weights[i] ?? 0) * 100).toFixed(0)}%</div>
              <div className="col-span-3 h-1 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${((weights[i] ?? 0) / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {t.assumptions_sum}: <span className={"tabular-nums font-semibold " + (sumOk ? "text-success" : "text-destructive")}>{(sum * 100).toFixed(0)}%</span>
        </span>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={normalize} disabled={sumOk || sum <= 0}>
          Normalize
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
        <button
          className="btn-primary"
          disabled={apply.isPending || !sumOk}
          onClick={() => apply.mutate()}
        >
          <RefreshCw className={"h-4 w-4 " + (apply.isPending ? "animate-spin" : "")} />
          {apply.isPending ? t.computing : t.assumptions_apply}
        </button>
        <button
          className="btn-ghost"
          disabled={clear.isPending || !isCustom}
          onClick={() => clear.mutate()}
        >
          <RotateCcw className="h-4 w-4" />
          {t.assumptions_clear}
        </button>

        <div className="ms-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.assumptions_briefing_regen_desc}</span>
          <button
            className="btn-ghost"
            disabled={regenBriefing.isPending}
            onClick={() => regenBriefing.mutate()}
          >
            <Sparkles className="h-4 w-4" />
            {regenBriefing.isPending ? t.computing : t.assumptions_briefing_regen}
          </button>
        </div>
      </div>

      {(apply.error || regenBriefing.error) && (
        <p className="text-xs text-destructive">
          {(apply.error || regenBriefing.error) instanceof Error
            ? (apply.error || regenBriefing.error)!.message
            : t.error_generic}
        </p>
      )}
      {regenBriefing.data && (
        <details className="rounded-md border border-border bg-surface-2/40 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t.ai_briefing}</summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{regenBriefing.data.text}</p>
        </details>
      )}
    </section>
  );
}
