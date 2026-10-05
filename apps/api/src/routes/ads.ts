// Reklam API: Meta Ads/CAPI ayarları, harcama senkronu, CSV içe aktarma, ROAS, dönüşüm kayıtları, Google offline dönüşüm CSV'si
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { ctx, need, parse, HttpError } from "../http.ts";
import { audit } from "../services/audit.ts";
import { encrypt } from "../lib/crypto.ts";
import { metaIntegration, syncMetaSpend, rowsFromCsv, roas } from "../services/ads.ts";
import { parseCsv } from "./integrations.ts";

const range = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const dflt = (q: { from?: string; to?: string }) => ({ from: q.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), to: q.to ?? new Date().toISOString().slice(0, 10) });

export function adsRoutes(app: FastifyInstance) {
  app.get("/api/ads/meta", async (req) => {
    const c = need(ctx(req), "integrations.manage"); const ig = await metaIntegration(c.clinicId);
    const [row] = ig ? await ownerSql`select status, last_sync_at, last_error from integrations where id = ${ig.id}` : [null];
    return { configured: !!ig, config: ig?.config ?? {}, hasToken: !!ig?.cred.token, hasCapiToken: !!ig?.cred.capiToken, status: row?.status ?? null, lastSyncAt: row?.lastSyncAt ?? null, lastError: row?.lastError ?? null };
  });
  app.put("/api/ads/meta", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ adAccountId: z.string().regex(/^(act_)?\d{5,30}$/).optional().or(z.literal("")), token: z.string().min(20).optional(), datasetId: z.string().regex(/^\d{5,30}$/).optional().or(z.literal("")), capiToken: z.string().min(20).optional(),
      capi: z.boolean().optional(), requireConsent: z.boolean().optional(), currency: z.string().length(3).optional(), events: z.record(z.string(), z.string().max(40)).optional() }), req.body);
    const ig = await metaIntegration(c.clinicId);
    const cred = { ...(ig?.cred ?? {}), ...(b.token ? { token: b.token } : {}), ...(b.capiToken ? { capiToken: b.capiToken } : {}) };
    const cfg = { ...(ig?.config ?? {}), ...Object.fromEntries(Object.entries({ adAccountId: b.adAccountId, datasetId: b.datasetId, capi: b.capi, requireConsent: b.requireConsent, currency: b.currency, events: b.events }).filter(([, v]) => v !== undefined)) };
    return withClinic(c.clinicId, async (tx) => {
      if (ig) await tx`update integrations set credentials_enc = ${encrypt(JSON.stringify(cred))}, config = ${tx.json(cfg as never)}, status = 'configured' where id = ${ig.id}`;
      else await tx`insert into integrations (clinic_id, kind, name, credentials_enc, config) values (${c.clinicId}, 'meta_ads', 'Meta Ads', ${encrypt(JSON.stringify(cred))}, ${tx.json(cfg as never)})`;
      await audit(tx, c, "ads.meta.update", "integration", null, { adAccountId: cfg.adAccountId, capi: cfg.capi }); return { ok: true };
    });
  });
  app.post("/api/ads/meta/sync", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    try { return { rows: await syncMetaSpend(c.clinicId, 30) }; } catch (e) { throw new HttpError(502, "meta_failed", (e as Error).message); }
  });
  app.post("/api/ads/import", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    const b = parse(z.object({ platform: z.enum(["google", "tiktok", "meta", "other"]), currency: z.string().length(3), csv: z.string().min(10).max(5_000_000) }), req.body);
    let rows; try { rows = rowsFromCsv(parseCsv(b.csv)); } catch (e) { throw new HttpError(400, "bad_csv", (e as Error).message); }
    return withClinic(c.clinicId, async (tx) => {
      let n = 0;
      for (const r of rows) { if (!/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue;
        await tx`insert into ad_spend (clinic_id, platform, day, campaign, spend_minor, currency, impressions, clicks, platform_leads, source) values (${c.clinicId}, ${b.platform}, ${r.day}, ${r.campaign}, ${r.spendMinor}, ${b.currency}, ${r.impressions}, ${r.clicks}, ${r.leads}, 'csv')
          on conflict (clinic_id, platform, day, campaign) do update set spend_minor = excluded.spend_minor, impressions = excluded.impressions, clicks = excluded.clicks, platform_leads = excluded.platform_leads, currency = excluded.currency, updated_at = now()`; n++; }
      await audit(tx, c, "ads.import", "ad_spend", null, { platform: b.platform, n }); return { imported: n };
    });
  });
  app.get("/api/ads/roas", async (req) => {
    const c = need(ctx(req), "reports.view"); const q = dflt(parse(range, req.query));
    return withClinic(c.clinicId, async (tx) => ({ ...q, rows: await roas(tx, q.from, q.to),
      daily: await tx`select day, sum(spend_minor)::bigint as spend, max(currency) as currency from ad_spend where day between ${q.from} and ${q.to} group by day order by day` }));
  });
  app.get("/api/ads/conversions", async (req) => {
    const c = need(ctx(req), "integrations.manage");
    return withClinic(c.clinicId, (tx) => tx`select ce.id, ce.event, ce.platform, ce.status, ce.error, ce.value_minor, ce.currency, ce.created_at, ce.sent_at, p.full_name, ce.lead_id from conversion_events ce join leads l on l.id = ce.lead_id join patients p on p.id = l.patient_id order by ce.created_at desc limit 200`);
  });
  // Google Ads offline dönüşüm içe aktarma şablonu (gclid'li lead'ler)
  app.get("/api/ads/google-conversions.csv", async (req, reply) => {
    const c = need(ctx(req), "integrations.manage"); const q = dflt(parse(range, req.query));
    const rows = await withClinic(c.clinicId, (tx) => tx`
      select l.utm->>'gclid' as gclid, 'Deal' as name, d.created_at as at, d.value_minor, d.currency from deals d join leads l on l.id = d.lead_id where l.utm ? 'gclid' and d.created_at::date between ${q.from} and ${q.to}
      union all
      select l.utm->>'gclid', 'Qualified lead', l.stage_entered_at, null, null from leads l where l.utm ? 'gclid' and l.stage in ('interested','in_diagnosis','plan_ready','quote_sent','negotiation','won') and l.created_at::date between ${q.from} and ${q.to}`);
    const fmt = (d: Date) => new Date(d).toISOString().replace("T", " ").slice(0, 19) + "+0000";
    reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="google-offline-conversions-${q.from}.csv"`);
    return ["Parameters:TimeZone=+0000", "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
      ...rows.map((r) => [r.gclid, r.name, fmt(r.at as Date), r.valueMinor != null ? (Number(r.valueMinor) / 100).toFixed(2) : "", r.currency ?? ""].join(","))].join("\n");
  });
}
