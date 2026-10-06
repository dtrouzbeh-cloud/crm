import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { HttpError } from "./http.ts";
import { authRoutes, loadContext } from "./auth.ts";
import { leadRoutes } from "./routes/leads.ts";
import { taskRoutes } from "./routes/tasks.ts";
import { clinicRoutes } from "./routes/clinic.ts";
import { miscRoutes } from "./routes/misc.ts";
import { registerModules } from "./modules.ts";

export async function buildServer() {
  const app = Fastify({ logger: { level: config.isProd ? "info" : "warn" }, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cookie, { secret: config.sessionSecret });
  // Ham gövde: webhook imza doğrulaması için saklanır
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as any).rawBody = body;
    try { done(null, body ? JSON.parse(body as string) : {}); } catch (e) { (e as any).statusCode = 400; done(e as Error, undefined); }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (req, body, done) => {
    (req as any).rawBody = body; done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  // Basit hız limiti (bellek içi). Yalnız kaba kuvvete açık uçlar: giriş/kayıt/şifre (IP başına 20/dk) ve hasta tarafı
  // public sayfalar (IP + belge başına 120/dk). Meta/ödeme webhook'ları ve oturum kontrolü sınırlanmaz: aynı ofisteki
  // ekip tek IP'den çıkar, Meta da yoğun anlarda tek IP'den yüzlerce durum bildirimi gönderir.
  const hits = new Map<string, { n: number; t: number }>();
  const WEBHOOK = /^\/api\/public\/(wa\/webhook|meta\/|in\/|pay\/|billing\/)/;
  app.addHook("onRequest", async (req) => {
    const u = req.url.split("?")[0]!;
    let limit = 0, key = "";
    if (req.method === "POST" && (/^\/api\/auth\/(login|signup|forgot|reset|mfa)/.test(u) || u.startsWith("/api/invites/"))) { limit = 20; key = u.split("/").slice(0, 4).join("/"); }
    else if (u.startsWith("/api/public/") && !WEBHOOK.test(u)) { limit = 120; key = u.split("/").slice(0, 5).join("/"); }
    if (!limit) return;
    const k = `${req.ip}|${key}`, now = Date.now();
    const h = hits.get(k);
    if (!h || now - h.t > 60_000) hits.set(k, { n: 1, t: now });
    else if (++h.n > limit) throw new HttpError(429, "rate_limited", "Çok fazla istek, lütfen biraz bekleyin");
    if (hits.size > 50_000) hits.clear();
  });
  app.addHook("preHandler", async (req) => { if (req.url.startsWith("/api/")) await loadContext(req); });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message, details: err.details });
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.code ?? "bad_request", message: e.message });
    if (e.code === "23505") return reply.status(409).send({ error: "conflict", message: "Kayıt zaten mevcut" });
    req.log.error(err);
    return reply.status(500).send({ error: "server_error", message: "Beklenmeyen bir hata oluştu" });
  });

  authRoutes(app); leadRoutes(app); taskRoutes(app); clinicRoutes(app); miscRoutes(app);
  await registerModules(app);

  // Derlenmiş web uygulaması (tek sunucu: API + SPA)
  const webDist = join(import.meta.dirname, "../../web/dist");
  if (existsSync(webDist)) {
    // wildcard: dosyalar diskten anlık okunur (yeniden derleme/dağıtım sonrası yeni parçalar bulunur)
    await app.register(fastifyStatic, { root: webDist, wildcard: true, maxAge: 0,
      setHeaders: (res, path) => res.setHeader("Cache-Control", /\/assets\//.test(path) ? "public, max-age=31536000, immutable" : "no-cache") });
    // API ve eksik varlık dosyaları gerçek 404 alır; diğer yollar SPA'ya düşer
    app.setNotFoundHandler((req, reply) => req.url.startsWith("/api/") ? reply.status(404).send({ error: "not_found" })
      : req.url.startsWith("/assets/") ? reply.status(404).header("Cache-Control", "no-store").type("text/plain").send("not found")
      : reply.header("Cache-Control", "no-cache").type("text/html").sendFile("index.html"));
  }
  return app;
}

if (import.meta.main) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "127.0.0.1" });
  console.log(`DentaFlow API → http://127.0.0.1:${config.port}`);
}
