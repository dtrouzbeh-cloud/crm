// Pipeline API: pipeline/aşama yönetimi, pano (satış = leads, diğerleri = pipeline_items), taşıma, tahmin, aşama analitiği
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, type Tx } from "../db.ts";
import { ctx, need, parse, parsePatch, notFound, HttpError, type Ctx } from "../http.ts";
import { audit, emit } from "../services/audit.ts";
import { ensurePipelines, addToPipeline } from "../services/pipelines.ts";

const NAME = z.record(z.string(), z.string().max(80));
const STAGE = z.object({ name: NAME, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#94A3B8"), probability: z.number().int().min(0).max(100).default(0),
  slaMinutes: z.number().int().min(1).max(525600).nullable().optional(), isWon: z.boolean().default(false), isLost: z.boolean().default(false), hidden: z.boolean().default(false), sort: z.number().int().optional() });
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "stage";
const leadScope = (tx: Tx, c: Ctx) => (c.perms["lead.read"] === "own" ? tx`and l.owner_id = ${c.userId}` : tx``);

export function pipelineRoutes(app: FastifyInstance) {
  app.get("/api/pipelines", async (req) => {
    const c = need(ctx(req), "lead.read");
    return withClinic(c.clinicId, async (tx) => {
      await ensurePipelines(tx, c.clinicId);
      const pls = await tx`select * from pipelines order by sort, created_at`;
      const stages = await tx`select * from pipeline_stages order by sort`;
      const salesCounts = await tx`select l.stage as key, count(*)::int as n from leads l where l.archived_at is null ${leadScope(tx, c)} group by l.stage`;
      const itemCounts = await tx`select i.stage_id, count(*)::int as n from pipeline_items i join leads l on l.id = i.lead_id where i.status = 'open' ${leadScope(tx, c)} group by i.stage_id`;
      const sc = Object.fromEntries(salesCounts.map((r) => [r.key, r.n])), ic = Object.fromEntries(itemCounts.map((r) => [r.stageId, r.n]));
      return pls.map((p) => ({ ...p, stages: stages.filter((s) => s.pipelineId === p.id).map((s) => ({ ...s, count: p.kind === "sales" ? sc[s.key as string] ?? 0 : ic[s.id as string] ?? 0 })) }));
    });
  });

  // ── yönetim ──
  app.post("/api/pipelines", async (req) => {
    const c = need(ctx(req), "settings.manage"); const b = parse(z.object({ name: NAME, color: z.string().default("#0E7C86"), kind: z.enum(["custom", "nurture", "aftercare", "recall"]).default("custom") }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`insert into pipelines (clinic_id, kind, name, color, sort) values (${c.clinicId}, ${b.kind}, ${tx.json(b.name as never)}, ${b.color}, 100) returning *`;
      for (const [i, s] of [["open", "Açık", "Open"], ["won", "Tamamlandı", "Done"], ["lost", "Kapandı", "Closed"]].entries())
        await tx`insert into pipeline_stages (clinic_id, pipeline_id, key, name, probability, is_won, is_lost, sort) values (${c.clinicId}, ${p!.id}, ${s[0]}, ${tx.json({ tr: s[1], en: s[2], default: s[2] } as never)}, ${i === 1 ? 100 : 0}, ${i === 1}, ${i === 2}, ${(i + 1) * 10})`;
      await audit(tx, c, "pipeline.create", "pipeline", p!.id as string); return p;
    });
  });
  app.patch("/api/pipelines/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ name: NAME, color: z.string(), active: z.boolean(), sort: z.number().int(), settings: z.record(z.string(), z.unknown()) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select * from pipelines where id = ${id}`; if (!p) throw notFound("Pipeline");
      if (p.kind === "sales" && b.active === false) throw new HttpError(400, "sales_required", "Satış pipeline'ı kapatılamaz");
      await tx`update pipelines set name = ${tx.json((b.name ?? p.name) as never)}, color = ${b.color ?? p.color}, active = ${b.active ?? p.active}, sort = ${b.sort ?? p.sort},
        settings = ${tx.json({ ...(p.settings as object), ...(b.settings ?? {}) } as never)} where id = ${id}`;
      await audit(tx, c, "pipeline.update", "pipeline", id, b); return { ok: true };
    });
  });
  app.post("/api/pipelines/:id/stages", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parse(STAGE, req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select id from pipelines where id = ${id}`; if (!p) throw notFound("Pipeline");
      const base = "c_" + slug(b.name.default ?? b.name.tr ?? b.name.en ?? "stage"); let key = base, n = 1;
      while ((await tx`select 1 from pipeline_stages where pipeline_id = ${id} and key = ${key}`).length) key = `${base}_${++n}`;
      const [s] = await tx`insert into pipeline_stages (clinic_id, pipeline_id, key, name, color, probability, sla_minutes, is_won, is_lost, hidden, sort)
        values (${c.clinicId}, ${id}, ${key}, ${tx.json(b.name as never)}, ${b.color}, ${b.probability}, ${b.slaMinutes ?? null}, ${b.isWon}, ${b.isLost}, ${b.hidden}, ${b.sort ?? 999}) returning *`;
      await audit(tx, c, "pipeline.stage.create", "pipeline", id, { key }); return s;
    });
  });
  app.patch("/api/pipeline-stages/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string }; const b = parsePatch(STAGE.partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [s] = await tx`select * from pipeline_stages where id = ${id}`; if (!s) throw notFound("Aşama");
      // sistem aşamalarında kazanıldı/kaybedildi rolü değiştirilemez (teklif/deal akışları bunlara bağlı)
      await tx`update pipeline_stages set name = ${tx.json((b.name ?? s.name) as never)}, color = ${b.color ?? s.color}, probability = ${b.probability ?? s.probability},
        sla_minutes = ${b.slaMinutes !== undefined ? b.slaMinutes : s.slaMinutes}, is_won = ${s.system ? s.isWon : (b.isWon ?? s.isWon)}, is_lost = ${s.system ? s.isLost : (b.isLost ?? s.isLost)},
        hidden = ${s.system && (s.isWon || s.isLost) ? false : (b.hidden ?? s.hidden)}, sort = ${b.sort ?? s.sort} where id = ${id}`;
      await audit(tx, c, "pipeline.stage.update", "pipeline", s.pipelineId as string, { key: s.key, ...b }); return { ok: true };
    });
  });
  app.delete("/api/pipeline-stages/:id", async (req) => {
    const c = need(ctx(req), "settings.manage"); const { id } = req.params as { id: string };
    const { moveTo } = parse(z.object({ moveTo: z.uuid().optional() }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const [s] = await tx`select s.*, p.kind from pipeline_stages s join pipelines p on p.id = s.pipeline_id where s.id = ${id}`; if (!s) throw notFound("Aşama");
      if (s.system) throw new HttpError(400, "system_stage", "Sistem aşaması silinemez (gizleyebilirsiniz)");
      const [t] = moveTo ? await tx`select id, key from pipeline_stages where id = ${moveTo} and pipeline_id = ${s.pipelineId}` : [null];
      const used = s.kind === "sales" ? (await tx`select count(*)::int as n from leads where stage = ${s.key}`)[0]!.n : (await tx`select count(*)::int as n from pipeline_items where stage_id = ${id}`)[0]!.n;
      if (used && !t) throw new HttpError(409, "stage_in_use", "Bu aşamada kayıt var — taşınacak aşamayı seçin", { count: used });
      if (t) { if (s.kind === "sales") await tx`update leads set stage = ${t.key} where stage = ${s.key}`; else await tx`update pipeline_items set stage_id = ${t.id} where stage_id = ${id}`; }
      await tx`delete from pipeline_stages where id = ${id}`;
      await audit(tx, c, "pipeline.stage.delete", "pipeline", s.pipelineId as string, { key: s.key, moved: used }); return { ok: true };
    });
  });

  // ── pano ──
  app.get("/api/pipelines/:id/board", async (req) => {
    const c = need(ctx(req), "lead.read"); const { id } = req.params as { id: string };
    const q = parse(z.object({ owner: z.string().optional(), q: z.string().max(80).optional(), status: z.enum(["open", "won", "lost", "all"]).default("open") }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select * from pipelines where id = ${id}`; if (!p) throw notFound("Pipeline");
      const stages = await tx`select * from pipeline_stages where pipeline_id = ${id} order by sort`;
      const search = q.q ? tx`and (pa.full_name ilike ${"%" + q.q + "%"} or pa.phone like ${"%" + q.q.replace(/\D/g, "") + "%"})` : tx``;
      const owner = q.owner ? tx`and l.owner_id = ${q.owner}` : tx``;
      let items;
      if (p.kind === "sales") {
        // tahmini değer: son teklifin önerilen seçeneği, kazanılmışsa deal değeri
        items = await tx`select l.id as lead_id, null::uuid as item_id, l.stage as stage_key, l.stage_entered_at, l.sla_breached_at, l.owner_id, u.name as owner_name, l.temperature, l.source,
            pa.full_name, pa.country, pa.phone, l.number,
            coalesce((select d.value_minor from deals d where d.lead_id = l.id order by d.created_at desc limit 1), (select q.total_minor from quotes q where q.lead_id = l.id order by q.created_at desc limit 1), 0)::bigint as value_minor,
            coalesce((select d.currency from deals d where d.lead_id = l.id order by d.created_at desc limit 1), (select q.currency from quotes q where q.lead_id = l.id order by q.created_at desc limit 1)) as currency
          from leads l join patients pa on pa.id = l.patient_id left join users u on u.id = l.owner_id
          where l.archived_at is null ${leadScope(tx, c)} ${owner} ${search}
            ${q.status === "open" ? tx`and l.stage not in ('won','lost')` : q.status === "won" ? tx`and l.stage = 'won'` : q.status === "lost" ? tx`and l.stage = 'lost'` : tx``}
          order by l.stage_entered_at desc limit 600`;
      } else {
        items = await tx`select i.lead_id, i.id as item_id, s.key as stage_key, i.stage_entered_at, i.sla_breached_at, i.owner_id, u.name as owner_name, l.temperature, l.source,
            pa.full_name, pa.country, pa.phone, l.number, i.value_minor, i.currency, i.due_at, i.note, i.status
          from pipeline_items i join pipeline_stages s on s.id = i.stage_id join leads l on l.id = i.lead_id join patients pa on pa.id = l.patient_id left join users u on u.id = i.owner_id
          where i.pipeline_id = ${id} ${q.status === "all" ? tx`` : tx`and i.status = ${q.status}`} ${leadScope(tx, c)} ${owner} ${search}
          order by coalesce(i.due_at, i.stage_entered_at) limit 600`;
      }
      const hidePrice = c.perms["field.price"] === "hide";
      return { pipeline: p, stages, items: items.map((r) => ({ ...r, phone: c.perms["field.phone"] === "show" ? r.phone : null, valueMinor: hidePrice ? null : r.valueMinor })) };
    });
  });

  // kayıt ekle (satış dışı pipeline'lar)
  app.post("/api/pipelines/:id/items", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    const b = parse(z.object({ leadId: z.uuid(), stageKey: z.string().max(40).optional(), dueAt: z.iso.datetime().optional(), note: z.string().max(1000).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select kind from pipelines where id = ${id}`; if (!p) throw notFound("Pipeline");
      if (p.kind === "sales") throw new HttpError(400, "sales", "Satış pipeline'ına lead kendiliğinden girer");
      const itemId = await addToPipeline(tx, c.clinicId, p.kind as string, b.leadId, { pipelineId: id, stageKey: b.stageKey, dueAt: b.dueAt ? new Date(b.dueAt) : null });
      if (!itemId) throw new HttpError(400, "cannot_add", "Eklenemedi");
      if (b.note) await tx`update pipeline_items set note = ${b.note} where id = ${itemId}`;
      await audit(tx, c, "pipeline.item.add", "lead", b.leadId, { pipeline: id }); return { id: itemId };
    });
  });

  // taşı: satışta leads.stage, diğerlerinde pipeline_items.stage_id
  app.post("/api/pipelines/:id/move", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    const b = parse(z.object({ leadId: z.uuid().optional(), itemId: z.uuid().optional(), stageId: z.uuid(), lostReason: z.string().max(60).optional() }), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select * from pipelines where id = ${id}`; if (!p) throw notFound("Pipeline");
      const [st] = await tx`select * from pipeline_stages where id = ${b.stageId} and pipeline_id = ${id}`; if (!st) throw notFound("Aşama");
      if (p.kind === "sales") {
        if (!b.leadId) throw new HttpError(400, "lead_required");
        if (st.key === "lost" && !b.lostReason) throw new HttpError(400, "lost_reason_required", "Kayıp nedeni zorunlu");
        const [l] = await tx`select l.id, l.stage, l.owner_id, p.full_name from leads l join patients p on p.id = l.patient_id where l.id = ${b.leadId} ${leadScope(tx, c)}`; if (!l) throw notFound("Lead");
        if (l.stage === st.key) return { ok: true };
        await tx`update leads set stage = ${st.key}, lost_reason = ${st.key === "lost" ? b.lostReason ?? null : null}, last_activity_at = now() where id = ${b.leadId}`;
        await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${b.leadId}, 'stage', ${l.stage + "→" + st.key}, ${tx.json({ from: l.stage, to: st.key, reason: b.lostReason ?? null } as never)}, ${c.userId})`;
        await emit(tx, c.clinicId, "lead.stage", b.leadId, { leadId: b.leadId, from: l.stage, stage: st.key, name: l.fullName, ownerId: l.ownerId });
        return { ok: true };
      }
      if (!b.itemId) throw new HttpError(400, "item_required");
      const [it] = await tx`select i.*, l.owner_id as lead_owner from pipeline_items i join leads l on l.id = i.lead_id where i.id = ${b.itemId} and i.pipeline_id = ${id}`; if (!it) throw notFound("Kayıt");
      const status = st.isWon ? "won" : st.isLost ? "lost" : "open";
      await tx`update pipeline_items set stage_id = ${st.id}, status = ${status}, closed_at = ${status === "open" ? null : new Date()} where id = ${b.itemId}`;
      // yeniden kazanımda "kazanıldı" → lead satışa geri döner
      if (p.kind === "nurture" && st.isWon) {
        await tx`update leads set stage = 'interested', lost_reason = null, archived_at = null, last_activity_at = now() where id = ${it.leadId}`;
        await tx`insert into lead_events (clinic_id, lead_id, type, body, data, user_id) values (${c.clinicId}, ${it.leadId}, 'stage', 'lost→interested', ${tx.json({ from: "lost", to: "interested", via: "nurture" } as never)}, ${c.userId})`;
      }
      await emit(tx, c.clinicId, "pipeline.stage_entered", it.leadId as string, { leadId: it.leadId, itemId: it.id, pipeline: p.kind, pipelineId: id, stage: st.key, ownerId: it.ownerId ?? it.leadOwner });
      return { ok: true, status };
    });
  });
  app.patch("/api/pipeline-items/:id", async (req) => {
    const c = need(ctx(req), "lead.write"); const { id } = req.params as { id: string };
    const b = parsePatch(z.object({ ownerId: z.uuid().nullable(), note: z.string().max(1000).nullable(), dueAt: z.iso.datetime().nullable(), valueMinor: z.number().int().min(0), status: z.enum(["open", "archived"]) }).partial(), req.body);
    const map: Record<string, string> = { ownerId: "owner_id", note: "note", dueAt: "due_at", valueMinor: "value_minor", status: "status" };
    const set: Record<string, unknown> = {}; for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) set[col] = (b as any)[k];
    return withClinic(c.clinicId, async (tx) => { if (Object.keys(set).length) await tx`update pipeline_items set ${tx(set as never)} where id = ${id}`; return { ok: true }; });
  });

  // ── analitik: tahmin + aşama dönüşümü + ortalama süre ──
  app.get("/api/pipelines/:id/analytics", async (req) => {
    const c = need(ctx(req), "reports.view"); const { id } = req.params as { id: string };
    const q = parse(z.object({ days: z.coerce.number().int().min(7).max(730).default(90) }), req.query);
    return withClinic(c.clinicId, async (tx) => {
      const [p] = await tx`select * from pipelines where id = ${id}`; if (!p) throw notFound("Pipeline");
      const stages = await tx`select key, probability, is_won, is_lost from pipeline_stages where pipeline_id = ${id} order by sort`;
      const flow = await tx`select to_stage as key, count(distinct lead_id)::int as reached, round(avg(seconds_in_prev) filter (where seconds_in_prev is not null))::bigint as avg_prev_s
        from stage_history where pipeline_kind = ${p.kind} and at > now() - ${q.days + " days"}::interval group by to_stage`;
      const time = await tx`select from_stage as key, round(avg(seconds_in_prev))::bigint as avg_s, percentile_cont(0.5) within group (order by seconds_in_prev)::bigint as median_s
        from stage_history where pipeline_kind = ${p.kind} and from_stage is not null and at > now() - ${q.days + " days"}::interval group by from_stage`;
      // tahmin (yalnız satış): açık lead değerleri × aşama olasılığı, para birimine göre
      const forecast = p.kind !== "sales" ? [] : await tx`
        with v as (select l.stage, coalesce((select q.currency from quotes q where q.lead_id = l.id order by q.created_at desc limit 1), null) as currency,
                     coalesce((select q.total_minor from quotes q where q.lead_id = l.id order by q.created_at desc limit 1), 0) as value
                   from leads l where l.archived_at is null and l.stage not in ('won','lost') ${leadScope(tx, c)})
        select v.currency, sum(v.value)::bigint as pipeline, sum(v.value * s.probability / 100)::bigint as weighted, count(*)::int as n
        from v join pipeline_stages s on s.pipeline_id = ${id} and s.key = v.stage where v.currency is not null group by v.currency`;
      const fm = Object.fromEntries(flow.map((f) => [f.key, f])), tm = Object.fromEntries(time.map((t) => [t.key, t]));
      return { stages: stages.map((s) => ({ key: s.key, probability: s.probability, reached: fm[s.key as string]?.reached ?? 0, avgSeconds: tm[s.key as string]?.avgS ?? null, medianSeconds: tm[s.key as string]?.medianS ?? null })), forecast };
    });
  });
}
