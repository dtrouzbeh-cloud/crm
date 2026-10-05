import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, put } from "../lib/api.ts";
import { PageHead, Spinner, Drawer, toast, toastErr, confirmBox, Avatar, Empty, Modal } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { minor, flag } from "../lib/format.tsx";
import { vcol } from "@dentaflow/core/chart";

const stageLabel = (t: (k: string, p?: any) => string, s: string) => s.startsWith("visit_") ? t("ds_v", { n: s.slice(6) }) : t("ds_" + s);

export default function Deals() {
  const { id } = useParams<{ id?: string }>(); const { t, money, date } = useT(); const [, nav] = useLocation(); const qc = useQueryClient(); const can = useCan();
  const [status, setStatus] = useState("open");
  const { data } = useQuery({ queryKey: ["deals", status], queryFn: () => get<any[]>("/api/deals?status=" + status) });
  const [drag, setDrag] = useState<any>(null); const [over, setOver] = useState<string | null>(null);
  const maxV = Math.max(2, ...(data ?? []).map((d) => d.visitCount));
  const stages = ["accepted", "deposit", "travel", ...Array.from({ length: maxV }, (_, i) => `visit_${i + 1}`), "won"];
  const move = async (d: any, s: string) => { const prev = d.stage; try { await patch(`/api/deals/${d.id}`, { stage: s }); qc.invalidateQueries({ queryKey: ["deals"] }); toast(t("moved_to", { s: stageLabel(t, s) }), async () => { await patch(`/api/deals/${d.id}`, { stage: prev }); qc.invalidateQueries({ queryKey: ["deals"] }); }); } catch (e) { toastErr(e); } };
  const sumBy = (cur: string, list: any[]) => list.filter((d) => d.currency === cur).reduce((a, d) => a + minor(d.valueMinor), 0);
  const curs = [...new Set((data ?? []).map((d) => d.currency))];
  return <>
    <PageHead title={t("nav_deals")} sub={data ? `${data.length} · ${curs.map((c) => money(sumBy(c, data), c)).join(" + ")}` : ""} actions={<div className="seg">{["open", "won", "lost", "postponed"].map((s) => <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{t("dst_" + s)}</button>)}</div>} />
    {!data ? <Spinner /> : status !== "open" ? <div className="card">{data.length ? <table className="tbl"><tbody>{data.map((d) => <tr key={d.id} className="click" onClick={() => nav(`/deals/${d.id}`)}><td><b>{d.title}</b></td><td className="num">{d.valueMinor != null ? money(minor(d.valueMinor), d.currency) : "•••"}</td><td className="small muted">{date(d.createdAt)}</td></tr>)}</tbody></table> : <Empty icon="deal" text={t("no_results")} />}</div>
      : <div className="kanban">{stages.map((s) => { const ds = data.filter((d) => d.stage === s);
        return <div key={s} className={"kcol" + (over === s ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); if (drag && drag.stage !== s && can("deal.write")) move(drag, s); setDrag(null); }}>
          <div className="kh">{s.startsWith("visit_") && <span className="dot" style={{ background: vcol(+s.slice(6)) }} />}{stageLabel(t, s)}<span className="bdg" style={{ marginInlineStart: "auto" }}>{ds.length}</span></div>
          <div className="tiny muted" style={{ padding: "0 12px 6px" }}>{curs.map((c) => sumBy(c, ds) ? money(sumBy(c, ds), c) : null).filter(Boolean).join(" + ") || "—"}</div>
          <div className="kb">{ds.map((d) => { const pct = d.valueMinor ? Math.min(100, Math.round((100 * Number(d.paidMinor)) / Number(d.valueMinor))) : 0; const nv = (d.visits ?? []).find((v: any) => v.arrival && new Date(v.arrival) > new Date());
            return <div key={d.id} className={"kcard" + (drag?.id === d.id ? " drag" : "")} draggable onDragStart={() => setDrag(d)} onDragEnd={() => setDrag(null)} onClick={() => nav(`/deals/${d.id}`)}>
              <b>{d.fullName}</b><div className="tiny muted">{flag(d.country)} #{d.number} · {d.title.split(" — ")[1] ?? ""}</div>
              <div className="row small"><span className="grow num">{d.valueMinor != null ? money(minor(d.valueMinor), d.currency) : "•••"}</span><span className="tiny muted">{pct}% {t("paid")}</span></div>
              <div className="prog"><i style={{ width: pct + "%" }} /></div>
              {nv && <div className="tiny muted"><Icon n="plane" size={12} /> {t("visit_n", { n: nv.no })} · {date(nv.arrival)}</div>}</div>; })}</div></div>; })}</div>}
    {id && <DealDrawer id={id} onClose={() => nav("/deals")} />}
  </>;
}

function DealDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, money, date } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data } = useQuery({ queryKey: ["deal", id], queryFn: () => get(`/api/deals/${id}`) });
  const { data: providers } = useQuery({ queryKey: ["payprov"], queryFn: () => get("/api/payment-providers"), enabled: can("settings.manage") || can("payment.record"), retry: false });
  const [pay, setPay] = useState({ amount: "", method: "cash", visitNo: 1, note: "" }); const [tab, setTab] = useState("money"); const [link, setLink] = useState<any>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["deal", id] }); qc.invalidateQueries({ queryKey: ["deals"] }); };
  if (!data) return <Drawer title="…" onClose={onClose}><Spinner /></Drawer>;
  const d = data.deal, M = (v: number) => money(minor(v), d.currency);
  const paid = data.payments.reduce((a: number, p: any) => a + Number(p.amountMinor), 0);
  const si = data.stages.indexOf(d.stage);
  const setStage = async (s: string) => { try { await patch(`/api/deals/${id}`, { stage: s }); refresh(); } catch (e) { toastErr(e); } };
  const addPay = async () => { const a = +pay.amount; if (!a) return; try { await post(`/api/deals/${id}/payments`, { amount: a, currency: d.currency, method: pay.method, visitNo: pay.visitNo, note: pay.note || undefined }); setPay({ ...pay, amount: "", note: "" }); refresh(); toast(t("payment_saved")); } catch (e) { toastErr(e); } };
  const noMoney = si >= 2 && !data.payments.length && Number(d.valueMinor) > 0;
  const activeProv = (providers?.connected ?? []).filter((p: any) => p.active);
  return <Drawer width={760} title={<span>{d.fullName} <span className="tiny faint">#{d.number}</span></span>} onClose={onClose}
    footer={can("deal.write") && <><button className="btn danger" onClick={async () => { if (await confirmBox(t("ds_lost"), t("lost_confirm"), t("ds_lost"), true)) { await patch(`/api/deals/${id}`, { status: "lost" }); refresh(); onClose(); } }}>{t("ds_lost")}</button>
      <button className="btn" onClick={async () => { await patch(`/api/deals/${id}`, { status: "postponed" }); refresh(); }}>{t("dst_postponed")}</button><span className="grow" />
      {si > 0 && <button className="btn" onClick={() => setStage(data.stages[si - 1])}>{t("back")}</button>}{si < data.stages.length - 1 && <button className="btn pri" onClick={() => setStage(data.stages[si + 1])}>{t("advance_to", { s: stageLabel(t, data.stages[si + 1]) })}</button>}</>}>
    <div className="row wrap" style={{ gap: 4 }}>{data.stages.map((s: string, k: number) => <span key={s} className={"bdg " + (k < si ? "ok" : k === si ? "brand" : "")}>{stageLabel(t, s)}</span>)}</div>
    {noMoney && <div className="alert warn"><Icon n="alert" /><span>{t("no_money_warn")}</span></div>}
    <div className="grid g3"><div className="card kpi"><span className="l">{t("deal_value")}</span><span className="v num" style={{ fontSize: 20 }}>{d.valueMinor != null ? M(d.valueMinor) : "•••"}</span></div>
      <div className="card kpi"><span className="l">{t("paid")}</span><span className="v num" style={{ fontSize: 20, color: "var(--ok)" }}>{M(paid)}</span></div>
      <div className="card kpi"><span className="l">{t("balance")}</span><span className="v num" style={{ fontSize: 20 }}>{d.valueMinor != null ? M(Number(d.valueMinor) - paid) : "•••"}</span></div></div>
    <div className="small muted"><Link href={`/leads/${d.leadId}`} onClick={onClose}>{t("lead")} →</Link>{d.caseId && <> · <Link href={`/cases/${d.caseId}`} onClick={onClose}>{t("case")} →</Link></>}{d.quoteId && <> · <Link href={`/quotes/${d.quoteId}`} onClick={onClose}>{t("quote")} →</Link></>} · {d.ownerName ?? ""}</div>
    <div className="tabs">{["money", "visits", "trip", "plan"].map((k) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t("dt_" + k)}</button>)}</div>
    {tab === "money" && <>
      {can("payment.record") && <><h3>{t("record_payment")}</h3><div className="row wrap"><input className="inp" type="number" placeholder={`${t("amount")} (${d.currency})`} style={{ width: 140 }} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
        <select className="inp" style={{ width: "auto" }} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{["cash", "pos", "card", "bank_transfer", "paypal", "link", "other"].map((m) => <option key={m} value={m}>{t("pmeth_" + m)}</option>)}</select>
        <select className="inp" style={{ width: "auto" }} value={pay.visitNo} onChange={(e) => setPay({ ...pay, visitNo: +e.target.value })}>{data.visits.map((v: any) => <option key={v.visitNo} value={v.visitNo}>{t("visit_n", { n: v.visitNo })}</option>)}</select>
        <input className="inp grow" placeholder={t("note")} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /><button className="btn pri" onClick={addPay}>{t("add")}</button></div>
        {activeProv.length > 0 && <div className="row wrap" style={{ gap: 6 }}><span className="small muted">{t("send_pay_link")}:</span>{activeProv.map((p: any) => <button key={p.provider} className="btn sm" onClick={async () => { const a = +pay.amount || minor(Number(d.valueMinor) - paid); try { setLink(await post(`/api/deals/${id}/payment-link`, { provider: p.provider, amount: a })); refresh(); } catch (e) { toastErr(e); } }}>{t("pm_" + p.provider)}</button>)}</div>}
        {link && <div className="alert ok" style={{ flexDirection: "column", alignItems: "stretch" }}>{link.checkoutUrl ? <><span className="code">{link.checkoutUrl}</span><div className="row"><button className="btn xs" onClick={() => { navigator.clipboard.writeText(link.checkoutUrl); toast(t("copied")); }}>{t("copy")}</button>
          {d.phone && <a className="btn xs" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${String(d.phone).replace(/\D/g, "")}?text=${encodeURIComponent(link.checkoutUrl)}`}>WhatsApp</a>}</div></> : <span>{t("reference")}: <b className="code">{link.referenceCode}</b> · IBAN {link.bank?.iban}</span>}</div>}</>}
      <h3>{t("payments")}</h3>
      {data.payments.length ? <table className="tbl"><tbody>{data.payments.map((p: any) => <tr key={p.id}><td className="small">{date(p.receivedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
        <td><span className={"bdg " + (p.kind === "payment" ? "ok" : "warn")}>{t("pk2_" + p.kind)}</span> <span className="small">{t("pmeth_" + p.method)}{p.provider ? ` · ${p.provider}` : ""}</span>{p.note && <div className="tiny muted">{p.note}</div>}</td>
        <td className="small muted">{(p.allocations ?? []).map((a: any) => `V${a.visitNo}`).join(", ")}</td><td className="r num"><b style={{ color: p.amountMinor < 0 ? "var(--err)" : undefined }}>{M(p.amountMinor)}</b></td>
        <td>{p.kind === "payment" && can("payment.refund") && <button className="btn xs ghost" onClick={async () => { const note = prompt(t("refund_reason")); if (!note) return; try { await post(`/api/deals/${id}/payments/${p.id}/reverse`, { note }); refresh(); } catch (e) { toastErr(e); } }}>{t("refund")}</button>}</td></tr>)}</tbody></table> : <div className="empty small">{t("no_payments")}</div>}
      {data.intents.filter((i: any) => i.status === "pending" && i.provider === "bank_transfer").map((i: any) => <div key={i.id} className="alert info"><Icon n="info" /><span className="grow">{t("pending_transfer")}: <b className="code">{i.referenceCode}</b> · {M(i.amountMinor)}</span>{can("payment.record") && <button className="btn sm" onClick={async () => { await post(`/api/payment-intents/${i.id}/confirm`); refresh(); toast(t("payment_saved")); }}>{t("confirm_received")}</button>}</div>)}
    </>}
    {tab === "visits" && <table className="tbl"><thead><tr><th>{t("visit")}</th><th>{t("arrival")}</th><th>{t("departure")}</th><th>{t("status")}</th><th className="r">{t("planned")}</th><th className="r">{t("paid")}</th></tr></thead><tbody>
      {data.visits.map((v: any) => <tr key={v.visitNo}><td><span className="dot" style={{ background: vcol(v.visitNo) }} /> {t("visit_n", { n: v.visitNo })}</td>
        <td><input type="datetime-local" className="inp sm" defaultValue={v.arrivalAt ? new Date(new Date(v.arrivalAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} disabled={!can("deal.write")} onChange={(e) => patch(`/api/deals/${id}/visits/${v.visitNo}`, { arrivalAt: e.target.value ? new Date(e.target.value).toISOString() : null }).then(refresh)} /></td>
        <td><input type="datetime-local" className="inp sm" defaultValue={v.departureAt ? new Date(new Date(v.departureAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} disabled={!can("deal.write")} onChange={(e) => patch(`/api/deals/${id}/visits/${v.visitNo}`, { departureAt: e.target.value ? new Date(e.target.value).toISOString() : null }).then(refresh)} /></td>
        <td><select className="inp sm" style={{ width: "auto" }} value={v.status} disabled={!can("deal.write")} onChange={(e) => patch(`/api/deals/${id}/visits/${v.visitNo}`, { status: e.target.value }).then(refresh)}>{["planned", "scheduled", "arrived", "in_treatment", "done", "canceled"].map((s) => <option key={s} value={s}>{t("vs_" + s)}</option>)}</select></td>
        <td className="r num">{M(v.plannedMinor)}{Number(v.upsellMinor) > 0 && <div className="tiny" style={{ color: "var(--ok)" }}>+{M(v.upsellMinor)}</div>}</td><td className="r num">{M(v.paidMinor)}</td></tr>)}</tbody></table>}
    {tab === "trip" && <TripEditor data={data} refresh={refresh} />}
    {tab === "plan" && <PlanProgress data={data} refresh={refresh} />}
  </Drawer>;
}

function TripEditor({ data, refresh }: { data: any; refresh: () => void }) {
  const { t, date } = useT(); const can = useCan(); const [no, setNo] = useState(1);
  const trip = data.trips.find((x: any) => x.visitNo === no) ?? { flight: {}, hotel: {} };
  const save = async (b: any) => { try { await put(`/api/deals/${data.deal.id}/trips/${no}`, b); refresh(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const F = trip.flight ?? {}, H = trip.hotel ?? {}, P = trip.passport ?? {};
  const fld = (label: string, val: any, on: (v: string) => void, type = "text") => <label className="f">{label}<input className="inp sm" type={type} defaultValue={val ?? ""} disabled={!can("trip.manage")} onBlur={(e) => e.target.value !== String(val ?? "") && on(e.target.value)} /></label>;
  const runs = data.runs.filter((r: any) => r.tripId === trip.id);
  return <div className="col" key={no + (trip.id ?? "")}>
    <div className="seg" style={{ alignSelf: "flex-start" }}>{data.visits.map((v: any) => <button key={v.visitNo} className={no === v.visitNo ? "on" : ""} onClick={() => setNo(v.visitNo)}>{t("visit_n", { n: v.visitNo })}</button>)}</div>
    <h3>🛂 {t("passport")}</h3>{trip.passport === null && data.trips.length && <div className="tiny muted">{t("hidden_by_role")}</div>}
    <div className="grid g2">{fld(t("full_name"), P.fullName, (v) => save({ passport: { ...P, fullName: v } }))}{fld(t("passport_no"), P.number, (v) => save({ passport: { ...P, number: v } }))}{fld(t("expiry"), P.expiry, (v) => save({ passport: { ...P, expiry: v } }), "date")}{fld(t("nationality"), P.nationality, (v) => save({ passport: { ...P, nationality: v } }))}</div>
    <h3>✈ {t("flight")}</h3>
    <div className="grid g3">{fld(t("outbound") + " no", F.outbound?.no, (v) => save({ flight: { outbound: { ...F.outbound, no: v } } }))}{fld(t("from"), F.outbound?.from, (v) => save({ flight: { outbound: { ...F.outbound, from: v } } }))}{fld(t("arrival"), F.outbound?.arr, (v) => save({ flight: { outbound: { ...F.outbound, arr: v } } }), "datetime-local")}
      {fld(t("return") + " no", F.return?.no, (v) => save({ flight: { return: { ...F.return, no: v } } }))}{fld(t("to"), F.return?.to, (v) => save({ flight: { return: { ...F.return, to: v } } }))}{fld(t("departure"), F.return?.dep, (v) => save({ flight: { return: { ...F.return, dep: v } } }), "datetime-local")}
      {fld("PNR", F.pnr, (v) => save({ flight: { pnr: v } }))}{fld(t("cost"), F.cost, (v) => save({ flight: { cost: +v } }), "number")}</div>
    <h3>🏨 {t("hotels")}</h3>
    <div className="grid g3">{fld(t("name"), H.name, (v) => save({ hotel: { name: v } }))}{fld(t("room"), H.room, (v) => save({ hotel: { room: v } }))}{fld(t("confirmation"), H.confirmation, (v) => save({ hotel: { confirmation: v } }))}{fld("Check-in", H.checkIn, (v) => save({ hotel: { checkIn: v } }), "date")}{fld("Check-out", H.checkOut, (v) => save({ hotel: { checkOut: v } }), "date")}{fld(t("cost"), H.cost, (v) => save({ hotel: { cost: +v } }), "number")}</div>
    <h3>🚐 {t("transfers")}</h3>
    {runs.map((r: any) => <div key={r.id} className="row small"><span className="bdg">{t("leg_" + r.leg)}</span><span className="grow">{date(r.runAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.driverName ?? "—"} {r.driverPhone ?? ""}</span><span className={"bdg " + (r.status === "done" ? "ok" : "")}>{t("rs_" + r.status)}</span></div>)}
    {can("trip.manage") && trip.id && <AddRun tripId={trip.id} refresh={refresh} />}
    <label className="f">{t("notes")}<textarea className="inp" defaultValue={trip.notes ?? ""} disabled={!can("trip.manage")} onBlur={(e) => save({ notes: e.target.value })} /></label>
  </div>;
}
function AddRun({ tripId, refresh }: { tripId: string; refresh: () => void }) {
  const { t } = useT(); const [r, setR] = useState({ leg: "airport_hotel", runAt: "", driverName: "", driverPhone: "" });
  return <div className="row wrap"><select className="inp sm" style={{ width: "auto" }} value={r.leg} onChange={(e) => setR({ ...r, leg: e.target.value })}>{["airport_hotel", "hotel_clinic", "clinic_hotel", "hotel_airport", "other"].map((l) => <option key={l} value={l}>{t("leg_" + l)}</option>)}</select>
    <input className="inp sm" type="datetime-local" value={r.runAt} onChange={(e) => setR({ ...r, runAt: e.target.value })} style={{ width: "auto" }} /><input className="inp sm" placeholder={t("driver")} value={r.driverName} onChange={(e) => setR({ ...r, driverName: e.target.value })} style={{ width: 120 }} />
    <input className="inp sm" placeholder={t("phone")} value={r.driverPhone} onChange={(e) => setR({ ...r, driverPhone: e.target.value })} style={{ width: 130 }} />
    <button className="btn sm" onClick={async () => { if (!r.runAt) return; await post(`/api/trips/${tripId}/runs`, { ...r, runAt: new Date(r.runAt).toISOString() }); setR({ ...r, runAt: "" }); refresh(); }}><Icon n="plus" /></button></div>;
}
function PlanProgress({ data, refresh }: { data: any; refresh: () => void }) {
  const { t, lang } = useT(); const can = useCan();
  const op = data.deal.acceptedOption; if (!op) return <div className="empty small">—</div>;
  const done = new Set(data.progress.filter((p: any) => p.status === "done").map((p: any) => p.planItemId));
  return <div className="col">{op.calc.visits.filter((v: any) => v.lines.length).map((v: any) => <div key={v.v} className="plan-v"><div className="h"><span className="dot" style={{ background: vcol(v.v) }} />{t("visit_n", { n: v.v })}</div>
    {v.lines.map((l: any, i: number) => { const key = `${v.v}:${l.txId ?? l.b ?? l.nm}`; return <div key={i} className="pitem"><span className={"check" + (done.has(key) ? " on" : "")} onClick={async () => { if (!can("appointment.manage") || done.has(key)) return; await post(`/api/deals/${data.deal.id}/progress`, { planItemId: key, status: "done" }); refresh(); }}>{done.has(key) && <Icon n="ok" />}</span>
      <div className="grow"><div style={{ fontWeight: 550 }}>{l.nm}</div><div className="t">{l.teeth.join(", ")} {l.br && "· " + l.br}</div></div><span className="small muted">× {l.qty}</span></div>; })}</div>)}</div>;
}
