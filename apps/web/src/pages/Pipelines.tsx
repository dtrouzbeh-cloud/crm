// Pipeline'lar: sekmeli panolar (sürükle-bırak), tahmin, aşama analitiği, SLA uyarıları, aşama düzenleyici
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, del, qs } from "../lib/api.ts";
import { PageHead, Spinner, Drawer, Modal, toast, toastErr, Avatar, Switch, confirmBox } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { TEMP, flag, stageLabel } from "../lib/format.tsx";

const pname = (p: any, lang: string) => p.name?.[lang] ?? p.name?.default ?? p.name?.en ?? p.kind;
const dur = (s: number | null | undefined) => (s == null ? "—" : s < 3600 ? Math.round(s / 60) + " dk" : s < 86400 ? (s / 3600).toFixed(1) + " sa" : (s / 86400).toFixed(1) + " g");

export default function Pipelines() {
  const { t, lang } = useT(); const can = useCan(); const [, nav] = useLocation(); const qc = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const { data: pls } = useQuery({ queryKey: ["pipelines"], queryFn: () => get<any[]>("/api/pipelines") });
  const [edit, setEdit] = useState(false); const [q, setQ] = useState(""); const [status, setStatus] = useState("open");
  const p = pls?.find((x) => x.id === id) ?? pls?.find((x) => x.active);
  const { data: board } = useQuery({ queryKey: ["pboard", p?.id, q, status], queryFn: () => get(`/api/pipelines/${p!.id}/board` + qs({ q, status })), enabled: !!p });
  const { data: an } = useQuery({ queryKey: ["panalytics", p?.id], queryFn: () => get(`/api/pipelines/${p!.id}/analytics`), enabled: !!p && can("reports.view") });
  if (!pls || !p) return <Spinner />;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["pboard"] }); qc.invalidateQueries({ queryKey: ["pipelines"] }); qc.invalidateQueries({ queryKey: ["leads"] }); };
  return <><PageHead title={t("nav_pipelines")} sub={t("pipelines_sub")} actions={can("settings.manage") && <button className="btn" onClick={() => setEdit(true)}><Icon n="gear" />{t("edit_stages")}</button>} />
    <div className="tabs" style={{ marginBottom: 12 }}>{pls.filter((x) => x.active).map((x) => <button key={x.id} className={x.id === p.id ? "on" : ""} onClick={() => nav(`/pipelines/${x.id}`)}>
      <span className="dot" style={{ background: x.color }} />{pname(x, lang)}<span className="bdg">{x.stages.filter((s: any) => !s.isWon && !s.isLost).reduce((a: number, s: any) => a + s.count, 0)}</span></button>)}</div>
    <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
      <input className="inp" style={{ width: 220 }} placeholder={t("filter_ph")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg">{["open", "won", "lost", "all"].map((s) => <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{t("ps_" + s)}</button>)}</div></div>
    {an?.forecast?.length > 0 && <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>{an.forecast.map((f: any) => <div key={f.currency} className="card pad" style={{ padding: "10px 14px" }}>
      <div className="tiny muted">{t("forecast")} · {f.currency} · {f.n} lead</div><div className="row" style={{ gap: 12 }}><b className="num" style={{ fontSize: 18 }}>{(f.weighted / 100).toLocaleString(lang, { style: "currency", currency: f.currency, maximumFractionDigits: 0 })}</b>
        <span className="small muted">/ {(f.pipeline / 100).toLocaleString(lang, { style: "currency", currency: f.currency, maximumFractionDigits: 0 })} {t("pipeline_total")}</span></div></div>)}</div>}
    {!board ? <Spinner /> : <Board board={board} analytics={an} onMoved={refresh} />}
    {edit && <StageEditor pipeline={p} onClose={() => { setEdit(false); refresh(); }} />}
  </>;
}

function Board({ board, analytics, onMoved }: { board: any; analytics: any; onMoved: () => void }) {
  const { t, lang, rel, money } = useT(); const [, nav] = useLocation(); const can = useCan();
  const [drag, setDrag] = useState<any>(null); const [over, setOver] = useState<string | null>(null); const [lost, setLost] = useState<any>(null);
  const p = board.pipeline, isSales = p.kind === "sales";
  const stages = (board.stages as any[]).filter((s) => !s.hidden);
  const am = Object.fromEntries((analytics?.stages ?? []).map((s: any) => [s.key, s]));
  const move = async (it: any, st: any, lostReason?: string) => {
    if (isSales && st.key === "lost" && !lostReason) { setLost({ it, st }); return; }
    try { await post(`/api/pipelines/${p.id}/move`, isSales ? { leadId: it.leadId, stageId: st.id, lostReason } : { itemId: it.itemId, stageId: st.id }); onMoved(); toast(t("moved_to", { s: label(st) })); } catch (e) { toastErr(e); }
  };
  const label = (st: any) => (isSales ? stageLabel(t, st.key) : st.name?.[lang] ?? st.name?.default ?? st.key);
  return <><div className="kanban">{stages.map((st) => { const items = (board.items as any[]).filter((i) => i.stageKey === st.key);
    const sum: Record<string, number> = {}; for (const i of items) if (Number(i.valueMinor) > 0 && i.currency) sum[i.currency] = (sum[i.currency] ?? 0) + Number(i.valueMinor);
    return <div key={st.id} className={"kcol" + (over === st.id ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(st.id); }} onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); setOver(null); if (drag && drag.stageKey !== st.key && can("lead.write")) move(drag, st); setDrag(null); }}>
      <div className="kh" style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}>
        <div className="row" style={{ gap: 6 }}><span className="dot" style={{ background: st.color }} /><span className="grow">{label(st)}</span><span className="bdg">{items.length}</span></div>
        <div className="row tiny muted" style={{ gap: 8 }}>{st.probability > 0 && !st.isWon && <span title={t("probability")}>%{st.probability}</span>}{st.slaMinutes && <span title="SLA">⏱ {dur(st.slaMinutes * 60)}</span>}
          {am[st.key]?.medianSeconds != null && <span title={t("median_time")}>⌀ {dur(am[st.key].medianSeconds)}</span>}<span className="grow" />{Object.entries(sum).map(([c, v]) => <span key={c}>{money(v / 100, c)}</span>)}</div></div>
      <div className="kb">{items.map((it) => <div key={it.itemId ?? it.leadId} className={"kcard" + (drag && (drag.itemId ?? drag.leadId) === (it.itemId ?? it.leadId) ? " drag" : "")} draggable={can("lead.write")}
        onDragStart={() => setDrag(it)} onDragEnd={() => setDrag(null)} onClick={() => nav(`/leads/${it.leadId}`)} style={it.slaBreachedAt ? { borderColor: "var(--err)" } : undefined}>
        <div className="row"><b className="grow">{it.fullName}</b>{TEMP[it.temperature]}</div>
        <div className="row tiny muted" style={{ gap: 6 }}><span>{flag(it.country)} #{it.number}</span><span className="grow">{t("src_" + it.source)}</span>{Number(it.valueMinor) > 0 && it.currency ? <b>{money(Number(it.valueMinor) / 100, it.currency)}</b> : null}</div>
        {it.dueAt && <div className="tiny" style={{ color: new Date(it.dueAt) < new Date() ? "var(--err)" : "var(--muted)" }}>📅 {new Date(it.dueAt).toLocaleDateString(lang)}</div>}
        {it.note && <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.note}</div>}
        <div className="row tiny muted" style={{ gap: 6 }}>{it.ownerName && <Avatar name={it.ownerName} sm />}<span className="grow">{rel(it.stageEnteredAt)}</span>{it.slaBreachedAt && <span className="bdg err">⏱ SLA</span>}</div>
      </div>)}</div></div>; })}</div>
    {lost && <LostModal onClose={() => setLost(null)} onOk={(r) => { move(lost.it, lost.st, r); setLost(null); }} />}</>;
}

function LostModal({ onClose, onOk }: { onClose: () => void; onOk: (reason: string) => void }) {
  const { t } = useT(); const [r, setR] = useState("");
  return <Modal onClose={onClose} width={420}><div className="hd"><h2 className="grow">{t("lost_reason")}</h2></div><div className="bd col" style={{ gap: 6 }}>
    {["ghosted", "after_photos", "after_offer", "price", "other_clinic", "health", "timing", "other"].map((k) => <label key={k} className="row small" style={{ gap: 8 }}><input type="radio" checked={r === k} onChange={() => setR(k)} />{t("lr_" + k)}</label>)}
    <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" disabled={!r} onClick={() => onOk(r)}>{t("save")}</button></div></div></Modal>;
}

function StageEditor({ pipeline, onClose }: { pipeline: any; onClose: () => void }) {
  const { t, lang } = useT(); const qc = useQueryClient();
  const { data: pls } = useQuery({ queryKey: ["pipelines"], queryFn: () => get<any[]>("/api/pipelines") });
  const p = pls?.find((x) => x.id === pipeline.id) ?? pipeline; const isSales = p.kind === "sales";
  const r = () => qc.invalidateQueries({ queryKey: ["pipelines"] });
  const save = async (id: string, b: any) => { try { await patch(`/api/pipeline-stages/${id}`, b); r(); } catch (e) { toastErr(e); } };
  const [nn, setNn] = useState("");
  const add = async () => { try { await post(`/api/pipelines/${p.id}/stages`, { name: { default: nn, [lang]: nn }, sort: (p.stages.at(-3)?.sort ?? 0) + 5 }); setNn(""); r(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const label = (st: any) => (isSales && !st.key.startsWith("c_") ? stageLabel(t, st.key) : st.name?.[lang] ?? st.name?.default ?? st.key);
  const reorder = async (i: number, d: number) => { const a = [...p.stages]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; for (const [k, st] of a.entries()) if (st.sort !== (k + 1) * 10) await patch(`/api/pipeline-stages/${st.id}`, { sort: (k + 1) * 10 }); r(); };
  return <Drawer title={t("edit_stages") + " · " + pname(p, lang)} onClose={onClose} width={860}>
    <div className="alert info" style={{ marginBottom: 10 }}><Icon n="info" /><span>{t("stages_hint")}</span></div>
    {!isSales && <div className="row wrap" style={{ gap: 10, marginBottom: 10 }}><Switch checked={p.active} onChange={async (v) => { await patch(`/api/pipelines/${p.id}`, { active: v }); r(); }} label={t("active")} />
      {(p.kind === "nurture" || p.kind === "aftercare") && <Switch checked={!!p.settings?.autoAdd} onChange={async (v) => { await patch(`/api/pipelines/${p.id}`, { settings: { autoAdd: v ? (p.kind === "nurture" ? "lead.lost" : "deal.won") : null } }); r(); }} label={t(p.kind === "nurture" ? "auto_add_lost" : "auto_add_won")} />}</div>}
    <table className="tbl"><thead><tr><th /><th>{t("stage")}</th><th>{t("color")}</th><th>%</th><th>SLA ({t("minutes")})</th><th>{t("hidden")}</th><th /></tr></thead><tbody>
      {p.stages.map((st: any, i: number) => <tr key={st.id}>
        <td style={{ whiteSpace: "nowrap" }}><button className="btn xs ghost icon" onClick={() => reorder(i, -1)}>↑</button><button className="btn xs ghost icon" onClick={() => reorder(i, 1)}>↓</button></td>
        <td>{isSales && !st.key.startsWith("c_") ? <span className="small">{label(st)} {st.isWon ? "🏆" : st.isLost ? "✖" : ""}</span> : <input className="inp sm" defaultValue={label(st)} onBlur={(e) => e.target.value !== label(st) && save(st.id, { name: { ...st.name, default: e.target.value, [lang]: e.target.value } })} />}<div className="tiny faint">{st.count} {t("records").toLowerCase()}</div></td>
        <td><input type="color" defaultValue={st.color} onBlur={(e) => save(st.id, { color: e.target.value })} style={{ width: 36, height: 28, border: 0, background: "none" }} /></td>
        <td><input className="inp sm num" style={{ width: 64 }} type="number" min={0} max={100} defaultValue={st.probability} onBlur={(e) => save(st.id, { probability: +e.target.value })} /></td>
        <td><input className="inp sm num" style={{ width: 90 }} type="number" min={0} defaultValue={st.slaMinutes ?? ""} placeholder="—" onBlur={(e) => save(st.id, { slaMinutes: e.target.value ? +e.target.value : null })} /></td>
        <td>{!(st.system && (st.isWon || st.isLost)) && <Switch checked={st.hidden} onChange={(v) => save(st.id, { hidden: v })} />}</td>
        <td>{!st.system && <button className="btn xs ghost icon danger" onClick={async () => {
          if (!(await confirmBox(t("delete"), label(st), t("delete"), true))) return;
          const target = p.stages.find((x: any) => x.id !== st.id && !x.isLost && !x.isWon);
          try { await del(`/api/pipeline-stages/${st.id}${st.count ? "?moveTo=" + target.id : ""}`); r(); toast(st.count ? t("stage_moved_to", { s: label(target) }) : t("deleted")); } catch (e) { toastErr(e); } }}><Icon n="trash" /></button>}</td></tr>)}
    </tbody></table>
    <div className="row" style={{ gap: 8, marginTop: 10 }}><input className="inp sm" style={{ maxWidth: 260 }} placeholder={t("new_stage_ph")} value={nn} onChange={(e) => setNn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nn && add()} /><button className="btn sm pri" disabled={!nn} onClick={add}><Icon n="plus" />{t("add")}</button></div>
  </Drawer>;
}
