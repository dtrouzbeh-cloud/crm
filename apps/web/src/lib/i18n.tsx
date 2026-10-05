import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { D, translate, fmtMoney as fm, fmtDate as fd, LOCALES } from "@dentaflow/core/i18n";
import { EXTRA } from "./i18n-extra.ts";
Object.assign(D, EXTRA);

type Ctx = { lang: string; setLang: (l: string) => void; t: (k: string, p?: Record<string, unknown> | null) => string;
  money: (v: number, cur: string) => string; date: (d: any, o?: Intl.DateTimeFormatOptions) => string; rel: (d: any) => string };
const I18n = createContext<Ctx>(null as never);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(() => localStorage.getItem("df_lang") || (navigator.language.startsWith("tr") ? "tr" : "en"));
  const value = useMemo<Ctx>(() => {
    document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    const rtf = new Intl.RelativeTimeFormat(LOCALES[lang] ?? "en-GB", { numeric: "auto" });
    return {
      lang, setLang: (l) => { localStorage.setItem("df_lang", l); setLangState(l); },
      t: (k, p) => translate(lang, k, p), money: (v, cur) => fm(v, cur, lang), date: (d, o) => fd(d, lang, o),
      rel: (d) => { if (!d) return "—"; const s = (new Date(d).getTime() - Date.now()) / 1000, a = Math.abs(s);
        if (a < 60) return rtf.format(Math.round(s), "second"); if (a < 3600) return rtf.format(Math.round(s / 60), "minute"); if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
        if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day"); return fd(d, lang); },
    };
  }, [lang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useT = () => useContext(I18n);
