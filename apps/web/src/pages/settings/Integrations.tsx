import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, post, patch, del } from "../../lib/api.ts";
import { Spinner, toast, toastErr, Switch, confirmBox, Modal } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { ConnectCard } from "../Inbox.tsx";

const SOURCES: [string, string, string][] = [["google_leads", "Google Ads", "🔎"], ["tiktok_leads", "TikTok Lead Gen", "🎵"], ["inbound_webhook", "Zapier / Make / Webhook", "⚡"], ["wordpress", "WordPress / Elementor", "🌐"], ["typeform", "Typeform / Jotform", "📝"], ["ghl", "GoHighLevel", "📈"], ["zoho", "Zoho CRM", "🗂"], ["hubspot", "HubSpot", "🧡"]];

export default function IntegrationsTab() {
  const { t, rel, date } = useT(); const qc = useQueryClient();
  const { data: accounts } = useQuery({ queryKey: ["wa-accounts"], queryFn: () => get<any[]>("/api/inbox/accounts") });
  const { data: ig } = useQuery({ queryKey: ["integrations"], queryFn: () => get("/api/integrations") });
  const { data: keys } = useQuery({ queryKey: ["apikeys"], queryFn: () => get<any[]>("/api/integrations/api-keys") });
  const { data: wh } = useQuery({ queryKey: ["webhooks"], queryFn: () => get("/api/integrations/webhooks") });
  const [secret, setSecret] = useState<{ title: string; value: string; hint?: string } | null>(null);
  const [newKey, setNewKey] = useState({ name: "", scopes: ["leads:write"] }); const [newWh, setNewWh] = useState({ url: "", events: ["lead.created"] });
  const r = (k: string) => qc.invalidateQueries({ queryKey: [k] });
  if (!ig || !keys || !wh) return <Spinner />;
  return <div className="col" style={{ gap: 14 }}>
    <div className="card"><div className="hd"><h2 className="grow">💬 {t("channels")}</h2></div><div className="bd col">
      {accounts?.map((a) => <div key={a.id} className="row wrap"><span className="bdg ok">WhatsApp</span><b>{a.name}</b><span className="small muted">{a.phone}</span>{a.config?.coexistence && <span className="bdg info">{t("coexistence")}</span>}
        <span className={"bdg " + (a.status === "connected" ? "ok" : "err")}>{a.status}</span><span className="tiny muted grow">{a.lastWebhookAt ? "webhook " + rel(a.lastWebhookAt) : ""}</span>
        <label className="row small" style={{ gap: 6 }}><span className="switch"><input type="checkbox" defaultChecked={!!a.config?.autoReply?.enabled} onChange={(e) => patch(`/api/inbox/accounts/${a.id}`, { config: { autoReply: { ...(a.config?.autoReply ?? {}), enabled: e.target.checked, text: a.config?.autoReply?.text || t("autoreply_default"), outsideHoursOnly: true } } }).then(() => r("wa-accounts"))} /><span /></span>{t("auto_reply")}</label></div>)}
      {!accounts?.length && <ConnectCard />}
      {accounts?.length ? <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={async () => { const x = await post("/api/inbox/templates/sync"); toast(`${x.synced} ${t("templates")}`); }}>{t("sync_templates")}</button> : null}
    </div></div>

    <div className="card"><div className="hd"><h2 className="grow">📥 {t("lead_sources_t")}</h2></div><div className="bd col">
      <p className="small muted" style={{ margin: 0 }}>{t("lead_sources_d")}</p>
      {ig.items.map((x: any) => <div key={x.id} className="row wrap" style={{ alignItems: "flex-start" }}><span className="bdg brand">{SOURCES.find((s) => s[0] === x.kind)?.[1] ?? x.kind}</span><b>{x.name}</b>
        <span className={"bdg " + ({ healthy: "ok", connected: "ok", error: "err", disabled: "" } as any)[x.status]}>{t("is_" + x.status)}</span><span className="tiny muted">{x.stats?.received ?? 0} lead · {x.lastSyncAt ? rel(x.lastSyncAt) : "—"}</span>
        {x.lastError && <span className="tiny" style={{ color: "var(--err)" }}>{x.lastError}</span>}<span className="grow" />
        {x.inboundUrl && <button className="btn xs" onClick={() => { navigator.clipboard.writeText(x.inboundUrl); toast(t("copied")); }}><Icon n="copy" size={12} />URL</button>}
        <button className="btn xs ghost icon danger" onClick={async () => { if (await confirmBox(t("delete"), x.name, t("delete"), true)) { await del(`/api/integrations/${x.id}`); r("integrations"); } }}><Icon n="trash" /></button></div>)}
      <div className="row wrap" style={{ gap: 6 }}>{SOURCES.map(([k, l, e]) => <button key={k} className="chip" onClick={async () => { try { const res = await post("/api/integrations", { kind: k, name: l }); r("integrations"); setSecret({ title: l, value: res.inboundUrl, hint: k === "google_leads" ? `Google key: ${res.googleKey}` : t("inbound_hint") }); } catch (er) { toastErr(er); } }}>{e} {l}</button>)}</div>
      <div className="tiny muted">Meta Lead Ads: {ig.meta.ready ? t("meta_ready") : t("wa_platform_pending")}</div>
    </div></div>

    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><div className="hd"><h2 className="grow">🔑 {t("api_keys")}</h2></div><div className="bd col">
        {keys.map((k) => <div key={k.id} className="row small" style={k.revokedAt ? { opacity: 0.45 } : undefined}><span className="code">{k.prefix}…</span><b className="grow">{k.name}</b><span className="tiny muted">{k.scopes.join(", ")}</span><span className="tiny muted">{k.lastUsedAt ? rel(k.lastUsedAt) : "—"}</span>
          {!k.revokedAt && <button className="btn xs ghost danger" onClick={async () => { if (await confirmBox(t("revoke"), k.name, t("revoke"), true)) { await del(`/api/integrations/api-keys/${k.id}`); r("apikeys"); } }}>{t("revoke")}</button>}</div>)}
        <div className="row"><input className="inp sm grow" placeholder={t("name")} value={newKey.name} onChange={(e) => setNewKey({ ...newKey, name: e.target.value })} />
          <select className="inp sm" style={{ width: "auto" }} multiple size={3} value={newKey.scopes} onChange={(e) => setNewKey({ ...newKey, scopes: [...e.target.selectedOptions].map((o) => o.value) })}>{["leads:write", "leads:read", "deals:read"].map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn sm" onClick={async () => { if (!newKey.name) return; const x = await post("/api/integrations/api-keys", newKey); setNewKey({ ...newKey, name: "" }); r("apikeys"); setSecret({ title: t("api_keys"), value: x.key, hint: t("shown_once") }); }}><Icon n="plus" /></button></div>
        <div className="tiny muted">POST {location.origin}/api/v1/leads · Authorization: Bearer df_…</div></div></div>
      <div className="card"><div className="hd"><h2 className="grow">📤 {t("webhooks_out")}</h2></div><div className="bd col">
        {wh.endpoints.map((w: any) => <div key={w.id} className="row small wrap"><Switch checked={w.active} onChange={(v) => patch(`/api/integrations/webhooks/${w.id}`, { active: v }).then(() => r("webhooks"))} /><span className="grow code">{w.url}</span>
          <span className="tiny muted">{w.events.join(", ")}</span><span className={"bdg " + (w.lastStatus >= 200 && w.lastStatus < 300 ? "ok" : w.lastStatus ? "err" : "")}>{w.lastStatus ?? "—"}</span>
          <button className="btn xs" onClick={async () => { const x = await post(`/api/integrations/webhooks/${w.id}/test`); toast(`HTTP ${x.status}`); }}>{t("test")}</button>
          <button className="btn xs ghost icon danger" onClick={async () => { await del(`/api/integrations/webhooks/${w.id}`); r("webhooks"); }}><Icon n="trash" /></button></div>)}
        <input className="inp sm" placeholder="https://hooks.zapier.com/…" value={newWh.url} onChange={(e) => setNewWh({ ...newWh, url: e.target.value })} />
        <div className="row wrap" style={{ gap: 4 }}>{["*", ...wh.events].map((ev: string) => <button key={ev} className={"chip" + (newWh.events.includes(ev) ? " on" : "")} style={{ height: 24, fontSize: 11 }} onClick={() => setNewWh({ ...newWh, events: newWh.events.includes(ev) ? newWh.events.filter((x) => x !== ev) : [...newWh.events, ev] })}>{ev}</button>)}</div>
        <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={async () => { try { const x = await post("/api/integrations/webhooks", newWh); setNewWh({ url: "", events: ["lead.created"] }); r("webhooks"); setSecret({ title: t("webhooks_out"), value: x.secret, hint: t("webhook_sig_hint") }); } catch (e) { toastErr(e); } }}><Icon n="plus" />{t("add")}</button>
        {wh.deliveries.length > 0 && <details><summary className="small">{t("deliveries")} ({wh.deliveries.length})</summary>{wh.deliveries.slice(0, 20).map((d: any) => <div key={d.id} className="row tiny"><span className={"bdg " + (d.status >= 200 && d.status < 300 ? "ok" : "err")}>{d.status}</span><span className="grow">{d.eventType}</span><span className="muted">{d.durationMs}ms · {date(d.at, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div>)}</details>}
      </div></div>
    </div>
    {secret && <Modal onClose={() => setSecret(null)}><div className="hd"><h2>{secret.title}</h2></div><div className="bd col"><div className="code" style={{ fontSize: 13, padding: 10 }}>{secret.value}</div>{secret.hint && <div className="small muted">{secret.hint}</div>}</div>
      <div className="ft"><button className="btn" onClick={() => { navigator.clipboard.writeText(secret.value); toast(t("copied")); }}><Icon n="copy" />{t("copy")}</button><button className="btn pri" onClick={() => setSecret(null)}>{t("ok")}</button></div></Modal>}
  </div>;
}
