import { buildServer } from "../src/server.ts";
import type { FastifyInstance } from "fastify";

export async function server() { return buildServer(); }

/** Çerez taşıyan basit istemci (app.inject üzerinden) */
export function client(app: FastifyInstance) {
  let cookie = "";
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await app.inject({ method: method as "GET", url, payload: body as object, headers: cookie ? { cookie } : {} });
    const sc = res.headers["set-cookie"];
    if (sc) cookie = (Array.isArray(sc) ? sc : [sc]).map((c) => c.split(";")[0]).join("; ");
    let json: any = null; try { json = res.json(); } catch {}
    return { status: res.statusCode, body: json };
  };
  return { get: (u: string) => call("GET", u), post: (u: string, b?: unknown) => call("POST", u, b ?? {}), patch: (u: string, b: unknown) => call("PATCH", u, b), put: (u: string, b: unknown) => call("PUT", u, b), del: (u: string) => call("DELETE", u) };
}
export const uniq = () => Math.random().toString(36).slice(2, 8);
export async function signup(app: FastifyInstance, name = "Test Klinik") {
  const c = client(app); const email = `t_${uniq()}@test.local`;
  const r = await c.post("/api/auth/signup", { clinicName: `${name} ${uniq()}`, name: "Test Admin", email, password: "SuperSecret123!", country: "TR", currency: "EUR", language: "tr" });
  if (r.status !== 200) throw new Error("signup failed " + JSON.stringify(r.body));
  return { c, email, clinic: r.body.clinic };
}
