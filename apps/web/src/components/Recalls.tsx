// Recall: kural düzenleyici, yaklaşan liste, lead kartı
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, del } from "../lib/api.ts";
import { Drawer, Spinner, Switch, toast, toastErr, Modal } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { useCatalog } from "../lib/catalog.ts";
import { tn } from "@dentaflow/core/engine";

export function RecallRulesDrawer({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT(); const qc = useQueryClient(); const { cat } = useCatalog();
  const { data } = useQuery({ queryKey: ["recall-rules"], queryFn: () => get<any[]>("/api/recall-rules") });
  const { data: seqs } = useQuery({ queryKey: ["sequences"], queryFn: () => get<any[]>("/api/sequences") });
  const r = () => qc.invalidateQueries({ queryKey: ["recall-rules"] });
  const save = async (id: string | null, b: any) => { try { if (id) await patch(`/api/recall-rules/${id}`, b); else await post("/api/recall-rules", b); r(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const items: [string, string][] = [...(cat?.treatments ?? []).filter((x: any) => x.active).map((x: any) => [x.id, tn(x.n, lang)] as [string, string]), ...(cat?.bundles ?? []).map((b: any) => [b.id, tn(b.n, lang)] as [string, string])];
  const nameOf = (id: string) => items.find((x) => x[0] === id)?.[1] ?? id;
  const [pick, setPick] = useState<Record<string, string>>({});
  return <Drawer title={t("recall_rules")} onClose={onClose} width={860}>
    <div className="alert info" style={{ marginBottom: 10 }}><Icon n="info" /><span>{t("recall_rules_hint")}</span></div>
    {!data ? <Spinner /> : <div className="col" style={{ gap: 8 }}>{data.map((x) => <div key={x.id} className="card pad" style={{ padding: 12, opacity: x.active ? 1 : 0.5 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <Switch checked={x.active} onChange={(v) => save(x.id, { active: v })} />
        <input className="inp sm grow" defaultValue={x.name} onBlur={(e) => e.target.value !== x.name && save(x.id, { name: e.target.value })} />
        <span className="small muted">{t("after")}</span><input className="inp sm num" style={{ width: 70 }} type="number" min={1} defaultValue={x.afterDays} onBlur={(e) => save(x.id, { afterDays: +e.target.value })} /><span className="small muted">{t("days")}</span>
        <span className="small muted">↻</span><input className="inp sm num" style={{ width: 70 }} type="number" min={30} placeholder="—" defaultValue={x.repeatDays ?? ""} onBlur={(e) => save(x.id, { repeatDays: e.target.value ? +e.target.value : null })} />
        <select className="inp sm" style={{ width: "auto" }} value={x.sequenceId ?? ""} onChange={(e) => save(x.id, { sequenceId: e.target.value || null })}><option value="">{t("no_sequence")}</option>{(seqs ?? []).map((s) => <option key={s.id} value={s.id}>⚡ {s.name}</option>)}</select>
        <span className="tiny muted">{x.scheduled} {t("scheduled")}</span>
      </div>
      <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>{(x.match as string[]).length ? (x.match as string[]).map((m) => <span key={m} className="chip" style={{ height: 24 }}>{nameOf(m)} <span role="button" onClick={() => save(x.id, { match: x.match.filter((y: string) => y !== m) })}>×</span></span>) : <span className="tiny muted">{t("any_treatment")}</span>}
        <select className="inp sm" style={{ width: 200 }} value={pick[x.id] ?? ""} onChange={(e) => { if (e.target.value) save(x.id, { match: [...new Set([...(x.match as string[]), e.target.value])] }); setPick({ ...pick, [x.id]: "" }); }}><option value="">+ {t("treatment")}</option>{items.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    </div>)}
      <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => save(null, { name: t("new_recall_rule"), afterDays: 180, match: [] })}><Icon n="plus" />{t("new_recall_rule")}</button></div>}
  </Drawer>;
}

export function UpcomingRecalls() {
  const { t, date } = useT(); const qc = useQueryClient(); const can = useCan();
  const [days, setDays] = useState(90);
  const { data } = useQuery({ queryKey: ["recalls", days], queryFn: () => get<any[]>(`/api/recalls?status=scheduled&days=${days}`) });
  return <div className="card" style={{ marginTop: 14 }}><div className="hd"><h3 className="grow">📅 {t("upcoming_recalls")}</h3><div className="seg">{[30, 90, 365].map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}g</button>)}</div></div>
    {!data ? <Spinner /> : !data.length ? <div className="empty small">{t("none")}</div> : <div className="twrap"><table className="tbl"><tbody>{data.map((r) => <tr key={r.id}>
      <td className="small num">{date(r.dueAt)}</td><td><Link href={`/leads/${r.leadId}`}><b>{r.fullName}</b></Link></td><td className="small muted">{r.title}</td><td className="small muted">{r.ownerName ?? "—"}</td>
      <td style={{ whiteSpace: "nowrap" }}>{can("lead.write") && <><button className="btn xs ghost" title={t("activate_now")} onClick={async () => { await patch(`/api/recalls/${r.id}`, { dueAt: new Date().toISOString() }); toast(t("recall_soon")); qc.invalidateQueries({ queryKey: ["recalls"] }); }}>▶</button>
        <button className="btn xs ghost danger" onClick={async () => { await patch(`/api/recalls/${r.id}`, { status: "canceled" }); qc.invalidateQueries({ queryKey: ["recalls"] }); }}><Icon n="x" /></button></>}</td></tr>)}</tbody></table></div>}
  </div>;
}

export function LeadRecallsCard({ leadId }: { leadId: string }) {
  const { t, date } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data } = useQuery({ queryKey: ["recalls", "lead", leadId], queryFn: () => get<any[]>(`/api/recalls?leadId=${leadId}`) });
  const [add, setAdd] = useState(false); const [f, setF] = useState({ title: "", date: "" });
  if (!data) return null;
  if (!data.length && !can("lead.write")) return null;
  const save = async () => { try { await post(`/api/leads/${leadId}/recalls`, { title: f.title, dueAt: new Date(f.date + "T09:00:00").toISOString() }); setAdd(false); setF({ title: "", date: "" }); qc.invalidateQueries({ queryKey: ["recalls", "lead", leadId] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  const ST: Record<string, string> = { scheduled: "info", active: "warn", done: "ok", canceled: "" };
  return <div className="card"><div className="hd"><h2 className="grow">📅 Recall</h2>{can("lead.write") && <button className="btn sm" onClick={() => setAdd(true)}><Icon n="plus" /></button>}</div><div className="bd col" style={{ gap: 4 }}>
    {!data.length ? <div className="empty small">{t("none")}</div> : data.map((r) => <div key={r.id} className="row small" style={{ gap: 6 }}><span className="num muted" style={{ width: 90 }}>{date(r.dueAt)}</span><span className="grow">{r.title}</span><span className={"bdg " + ST[r.status]}>{t("rs_" + r.status)}</span></div>)}
    {add && <Modal onClose={() => setAdd(false)} width={420}><div className="hd"><h2 className="grow">Recall</h2></div><div className="bd col" style={{ gap: 10 }}>
      <input className="inp" placeholder={t("recall_title_ph")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button className="btn" onClick={() => setAdd(false)}>{t("cancel")}</button><button className="btn pri" disabled={!f.title || !f.date} onClick={save}>{t("save")}</button></div></div></Modal>}
  </div></div>;
}
