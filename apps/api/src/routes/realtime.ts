// Anlık güncelleme (SSE): veritabanı 'rt' kanalını tek bağlantıyla dinler, kliniğin açık sekmelerine iletir.
// Ayrıca kullanıcı bildirim tercihleri.
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import postgres from "postgres";
import { config } from "../config.ts";
import { ownerSql } from "../db.ts";
import { ctx, parse } from "../http.ts";
import { NOTIFY_TYPES, EMAIL_DEFAULT, type NotifyPrefs } from "../services/notify.ts";

type Client = { userId: string; reply: FastifyReply };
const clients = new Map<string, Set<Client>>();
let listening: Promise<unknown> | null = null;
let listenerSql: ReturnType<typeof postgres> | null = null;

function startListener() {
  if (listening) return listening;
  const l = (listenerSql = postgres(config.databaseOwnerUrl, { max: 1 }));
  listening = l.listen("rt", (raw) => {
    let m: any; try { m = JSON.parse(raw); } catch { return; }
    const set = clients.get(m.c); if (!set) return;
    for (const cl of set) {
      if (m.k === "n" && m.u !== cl.userId) continue;          // bildirim yalnız sahibine
      const data = m.k === "n" ? { k: "n", t: m.t, id: m.id, title: m.title, link: m.link } : { k: "e", t: m.t, e: m.e ?? null, mine: m.u ? m.u === cl.userId : undefined };
      cl.reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }).catch((e) => { console.error("rt listen", e); listening = null; });
  return listening;
}

export const rtStats = () => ({ clinics: clients.size, connections: [...clients.values()].reduce((a, s) => a + s.size, 0) });

export function realtimeRoutes(app: FastifyInstance) {
  // kapanışta açık akışları ve dinleyici bağlantısını kapat (aksi halde süreç bitmez)
  app.addHook("preClose", async () => { for (const set of clients.values()) for (const cl of set) cl.reply.raw.end(); clients.clear(); });
  app.addHook("onClose", async () => {
    listening = null;
    if (listenerSql) { await listenerSql.end({ timeout: 1 }); listenerSql = null; }
  });
  app.get("/api/rt", async (req, reply) => {
    const c = ctx(req);
    await startListener();
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    reply.raw.write(`retry: 5000\ndata: ${JSON.stringify({ k: "hello" })}\n\n`);
    const me: Client = { userId: c.userId, reply };
    let set = clients.get(c.clinicId); if (!set) clients.set(c.clinicId, (set = new Set()));
    set.add(me);
    const hb = setInterval(() => reply.raw.write(`: hb\n\n`), 25_000);
    req.raw.on("close", () => { clearInterval(hb); set!.delete(me); if (!set!.size) clients.delete(c.clinicId); });
  });

  app.get("/api/me/notify-prefs", async (req) => {
    const c = ctx(req);
    const [u] = await ownerSql`select notify_prefs from users where id = ${c.userId}`;
    return { prefs: (u?.notifyPrefs ?? {}) as NotifyPrefs, types: NOTIFY_TYPES, emailDefaults: EMAIL_DEFAULT };
  });
  app.put("/api/me/notify-prefs", async (req) => {
    const c = ctx(req);
    const b = parse(z.object({ inApp: z.record(z.string(), z.boolean()).optional(), email: z.record(z.string(), z.boolean()).optional(), browser: z.boolean().optional(), sound: z.boolean().optional(), digest: z.boolean().optional() }), req.body);
    const [u] = await ownerSql`update users set notify_prefs = notify_prefs || ${ownerSql.json(b as never)} where id = ${c.userId} returning notify_prefs`;
    return { prefs: u!.notifyPrefs };
  });
}
