// Giden webhook'lar: olay → abonelikler; HMAC-SHA256 imza (X-DentaFlow-Signature), teslim kaydı, hata sayacı
import { createHmac } from "node:crypto";
import { ownerSql } from "../db.ts";

export async function dispatchWebhook(eventId: number, clinicId: string) {
  const [ev] = await ownerSql`select id, type, entity_id, payload, created_at from outbox_events where id = ${eventId}`;
  if (!ev) return;
  const eps = await ownerSql`select * from webhook_endpoints where clinic_id = ${clinicId} and active and (events @> '{*}' or ${ev.type} = any(events))`;
  const body = JSON.stringify({ id: String(ev.id), type: ev.type, created: ev.createdAt, data: ev.payload });
  const errors: string[] = [];
  for (const ep of eps) {
    const ts = Math.floor(Date.now() / 1000), sig = createHmac("sha256", ep.secret).update(`${ts}.${body}`).digest("hex");
    const t0 = Date.now(); let status = 0, text = "";
    try {
      const r = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "DentaFlow-Webhooks/1", "X-DentaFlow-Event": ev.type, "X-DentaFlow-Signature": `t=${ts},v1=${sig}` }, body, signal: AbortSignal.timeout(10_000) });
      status = r.status; text = (await r.text()).slice(0, 500);
    } catch (e) { text = (e as Error).message; }
    await ownerSql`insert into webhook_deliveries (clinic_id, endpoint_id, event_id, event_type, status, response, duration_ms) values (${clinicId}, ${ep.id}, ${ev.id}, ${ev.type}, ${status}, ${text}, ${Date.now() - t0})`;
    const ok = status >= 200 && status < 300;
    await ownerSql`update webhook_endpoints set last_status = ${status}, last_at = now(), failures = ${ok ? 0 : ep.failures + 1}, active = ${ok || ep.failures + 1 < 50} where id = ${ep.id}`;
    if (!ok) errors.push(`${ep.url}: ${status || text}`);
  }
  if (errors.length) throw new Error(errors.join("; "));   // iş kuyruğu üstel geri çekilmeyle yeniden dener
}
export const signPayload = (secret: string, ts: number, body: string) => createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
