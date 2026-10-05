import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { ctx, need, parse, notFound, HttpError } from "../http.ts";
import { audit } from "../services/audit.ts";
import { storage, signFile, verifyFileSig } from "../services/storage.ts";

const KINDS = ["photo", "xray", "passport", "ticket", "document", "logo", "media", "pdf", "consent"] as const;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|gif)|application\/pdf|application\/dicom|video\/mp4)$/;

export async function fileRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 10 } });

  app.post("/api/files", async (req) => {
    const c = ctx(req);
    const q = parse(z.object({ kind: z.enum(KINDS), entity: z.enum(["case", "lead", "deal", "trip", "clinic", "content", "message"]).optional(), entityId: z.uuid().optional() }), req.query);
    if (["passport", "ticket"].includes(q.kind) && c.perms["field.passport"] === "hide") throw new HttpError(403, "forbidden");
    const out: unknown[] = [];
    for await (const part of req.files()) {
      if (!ALLOWED.test(part.mimetype)) throw new HttpError(415, "bad_type", `Desteklenmeyen dosya türü: ${part.mimetype}`);
      const buf = await part.toBuffer();
      const id = randomUUID(), key = `${c.clinicId}/${q.kind}/${id.slice(0, 2)}/${id}`;
      await storage.put(key, buf);
      const [f] = await withClinic(c.clinicId, (tx) => tx`insert into files (id, clinic_id, kind, name, mime, size_bytes, storage_key, sha256, entity, entity_id, uploaded_by)
        values (${id}, ${c.clinicId}, ${q.kind}, ${part.filename.slice(0, 200)}, ${part.mimetype}, ${buf.length}, ${key}, ${createHash("sha256").update(buf).digest("hex")}, ${q.entity ?? null}, ${q.entityId ?? null}, ${c.userId}) returning id, kind, name, mime, size_bytes, created_at`);
      out.push(f);
    }
    await withClinic(c.clinicId, (tx) => audit(tx, c, "file.upload", q.entity ?? "file", q.entityId ?? null, { kind: q.kind, n: out.length }));
    return out;
  });

  app.get("/api/files/:id", async (req, reply) => {
    const c = ctx(req);
    const { id } = req.params as { id: string };
    const [f] = await withClinic(c.clinicId, (tx) => tx`select * from files where id = ${id}`);
    if (!f) throw notFound("Dosya");
    if (["passport", "ticket"].includes(f.kind) && c.perms["field.passport"] === "hide") throw new HttpError(403, "forbidden");
    reply.header("Content-Type", f.mime).header("Cache-Control", "private, max-age=3600").header("Content-Disposition", `inline; filename="${encodeURIComponent(f.name)}"`);
    return reply.send(storage.stream(f.storageKey));
  });
  app.get("/api/files/:id/signed", async (req) => { const c = ctx(req); const { id } = req.params as { id: string }; const [f] = await withClinic(c.clinicId, (tx) => tx`select id from files where id = ${id}`); if (!f) throw notFound("Dosya"); return { url: signFile(id) }; });
  app.delete("/api/files/:id", async (req) => {
    const c = ctx(req); const { id } = req.params as { id: string };
    const [f] = await withClinic(c.clinicId, async (tx) => { const r = await tx`delete from files where id = ${id} returning storage_key, kind, entity, entity_id`; if (r[0]) await audit(tx, c, "file.delete", r[0].entity ?? "file", r[0].entityId ?? id, { kind: r[0].kind }); return r; });
    if (f) await storage.remove(f.storageKey);
    return { ok: true };
  });
  // imzalı herkese açık erişim (logo, galeri, PDF)
  app.get("/api/public/files/:id", async (req, reply) => {
    const { id } = req.params as { id: string }; const { exp, sig } = req.query as { exp: string; sig: string };
    if (!verifyFileSig(id, exp, sig)) throw new HttpError(403, "bad_signature");
    const [f] = await ownerSql`select mime, storage_key, name from files where id = ${id}`;
    if (!f) throw notFound("Dosya");
    reply.header("Content-Type", f.mime).header("Cache-Control", "public, max-age=3600");
    return reply.send(storage.stream(f.storageKey));
  });
}
