// Gelen kutusu AI çubuğu: canlı satış koçu (çeviri, itiraz, taktik, 3 alternatif cevap), hasta diline çeviri, benzer vaka, taslak (asistan modu), AI durdur/başlat
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { toastErr, Modal } from "./ui.tsx";

const OBJ_COL: Record<string, string> = { price: "warn", fear: "info", trust: "err", timing: "", competitor: "err", distance: "", quality: "warn", family: "", health: "info" };

export function AiBar({ convId, leadId, draftText, onUse, onSent }: { convId: string; leadId?: string | null; draftText: string; onUse: (text: string) => void; onSent: () => void }) {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["conv-ai", convId], queryFn: () => get(`/api/inbox/conversations/${convId}/ai`) });
  const { data: co } = useQuery({ queryKey: ["conv-coach", convId], queryFn: () => get(`/api/inbox/conversations/${convId}/coach`) });
  const [busy, setBusy] = useState(""); const [showTr, setShowTr] = useState(true); const [sim, setSim] = useState<any[] | null>(null);
  if (!data || !data.available) return null;
  const r = () => { qc.invalidateQueries({ queryKey: ["conv-ai", convId] }); qc.invalidateQueries({ queryKey: ["conv-coach", convId] }); };
  const act = async (k: string, fn: () => Promise<any>) => { setBusy(k); try { await fn(); r(); } catch (e) { toastErr(e); } finally { setBusy(""); } };
  const ins = co?.insight, fresh = co?.fresh && ins; const pLang = co?.patientLang as string | null;
  const coachOn = co?.features?.coach !== false, trOn = co?.features?.translate !== false;
  return <div className="col" style={{ gap: 6 }}>
    {data.draft && <div className="alert info" style={{ alignItems: "flex-start" }}><span>🤖</span><div className="grow"><div className="tiny muted">{t("ai_draft")}</div><div className="small" style={{ whiteSpace: "pre-wrap" }}>{data.draft.body}</div>
      <div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn xs pri" disabled={!!busy} onClick={() => act("d", async () => { await post(`/api/ai/drafts/${data.draft.id}/use`, {}); onSent(); })}>{t("send")}</button>
        <button className="btn xs" onClick={() => { onUse(data.draft.body); act("d", () => post(`/api/ai/drafts/${data.draft.id}/discard`, {})); }}>{t("edit")}</button>
        <button className="btn xs ghost" onClick={() => act("d", () => post(`/api/ai/drafts/${data.draft.id}/discard`, {}))}>{t("discard")}</button></div></div></div>}
    {fresh && <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8, background: "var(--subtle)" }} className="col">
      <div className="row wrap" style={{ gap: 6 }}><b className="tiny">🎯 {t("coach")}</b>
        {ins.objection && <span className={"bdg " + (OBJ_COL[ins.objection] ?? "")}>{t("obj_" + ins.objection)}</span>}
        {ins.intent && ins.intent !== "other" && <span className="bdg">{t("int_" + ins.intent)}</span>}
        {ins.sentiment === "negative" && <span className="bdg err">😟</span>}{ins.urgency === "high" && <span className="bdg warn">⚡</span>}
        <span className="grow" />{ins.translation && <button className="btn xs ghost" onClick={() => setShowTr(!showTr)}>🌐</button>}</div>
      {ins.translation && showTr && <div className="tiny" style={{ background: "var(--card)", borderRadius: 6, padding: "4px 8px" }}><span className="faint">{t("patient_says")}: </span>{ins.translation}</div>}
      {ins.tactic && <div className="tiny muted">💡 {ins.tactic}</div>}
      <div className="col" style={{ gap: 4 }}>{(ins.suggestions as any[]).map((sg, i) => <button key={i} type="button" onClick={() => onUse(sg.text)} title={t("click_to_use")}
        style={{ textAlign: "start", border: "1px solid var(--line-2)", background: "var(--card)", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "inherit" }}>
        <div className="row" style={{ gap: 6 }}><span className="bdg brand">{sg.label}</span><span className="small grow" dir="auto">{sg.text}</span></div>
        {sg.gloss && sg.gloss !== sg.text && <div className="tiny faint" style={{ marginTop: 2 }}>{sg.gloss}</div>}</button>)}</div>
    </div>}
    <div className="row wrap tiny muted" style={{ gap: 6 }}>
      <span>🤖 {data.mode === "off" ? (coachOn ? t("ai_coach_only") : t("ai_off")) : data.paused ? t("ai_paused_here") : t("aim_" + data.mode)}{data.session?.status === "handed_off" ? ` · ${t("ai_handed_off")}${data.session.summary ? ": " + data.session.summary : ""}` : ""}</span>
      <span className="grow" />
      {data.mode !== "off" && <button className="btn xs ghost" onClick={() => act("p", () => post(`/api/inbox/conversations/${convId}/ai/pause`, { paused: !data.paused }))}>{data.paused ? t("ai_resume") : t("ai_pause")}</button>}
      {trOn && pLang && <button className="btn xs ghost" disabled={!draftText.trim() || !!busy} title={t("translate_hint")} onClick={() => act("t", async () => { const x = await post("/api/ai/translate", { text: draftText, to: pLang }); if (x.text) onUse(x.text); })}>{busy === "t" ? "…" : `🌐 → ${pLang.toUpperCase()}`}</button>}
      {leadId && <button className="btn xs ghost" disabled={!!busy} onClick={() => act("s", async () => setSim(await get(`/api/leads/${leadId}/similar-cases`)))}>📸 {t("similar_case")}</button>}
      <button className="btn xs ghost" disabled={!!busy} onClick={() => act("c", () => post(`/api/inbox/conversations/${convId}/coach`, {}))}>{busy === "c" ? "…" : "✨ " + (fresh ? t("refresh") : t("ai_suggest"))}</button>
    </div>
    {sim && <Modal onClose={() => setSim(null)} width={620}><div className="hd"><h2 className="grow">📸 {t("similar_case")}</h2></div><div className="bd">
      {!sim.length ? <div className="empty small">{t("no_gallery")}</div> : <div className="grid g2" style={{ gap: 10 }}>{sim.map((x) => <button key={x.id} type="button" onClick={() => { onUse((draftText ? draftText + "\n" : "") + x.shareUrl); setSim(null); }}
        style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 6, background: "var(--card)", cursor: "pointer", textAlign: "start", color: "inherit" }}>
        <img src={x.thumb} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 6 }} /><div className="small" style={{ marginTop: 4 }}>{typeof x.caption === "string" ? x.caption : x.caption?.tr ?? x.caption?.en ?? ""}</div><div className="tiny faint">{t("click_to_insert_link")}</div></button>)}</div>}
    </div></Modal>}
  </div>;
}
