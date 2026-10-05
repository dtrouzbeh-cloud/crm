// Tercüman ekranı: tercümanın (veya tüm) randevuları, hastanın dili, tıbbi uyarılar (izne göre), ziyaretin plan kalemleri
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, need, parse, notFound, qbool } from "../http.ts";
import { audit } from "../services/audit.ts";

export function interpreterRoutes(app: FastifyInstance) {
  app.get("/api/interpreter/agenda", async (req) => {
    const c = need(ctx(req), "appointment.read");
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(14).default(2), mine: qbool.default(false) }), req.query);
    const showMed = c.perms["field.medical"] !== "hide";
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`
        select a.id, a.title, a.start_at, a.end_at, a.status, a.chair, a.visit_no, a.notes, a.plan_item_ids, a.deal_id, a.translator_id, a.dentist_id,
          p.id as patient_id, p.full_name, p.language, p.country, p.phone, du.name as dentist_name, tu.name as translator_name,
          d.accepted_option->'calc'->'visits' as visits, d.number as deal_number,
          ${showMed ? tx`mp.flags, mp.allergies, mp.medications` : tx`null as flags, null as allergies, null as medications`}
        from appointments a left join patients p on p.id = a.patient_id left join users du on du.id = a.dentist_id left join users tu on tu.id = a.translator_id
          left join deals d on d.id = a.deal_id left join medical_profiles mp on mp.patient_id = p.id
        where a.start_at >= date_trunc('day', now()) and a.start_at < date_trunc('day', now()) + ${q.days + " days"}::interval and a.status not in ('canceled','no_show')
          ${q.mine || c.perms["appointment.read"] === "own" ? tx`and (a.translator_id = ${c.userId} or a.dentist_id = ${c.userId})` : tx``}
        order by a.start_at`;
      const amend = rows.length ? await tx`select deal_id, lines from deal_amendments where status = 'approved' and deal_id = any(${[...new Set(rows.map((r) => r.dealId).filter(Boolean))] as string[]})` : [];
      return rows.map((r) => {
        const visit = ((r.visits as any[]) ?? []).find((v) => v.v === r.visitNo);
        const extra = amend.filter((x) => x.dealId === r.dealId).flatMap((x) => (x.lines as any[]).filter((l) => l.v === r.visitNo));
        return { ...r, visits: undefined, items: [...(visit?.lines ?? []).map((l: any) => ({ txId: l.txId, b: l.b, name: l.nm, teeth: l.teeth, qty: l.qty })),
          ...extra.map((l) => ({ txId: l.tx ?? null, b: l.b ?? null, name: l.name, teeth: l.teeth, qty: l.qty, amended: l.kind }))] };
      });
    });
  });
  // tercüman notu → randevu notuna eklenir (zaman damgası + ad)
  app.post("/api/interpreter/appointments/:id/note", async (req) => {
    const c = need(ctx(req), "appointment.read"); const { id } = req.params as { id: string };
    const b = parse(z.object({ text: z.string().trim().min(1).max(2000) }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [u] = await tx`select name from users where id = ${c.userId}`;
      const line = `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${u?.name ?? ""}] ${b.text}`;
      const [a] = await tx`update appointments set notes = concat_ws(E'\n', nullif(notes, ''), ${line}::text) where id = ${id}
        ${c.perms["appointment.read"] === "own" ? tx`and (translator_id = ${c.userId} or dentist_id = ${c.userId})` : tx``} returning notes`;
      if (!a) throw notFound("Randevu");
      await audit(tx, c, "appointment.note", "appointment", id); return a;
    });
  });
}
