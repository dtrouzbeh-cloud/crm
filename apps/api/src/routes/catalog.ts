import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound } from "../http.ts";
import { audit } from "../services/audit.ts";
import { invalidateCatalog, loadCatalog } from "../services/catalog.ts";
import { seedClinicCatalog } from "../services/catalog-seed.ts";
import { BLOCK_RULES, WARN_RULES } from "@dentaflow/core/engine";

const names = z.array(z.string().max(200)).min(1).max(12);
const brand = z.object({ id: z.string().max(40), n: z.string().max(120), price: z.number().min(0), form: z.enum(["std", "short", "narrow"]).optional() });

export function catalogRoutes(app: FastifyInstance) {
  // Motor formatında katalog (web canlı hesaplama için)
  app.get("/api/catalog", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const cat = await loadCatalog(tx, c.clinicId);
      const hideMoney = c.perms["field.price"] === "hide";
      const strip = <T extends { price: number; brands?: { price: number }[] }>(x: T) => hideMoney ? { ...x, price: 0, prices: undefined, brands: x.brands?.map((b) => ({ ...b, price: 0 })) } : x;
      const hotels = await tx`select id, name, stars, night_eur, room_types, active from hotels where clinic_id = ${c.clinicId} order by sort`;
      return { treatments: cat.treatments.map(strip), bundles: cat.bundles.map(strip), rules: cat.rules, fx: cat.fx, rounding: cat.rounding, depositBps: cat.depositBps,
        hotelNightEur: cat.hotelNightEur, transferEur: cat.transferEur, gapMinMonths: cat.gapMinMonths, gapMaxMonths: cat.gapMaxMonths, hotels, blockRules: BLOCK_RULES, warnRules: WARN_RULES };
    });
  });

  app.put("/api/catalog/treatments/:code", async (req) => {
    const c = need(ctx(req), "catalog.manage");
    const { code } = req.params as { code: string };
    const b = parsePatch(z.object({ category: z.string().max(30), names, descriptions: names.nullable(), unit: z.enum(["tooth", "side", "arch", "mouth", "piece"]), render: z.string().max(20),
      material: z.string().max(10).nullable(), visits: z.array(z.number().int().min(1).max(10)).min(1), color: z.string().max(10).nullable(), priceEur: z.number().min(0),
      prices: z.record(z.string(), z.number()).nullable(), brands: z.array(brand).nullable(), tiers: z.array(z.tuple([z.number(), z.number()])).nullable(),
      needsImplant: z.boolean(), prereq: z.object({ tx: z.string(), count: z.number() }).nullable(), active: z.boolean(), sort: z.number().int() }).partial(), req.body);
    const map: Record<string, string> = { category: "category", unit: "unit", render: "render", material: "material", visits: "visits", color: "color", priceEur: "price_eur", needsImplant: "needs_implant", active: "active", sort: "sort" };
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      for (const [k, col] of [["names", "names"], ["descriptions", "descriptions"], ["prices", "prices"], ["brands", "brands"], ["tiers", "tiers"], ["prereq", "prereq"]] as const)
        if ((b as any)[k] !== undefined) set[col] = (b as any)[k] === null ? null : tx.json((b as any)[k]);
      const [ex] = await tx`select id from treatment_types where clinic_id = ${c.clinicId} and code = ${code}`;
      if (ex) await tx`update treatment_types set ${tx(set as never)}, updated_at = now() where id = ${ex.id}`;
      else await tx`insert into treatment_types ${tx({ clinic_id: c.clinicId, code, category: "other", names: tx.json(["Yeni tedavi", "New treatment"]), unit: "piece", render: "none", ...set } as never)}`;
      invalidateCatalog(c.clinicId);
      await audit(tx, c, ex ? "catalog.treatment.update" : "catalog.treatment.create", "treatment", code, b);
      return { ok: true };
    });
  });

  app.put("/api/catalog/bundles/:code", async (req) => {
    const c = need(ctx(req), "catalog.manage");
    const { code } = req.params as { code: string };
    const b = parsePatch(z.object({ names, jaw: z.enum(["u", "l"]), implantTeeth: z.array(z.number().int()), crownTeeth: z.array(z.number().int()), material: z.string().nullable(), archTreatment: z.string().nullable(),
      minVisits: z.number().int().min(1).max(10), visits: z.array(z.number().int()).min(1), prereq: z.object({ tx: z.string(), count: z.number() }).nullable(), brands: z.array(brand).nullable(),
      priceEur: z.number().min(0), color: z.string().nullable(), active: z.boolean() }).partial(), req.body);
    const map: Record<string, string> = { jaw: "jaw", implantTeeth: "implant_teeth", crownTeeth: "crown_teeth", material: "material", archTreatment: "arch_treatment", minVisits: "min_visits", visits: "visits", priceEur: "price_eur", color: "color", active: "active" };
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
      for (const k of ["names", "prereq", "brands"] as const) if (b[k] !== undefined) set[k] = b[k] === null ? null : tx.json(b[k] as never);
      const [ex] = await tx`select id from bundles where clinic_id = ${c.clinicId} and code = ${code}`;
      if (ex) await tx`update bundles set ${tx(set as never)} where id = ${ex.id}`;
      else await tx`insert into bundles ${tx({ clinic_id: c.clinicId, code, names: tx.json(["Yeni paket", "New package"]), jaw: "u", ...set } as never)}`;
      invalidateCatalog(c.clinicId);
      await audit(tx, c, "catalog.bundle.save", "bundle", code, b);
      return { ok: true };
    });
  });

  app.put("/api/catalog/rules", async (req) => {
    const c = need(ctx(req), "catalog.manage");
    const rules = parsePatch(z.record(z.string(), z.boolean()), req.body);
    await withClinic(c.clinicId, async (tx) => {
      await tx`update clinics set settings = jsonb_set(settings, '{rules}', ${tx.json(rules as never)}) where id = ${c.clinicId}`;
      await audit(tx, c, "catalog.rules.update", "clinic", c.clinicId, rules);
    });
    invalidateCatalog(c.clinicId);
    return { ok: true };
  });

  app.post("/api/catalog/reset", async (req) => {
    const c = need(ctx(req), "catalog.manage");
    await withClinic(c.clinicId, async (tx) => {
      await tx`delete from treatment_types where clinic_id = ${c.clinicId}`; await tx`delete from bundles where clinic_id = ${c.clinicId}`;
      await tx`delete from hotels where clinic_id = ${c.clinicId}`; await tx`delete from transfer_options where clinic_id = ${c.clinicId}`; await tx`delete from clinic_content where clinic_id = ${c.clinicId} and kind = 'faq'`;
      await seedClinicCatalog(tx, c.clinicId);
      await audit(tx, c, "catalog.reset", "clinic", c.clinicId);
    });
    invalidateCatalog(c.clinicId);
    return { ok: true };
  });

  // Oteller / transfer / içerik
  app.get("/api/catalog/hotels", async (req) => { const c = ctx(req); return withClinic(c.clinicId, (tx) => tx`select * from hotels where clinic_id = ${c.clinicId} order by sort`); });
  app.put("/api/catalog/hotels/:id", async (req) => {
    const c = need(ctx(req), "catalog.manage");
    const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ name: z.string().min(1).max(160), stars: z.number().int().min(1).max(5).nullable(), address: z.string().max(300).nullable(), distanceNote: z.string().max(200).nullable(), nightEur: z.number().min(0), active: z.boolean(), sort: z.number().int() }).partial(), req.body);
    const row: Record<string, unknown> = {}; for (const [k, col] of Object.entries({ name: "name", stars: "stars", address: "address", distanceNote: "distance_note", nightEur: "night_eur", active: "active", sort: "sort" })) if ((b as any)[k] !== undefined) row[col] = (b as any)[k];
    return withClinic(c.clinicId, async (tx) => {
      if (id === "new") { const [h] = await tx`insert into hotels ${tx({ clinic_id: c.clinicId, name: "Hotel", ...row } as never)} returning id`; invalidateCatalog(c.clinicId); return h; }
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Otel");
      const [h] = await tx`update hotels set ${tx(row as never)} where id = ${id} returning id`; if (!h) throw notFound("Otel");
      invalidateCatalog(c.clinicId); return h;
    });
  });
  app.delete("/api/catalog/hotels/:id", async (req) => { const c = need(ctx(req), "catalog.manage"); const { id } = req.params as { id: string }; if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Otel"); await withClinic(c.clinicId, (tx) => tx`delete from hotels where id = ${id}`); return { ok: true }; });

  app.get("/api/content", async (req) => { const c = ctx(req); return withClinic(c.clinicId, (tx) => tx`select * from clinic_content where clinic_id = ${c.clinicId} order by kind, sort`); });
  app.put("/api/content/:id", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ kind: z.enum(["team", "gallery", "faq", "certificate", "testimonial", "legal"]), data: z.record(z.string(), z.unknown()), fileId: z.uuid().nullable(), active: z.boolean(), sort: z.number().int() }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const row: Record<string, unknown> = {};
      if (b.kind) row.kind = b.kind; if (b.data) row.data = tx.json(b.data as never); if (b.fileId !== undefined) row.file_id = b.fileId; if (b.active !== undefined) row.active = b.active; if (b.sort !== undefined) row.sort = b.sort;
      if (id === "new") { const [r] = await tx`insert into clinic_content ${tx({ clinic_id: c.clinicId, kind: "faq", data: tx.json({}), ...row } as never)} returning id`; return r; }
      await tx`update clinic_content set ${tx(row as never)} where id = ${id}`; return { ok: true };
    });
  });
  app.delete("/api/content/:id", async (req) => { const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; await withClinic(c.clinicId, (tx) => tx`delete from clinic_content where id = ${id}`); return { ok: true }; });
}
