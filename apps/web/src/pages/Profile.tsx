import { setRtPrefs } from "../lib/realtime.ts";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, put } from "../lib/api.ts";
import { PageHead, Spinner, toast, toastErr, Switch } from "../components/ui.tsx";
import { useMe, useInvalidateMe } from "../lib/auth.ts";

export default function Profile() {
  const { t, rel } = useT(); const { data: me } = useMe(); const inv = useInvalidateMe(); const qc = useQueryClient();
  const { data: sessions } = useQuery({ queryKey: ["sessions"], queryFn: () => get("/api/auth/sessions") });
  const [mfa, setMfa] = useState<{ secret: string; uri: string } | null>(null); const [code, setCode] = useState(""); const [pw, setPw] = useState({ current: "", password: "" });
  if (!me?.user) return <Spinner />;
  return <><PageHead title={t("profile")} sub={me.user.email} />
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><div className="hd"><h2 className="grow">{t("mfa_title")}</h2><span className={"bdg " + (me.user.mfaEnabled ? "ok" : "warn")}>{t(me.user.mfaEnabled ? "mfa_on" : "mfa_off")}</span></div><div className="bd col">
        {!me.user.mfaEnabled && !mfa && <button className="btn pri" style={{ alignSelf: "flex-start" }} onClick={async () => setMfa(await post("/api/auth/mfa/setup"))}>{t("mfa_enable")}</button>}
        {mfa && <><p className="small muted" style={{ margin: 0 }}>{t("mfa_scan")}</p><div className="code" style={{ fontSize: 15, letterSpacing: ".1em" }}>{mfa.secret}</div><a className="small" href={mfa.uri}>otpauth:// →</a>
          <div className="row"><input className="inp" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn pri" onClick={async () => { try { await post("/api/auth/mfa/enable", { code }); setMfa(null); setCode(""); inv(); toast(t("saved")); } catch (e) { toastErr(e); } }}>{t("confirm")}</button></div></>}
        {me.user.mfaEnabled && <div className="row"><input className="inp" inputMode="numeric" placeholder={t("mfa_code")} value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn danger" onClick={async () => { try { await post("/api/auth/mfa/disable", { code }); setCode(""); inv(); } catch (e) { toastErr(e); } }}>{t("mfa_disable")}</button></div>}
      </div></div>
      <div className="card"><div className="hd"><h2 className="grow">{t("change_pw")}</h2></div><div className="bd col">
        <label className="f">{t("current_pw")}<input className="inp" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
        <label className="f">{t("new_pw")}<input className="inp" type="password" minLength={10} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></label>
        <button className="btn pri" style={{ alignSelf: "flex-start" }} onClick={async () => { try { await post("/api/auth/password/change", pw); setPw({ current: "", password: "" }); toast(t("saved")); } catch (e) { toastErr(e); } }}>{t("save")}</button></div></div>
      <div className="card" style={{ gridColumn: "1/-1" }}><div className="hd"><h2 className="grow">{t("sessions")}</h2><button className="btn sm" onClick={async () => { await post("/api/auth/sessions/revoke-others"); qc.invalidateQueries({ queryKey: ["sessions"] }); toast(t("saved")); }}>{t("revoke_others")}</button></div>
        <div className="twrap"><table className="tbl"><tbody>{sessions?.map((s: any) => <tr key={s.id}><td className="small">{s.userAgent?.slice(0, 80)}</td><td className="small muted">{s.ip}</td><td className="small muted">{rel(s.lastSeenAt)}</td><td>{s.current && <span className="bdg ok">{t("this_device")}</span>}</td></tr>)}</tbody></table></div></div>
    </div>
    <NotifyPrefs /></>;
}

function NotifyPrefs() {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notify-prefs"], queryFn: () => get("/api/me/notify-prefs") });
  if (!data) return null;
  const p = data.prefs ?? {};
  const save = async (b: any) => { try { const r = await put("/api/me/notify-prefs", b); setRtPrefs(r.prefs); qc.invalidateQueries({ queryKey: ["notify-prefs"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  const perm = typeof Notification !== "undefined" ? Notification.permission : "denied";
  return <div className="card" style={{ marginTop: 14 }}><div className="hd"><h2 className="grow">🔔 {t("notify_prefs")}</h2></div><div className="bd col" style={{ gap: 12 }}>
    <div className="row wrap" style={{ gap: 18 }}>
      <Switch checked={!!p.browser && perm === "granted"} onChange={async (v) => { if (v && perm !== "granted") { const r = await Notification.requestPermission(); if (r !== "granted") { toastErr(new Error(t("browser_notif_denied"))); return; } } save({ browser: v }); }} label={t("browser_notif")} />
      <Switch checked={!!p.sound} onChange={(v) => save({ sound: v })} label={t("notif_sound")} />
      <Switch checked={!!p.digest} onChange={(v) => save({ digest: v })} label={t("daily_digest")} />
    </div>
    <div className="twrap"><table className="tbl"><thead><tr><th>{t("event")}</th><th style={{ width: 110 }}>{t("in_app")}</th><th style={{ width: 110 }}>{t("email")}</th></tr></thead><tbody>
      {(data.types as string[]).map((k) => <tr key={k}><td className="small">{t("nt_" + k.replace(".", "_"))}</td>
        <td><Switch checked={p.inApp?.[k] !== false} onChange={(v) => save({ inApp: { ...(p.inApp ?? {}), [k]: v } })} /></td>
        <td><Switch checked={p.email?.[k] ?? !!data.emailDefaults[k]} onChange={(v) => save({ email: { ...(p.email ?? {}), [k]: v } })} /></td></tr>)}
    </tbody></table></div>
    <p className="tiny muted" style={{ margin: 0 }}>{t("notify_prefs_hint")}</p>
  </div></div>;
}
