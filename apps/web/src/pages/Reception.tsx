import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, qs } from "../lib/api.ts";
import { PageHead, Spinner, Drawer, toast, toastErr, Avatar, Empty } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { minor } from "../lib/format.tsx";

const ST_COL: Record<string, string> = { booked: "", confirmed: "info", arrived: "warn", in_chair: "brand", done: "ok", no_show: "err", canceled: "" };
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function Reception() {
  const { t, money, date } = useT(); const can = useCan(); const qc = useQueryClient();
  const [day, setDay] = useState(iso(new Date())); const [adding, setAdding] = useState(false);
  const { data } = useQuery({ queryKey: ["reception", day], queryFn: () => get("/api/reception/day?date=" + day), refetchInterval: 30_000 });
  const shift = (n: number) => { const d = new Date(day); d.setDate(d.getDate() + n); setDay(iso(d)); };
  const setStatus = async (id: string, status: string) => { try { await patch(`/api/appointments/${id}`, { status }); qc.invalidateQueries({ queryKey: ["reception"] }); } catch (e) { toastErr(e); } };
  const NEXT: Record<string, string> = { booked: "arrived", confirmed: "arrived", arrived: "in_chair", in_chair: "done" };
  return <>
    <PageHead title={t("nav_reception")} sub={date(day, { weekday: "long", day: "numeric", month: "long" })} actions={<>
      <button className="btn icon" onClick={() => shift(-1)}><Icon n="back" className="flip" /></button><input type="date" className="inp" style={{ width: "auto" }} value={day} onChange={(e) => setDay(e.target.value)} /><button className="btn icon" onClick={() => shift(1)}><Icon n="next" className="flip" /></button>
      <button className="btn" onClick={() => setDay(iso(new Date()))}>{t("g_today")}</button>{can("appointment.manage") && <button className="btn pri" onClick={() => setAdding(true)}><Icon n="plus" />{t("new_appt")}</button>}</>} />
    {!data ? <Spinner /> : <div className="grid ws2" style={{ gridTemplateColumns: "minmax(0,1fr) 320px", alignItems: "start" }}>
      <div className="card">{data.appointments.length ? <table className="tbl"><thead><tr><th>{t("time")}</th><th>{t("patient")}</th><th>{t("dentist")}</th><th>{t("translator")}</th><th>{t("status")}</th><th /></tr></thead><tbody>
        {data.appointments.map((a: any) => <tr key={a.id} style={a.status === "canceled" ? { opacity: 0.45 } : undefined}><td className="num"><b>{date(a.startAt, { hour: "2-digit", minute: "2-digit" })}</b><div className="tiny muted">{date(a.endAt, { hour: "2-digit", minute: "2-digit" })}{a.chair ? ` · ${a.chair}` : ""}</div></td>
          <td><div className="row"><Avatar name={a.fullName ?? a.title} sm /><div><b>{a.fullName ?? "—"}</b><div className="tiny muted">{a.title}{a.visitNo ? ` · V${a.visitNo}` : ""} {a.language ? `· ${a.language}` : ""}</div></div></div></td>
          <td className="small">{a.dentistName ?? "—"}</td><td className="small">{a.translatorName ?? "—"}</td><td><span className={"bdg " + ST_COL[a.status]}>{t("as_" + a.status)}</span></td>
          <td className="r">{can("appointment.manage") && NEXT[a.status] && <button className="btn sm" onClick={() => setStatus(a.id, NEXT[a.status]!)}>{t("as_" + NEXT[a.status])} →</button>}
            {can("appointment.manage") && ["booked", "confirmed"].includes(a.status) && <button className="btn sm ghost" onClick={() => setStatus(a.id, "no_show")}>{t("as_no_show")}</button>}
            {a.dealId && <Link className="btn sm ghost icon" href={`/deals/${a.dealId}`}><Icon n="deal" /></Link>}</td></tr>)}</tbody></table> : <Empty icon="cal" text={t("no_appts")} />}</div>
      <div className="col" style={{ gap: 12 }}>
        <div className="card"><div className="hd"><h3 className="grow"><Icon n="plane" size={15} /> {t("arrivals")}</h3><span className="bdg">{data.arrivals.length}</span></div><div className="bd col">{data.arrivals.length ? data.arrivals.map((x: any) => <Link key={x.dealId + x.visitNo} href={`/deals/${x.dealId}`} className="row small" style={{ color: "inherit" }}><b className="num">{date(x.arrivalAt, { hour: "2-digit", minute: "2-digit" })}</b><span className="grow">{x.fullName}</span><span className="bdg">V{x.visitNo}</span></Link>) : <div className="empty small">—</div>}</div></div>
        {data.takings.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("day_takings")}</h3></div><div className="bd col">{data.takings.map((x: any, i: number) => <div key={i} className="row small"><span className="grow">{t("pmeth_" + x.method)} ({x.n})</span><b className="num">{money(minor(x.total), x.currency)}</b></div>)}</div></div>}
        <div className="card"><div className="hd"><h3 className="grow">{t("staff")}</h3></div><div className="bd col">{data.staff.map((s: any) => <div key={s.userId} className="row small"><Avatar name={s.name} sm /><span className="grow">{s.name}</span><span className="tiny muted">{t("role_" + s.role)}</span></div>)}</div></div>
      </div></div>}
    {adding && <ApptDrawer day={day} staff={data?.staff ?? []} onClose={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["reception"] }); }} />}
  </>;
}

function ApptDrawer({ day, staff, onClose }: { day: string; staff: any[]; onClose: () => void }) {
  const { t } = useT(); const [q, setQ] = useState("");
  const { data: deals } = useQuery({ queryKey: ["deals", "open"], queryFn: () => get<any[]>("/api/deals?status=open") });
  const [f, setF] = useState({ dealId: "", title: "", start: `${day}T10:00`, mins: 60, dentistId: "", translatorId: "", chair: "", visitNo: 1 });
  const save = async () => { const deal = deals?.find((d) => d.id === f.dealId); const s = new Date(f.start); try {
    await post("/api/appointments", { title: f.title || (deal ? `${deal.fullName} · V${f.visitNo}` : t("new_appt")), startAt: s.toISOString(), endAt: new Date(s.getTime() + f.mins * 60000).toISOString(), dealId: f.dealId || null, visitNo: f.dealId ? f.visitNo : null, dentistId: f.dentistId || null, translatorId: f.translatorId || null, chair: f.chair || null });
    toast(t("saved")); onClose(); } catch (e) { toastErr(e); } };
  return <Drawer title={t("new_appt")} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" onClick={save}>{t("save")}</button></>}>
    <label className="f">{t("patient")} / {t("deal")}<input className="inp sm" placeholder={t("filter_ph")} value={q} onChange={(e) => setQ(e.target.value)} /><select className="inp" size={5} value={f.dealId} onChange={(e) => setF({ ...f, dealId: e.target.value })}>{(deals ?? []).filter((d) => !q || d.fullName.toLowerCase().includes(q.toLowerCase())).map((d) => <option key={d.id} value={d.id}>{d.fullName} · #{d.number}</option>)}</select></label>
    <div className="grid g2"><label className="f">{t("visit")}<input className="inp" type="number" min={1} value={f.visitNo} onChange={(e) => setF({ ...f, visitNo: +e.target.value })} /></label><label className="f">{t("title")}<input className="inp" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label></div>
    <div className="grid g2"><label className="f">{t("time")}<input className="inp" type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label><label className="f">{t("duration_min")}<input className="inp" type="number" step={15} value={f.mins} onChange={(e) => setF({ ...f, mins: +e.target.value })} /></label></div>
    <div className="grid g2"><label className="f">{t("dentist")}<select className="inp" value={f.dentistId} onChange={(e) => setF({ ...f, dentistId: e.target.value })}><option value="">—</option>{staff.filter((s) => s.role !== "translator").map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}</select></label>
      <label className="f">{t("translator")}<select className="inp" value={f.translatorId} onChange={(e) => setF({ ...f, translatorId: e.target.value })}><option value="">—</option>{staff.filter((s) => s.role === "translator").map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}</select></label></div>
    <label className="f">{t("chair")}<input className="inp" value={f.chair} placeholder="1, 2, OP-A…" onChange={(e) => setF({ ...f, chair: e.target.value })} /></label>
  </Drawer>;
}
