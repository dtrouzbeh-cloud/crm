// Ayarlar → Kurulum: dış servis anahtarları (şifreli saklanır, geri okunmaz, test edilir) + kurulum kontrol listesi
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, put, post } from "../../lib/api.ts";
import { Spinner, toast, toastErr, confirmBox } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { useVoice } from "../../components/Calls.tsx";

const KEYS: { name: string; icon: string; fields: { k: string; ph: string; type?: string; opts?: string[] }[]; docs: string }[] = [
  { name: "anthropic", icon: "✨", fields: [{ k: "key", ph: "sk-ant-api03-…", type: "password" }], docs: "https://console.anthropic.com/settings/keys" },
  { name: "stt", icon: "🎤", fields: [{ k: "provider", ph: "", opts: ["openai", "deepgram", "elevenlabs"] }, { k: "key", ph: "API key", type: "password" }], docs: "https://platform.openai.com/api-keys" },
  { name: "resend", icon: "✉️", fields: [{ k: "key", ph: "re_…", type: "password" }, { k: "from", ph: "info@klinik.com" }], docs: "https://resend.com/api-keys" },
  { name: "twilio", icon: "📞", fields: [{ k: "sid", ph: "AC…" }, { k: "token", ph: "Auth token", type: "password" }, { k: "number", ph: "+90…" }], docs: "https://console.twilio.com" },
];

export default function SetupTab() {
  const { t, rel } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["setup"], queryFn: () => get("/api/setup") }); const { data: voice } = useVoice();
  const [f, setF] = useState<Record<string, Record<string, string>>>({}); const [busy, setBusy] = useState(""); const [res, setRes] = useState<Record<string, { ok: boolean; message: string }>>({});
  if (!data) return <Spinner />;
  const r = () => { qc.invalidateQueries({ queryKey: ["setup"] }); qc.invalidateQueries({ queryKey: ["ai-agent"] }); qc.invalidateQueries({ queryKey: ["voice-config"] }); };
  const save = async (name: string) => { setBusy(name); try { await put(`/api/setup/keys/${name}`, f[name] ?? {}); setF({ ...f, [name]: {} }); r(); toast(t("saved")); } catch (e) { toastErr(e); } finally { setBusy(""); } };
  const test = async (name: string) => { setBusy(name + "t"); try { setRes({ ...res, [name]: await post(`/api/setup/keys/${name}/test`, {}) }); } catch (e) { toastErr(e); } finally { setBusy(""); } };
  const remove = async (name: string) => { if (!(await confirmBox(t("remove"), t("key_" + name), t("remove"), true))) return; await put(`/api/setup/keys/${name}`, { remove: true }); r(); };
  const done = (data.checklist as any[]).filter((x) => x.done).length, total = data.checklist.length;
  return <div className="col" style={{ gap: 14 }}>
    <div className="alert info"><Icon n="info" /><span>{t("setup_hint")}</span></div>
    <div className="grid g2" style={{ gap: 14, alignItems: "start" }}>
      <div className="col" style={{ gap: 12 }}>{KEYS.map((K) => { const st = data.keys[K.name]; const configured = st.clinic || st.platform;
        return <div key={K.name} className="card pad col" style={{ gap: 8 }}>
          <div className="row wrap" style={{ gap: 8 }}><b>{K.icon} {t("key_" + K.name)}</b>
            <span className={"bdg " + (st.clinic ? "ok" : st.platform ? "info" : "err")}>{st.clinic ? t("key_clinic") : st.platform ? t("key_platform") : t("key_missing")}</span>
            {st.provider && <span className="bdg">{st.provider}</span>}{st.from && <span className="tiny muted">{st.from}</span>}{st.number && <span className="tiny muted">{st.number}</span>}
            <span className="grow" />{st.updatedAt && <span className="tiny faint">{rel(st.updatedAt)}</span>}</div>
          <div className="tiny muted">{t("key_" + K.name + "_hint")} <a href={K.docs} target="_blank" rel="noopener">{t("get_key")} ↗</a></div>
          <div className="row wrap" style={{ gap: 6 }}>{K.fields.map((fl) => fl.opts ? <select key={fl.k} className="inp sm" style={{ width: "auto" }} value={f[K.name]?.[fl.k] ?? st.provider ?? fl.opts[0]} onChange={(e) => setF({ ...f, [K.name]: { ...(f[K.name] ?? {}), [fl.k]: e.target.value } })}>{fl.opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : <input key={fl.k} className="inp sm" style={{ flex: fl.type === "password" ? 2 : 1, minWidth: 140 }} type={fl.type ?? "text"} placeholder={fl.ph} autoComplete="off" value={f[K.name]?.[fl.k] ?? ""} onChange={(e) => setF({ ...f, [K.name]: { ...(f[K.name] ?? {}), [fl.k]: e.target.value.trim() } })} />)}
            <button className="btn sm pri" disabled={busy === K.name || !Object.values(f[K.name] ?? {}).some((v) => v && !["openai", "deepgram", "elevenlabs"].includes(v))} onClick={() => save(K.name)}>{t("save")}</button>
            {configured && <button className="btn sm" disabled={busy === K.name + "t"} onClick={() => test(K.name)}>{busy === K.name + "t" ? "…" : t("test_connection")}</button>}
            {st.clinic && <button className="btn sm ghost danger" onClick={() => remove(K.name)}><Icon n="trash" /></button>}</div>
          {K.name === "twilio" && st.clinic && voice?.inboundUrl && <div className="tiny muted">{t("voice_inbound_hint")}<div className="code" style={{ userSelect: "all", marginTop: 4 }}>{voice.inboundUrl}</div>{!voice.myPhone && <div style={{ color: "var(--warn)", marginTop: 4 }}>⚠️ {t("voice_need_my_phone")}</div>}</div>}
          {res[K.name] && <div className={"alert " + (res[K.name]!.ok ? "ok" : "err")} style={{ padding: "6px 10px" }}><span className="small">{res[K.name]!.ok ? "✓ " : "✕ "}{res[K.name]!.message}</span></div>}
        </div>; })}</div>
      <div className="card"><div className="hd"><h3 className="grow">✅ {t("setup_checklist")}</h3><span className="bdg brand">{done}/{total}</span></div>
        <div className="bd" style={{ paddingTop: 0 }}><div className="prog" style={{ height: 6, marginBottom: 10 }}><i style={{ width: (100 * done) / total + "%" }} /></div>
          <div className="col" style={{ gap: 2 }}>{(data.checklist as any[]).map((x) => <Link key={x.key} href={x.link} className="row small" style={{ gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)", color: "inherit", opacity: x.done ? 0.65 : 1 }}>
            <span style={{ width: 20 }}>{x.done ? "✅" : "⬜"}</span><span className="grow" style={{ textDecoration: x.done ? "line-through" : undefined }}>{t("cl_" + x.key)}</span>{!x.done && <Icon n="next" size={14} />}</Link>)}</div></div></div>
    </div>
  </div>;
}
