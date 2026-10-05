// Raporlar: itiraz dağılımı, AI kayıp analizi, temsilci konuşma karnesi
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { Spinner, Modal, toastErr } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useCan } from "../lib/auth.ts";

export function ObjectionsCard() {
  const { t } = useT(); const [days, setDays] = useState(30);
  const { data } = useQuery({ queryKey: ["objections", days], queryFn: () => get(`/api/ai/objections?days=${days}`) });
  if (!data) return null; const rows = data.objections as any[]; if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return <div className="card" style={{ marginTop: 14 }}><div className="hd"><h3 className="grow">🧱 {t("objections_title")}</h3><div className="seg">{[30, 90].map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}g</button>)}</div></div>
    <div className="bd col" style={{ gap: 8 }}>{rows.map((r) => <div key={r.objection}><div className="row small"><span className="grow">{t("obj_" + r.objection)}</span><span className="muted">{r.leads} lead · {r.won} ✓ · {r.lost} ✕</span></div><div className="prog" style={{ height: 6 }}><i style={{ width: (100 * r.leads) / max + "%" }} /></div></div>)}
      <div className="tiny muted">{t("objections_hint")}</div></div></div>;
}

export function LossReportCard() {
  const { t, date } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data } = useQuery({ queryKey: ["ai-reports", "loss"], queryFn: () => get<any[]>("/api/ai/reports?kind=loss") });
  const [busy, setBusy] = useState(false); const [i, setI] = useState(0);
  const gen = async () => { setBusy(true); try { await post("/api/ai/reports/loss", { days: 30 }); setI(0); qc.invalidateQueries({ queryKey: ["ai-reports", "loss"] }); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  if (!data) return null; const r = data[i];
  return <div className="card" style={{ marginTop: 14 }}><div className="hd"><h3 className="grow">🧠 {t("loss_report")}</h3>
    {data.length > 1 && <select className="inp sm" style={{ width: "auto" }} value={i} onChange={(e) => setI(+e.target.value)}>{data.map((x, k) => <option key={x.id} value={k}>{date(x.createdAt)}</option>)}</select>}
    {can("reports.view") && <button className="btn sm" disabled={busy} onClick={gen}><Icon n="spark" />{busy ? "…" : t("generate_now")}</button>}</div>
    <div className="bd">{!r ? <div className="small muted">{t("loss_report_hint")}</div> : <><div className="tiny muted" style={{ marginBottom: 6 }}>{date(r.periodFrom)} – {date(r.periodTo)} · {r.data?.lost} {t("lost").toLowerCase()} / {r.data?.leads} lead</div><div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{r.body}</div></>}</div></div>;
}

export function QaButton({ userId, name }: { userId: string; name: string }) {
  const { t, date } = useT(); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ai-reports", "qa", userId], queryFn: () => get<any[]>(`/api/ai/reports?kind=qa&userId=${userId}`), enabled: open });
  const gen = async () => { setBusy(true); try { await post("/api/ai/reports/qa", { userId, days: 30 }); qc.invalidateQueries({ queryKey: ["ai-reports", "qa", userId] }); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  const r = data?.[0]; const d = r?.data ?? {};
  const CR = ["speed", "discovery", "photos", "follow_up", "tone", "closing"];
  return <><button className="btn xs ghost" title={t("qa_report")} onClick={() => setOpen(true)}>📋</button>
    {open && <Modal onClose={() => setOpen(false)} width={640}><div className="hd"><h2 className="grow">📋 {t("qa_report")} · {name}</h2><button className="btn sm" disabled={busy} onClick={gen}><Icon n="spark" />{busy ? "…" : r ? t("refresh") : t("generate")}</button></div>
      <div className="bd">{!data ? <Spinner /> : !r ? <div className="small muted">{t("qa_hint")}</div> : <div className="col" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 12 }}><span style={{ fontSize: 34, fontWeight: 800, color: d.score >= 75 ? "var(--ok)" : d.score >= 50 ? "var(--warn)" : "var(--err)" }}>{d.score}</span><div className="small grow">{d.summary}<div className="tiny muted">{d.conversations} {t("conversations")} · {date(r.createdAt)}</div></div></div>
        <div className="row wrap" style={{ gap: 6 }}>{CR.map((k) => <span key={k} className="chip" style={{ height: 24 }}>{t("qc_" + k)} <b>{"★".repeat(d.criteria?.[k] ?? 0)}</b></span>)}</div>
        <div className="grid g2" style={{ gap: 10 }}><div><b className="small" style={{ color: "var(--ok)" }}>{t("strengths")}</b><ul className="small" style={{ margin: "4px 0", paddingInlineStart: 18 }}>{(d.strengths ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
          <div><b className="small" style={{ color: "var(--warn)" }}>{t("improvements")}</b><ul className="small" style={{ margin: "4px 0", paddingInlineStart: 18 }}>{(d.improvements ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div></div>
        {d.examples?.length > 0 && <div className="col" style={{ gap: 6 }}>{d.examples.map((e: any, i: number) => <div key={i} className="card pad" style={{ padding: 8 }}><div className="tiny muted">“{e.quote}”</div><div className="small">→ {e.better}</div></div>)}</div>}
      </div>}</div></Modal>}</>;
}
