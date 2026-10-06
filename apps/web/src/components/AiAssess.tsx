// Vaka: fotoğraf/röntgenden AI ön değerlendirme taslağı — hekim inceler, şemaya uygular
import { useState } from "react";
import { useT } from "../lib/i18n.tsx";
import { post } from "../lib/api.ts";
import { toastErr, toast } from "./ui.tsx";
import { Icon } from "./Icon.tsx";

export function AiAssess({ caseId, initial, hasImages, onApply }: { caseId: string; initial: any; hasImages: boolean; onApply: (findings: { tooth: number; status: string }[]) => void }) {
  const { t, rel } = useT(); const [a, setA] = useState<any>(initial ?? null); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(!!initial);
  const run = async () => { setBusy(true); try { setA(await post(`/api/cases/${caseId}/ai-assess`)); setOpen(true); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  const CONF: Record<string, string> = { high: "ok", medium: "warn", low: "err" };
  const [wrong, setWrong] = useState<number[]>(a?.feedback?.wrongTeeth ?? []); const [note, setNote] = useState(""); const [fbBusy, setFbBusy] = useState(false);
  const toggleWrong = (n: number) => setWrong(wrong.includes(n) ? wrong.filter((x) => x !== n) : [...wrong, n]);
  const feedback = async (verdict: "correct" | "partial" | "wrong") => { setFbBusy(true); try { await post(`/api/cases/${caseId}/ai-assess/feedback`, { verdict, wrongTeeth: wrong, note: note || null }); setA({ ...a, feedback: { verdict, wrongTeeth: wrong, note, at: new Date().toISOString() } }); toast(t("fb_thanks")); } catch (e) { toastErr(e); } finally { setFbBusy(false); } };
  return <div className="card pad" style={{ padding: 10, marginTop: 8, borderInlineStart: "3px solid var(--brand)" }}>
    <div className="row" style={{ gap: 8 }}><b className="small grow">✨ {t("ai_assess")}</b>{a && <button className="btn xs ghost" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button>}
      <button className="btn xs" disabled={busy || !hasImages} title={hasImages ? "" : t("ai_assess_need_images")} onClick={run}>{busy ? "…" : a ? t("refresh") : t("generate")}</button></div>
    {!a && <div className="tiny muted" style={{ marginTop: 4 }}>{t("ai_assess_hint")}</div>}
    {a && open && <div className="col" style={{ gap: 6, marginTop: 8 }}>
      <div className="row wrap tiny" style={{ gap: 6 }}><span className={"bdg " + (CONF[a.confidence] ?? "")}>{t("confidence")}: {t("cf_" + a.confidence)}</span><span className="bdg">{t("image_quality")}: {t("iq_" + a.imageQuality)}</span><span className="faint">{a.images} {t("images")} · {rel(a.at)}</span></div>
      <div className="small" style={{ whiteSpace: "pre-wrap" }}>{a.summary}</div>
      {a.findings?.length > 0 && <div className="row wrap" style={{ gap: 4 }}>{a.findings.map((f: any, i: number) => { const w = wrong.includes(f.tooth); return <button key={i} className="chip" style={{ height: 24, cursor: "pointer", textDecoration: w ? "line-through" : undefined, borderColor: w ? "var(--err)" : undefined, opacity: w ? 0.7 : 1 }} title={(f.note ? f.note + " · " : "") + t("fb_mark_wrong")} onClick={() => toggleWrong(f.tooth)}><b>{f.tooth}</b>&nbsp;{t("sit_" + f.status) !== "sit_" + f.status ? t("sit_" + f.status) : f.status}</button>; })}</div>}
      {a.suggestions?.length > 0 && <div className="tiny"><b>{t("ai_suggestions")}:</b> {a.suggestions.join(" · ")}</div>}
      {a.needs?.length > 0 && <div className="tiny muted"><b>{t("ai_needs")}:</b> {a.needs.join(" · ")}</div>}
      <div className="row" style={{ gap: 6 }}>{a.findings?.length > 0 && <button className="btn xs pri" onClick={() => { onApply(a.findings.filter((f: any) => !wrong.includes(f.tooth))); toast(t("applied_to_chart")); }}><Icon n="tooth" />{t("apply_to_chart")}</button>}<span className="tiny faint">{t("ai_assess_disclaimer")}</span></div>
      <div className="col" style={{ gap: 4, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
        <div className="tiny muted">{a.feedback ? `${t("fb_given")}: ${t("fb_" + a.feedback.verdict)}${a.feedback.wrongTeeth?.length ? " · " + a.feedback.wrongTeeth.join(", ") : ""}` : t("fb_ask")}</div>
        <div className="row wrap" style={{ gap: 4 }}>
          <button className="btn xs" disabled={fbBusy} onClick={() => feedback("correct")}>👍 {t("fb_correct")}</button><button className="btn xs" disabled={fbBusy} onClick={() => feedback("partial")}>🤏 {t("fb_partial")}</button><button className="btn xs" disabled={fbBusy} onClick={() => feedback("wrong")}>👎 {t("fb_wrong")}</button>
          <input className="inp xs grow" style={{ minWidth: 120, height: 24 }} placeholder={t("fb_note_ph")} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {wrong.length > 0 && <div className="tiny" style={{ color: "var(--err)" }}>{t("fb_wrong_sel")}: {wrong.join(", ")}</div>}
      </div>
    </div>}
  </div>;
}
