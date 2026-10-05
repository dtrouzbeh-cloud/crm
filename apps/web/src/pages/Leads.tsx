import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, qs } from "../lib/api.ts";
import { PageHead, Empty, Drawer, toast, toastErr, Avatar, Spinner } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useMe, useCan } from "../lib/auth.ts";
import { LEAD_STAGES, STAGE_COL, StageBadge, stageLabel, TEMP, flag, FLAGS } from "../lib/format.tsx";
import { LANG_NAMES } from "@dentaflow/core/i18n";
import ImportModal from "./ImportModal.tsx";

export default function Leads() {
  const { t, rel } = useT(); const can = useCan(); const search = useSearch(); const [, nav] = useLocation();
  const sp = new URLSearchParams(search);
  const [view, setView] = useState(() => localStorage.getItem("df_leadview") || "list");
  const [tab, setTab] = useState(sp.get("stage") ?? "active");
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [page, setPage] = useState(0); const [adding, setAdding] = useState(false); const [importing, setImporting] = useState(false);
  useEffect(() => { const h = setTimeout(() => { setDq(q); setPage(0); }, 250); return () => clearTimeout(h); }, [q]);
  useEffect(() => localStorage.setItem("df_leadview", view), [view]);
  const isStage = LEAD_STAGES.includes(tab);
  const params = view === "kanban" ? { view: "all", q: dq, limit: 200 } : { view: isStage ? "all" : tab, stage: isStage ? tab : undefined, q: dq, limit: 50, offset: page * 50 };
  const { data, isLoading } = useQuery({ queryKey: ["leads", params], queryFn: () => get("/api/leads" + qs(params)), placeholderData: keepPreviousData });
  const { data: stats } = useQuery({ queryKey: ["leadstats"], queryFn: () => get<Record<string, number>>("/api/leads/stats") });
  const qc = useQueryClient();
  const moveStage = async (id: string, stage: string, prev: string) => {
    if (stage === "lost") { nav(`/leads/${id}?lost=1`); return; }
    try { await patch(`/api/leads/${id}`, { stage }); qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["leadstats"] });
      toast(t("moved_to", { s: stageLabel(t, stage) }), async () => { await patch(`/api/leads/${id}`, { stage: prev }); qc.invalidateQueries({ queryKey: ["leads"] }); }); } catch (e) { toastErr(e); }
  };
  const active = Object.entries(stats ?? {}).filter(([k]) => !["won", "lost"].includes(k)).reduce((a, [, n]) => a + n, 0);
  return <>
    <PageHead title={t("nav_leads")} sub={t("leads_sub", { n: data?.total ?? "…" })} actions={<>
      <input className="inp" placeholder={t("filter_ph")} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      <div className="seg"><button className={view === "list" ? "on" : ""} onClick={() => setView("list")} title={t("list")}><Icon n="list" /></button><button className={view === "kanban" ? "on" : ""} onClick={() => setView("kanban")} title="Kanban"><Icon n="kanban" /></button></div>
      {can("lead.import") && <button className="btn" onClick={() => setImporting(true)}><Icon n="upload" />{t("import")}</button>}
      {can("lead.write") && <button className="btn pri" onClick={() => setAdding(true)}><Icon n="plus" />{t("new_lead")}</button>}</>} />
    {view === "kanban" ? <Kanban items={data?.items ?? []} onMove={moveStage} /> :
      <div className="card"><div className="tabs" style={{ padding: "0 8px" }}>
        {[["active", active], ["mine", null], ["all", null], ...LEAD_STAGES.map((s) => [s, stats?.[s] ?? 0])].map(([k, n]) =>
          <button key={k as string} className={tab === k ? "on" : ""} onClick={() => { setTab(k as string); setPage(0); }}>{LEAD_STAGES.includes(k as string) ? stageLabel(t, k as string) : t("lt_" + k)}{n != null && <span className="bdg">{n as number}</span>}</button>)}</div>
        {isLoading ? <Spinner /> : data?.items?.length ? <div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("phone")}</th><th>{t("country")}</th><th>{t("status")}</th><th>{t("source")}</th><th>{t("temp")}</th><th>{t("owner")}</th><th>{t("last_act")}</th><th /></tr></thead><tbody>
          {data.items.map((l: any) => <tr key={l.id} className="click" onClick={() => nav(`/leads/${l.id}`)}>
            <td><div className="row"><Avatar name={l.fullName} /><div><div style={{ fontWeight: 600 }}>{l.fullName} {l.overdueTasks > 0 && <span className="bdg err" title={t("g_overdue")}>{l.overdueTasks}</span>}</div><div className="tiny muted">#{l.number} · {l.email ?? ""}</div></div></div></td>
            <td className="num small">{l.phone}</td><td>{flag(l.country)} <span className="small muted">{l.country}</span></td><td><StageBadge s={l.stage} /></td>
            <td className="small">{t("src_" + l.source)}{l.campaign && <div className="tiny muted">{l.campaign}</div>}</td><td>{TEMP[l.temperature]}</td><td>{l.ownerName ? <Avatar name={l.ownerName} sm /> : <span className="faint">—</span>}</td>
            <td className="small muted">{rel(l.lastActivityAt)}</td>
            <td className="r" onClick={(e) => e.stopPropagation()}>{l.phone && !l.phone.includes("•") && <div className="row end" style={{ gap: 4 }}>
              <a className="btn sm icon ghost" href={`tel:${l.phone}`} title={t("call")}><Icon n="phone" /></a>
              <a className="btn sm icon ghost" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} title="WhatsApp"><Icon n="wa" /></a></div>}</td></tr>)}
        </tbody></table>
          {data.total > 50 && <div className="pager"><span className="small muted">{page * 50 + 1}–{Math.min((page + 1) * 50, data.total)} / {data.total}</span><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>{t("prev")}</button><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>{t("next")}</button></div>}
        </div> : <Empty icon="users" text={t("no_results")} action={can("lead.write") ? <button className="btn pri" onClick={() => setAdding(true)}><Icon n="plus" />{t("new_lead")}</button> : null} />}
      </div>}
    {adding && <NewLeadDrawer onClose={() => setAdding(false)} />}
    {importing && <ImportModal onClose={() => setImporting(false)} />}
  </>;
}

function Kanban({ items, onMove }: { items: any[]; onMove: (id: string, stage: string, prev: string) => void }) {
  const { t, rel } = useT(); const [, nav] = useLocation(); const [drag, setDrag] = useState<any>(null); const [over, setOver] = useState<string | null>(null);
  return <div className="kanban">{LEAD_STAGES.map((s) => { const ls = items.filter((l) => l.stage === s);
    return <div key={s} className={"kcol" + (over === s ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); setOver(null); if (drag && drag.stage !== s) onMove(drag.id, s, drag.stage); setDrag(null); }}>
      <div className="kh"><span className="dot" style={{ background: STAGE_COL[s] }} />{stageLabel(t, s)}<span className="bdg" style={{ marginInlineStart: "auto" }}>{ls.length}</span></div>
      <div className="kb">{ls.map((l) => <div key={l.id} className={"kcard" + (drag?.id === l.id ? " drag" : "")} draggable onDragStart={() => setDrag(l)} onDragEnd={() => setDrag(null)} onClick={() => nav(`/leads/${l.id}`)}>
        <div className="row"><b className="grow">{l.fullName}</b>{TEMP[l.temperature]}</div><div className="tiny muted">{flag(l.country)} {l.interest || "—"}</div>
        <div className="row tiny muted">{l.ownerName && <Avatar name={l.ownerName} sm />}<span className="grow">{t("src_" + l.source)}</span><span>{rel(l.lastActivityAt)}</span></div></div>)}</div></div>; })}</div>;
}

export function NewLeadDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const [, nav] = useLocation(); const { data: me } = useMe();
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  const [f, setF] = useState<any>({ fullName: "", phone: "", email: "", country: "GB", language: "en", source: "manual", temperature: "warm", interest: "", ownerId: "", issue: "" });
  const [dup, setDup] = useState<any>(null);
  useEffect(() => { if ((f.phone ?? "").replace(/\D/g, "").length < 7 && !f.email.includes("@")) { setDup(null); return; }
    const h = setTimeout(async () => setDup((await post("/api/leads/check-duplicates", { phone: f.phone, email: f.email, country: f.country })).duplicate), 400); return () => clearTimeout(h); }, [f.phone, f.email, f.country]);
  const save = async () => { if (!f.fullName.trim() || (!f.phone.trim() && !f.email.trim())) return toastErr(new Error(t("full_name") + " + " + t("phone")));
    try { const r = await post("/api/leads", { ...f, email: f.email || null, ownerId: f.ownerId || null }); qc.invalidateQueries({ queryKey: ["leads"] }); toast(t("lead_created")); onClose(); nav(`/leads/${r.leadId}`); } catch (e) { toastErr(e); } };
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const sources = (me?.clinic?.settings?.leadSources as string[]) ?? ["manual"];
  return <Drawer title={t("new_lead")} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" onClick={save}>{t("save")}</button></>}>
    <label className="f">{t("full_name")} *<input className="inp" autoFocus value={f.fullName} onChange={set("fullName")} /></label>
    <div className="grid g2"><label className="f">{t("phone")} *<input className="inp" value={f.phone} onChange={set("phone")} placeholder="+44 …" /></label><label className="f">{t("email")}<input className="inp" type="email" value={f.email} onChange={set("email")} /></label></div>
    {dup && <div className="alert warn"><Icon n="alert" /><span>{t("dup_found")} <Link href={`/leads/${dup.leadId}`} onClick={onClose}><b>{dup.name}</b></Link> — {t("dup_attach")}</span></div>}
    <div className="grid g2"><label className="f">{t("country")}<select className="inp" value={f.country} onChange={set("country")}>{Object.keys(FLAGS).map((c) => <option key={c} value={c}>{FLAGS[c]} {c}</option>)}</select></label>
      <label className="f">{t("language")}<select className="inp" value={f.language} onChange={set("language")}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="fr">Français</option><option value="es">Español</option><option value="it">Italiano</option><option value="ru">Русский</option><option value="nl">Nederlands</option></select></label></div>
    <div className="grid g2"><label className="f">{t("source")}<select className="inp" value={f.source} onChange={set("source")}>{sources.map((s) => <option key={s} value={s}>{t("src_" + s)}</option>)}</select></label>
      <label className="f">{t("temp")}<select className="inp" value={f.temperature} onChange={set("temperature")}>{["hot", "warm", "cold"].map((x) => <option key={x} value={x}>{TEMP[x]} {t("temp_" + x)}</option>)}</select></label></div>
    <label className="f">{t("interest")}<input className="inp" value={f.interest} onChange={set("interest")} placeholder="All-on-4, veneers…" /></label>
    <label className="f">{t("owner")}<select className="inp" value={f.ownerId} onChange={set("ownerId")}><option value="">{t("auto_assign")}</option>{team?.members?.filter((m: any) => m.active && m.canOwnLeads).map((m: any) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
    <label className="f">{t("issue")}<textarea className="inp" value={f.issue} onChange={set("issue")} /></label>
    <div className="alert info"><Icon n="info" /><span>{t("wf_hint")}</span></div>
  </Drawer>;
}
