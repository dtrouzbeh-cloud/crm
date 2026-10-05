// Lead sayfası: takip dizileri (durum, ekle, durdur) ve iletişim izinleri
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { toast, toastErr, Spinner } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useCan } from "../lib/auth.ts";

export function SequencesCard({ leadId }: { leadId: string }) {
  const { t, rel, date } = useT(); const can = useCan(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["lead-seq", leadId], queryFn: () => get<any[]>(`/api/leads/${leadId}/sequences`) });
  const { data: seqs } = useQuery({ queryKey: ["sequences"], queryFn: () => get<any[]>("/api/sequences") });
  const [sel, setSel] = useState("");
  const r = () => qc.invalidateQueries({ queryKey: ["lead-seq", leadId] });
  const add = async () => { try { const x = await post(`/api/sequences/${sel}/enroll`, { leadIds: [leadId] }); toast(x.enrolled ? t("enrolled") : t("already_enrolled")); setSel(""); r(); } catch (e) { toastErr(e); } };
  return <div className="card"><div className="hd"><h2 className="grow">⚡ {t("nav_sequences")}</h2></div><div className="bd col" style={{ gap: 8 }}>
    {!data ? <Spinner /> : !data.length ? <div className="empty small">{t("no_enrollments")}</div> : data.slice(0, 6).map((e) => <div key={e.id} className="col" style={{ gap: 2, paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
      <div className="row small" style={{ gap: 6 }}><Link href={`/sequences/${e.sequenceId}`} className="grow" style={{ fontWeight: 600 }}>{e.name}</Link>
        <span className={"bdg " + (e.status === "active" ? "info" : e.status === "completed" ? "ok" : "")}>{e.status === "active" ? `${Math.min(e.stepIndex + 1, e.stepCount)}/${e.stepCount}` : t("so_" + (e.stopReason ?? e.status))}</span>
        {e.status === "active" && can("lead.write") && <button className="btn xs ghost" onClick={async () => { await post(`/api/sequence-enrollments/${e.id}/stop`); r(); }}>{t("stop")}</button>}</div>
      {e.status === "active" && <div className="tiny muted">{t("next_step")}: {date(e.nextRunAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
      {(e.runs ?? []).slice(-3).map((x: any, i: number) => <div key={i} className="tiny faint">{x.status === "skipped" ? "⤼" : x.status === "failed" ? "✖" : "✓"} {t("sk_" + x.channel)} · {rel(x.at)}{x.detail?.reason ? ` · ${t("sr_" + x.detail.reason)}` : ""}</div>)}
    </div>)}
    {can("lead.write") && (seqs?.length ?? 0) > 0 && <div className="row" style={{ gap: 6 }}><select className="inp sm grow" value={sel} onChange={(e) => setSel(e.target.value)}><option value="">{t("add_to_sequence")}…</option>{(seqs ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="btn sm" disabled={!sel} onClick={add}><Icon n="plus" /></button></div>}
  </div></div>;
}

const CH = ["whatsapp", "email", "sms", "call"] as const;
export function ConsentCard({ leadId }: { leadId: string }) {
  const { t, date } = useT(); const can = useCan(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["consents", leadId], queryFn: () => get(`/api/leads/${leadId}/consents`) });
  const [hist, setHist] = useState(false);
  if (!data) return null;
  const set = async (channel: string, purpose: string, granted: boolean) => { try { await post(`/api/leads/${leadId}/consents`, { channel, purpose, status: granted ? "granted" : "revoked" }); qc.invalidateQueries({ queryKey: ["consents", leadId] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="card"><div className="hd"><h2 className="grow">🔒 {t("consents")}</h2><button className="btn xs ghost" onClick={() => setHist(!hist)}>{t("history")}</button></div><div className="bd">
    <table className="tbl"><thead><tr><th /><th>{t("followup_msgs")}</th><th>{t("marketing")}</th></tr></thead><tbody>
      {CH.map((ch) => <tr key={ch}><td className="small">{t("ch_" + ch)}</td>
        {(["followup", "marketing"] as const).map((pu) => <td key={pu}><button className={"bdg " + (data.state[ch][pu] ? "ok" : "err")} style={{ border: 0, cursor: can("lead.write") ? "pointer" : "default" }} disabled={!can("lead.write")}
          onClick={() => set(ch, pu, !data.state[ch][pu])}>{data.state[ch][pu] ? "✓ " + t("allowed") : "✕ " + t("not_allowed")}</button></td>)}</tr>)}
    </tbody></table>
    {hist && <div className="col" style={{ gap: 2, marginTop: 8 }}>{data.history.length ? data.history.map((h: any) => <div key={h.id} className="tiny muted">{date(h.at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {t("ch_" + h.channel)} · {t(h.purpose === "marketing" ? "marketing" : "followup_msgs")} · <b>{h.status === "granted" ? t("allowed") : t("not_allowed")}</b> · {t("cs_src_" + h.source)}{h.userName ? " · " + h.userName : ""}</div>) : <span className="tiny muted">{t("none")}</span>}</div>}
  </div></div>;
}

export function AiSummaryCard({ leadId }: { leadId: string }) {
  const { t } = useT(); const [sum, setSum] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return <div className="card"><div className="hd"><h2 className="grow">✨ {t("ai_summary")}</h2><button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { setSum((await post(`/api/leads/${leadId}/ai-summary`, {})).summary); } catch (e) { toastErr(e); } finally { setBusy(false); } }}>{busy ? "…" : sum ? t("refresh") : t("generate")}</button></div>
    {sum && <div className="bd small" style={{ whiteSpace: "pre-wrap" }}>{sum}</div>}</div>;
}

export function ReferralCard({ leadId, phone, name }: { leadId: string; phone?: string | null; name?: string }) {
  const { t, money } = useT(); const can = useCan(); const [r, setR] = useState<any>(null); const [busy, setBusy] = useState(false);
  if (!can("lead.write")) return null;
  const load = async () => { setBusy(true); try { setR(await post(`/api/leads/${leadId}/referral`, {})); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  const share = r ? t("referral_share", { name: (name ?? "").split(" ")[0], link: r.formUrl ?? r.code }) : "";
  return <div className="card"><div className="hd"><h2 className="grow">🎁 {t("referral")}</h2>{!r && <button className="btn sm" disabled={busy} onClick={load}>{t("referral_get")}</button>}</div>
    {r && <div className="bd col" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}><span className="small muted">{t("ref_code")}</span><b className="code">{r.code}</b>{r.rewardMinor ? <span className="tiny muted">· {t("reward")}: {money(Number(r.rewardMinor) / 100, r.currency)}</span> : null}</div>
      {r.formUrl && <div className="row" style={{ gap: 6 }}><input className="inp sm" readOnly value={r.formUrl} onFocus={(e) => e.target.select()} /><button className="btn sm" onClick={() => { navigator.clipboard.writeText(r.formUrl); toast(t("copied")); }}><Icon n="copy" /></button>
        {phone && <a className="btn sm" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${String(phone).replace(/\D/g, "")}?text=${encodeURIComponent(share)}`}><Icon n="wa" /></a>}</div>}
      <div className="row tiny muted" style={{ gap: 12 }}><span>👥 {r.stats.leads} {t("referred")}</span><span>🦷 {r.stats.patients} {t("patients").toLowerCase()}</span><span>💰 {money(Number(r.rewards.due) / 100, r.currency)} {t("cs_pending").toLowerCase()}</span></div>
    </div>}</div>;
}
