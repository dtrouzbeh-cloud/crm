import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Permissions, PermKey, Role } from "@dentaflow/core/permissions";

export class HttpError extends Error {
  status: number; code: string; details?: unknown;
  constructor(status: number, code: string, message?: string, details?: unknown) { super(message ?? code); this.status = status; this.code = code; this.details = details; }
}
export const notFound = (what = "kayıt") => new HttpError(404, "not_found", `${what} bulunamadı`);
export const forbidden = (perm?: string) => new HttpError(403, "forbidden", perm ? `Yetki yok: ${perm}` : "Yetki yok");

export interface Ctx {
  userId: string; email: string; name: string; locale: string;
  clinicId: string; role: Role; perms: Permissions; sessionId: string; isPlatformAdmin: boolean;
}
declare module "fastify" {
  interface FastifyRequest { ctx?: Ctx; sessionUserId?: string; sessionId?: string }
}

/** Oturum + klinik bağlamı zorunlu */
export function ctx(req: FastifyRequest): Ctx {
  if (!req.ctx) throw new HttpError(401, "unauthorized", "Giriş gerekli");
  return req.ctx;
}
/** İzin kontrolü: boolean izinler true, kapsam izinleri false olmamalı */
export function need(c: Ctx, key: PermKey): Ctx {
  const v = c.perms[key];
  if (v === false || v === 0 || v === "hide") throw forbidden(key);
  return c;
}
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "validation", "Geçersiz veri", z.flattenError(r.error).fieldErrors);
  return r.data;
}
/** Kısmi güncelleme: şema varsayılanları uygulanmaz — yalnız gövdede gönderilen alanlar döner */
export function parsePatch<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const out = parse(schema, data) as Record<string, unknown>;
  if (data && typeof data === "object" && !Array.isArray(data)) { const sent = new Set(Object.keys(data)); for (const k of Object.keys(out)) if (!sent.has(k)) delete out[k]; }
  return out as z.infer<T>;
}
/** Sorgu dizesi için boolean: "true"/"1" → true, "false"/"0"/"" → false (z.coerce.boolean "false" metnini true sayar) */
export const qbool = z.preprocess((v) => (typeof v === "string" ? ["true", "1", "yes", "on"].includes(v.toLowerCase()) : v), z.boolean());
export type Req = FastifyRequest; export type Rep = FastifyReply;
export const ipOf = (req: FastifyRequest) => (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip;
