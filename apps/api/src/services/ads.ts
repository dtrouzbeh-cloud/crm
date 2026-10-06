// Reklam: harcama senkronu (Meta Marketing API) / CSV içe aktarma, ROAS, Meta Conversions API (CAPI) geri bildirimi, Google offline dönüşüm dışa aktarımı
import { createHash } from "node:crypto";
import { ownerSql, type Tx } from "../db.ts";
import { decrypt } from "../lib/crypto.ts";
import { meta } from "../config.ts";

const GRAPH = meta.graph;
const h = (s: string) => createHash("sha256").update(s).digest("hex");

export async function metaIntegration(clinicId: string) {
  const [ig] = await ownerSql`select * from integrations where clinic_id = ${clinicId} and kind = 'meta_ads' and status <> 'disabled' limit 1`;
  if (!ig) return null;
  let cred: { token?: string; capiToken?: string } = {}; try { cred = ig.credentialsEnc ? JSON.parse(decrypt(ig.credentialsEnc as string)) : {}; } catch { /* bozuk */ }
  return { id: ig.id as string, config: (ig.config ?? {}) as { adAccountId?: string; datasetId?: string; currency?: string; capi?: boolean; requireConsent?: boolean; events?: Record<string, string> }, cred };
}

/** Meta reklam harcaması: kampanya × gün (son N gün) */
export async function syncMetaSpend(clinicId: string, days = 30): Promise<number> {
  const ig = await metaIntegration(clinicId); if (!ig?.config.adAccountId || !ig.cred.token) return 0;
  const act = ig.config.adAccountId.startsWith("act_") ? ig.config.adAccountId : "act_" + ig.config.adAccountId;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), until = new Date().toISOString().slice(0, 10);
  let url: string | null = `${GRAPH}/${act}/insights?level=campaign&time_increment=1&fields=campaign_name,spend,impressions,clicks,actions,account_currency&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${encodeURIComponent(ig.cred.token)}`;
  let n = 0;
  try {
    while (url) {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) }); const j: any = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `meta_${r.status}`);
      for (const row of j.data ?? []) {
        const leads = (row.actions ?? []).filter((a: any) => /lead/.test(a.action_type)).reduce((s: number, a: any) => s + Number(a.value || 0), 0);
        await ownerSql`insert into ad_spend (clinic_id, platform, day, campaign, spend_minor, currency, impressions, clicks, platform_leads, source)
          values (${clinicId}, 'meta', ${row.date_start}, ${row.campaign_name ?? "?"}, ${Math.round(Number(row.spend || 0) * 100)}, ${row.account_currency ?? ig.config.currency ?? "EUR"}, ${Number(row.impressions || 0)}, ${Number(row.clicks || 0)}, ${leads}, 'api')
          on conflict (clinic_id, platform, day, campaign) do update set spend_minor = excluded.spend_minor, impressions = excluded.impressions, clicks = excluded.clicks, platform_leads = excluded.platform_leads, updated_at = now()`;
        n++;
      }
      url = j.paging?.next ?? null;
    }
    await ownerSql`update integrations set last_sync_at = now(), status = 'healthy', last_error = null where id = ${ig.id}`;
  } catch (e) { await ownerSql`update integrations set status = 'error', last_error = ${String((e as Error).message).slice(0, 500)} where id = ${ig.id}`; throw e; }
  return n;
}

/** CSV: tarih, kampanya, harcama (+ gösterim, tıklama, lead) — Google/TikTok/diğer */
export function rowsFromCsv(rows: string[][]) {
  const head = rows[0]!.map((x) => x.trim().toLowerCase());
  const idx = (...names: string[]) => head.findIndex((c) => names.some((n) => c === n || c.includes(n)));
  const iD = idx("date", "day", "tarih", "gün"), iC = idx("campaign", "kampanya"), iS = idx("spend", "cost", "amount", "harcama", "maliyet"), iI = idx("impressions", "gösterim"), iK = idx("clicks", "tıklama"), iL = idx("leads", "conversions", "dönüşüm");
  if (iD < 0 || iC < 0 || iS < 0) throw new Error("CSV'de tarih, kampanya ve harcama sütunları olmalı");
  const num = (v?: string) => Number(String(v ?? "0").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
  return rows.slice(1).filter((r) => r[iD] && r[iC]).map((r) => {
    const d = String(r[iD]).trim(); const iso = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : (() => { const [a, b, c] = d.split(/[./-]/); return c && c.length === 4 ? `${c}-${b!.padStart(2, "0")}-${a!.padStart(2, "0")}` : d; })();
    return { day: iso, campaign: String(r[iC]).trim().slice(0, 200), spendMinor: Math.round(num(r[iS]) * 100), impressions: iI >= 0 ? Math.round(num(r[iI])) : 0, clicks: iK >= 0 ? Math.round(num(r[iK])) : 0, leads: iL >= 0 ? Math.round(num(r[iL])) : 0 };
  });
}

/** ROAS: kampanya bazında harcama ↔ lead → teklif → deal → tahsilat */
export async function roas(tx: Tx, from: string, to: string) {
  return tx`
    with sp as (select platform, campaign, currency, sum(spend_minor)::bigint as spend, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions from ad_spend where day between ${from} and ${to} group by 1, 2, 3),
    ld as (select coalesce(l.campaign, l.utm->>'campaign') as campaign, count(*)::int as leads,
             count(*) filter (where exists (select 1 from quotes q where q.lead_id = l.id))::int as quoted,
             count(*) filter (where exists (select 1 from deals d where d.lead_id = l.id))::int as patients,
             coalesce(sum((select sum(p.amount_minor) from payments p join deals d on d.id = p.deal_id where d.lead_id = l.id)), 0)::bigint as revenue
           from leads l where l.created_at >= ${from}::date and l.created_at < ${to}::date + 1 and coalesce(l.campaign, l.utm->>'campaign') is not null group by 1)
    select coalesce(sp.campaign, ld.campaign) as campaign, sp.platform, sp.currency, coalesce(sp.spend, 0)::bigint as spend, coalesce(sp.clicks, 0)::bigint as clicks, coalesce(sp.impressions, 0)::bigint as impressions,
      coalesce(ld.leads, 0) as leads, coalesce(ld.quoted, 0) as quoted, coalesce(ld.patients, 0) as patients, coalesce(ld.revenue, 0)::bigint as revenue
    from sp full outer join ld on lower(ld.campaign) = lower(sp.campaign)
    order by coalesce(sp.spend, 0) desc, coalesce(ld.leads, 0) desc limit 300`;
}

// ── Meta Conversions API ──
const DEFAULT_EVENTS: Record<string, string> = { "lead.created": "Lead", "stage:interested": "QualifiedLead", "deal.created": "Schedule", "payment.first": "Purchase" };

/** İşçi olayı → dönüşüm kaydı (kuyruğa) */
export async function conversionHooks(ev: { clinicId: string; type: string; payload: Record<string, unknown> }) {
  const leadId = ev.payload.leadId as string | undefined; if (!leadId) return;
  const key = ev.type === "lead.stage" ? `stage:${ev.payload.stage}` : ev.type === "payment.succeeded" ? "payment.first" : ev.type;
  if (!["lead.created", "deal.created", "payment.first"].includes(key) && !key.startsWith("stage:")) return;
  const ig = await metaIntegration(ev.clinicId); if (!ig?.config.capi || !ig.config.datasetId || !ig.cred.capiToken) return;
  const event = (ig.config.events ?? DEFAULT_EVENTS)[key]; if (!event) return;
  let value: number | null = null, currency: string | null = null;
  if (key === "deal.created") { value = Number(ev.payload.value ?? 0) ? Math.round(Number(ev.payload.value) * 100) : null; currency = (ev.payload.currency as string) ?? null; }
  if (key === "payment.first") { const [{ n }] = await ownerSql`select count(*)::int as n from payments p join deals d on d.id = p.deal_id where d.lead_id = ${leadId} and p.kind = 'payment'` as unknown as [{ n: number }]; if (n > 1) return; value = Number(ev.payload.amountMinor ?? 0); currency = (ev.payload.currency as string) ?? null; }
  const r = await ownerSql`insert into conversion_events (clinic_id, lead_id, platform, event, value_minor, currency) select ${ev.clinicId}, ${leadId}, 'meta', ${event}, ${value}, ${currency} where exists (select 1 from leads where id = ${leadId}) on conflict do nothing returning id`;
  if (r.length) await ownerSql`insert into jobs (clinic_id, type, payload, run_at) values (${ev.clinicId}, 'capi.send', ${ownerSql.json({ id: Number(r[0]!.id) } as never)}, now() + interval '30 seconds')`;
}

/** CAPI gönderimi: yalnız eşleştirilebilir (Meta kaynaklı / fbclid / ctwa / lead_id) ve izinli lead'ler */
export async function sendConversion(id: number) {
  const [c] = await ownerSql`select ce.*, l.source, l.utm, l.external_ids, l.created_at as lead_created, p.phone, p.email, p.country, p.marketing_consent, p.external_ids as p_ext
    from conversion_events ce join leads l on l.id = ce.lead_id join patients p on p.id = l.patient_id where ce.id = ${id}`;
  if (!c || c.status !== "pending") return;
  const ig = await metaIntegration(c.clinicId as string);
  const skip = async (why: string) => { await ownerSql`update conversion_events set status = 'skipped', error = ${why} where id = ${id}`; };
  if (!ig?.config.datasetId || !ig.cred.capiToken) return skip("not_configured");
  if ((ig.config.requireConsent ?? true) && !c.marketingConsent) return skip("no_consent");
  const utm = (c.utm ?? {}) as Record<string, string>, ext = { ...((c.pExt ?? {}) as Record<string, string>), ...((c.externalIds ?? {}) as Record<string, string>) };
  const ctwa = utm.ctwa_clid || null, fbclid = utm.fbclid || null, metaLeadId = ext.meta || ext.leadgen || null;
  if (!ctwa && !fbclid && !metaLeadId && !["meta", "instagram"].includes(c.source as string)) return skip("not_meta_lead");
  const user: Record<string, unknown> = {};
  if (c.phone) user.ph = [h(String(c.phone).replace(/\D/g, ""))];
  if (c.email) user.em = [h(String(c.email).trim().toLowerCase())];
  if (c.country) user.country = [h(String(c.country).toLowerCase())];
  if (fbclid) user.fbc = `fb.1.${new Date(c.leadCreated as Date).getTime()}.${fbclid}`;
  if (metaLeadId) user.lead_id = metaLeadId;
  if (ctwa) user.ctwa_clid = ctwa;
  const data: Record<string, unknown> = { event_name: c.event, event_time: Math.floor(new Date(c.createdAt as Date).getTime() / 1000), event_id: `df_${c.leadId}_${c.event}`,
    action_source: ctwa ? "business_messaging" : "system_generated", ...(ctwa ? { messaging_channel: "whatsapp" } : {}), user_data: user,
    custom_data: { lead_event_source: "DentaFlow", event_source: "crm", ...(c.valueMinor ? { value: Number(c.valueMinor) / 100, currency: c.currency } : {}) } };
  const r = await fetch(`${GRAPH}/${ig.config.datasetId}/events?access_token=${encodeURIComponent(ig.cred.capiToken)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: [data] }), signal: AbortSignal.timeout(20_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) { await ownerSql`update conversion_events set status = 'failed', error = ${String(j?.error?.message ?? r.status).slice(0, 500)}, response = ${ownerSql.json(j as never)} where id = ${id}`; throw new Error(j?.error?.message ?? "capi_failed"); }
  await ownerSql`update conversion_events set status = 'sent', sent_at = now(), response = ${ownerSql.json(j as never)} where id = ${id}`;
}
