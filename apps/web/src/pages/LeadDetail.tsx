import { useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, put, del } from "../lib/api.ts";
import { Spinner, ErrorBox, toast, toastErr, Avatar, Modal, confirmBox, Empty } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useMe, useCan } from "../lib/auth.ts";
import { LEAD_STAGES, salesStageOrder, StageBadge, stageLabel, TEMP, flag, FLAGS, QuoteBadge, CaseBadge, minor } from "../lib/format.tsx";
import { LANG_NAMES } from "@dentaflow/core/i18n";
import { eventText } from "./Dashboard.tsx";
import { TaskRow, NewTaskDrawer } from "./Tasks.tsx";
import { FormsCard } from "../components/FormsCard.tsx";
import { CustomFieldsCard } from "./settings/Fields.tsx";
import { SequencesCard, ConsentCard } from "../components/LeadAutomation.tsx";

const MED = ["diabetes", "anticoag", "bisph", "pregnant", "chemo", "smoker", "heart", "allergy"];

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>(); const { t, rel, date, money } = useT(); const can = useCan(); const qc = useQueryClient(); const [, nav] = useLocation();
  const { data: me } = useMe(); const search = useSearch();
  const { data, error, refetch } = useQuery({ queryKey: ["lead", id], queryFn: () => get(`/api/leads/${id}`) });
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => get<any[]>("/api/partners") });
  const { data: cases } = useQuery({ queryKey: ["cases", "lead", id], queryFn: async () => (await get("/api/cases?limit=200")).items.filter((c: any) => c.leadId === id), enabled: can("case.read") });
  const [note, setNote] = useState(""); const [evType, setEvType] = useState("note"); const [lost, setLost] = useState(new URLSearchParams(search).has("lost")); const [addTask, setAddTask] = useState(false);
  if (error) return <ErrorBox error={error} retry={refetch} />;
  if (!data) return <Spinner />;
  const l = data.lead, med = data.medical;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["lead", id] }); qc.invalidateQueries({ queryKey: ["leads"] }); };
  const save = async (body: Record<string, unknown>) => { try { await patch(`/api/leads/${id}`, body); refresh(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const addEvent = async () => { if (!note.trim()) return; try { await post(`/api/leads/${id}/events`, { type: evType, body: note }); setNote(""); refresh(); } catch (e) { toastErr(e); } };
  const openCase = async () => { try { const r = await post("/api/cases", { leadId: id }); qc.invalidateQueries({ queryKey: ["cases"] }); nav(`/cases/${r.id}`); } catch (e) { toastErr(e); } };
  const saveMed = async (m: any) => { try { await put(`/api/leads/${id}/medical`, m); refresh(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const Field = ({ k, label, type, opts, val }: { k: string; label: string; type?: string; opts?: [string, string][]; val?: any }) => {
    const v = val ?? l[k] ?? "";
    return <label className="f">{label}{opts ? <select className="inp sm" defaultValue={v} disabled={!can("lead.write")} onChange={(e) => save({ [k]: e.target.value || null })}>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
      : <input className="inp sm" type={type} defaultValue={v} disabled={!can("lead.write")} onBlur={(e) => e.target.value !== String(v) && save({ [k]: e.target.value || null })} />}</label>;
  };
  const openCaseObj = cases?.[0];
  const phoneOk = l.phone && !String(l.phone).includes("•");
  return <>
    <div className="row wrap" style={{ marginBottom: 14 }}><Link href="/leads" className="btn ghost sm"><Icon n="back" className="flip" />{t("nav_leads")}</Link></div>
    <div className="card pad" style={{ marginBottom: 14 }}><div className="row wrap" style={{ gap: 14 }}>
      <Avatar name={l.fullName} size={52} />
      <div className="grow"><div className="row wrap"><h1>{l.fullName}</h1><span>{TEMP[l.temperature]}</span><span className="tiny faint">#{l.number}</span></div>
        <div className="row wrap small muted" style={{ marginTop: 4, gap: 10 }}><span>{flag(l.country)} {l.country}</span><span>{LANG_NAMES[l.language] ?? l.language ?? ""}</span><span>{t("src_" + l.source)}</span><span>{t("created")} {rel(l.createdAt)}</span>
          {med?.flags?.length ? <span className="bdg err"><Icon n="alert" size={12} /> {med.flags.map((f: string) => t("med_" + f)).join(", ")}</span> : null}</div></div>
      <select className="inp" style={{ width: "auto" }} value={l.stage} disabled={!can("lead.write")} onChange={(e) => e.target.value === "lost" ? setLost(true) : save({ stage: e.target.value })}>{(salesStageOrder().includes(l.stage) ? salesStageOrder() : [...salesStageOrder(), l.stage]).map((s) => <option key={s} value={s}>{stageLabel(t, s)}</option>)}</select>
      {phoneOk && <><a className="btn" href={`tel:${l.phone}`}><Icon n="phone" />{t("call")}</a><button className="btn" style={{ color: "#16A34A" }} onClick={async () => { try { const r = await post("/api/inbox/start", { leadId: id }); nav(`/inbox/${r.id}`); } catch { window.open(`https://wa.me/${l.phone.replace(/\D/g, "")}`, "_blank"); } }}><Icon n="wa" />WhatsApp</button></>}
      {openCaseObj ? <Link className="btn pri" href={`/cases/${openCaseObj.id}`}><Icon n="tooth" />{t("go_case")}</Link> : can("case.write") && <button className="btn pri" onClick={openCase}><Icon n="tooth" />{t("open_case")}</button>}
    </div></div>
    <div className="grid ldgrid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", alignItems: "start" }} id="ldGrid">
      <div className="col" style={{ gap: 14 }}>
        <div className="card"><div className="hd"><h2 className="grow">{t("lead_info")}</h2><span className="tiny faint">{t("autosave")}</span></div><div className="bd grid g2" key={l.updatedAt}>
          <Field k="fullName" label={t("full_name")} /><Field k="phone" label={t("phone")} /><Field k="email" label={t("email")} type="email" />
          <Field k="country" label={t("country")} opts={Object.keys(FLAGS).map((c) => [c, FLAGS[c] + " " + c])} />
          <Field k="language" label={t("language")} opts={[["", "—"], ...Object.entries(LANG_NAMES)]} />
          <Field k="source" label={t("source")} opts={((me?.clinic?.settings?.leadSources as string[]) ?? [l.source]).map((s) => [s, t("src_" + s)])} />
          {(partners?.length || l.partnerId) ? <Field k="partnerId" label={t("partner")} opts={[["", "—"], ...(partners ?? []).filter((p: any) => p.active || p.id === l.partnerId).map((p: any) => [p.id, p.name] as [string, string])]} /> : null}
          <Field k="temperature" label={t("temp")} opts={["hot", "warm", "cold"].map((x) => [x, TEMP[x] + " " + t("temp_" + x)])} />
          {can("lead.assign") ? <Field k="ownerId" label={t("owner")} opts={[["", "—"], ...(team?.members ?? []).filter((m: any) => m.active).map((m: any) => [m.userId, m.name])]} /> : <label className="f">{t("owner")}<input className="inp sm" disabled value={l.ownerName ?? "—"} /></label>}
          <Field k="interest" label={t("interest")} /><Field k="budget" label={t("budget")} /><Field k="travelWindow" label={t("travel_window")} /><Field k="campaign" label="Kampanya" />
          <label className="f" style={{ gridColumn: "1/-1" }}>{t("issue")}<textarea className="inp" defaultValue={l.issue ?? ""} disabled={!can("lead.write")} onBlur={(e) => e.target.value !== (l.issue ?? "") && save({ issue: e.target.value })} /></label>
        </div></div>
        <CustomFieldsCard values={l.custom ?? {}} editable={can("lead.write")} onSave={(cf) => save({ custom: cf })} />
        {med !== undefined && <MedicalCard med={med} onSave={saveMed} editable={can("lead.write") && me?.perms?.["field.medical"] === "show"} />}
        <div className="card"><div className="hd"><h2 className="grow">{t("timeline")}</h2></div><div className="bd col">
          {can("lead.write") && <div className="col" style={{ gap: 6 }}><div className="seg" style={{ alignSelf: "flex-start" }}>{["note", "call", "whatsapp", "email", "meeting"].map((x) => <button key={x} className={evType === x ? "on" : ""} onClick={() => setEvType(x)}>{t("ev_" + x)}</button>)}</div>
            <div className="row"><input className="inp" value={note} placeholder={t("add_note_ph")} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEvent()} /><button className="btn" onClick={addEvent}>{t("add")}</button></div></div>}
          <div className="timeline">{data.events.map((e: any) => <div key={e.id} className="ev"><div className="small">{eventText(t, e)}</div><div className="tiny faint">{e.userName ? e.userName + " · " : ""}{date(e.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div>)}</div>
        </div></div>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <div className="card"><div className="hd"><h2 className="grow">{t("nav_tasks")}</h2><button className="btn sm" onClick={() => setAddTask(true)}><Icon n="plus" /></button></div><div className="bd" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="tlist">{data.tasks.length ? data.tasks.map((x: any) => <TaskRow key={x.id} task={{ ...x, leadId: null }} />) : <div className="empty small">{t("no_tasks")}</div>}</div></div></div>
        {cases?.length ? <div className="card"><div className="hd"><h2 className="grow">{t("case")}</h2></div><div className="bd col">{cases.map((c: any) => <Link key={c.id} href={`/cases/${c.id}`} className="row" style={{ color: "inherit" }}><b>#{c.number}</b><span className="grow small muted">{rel(c.createdAt)}</span><CaseBadge s={c.status} />{c.lastQuote && <QuoteBadge s={c.lastQuote.status} />}</Link>)}</div></div>
          : can("case.write") && <div className="card pad"><p className="small muted" style={{ margin: "0 0 10px" }}>{t("open_case_hint")}</p><button className="btn pri" onClick={openCase}><Icon n="tooth" />{t("open_case")}</button></div>}
        <FormsCard leadId={id} email={l.email} phone={l.phone} />
        <SequencesCard leadId={id} />
        <ConsentCard leadId={id} />
        {data.otherLeads.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("other_leads")}</h3></div><div className="bd col">{data.otherLeads.map((o: any) => <Link key={o.id} href={`/leads/${o.id}`} className="row" style={{ color: "inherit" }}>#{o.number}<span className="grow tiny muted">{date(o.createdAt)}</span><StageBadge s={o.stage} /></Link>)}</div></div>}
        {can("lead.delete") && <div className="row"><button className="btn sm ghost" onClick={() => save({ archived: !l.archivedAt })}>{l.archivedAt ? t("unarchive") : t("archive")}</button><span className="grow" />
          <button className="btn sm ghost danger" onClick={async () => { if (await confirmBox(t("delete_lead"), l.fullName, t("delete"), true)) { await del(`/api/leads/${id}`); qc.invalidateQueries({ queryKey: ["leads"] }); nav("/leads"); } }}><Icon n="trash" />{t("delete")}</button></div>}
      </div>
    </div>
    {lost && <LostModal onClose={() => setLost(false)} onSave={async (r, n) => { await save({ stage: "lost", lostReason: r, lostNote: n }); setLost(false); }} reasons={me?.clinic?.settings?.lossReasons ?? ["other"]} />}
    {addTask && <NewTaskDrawer leadId={id} onClose={() => { setAddTask(false); refresh(); }} />}
  </>;
}

function MedicalCard({ med, onSave, editable }: { med: any; onSave: (m: any) => void; editable: boolean }) {
  const { t } = useT();
  const [m, setM] = useState({ flags: med?.flags ?? [], age: med?.age ?? null, medications: med?.medications ?? "", allergies: med?.allergies ?? "", notes: med?.notes ?? "" });
  const toggle = (f: string) => { const flags = m.flags.includes(f) ? m.flags.filter((x: string) => x !== f) : [...m.flags, f]; const n = { ...m, flags }; setM(n); onSave(n); };
  return <div className="card"><div className="hd"><h2 className="grow">{t("anamnesis")}</h2><span className="bdg info">{t("feeds_rules")}</span></div><div className="bd">
    <div className="row wrap" style={{ gap: 6 }}>{MED.map((f) => <button key={f} className={"chip" + (m.flags.includes(f) ? " on" : "")} disabled={!editable} onClick={() => toggle(f)}>{t("med_" + f)}</button>)}</div>
    <div className="grid g2" style={{ marginTop: 12 }}>
      <label className="f">{t("age")}<input className="inp sm" type="number" disabled={!editable} defaultValue={m.age ?? ""} onBlur={(e) => { const n = { ...m, age: e.target.value ? Number(e.target.value) : null }; setM(n); onSave(n); }} /></label>
      <label className="f">{t("med_note")}<input className="inp sm" disabled={!editable} defaultValue={m.medications} onBlur={(e) => { if (e.target.value === m.medications) return; const n = { ...m, medications: e.target.value }; setM(n); onSave(n); }} /></label>
      <label className="f" style={{ gridColumn: "1/-1" }}>{t("allergies")}<input className="inp sm" disabled={!editable} defaultValue={m.allergies} onBlur={(e) => { if (e.target.value === m.allergies) return; const n = { ...m, allergies: e.target.value }; setM(n); onSave(n); }} /></label>
    </div></div></div>;
}

function LostModal({ onClose, onSave, reasons }: { onClose: () => void; onSave: (r: string, n: string) => void; reasons: string[] }) {
  const { t } = useT(); const [r, setR] = useState(reasons[0] ?? "other"); const [n, setN] = useState("");
  return <Modal onClose={onClose}><div className="hd"><h2>{t("ds_lost")}</h2></div><div className="bd col">
    <label className="f">{t("lost_reason")}<select className="inp" value={r} onChange={(e) => setR(e.target.value)}>{reasons.map((x) => <option key={x} value={x}>{t("lr_" + x)}</option>)}</select></label>
    <label className="f">{t("note")}<textarea className="inp" value={n} onChange={(e) => setN(e.target.value)} /></label></div>
    <div className="ft"><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn danger" onClick={() => onSave(r, n)}>{t("ds_lost")}</button></div></Modal>;
}
