// Pano: bugün aranacaklar (lead puanı + anlık sinyaller), şu an teklife bakanlar; lead puan rozeti; teklif etkileşimi
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get } from "../lib/api.ts";
import { Icon } from "./Icon.tsx";
import { flag, StageBadge } from "../lib/format.tsx";

export function ScoreBadge({ score, reasons, small }: { score?: number | null; reasons?: [string, number][] | null; small?: boolean }) {
  const { t } = useT(); if (score == null) return null;
  const c = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#94A3B8";
  const title = (reasons ?? []).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${t("sc_" + k)}`).join("\n");
  return <span title={title} className="bdg" style={{ background: `color-mix(in srgb,${c} 16%,transparent)`, color: c, fontWeight: 800, height: small ? 18 : 22 }}>{score}</span>;
}

export function CallList({ mine = true }: { mine?: boolean }) {
  const { t, rel } = useT();
  const { data } = useQuery({ queryKey: ["call-list", mine], queryFn: () => get<any[]>(`/api/leads/call-list?mine=${mine}&limit=8`), refetchInterval: 60_000 });
  return <div className="card"><div className="hd"><h2 className="grow">📞 {t("call_list")}</h2><Link href="/leads?sort=score" className="small">{t("all")} →</Link></div><div className="bd col" style={{ gap: 6, paddingTop: 0 }}>
    {!data ? <div className="empty small">{t("loading")}</div> : !data.length ? <div className="empty small">{t("call_list_empty")}</div> : data.map((x) => <Link key={x.leadId} href={`/leads/${x.leadId}`} className="row" style={{ color: "inherit", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <ScoreBadge score={x.score} reasons={x.reasons} />
      <div className="grow" style={{ minWidth: 0 }}><div className="row" style={{ gap: 6 }}><b className="small">{flag(x.country)} {x.name}</b>{x.live && <span className="bdg ok">🟢 {t("live_now")}</span>}</div>
        <div className="tiny muted">{t("act_" + x.action, { t: x.quoteViewedAt ? rel(x.quoteViewedAt) : x.lastInbound ? rel(x.lastInbound) : "" })}</div></div>
      {x.phone && <a className="btn sm icon ghost" href={`tel:${x.phone}`} onClick={(e) => e.stopPropagation()}><Icon n="phone" /></a>}
    </Link>)}</div></div>;
}

export function LiveQuotes() {
  const { t, rel } = useT();
  const { data } = useQuery({ queryKey: ["quotes-live"], queryFn: () => get<any[]>("/api/quotes/live"), refetchInterval: 30_000 });
  if (!data?.length) return null;
  const live = data.filter((x) => x.live), recent = data.filter((x) => !x.live).slice(0, 5);
  return <div className="card"><div className="hd"><h2 className="grow">👀 {t("quote_watchers")}</h2></div><div className="bd col" style={{ gap: 6, paddingTop: 0 }}>
    {live.map((x) => <Link key={x.quoteId} href={`/leads/${x.leadId}`} className="row" style={{ color: "inherit", gap: 8, padding: "6px 8px", borderRadius: 8, background: "var(--ok-bg)" }}>
      <span className="bdg ok">🟢</span><div className="grow"><b className="small">{flag(x.country)} {x.fullName}</b><div className="tiny muted">{t("viewing_now")} · {x.currentSection ? t("sec_" + x.currentSection) : ""} · {Math.round(x.secondsTotal / 60)} dk</div></div>
      {x.phone && <a className="btn sm pri" href={`tel:${x.phone}`} onClick={(e) => e.stopPropagation()}><Icon n="phone" />{t("call")}</a>}</Link>)}
    {recent.map((x) => <Link key={x.quoteId} href={`/leads/${x.leadId}`} className="row" style={{ color: "inherit", gap: 8, padding: "4px 8px" }}>
      <span className="tiny faint">{rel(x.lastPing)}</span><span className="small grow">{x.fullName}</span><span className="tiny muted">{x.sessions}× · {Math.round(x.secondsTotal / 60)} dk</span></Link>)}
  </div></div>;
}

export function QuoteEngagement({ quoteId, options }: { quoteId: string; options: string[] }) {
  const { t, rel } = useT();
  const { data: e } = useQuery({ queryKey: ["engagement", quoteId], queryFn: () => get(`/api/quotes/${quoteId}/engagement`), refetchInterval: 30_000 });
  if (!e) return null;
  const os = e.optionSeconds ?? {}, ss = e.sectionSeconds ?? {}; const max = Math.max(1, ...Object.values(os as Record<string, number>));
  return <div className="card pad" style={{ padding: 10 }}><div className="row" style={{ gap: 8 }}><b className="small">👀 {t("engagement")}</b>{e.live && <span className="bdg ok">🟢 {t("viewing_now")}</span>}<span className="grow" /><span className="tiny muted">{e.sessions}× · {Math.round(e.secondsTotal / 60)} dk · {rel(e.lastPing)}</span></div>
    <div className="col" style={{ gap: 3, marginTop: 6 }}>{options.map((o, i) => <div key={i}><div className="row tiny"><span className="grow">{o}</span><span className="muted">{Math.round((os[String(i)] ?? 0) / 60)} dk</span></div><div className="prog" style={{ height: 4 }}><i style={{ width: (100 * (os[String(i)] ?? 0)) / max + "%" }} /></div></div>)}</div>
    <div className="row wrap tiny muted" style={{ gap: 8, marginTop: 6 }}>{Object.entries(ss as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k}>{t("sec_" + k)}: {Math.round(v / 60)} dk</span>)}</div>
  </div>;
}

export function StageAndScore({ lead }: { lead: any }) { return <span className="row" style={{ gap: 6 }}><StageBadge s={lead.stage} /><ScoreBadge score={lead.score} reasons={lead.scoreReasons} /></span>; }
