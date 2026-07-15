import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useI18n } from "@/hooks/use-i18n";
import { Languages } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: "/dashboard", replace: true });
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
      }
      nav({ to: "/dashboard", replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.redirected) return;
    nav({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground font-bold">
              AI
            </div>
            <div>
              <div className="text-sm font-semibold">{t.appName}</div>
              <div className="text-xs text-muted-foreground">{t.appTagline}</div>
            </div>
          </div>
          <button
            className="btn-ghost !px-3 !py-1.5"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          >
            <Languages className="h-4 w-4" />
            <span className="text-xs">{lang === "ar" ? "EN" : "ع"}</span>
          </button>
        </div>

        <div className="card-panel p-6">
          <h1 className="text-2xl font-semibold">
            {mode === "signin" ? t.signin : t.signup}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.appTagline}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="label-text">{t.full_name}</label>
                <input
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label className="label-text">{t.email}</label>
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label-text">{t.password}</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? t.saving : mode === "signin" ? t.signin : t.signup}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>OR</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button type="button" onClick={google} className="btn-ghost w-full">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.44-1.71 4.22-5.5 4.22-3.31 0-6.02-2.75-6.02-6.14S8.69 6.04 12 6.04c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.86 3.44 14.67 2.5 12 2.5 6.98 2.5 2.9 6.58 2.9 11.6S6.98 20.7 12 20.7c6.94 0 9.1-4.86 9.1-9.03 0-.6-.07-1.06-.15-1.47H12z"/>
            </svg>
            {t.continue_with_google}
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {mode === "signin" ? t.no_account : t.have_account}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-primary hover:underline"
            >
              {mode === "signin" ? t.signup : t.signin}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
