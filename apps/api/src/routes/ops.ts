import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, need, parse, notFound, HttpError } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { encrypt } from "../lib/crypto.ts";
import { maskValue } from "@dentaflow/core/permissions";

const flightLeg = z.object({ no: z.string().max(20).optional(), from: z.string().max(60).optional(), to: z.string().max(60).optional(), dep: z.string().max(30).optional(), arr: z.string().max(30).optional() }).partial();

export function opsRoutes(app: FastifyInstance) {
  // ── Seyahat (deal × ziyaret) ──
  app.put("/api/deals/:id/trips/:no", async (req) => {
    const c = need(ctx(req), "trip.manage");
    const { id, no } = req.params as { id: string; no: string };
    const b = parse(z.object({
      passport: z.object({ fullName: z.string().max(120), number: z.string().max(30), expiry: z.string().max(20), nationality: z.string().max(40), birthDate: z.string().max(20).optional() }).partial().nullable(),
      flight: z.object({ outbound: flightLeg, return: flightLeg, cost: z.number().optional(), booked: z.boolean().optional(), ticketFileId: z.string().optional(), pnr: z.string().max(20).optional() }).partial(),
      hotel: z.object({ hotelId: z.string().nullable(), name: z.string().max(120), room: z.string().max(40), checkIn: z.string().max(20), checkOut: z.string().max(20), cost: z.number(), booked: z.boolean(), confirmation: z.string().max(60) }).partial(),
      companions: z.number().int().min(0).max(10), status: z.enum(["planning", "confirmed", "in_progress", "done", "canceled"]), notes: z.string().max(4000).nullable(),
    }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [t] = await tx`insert into trips (clinic_id, deal_id, visit_no) values (${c.clinicId}, ${id}, ${Number(no)}) on conflict (deal_id, visit_no) do update set visit_no = excluded.visit_no returning id, flight, hotel`;
      const set: Record<string, unknown> = {};
      if (b.passport !== undefined) set.passport_enc = b.passport ? encrypt(JSON.stringify(b.passport)) : null;
      if (b.flight) set.flight = tx.json({ ...(t!.flight ?? {}), ...b.flight } as never);
      if (b.hotel) set.hotel = tx.json({ ...(t!.hotel ?? {}), ...b.hotel } as never);
      for (const k of ["companions", "status", "notes"] as const) if (b[k] !== undefined) set[k] = b[k];
      if (Object.keys(set).length) await tx`update trips set ${tx(set as never)} where id = ${t!.id}`;
      // varış tarihi uçuştan ziyarete yansır
      const arr = b.flight?.outbound?.arr ?? b.flight?.outbound?.dep;
      if (arr) await tx`update deal_visits set arrival_at = ${arr}, status = case when status = 'planned' then 'scheduled' else status end where deal_id = ${id} and visit_no = ${Number(no)}`;
      const dep = b.flight?.return?.dep; if (dep) await tx`update deal_visits set departure_at = ${dep} where deal_id = ${id} and visit_no = ${Number(no)}`;
      await audit(tx, c, "trip.update", "trip", t!.id, { ...b, passport: b.passport ? "updated" : b.passport });
      return { id: t!.id };
    });
  });

  app.post("/api/trips/:id/runs", async (req) => {
    const c = need(ctx(req), "trip.manage");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ leg: z.enum(["airport_hotel", "hotel_clinic", "clinic_hotel", "hotel_airport", "other"]), runAt: z.iso.datetime(), driverName: z.string().max(80).optional(), driverPhone: z.string().max(40).optional(), vehicle: z.string().max(60).optional(), note: z.string().max(500).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [r] = await tx`insert into transfer_runs (clinic_id, trip_id, leg, run_at, driver_name, driver_phone, vehicle, note) values (${c.clinicId}, ${id}, ${b.leg}, ${b.runAt}, ${b.driverName ?? null}, ${b.driverPhone ?? null}, ${b.vehicle ?? null}, ${b.note ?? null}) returning id`;
      return r;
    });
  });
  app.patch("/api/runs/:id", async (req) => {
    const c = need(ctx(req), "trip.manage");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ status: z.enum(["planned", "dispatched", "done", "canceled"]), runAt: z.iso.datetime(), driverName: z.string().max(80), driverPhone: z.string().max(40), note: z.string().max(500) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries({ status: "status", runAt: "run_at", driverName: "driver_name", driverPhone: "driver_phone", note: "note" })) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      await tx`update transfer_runs set ${tx(set as never)} where id = ${id}`; return { ok: true };
    });
  });
  app.delete("/api/runs/:id", async (req) => { const c = need(ctx(req), "trip.manage"); const { id } = req.params as { id: string }; await withClinic(c.clinicId, (tx) => tx`delete from transfer_runs where id = ${id}`); return { ok: true }; });

  // Koordinatör panosu: gelecek ziyaretler + eksik bilgi uyarıları + transferler
  app.get("/api/trips/board", async (req) => {
    const c = ctx(req); if (!c.perms["trip.manage"] && !c.perms["appointment.read"]) throw new HttpError(403, "forbidden");
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(120).default(30) }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const rows = await tx`
        select v.deal_id, v.visit_no, v.arrival_at, v.departure_at, v.status as visit_status, d.number as deal_number, d.title, p.full_name, p.phone, p.country, p.language,
               t.id as trip_id, t.flight, t.hotel, t.status as trip_status, t.passport_enc is not null as has_passport, t.companions,
               (select count(*) from transfer_runs r where r.trip_id = t.id)::int as runs
        from deal_visits v join deals d on d.id = v.deal_id join patients p on p.id = d.patient_id left join trips t on t.deal_id = v.deal_id and t.visit_no = v.visit_no
        where v.clinic_id = ${c.clinicId} and d.status = 'open' and v.status not in ('done','canceled')
          and (v.arrival_at is null or v.arrival_at < now() + ${q.days + " days"}::interval) and (v.departure_at is null or v.departure_at > now() - interval '1 day')
        order by v.arrival_at nulls last limit 300`;
      const runs = await tx`select r.*, p.full_name from transfer_runs r join trips t on t.id = r.trip_id join deals d on d.id = t.deal_id join patients p on p.id = d.patient_id
        where r.clinic_id = ${c.clinicId} and r.run_at between now() - interval '6 hours' and now() + interval '3 days' and r.status <> 'canceled' order by r.run_at`;
      return { visits: rows.map((r) => ({ ...r, phone: maskValue(r.phone, c.perms["field.phone"]),
        missing: [!r.hasPassport && "passport", !(r.flight?.outbound?.no) && "flight", !(r.hotel?.name || r.hotel?.hotelId) && "hotel", !r.runs && "transfer"].filter(Boolean) })), runs };
    });
  });

  // ── Randevular ──
  app.get("/api/appointments", async (req) => {
    const c = need(ctx(req), "appointment.read");
    const q = parse(z.object({ from: z.iso.datetime(), to: z.iso.datetime(), dentistId: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, (tx) => tx`
      select a.*, p.full_name, p.language, du.name as dentist_name, tu.name as translator_name, d.number as deal_number
      from appointments a left join patients p on p.id = a.patient_id left join users du on du.id = a.dentist_id left join users tu on tu.id = a.translator_id left join deals d on d.id = a.deal_id
      where a.clinic_id = ${c.clinicId} and a.start_at < ${q.to} and a.end_at > ${q.from}
        ${q.dentistId ? tx`and a.dentist_id = ${q.dentistId}` : tx``}
        ${c.perms["appointment.read"] === "own" ? tx`and (a.dentist_id = ${c.userId} or a.translator_id = ${c.userId})` : tx``}
      order by a.start_at`);
  });
  const apptBody = z.object({ title: z.string().min(1).max(200), startAt: z.iso.datetime(), endAt: z.iso.datetime(), patientId: z.uuid().nullable().optional(), dealId: z.uuid().nullable().optional(), caseId: z.uuid().nullable().optional(),
    visitNo: z.number().int().nullable().optional(), dentistId: z.uuid().nullable().optional(), translatorId: z.uuid().nullable().optional(), chair: z.string().max(20).nullable().optional(), planItemIds: z.array(z.string()).optional(), notes: z.string().max(2000).nullable().optional(),
    status: z.enum(["booked", "confirmed", "arrived", "in_chair", "done", "no_show", "canceled"]).optional() });
  app.post("/api/appointments", async (req) => {
    const c = need(ctx(req), "appointment.manage");
    const b = parse(apptBody, req.body);
    if (new Date(b.endAt) <= new Date(b.startAt)) throw new HttpError(400, "bad_range", "Bitiş başlangıçtan sonra olmalı");
    return withClinic(c.clinicId, async (tx) => {
      // çakışma kontrolü: aynı hekim veya aynı koltuk
      const clash = await tx`select id, title from appointments where clinic_id = ${c.clinicId} and status not in ('canceled','no_show') and start_at < ${b.endAt} and end_at > ${b.startAt}
        and ((${b.dentistId ?? null}::uuid is not null and dentist_id = ${b.dentistId ?? null}) or (${b.chair ?? null}::text is not null and chair = ${b.chair ?? null})) limit 1`;
      if (clash.length) throw new HttpError(409, "clash", `Çakışma: ${clash[0]!.title}`);
      let patientId = b.patientId ?? null;
      if (!patientId && b.dealId) patientId = (await tx`select patient_id from deals where id = ${b.dealId}`)[0]?.patientId ?? null;
      const [a] = await tx`insert into appointments (clinic_id, patient_id, deal_id, case_id, visit_no, title, start_at, end_at, dentist_id, translator_id, chair, plan_item_ids, notes, status, created_by)
        values (${c.clinicId}, ${patientId}, ${b.dealId ?? null}, ${b.caseId ?? null}, ${b.visitNo ?? null}, ${b.title}, ${b.startAt}, ${b.endAt}, ${b.dentistId ?? null}, ${b.translatorId ?? null}, ${b.chair ?? null}, ${b.planItemIds ?? []}, ${b.notes ?? null}, ${b.status ?? "booked"}, ${c.userId}) returning id`;
      for (const uid of [b.dentistId, b.translatorId].filter(Boolean)) await tx`insert into notifications (clinic_id, user_id, type, title, link) values (${c.clinicId}, ${uid!}, 'appointment', ${b.title + " · " + new Date(b.startAt).toISOString().slice(0, 16).replace("T", " ")}, '/reception')`;
      await audit(tx, c, "appointment.create", "appointment", a!.id, b);
      return a;
    });
  });
  app.patch("/api/appointments/:id", async (req) => {
    const c = need(ctx(req), "appointment.manage");
    const { id } = req.params as { id: string };
    const b = parse(apptBody.partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries({ title: "title", startAt: "start_at", endAt: "end_at", dentistId: "dentist_id", translatorId: "translator_id", chair: "chair", notes: "notes", status: "status", planItemIds: "plan_item_ids" })) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      const [a] = await tx`update appointments set ${tx(set as never)} where id = ${id} returning id, deal_id, visit_no, status`;
      if (!a) throw notFound("Randevu");
      if (b.status === "arrived" && a.dealId && a.visitNo) { await tx`update deal_visits set status = 'arrived' where deal_id = ${a.dealId} and visit_no = ${a.visitNo} and status in ('planned','scheduled')`;
        await tx`update deals set stage = ${"visit_" + a.visitNo} where id = ${a.dealId} and stage in ('accepted','deposit','travel')`; await emit(tx, c.clinicId, "visit.arrived", a.dealId, { dealId: a.dealId, visitNo: a.visitNo }); }
      if (b.status === "in_chair" && a.dealId && a.visitNo) await tx`update deal_visits set status = 'in_treatment' where deal_id = ${a.dealId} and visit_no = ${a.visitNo}`;
      await audit(tx, c, "appointment.update", "appointment", id, b);
      return { ok: true };
    });
  });
  app.delete("/api/appointments/:id", async (req) => { const c = need(ctx(req), "appointment.manage"); const { id } = req.params as { id: string }; await withClinic(c.clinicId, async (tx) => { await tx`update appointments set status = 'canceled' where id = ${id}`; await audit(tx, c, "appointment.cancel", "appointment", id); }); return { ok: true }; });

  // Resepsiyon günü: randevular + bugün gelenler + günlük tahsilat
  app.get("/api/reception/day", async (req) => {
    const c = need(ctx(req), "appointment.read");
    const q = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    const from = `${q.date}T00:00:00Z`, to = new Date(new Date(from).getTime() + 86400000).toISOString();
    return withClinic(c.clinicId, async (tx) => {
      const appts = await tx`select a.*, p.full_name, p.phone, p.language, du.name as dentist_name, tu.name as translator_name from appointments a left join patients p on p.id = a.patient_id left join users du on du.id = a.dentist_id left join users tu on tu.id = a.translator_id
        where a.clinic_id = ${c.clinicId} and a.start_at >= ${from} and a.start_at < ${to} order by a.start_at`;
      const arrivals = await tx`select v.deal_id, v.visit_no, v.arrival_at, p.full_name, d.title from deal_visits v join deals d on d.id = v.deal_id join patients p on p.id = d.patient_id
        where v.clinic_id = ${c.clinicId} and v.arrival_at >= ${from} and v.arrival_at < ${to} order by v.arrival_at`;
      const takings = c.perms["field.price"] === "hide" ? [] : await tx`select currency, method, sum(amount_minor)::bigint as total, count(*)::int as n from payments where clinic_id = ${c.clinicId} and received_at >= ${from} and received_at < ${to} group by currency, method`;
      const staff = await tx`select m.user_id, u.name, m.role, m.availability from memberships m join users u on u.id = m.user_id where m.clinic_id = ${c.clinicId} and m.active and m.role in ('dentist','translator','admin')`;
      return { appointments: appts.map((a) => ({ ...a, phone: maskValue(a.phone, c.perms["field.phone"]) })), arrivals, takings, staff };
    });
  });
}
