// Klinik anahtar kasası: dış servis anahtarları AES-256-GCM ile şifreli saklanır; değerler API'den asla geri okunmaz (yalnız "tanımlı" bilgisi ve gizli olmayan meta)
import { ownerSql } from "../db.ts";
import { encrypt, decrypt } from "../lib/crypto.ts";

export type SecretName = "anthropic" | "stt" | "resend" | "twilio";
const cache = new Map<string, { at: number; v: { value: Record<string, string>; meta: Record<string, unknown> } | null }>();

export async function getSecret(clinicId: string, name: SecretName): Promise<{ value: Record<string, string>; meta: Record<string, unknown> } | null> {
  const k = clinicId + ":" + name; const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const [r] = await ownerSql`select value_enc, meta from clinic_secrets where clinic_id = ${clinicId} and name = ${name}`;
  let v = null; if (r) { try { v = { value: JSON.parse(decrypt(r.valueEnc as string)), meta: (r.meta ?? {}) as Record<string, unknown> }; } catch { v = null; } }
  cache.set(k, { at: Date.now(), v }); return v;
}
export async function setSecret(clinicId: string, name: SecretName, value: Record<string, string> | null, meta: Record<string, unknown>, userId: string | null) {
  cache.delete(clinicId + ":" + name);
  if (value === null) { await ownerSql`delete from clinic_secrets where clinic_id = ${clinicId} and name = ${name}`; return; }
  await ownerSql`insert into clinic_secrets (clinic_id, name, value_enc, meta, updated_by) values (${clinicId}, ${name}, ${encrypt(JSON.stringify(value))}, ${ownerSql.json(meta as never)}, ${userId})
    on conflict (clinic_id, name) do update set value_enc = excluded.value_enc, meta = excluded.meta, updated_by = excluded.updated_by, updated_at = now()`;
}
export async function setSecretMeta(clinicId: string, name: SecretName, meta: Record<string, unknown>) {
  cache.delete(clinicId + ":" + name);
  await ownerSql`update clinic_secrets set meta = meta || ${ownerSql.json(meta as never)}, updated_at = now() where clinic_id = ${clinicId} and name = ${name}`;
}
export async function listSecrets(clinicId: string) {
  return ownerSql`select name, meta, updated_at from clinic_secrets where clinic_id = ${clinicId}`;
}
