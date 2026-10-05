// Demo klinik: yönetici + ekip, örnek lead'ler, vakalar, teklif. Kullanım: node --env-file=.env scripts/seed-demo.ts
import { buildServer } from "../apps/api/src/server.ts";
import { ownerSql, sql } from "../apps/api/src/db.ts";
import { processOutbox } from "../apps/api/src/worker.ts";

const PASS = process.env.DEMO_PASSWORD; if (!PASS) throw new Error("DEMO_PASSWORD gerekli");
const EMAIL = process.env.DEMO_EMAIL ?? "admin@demo.dentaflow.test";
const app = await buildServer();
let cookie = "";
const call = async (method: string, url: string, body?: unknown) => {
  const r = await app.inject({ method: method as "GET", url, payload: body as object, headers: cookie ? { cookie } : {} });
  const sc = r.headers["set-cookie"]; if (sc) cookie = (Array.isArray(sc) ? sc : [sc]).map((c) => c.split(";")[0]).join("; ");
  if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
  return r.json();
};
const exists = await ownerSql`select 1 from users where email = ${EMAIL}`;
if (exists.length) { console.log("Demo zaten var:", EMAIL); process.exit(0); }
await call("POST", "/api/auth/signup", { clinicName: "Demo Dental Clinic", name: "Selin Kaya", email: EMAIL, password: PASS, country: "TR", currency: "EUR", language: "tr" });
const me = await call("GET", "/api/auth/me");
// ekip: davet + kabul (aynı demo şifresiyle)
const team: [string, string, string][] = [["Dr. Emre Aydın", "dentist@demo.dentaflow.test", "dentist"], ["Mert Demir", "sales@demo.dentaflow.test", "sales"], ["Aylin Öz", "manager@demo.dentaflow.test", "manager"], ["Can Yıldız", "coord@demo.dentaflow.test", "coordinator"], ["Deniz Ak", "reception@demo.dentaflow.test", "reception"]];
const adminCookie = cookie; const ids: Record<string, string> = {};
for (const [name, email, role] of team) {
  cookie = adminCookie; const inv = await call("POST", "/api/team/invite", { email, role });
  cookie = ""; await call("POST", `/api/invites/${inv.link.split("/invite/")[1]}/accept`, { name, password: PASS });
  ids[role] = (await call("GET", "/api/auth/me")).user.id;
}
cookie = adminCookie;
await call("POST", "/api/auth/switch-clinic", { clinicId: me.clinic.id });
await ownerSql`update memberships set languages = '{en,de}' where user_id = ${ids.sales!}`;
const L = async (b: any) => (await call("POST", "/api/leads", { ownerId: ids.sales, ...b })).leadId as string;
const james = await L({ fullName: "James O'Brien", phone: "+447700900123", email: "james.obrien@example.com", country: "GB", language: "en", source: "meta", campaign: "UK All-on-4 Q4", temperature: "hot", interest: "All-on-4", issue: "Most upper teeth are loose or missing, wants fixed teeth." });
await call("PUT", `/api/leads/${james}/medical`, { flags: ["diabetes"], age: 54, medications: "Metformin" });
const anna = await L({ fullName: "Anna Müller", phone: "+4915123456789", email: "anna.mueller@example.de", country: "DE", language: "de", source: "google", interest: "Zirconia crowns", issue: "Old crowns, discoloured front teeth." });
const layla = await L({ fullName: "Layla Al-Sayed", phone: "+966501234567", email: "layla@example.sa", country: "SA", language: "ar", source: "tiktok", temperature: "hot", interest: "Hollywood smile" });
await L({ fullName: "Sophie Martin", phone: "+33612345678", email: "sophie.m@example.fr", country: "FR", language: "en", source: "website", interest: "Veneers" });
await L({ fullName: "Michael Brown", phone: "+12025550147", email: "mbrown@example.com", country: "US", language: "en", source: "meta", temperature: "cold", interest: "Implants" });
await L({ fullName: "Siobhán Kelly", phone: "+353851234567", country: "IE", language: "en", source: "whatsapp", interest: "All-on-6" });
await L({ fullName: "Pieter de Vries", phone: "+31612345678", email: "pieter@example.nl", country: "NL", language: "en", source: "referral", interest: "Implants" });
// James: vaka havuzda, durum işaretli
const k1 = await call("POST", "/api/cases", { leadId: james });
const sit: Record<string, any> = {}; [17, 16, 15, 14, 24, 25, 26, 27].forEach((t) => (sit[t] = { s: "missing" })); [13, 12, 11, 21, 22, 23].forEach((t) => (sit[t] = { s: "root" })); sit[16] = { s: "missing", f: { sinusSark: true } }; sit[46] = { s: "crown" }; sit[36] = { s: "amalg" };
await call("PUT", `/api/cases/${k1.id}/situation`, { situation: sit, done: true });
// Anna: teşhis edildi
const k2 = await call("POST", "/api/cases", { leadId: anna });
await call("PUT", `/api/cases/${k2.id}/situation`, { situation: { 11: { s: "crown" }, 21: { s: "crown" }, 12: { s: "comp" }, 22: { s: "comp" }, 46: { s: "caries" } }, done: true });
await call("PUT", `/api/cases/${k2.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "a1", v: 1, tx: "rct", teeth: [46] }, { id: "a2", v: 1, tx: "crown_temp", teeth: [13, 12, 11, 21, 22, 23] }, { id: "a3", v: 2, tx: "crown_zr", teeth: [13, 12, 11, 21, 22, 23, 46] }, { id: "a4", v: 1, tx: "whitening", qty: 1 }] });
await call("POST", `/api/cases/${k2.id}/diagnose`, { acknowledge: true });
// Layla: teklif gönderildi (gülüş tasarımı, 2 seçenek)
const k3 = await call("POST", "/api/cases", { leadId: layla });
await call("PUT", `/api/cases/${k3.id}/situation`, { situation: {}, done: true, skipped: true });
await call("PUT", `/api/cases/${k3.id}/plan`, { visits: 2, expectedRevision: 0, items: [{ id: "b1", v: 1, tx: "scaling", qty: 1 }, { id: "b2", v: 2, b: "smile_emax_u" }] });
await call("POST", `/api/cases/${k3.id}/diagnose`, { acknowledge: true });
const kk = (await call("GET", `/api/cases/${k3.id}`)).case;
const p = kk.pricing; p.options.push(await call("POST", `/api/cases/${k3.id}/pricing/option`, { index: 1 })); p.nOpt = 2; p.options[1].rec = true; p.options[0].rec = false; p.currency = "USD"; p.language = "ar";
await call("PUT", `/api/cases/${k3.id}/pricing`, p);
await call("POST", `/api/cases/${k3.id}/quotes`);
await processOutbox(); await processOutbox();
console.log("Demo klinik hazır →", EMAIL, "(şifre .env DEMO_PASSWORD)");
await app.close(); await sql.end(); await ownerSql.end();
