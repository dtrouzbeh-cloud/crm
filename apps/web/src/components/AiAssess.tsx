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
  return <div className="card pad" style={{ padding: 10, marginTop: 8, borderInlineStart: "3px solid var(--brand)" }}>
    <div className="row" style={{ gap: 8 }}><b className="small grow">✨ {t("ai_assess")}</b>{a && <button className="btn xs ghost" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button>}
      <button className="btn xs" disabled={busy || !hasImages} title={hasImages ? "" : t("ai_assess_need_images")} onClick={run}>{busy ? "…" : a ? t("refresh") : t("generate")}</button></div>
    {!a && <div className="tiny muted" style={{ marginTop: 4 }}>{t("ai_assess_hint")}</div>}
    {a && open && <div className="col" style={{ gap: 6, marginTop: 8 }}>
      <div className="row wrap tiny" style={{ gap: 6 }}><span className={"bdg " + (CONF[a.confidence] ?? "")}>{t("confidence")}: {t("cf_" + a.confidence)}</span><span className="bdg">{t("image_quality")}: {t("iq_" + a.imageQuality)}</span><span className="faint">{a.images} {t("images")} · {rel(a.at)}</span></div>
      <div className="small" style={{ whiteSpace: "pre-wrap" }}>{a.summary}</div>
      {a.findings?.length > 0 && <div className="row wrap" style={{ gap: 4 }}>{a.findings.map((f: any, i: number) => <span key={i} className="chip" style={{ height: 24 }} title={f.note ?? ""}><b>{f.tooth}</b>&nbsp;{t("sit_" + f.status) !== "sit_" + f.status ? t("sit_" + f.status) : f.status}</span>)}</div>}
      {a.suggestions?.length > 0 && <div className="tiny"><b>{t("ai_suggestions")}:</b> {a.suggestions.join(" · ")}</div>}
      {a.needs?.length > 0 && <div className="tiny muted"><b>{t("ai_needs")}:</b> {a.needs.join(" · ")}</div>}
      <div className="row" style={{ gap: 6 }}>{a.findings?.length > 0 && <button className="btn xs pri" onClick={() => { onApply(a.findings); toast(t("applied_to_chart")); }}><Icon n="tooth" />{t("apply_to_chart")}</button>}<span className="tiny faint">{t("ai_assess_disclaimer")}</span></div>
    </div>}
  </div>;
}
