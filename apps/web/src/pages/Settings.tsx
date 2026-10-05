import type React from "react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, put, patch, del } from "../lib/api.ts";
import { PageHead, Spinner, toast, toastErr, confirmBox, Switch, Avatar, Empty } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useMe, useCan, useInvalidateMe } from "../lib/auth.ts";
import { ROLES, type Role } from "@dentaflow/core/permissions";
import { LANG_NAMES } from "@dentaflow/core/i18n";
import PaymentsTab from "./settings/Payments.tsx";
import IntegrationsTab from "./settings/Integrations.tsx";
import BillingTab from "./settings/Billing.tsx";
import FormsTab from "./settings/Forms.tsx";
import FieldsTab from "./settings/Fields.tsx";
import AiTab from "./settings/Ai.tsx";

const TABS = [["general", "general", "gear"], ["team", "team", "users"], ["roles", "roles_perms", "shield"], ["workflows", "workflows", "spark"], ["content", "content", "file"], ["forms", "forms", "pen"], ["fields", "custom_fields", "list"], ["ai", "ai_tab", "spark"], ["payments", "payments", "card"], ["integrations", "integrations", "plug"], ["billing", "billing", "building"], ["audit", "audit_log", "list"]] as const;

export default function Settings() {
  const { tab = "general" } = useParams<{ tab?: string }>(); const [, nav] = useLocation(); const { t } = useT();
  return <>
    <PageHead title={t("nav_settings")} sub={t("settings_sub")} />
    <div className="tabs" style={{ marginBottom: 14 }}>{TABS.map(([k, l, ic]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => nav(`/settings/${k}`)}><Icon n={ic} size={15} />{t(l)}</button>)}</div>
    {tab === "general" && <General />}{tab === "team" && <Team />}{tab === "roles" && <Roles />}{tab === "workflows" && <Workflows />}{tab === "content" && <Content />}{tab === "audit" && <Audit />}
    {tab === "payments" && <PaymentsTab />}{tab === "integrations" && <IntegrationsTab />}{tab === "billing" && <BillingTab />}{tab === "forms" && <FormsTab />}{tab === "fields" && <FieldsTab />}{tab === "ai" && <AiTab />}
  </>;
}
function LazyTab({ name }: { name: string }) {
  const Comp = TAB_REGISTRY[name]; const { t } = useT();
  return Comp ? <Comp /> : <div className="card"><Empty icon="spark" text={t("soon_text")} /></div>;
}
export const TAB_REGISTRY: Record<string, () => React.ReactElement> = {};

function General() {
  const { t } = useT(); const { data: me } = useMe(); const inv = useInvalidateMe();
  const { data: c } = useQuery({ queryKey: ["clinic"], queryFn: () => get("/api/clinic") });
  if (!c) return <Spinner />;
  const save = async (b: any) => { try { await patch("/api/clinic", b); inv(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const S = c.settings ?? {};
  const f = (k: string, label: string, type?: string) => <label className="f">{label}<input className="inp sm" type={type} defaultValue={c[k] ?? ""} onBlur={(e) => e.target.value !== (c[k] ?? "") && save({ [k]: e.target.value || null })} /></label>;
  const setS = (path: string[], v: unknown) => { const s = structuredClone(S); let o: any = s; for (const p of path.slice(0, -1)) o = o[p] ??= {}; o[path.at(-1)!] = v; save({ settings: { [path[0]!]: s[path[0]!] } }); };
  const presets = ["#0E7C86", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#16A34A", "#0F172A", "#B45309"];
  return <div className="grid g2" style={{ alignItems: "start" }}>
    <div className="col" style={{ gap: 14 }}>
      <div className="card"><div className="hd"><h2 className="grow">{t("clinic_id")}</h2></div><div className="bd grid g2">{f("name", t("clinic_name"))}{f("legalName", t("legal_name"))}{f("phone", t("phone"))}{f("email", t("email"), "email")}{f("website", "Web")}{f("city", t("city"))}{f("taxId", "Vergi no / Tax ID")}<div />
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("address")}<input className="inp sm" defaultValue={c.address ?? ""} onBlur={(e) => save({ address: e.target.value })} /></label></div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("brand_color")}</h2><span className="tiny muted">{t("brand_hint")}</span></div><div className="bd row wrap">{presets.map((p) => <button key={p} onClick={() => save({ brandColor: p })} style={{ width: 30, height: 30, borderRadius: "50%", background: p, border: `3px solid ${c.brandColor === p ? "var(--text)" : "transparent"}`, cursor: "pointer" }} />)}
        <input type="color" defaultValue={c.brandColor} onChange={(e) => save({ brandColor: e.target.value })} style={{ width: 40, height: 32, border: 0, background: "none" }} /></div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("money_locale")}</h2></div><div className="bd col">
        <div className="grid g2"><label className="f">{t("def_currency")}<select className="inp sm" defaultValue={c.defaultCurrency} onChange={(e) => save({ defaultCurrency: e.target.value })}>{["EUR", "USD", "GBP", "TRY", "AED", "SAR", "CHF"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="f">{t("numbering")}<select className="inp sm" defaultValue={c.toothNumbering} onChange={(e) => save({ toothNumbering: e.target.value })}>{["FDI", "UNIVERSAL", "PALMER"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="f">{t("language")}<select className="inp sm" defaultValue={c.defaultLanguage} onChange={(e) => save({ defaultLanguage: e.target.value })}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="f">Timezone<input className="inp sm" defaultValue={c.timezone} onBlur={(e) => save({ timezone: e.target.value })} /></label></div>
        <div className="small muted">{t("fx_rates")} (1 EUR =)</div><div className="grid g3">{Object.entries(S.fxRates ?? {}).filter(([k]) => k !== "EUR").map(([k, v]) => <label key={k} className="f">{k}<input className="inp sm num" type="number" step="0.01" defaultValue={v as number} onBlur={(e) => setS(["fxRates", k], +e.target.value || 1)} /></label>)}</div></div></div>
    </div>
    <div className="col" style={{ gap: 14 }}>
      <div className="card"><div className="hd"><h2 className="grow">{t("quote_defaults")}</h2></div><div className="bd grid g2">
        <label className="f">{t("deposit")} %<input className="inp sm" type="number" defaultValue={(S.quote?.depositBps ?? 1000) / 100} onBlur={(e) => setS(["quote", "depositBps"], Math.round(+e.target.value * 100))} /></label>
        <label className="f">{t("valid_days")}<input className="inp sm" type="number" defaultValue={S.quote?.validDays ?? 14} onBlur={(e) => setS(["quote", "validDays"], +e.target.value)} /></label>
        <label className="f">{t("rounding_step")}<input className="inp sm" type="number" defaultValue={S.quote?.rounding ?? 10} onBlur={(e) => setS(["quote", "rounding"], +e.target.value)} /></label>
        <label className="f">{t("hotel_night_eur")}<input className="inp sm" type="number" defaultValue={S.quote?.hotelNightEur ?? 65} onBlur={(e) => setS(["quote", "hotelNightEur"], +e.target.value)} /></label>
        <label className="f">{t("transfer_eur")}<input className="inp sm" type="number" defaultValue={S.quote?.transferEur ?? 60} onBlur={(e) => setS(["quote", "transferEur"], +e.target.value)} /></label><div />
        <label className="f">{t("gap_min")}<input className="inp sm" type="number" defaultValue={S.quote?.gapMinMonths ?? 3} onBlur={(e) => setS(["quote", "gapMinMonths"], +e.target.value)} /></label>
        <label className="f">{t("gap_max")}<input className="inp sm" type="number" defaultValue={S.quote?.gapMaxMonths ?? 6} onBlur={(e) => setS(["quote", "gapMaxMonths"], +e.target.value)} /></label>
        <div style={{ gridColumn: "1/-1" }}><Switch checked={!!S.quote?.requireApprovalAll} onChange={(v) => setS(["quote", "requireApprovalAll"], v)} label={t("approval_all")} /></div></div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("disc_limits")}</h2><span className="tiny muted">{t("disc_hint")}</span></div><div className="bd grid g3">{ROLES.map((r) => <label key={r} className="f">{t("role_" + r)}<div className="row"><input className="inp sm num" type="number" min={0} max={100} defaultValue={S.discountLimits?.[r] ?? 0} onBlur={(e) => setS(["discountLimits", r], +e.target.value)} /><span>%</span></div></label>)}</div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("lead_rules")}</h2></div><div className="bd col">
        <label className="f">{t("lead_sources")}<input className="inp sm" defaultValue={(S.leadSources ?? []).join(", ")} onBlur={(e) => setS(["leadSources"], e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></label>
        <label className="f">{t("loss_reasons")}<input className="inp sm" defaultValue={(S.lossReasons ?? []).join(", ")} onBlur={(e) => setS(["lossReasons"], e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></label>
        <label className="f">{t("sla_min")}<input className="inp sm" type="number" defaultValue={S.responseSlaMinutes ?? 15} onBlur={(e) => setS(["responseSlaMinutes"], +e.target.value)} /></label>
        <Switch checked={S.patientPage?.showMedical === true} onChange={(v) => setS(["patientPage", "showMedical"], v)} label={t("show_medical_public")} /></div></div>
    </div></div>;
}

function Team() {
  const { t, rel } = useT(); const qc = useQueryClient(); const can = useCan(); const { data: me } = useMe();
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  const [inv, setInv] = useState({ email: "", role: "sales" }); const [link, setLink] = useState<string | null>(null);
  if (!data) return <Spinner />;
  const upd = async (id: string, b: any) => { try { await patch(`/api/team/${id}`, b); qc.invalidateQueries({ queryKey: ["team"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="grid ws2" style={{ gridTemplateColumns: "minmax(0,1fr) 360px", alignItems: "start" }}>
    <div className="card"><div className="hd"><h2 className="grow">{t("team")}</h2><span className="bdg">{data.members.filter((m: any) => m.active).length}</span></div><div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("role")}</th><th>{t("language")}</th><th>MFA</th><th>{t("last_login")}</th><th>{t("active")}</th></tr></thead><tbody>
      {data.members.map((m: any) => <tr key={m.id} style={m.active ? undefined : { opacity: 0.5 }}><td><div className="row"><Avatar name={m.name} sm /><div><b>{m.name}</b><div className="tiny muted">{m.email}</div></div></div></td>
        <td><select className="inp sm" style={{ width: "auto" }} value={m.role} disabled={!can("team.manage") || m.userId === me?.user?.id} onChange={(e) => upd(m.id, { role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t("role_" + r)}</option>)}</select></td>
        <td><input className="inp sm" style={{ width: 110 }} defaultValue={(m.languages ?? []).join(",")} placeholder="en,de" disabled={!can("team.manage")} onBlur={(e) => upd(m.id, { languages: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></td>
        <td>{m.mfaEnabled ? <span className="bdg ok">✓</span> : <span className="bdg">—</span>}</td><td className="small muted">{m.lastLoginAt ? rel(m.lastLoginAt) : "—"}</td>
        <td><Switch checked={m.active} onChange={(v) => upd(m.id, { active: v })} /></td></tr>)}</tbody></table></div></div>
    {can("team.manage") && <div className="col" style={{ gap: 12 }}><div className="card"><div className="hd"><h2 className="grow">{t("invite")}</h2></div><div className="bd col">
      <label className="f">{t("email")}<input className="inp" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></label>
      <label className="f">{t("role")}<select className="inp" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t("role_" + r)}</option>)}</select></label>
      <button className="btn pri" onClick={async () => { try { const r = await post("/api/team/invite", inv); setLink(r.link); setInv({ ...inv, email: "" }); qc.invalidateQueries({ queryKey: ["team"] }); } catch (e) { toastErr(e); } }}><Icon n="send" />{t("invite")}</button>
      {link && <div className="alert ok" style={{ flexDirection: "column" }}><span>{t("invite_link")}:</span><span className="code">{link}</span><button className="btn xs" onClick={() => { navigator.clipboard.writeText(link); toast(t("copied")); }}>{t("copy")}</button></div>}</div></div>
      {data.invites.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("pending_invites")}</h3></div><div className="bd col">{data.invites.map((i: any) => <div key={i.id} className="row small"><span className="grow">{i.email}<div className="tiny muted">{t("role_" + i.role)}</div></span><button className="btn xs ghost icon" onClick={async () => { await del(`/api/team/invites/${i.id}`); qc.invalidateQueries({ queryKey: ["team"] }); }}><Icon n="x" /></button></div>)}</div></div>}</div>}
  </div>;
}

const PERM_GROUPS: [string, string[]][] = [
  ["leads", ["lead.read", "lead.write", "lead.delete", "lead.assign", "lead.import", "lead.export", "inbox.use"]],
  ["clinical", ["case.read", "case.write", "case.diagnose"]], ["sales", ["quote.price", "quote.send", "quote.approve", "discount.max", "deal.read", "deal.write", "payment.record", "payment.refund", "finance.view", "finance.manage"]],
  ["ops", ["trip.manage", "appointment.read", "appointment.manage", "reception.use", "task.manage"]], ["admin", ["catalog.manage", "settings.manage", "team.manage", "integrations.manage", "billing.manage", "reports.view", "audit.view"]],
  ["fields", ["field.price", "field.phone", "field.email", "field.passport", "field.medical"]]];
function Roles() {
  const { t } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data } = useQuery({ queryKey: ["roles"], queryFn: () => get("/api/roles") });
  if (!data) return <Spinner />;
  const set = async (role: string, key: string, v: unknown) => { const r = data.find((x: any) => x.role === role); try { await put(`/api/roles/${role}`, { ...(r.custom ?? {}), [key]: v }); qc.invalidateQueries({ queryKey: ["roles"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  const cell = (r: any, k: string) => { const v = r.effective[k], dis = !can("team.manage") || r.role === "admin", custom = r.custom && k in r.custom;
    const style = custom ? { outline: "2px solid var(--accent)", borderRadius: 6 } : undefined;
    if (typeof v === "boolean") return <input type="checkbox" checked={v} disabled={dis} style={style} onChange={(e) => set(r.role, k, e.target.checked)} />;
    if (typeof v === "number") return <input className="inp sm num" type="number" style={{ width: 56, ...style }} defaultValue={v} disabled={dis} onBlur={(e) => set(r.role, k, +e.target.value)} />;
    const opts = k.startsWith("field.") ? ["show", "mask", "hide"] : ["all", "team", "own", false];
    return <select className="inp sm" style={{ width: "auto", ...style }} value={String(v)} disabled={dis} onChange={(e) => set(r.role, k, e.target.value === "false" ? false : e.target.value)}>{opts.map((o) => <option key={String(o)} value={String(o)}>{t("pv_" + String(o))}</option>)}</select>; };
  return <div className="card"><div className="hd"><h2 className="grow">{t("perm_matrix")}</h2><span className="tiny muted">{t("roles_custom_hint")}</span></div><div className="twrap"><table className="tbl"><thead><tr><th />{data.map((r: any) => <th key={r.role}>{t("role_" + r.role)}{r.custom && can("team.manage") && <button className="btn xs ghost" title={t("reset_defaults")} onClick={async () => { await del(`/api/roles/${r.role}`); qc.invalidateQueries({ queryKey: ["roles"] }); }}>↺</button>}</th>)}</tr></thead><tbody>
    {PERM_GROUPS.map(([g, keys]) => <>{/* grup */}<tr key={g}><td colSpan={data.length + 1} className="tiny muted" style={{ background: "var(--subtle)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>{t("pg_" + g)}</td></tr>
      {keys.map((k) => <tr key={k}><td className="small">{t("pk_" + k.replace(".", "_"))}</td>{data.map((r: any) => <td key={r.role}>{cell(r, k)}</td>)}</tr>)}</>)}
  </tbody></table></div></div>;
}

function Workflows() {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["workflows"], queryFn: () => get("/api/workflows") });
  const { data: forms } = useQuery({ queryKey: ["form-templates"], queryFn: () => get<any[]>("/api/forms/templates") });
  if (!data) return <Spinner />;
  const save = async (id: string, b: any) => { try { await put(`/api/workflows/${id}`, b); qc.invalidateQueries({ queryKey: ["workflows"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  const EVENTS = ["lead.created", "lead.stage", "lead.assigned", "case.created", "case.diagnosed", "quote.sent", "quote.viewed", "quote.accepted", "quote.changes", "quote.declined", "deal.created", "deal.stage", "payment.succeeded", "wa.message", "form.completed", "pipeline.stage_entered", "pipeline.sla_breached"];
  return <div className="col" style={{ gap: 12 }}>
    <div className="alert info"><Icon n="info" /><span>{t("wf_explain")}</span></div>
    {data.map((w: any) => { const a = w.actions[0] ?? {}; return <div key={w.id} className="card pad"><div className="row wrap" style={{ gap: 10 }}>
      <Switch checked={w.active} onChange={(v) => save(w.id, { active: v })} />
      <input className="inp sm" style={{ maxWidth: 260 }} defaultValue={w.name} onBlur={(e) => save(w.id, { name: e.target.value })} />
      <span className="small muted">{t("when")}</span><select className="inp sm" style={{ width: "auto" }} defaultValue={w.trigger.event} onChange={(e) => save(w.id, { trigger: { ...w.trigger, event: e.target.value } })}>{EVENTS.map((ev) => <option key={ev} value={ev}>{t("evt_" + ev.replace(".", "_"))}</option>)}</select>
      {["lead.stage", "deal.stage", "pipeline.stage_entered", "pipeline.sla_breached"].includes(w.trigger.event) && <input className="inp sm" style={{ width: 120 }} defaultValue={w.trigger.stage ?? ""} placeholder="stage" onBlur={(e) => save(w.id, { trigger: { ...w.trigger, stage: e.target.value } })} />}
      <span className="small muted">→</span><select className="inp sm" style={{ width: "auto" }} value={a.type ?? "task"} onChange={(e) => save(w.id, { actions: [e.target.value === "send_form" ? { type: "send_form", templateId: forms?.find((f) => f.active)?.id, email: true } : { type: "task", title: "{name}", dueHours: 1, priority: "med", taskType: "general", assign: "owner" }] })}>
        <option value="task">{t("create_task")}</option><option value="send_form">{t("send_form")}</option></select>
      {a.type === "send_form" ? <>
        <select className="inp sm grow" value={a.templateId ?? ""} onChange={(e) => save(w.id, { actions: [{ ...a, templateId: e.target.value }] })}>{(forms ?? []).filter((f) => f.active).map((f) => <option key={f.id} value={f.id}>{f.name} · {f.lang.toUpperCase()}</option>)}</select>
        <label className="row tiny muted" style={{ gap: 4 }}><input type="checkbox" checked={a.email !== false} onChange={(e) => save(w.id, { actions: [{ ...a, email: e.target.checked }] })} />{t("email")}</label>
      </> : <>
      <input className="inp sm grow" defaultValue={a.title} onBlur={(e) => save(w.id, { actions: [{ ...a, title: e.target.value }] })} />
      <input className="inp sm num" type="number" style={{ width: 64 }} defaultValue={a.dueHours} title={t("due_hours")} onBlur={(e) => save(w.id, { actions: [{ ...a, dueHours: +e.target.value }] })} /><span className="tiny muted">{t("hours")}</span>
      <select className="inp sm" style={{ width: "auto" }} defaultValue={a.priority} onChange={(e) => save(w.id, { actions: [{ ...a, priority: e.target.value }] })}>{["high", "med", "low"].map((p) => <option key={p} value={p}>{t("p_" + p)}</option>)}</select></>}
      <span className="tiny muted">{w.runs}×</span><button className="btn xs ghost icon danger" onClick={async () => { if (await confirmBox(t("delete"), w.name, t("delete"), true)) { await del(`/api/workflows/${w.id}`); qc.invalidateQueries({ queryKey: ["workflows"] }); } }}><Icon n="trash" /></button></div></div>; })}
    <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => save("new", { name: t("new_rule"), trigger: { event: "lead.created" }, actions: [{ type: "task", title: "{name}", dueHours: 1, priority: "med", taskType: "general", assign: "owner" }] })}><Icon n="plus" />{t("new_rule")}</button>
  </div>;
}

function Content() {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["content"], queryFn: () => get("/api/content") });
  if (!data) return <Spinner />;
  const save = async (id: string, b: any) => { await put(`/api/content/${id}`, b); qc.invalidateQueries({ queryKey: ["content"] }); toast(t("saved")); };
  const KINDS = ["faq", "team", "testimonial", "certificate", "legal"];
  return <div className="col" style={{ gap: 12 }}>{KINDS.map((k) => <div key={k} className="card"><div className="hd"><h3 className="grow">{t("ck_" + k)}</h3><button className="btn sm" onClick={() => save("new", { kind: k, data: k === "faq" ? { q: { tr: "", en: "" }, a: { tr: "", en: "" } } : { title: "", text: "" } })}><Icon n="plus" /></button></div><div className="bd col">
    {data.filter((x: any) => x.kind === k).map((x: any) => <div key={x.id} className="row wrap" style={{ alignItems: "flex-start" }}>
      {k === "faq" ? <div className="grid g2 grow">{["tr", "en"].map((l) => <div key={l} className="col" style={{ gap: 4 }}><input className="inp sm" placeholder={`Q (${l})`} defaultValue={x.data.q?.[l] ?? ""} onBlur={(e) => save(x.id, { data: { ...x.data, q: { ...x.data.q, [l]: e.target.value } } })} />
        <textarea className="inp" style={{ minHeight: 50 }} placeholder={`A (${l})`} defaultValue={x.data.a?.[l] ?? ""} onBlur={(e) => save(x.id, { data: { ...x.data, a: { ...x.data.a, [l]: e.target.value } } })} /></div>)}</div>
        : <div className="grid g2 grow"><input className="inp sm" placeholder={t("title")} defaultValue={x.data.title ?? ""} onBlur={(e) => save(x.id, { data: { ...x.data, title: e.target.value } })} /><input className="inp sm" placeholder="…" defaultValue={x.data.text ?? ""} onBlur={(e) => save(x.id, { data: { ...x.data, text: e.target.value } })} /></div>}
      <button className="btn xs ghost icon danger" onClick={async () => { await del(`/api/content/${x.id}`); qc.invalidateQueries({ queryKey: ["content"] }); }}><Icon n="trash" /></button></div>)}</div></div>)}</div>;
}

function Audit() {
  const { t, date } = useT();
  const { data } = useQuery({ queryKey: ["audit"], queryFn: () => get("/api/audit?limit=200") });
  if (!data) return <Spinner />;
  return <div className="card"><div className="twrap"><table className="tbl"><thead><tr><th>{t("date")}</th><th>{t("user")}</th><th>{t("action")}</th><th>{t("entity")}</th><th>Data</th></tr></thead><tbody>
    {data.map((a: any) => <tr key={a.id}><td className="small muted">{date(a.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td className="small">{a.userName ?? "—"}</td><td><span className="code">{a.action}</span></td><td className="small muted">{a.entity} {a.entityId?.slice(0, 8)}</td>
      <td className="tiny muted" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.data ? JSON.stringify(a.data) : ""}</td></tr>)}</tbody></table></div></div>;
}
