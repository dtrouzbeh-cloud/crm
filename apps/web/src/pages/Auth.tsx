import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, ApiError } from "../lib/api.ts";
import { Icon } from "../components/Icon.tsx";
import { LANG_NAMES } from "@dentaflow/core/i18n";

function AuthCard({ title, children, foot }: { title: string; children: ReactNode; foot?: ReactNode }) {
  const { lang, setLang } = useT();
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "linear-gradient(160deg,var(--brand-soft),var(--bg) 60%)" }}>
    <div style={{ width: "min(420px,100%)" }}>
      <div className="row between" style={{ marginBottom: 18 }}><div className="logo" style={{ padding: 0 }}><i><Icon n="tooth" /></i><span>Denta<b>Flow</b></span></div>
        <select className="inp sm" style={{ width: "auto" }} value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="card pad" style={{ padding: 24 }}><h1 style={{ marginBottom: 16 }}>{title}</h1>{children}</div>
      {foot && <div className="small muted" style={{ textAlign: "center", marginTop: 14 }}>{foot}</div>}
    </div></div>;
}
const Err = ({ e }: { e: string | null }) => e ? <div className="alert err"><Icon n="alert" /><span>{e}</span></div> : null;

export function Login() {
  const { t } = useT(); const qc = useQueryClient(); const [, nav] = useLocation();
  const [f, setF] = useState({ email: "", password: "", code: "" }); const [mfa, setMfa] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await post("/api/auth/login", { email: f.email, password: f.password, code: mfa ? f.code : undefined });
      if (r.mfaRequired) { setMfa(true); return; } await qc.invalidateQueries({ queryKey: ["me"] }); nav("/");
    } catch (ex) { setErr((ex as ApiError).message); } finally { setBusy(false); }
  };
  return <AuthCard title={t("login_t")} foot={<>{t("no_account")} <Link href="/signup">{t("start_trial")}</Link></>}>
    <form className="col" style={{ gap: 12 }} onSubmit={submit}>
      <Err e={err} />
      {!mfa ? <><label className="f">{t("email")}<input className="inp" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus /></label>
        <label className="f">{t("password")}<input className="inp" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label></>
        : <label className="f">{t("mfa_code")}<input className="inp" inputMode="numeric" autoComplete="one-time-code" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoFocus /><span className="tiny muted">{t("mfa_hint")}</span></label>}
      <button className="btn pri" style={{ height: 42 }} disabled={busy}>{t("login_t")}</button>
      <Link href="/forgot" className="small" style={{ textAlign: "center" }}>{t("forgot")}</Link>
    </form></AuthCard>;
}

export function Signup() {
  const { t, lang } = useT(); const qc = useQueryClient(); const [, nav] = useLocation();
  const [f, setF] = useState({ clinicName: "", name: "", email: "", password: "", country: "TR", currency: "EUR" }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await post("/api/auth/signup", { ...f, language: lang }); await qc.invalidateQueries({ queryKey: ["me"] }); nav("/"); }
    catch (ex) { const a = ex as ApiError; setErr(a.details ? Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(" · ") : a.message); } finally { setBusy(false); }
  };
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return <AuthCard title={t("signup_t")} foot={<>{t("have_account")} <Link href="/login">{t("login_t")}</Link></>}>
    <form className="col" style={{ gap: 12 }} onSubmit={submit}>
      <Err e={err} />
      <label className="f">{t("clinic_name")}<input className="inp" required value={f.clinicName} onChange={set("clinicName")} autoFocus /></label>
      <label className="f">{t("your_name")}<input className="inp" required value={f.name} onChange={set("name")} /></label>
      <label className="f">{t("email")}<input className="inp" type="email" required value={f.email} onChange={set("email")} /></label>
      <label className="f">{t("password")}<input className="inp" type="password" minLength={10} required value={f.password} onChange={set("password")} /><span className="tiny muted">{t("pw_min")}</span></label>
      <div className="grid g2"><label className="f">{t("country")}<select className="inp" value={f.country} onChange={set("country")}>{["TR", "GB", "DE", "NL", "AE", "HU", "PL", "MX", "TH", "ES", "AL"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">{t("def_currency")}<select className="inp" value={f.currency} onChange={set("currency")}>{["EUR", "USD", "GBP", "TRY"].map((c) => <option key={c}>{c}</option>)}</select></label></div>
      <button className="btn pri" style={{ height: 42 }} disabled={busy}>{t("start_trial")}</button>
    </form></AuthCard>;
}

export function InviteAccept() {
  const { t } = useT(); const { token } = useParams<{ token: string }>(); const qc = useQueryClient(); const [, nav] = useLocation();
  const { data, error } = useQuery({ queryKey: ["invite", token], queryFn: () => get(`/api/invites/${token}`), retry: false });
  const [f, setF] = useState({ name: "", password: "" }); const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(null);
    try { await post(`/api/invites/${token}/accept`, f); await qc.invalidateQueries({ queryKey: ["me"] }); nav("/"); } catch (ex) { setErr((ex as Error).message); } };
  if (error) return <AuthCard title={t("accept_invite")}><Err e={(error as Error).message} /></AuthCard>;
  if (!data) return null;
  return <AuthCard title={t("accept_invite")}>
    <p className="muted" style={{ marginTop: -6 }}>{t("invited_to", { clinic: data.clinicName })} · <b>{t("role_" + data.role)}</b></p>
    <form className="col" style={{ gap: 12 }} onSubmit={submit}><Err e={err} />
      <div className="small">{data.email}</div>
      {!data.hasAccount && <label className="f">{t("your_name")}<input className="inp" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>}
      <label className="f">{t("password")}<input className="inp" type="password" minLength={10} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      <button className="btn pri" style={{ height: 42 }}>{t("accept_invite")}</button></form></AuthCard>;
}

export function Forgot() {
  const { t } = useT(); const [email, setEmail] = useState(""); const [sent, setSent] = useState(false);
  return <AuthCard title={t("forgot")} foot={<Link href="/login">{t("login_t")}</Link>}>
    {sent ? <div className="alert ok"><Icon n="ok" /><span>{t("email")} ✓</span></div> :
      <form className="col" style={{ gap: 12 }} onSubmit={async (e) => { e.preventDefault(); await post("/api/auth/password/forgot", { email }); setSent(true); }}>
        <label className="f">{t("email")}<input className="inp" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><button className="btn pri">{t("send")}</button></form>}
  </AuthCard>;
}
export function Reset() {
  const { t } = useT(); const token = new URLSearchParams(location.search).get("token") ?? ""; const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [, nav] = useLocation();
  return <AuthCard title={t("change_pw")}><form className="col" style={{ gap: 12 }} onSubmit={async (e) => { e.preventDefault(); try { await post("/api/auth/password/reset", { token, password: pw }); nav("/login"); } catch (ex) { setErr((ex as Error).message); } }}>
    <Err e={err} /><label className="f">{t("new_pw")}<input className="inp" type="password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} /></label><button className="btn pri">{t("save")}</button></form></AuthCard>;
}
