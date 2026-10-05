import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { PageHead, Empty, Spinner, Avatar, toast, Drawer, confirmBox } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { QuoteBadge, minor } from "../lib/format.tsx";
import { catalogFromSnapshot } from "../lib/catalog.ts";
import { QuoteDoc } from "./case/QuoteDoc.tsx";
import { snapshotToDoc, printDoc } from "./case/StepReview.tsx";

const TABS = ["open", "accepted", "changes", "declined", "expired", ""];
export default function Quotes() {
  const { id } = useParams<{ id?: string }>(); const { t, rel, date, money } = useT(); const [, nav] = useLocation(); const can = useCan();
  const [tab, setTab] = useState("open");
  const { data } = useQuery({ queryKey: ["quotes", tab], queryFn: () => get("/api/quotes" + (tab ? "?status=" + tab : "")) });
  const { data: pending } = useQuery({ queryKey: ["cases", "diagnosed"], queryFn: () => get("/api/cases?status=diagnosed"), enabled: can("quote.price") });
  const c = data?.counts ?? {};
  return <>
    <PageHead title={t("nav_quotes")} sub={t("quotes_sub")} />
    {pending?.items?.length > 0 && <div className="alert info" style={{ marginBottom: 12 }}><Icon n="info" /><span className="grow">{t("ready_to_price", { n: pending.items.length })}</span>{pending.items.slice(0, 3).map((x: any) => <Link key={x.id} className="btn sm" href={`/cases/${x.id}/price`}>{x.fullName} →</Link>)}</div>}
    <div className="card"><div className="tabs" style={{ padding: "0 8px" }}>{TABS.map((k) => <button key={k || "all"} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(k ? "qt_" + k : "qt_all") === "qt_expired" ? t("qs_expired") : t(k ? (k === "expired" ? "qs_expired" : "qt_" + k) : "qt_all")}
      <span className="bdg">{k === "open" ? (c.sent ?? 0) + (c.viewed ?? 0) : k ? c[k] ?? 0 : Object.values(c as Record<string, number>).reduce((a, b) => a + b, 0)}</span></button>)}</div>
      {!data ? <Spinner /> : data.items.length ? <div className="twrap"><table className="tbl"><thead><tr><th>{t("patient")}</th><th>{t("version")}</th><th>{t("sent")}</th><th>{t("options")}</th><th className="r">{t("total")}</th><th>{t("status")}</th><th>{t("viewed")}</th><th>{t("valid_until")}</th></tr></thead><tbody>
        {data.items.map((q: any) => <tr key={q.id} className="click" onClick={() => nav(`/quotes/${q.id}`)}><td><div className="row"><Avatar name={q.fullName} /><b>{q.fullName}</b></div></td><td>Q-{q.number} v{q.version}</td><td className="small muted">{date(q.createdAt)}</td><td className="small">{q.optionNames}</td>
          <td className="r num"><b>{q.totalMinor != null ? money(minor(q.totalMinor), q.currency) : "•••"}</b></td><td><QuoteBadge s={q.status} />{q.response?.message && <div className="tiny muted" style={{ maxWidth: 220 }}>“{q.response.message}”</div>}</td>
          <td className="small muted">{q.viewedAt ? `${rel(q.viewedAt)} · ${q.viewCount}×` : "—"}</td><td className="small muted">{date(q.validUntil)}</td></tr>)}</tbody></table></div> : <Empty icon="file" text={t("no_quotes")} />}
    </div>
    {id && <QuoteDrawer id={id} onClose={() => nav("/quotes")} />}
  </>;
}

function QuoteDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, rel, date } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data: q } = useQuery({ queryKey: ["quote", id], queryFn: () => get(`/api/quotes/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["quote", id] }); qc.invalidateQueries({ queryKey: ["quotes"] }); };
  return <Drawer title={q ? `${q.snapshot.patient.name} · Q-${q.number} v${q.version}` : "…"} onClose={onClose} width={980}
    footer={q && <><Link href={`/cases/${q.caseId}/send`} className="btn">{t("case")} →</Link><span className="grow" />
      {can("quote.send") && ["sent", "viewed", "changes"].includes(q.status) && <button className="btn danger" onClick={async () => { if (await confirmBox(t("revoke"), "", t("revoke"), true)) { await post(`/api/quotes/${id}/revoke`); refresh(); } }}>{t("revoke")}</button>}
      {can("quote.send") && <button className="btn" onClick={async () => { await post(`/api/quotes/${id}/extend`, { days: 7 }); refresh(); toast(t("saved")); }}>{t("extend")} +7</button>}
      <button className="btn" onClick={printDoc}><Icon n="print" />PDF</button>{q.url && <a className="btn pri" href={q.url + "?preview=1"} target="_blank" rel="noopener"><Icon n="eye" />{t("view_patient_page")}</a>}</>}>
    {!q ? <Spinner /> : <div className="grid ws2" style={{ gridTemplateColumns: "minmax(0,1fr) 260px", alignItems: "start", gap: 14 }}>
      <div className="docwrap" id="printable"><QuoteDoc d={snapshotToDoc(q)} cat={catalogFromSnapshot(q.snapshot)} print /></div>
      <div className="col noprint" style={{ gap: 10 }}><div className="row"><QuoteBadge s={q.status} /></div>
        {q.url && <div className="row"><input className="inp sm" readOnly value={q.url} onFocus={(e) => e.target.select()} /><button className="btn sm icon" onClick={() => { navigator.clipboard.writeText(q.url); toast(t("copied")); }}><Icon n="copy" /></button></div>}
        {q.response && <div className="note small"><b>{t("qs_" + (q.status === "accepted" ? "accepted" : q.status))}</b> · {q.snapshot.options[q.response.option]?.name}{q.response.message && <div>“{q.response.message}”</div>}{q.response.reason && <div>{t("dr_" + q.response.reason)}</div>}</div>}
        <h3>{t("events")}</h3><div className="timeline">{q.events.map((e: any, i: number) => <div key={i} className="ev"><div className="small">{t("qe_" + e.type)}{e.staff ? " (staff)" : ""}</div><div className="tiny faint">{date(e.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div>)}</div>
      </div></div>}
  </Drawer>;
}
