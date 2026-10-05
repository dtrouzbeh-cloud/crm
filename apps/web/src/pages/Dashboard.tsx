import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { useMe } from "../lib/auth.ts";
import { get } from "../lib/api.ts";
import { PageHead, Spinner, Empty, Avatar } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { STAGE_COL, stageLabel } from "../lib/format.tsx";
import { TaskRow } from "./Tasks.tsx";

export default function Dashboard() {
  const { t, date, rel } = useT(); const { data: me } = useMe();
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => get("/api/dashboard") });
  const { data: tasks } = useQuery({ queryKey: ["tasks", "today"], queryFn: () => get<any[]>("/api/tasks?who=mine&status=open&to=" + encodeURIComponent(new Date(new Date().setHours(23, 59, 59)).toISOString())) });
  const { data: pool } = useQuery({ queryKey: ["cases", "pool-dash"], queryFn: () => get("/api/cases?status=pool&limit=5") });
  const h = new Date().getHours(), first = (me?.user?.name ?? "").replace(/^Dr\.?\s*/, "").split(" ")[0];
  if (!data) return <Spinner />;
  const s = data.stages as Record<string, number>;
  const J: [string, number, string, string][] = [
    ["j_lead", (s.new ?? 0) + (s.contacted ?? 0) + (s.interested ?? 0) + (s.awaiting_info ?? 0), "/leads", "#0EA5E9"],
    ["j_case", (s.in_diagnosis ?? 0) + (s.plan_ready ?? 0), "/cases", "#F59E0B"],
    ["j_quote", (s.quote_sent ?? 0) + (s.negotiation ?? 0), "/quotes", "#6366F1"],
    ["j_accept", s.won ?? 0, "/deals", "#10B981"]];
  return <>
    <PageHead title={t(h < 12 ? "gm" : h < 18 ? "ga" : "ge", { name: first })} sub={date(new Date(), { weekday: "long", day: "numeric", month: "long" })} />
    <div className="grid g4" style={{ marginBottom: 16 }}>
      <div className="card kpi"><span className="l">{t("k_new")}</span><span className="v num">{data.kpi.newLeads}</span><span className="d muted">{t("last7")}</span></div>
      <div className="card kpi"><span className="l">{t("lt_active")}</span><span className="v num">{data.kpi.activeLeads}</span><span className="d"><Link href="/leads">{t("nav_leads")} →</Link></span></div>
      <div className="card kpi"><span className="l">{t("k_pool")}</span><span className="v num">{pool?.counts?.pool ?? 0}</span><span className="d"><Link href="/cases">{t("open_pool")} →</Link></span></div>
      <div className="card kpi"><span className="l">⏱ {t("first_response")}</span><span className="v num">{data.kpi.medianResponseMin != null ? Math.round(data.kpi.medianResponseMin) + " dk" : "—"}</span><span className="d muted">medyan · 30 gün</span></div>
    </div>
    <h3 style={{ margin: "4px 0 8px" }} className="muted small">{t("journey").toUpperCase()}</h3>
    <div className="journey" style={{ marginBottom: 16, gridTemplateColumns: "repeat(4,1fr)" }}>{J.map(([k, n, to, c]) => <Link key={k} href={to}><span className="n num">{n}</span><span className="s">{t(k)}</span><span className="bar" style={{ background: c }} /></Link>)}</div>
    <div className="grid g3">
      <div className="card"><div className="hd"><h2 className="grow">{t("today_tasks")}</h2><Link href="/tasks" className="small">{t("all")} →</Link></div><div className="bd" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="tlist">{tasks?.length ? tasks.slice(0, 7).map((x) => <TaskRow key={x.id} task={x} />) : <Empty icon="ok" text={t("no_tasks")} />}</div></div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("awaiting_dx")}</h2><Link href="/cases" className="small">{t("all")} →</Link></div><div className="bd col">
        {pool?.items?.length ? pool.items.map((c: any) => <Link key={c.id} href={`/cases/${c.id}`} className="row" style={{ color: "inherit" }}><Avatar name={c.fullName} /><div className="grow"><b>{c.fullName}</b><div className="tiny muted">#{c.number} · {rel(c.createdAt)}{c.flags?.length ? <span style={{ color: "var(--err)" }}> · ⚠ {c.flags.map((f: string) => t("med_" + f)).join(", ")}</span> : null}</div></div><Icon n="next" className="flip" /></Link>) : <Empty icon="ok" text={t("pool_empty")} />}</div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("recent")}</h2></div><div className="bd"><div className="timeline">{data.recent.map((e: any, i: number) => <div key={i} className="ev"><div className="small"><Link href={`/leads/${e.leadId}`}><b>{e.fullName}</b></Link> · {eventText(t, e)}</div><div className="tiny faint">{e.userName ? e.userName + " · " : ""}{rel(e.at)}</div></div>)}</div></div></div>
    </div>
    <div className="card pad" style={{ marginTop: 16 }}><h3 className="small muted" style={{ marginBottom: 10 }}>{t("stage").toUpperCase()}</h3><div className="row wrap" style={{ gap: 6 }}>{Object.entries(s).map(([k, n]) => <Link key={k} href={`/leads?stage=${k}`} className="chip"><i style={{ background: STAGE_COL[k] }} />{stageLabel(t, k)} <b>{n}</b></Link>)}</div></div>
  </>;
}
export function eventText(t: (k: string, p?: any) => string, e: { type: string; body?: string; data?: any }) {
  if (e.type === "stage") { const [f, to] = String(e.body).split("→"); return `${stageLabel(t, f!)} → ${stageLabel(t, to!)}`; }
  if (e.type === "system" && e.body === "created") return t("act_created", { x: t("src_" + (e.data?.source ?? "manual")) });
  if (e.type === "quote") return `${t("quote")}: ${e.body === "sent" ? t("qs_sent") : e.body === "viewed" ? t("qs_viewed") : e.body === "accept" ? t("qs_accepted") : e.body === "changes" ? t("qs_changes") : e.body === "decline" ? t("qs_declined") : e.body}`;
  if (e.type === "case") return `${t("case")}: ${e.body === "opened" ? t("act_case") : e.body === "diagnosed" ? t("cs_diagnosed") : e.body}`;
  if (e.type === "deal") return t("act_deal");
  if (e.type === "form") return `${e.data?.title ?? t("forms")}: ${e.body === "completed" ? t("fs_completed") + (e.data?.nps != null ? ` (NPS ${e.data.nps})` : "") : t("fs_sent")}`;
  if (e.type === "assign") return t("owner") + " ↺";
  return `${t("ev_" + e.type) !== "ev_" + e.type ? t("ev_" + e.type) : e.type}${e.body ? ": " + e.body.slice(0, 80) : ""}`;
}
