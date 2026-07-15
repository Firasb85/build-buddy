import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dict, type Dict, type Lang } from "@/i18n/dict";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict; dir: "rtl" | "ltr" };
const I18nContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "ai_eos_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  // Hydrate on mount to avoid SSR mismatch
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.classList.add("dark");
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  };

  const value: Ctx = { lang, setLang, t: dict[lang], dir: lang === "ar" ? "rtl" : "ltr" };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n outside provider");
  return v;
}

export function pickName<T extends { name_ar: string; name_en: string }>(
  row: T,
  lang: Lang,
): string {
  return lang === "ar" ? row.name_ar : row.name_en;
}
