import type { Tx } from "../db.ts";
import type { Ctx } from "../http.ts";

/** Denetim kaydı + olay çıkış kutusu (entegrasyon/webhook/iş akışı bunu tüketir) */
export async function audit(tx: Tx, c: Pick<Ctx, "clinicId" | "userId">, action: string, entity: string | null, entityId: string | null, data?: unknown) {
  await tx`insert into audit_events (clinic_id, user_id, action, entity, entity_id, data) values (${c.clinicId}, ${c.userId}, ${action}, ${entity}, ${entityId}, ${data ? tx.json(data as never) : null})`;
}
export async function emit(tx: Tx, clinicId: string, type: string, entityId: string | null, payload: Record<string, unknown>) {
  await tx`insert into outbox_events (clinic_id, type, entity_id, payload) values (${clinicId}, ${type}, ${entityId}, ${tx.json(payload as never)})`;
  await tx`select pg_notify('outbox', ${clinicId})`;
}
