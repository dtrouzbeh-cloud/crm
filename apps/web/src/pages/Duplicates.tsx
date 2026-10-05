// Mükerrer hastalar: aynı telefon/e-posta/WhatsApp ya da aynı ad+ülke — yan yana karşılaştır, alan seç, birleştir
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { PageHead, Spinner, Empty, Modal, toast, toastErr } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { flag } from "../lib/format.tsx";

const FIELDS = ["fullName", "phone", "email", "country", "language"] as const;

export default function Duplicates() {
  const { t, date } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data } = useQuery({ queryKey: ["duplicates"], queryFn: () => get<any[]>("/api/patients/duplicates") });
  const [pair, setPair] = useState<any | null>(null);
  return <><PageHead title={t("duplicates")} sub={t("duplicates_sub")} actions={<Link href="/leads" className="btn"><Icon n="back" />{t("nav_leads")}</Link>} />
    <div className="card">{!data ? <Spinner /> : !data.length ? <Empty icon="ok" text={t("no_duplicates")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("reason")}</th><th>A</th><th>B</th><th /></tr></thead><tbody>
      {data.map((d, i) => <tr key={i}><td><span className="bdg warn">{t("dr_" + d.reason)}</span></td>
        {[d.a, d.b].map((p: any) => <td key={p.id} className="small"><b>{flag(p.country)} {p.fullName}</b> <span className="muted">#{p.number}</span><div className="tiny muted">{[p.phone, p.email].filter(Boolean).join(" · ")}</div><div className="tiny faint">{p.leads} lead · {p.deals} deal · {date(p.createdAt)}</div></td>)}
        <td>{(can("lead.delete") || can("settings.manage")) && <button className="btn sm" onClick={() => setPair(d)}>{t("merge")}</button>}</td></tr>)}
    </tbody></table></div>}</div>
    {pair && <MergeModal pair={pair} onClose={() => setPair(null)} onDone={() => { setPair(null); qc.invalidateQueries({ queryKey: ["duplicates"] }); qc.invalidateQueries({ queryKey: ["leads"] }); }} />}
  </>;
}

function MergeModal({ pair, onClose, onDone }: { pair: any; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  // varsayılan: daha çok kaydı olan (yoksa daha eski) tutulur
  const defKeep = (pair.a.deals + pair.a.leads >= pair.b.deals + pair.b.leads) ? "a" : "b";
  const [keep, setKeep] = useState<"a" | "b">(defKeep);
  const K = keep === "a" ? pair.a : pair.b, M = keep === "a" ? pair.b : pair.a;
  const [pick, setPick] = useState<Record<string, "keep" | "merge">>({});
  const choice = (f: string) => pick[f] ?? (K[f] ? "keep" : "merge");
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { const r = await post("/api/patients/merge", { keepId: K.id, mergeId: M.id, fields: Object.fromEntries(FIELDS.map((f) => [f, choice(f)])) }); toast(t("merged_ok", { n: Object.values(r.moved as Record<string, number>).reduce((a, b) => a + b, 0) })); onDone(); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  return <Modal onClose={onClose} width={680}><div className="hd"><h2 className="grow">{t("merge")}</h2></div><div className="bd col" style={{ gap: 12 }}>
    <div className="alert warn"><Icon n="alert" /><span>{t("merge_hint")}</span></div>
    <table className="tbl"><thead><tr><th /><th><label className="row" style={{ gap: 6 }}><input type="radio" checked={keep === "a"} onChange={() => { setKeep("a"); setPick({}); }} />{t("keep_this")}</label></th><th><label className="row" style={{ gap: 6 }}><input type="radio" checked={keep === "b"} onChange={() => { setKeep("b"); setPick({}); }} />{t("keep_this")}</label></th></tr></thead><tbody>
      {FIELDS.map((f) => { const av = (keep === "a" ? K : M)[f], bv = (keep === "a" ? M : K)[f]; const aSide = keep === "a" ? "keep" : "merge", bSide = keep === "a" ? "merge" : "keep";
        return <tr key={f}><td className="small muted">{t(f === "fullName" ? "full_name" : f)}</td>
          {[[av, aSide], [bv, bSide]].map(([v, side], i) => <td key={i}><label className="row small" style={{ gap: 6, opacity: v ? 1 : 0.4 }}><input type="radio" disabled={!v} checked={choice(f) === side} onChange={() => setPick({ ...pick, [f]: side as "keep" | "merge" })} />{v || "—"}</label></td>)}</tr>; })}
      <tr><td className="small muted">{t("records")}</td><td className="small">{pair.a.leads} lead · {pair.a.deals} deal</td><td className="small">{pair.b.leads} lead · {pair.b.deals} deal</td></tr>
    </tbody></table>
    <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" disabled={busy} onClick={go}>{t("merge")} → {K.fullName}</button></div>
  </div></Modal>;
}
