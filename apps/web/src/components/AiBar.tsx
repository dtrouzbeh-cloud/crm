// Gelen kutusu: AI durumu (durdur/başlat), asistan modu taslağı (kullan/düzenle/at), öneri al
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { toastErr } from "./ui.tsx";

export function AiBar({ convId, onUse, onSent }: { convId: string; onUse: (text: string) => void; onSent: () => void }) {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["conv-ai", convId], queryFn: () => get(`/api/inbox/conversations/${convId}/ai`) });
  const [busy, setBusy] = useState(false);
  if (!data || !data.available) return null;
  const r = () => qc.invalidateQueries({ queryKey: ["conv-ai", convId] });
  const act = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); r(); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  return <div className="col" style={{ gap: 6 }}>
    {data.draft && <div className="alert info" style={{ alignItems: "flex-start" }}><span>🤖</span><div className="grow"><div className="tiny muted">{t("ai_draft")}</div><div className="small" style={{ whiteSpace: "pre-wrap" }}>{data.draft.body}</div>
      <div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn xs pri" disabled={busy} onClick={() => act(async () => { await post(`/api/ai/drafts/${data.draft.id}/use`, {}); onSent(); })}>{t("send")}</button>
        <button className="btn xs" onClick={() => { onUse(data.draft.body); act(() => post(`/api/ai/drafts/${data.draft.id}/discard`, {})); }}>{t("edit")}</button>
        <button className="btn xs ghost" onClick={() => act(() => post(`/api/ai/drafts/${data.draft.id}/discard`, {}))}>{t("discard")}</button></div></div></div>}
    <div className="row tiny muted" style={{ gap: 8 }}>
      <span>🤖 {data.mode === "off" ? t("ai_off") : data.paused ? t("ai_paused_here") : t("aim_" + data.mode)}{data.session?.status === "handed_off" ? ` · ${t("ai_handed_off")}${data.session.summary ? ": " + data.session.summary : ""}` : ""}</span>
      <span className="grow" />
      {data.mode !== "off" && <button className="btn xs ghost" onClick={() => act(() => post(`/api/inbox/conversations/${convId}/ai/pause`, { paused: !data.paused }))}>{data.paused ? t("ai_resume") : t("ai_pause")}</button>}
      <button className="btn xs ghost" disabled={busy} onClick={() => act(async () => { const x = await post(`/api/inbox/conversations/${convId}/ai/suggest`, {}); if (x.text) onUse(x.text); })}>✨ {t("ai_suggest")}</button>
    </div>
  </div>;
}
