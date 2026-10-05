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

  // Basit hız limiti (bellek içi, IP + yol grubu başına): kimlik uçları 20/dk, public uçlar 60/dk
  const hits = new Map<string, { n: number; t: number }>();
  app.addHook("onRequest", async (req) => {
    const u = req.url;
    const limit = u.startsWith("/api/auth/") || u.startsWith("/api/invites/") ? 20 : u.startsWith("/api/public/") ? 60 : 0;
    if (!limit) return;
    const k = `${req.ip}|${u.split("/").slice(0, 4).join("/")}`, now = Date.now();
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
    await app.register(fastifyStatic, { root: webDist, wildcard: false, maxAge: "1h",
      setHeaders: (res, path) => { if (/\/assets\//.test(path)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); } });
    app.setNotFoundHandler((req, reply) => req.url.startsWith("/api/") ? reply.status(404).send({ error: "not_found" }) : reply.type("text/html").sendFile("index.html"));
  }
  return app;
}

if (import.meta.main) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "127.0.0.1" });
  console.log(`DentaFlow API → http://127.0.0.1:${config.port}`);
}
