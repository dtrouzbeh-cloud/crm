import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, qs } from "../lib/api.ts";
import { PageHead, Spinner, Empty, Avatar, toast, toastErr, Modal } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan, useMe } from "../lib/auth.ts";
import { StageBadge } from "../lib/format.tsx";

const FILTERS = ["all", "mine", "unassigned", "starred", "closed"];
export default function Inbox() {
  const { id } = useParams<{ id?: string }>(); const { t, rel } = useT(); const [, nav] = useLocation(); const can = useCan();
  const [filter, setFilter] = useState("all"); const [q, setQ] = useState("");
  const { data: accounts } = useQuery({ queryKey: ["wa-accounts"], queryFn: () => get<any[]>("/api/inbox/accounts") });
  const { data } = useQuery({ queryKey: ["convs", filter, q], queryFn: () => get<any[]>("/api/inbox/conversations" + qs({ filter, q })), refetchInterval: 8000 });
  if (accounts && !accounts.length) return <><PageHead title={t("nav_inbox")} /><ConnectCard /></>;
  return <><PageHead title={t("nav_inbox")} sub={accounts?.map((a) => `${a.name} ${a.phone ?? ""}`).join(" · ")} actions={can("integrations.manage") ? <Link className="btn" href="/settings/integrations"><Icon n="gear" />{t("channels")}</Link> : null} />
    <div className="card inbox" style={{ display: "grid", gridTemplateColumns: "320px minmax(0,1fr)", height: "calc(100vh - 150px)", overflow: "hidden" }}>
      <div style={{ borderInlineEnd: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: 10, borderBottom: "1px solid var(--line)" }} className="col"><input className="inp sm" placeholder={t("filter_ph")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="row wrap" style={{ gap: 4 }}>{FILTERS.map((f) => <button key={f} className={"chip" + (filter === f ? " on" : "")} style={{ height: 26, fontSize: 12 }} onClick={() => setFilter(f)}>{t("if_" + f)}</button>)}</div></div>
        <div style={{ overflow: "auto", flex: 1 }}>{!data ? <Spinner /> : data.length ? data.map((cv) => <a key={cv.id} onClick={() => nav(`/inbox/${cv.id}`)} className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer", background: cv.id === id ? "var(--brand-soft)" : undefined, color: "inherit", alignItems: "flex-start" }}>
          <Avatar name={cv.contactName ?? cv.contactId} /><div className="grow" style={{ minWidth: 0 }}><div className="row"><b className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cv.contactName ?? "+" + cv.contactId}</b><span className="tiny muted">{cv.lastMessageAt ? rel(cv.lastMessageAt) : ""}</span></div>
            <div className="row"><span className="small muted grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cv.lastPreview}</span>{cv.unread > 0 && <span className="bdg n">{cv.unread}</span>}</div>
            <div className="row tiny muted" style={{ gap: 6 }}>{cv.starred && "★"}{cv.assigneeName ? <><Avatar name={cv.assigneeName} sm /> {cv.assigneeName.split(" ")[0]}</> : <span className="bdg warn">{t("if_unassigned")}</span>}{cv.leadStage && <StageBadge s={cv.leadStage} />}</div></div></a>)
          : <Empty icon="inbox" text={t("no_convs")} />}</div>
      </div>
      {id ? <Chat key={id} id={id} /> : <Empty icon="wa" text={t("pick_conv")} />}
    </div></>;
}

function Chat({ id }: { id: string }) {
  const { t, date } = useT(); const qc = useQueryClient(); const { data: me } = useMe();
  const { data } = useQuery({ queryKey: ["conv", id], queryFn: () => get(`/api/inbox/conversations/${id}`), refetchInterval: 5000 });
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  const { data: canned } = useQuery({ queryKey: ["canned"], queryFn: () => get<any[]>("/api/inbox/canned") });
  const [text, setText] = useState(""); const [mode, setMode] = useState<"msg" | "note">("msg"); const [tpl, setTpl] = useState(false); const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); qc.invalidateQueries({ queryKey: ["convs"] }); }, [data?.messages?.length]);
  if (!data) return <Spinner />;
  const cv = data.conversation;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["conv", id] }); qc.invalidateQueries({ queryKey: ["convs"] }); };
  const send = async () => { if (!text.trim()) return; setSending(true);
    try { if (mode === "note") await post(`/api/inbox/conversations/${id}/note`, { body: text }); else await post(`/api/inbox/conversations/${id}/messages`, { body: text, idempotencyKey: crypto.randomUUID() }); setText(""); refresh(); } catch (e) { toastErr(e); } finally { setSending(false); } };
  const upd = async (b: any) => { await patch(`/api/inbox/conversations/${id}`, b); refresh(); };
  return <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
    <div className="row wrap" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", gap: 8 }}><Avatar name={cv.contactName ?? cv.contactId} /><div className="grow"><b>{cv.contactName ?? "+" + cv.contactId}</b><div className="tiny muted">+{cv.contactId} · {cv.accountName}</div></div>
      {cv.leadId && <Link className="btn sm" href={`/leads/${cv.leadId}`}><Icon n="users" />{t("open_lead")}</Link>}
      <select className="inp sm" style={{ width: "auto" }} value={cv.assigneeId ?? ""} onChange={(e) => upd({ assigneeId: e.target.value || null })}><option value="">{t("if_unassigned")}</option>{team?.members?.filter((m: any) => m.active).map((m: any) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select>
      <button className="btn sm icon" title="★" onClick={() => upd({ starred: !cv.starred })} style={cv.starred ? { color: "var(--accent)" } : undefined}><Icon n="star" /></button>
      <button className="btn sm" onClick={() => upd({ status: cv.status === "closed" ? "open" : "closed" })}>{cv.status === "closed" ? t("reopen") : t("close_conv")}</button></div>
    <div style={{ flex: 1, overflow: "auto", padding: 14, background: "var(--subtle)" }} className="col">
      {data.messages.map((m: any) => <div key={m.id} style={{ alignSelf: m.direction === "in" ? "flex-start" : "flex-end", maxWidth: "72%" }}>
        <div style={{ padding: "8px 12px", borderRadius: 12, background: m.direction === "note" ? "var(--warn-bg)" : m.direction === "in" ? "var(--card)" : "var(--brand-soft)", border: "1px solid var(--line)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {m.direction === "note" && <div className="tiny" style={{ color: "var(--warn)", fontWeight: 700 }}>🔒 {t("internal_note")}</div>}
          {m.type === "template" && <div className="tiny muted">📄 {m.template?.name}</div>}
          {m.media && <div className="tiny muted">📎 {m.type} {m.media.filename ?? ""}</div>}
          {m.body}</div>
        <div className="tiny faint" style={{ textAlign: m.direction === "in" ? "start" : "end", marginTop: 2 }}>{m.userName ? m.userName + " · " : ""}{date(m.at, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} {m.direction === "out" && ({ queued: "⏳", sent: "✓", delivered: "✓✓", read: "✓✓ 👁", failed: "⚠ " + (m.error ?? "") } as Record<string, string>)[m.status]}</div></div>)}
      <div ref={end} /></div>
    <div style={{ borderTop: "1px solid var(--line)", padding: 10 }} className="col">
      {!cv.windowOpen && mode === "msg" && <div className="alert warn"><Icon n="clock" /><span className="grow">{t("window_closed")}</span><button className="btn sm" onClick={() => setTpl(true)}>{t("send_template")}</button></div>}
      <div className="row" style={{ gap: 6 }}><div className="seg"><button className={mode === "msg" ? "on" : ""} onClick={() => setMode("msg")}>{t("message")}</button><button className={mode === "note" ? "on" : ""} onClick={() => setMode("note")}>{t("internal_note")}</button></div>
        {canned?.length ? <select className="inp sm" style={{ width: "auto" }} value="" onChange={(e) => { const c = canned.find((x) => x.id === e.target.value); if (c) setText(c.body.replace("{name}", (cv.contactName ?? "").split(" ")[0]).replace("{agent}", me?.user?.name ?? "")); }}><option value="">⚡ {t("canned")}</option>{canned.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select> : null}
        <button className="btn sm ghost" onClick={() => setTpl(true)}>📄 {t("templates")}</button></div>
      <div className="row"><textarea className="inp" style={{ minHeight: 44, maxHeight: 160 }} value={text} placeholder={mode === "note" ? t("note_ph") : t("type_message")} disabled={mode === "msg" && !cv.windowOpen}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} /><button className="btn pri" style={{ height: 44 }} disabled={sending || (mode === "msg" && !cv.windowOpen)} onClick={send}><Icon n="send" /></button></div>
    </div>
    {tpl && <TemplateModal convId={id} name={cv.contactName} onClose={() => { setTpl(false); refresh(); }} />}
  </div>;
}

function TemplateModal({ convId, name, onClose }: { convId: string; name?: string; onClose: () => void }) {
  const { t } = useT(); const { data } = useQuery({ queryKey: ["templates"], queryFn: () => get<any[]>("/api/inbox/templates") });
  const [sel, setSel] = useState<any>(null); const [params, setParams] = useState<string[]>([]);
  const approved = (data ?? []).filter((x) => x.status === "APPROVED");
  const body = sel?.components?.find((c: any) => c.type === "BODY")?.text ?? ""; const n = (body.match(/\{\{\d+\}\}/g) ?? []).length;
  return <Modal onClose={onClose} width={560}><div className="hd"><h2>{t("send_template")}</h2></div><div className="bd col">
    {!approved.length ? <div className="alert info"><Icon n="info" /><span>{t("no_templates")}</span></div> :
      <select className="inp" value={sel?.id ?? ""} onChange={(e) => { const x = approved.find((y) => y.id === e.target.value); setSel(x); setParams(Array((x?.components?.find((c: any) => c.type === "BODY")?.text.match(/\{\{\d+\}\}/g) ?? []).length).fill("").map((_, i) => (i === 0 ? (name ?? "").split(" ")[0] : ""))); }}><option value="">—</option>{approved.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.language}</option>)}</select>}
    {sel && <><div className="note small" style={{ whiteSpace: "pre-wrap" }}>{body.replace(/\{\{(\d+)\}\}/g, (_: string, i: string) => params[+i - 1] || `{{${i}}}`)}</div>
      {Array.from({ length: n }, (_, i) => <input key={i} className="inp sm" placeholder={`{{${i + 1}}}`} value={params[i] ?? ""} onChange={(e) => { const p = [...params]; p[i] = e.target.value; setParams(p); }} />)}</>}
  </div><div className="ft"><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" disabled={!sel} onClick={async () => { try { await post(`/api/inbox/conversations/${convId}/template`, { name: sel.name, language: sel.language, params, idempotencyKey: crypto.randomUUID() }); toast(t("sent_ok")); onClose(); } catch (e) { toastErr(e); } }}>{t("send")}</button></div></Modal>;
}

export function ConnectCard() {
  const { t } = useT(); const can = useCan(); const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["wa-config"], queryFn: () => get("/api/inbox/config") });
  const [manual, setManual] = useState(false); const [f, setF] = useState({ phoneNumberId: "", wabaId: "", token: "", name: "" });
  const embedded = () => {
    const w = window as any;
    // Oturum bilgisi (phone_number_id, waba_id, coexistence) postMessage ile, yetki kodu FB.login geri çağrısıyla gelir
    const onMsg = (ev: MessageEvent) => { if (!String(ev.origin).endsWith("facebook.com")) return; try { const d = JSON.parse(ev.data); if (d.type === "WA_EMBEDDED_SIGNUP" && String(d.event).startsWith("FINISH")) w.__wa = { ...d.data, event: d.event }; } catch {} };
    addEventListener("message", onMsg);
    const finish = async (code: string) => { const d = w.__wa ?? {}; removeEventListener("message", onMsg);
      try { await post("/api/inbox/accounts/embedded-signup", { code, phoneNumberId: d.phone_number_id, wabaId: d.waba_id, coexistence: d.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" }); qc.invalidateQueries({ queryKey: ["wa-accounts"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
    const start = () => w.FB.login((r: any) => { const code = r?.authResponse?.code; if (code) finish(code); },
      { config_id: cfg.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } });
    if (w.FB) { start(); return; }
    w.fbAsyncInit = () => { w.FB.init({ appId: cfg.appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); start(); };
    const s = document.createElement("script"); s.id = "fbsdk"; s.src = "https://connect.facebook.net/en_US/sdk.js"; s.async = true; document.body.append(s);
  };
  return <div className="card pad" style={{ maxWidth: 720 }}><div className="row" style={{ gap: 14, alignItems: "flex-start" }}><span style={{ fontSize: 34 }}>💬</span><div className="grow">
    <h2>{t("wa_connect_t")}</h2><p className="muted" style={{ margin: "6px 0 12px" }}>{t("wa_connect_d")}</p>
    {can("integrations.manage") ? <div className="col">
      <button className="btn pri" style={{ alignSelf: "flex-start", background: "#16A34A", borderColor: "#16A34A" }} disabled={!cfg?.ready} onClick={embedded}><Icon n="wa" />{t("wa_connect_btn")}</button>
      {!cfg?.ready && <div className="tiny muted">{t("wa_platform_pending")}</div>}
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setManual(!manual)}>{t("wa_manual")}</button>
      {manual && <div className="grid g2">{[["phoneNumberId", "Phone number ID"], ["wabaId", "WhatsApp Business Account ID"], ["token", t("system_user_token")], ["name", t("name")]].map(([k, l]) => <label key={k} className="f">{l}<input className="inp sm" type={k === "token" ? "password" : "text"} value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
        <button className="btn" onClick={async () => { try { await post("/api/inbox/accounts/manual", f); qc.invalidateQueries({ queryKey: ["wa-accounts"] }); toast(t("saved")); } catch (e) { toastErr(e); } }}>{t("connect")}</button>
        <div className="tiny muted" style={{ gridColumn: "1/-1" }}>Webhook: <span className="code">{cfg?.webhookUrl}</span></div></div>}
    </div> : <div className="alert info"><Icon n="info" /><span>{t("ask_admin")}</span></div>}
  </div></div></div>;
}
