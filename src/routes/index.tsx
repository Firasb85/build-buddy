import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/hooks/use-i18n";
import { Activity, Boxes, ShieldCheck, Sparkles, Languages } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-40" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground font-bold">
            AI
          </div>
          <div>
            <div className="text-sm font-semibold">{t.appName}</div>
            <div className="text-xs text-muted-foreground">{t.appTagline}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost !px-3 !py-1.5"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            aria-label="Toggle language"
          >
            <Languages className="h-4 w-4" />
            <span className="text-xs">{lang === "ar" ? "EN" : "ع"}</span>
          </button>
          <Link to="/dashboard" className="btn-primary">
            {t.cta_start}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-10">
        <section className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <span className="badge-chip">
              <Sparkles className="h-3 w-3" /> PPS · Constraint Gate · AI Briefing
            </span>
            <h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight">
              {t.hero_title}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t.hero_sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/dashboard" className="btn-primary">
                {t.cta_start}
              </Link>
              <a href="#features" className="btn-ghost">
                {t.appName} →
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-3 max-w-md gap-6">
              <div>
                <dt className="kpi-label">Objectives</dt>
                <dd className="kpi-value">5</dd>
              </div>
              <div>
                <dt className="kpi-label">Constraints</dt>
                <dd className="kpi-value">7</dd>
              </div>
              <div>
                <dt className="kpi-label">Daily input</dt>
                <dd className="kpi-value">5<span className="text-sm text-muted-foreground"> min</span></dd>
              </div>
            </dl>
          </div>
          <div className="card-panel p-6 md:p-8">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{t.ai_briefing}</div>
              <span className="badge-chip"><Activity className="h-3 w-3" /> live</span>
            </div>
            <div className="mt-4 space-y-4 font-mono text-sm leading-relaxed text-foreground/90">
              <p><span className="text-primary">›</span> {lang === "ar" ? "الوضع: مخزون الخبز العربي يكفي ليومين. الطلب اليومي مرتفع." : "Situation: Arabic bread stock covers 2 days. Daily demand elevated."}</p>
              <p><span className="text-primary">›</span> {lang === "ar" ? "الإجراء: إنتاج 3,000 وحدة على خط العجائن الليلة. PPS 92." : "Action: Produce 3,000 units on the Dough Line tonight. PPS 92."}</p>
              <p><span className="text-primary">›</span> {lang === "ar" ? "القيد: نقص طفيف في الخميرة (7 أيام). طلب عاجل بالبديل." : "Constraint: Yeast short at 7 days — trigger express reorder."}</p>
              <p><span className="text-primary">›</span> {lang === "ar" ? "الأثر: +18٪ خدمة، +12٪ ربح، حماية عقد عميل رئيسي." : "Impact: +18% service, +12% profit, protects a key customer contract."}</p>
            </div>
          </div>
        </section>

        <section id="features" className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: <Activity className="h-5 w-5" />, t: t.feat1_t, d: t.feat1_d },
            { icon: <ShieldCheck className="h-5 w-5" />, t: t.feat2_t, d: t.feat2_d },
            { icon: <Boxes className="h-5 w-5" />, t: t.feat3_t, d: t.feat3_d },
          ].map((f, i) => (
            <div key={i} className="card-panel p-6">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">{f.icon}</div>
              <h3 className="mt-4 text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} {t.appName}</span>
          <span>{t.appTagline}</span>
        </div>
      </footer>
    </div>
  );
}
