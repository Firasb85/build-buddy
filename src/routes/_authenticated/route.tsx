import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/hooks/use-i18n";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ClipboardEdit,
  Flame,
  Factory,
  ScrollText,
  Settings as SettingsIcon,
  LogOut,
  Languages,
  TrendingUp,
  FlaskConical,
  Bot,
  Brain,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/dashboard", label: t.nav_dashboard, icon: LayoutDashboard },
    { to: "/daily", label: t.nav_daily, icon: ClipboardEdit },
    { to: "/priorities", label: t.nav_priorities, icon: Flame },
    { to: "/forecast", label: t.nav_forecast, icon: TrendingUp },
    { to: "/simulate", label: t.nav_simulate, icon: FlaskConical },
    { to: "/assistant", label: t.nav_assistant, icon: Bot },
    { to: "/learning", label: t.nav_learning, icon: Brain },
    { to: "/factory", label: t.nav_factory, icon: Factory },
    { to: "/decisions", label: t.nav_decisions, icon: ScrollText },
    { to: "/settings", label: t.nav_settings, icon: SettingsIcon },
  ] as const;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex md:w-64 flex-col border-e border-border bg-surface/60 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground font-bold">AI</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{t.appName}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{t.appTagline}</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((i) => {
            const active = pathname === i.to || pathname.startsWith(i.to + "/");
            return (
              <Link
                key={i.to}
                to={i.to}
                className={
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition " +
                  (active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")
                }
              >
                <i.icon className="h-4 w-4" />
                <span>{i.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <button
            className="btn-ghost w-full !justify-start"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            <Languages className="h-4 w-4" />
            <span>{lang === "ar" ? "English" : "العربية"}</span>
          </button>
          <button className="btn-ghost w-full !justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            <span>{t.signout}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between border-b border-border bg-surface/60 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground text-xs font-bold">AI</div>
            <span className="text-sm font-semibold">{t.appName}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost !px-2 !py-1" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              <Languages className="h-4 w-4" />
            </button>
            <button className="btn-ghost !px-2 !py-1" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        {/* Mobile tab bar */}
        <div className="md:hidden overflow-x-auto border-b border-border bg-surface/40 px-2 py-2">
          <div className="flex gap-1 whitespace-nowrap">
            {items.map((i) => {
              const active = pathname === i.to;
              return (
                <Link
                  key={i.to}
                  to={i.to}
                  className={
                    "rounded-md px-3 py-1.5 text-xs transition " +
                    (active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-surface-2")
                  }
                >
                  {i.label}
                </Link>
              );
            })}
          </div>
        </div>
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
