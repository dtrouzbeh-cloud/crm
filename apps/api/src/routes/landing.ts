// Landing page oluşturucu: şablonlar, CRUD, herkese açık sayfa (+ klinik içerikleri), form → lead (kaynak 'landing', kampanya)
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql, type Tx } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError } from "../http.ts";
import { audit } from "../services/audit.ts";
import { signFile } from "../services/storage.ts";
import { createLead } from "./leads.ts";
import { config } from "../config.ts";

type Block = { type: string; props: Record<string, unknown> };
const B = (type: string, props: Record<string, unknown>): Block => ({ type, props });
export const LP_TEMPLATES: Record<string, { title: string; campaign: string; lang: string; blocks: Block[] }> = {
  allon4_de: { title: "All-on-4 Zahnimplantate in der Türkei", campaign: "LP All-on-4 DE", lang: "de", blocks: [
    B("hero", { title: "Feste Zähne an einem Tag — All-on-4", subtitle: "Bis zu 70 % günstiger als in Deutschland. Deutschsprachige Betreuung, Hotel & Transfer inklusive.", cta: "Kostenlosen Behandlungsplan erhalten" }),
    B("benefits", { items: ["Kostenlose Online-Beratung mit Röntgenbild", "Markenimplantate mit Implantatpass", "Hotel, Transfer & Dolmetscher inklusive", "Schriftliche Garantie"] }),
    B("prices", { tx: ["implant", "crown_zr"], bundles: ["ao4_u", "ao4_l"] }), B("testimonials", {}), B("gallery", {}),
    B("faq", { items: [{ q: "Wie lange dauert die Behandlung?", a: "In der Regel 2 Besuche: Implantation (5–7 Tage) und nach 3–6 Monaten der endgültige Zahnersatz." }, { q: "Ist eine Kostenübernahme möglich?", a: "Wir erstellen Ihnen einen detaillierten Heil- und Kostenplan für Ihre Krankenkasse." }] }),
    B("form", { title: "Jetzt kostenlosen Plan anfordern" })] },
  veneers_en: { title: "Hollywood Smile — Veneers in Turkey", campaign: "LP Veneers EN", lang: "en", blocks: [
    B("hero", { title: "Your Hollywood smile in 5 days", subtitle: "Premium E-max & zirconia veneers, designed by our smile-design team. Hotel and transfers included.", cta: "Get my free smile plan" }),
    B("benefits", { items: ["Free digital smile assessment", "E-max / zirconia — natural look", "All-inclusive packages", "Written warranty"] }),
    B("prices", { tx: ["veneer_emax", "veneer_por", "crown_zr"], bundles: ["smile_emax_u", "smile_zr_u"] }), B("gallery", {}), B("testimonials", {}), B("faq", {}), B("form", { title: "Send us your photos" })] },
  general_tr: { title: "Diş tedavisinde ücretsiz ön değerlendirme", campaign: "LP Genel TR", lang: "tr", blocks: [
    B("hero", { title: "Gülüşünüz için ücretsiz tedavi planı", subtitle: "Fotoğraflarınızı gönderin, hekimimiz size özel planı ve fiyatı hazırlasın.", cta: "Ücretsiz plan iste" }),
    B("benefits", { items: ["Uzman hekim kadrosu", "Garantili tedaviler", "Konaklama ve transfer desteği"] }), B("prices", {}), B("team", {}), B("faq", {}), B("form", {})] },
};

const BLOCK = z.object({ type: z.enum(["hero", "benefits", "prices", "testimonials", "gallery", "team", "faq", "form", "text", "cta"]), props: z.record(z.string(), z.unknown()).default({}) });
const PAGE = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/), title: z.string().trim().min(1).max(160), lang: z.string().min(2).max(5), blocks: z.array(BLOCK).max(30), theme: z.record(z.string(), z.unknown()).default({}), campaign: z.string().max(200).nullable().optional(), published: z.boolean().default(false) });
const pick = (v: any, lang: string) => (typeof v === "string" ? v : v?.[lang] ?? v?.en ?? v?.tr ?? Object.values(v ?? {})[0] ?? "");

export function landingRoutes(app: FastifyInstance) {
  app.get("/api/landing", async (req) => {
    const c = need(ctx(req), "lead.read");
    return withClinic(c.clinicId, async (tx) => { const [cl] = await tx`select slug from clinics where id = ${c.clinicId}`;
      return (await tx`select id, slug, title, lang, published, views, leads, campaign, updated_at from landing_pages order by updated_at desc`).map((p) => ({ ...p, url: `${config.appUrl}/p/${cl!.slug}/${p.slug}` })); });
  });
  app.get("/api/landing/templates", async () => Object.entries(LP_TEMPLATES).map(([k, v]) => ({ key: k, title: v.title, lang: v.lang })));
  app.post("/api/landing", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(z.object({ template: z.string().optional() }).and(PAGE.partial()), req.body);
    const t = b.template ? LP_TEMPLATES[b.template] : null;
    return withClinic(c.clinicId, async (tx) => {
      let slug = b.slug ?? (b.template ?? "sayfa").replace(/_/g, "-"); let i = 1; while ((await tx`select 1 from landing_pages where slug = ${slug}`).length) slug = `${b.slug ?? (b.template ?? "sayfa").replace(/_/g, "-")}-${++i}`;
      const [p] = await tx`insert into landing_pages (clinic_id, slug, title, lang, blocks, theme, campaign) values (${c.clinicId}, ${slug}, ${b.title ?? t?.title ?? "Landing"}, ${b.lang ?? t?.lang ?? "en"}, ${tx.json((b.blocks ?? t?.blocks ?? [B("hero", {}), B("form", {})]) as never)}, ${tx.json((b.theme ?? {}) as never)}, ${b.campaign ?? t?.campaign ?? null}) returning *`;
      await audit(tx, c, "landing.create", "landing_page", p!.id as string); return p;
    });
  });
  app.get("/api/landing/:id", async (req) => { const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    return withClinic(c.clinicId, async (tx) => { const [p] = await tx`select * from landing_pages where id = ${id}`; if (!p) throw notFound("Sayfa"); const [cl] = await tx`select slug from clinics where id = ${c.clinicId}`; return { ...p, url: `${config.appUrl}/p/${cl!.slug}/${p.slug}` }; }); });
  app.put("/api/landing/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parsePatch(PAGE.partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select * from landing_pages where id = ${id}`; if (!p) throw notFound("Sayfa");
      if (b.slug && b.slug !== p.slug && (await tx`select 1 from landing_pages where slug = ${b.slug}`).length) throw new HttpError(409, "slug_taken", "Bu adres kullanılıyor");
      await tx`update landing_pages set slug = ${b.slug ?? p.slug}, title = ${b.title ?? p.title}, lang = ${b.lang ?? p.lang}, blocks = ${tx.json((b.blocks ?? p.blocks) as never)}, theme = ${tx.json((b.theme ?? p.theme) as never)},
        campaign = ${b.campaign !== undefined ? b.campaign : p.campaign}, published = ${b.published ?? p.published} where id = ${id}`;
      return { ok: true };
    });
  });
  app.delete("/api/landing/:id", async (req) => { const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; return withClinic(c.clinicId, async (tx) => { await tx`delete from landing_pages where id = ${id}`; return { ok: true }; }); });

  // ── herkese açık ──
  async function pageBy(clinicSlug: string, slug: string, preview = false) {
    const [p] = await ownerSql`select lp.*, c.id as cid, c.name as clinic_name, c.brand_color, c.phone, c.email, c.website, c.city, c.country, c.logo_file_id, c.default_currency
      from landing_pages lp join clinics c on c.id = lp.clinic_id where c.slug = ${clinicSlug} and lp.slug = ${slug}`;
    if (!p || (!p.published && !preview)) throw notFound("Sayfa"); return p;
  }
  app.get("/api/public/lp/:clinic/:slug", async (req) => {
    const { clinic, slug } = req.params as { clinic: string; slug: string }; const preview = "preview" in (req.query as object) && !!req.sessionUserId;
    const p = await pageBy(clinic, slug, preview);
    if (!preview) await ownerSql`update landing_pages set views = views + 1 where id = ${p.id}`;
    const content = await ownerSql`select kind, data, file_id from clinic_content where clinic_id = ${p.cid} and active and kind in ('team','gallery','faq','testimonial','certificate') order by sort limit 40`;
    // fiyat bloğu: katalogdan 'başlayan' fiyatlar
    const priceBlock = (p.blocks as Block[]).find((b) => b.type === "prices");
    let prices: { name: string; from: number }[] = [];
    if (priceBlock) {
      const { loadCatalog } = await import("../services/catalog.ts"); const { convert, tn } = await import("@dentaflow/core/engine");
      const cat = await ownerSql.begin(async (tx) => { await tx`select set_config('app.clinic_id', ${p.cid}, true)`; return loadCatalog(tx as unknown as Tx, p.cid as string); });
      const txs = (priceBlock.props.tx as string[] | undefined) ?? ["implant", "crown_zr", "veneer_emax", "whitening"]; const bs = (priceBlock.props.bundles as string[] | undefined) ?? [];
      prices = [...txs.map((k) => cat.tx(k)).filter(Boolean).map((x: any) => ({ name: tn(x.n, p.lang), from: convert(cat, x.price, p.defaultCurrency, x.prices) })),
        ...bs.map((k) => cat.bundle(k)).filter(Boolean).map((b: any) => ({ name: tn(b.n, p.lang), from: convert(cat, b.price, p.defaultCurrency, b.prices) }))];
    }
    const [w] = await ownerSql`select external_id from channel_accounts where clinic_id = ${p.cid} and channel = 'web' and status = 'connected' limit 1`;
    return { title: p.title, lang: p.lang, blocks: p.blocks, theme: p.theme, campaign: p.campaign, widgetKey: w?.externalId ?? null, currency: p.defaultCurrency, prices,
      clinic: { name: p.clinicName, color: (p.theme as any)?.color || p.brandColor, phone: p.phone, email: p.email, website: p.website, city: p.city, country: p.country, logo: p.logoFileId ? signFile(p.logoFileId as string, 86400) : null },
      content: content.map((x) => ({ kind: x.kind, data: x.data, image: x.fileId ? signFile(x.fileId as string, 86400) : null })) };
  });
  app.post("/api/public/lp/:clinic/:slug/lead", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const { clinic, slug } = req.params as { clinic: string; slug: string }; const p = await pageBy(clinic, slug);
    const b = parse(z.object({ name: z.string().trim().min(2).max(120), phone: z.string().max(40).optional(), email: z.email().optional().or(z.literal("")), treatment: z.string().max(120).optional(), message: z.string().max(4000).optional(),
      consent: z.boolean().optional(), utm: z.record(z.string(), z.string().max(200)).optional() }), req.body);
    if (!b.phone && !b.email) throw new HttpError(400, "contact_required", "Telefon veya e-posta gerekli");
    const r = await ownerSql.begin(async (tx0) => { const tx = tx0 as unknown as Tx; await tx`select set_config('app.clinic_id', ${p.cid}, true)`;
      const out = await createLead(tx, { clinicId: p.cid as string, userId: null as unknown as string }, { fullName: b.name, phone: b.phone ?? null, email: b.email || null, language: p.lang, source: "landing", campaign: b.utm?.campaign ?? p.campaign ?? p.slug,
        temperature: "warm", interest: b.treatment ?? null, issue: b.message ?? null, utm: { ...(b.utm ?? {}), landing: p.slug }, marketingConsent: !!b.consent } as never, { dedupe: "attach" });
      await tx`update landing_pages set leads = leads + 1 where id = ${p.id}`; return out; });
    return { ok: true, leadId: r.leadId };
  });
  void pick;
}
