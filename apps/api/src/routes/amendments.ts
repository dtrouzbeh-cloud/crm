// Deal sonrası plan revizyonları: klinikte değişen tedaviler fiyatlanır (sunucuda, katalogdan), hastaya bağlantıyla
// ya da klinikte imzayla onaylatılır; onayda deal değeri ve ziyaret planı güncellenir.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { withClinic, ownerSql, type Tx } from "../db.ts";
import { ctx, parse, notFound, HttpError, ipOf, forbidden, type Ctx } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { loadCatalog } from "../services/catalog.ts";
import { unitPrice, qtyOf, itemName } from "@dentaflow/core/engine";
import { randomToken, sha256, encrypt, decrypt } from "../lib/crypto.ts";
import { storage } from "../services/storage.ts";
import { config } from "../config.ts";

const canWrite = (c: Ctx) => { if (!c.perms["deal.write"] && !c.perms["case.write"]) throw forbidden("deal.write"); return c; };
const LINE = z.object({
  kind: z.enum(["add", "remove"]), v: z.number().int().min(1).max(20),
  tx: z.string().max(40).nullable().optional(), b: z.string().max(40).nullable().optional(), brand: z.string().max(40).nullable().optional(),
  teeth: z.array(z.number().int().min(11).max(48)).max(32).optional(), jaws: z.array(z.enum(["u", "l"])).max(2).optional(), qty: z.number().int().min(1).max(64).optional(),
  ref: z.string().max(80).optional(),                         // remove: kabul edilen satır "v:index"
  manual: z.boolean().optional(), name: z.string().max(200).optional(), price: z.number().min(0).max(1e7).optional(),
});
const SHARE: Record<string, string> = {
  en: "Hello {name}, your dentist updated your treatment plan. Please review and approve the changes: {link}",
  tr: "Merhaba {name}, hekiminiz tedavi planınızı güncelledi. Lütfen değişiklikleri inceleyip onaylayın: {link}",
  de: "Hallo {name}, Ihr Zahnarzt hat Ihren Behandlungsplan aktualisiert. Bitte prüfen und bestätigen Sie die Änderungen: {link}",
  ar: "مرحباً {name}، قام طبيبك بتحديث خطة العلاج. يرجى مراجعة التغييرات والموافقة عليها: {link}",
};

async function priceLines(tx: Tx, c: Ctx, deal: any, input: z.infer<typeof LINE>[]) {
  const cat = await loadCatalog(tx, c.clinicId); const cur = deal.currency as string; const lang = "en";
  const accepted = deal.acceptedOption?.calc?.visits ?? [];
  return input.map((l) => {
    if (l.kind === "remove") {
      const [v, i] = String(l.ref ?? "").split(":").map(Number); const src = accepted.find((x: any) => x.v === v)?.lines?.[i!];
      if (!src) throw new HttpError(400, "bad_ref", "Kaldırılacak kalem bulunamadı");
      const qty = Math.min(l.qty ?? src.qty, src.qty); const unitMinor = Math.round(Number(src.unit) * 100);
      return { kind: "remove", v: src.v, ref: l.ref, name: src.nm + (src.br ? " · " + src.br : ""), teeth: src.teeth ?? [], qty, unitMinor, totalMinor: -qty * unitMinor };
    }
    if (l.manual) {
      if (!c.perms["quote.price"]) throw forbidden("quote.price");
      if (!l.name) throw new HttpError(400, "name_required", "Kalem adı gerekli");
      const qty = l.qty ?? 1, unitMinor = Math.round((l.price ?? 0) * 100);
      return { kind: "add", v: l.v, manual: true, name: l.name, teeth: l.teeth ?? [], qty, unitMinor, totalMinor: qty * unitMinor };
    }
    if (!l.tx && !l.b) throw new HttpError(400, "item_required", "Tedavi seçin");
    if (l.tx && !cat.tx(l.tx)) throw new HttpError(400, "bad_tx", "Bilinmeyen tedavi");
    if (l.b && !cat.bundle(l.b)) throw new HttpError(400, "bad_bundle", "Bilinmeyen paket");
    const it = { id: randomUUID(), v: l.v, tx: l.tx ?? null, b: l.b ?? null, brand: l.brand ?? null, teeth: l.teeth ?? [], jaws: l.jaws ?? [], qty: l.qty };
    const qty = qtyOf(cat, it as never), unitMinor = Math.round(unitPrice(cat, it as never, cur) * 100);
    return { kind: "add", v: l.v, tx: it.tx, b: it.b, brand: it.brand, teeth: it.teeth, jaws: it.jaws, name: itemName(cat, it as never, deal.lang ?? lang), qty, unitMinor, totalMinor: qty * unitMinor };
  });
}

/** Onaylanan revizyonu deal'e uygula (aynı işlem içinde) */
async function applyAmendment(tx: Tx, a: any, resp: Record<string, unknown>) {
  const [u] = await tx`update deal_amendments set status = 'approved', decided_at = now(), response = ${tx.json(resp as never)} where id = ${a.id} and status in ('draft','sent') returning id`;
  if (!u) throw new HttpError(409, "closed", "Bu revizyon artık yanıtlanamaz");
  const delta = Number(a.deltaMinor);
  await tx`update deals set value_minor = greatest(0, value_minor + ${delta}), amended_minor = amended_minor + ${delta} where id = ${a.dealId}`;
  const byV: Record<number, number> = {}; for (const l of a.lines as any[]) byV[l.v] = (byV[l.v] ?? 0) + Number(l.totalMinor);
  for (const [v, d] of Object.entries(byV)) {
    if (!d) continue;
    await tx`insert into deal_visits (clinic_id, deal_id, visit_no, planned_minor) values (${a.clinicId}, ${a.dealId}, ${Number(v)}, ${Math.max(0, d)})
      on conflict (deal_id, visit_no) do update set planned_minor = greatest(0, deal_visits.planned_minor + ${d})`;
  }
  const [d] = await tx`select d.lead_id, d.owner_id, d.currency, p.full_name from deals d join patients p on p.id = d.patient_id where d.id = ${a.dealId}`;
  await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${a.clinicId}, ${d!.leadId}, 'deal', 'amended', ${tx.json({ amendmentId: a.id, number: a.number, deltaMinor: delta, currency: d!.currency, channel: resp.channel } as never)})`;
  await emit(tx, a.clinicId, "deal.amended", a.dealId, { dealId: a.dealId, amendmentId: a.id, leadId: d!.leadId, ownerId: d!.ownerId, name: d!.fullName, deltaMinor: delta, link: "/deals/" + a.dealId });
}

async function storeSignature(clinicId: string, leadId: string, dataUrl: string | undefined, name: string) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? ""); if (!m) return null;
  const buf = Buffer.from(m[1]!, "base64"); if (buf.length < 300) return null;
  const id = randomUUID(), key = `${clinicId}/consent/${id.slice(0, 2)}/${id}`;
  await storage.put(key, buf);
  await ownerSql`insert into files (id, clinic_id, kind, name, mime, size_bytes, storage_key, sha256, entity, entity_id) values (${id}, ${clinicId}, 'consent', ${"amendment-" + name + ".png"}, 'image/png', ${buf.length}, ${key}, ${sha256(m[1]!)}, 'lead', ${leadId})`;
  return id;
}

export function amendmentRoutes(app: FastifyInstance) {
  app.get("/api/deals/:id/amendments", async (req) => {
    const c = ctx(req); if (!c.perms["deal.read"] && !c.perms["case.read"]) throw forbidden(); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => (await tx`select a.*, u.name as created_by_name from deal_amendments a left join users u on u.id = a.created_by where a.deal_id = ${id} order by a.number desc`)
      .map(({ tokenHash, tokenEnc, ...a }) => ({ ...a, url: tokenEnc && a.status === "sent" ? `${config.appUrl}/a/${decrypt(tokenEnc as string)}` : null })));
  });
  app.post("/api/deals/:id/amendments", async (req) => {
    const c = canWrite(ctx(req)); const { id } = req.params as { id: string };
    const b = parse(z.object({ reason: z.string().trim().min(2).max(2000), lines: z.array(LINE).min(1).max(60), lang: z.string().min(2).max(5).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [deal] = await tx`select d.*, p.language as lang from deals d join patients p on p.id = d.patient_id where d.id = ${id}`; if (!deal) throw notFound("Deal");
      if (deal.status === "lost") throw new HttpError(409, "deal_closed", "Kapalı deal");
      const lines = await priceLines(tx, c, deal, b.lines); const delta = lines.reduce((s, l) => s + l.totalMinor, 0);
      const [{ n }] = await tx`select coalesce(max(number), 0) + 1 as n from deal_amendments where deal_id = ${id}` as unknown as [{ n: number }];
      const [a] = await tx`insert into deal_amendments (clinic_id, deal_id, number, lines, delta_minor, currency, reason, lang, created_by)
        values (${c.clinicId}, ${id}, ${n}, ${tx.json(lines as never)}, ${delta}, ${deal.currency}, ${b.reason}, ${b.lang ?? deal.lang ?? "en"}, ${c.userId}) returning *`;
      await audit(tx, c, "deal.amendment.create", "deal", id, { number: n, delta }); return a;
    });
  });
  app.post("/api/amendments/:id/send", async (req) => {
    const c = canWrite(ctx(req)); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => {
      const [a] = await tx`select a.*, p.full_name, p.phone from deal_amendments a join deals d on d.id = a.deal_id join patients p on p.id = d.patient_id where a.id = ${id}`; if (!a) throw notFound("Revizyon");
      if (!["draft", "sent"].includes(a.status as string)) throw new HttpError(409, "closed");
      const token = a.tokenEnc ? decrypt(a.tokenEnc as string) : randomToken(18);
      await tx`update deal_amendments set status = 'sent', sent_at = coalesce(sent_at, now()), token_hash = ${sha256(token)}, token_enc = ${encrypt(token)} where id = ${id}`;
      const url = `${config.appUrl}/a/${token}`;
      return { url, phone: a.phone, shareText: (SHARE[a.lang as string] ?? SHARE.en!).replace("{name}", String(a.fullName).split(" ")[0]!).replace("{link}", url) };
    });
  });
  app.post("/api/amendments/:id/approve-in-clinic", async (req) => {
    const c = canWrite(ctx(req)); const { id } = req.params as { id: string };
    const b = parse(z.object({ name: z.string().trim().min(2).max(160), signature: z.string().max(400_000).optional() }), req.body);
    const [a0] = await withClinic(c.clinicId, (tx) => tx`select a.*, d.lead_id from deal_amendments a join deals d on d.id = a.deal_id where a.id = ${id}`); if (!a0) throw notFound("Revizyon");
    const sig = await storeSignature(c.clinicId, a0.leadId as string, b.signature, id);
    if (!sig) throw new HttpError(400, "signature_required", "Hasta imzası gerekli");
    await withClinic(c.clinicId, async (tx) => {
      await applyAmendment(tx, a0, { action: "approve", channel: "in_clinic", name: b.name, signatureFileId: sig, by: c.userId, at: new Date().toISOString(), ip: ipOf(req) });
      await audit(tx, c, "deal.amendment.approve_in_clinic", "deal", a0.dealId as string, { id, name: b.name });
    });
    return { ok: true };
  });
  app.post("/api/amendments/:id/cancel", async (req) => {
    const c = canWrite(ctx(req)); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [u] = await tx`update deal_amendments set status = 'canceled', decided_at = now() where id = ${id} and status in ('draft','sent') returning deal_id`; if (!u) throw new HttpError(409, "closed"); await audit(tx, c, "deal.amendment.cancel", "deal", u.dealId as string, { id }); return { ok: true }; });
  });

  // ── Hasta ──
  async function byToken(token: string) {
    const [a] = await ownerSql`select a.*, d.value_minor, d.title, d.lead_id, p.full_name, cl.name as clinic_name, cl.brand_color from deal_amendments a join deals d on d.id = a.deal_id join patients p on p.id = d.patient_id join clinics cl on cl.id = a.clinic_id where a.token_hash = ${sha256(token)}`;
    if (!a || a.status === "canceled" || a.status === "draft") throw notFound("Revizyon"); return a;
  }
  app.get("/api/public/a/:token", async (req) => {
    const a = await byToken((req.params as { token: string }).token);
    const before = a.status === "approved" ? Number(a.valueMinor) - Number(a.deltaMinor) : Number(a.valueMinor);
    return { status: a.status, number: a.number, lang: a.lang, reason: a.reason, lines: a.lines, deltaMinor: a.deltaMinor, currency: a.currency, beforeMinor: before, afterMinor: Math.max(0, before + Number(a.deltaMinor)),
      patient: a.fullName, clinic: { name: a.clinicName, color: a.brandColor }, response: a.response ? { action: (a.response as any).action, at: (a.response as any).at } : null };
  });
  app.post("/api/public/a/:token/respond", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    if (req.sessionUserId) throw new HttpError(403, "staff_preview", "Personel oturumunda yanıt verilemez — 'klinikte onayla' kullanın");
    const b = parse(z.object({ action: z.enum(["approve", "reject"]), name: z.string().trim().min(2).max(160), agree: z.boolean().optional(), message: z.string().max(2000).optional() }), req.body);
    if (b.action === "approve" && !b.agree) throw new HttpError(400, "agree_required", "Onay kutusu işaretlenmeli");
    const a = await byToken((req.params as { token: string }).token);
    if (a.status !== "sent") throw new HttpError(409, "closed", "Bu revizyon artık yanıtlanamaz");
    const resp = { action: b.action, channel: "link", name: b.name, message: b.message ?? null, at: new Date().toISOString(), ip: ipOf(req), ua: req.headers["user-agent"] ?? null };
    await ownerSql.begin(async (tx) => {
      if (b.action === "approve") return applyAmendment(tx as unknown as Tx, a, resp);
      const [u] = await tx`update deal_amendments set status = 'rejected', decided_at = now(), response = ${tx.json(resp as never)} where id = ${a.id} and status = 'sent' returning id`; if (!u) throw new HttpError(409, "closed");
      const [d] = await tx`select owner_id from deals where id = ${a.dealId}`;
      await tx`insert into tasks (clinic_id, title, type, priority, due_at, lead_id, assignee_id, entity, entity_id) values (${a.clinicId}, ${a.fullName + " plan revizyonunu reddetti — görüş"}, 'call', 'high', now() + interval '1 hour', ${a.leadId}, ${d?.ownerId ?? null}, 'deal', ${a.dealId})`;
      await tx`insert into lead_events (clinic_id, lead_id, type, body, data) values (${a.clinicId}, ${a.leadId}, 'deal', 'amendment_rejected', ${tx.json({ amendmentId: a.id, message: b.message ?? null } as never)})`;
    });
    return { ok: true, status: b.action === "approve" ? "approved" : "rejected" };
  });
}
