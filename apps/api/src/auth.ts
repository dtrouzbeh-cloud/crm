import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { ownerSql, withClinic } from "./db.ts";
import { config } from "./config.ts";
import { HttpError, ctx, parse, ipOf } from "./http.ts";
import { hashPassword, verifyPassword, randomToken, sha256, newTotpSecret, totpUri, verifyTotp, encrypt, decrypt } from "./lib/crypto.ts";
import { effectivePermissions, type Role, type Permissions } from "@dentaflow/core/permissions";
import { defaultClinicSettings, defaultWorkflowRules } from "./services/defaults.ts";
import { seedClinicCatalog } from "./services/catalog-seed.ts";
import { sendMail } from "./services/mailer.ts";

const COOKIE = "df_sess";
const cookieOpts = () => ({ path: "/", httpOnly: true, sameSite: "lax" as const, secure: config.isProd, maxAge: config.sessionDays * 86400 });

async function createSession(reply: FastifyReply, req: FastifyRequest, userId: string, clinicId: string | null, mfaPassed: boolean) {
  const token = randomToken();
  await ownerSql`insert into sessions (id, user_id, clinic_id, mfa_passed, ip, user_agent, expires_at)
    values (${sha256(token)}, ${userId}, ${clinicId}, ${mfaPassed}, ${ipOf(req)}, ${req.headers["user-agent"] ?? null}, now() + ${config.sessionDays + " days"}::interval)`;
  reply.setCookie(COOKIE, token, cookieOpts());
}

/** Her istekte: oturumu çöz, aktif klinik + rol + etkin izinleri bağlama ekle */
export async function loadContext(req: FastifyRequest) {
  const token = req.cookies[COOKIE];
  if (!token) return;
  const id = sha256(token);
  const [s] = await ownerSql`
    select s.id, s.user_id, s.clinic_id, s.mfa_passed, u.email, u.name, u.locale, u.mfa_enabled, u.is_platform_admin,
           m.role, m.permission_overrides, m.active as member_active, rp.permissions as clinic_role_perms
    from sessions s join users u on u.id = s.user_id
    left join memberships m on m.user_id = s.user_id and m.clinic_id = s.clinic_id
    left join role_permissions rp on rp.clinic_id = s.clinic_id and rp.role = m.role
    where s.id = ${id} and s.expires_at > now()`;
  if (!s) return;
  req.sessionUserId = s.userId; req.sessionId = s.id;
  if (s.mfaEnabled && !s.mfaPassed) return;              // MFA tamamlanmadan bağlam yok
  if (s.clinicId && s.role && s.memberActive) {
    req.ctx = { userId: s.userId, email: s.email, name: s.name, locale: s.locale, clinicId: s.clinicId, role: s.role as Role,
      perms: effectivePermissions(s.role as Role, s.clinicRolePerms as Partial<Permissions>, s.permissionOverrides as Partial<Permissions>),
      sessionId: s.id, isPlatformAdmin: s.isPlatformAdmin };
  }
  // son görülme: dakikada bir güncelle (yazma yükünü azaltır)
  void ownerSql`update sessions set last_seen_at = now() where id = ${id} and last_seen_at < now() - interval '1 minute'`.catch(() => {});
}

const slugify = (s: string) => s.toLocaleLowerCase("tr").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "klinik";

export async function createClinicWithAdmin(input: { clinicName: string; country: string; currency: string; language: string; userId: string }) {
  return ownerSql.begin(async (tx) => {
    let slug = slugify(input.clinicName), i = 1;
    while ((await tx`select 1 from clinics where slug = ${slug}`).length) slug = `${slugify(input.clinicName)}-${++i}`;
    const [clinic] = await tx`insert into clinics (slug, name, country, default_currency, default_language, settings)
      values (${slug}, ${input.clinicName}, ${input.country}, ${input.currency}, ${input.language}, ${tx.json(defaultClinicSettings() as never)}) returning id, slug`;
    await tx`insert into memberships (clinic_id, user_id, role) values (${clinic!.id}, ${input.userId}, 'admin')`;
    await tx`insert into subscriptions (clinic_id, plan_id, status, seats, trial_ends_at) values (${clinic!.id}, 'pro', 'trialing', 10, now() + interval '14 days')`;
    for (const r of defaultWorkflowRules()) await tx`insert into workflow_rules (clinic_id, name, trigger, actions) values (${clinic!.id}, ${r.name}, ${tx.json(r.trigger as never)}, ${tx.json(r.actions as never)})`;
    await seedClinicCatalog(tx as never, clinic!.id as string);
    return clinic as { id: string; slug: string };
  });
}

export function authRoutes(app: FastifyInstance) {
  // ── Kayıt: klinik + yönetici kullanıcı ──
  app.post("/api/auth/signup", { config: { rateLimit: true } }, async (req, reply) => {
    const b = parse(z.object({
      clinicName: z.string().trim().min(2).max(120), name: z.string().trim().min(2).max(120),
      email: z.email().max(200), password: z.string().min(10).max(200),
      country: z.string().length(2).default("TR"), currency: z.string().length(3).default("EUR"), language: z.string().min(2).max(5).default("en"),
    }), req.body);
    const exists = await ownerSql`select 1 from users where email = ${b.email}`;
    if (exists.length) throw new HttpError(409, "email_taken", "Bu e-posta ile kayıtlı bir hesap var");
    const [u] = await ownerSql`insert into users (email, name, password_hash, locale) values (${b.email}, ${b.name}, ${await hashPassword(b.password)}, ${b.language === "tr" ? "tr" : "en"}) returning id`;
    const clinic = await createClinicWithAdmin({ clinicName: b.clinicName, country: b.country, currency: b.currency, language: b.language, userId: u!.id });
    await createSession(reply, req, u!.id, clinic.id, true);
    return { ok: true, clinic };
  });

  // ── Giriş ──
  app.post("/api/auth/login", async (req, reply) => {
    const b = parse(z.object({ email: z.email(), password: z.string().min(1).max(200), code: z.string().max(10).optional() }), req.body);
    const [u] = await ownerSql`select id, password_hash, mfa_enabled, mfa_secret_enc from users where email = ${b.email}`;
    const ok = u ? await verifyPassword(b.password, u.passwordHash) : false;
    await ownerSql`insert into login_events (user_id, email, success, reason, ip, user_agent) values (${u?.id ?? null}, ${b.email}, ${ok}, ${ok ? null : "bad_credentials"}, ${ipOf(req)}, ${req.headers["user-agent"] ?? null})`;
    if (!u || !ok) throw new HttpError(401, "bad_credentials", "E-posta veya şifre hatalı");
    if (u.mfaEnabled) {
      if (!b.code) return { mfaRequired: true };
      if (!verifyTotp(decrypt(u.mfaSecretEnc), b.code)) throw new HttpError(401, "bad_code", "Doğrulama kodu hatalı");
    }
    const [m] = await ownerSql`select clinic_id from memberships where user_id = ${u.id} and active order by created_at limit 1`;
    await ownerSql`update users set last_login_at = now() where id = ${u.id}`;
    await createSession(reply, req, u.id, m?.clinicId ?? null, true);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (req.sessionId) await ownerSql`delete from sessions where id = ${req.sessionId}`;
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  // ── Oturum bilgisi ──
  app.get("/api/auth/me", async (req) => {
    if (!req.sessionUserId) return { user: null };
    const [u] = await ownerSql`select id, email, name, locale, mfa_enabled, is_platform_admin from users where id = ${req.sessionUserId}`;
    const clinics = await ownerSql`select c.id, c.slug, c.name, c.brand_color, m.role from memberships m join clinics c on c.id = m.clinic_id where m.user_id = ${req.sessionUserId} and m.active order by c.name`;
    const c = req.ctx;
    let clinic = null;
    if (c) [clinic] = await ownerSql`select id, slug, name, brand_color, default_currency, currencies, languages, default_language, tooth_numbering, timezone, settings, status, country from clinics where id = ${c.clinicId}`;
    return { user: u, clinics, clinic, role: c?.role ?? null, perms: c?.perms ?? null };
  });

  app.post("/api/auth/switch-clinic", async (req) => {
    if (!req.sessionUserId) throw new HttpError(401, "unauthorized");
    const { clinicId } = parse(z.object({ clinicId: z.uuid() }), req.body);
    const [m] = await ownerSql`select 1 from memberships where user_id = ${req.sessionUserId} and clinic_id = ${clinicId} and active`;
    if (!m) throw new HttpError(403, "forbidden");
    await ownerSql`update sessions set clinic_id = ${clinicId} where id = ${req.sessionId!}`;
    return { ok: true };
  });

  // ── MFA (TOTP) ──
  app.post("/api/auth/mfa/setup", async (req) => {
    const c = ctx(req);
    const secret = newTotpSecret();
    await ownerSql`update users set mfa_secret_enc = ${encrypt(secret)} where id = ${c.userId} and not mfa_enabled`;
    return { secret, uri: totpUri(secret, c.email) };
  });
  app.post("/api/auth/mfa/enable", async (req) => {
    const c = ctx(req);
    const { code } = parse(z.object({ code: z.string().min(6).max(8) }), req.body);
    const [u] = await ownerSql`select mfa_secret_enc from users where id = ${c.userId}`;
    if (!u?.mfaSecretEnc || !verifyTotp(decrypt(u.mfaSecretEnc), code)) throw new HttpError(400, "bad_code", "Kod hatalı");
    await ownerSql`update users set mfa_enabled = true where id = ${c.userId}`;
    return { ok: true };
  });
  app.post("/api/auth/mfa/disable", async (req) => {
    const c = ctx(req);
    const { code } = parse(z.object({ code: z.string().min(6).max(8) }), req.body);
    const [u] = await ownerSql`select mfa_secret_enc from users where id = ${c.userId}`;
    if (!u?.mfaSecretEnc || !verifyTotp(decrypt(u.mfaSecretEnc), code)) throw new HttpError(400, "bad_code", "Kod hatalı");
    await ownerSql`update users set mfa_enabled = false, mfa_secret_enc = null where id = ${c.userId}`;
    return { ok: true };
  });

  // ── Şifre ──
  app.post("/api/auth/password/forgot", async (req) => {
    const { email } = parse(z.object({ email: z.email() }), req.body);
    const [u] = await ownerSql`select id from users where email = ${email}`;
    if (u) {
      const t = randomToken();
      await ownerSql`insert into auth_tokens (token_hash, user_id, purpose, expires_at) values (${sha256(t)}, ${u.id}, 'reset', now() + interval '1 hour')`;
      await sendMail(email, "Şifre sıfırlama / Password reset", `${config.appUrl}/reset?token=${t}`);
    }
    return { ok: true }; // e-postanın varlığını sızdırma
  });
  app.post("/api/auth/password/reset", async (req) => {
    const b = parse(z.object({ token: z.string().min(20), password: z.string().min(10).max(200) }), req.body);
    const [t] = await ownerSql`update auth_tokens set used_at = now() where token_hash = ${sha256(b.token)} and purpose = 'reset' and used_at is null and expires_at > now() returning user_id`;
    if (!t) throw new HttpError(400, "bad_token", "Bağlantı geçersiz veya süresi dolmuş");
    await ownerSql`update users set password_hash = ${await hashPassword(b.password)} where id = ${t.userId}`;
    await ownerSql`delete from sessions where user_id = ${t.userId}`;
    return { ok: true };
  });
  app.post("/api/auth/password/change", async (req) => {
    const c = ctx(req);
    const b = parse(z.object({ current: z.string(), password: z.string().min(10).max(200) }), req.body);
    const [u] = await ownerSql`select password_hash from users where id = ${c.userId}`;
    if (!(await verifyPassword(b.current, u!.passwordHash))) throw new HttpError(400, "bad_password", "Mevcut şifre hatalı");
    await ownerSql`update users set password_hash = ${await hashPassword(b.password)} where id = ${c.userId}`;
    await ownerSql`delete from sessions where user_id = ${c.userId} and id <> ${c.sessionId}`;
    return { ok: true };
  });

  // ── Oturumlar ──
  app.get("/api/auth/sessions", async (req) => {
    const c = ctx(req);
    const rows = await ownerSql`select id, ip, user_agent, created_at, last_seen_at from sessions where user_id = ${c.userId} and expires_at > now() order by last_seen_at desc`;
    return rows.map((r) => ({ ...r, id: r.id.slice(0, 12), current: r.id === c.sessionId }));
  });
  app.post("/api/auth/sessions/revoke-others", async (req) => {
    const c = ctx(req);
    await ownerSql`delete from sessions where user_id = ${c.userId} and id <> ${c.sessionId}`;
    return { ok: true };
  });

  // ── Davet kabulü (herkese açık) ──
  app.get("/api/invites/:token", async (req) => {
    const { token } = req.params as { token: string };
    const [i] = await ownerSql`select i.email, i.role, c.name as clinic_name from invites i join clinics c on c.id = i.clinic_id where token_hash = ${sha256(token)} and accepted_at is null and expires_at > now()`;
    if (!i) throw new HttpError(404, "invite_invalid", "Davet geçersiz veya süresi dolmuş");
    const [u] = await ownerSql`select 1 from users where email = ${i.email}`;
    return { ...i, hasAccount: !!u };
  });
  app.post("/api/invites/:token/accept", async (req, reply) => {
    const { token } = req.params as { token: string };
    const b = parse(z.object({ name: z.string().min(2).max(120).optional(), password: z.string().min(10).max(200) }), req.body);
    const result = await ownerSql.begin(async (tx) => {
      const [i] = await tx`update invites set accepted_at = now() where token_hash = ${sha256(token)} and accepted_at is null and expires_at > now() returning clinic_id, email, role`;
      if (!i) throw new HttpError(404, "invite_invalid", "Davet geçersiz veya süresi dolmuş");
      let [u] = await tx`select id, password_hash from users where email = ${i.email}`;
      if (u) { if (!(await verifyPassword(b.password, u.passwordHash))) throw new HttpError(401, "bad_credentials", "Şifre hatalı"); }
      else [u] = await tx`insert into users (email, name, password_hash) values (${i.email}, ${b.name ?? i.email.split("@")[0]}, ${await hashPassword(b.password)}) returning id`;
      await tx`insert into memberships (clinic_id, user_id, role) values (${i.clinicId}, ${u!.id}, ${i.role}) on conflict (clinic_id, user_id) do update set active = true, role = excluded.role`;
      return { userId: u!.id as string, clinicId: i.clinicId as string };
    });
    await createSession(reply, req, result.userId, result.clinicId, true);
    return { ok: true };
  });
}

export async function inviteMember(clinicId: string, invitedBy: string, email: string, role: Role) {
  const t = randomToken();
  await withClinic(clinicId, (tx) => tx`insert into invites (clinic_id, email, role, token_hash, invited_by, expires_at) values (${clinicId}, ${email}, ${role}, ${sha256(t)}, ${invitedBy}, now() + interval '7 days')`);
  const link = `${config.appUrl}/invite/${t}`;
  await sendMail(email, "DentaFlow davet / invitation", link);
  return link;
}
