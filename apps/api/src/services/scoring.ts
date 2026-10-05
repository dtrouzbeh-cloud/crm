// Lead puanı (0–100): davranış sinyallerinden kapanma olasılığı — yapay zekâ çağrısı yok, anında ve ücretsiz. Günlük arama listesi de buradan.
import { ownerSql, type Tx } from "../db.ts";

type Sig = Record<string, any>;
const SIGNALS = (tx: Tx | typeof ownerSql, where: any) => (tx as any)`
  select l.id, l.clinic_id, l.stage, l.temperature, l.budget, l.travel_window, l.source, l.owner_id, l.created_at, l.last_activity_at, l.first_response_at, l.contact_attempts, p.full_name, p.country, p.phone,
    (select count(*)::int from messages m join conversations cv on cv.id = m.conversation_id where cv.lead_id = l.id and m.direction = 'in') as inbound,
    (select max(m.at) from messages m join conversations cv on cv.id = m.conversation_id where cv.lead_id = l.id and m.direction = 'in') as last_inbound,
    (select max(m.at) from messages m join conversations cv on cv.id = m.conversation_id where cv.lead_id = l.id and m.direction = 'out') as last_outbound,
    (select count(*)::int from quotes q where q.lead_id = l.id) as quotes,
    (select max(q.viewed_at) from quotes q where q.lead_id = l.id) as quote_viewed_at,
    (select coalesce(max(q.view_count), 0)::int from quotes q where q.lead_id = l.id) as quote_views,
    (select coalesce(sum(ql.seconds_total), 0)::int from quote_live ql where ql.lead_id = l.id) as live_seconds,
    (select max(ql.last_ping) from quote_live ql where ql.lead_id = l.id) as live_ping,
    (select count(*)::int from files f join cases k on k.id = f.entity_id where f.entity = 'case' and k.lead_id = l.id and f.kind in ('photo','xray')) as photos,
    (select count(*)::int from form_requests fr where fr.lead_id = l.id and fr.status = 'completed') as forms,
    (select row_to_json(x) from (select ci.objection, ci.sentiment, ci.intent from conv_insights ci where ci.lead_id = l.id order by ci.id desc limit 1) x) as insight,
    exists (select 1 from deals d where d.lead_id = l.id) as has_deal,
    (select max(e.at) from lead_events e where e.lead_id = l.id and e.type in ('call','meeting')) as last_call
  from leads l join patients p on p.id = l.patient_id where ${where}`;

const hoursAgo = (d: any) => (d ? (Date.now() - new Date(d).getTime()) / 3600000 : Infinity);

export function computeScore(s: Sig): { score: number; reasons: [string, number][] } {
  const r: [string, number][] = []; const add = (k: string, v: number) => { r.push([k, v]); };
  if (s.hasDeal || s.stage === "won") return { score: 100, reasons: [["deal", 100]] };
  if (s.stage === "lost") return { score: 0, reasons: [["lost", 0]] };
  add("base", 10);
  if (s.inbound > 0) add("replied", 15); if (s.inbound >= 5) add("engaged", 5);
  if (s.photos > 0) add("photos", 15);
  if (s.quotes > 0) add("quote_sent", 10);
  if (s.quoteViewedAt) add("quote_viewed", 10);
  if (s.quoteViews >= 3) add("quote_reviewed", 5);
  if (s.liveSeconds >= 120) add("quote_studied", 5);
  if (hoursAgo(s.quoteViewedAt) < 48 || hoursAgo(s.livePing) < 48) add("quote_recent", 10);
  if (s.temperature === "hot") add("hot", 10); else if (s.temperature === "cold") add("cold", -10);
  if (s.budget) add("budget", 5); if (s.travelWindow) add("travel_date", 8);
  if (s.stage === "negotiation") add("negotiation", 10); else if (s.stage === "plan_ready" || s.stage === "quote_sent") add("late_stage", 5);
  if (s.forms > 0) add("form", 5);
  const ins = (s.insight ?? {}) as { objection?: string; sentiment?: string; intent?: string };
  if (ins.intent === "ready_to_book" || ins.intent === "scheduling") add("ready", 15);
  if (ins.intent === "not_interested") add("not_interested", -25);
  if (ins.objection === "price") add("price_objection", -5); if (ins.sentiment === "negative") add("negative", -5);
  const idle = hoursAgo(s.lastActivityAt) / 24;
  if (idle > 30) add("idle_30d", -25); else if (idle > 14) add("idle_14d", -15); else if (idle > 7) add("idle_7d", -5);
  if (s.inbound === 0 && s.contactAttempts >= 3) add("no_reply", -10);
  const score = Math.max(0, Math.min(100, r.reduce((a, [, v]) => a + v, 0)));
  return { score, reasons: r.filter(([k]) => k !== "base") };
}

export async function scoreLead(leadId: string) {
  const [s] = await SIGNALS(ownerSql, ownerSql`l.id = ${leadId}`); if (!s) return null;
  const { score, reasons } = computeScore(s);
  await ownerSql`update leads set score = ${score}, score_reasons = ${ownerSql.json(reasons as never)}, scored_at = now() where id = ${leadId}`;
  return score;
}
/** İşçi: periyodik yeniden puanlama (zamanla puan düşer) */
export async function rescoreStale(limit = 300) {
  const rows = await ownerSql`select id from leads where archived_at is null and stage not in ('won','lost') and (scored_at is null or scored_at < now() - interval '6 hours') order by scored_at nulls first limit ${limit}`;
  for (const r of rows) await scoreLead(r.id as string).catch(() => {});
  return rows.length;
}
const SCORE_EVENTS = /^(lead\.(created|stage)|quote\.|wa\.message|chat\.message|form\.completed|ai\.coach|payment\.|deal\.)/;
export async function scoringHooks(ev: { type: string; payload: Record<string, unknown> }) {
  if (ev.payload.leadId && SCORE_EVENTS.test(ev.type)) await scoreLead(ev.payload.leadId as string);
}

/** Bugün aranacaklar: puan + anlık sinyallere göre öncelik; her biri için neden ve önerilen aksiyon */
export async function callList(tx: Tx, o: { ownerId?: string | null; limit?: number }) {
  const rows = await SIGNALS(tx, tx`l.archived_at is null and l.stage not in ('won','lost') ${o.ownerId ? tx`and l.owner_id = ${o.ownerId}` : tx``} and (l.score is null or l.score >= 15) order by l.score desc nulls last limit 150`);
  const out = (rows as Sig[]).map((s) => {
    const { score, reasons } = computeScore(s); let prio = score, action = "follow_up";
    const live = hoursAgo(s.livePing) < 3 / 60, viewedH = Math.min(hoursAgo(s.quoteViewedAt), hoursAgo(s.livePing)), contactedH = Math.min(hoursAgo(s.lastOutbound), hoursAgo(s.lastCall));
    if (live) { prio += 40; action = "live_now"; }
    else if (viewedH < 24 && contactedH > viewedH) { prio += 25; action = "quote_viewed"; }
    else if (hoursAgo(s.lastInbound) < 24 && contactedH > hoursAgo(s.lastInbound)) { prio += 20; action = "awaiting_reply"; }
    else if (s.photos > 0 && s.quotes === 0) { prio += 15; action = "photos_no_quote"; }
    else if (s.inbound === 0 && hoursAgo(s.createdAt) < 48) { prio += 10; action = "new_no_reply"; }
    else if (s.quotes > 0 && !s.quoteViewedAt && hoursAgo(s.lastOutbound) > 24) { prio += 8; action = "quote_unopened"; }
    if (contactedH < 4 && !live) prio -= 30;   // az önce iletişim kuruldu
    return { leadId: s.id, name: s.fullName, country: s.country, phone: s.phone, stage: s.stage, ownerId: s.ownerId, score, priority: prio, action, reasons: reasons.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4),
      quoteViewedAt: s.quoteViewedAt, lastInbound: s.lastInbound, live };
  });
  return out.sort((a, b) => b.priority - a.priority).slice(0, o.limit ?? 10);
}
