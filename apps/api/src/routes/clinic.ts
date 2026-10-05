import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withClinic, ownerSql } from "../db.ts";
import { ctx, need, parse, HttpError, notFound } from "../http.ts";
import { audit } from "../services/audit.ts";
import { inviteMember } from "../auth.ts";
import { enforce } from "./saas.ts";
import { ROLES, ROLE_DEFAULTS, effectivePermissions, type Role, type Permissions } from "@dentaflow/core/permissions";

export function clinicRoutes(app: FastifyInstance) {
  app.get("/api/clinic", async (req) => {
    const c = ctx(req);
    const [r] = await withClinic(c.clinicId, (tx) => tx`select * from clinics where id = ${c.clinicId}`);
    return r;
  });

  app.patch("/api/clinic", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const b = parse(z.object({
      name: z.string().min(2).max(120), legalName: z.string().max(200).nullable(), country: z.string().length(2), city: z.string().max(80).nullable(),
      address: z.string().max(300).nullable(), phone: z.string().max(40).nullable(), email: z.email().nullable().or(z.literal("")), website: z.string().max(200).nullable(), taxId: z.string().max(40).nullable(),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), defaultCurrency: z.string().length(3), currencies: z.array(z.string().length(3)).min(1).max(15),
      languages: z.array(z.string().min(2).max(5)).min(1).max(15), defaultLanguage: z.string().min(2).max(5), timezone: z.string().max(60),
      toothNumbering: z.enum(["FDI", "UNIVERSAL", "PALMER"]), settings: z.record(z.string(), z.unknown()),
    }).partial(), req.body);
    const map: Record<string, string> = { name: "name", legalName: "legal_name", country: "country", city: "city", address: "address", phone: "phone", email: "email", website: "website", taxId: "tax_id",
      brandColor: "brand_color", defaultCurrency: "default_currency", currencies: "currencies", languages: "languages", defaultLanguage: "default_language", timezone: "timezone", toothNumbering: "tooth_numbering" };
    return withClinic(c.clinicId, async (tx) => {
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(map)) if ((b as Record<string, unknown>)[k] !== undefined) set[col] = (b as Record<string, unknown>)[k];
      if (Object.keys(set).length) await tx`update clinics set ${tx(set as never)} where id = ${c.clinicId}`;
      if (b.settings) await tx`update clinics set settings = settings || ${tx.json(b.settings as never)} where id = ${c.clinicId}`;
      await audit(tx, c, "clinic.update", "clinic", c.clinicId, { ...set, settings: b.settings ? Object.keys(b.settings) : undefined });
      return { ok: true };
    });
  });

  // ── Ekip ──
  app.get("/api/team", async (req) => {
    const c = ctx(req);
    return withClinic(c.clinicId, async (tx) => {
      const members = await tx`select m.id, m.user_id, m.role, m.title, m.languages, m.availability, m.active, m.can_own_leads, m.reports_to, m.permission_overrides, u.name, u.email, u.mfa_enabled, u.last_login_at
        from memberships m join users u on u.id = m.user_id where m.clinic_id = ${c.clinicId} order by m.active desc, u.name`;
      const invites = c.perms["team.manage"] ? await tx`select id, email, role, expires_at, created_at from invites where clinic_id = ${c.clinicId} and accepted_at is null and expires_at > now() order by created_at desc` : [];
      return { members, invites };
    });
  });

  app.post("/api/team/invite", async (req) => {
    const c = need(ctx(req), "team.manage");
    const b = parse(z.object({ email: z.email(), role: z.enum(ROLES) }), req.body);
    await enforce(c.clinicId, "seats");
    const link = await inviteMember(c.clinicId, c.userId, b.email.toLowerCase(), b.role);
    await withClinic(c.clinicId, (tx) => audit(tx, c, "team.invite", "invite", null, { email: b.email, role: b.role }));
    return { ok: true, link };   // bağlantı, e-posta kurulana kadar arayüzde de gösterilir
  });

  app.delete("/api/team/invites/:id", async (req) => {
    const c = need(ctx(req), "team.manage");
    const { id } = req.params as { id: string };
    await withClinic(c.clinicId, (tx) => tx`delete from invites where id = ${id}`);
    return { ok: true };
  });

  app.patch("/api/team/:id", async (req) => {
    const c = need(ctx(req), "team.manage");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ role: z.enum(ROLES), title: z.string().max(80).nullable(), languages: z.array(z.string().max(5)).max(15), active: z.boolean(),
      canOwnLeads: z.boolean(), reportsTo: z.uuid().nullable(), permissionOverrides: z.record(z.string(), z.unknown()) }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      const [m] = await tx`select user_id, role from memberships where id = ${id}`;
      if (!m) throw notFound("Üye");
      if (m.userId === c.userId && (b.active === false || (b.role && b.role !== "admin"))) throw new HttpError(400, "self_lockout", "Kendi yönetici yetkinizi kaldıramazsınız");
      const map: Record<string, string> = { role: "role", title: "title", languages: "languages", active: "active", canOwnLeads: "can_own_leads", reportsTo: "reports_to" };
      const set: Record<string, unknown> = {};
      for (const [k, col] of Object.entries(map)) if ((b as Record<string, unknown>)[k] !== undefined) set[col] = (b as Record<string, unknown>)[k];
      if (b.permissionOverrides) set.permission_overrides = tx.json(b.permissionOverrides as never);
      if (Object.keys(set).length) await tx`update memberships set ${tx(set as never)} where id = ${id}`;
      if (b.active === false) await ownerSql`delete from sessions where user_id = ${m.userId} and clinic_id = ${c.clinicId}`;
      await audit(tx, c, "team.update", "membership", id, b);
      return { ok: true };
    });
  });

  // ── Rol izinleri ──
  app.get("/api/roles", async (req) => {
    const c = ctx(req);
    const custom = await withClinic(c.clinicId, (tx) => tx`select role, permissions from role_permissions where clinic_id = ${c.clinicId}`);
    const byRole = Object.fromEntries(custom.map((r) => [r.role, r.permissions]));
    return ROLES.map((role) => ({ role, defaults: ROLE_DEFAULTS[role], custom: byRole[role] ?? null, effective: effectivePermissions(role as Role, byRole[role] as Partial<Permissions>) }));
  });
  app.put("/api/roles/:role", async (req) => {
    const c = need(ctx(req), "team.manage");
    const { role } = parse(z.object({ role: z.enum(ROLES) }), req.params);
    if (role === "admin") throw new HttpError(400, "admin_locked", "Yönetici rolü değiştirilemez");
    const perms = parse(z.record(z.string(), z.unknown()), req.body);
    await withClinic(c.clinicId, async (tx) => {
      await tx`insert into role_permissions (clinic_id, role, permissions) values (${c.clinicId}, ${role}, ${tx.json(perms as never)}) on conflict (clinic_id, role) do update set permissions = excluded.permissions`;
      await audit(tx, c, "role.update", "role", role, perms);
    });
    return { ok: true };
  });
  app.delete("/api/roles/:role", async (req) => {
    const c = need(ctx(req), "team.manage");
    const { role } = req.params as { role: string };
    await withClinic(c.clinicId, (tx) => tx`delete from role_permissions where clinic_id = ${c.clinicId} and role = ${role}`);
    return { ok: true };
  });

  // ── İş akışı kuralları ──
  app.get("/api/workflows", async (req) => {
    const c = need(ctx(req), "settings.manage");
    return withClinic(c.clinicId, (tx) => tx`select * from workflow_rules where clinic_id = ${c.clinicId} order by created_at`);
  });
  app.put("/api/workflows/:id", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const { id } = req.params as { id: string };
    const b = parse(z.object({ name: z.string().min(1).max(120), trigger: z.record(z.string(), z.unknown()), actions: z.array(z.record(z.string(), z.unknown())).min(1).max(10), active: z.boolean() }).partial(), req.body);
    return withClinic(c.clinicId, async (tx) => {
      if (id === "new") {
        const [r] = await tx`insert into workflow_rules (clinic_id, name, trigger, actions, active) values (${c.clinicId}, ${b.name ?? "Yeni kural"}, ${tx.json((b.trigger ?? { event: "lead.created" }) as never)}, ${tx.json((b.actions ?? []) as never)}, ${b.active ?? true}) returning id`;
        return r;
      }
      const set: Record<string, unknown> = {};
      if (b.name !== undefined) set.name = b.name; if (b.active !== undefined) set.active = b.active;
      if (b.trigger) set.trigger = tx.json(b.trigger as never); if (b.actions) set.actions = tx.json(b.actions as never);
      await tx`update workflow_rules set ${tx(set as never)} where id = ${id}`;
      return { ok: true };
    });
  });
  app.delete("/api/workflows/:id", async (req) => {
    const c = need(ctx(req), "settings.manage");
    const { id } = req.params as { id: string };
    await withClinic(c.clinicId, (tx) => tx`delete from workflow_rules where id = ${id}`);
    return { ok: true };
  });
}
