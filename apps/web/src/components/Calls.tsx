// Telefon (Faz D): tek tık arama (Twilio önce temsilciyi arar) ve lead arama geçmişi — kayıt, döküm, AI özet
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, put } from "../lib/api.ts";
import { toast, toastErr } from "./ui.tsx";
import { Icon } from "./Icon.tsx";

export const useVoice = () => useQuery({ queryKey: ["voice-config"], queryFn: () => get("/api/voice/config"), staleTime: 300_000 });

/** Twilio bağlıysa kayıtlı köprü arama; değilse cihazın telefon uygulaması (tel:) */
export function CallButton({ leadId, phone }: { leadId: string; phone: string }) {
  const { t } = useT(); const { data: v } = useVoice(); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  if (!v?.configured) return <a className="btn" href={`tel:${phone}`} title={t("call_device_hint")}><Icon n="phone" />{t("call")}</a>;
  const go = async () => {
    setBusy(true);
    try { await post(`/api/leads/${leadId}/call`); toast(`📞 ${t("call_ringing_you", { phone: v.myPhone ?? "" })}`); setTimeout(() => qc.invalidateQueries({ queryKey: ["calls", leadId] }), 4000); }
    catch (e) { toastErr(e); } finally { setTimeout(() => setBusy(false), 5000); }
  };
  return <button className="btn" disabled={busy} onClick={go} title={t("call_bridge_hint")}><Icon n="phone" />{busy ? t("call_connecting") : t("call")}</button>;
}

const OUT: Record<string, string> = { reached_interested: "ok", booked: "ok", callback: "info", reached_not_interested: "warn", voicemail: "info", no_answer: "warn", missed: "err", wrong_number: "err", failed: "err" };
const mmss = (s?: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

export function CallsCard({ leadId }: { leadId: string }) {
  const { t, rel } = useT(); const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["calls", leadId], queryFn: () => get<any[]>(`/api/leads/${leadId}/calls`) });
  if (!data?.length) return null;
  return <div className="card"><div className="hd"><h2 className="grow">📞 {t("calls")}</h2><span className="bdg">{data.length}</span></div><div className="bd col" style={{ gap: 8 }}>
    {data.map((c) => <div key={c.id} className="card pad" style={{ padding: 10 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="small">{c.direction === "out" ? "↗" : "↙"}</span>
        {c.outcome ? <span className={"bdg " + (OUT[c.outcome] ?? "")}>{t("co_" + c.outcome)}</span> : <span className="bdg">{t("cst_" + c.status) !== "cst_" + c.status ? t("cst_" + c.status) : c.status}</span>}
        {c.durationSec ? <span className="tiny muted num">{mmss(c.durationSec)}</span> : null}
        <span className="grow" /><span className="tiny faint">{c.userName ? c.userName + " · " : ""}{rel(c.startedAt)}</span></div>
      {c.summary && <div className="small" style={{ marginTop: 6 }}>{c.summary}</div>}
      {c.nextStep && <div className="tiny" style={{ marginTop: 4 }}>➡️ {c.nextStep}</div>}
      {c.error && !c.summary && <div className="tiny" style={{ color: "var(--err)", marginTop: 4 }}>{c.error}</div>}
      {c.recordingFileId && <audio controls preload="none" src={`/api/files/${c.recordingFileId}`} style={{ width: "100%", height: 32, marginTop: 6 }} />}
      {c.transcript && <><button className="btn xs ghost" style={{ marginTop: 4 }} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "▾" : "▸"} {t("transcript")}</button>
        {open === c.id && <div className="tiny muted" style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", background: "var(--subtle)", padding: 8, borderRadius: 8 }}>{c.transcript}</div>}</>}
    </div>)}
  </div></div>;
}

/** Profil: temsilcinin kendi telefonu (Twilio önce bu numarayı arar; gelen aramalarda bu numara çalar) */
export function MyPhoneCard() {
  const { t } = useT(); const { data: v } = useVoice(); const qc = useQueryClient(); const [p, setP] = useState<string | null>(null);
  if (!v) return null;
  const val = p ?? v.myPhone ?? "";
  return <div className="card"><div className="hd"><h2 className="grow">📞 {t("my_phone")}</h2></div><div className="bd col" style={{ gap: 8 }}>
    <p className="small muted" style={{ margin: 0 }}>{t("my_phone_hint")}</p>
    <div className="row" style={{ gap: 6 }}><input className="inp" inputMode="tel" placeholder="+90 532 …" value={val} onChange={(e) => setP(e.target.value)} />
      <button className="btn pri" disabled={p == null} onClick={async () => { try { const r = await put("/api/me/phone", { phone: val.trim() || null }); setP(null); qc.invalidateQueries({ queryKey: ["voice-config"] }); toast(`${t("saved")} ${r.phone ?? ""}`); } catch (e) { toastErr(e); } }}>{t("save")}</button></div>
  </div></div>;
}
