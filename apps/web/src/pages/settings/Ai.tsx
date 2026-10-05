// Ayarlar → Yapay zekâ: anahtar ve limit, ajan modu/kanallar/talimatlar/fiyat politikası/saatler, bilgi tabanı, test sohbeti, kullanım
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, post, put, patch, del } from "../../lib/api.ts";
import { Spinner, toast, toastErr, Switch } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";

export default function AiTab() {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ai-agent"], queryFn: () => get("/api/ai/agent") });
  const [d, setD] = useState<any>(null); const [key, setKey] = useState("");
  if (!data) return <Spinner />;
  const a = d ?? data.agent; const set = (p: any) => setD({ ...a, ...p });
  const r = () => qc.invalidateQueries({ queryKey: ["ai-agent"] });
  const save = async () => { try { await put("/api/ai/agent", { name: a.name, mode: a.mode, channels: a.channels, persona: a.persona ?? null, instructions: a.instructions ?? null, pricePolicy: a.pricePolicy, hours: a.hours ?? {}, active: true }); setD(null); r(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const k = data.key;
  return <div className="col" style={{ gap: 14 }}>
    <div className="card pad col" style={{ gap: 8 }}><b>🔑 {t("ai_key")}</b>
      <div className="small">{k.available ? <span className="bdg ok">✓ {k.clinic ? t("ai_key_clinic") : k.mock ? t("ai_key_mock") : t("ai_key_platform")}</span> : <span className="bdg err">{t("ai_key_none")}</span>}</div>
      <div className="row" style={{ gap: 8 }}><input className="inp sm" style={{ maxWidth: 360 }} type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="btn sm" disabled={!key} onClick={async () => { try { await put("/api/ai/key", { key }); setKey(""); r(); toast(t("saved")); } catch (e) { toastErr(e); } }}>{t("save")}</button>
        {k.clinic && <button className="btn sm ghost danger" onClick={async () => { await put("/api/ai/key", { key: null }); r(); }}>{t("remove")}</button>}</div>
      <div className="row small" style={{ gap: 8 }}>{t("ai_monthly_cap")} $<input className="inp sm num" style={{ width: 90 }} type="number" min={0} defaultValue={data.cap ?? ""} placeholder="—" onBlur={async (e) => { await put("/api/ai/key", { key: undefined, monthlyCapUsd: e.target.value ? +e.target.value : null }); r(); }} />
        <span className="muted">{t("this_month")}: {data.usage.calls} {t("ai_calls")} · ${data.usage.costUsd.toFixed(2)}</span></div>
      <p className="tiny muted" style={{ margin: 0 }}>{t("ai_key_hint")}</p></div>

    <div className="card pad col" style={{ gap: 10 }}><div className="row"><b className="grow">🤖 {t("ai_agent")}</b><button className="btn sm pri" disabled={!d} onClick={save}>{t("save")}</button></div>
      <div className="grid g2" style={{ gap: 10 }}>
        <label className="f">{t("ai_name")}<input className="inp sm" value={a.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="f">{t("ai_mode")}<select className="inp sm" value={a.mode} onChange={(e) => set({ mode: e.target.value })}>{["off", "assist", "auto_offhours", "auto_always"].map((m) => <option key={m} value={m}>{t("aim_" + m)}</option>)}</select></label>
        <div className="f">{t("channels")}<div className="row wrap" style={{ gap: 6 }}>{["whatsapp", "instagram", "messenger", "web", "email"].map((ch) => <label key={ch} className="row small" style={{ gap: 4, opacity: ch === "email" ? 0.5 : 1 }} title={ch === "email" ? t("coming_soon") : ""}>
          <input type="checkbox" disabled={ch === "email"} checked={a.channels.includes(ch)} onChange={(e) => set({ channels: e.target.checked ? [...a.channels, ch] : a.channels.filter((x: string) => x !== ch) })} />{ch}</label>)}</div></div>
        <label className="f">{t("ai_price_policy")}<select className="inp sm" value={a.pricePolicy} onChange={(e) => set({ pricePolicy: e.target.value })}>{["none", "ranges", "packages"].map((m) => <option key={m} value={m}>{t("pp_" + m)}</option>)}</select></label>
        {a.mode === "auto_offhours" && <div className="f" style={{ gridColumn: "1/-1" }}>{t("ai_work_hours")}<div className="row small" style={{ gap: 6 }}>
          <input className="inp sm num" style={{ width: 60 }} type="number" min={0} max={23} value={a.hours?.start ?? 9} onChange={(e) => set({ hours: { ...a.hours, start: +e.target.value } })} />–<input className="inp sm num" style={{ width: 60 }} type="number" min={1} max={24} value={a.hours?.end ?? 19} onChange={(e) => set({ hours: { ...a.hours, end: +e.target.value } })} />
          {[1, 2, 3, 4, 5, 6, 0].map((dd) => { const days = a.hours?.days ?? [1, 2, 3, 4, 5, 6]; return <label key={dd} className="row" style={{ gap: 2 }}><input type="checkbox" checked={days.includes(dd)} onChange={(e) => set({ hours: { ...a.hours, days: e.target.checked ? [...days, dd] : days.filter((x: number) => x !== dd) } })} />{t("wd_" + dd)}</label>; })}</div>
          <span className="tiny muted">{t("ai_offhours_hint")}</span></div>}
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("ai_persona")}<input className="inp sm" placeholder={t("ai_persona_ph")} value={a.persona ?? ""} onChange={(e) => set({ persona: e.target.value })} /></label>
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("ai_instructions")}<textarea className="inp" rows={4} placeholder={t("ai_instructions_ph")} value={a.instructions ?? ""} onChange={(e) => set({ instructions: e.target.value })} /></label>
      </div>
      <div className="alert info"><Icon n="info" /><span className="small">{t("ai_rules_info")}</span></div></div>

    <div className="grid g2" style={{ gap: 14, alignItems: "start" }}><Kb /><Playground /></div>
  </div>;
}

function Kb() {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ai-kb"], queryFn: () => get<any[]>("/api/ai/kb") });
  const [n, setN] = useState({ title: "", body: "" }); const r = () => qc.invalidateQueries({ queryKey: ["ai-kb"] });
  return <div className="card"><div className="hd"><h3 className="grow">📚 {t("ai_kb")}</h3></div><div className="bd col" style={{ gap: 8 }}>
    <p className="tiny muted" style={{ margin: 0 }}>{t("ai_kb_hint")}</p>
    {(data ?? []).map((k) => <div key={k.id} className="card pad" style={{ padding: 8, opacity: k.active ? 1 : 0.5 }}><div className="row" style={{ gap: 6 }}><Switch checked={k.active} onChange={async (v) => { await patch(`/api/ai/kb/${k.id}`, { active: v }); r(); }} /><b className="small grow">{k.title}</b>
      <button className="btn xs ghost icon danger" onClick={async () => { await del(`/api/ai/kb/${k.id}`); r(); }}><Icon n="x" /></button></div><div className="tiny muted" style={{ whiteSpace: "pre-wrap" }}>{k.body}</div></div>)}
    <input className="inp sm" placeholder={t("ai_kb_title_ph")} value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
    <textarea className="inp" rows={3} placeholder={t("ai_kb_body_ph")} value={n.body} onChange={(e) => setN({ ...n, body: e.target.value })} />
    <button className="btn sm" style={{ alignSelf: "flex-start" }} disabled={!n.title || !n.body} onClick={async () => { try { await post("/api/ai/kb", n); setN({ title: "", body: "" }); r(); } catch (e) { toastErr(e); } }}><Icon n="plus" />{t("add")}</button>
  </div></div>;
}

function Playground() {
  const { t } = useT(); const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [acts, setActs] = useState<any[]>([]);
  const send = async () => { if (!text.trim()) return; const next = [...msgs, { role: "user" as const, content: text }]; setMsgs(next); setText(""); setBusy(true);
    try { const r = await post("/api/ai/test", { messages: next }); setMsgs([...next, { role: "assistant", content: r.text || "…" }]); setActs(r.actions ?? []); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  return <div className="card"><div className="hd"><h3 className="grow">💬 {t("ai_playground")}</h3><button className="btn xs ghost" onClick={() => { setMsgs([]); setActs([]); }}>{t("clear")}</button></div><div className="bd col" style={{ gap: 6 }}>
    <p className="tiny muted" style={{ margin: 0 }}>{t("ai_playground_hint")}</p>
    <div className="col" style={{ gap: 6, maxHeight: 320, overflow: "auto", background: "var(--subtle)", padding: 8, borderRadius: 8, minHeight: 120 }}>
      {msgs.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-start" : "flex-end", maxWidth: "85%", background: m.role === "user" ? "var(--card)" : "var(--brand-soft)", padding: "6px 10px", borderRadius: 10, whiteSpace: "pre-wrap" }} className="small">{m.content}</div>)}
      {busy && <div className="tiny muted">…</div>}</div>
    {acts.length > 0 && <div className="tiny muted">{acts.map((a, i) => <div key={i}>🛠 {a.name}: {JSON.stringify(a.input)}</div>)}</div>}
    <div className="row" style={{ gap: 6 }}><input className="inp sm" placeholder={t("ai_playground_ph")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} /><button className="btn sm pri" disabled={busy} onClick={send}><Icon n="send" /></button></div>
  </div></div>;
}
