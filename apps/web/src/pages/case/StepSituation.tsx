import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../lib/i18n.tsx";
import { put } from "../../lib/api.ts";
import { toastErr, confirmBox } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { Chart } from "../../components/Chart.tsx";
import { Upload } from "../../components/Upload.tsx";
import { AiAssess } from "../../components/AiAssess.tsx";
import { useQueryClient } from "@tanstack/react-query";
import { useMe, useCan } from "../../lib/auth.ts";
import { toothStates, SITUATIONS, UPPER, LOWER, jawOf, type Catalog, type Situation } from "@dentaflow/core/engine";

const SIT_COL: Record<string, string> = { intact: "#F3EBD9", missing: "#FFFFFF", root: "#B9895A", rct: "#C0392B", crown: "#C9D0D4", caries: "#5B3A1E", comp: "#8DB3CF", amalg: "#6B7378", impab: "#9DA8AD", impcr: "#7E8C93", bridge: "#AEB8BE", pontic: "#D5DBDE", impacted: "#E6D7B8", inlay: "#B9A3D6", veneer: "#E8D6E2", other: "#94A3B8" };
const FIND: [string, string][] = [["sinusSark", "#5E97BD"], ["kemikAz", "#D4A017"]];

export default function StepSituation({ data, cat, onDone }: { data: any; cat: Catalog; onDone: () => void }) {
  const { t } = useT(); const can = useCan(); const { data: me } = useMe(); const qc = useQueryClient();
  const k = data.case;
  const [sit, setSit] = useState<Situation>(k.situation ?? {});
  const [brush, setBrush] = useState("missing");
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  const persist = (s: Situation, extra: Record<string, boolean> = {}) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => put(`/api/cases/${k.id}/situation`, { situation: s, ...extra }).catch(toastErr), 400); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const paint = (s: Situation, tt: number, mode: "paint" | "erase") => {
    const cur = s[tt] ?? {}, n = { ...s };
    if (brush === "sinusSark" || brush === "kemikAz") {
      if (brush === "sinusSark" && (jawOf(tt) !== "u" || tt % 10 < 4)) return n;
      if (brush === "kemikAz" && (jawOf(tt) !== "l" || tt % 10 < 4)) return n;
      const f = { ...(cur.f ?? {}) }; if (mode === "erase") delete (f as any)[brush]; else (f as any)[brush] = true;
      const e: any = { ...cur, f }; if (!Object.keys(f).length) delete e.f; if (!e.s && !e.f) delete n[tt]; else n[tt] = e; return n;
    }
    if (mode === "erase" || brush === "intact") { if (cur.f) n[tt] = { f: cur.f }; else delete n[tt]; } else n[tt] = { ...cur, s: brush as any };
    return n;
  };
  const sitRef = useRef(sit); sitRef.current = sit;
  const onStroke = useCallback((tt: number, first: boolean, mode: "paint" | "erase" | null) => {
    const cur = sitRef.current[tt] ?? {};
    const m = first ? (((brush === "sinusSark" || brush === "kemikAz") ? (cur.f as any)?.[brush] : cur.s === brush) ? "erase" : "paint") : (mode ?? "paint");
    const n = paint(sitRef.current, tt, m); setSit(n); persist(n); return m;
  }, [brush]);
  const states = useMemo(() => toothStates(cat, sit, null), [cat, sit]);
  const applyJaw = (row: number[]) => { let n = sit; row.forEach((tt) => (n = paint(n, tt, "paint"))); setSit(n); persist(n); };
  const editable = can("case.write");
  return <div className="ws">
    <div className="col">
      <Chart states={states} numbering={me?.clinic?.toothNumbering} onStroke={editable ? onStroke : undefined} />
      <div className="alert info"><Icon n="info" /><span>{t("sit_tip")}</span></div>
    </div>
    <div className="col" style={{ gap: 14 }}>
      <div className="card"><div className="hd"><h2 className="grow">{t("sit_title")}</h2><span className="bdg">{Object.keys(sit).length} {t("teeth_marked")}</span></div><div className="bd col">
        <div className="brush">{SITUATIONS.map((s) => <button key={s} className={"chip" + (brush === s ? " on" : "")} onClick={() => setBrush(s)}><i style={{ background: SIT_COL[s], border: "1px solid rgba(0,0,0,.15)" }} />{t("sit_" + s)}</button>)}</div>
        <div className="tiny muted" style={{ marginTop: 4 }}>{t("findings")}</div>
        <div className="brush">{FIND.map(([s, c]) => <button key={s} className={"chip" + (brush === s ? " on" : "")} onClick={() => setBrush(s)}><i style={{ background: c }} />{t("lg_" + s)}</button>)}</div>
        <div className="row wrap"><button className="btn sm ghost" onClick={() => applyJaw(UPPER)}>{t("all_upper_as")}</button><button className="btn sm ghost" onClick={() => applyJaw(LOWER)}>{t("all_lower_as")}</button><span className="grow" />
          <button className="btn sm ghost danger" onClick={async () => { if (await confirmBox(t("clear"), t("clear_sit_q"), t("clear"), true)) { setSit({}); persist({}); } }}>{t("clear")}</button></div>
      </div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("patient_info")}</h2></div><div className="bd col small">
        <div><span className="muted">{t("issue")}:</span> {data.patient?.issue || "—"}</div>
        <div><span className="muted">{t("anamnesis")}:</span> {data.medical?.flags?.length ? data.medical.flags.map((f: string) => <span key={f} className="bdg err" style={{ marginInlineEnd: 4 }}>{t("med_" + f)}</span>) : t("none")}</div>
        {k.dentistNote && <div className="note"><b>{t("dentist_note")}:</b> {k.dentistNote}</div>}
        <div className="tiny muted">📷 {t("photos")}</div><Upload kind="photo" entity="case" entityId={k.id} files={data.files} onDone={() => qc.invalidateQueries({ queryKey: ["case", k.id] })} accept="image/*" />
        <div className="tiny muted">🩻 X-ray / CBCT</div><Upload kind="xray" entity="case" entityId={k.id} files={data.files} onDone={() => qc.invalidateQueries({ queryKey: ["case", k.id] })} />
        <AiAssess caseId={k.id} initial={k.aiAssessment} hasImages={data.files.some((f: any) => ["photo", "xray"].includes(f.kind) && /image\/(jpeg|png|webp|gif)/.test(f.mime))} onApply={(fs) => { const n = { ...sit }; for (const f of fs) if (!n[String(f.tooth)]?.s || n[String(f.tooth)]?.s === "intact") n[String(f.tooth)] = { ...(n[String(f.tooth)] ?? {}), s: f.status as Situation[string]["s"] }; setSit(n); persist(n); }} />
      </div></div>
      <div className="row"><button className="btn" onClick={async () => { await put(`/api/cases/${k.id}/situation`, { situation: sit, done: true, skipped: true }); onDone(); }}>{t("skip")}</button><span className="grow" />
        <button className="btn pri" onClick={async () => { await put(`/api/cases/${k.id}/situation`, { situation: sit, done: true, skipped: false }); onDone(); }}>{t("save_continue")} →</button></div>
    </div></div>;
}
