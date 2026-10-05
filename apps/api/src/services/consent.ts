// İzin merkezi: kanal/amaç bazında izin; takip mesajları ret yoksa serbest, pazarlama açık izin ister
import type { Tx } from "../db.ts";

export type Channel = "whatsapp" | "email" | "sms" | "call";
const STOP_WORDS = /^\s*(stop|stopp|dur|durdur|iptal|unsubscribe|abmelden|arr[eê]t|إيقاف|الغاء|cancel|beni aramay[ıi]n|don'?t (call|contact)|no more)\s*[.!]*\s*$/i;
export const isStopMessage = (body?: string | null) => !!body && STOP_WORDS.test(body);

export async function contactAllowed(tx: Tx, clinicId: string, patientId: string, channel: Channel, purpose: "followup" | "marketing"): Promise<{ ok: boolean; reason?: string }> {
  const rows = await tx`select purpose, status from consents where clinic_id = ${clinicId} and patient_id = ${patientId} and channel in (${channel}, 'all') order by at desc`;
  // "followup" iptali = o kanaldan tüm iletişimi durdur (STOP)
  const f = rows.find((r) => r.purpose === "followup");
  if (f?.status === "revoked") return { ok: false, reason: "opted_out" };
  if (purpose === "followup") return { ok: true };
  const m = rows.find((r) => r.purpose === "marketing");
  if (m) return m.status === "granted" ? { ok: true } : { ok: false, reason: "opted_out" };
  const [p] = await tx`select marketing_consent from patients where id = ${patientId}`;
  return p?.marketingConsent ? { ok: true } : { ok: false, reason: "no_marketing_consent" };
}

export async function recordConsent(tx: Tx, clinicId: string, patientId: string, c: { channel: Channel | "all"; purpose: "followup" | "marketing"; status: "granted" | "revoked"; source: string; evidence?: Record<string, unknown> }) {
  await tx`insert into consents (clinic_id, patient_id, channel, purpose, status, source, evidence) values (${clinicId}, ${patientId}, ${c.channel}, ${c.purpose}, ${c.status}, ${c.source}, ${tx.json((c.evidence ?? {}) as never)})`;
  if (c.purpose === "marketing" && (c.channel === "all" || c.channel === "email" || c.channel === "whatsapp"))
    await tx`update patients set marketing_consent = ${c.status === "granted"}, consent_at = now() where id = ${patientId}`;
}
