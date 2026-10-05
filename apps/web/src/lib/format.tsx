import { useT } from "./i18n.tsx";
export const STAGE_COL: Record<string, string> = { new: "#0EA5E9", contacted: "#6366F1", interested: "#8B5CF6", awaiting_info: "#F97316", in_diagnosis: "#F59E0B", plan_ready: "#14B8A6",
  quote_sent: "#0E7C86", negotiation: "#D946EF", won: "#10B981", lost: "#94A3B8" };
export const LEAD_STAGES = ["new", "contacted", "interested", "awaiting_info", "in_diagnosis", "plan_ready", "quote_sent", "negotiation", "won", "lost"];
const stageKey = (s: string) => ({ in_diagnosis: "st_in_diagnosis", awaiting_info: "st_awaiting_info", quote_sent: "st_quote_sent", negotiation: "st_negotiation" } as Record<string, string>)[s] ?? "st_" + s;
export function StageBadge({ s }: { s: string }) {
  const { t } = useT(); const c = STAGE_COL[s] ?? "#94A3B8";
  return <span className="bdg" style={{ background: `color-mix(in srgb,${c} 14%,transparent)`, color: c }}><span className="dot" style={{ background: c }} />{t(stageKey(s))}</span>;
}
export const stageLabel = (t: (k: string) => string, s: string) => t(stageKey(s));
export const TEMP: Record<string, string> = { hot: "🔥", warm: "🌤️", cold: "❄️" };
export const FLAGS: Record<string, string> = { GB: "🇬🇧", DE: "🇩🇪", NL: "🇳🇱", FR: "🇫🇷", US: "🇺🇸", SA: "🇸🇦", IE: "🇮🇪", AU: "🇦🇺", AE: "🇦🇪", TR: "🇹🇷", BE: "🇧🇪", CH: "🇨🇭", SE: "🇸🇪", IT: "🇮🇹", ES: "🇪🇸",
  NO: "🇳🇴", DK: "🇩🇰", AT: "🇦🇹", PL: "🇵🇱", RU: "🇷🇺", UA: "🇺🇦", AZ: "🇦🇿", KW: "🇰🇼", QA: "🇶🇦", IL: "🇮🇱", CA: "🇨🇦", NZ: "🇳🇿", GR: "🇬🇷", AL: "🇦🇱", BG: "🇧🇬", RO: "🇷🇴", IQ: "🇮🇶", EG: "🇪🇬", MA: "🇲🇦" };
export const flag = (c?: string | null) => (c && FLAGS[c]) || "🌐";
export function QuoteBadge({ s }: { s: string }) {
  const { t } = useT();
  const cls = ({ sent: "info", viewed: "brand", accepted: "ok", changes: "warn", declined: "err", expired: "", revoked: "", superseded: "" } as Record<string, string>)[s] ?? "";
  return <span className={"bdg " + cls}>{t("qs_" + s)}</span>;
}
export function CaseBadge({ s }: { s: string }) {
  const { t } = useT();
  const cls = ({ pool: "warn", awaiting_info: "warn", diagnosed: "info", quoted: "brand", accepted: "ok", in_treatment: "ok", completed: "", canceled: "" } as Record<string, string>)[s] ?? "";
  return <span className={"bdg " + cls}>{t("cs_" + s)}</span>;
}
export const minor = (v: number | null | undefined) => (v == null ? 0 : Number(v) / 100);
