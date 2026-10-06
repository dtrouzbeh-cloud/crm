import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, put, post } from "../../lib/api.ts";
import { Spinner, toast, toastErr, Switch } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";

export default function PaymentsTab() {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["payprov"], queryFn: () => get("/api/payment-providers") });
  if (!data) return <Spinner />;
  return <div className="col" style={{ gap: 12 }}>
    <div className="alert info"><Icon n="info" /><span>{t("pay_explain")}</span></div>
    {data.available.map((p: any) => <ProviderCard key={p.id} p={p} row={data.connected.find((c: any) => c.provider === p.id)} onSaved={() => qc.invalidateQueries({ queryKey: ["payprov"] })} />)}
  </div>;
}
function ProviderCard({ p, row, onSaved }: { p: any; row: any; onSaved: () => void }) {
  const { t } = useT(); const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ mode: row?.mode ?? "test", active: row?.active ?? true, credentials: {}, config: row?.config ?? {} });
  const [hook, setHook] = useState<string | null>(null);
  const save = async () => { try { const r = await put(`/api/payment-providers/${p.id}`, f); setHook(r.webhookUrl); onSaved(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const cfg = (k: string, label: string) => <label className="f">{label}<input className="inp sm" value={f.config[k] ?? ""} onChange={(e) => setF({ ...f, config: { ...f.config, [k]: e.target.value } })} /></label>;
  return <div className="card"><div className="hd"><h3 className="grow">{t("pm_" + p.id)} <span className="tiny muted">· {p.label}</span></h3>
    {row ? <span className={"bdg " + (row.active ? "ok" : "")}>{row.active ? (row.mode === "live" ? "LIVE" : "TEST") : t("inactive")}</span> : <span className="bdg">{t("not_connected")}</span>}
    <button className="btn sm" onClick={() => setOpen(!open)}>{open ? "▴" : row ? t("edit") : t("connect")}</button></div>
    {open && <div className="bd col">
      {p.fields.length > 0 && <div className="row"><div className="seg">{["test", "live"].map((m) => <button key={m} className={f.mode === m ? "on" : ""} onClick={() => setF({ ...f, mode: m })}>{m.toUpperCase()}</button>)}</div></div>}
      {p.fields.map((fd: any) => <label key={fd.key} className="f">{fd.label}<input className="inp sm" type={fd.secret ? "password" : "text"} placeholder={row?.hasCredentials ? "••••••• (kayıtlı)" : ""} onChange={(e) => setF({ ...f, credentials: { ...f.credentials, [fd.key]: e.target.value } })} /></label>)}
      {p.id === "bank_transfer" && <div className="grid g2">{cfg("accountName", t("account_name"))}{cfg("bankName", t("bank_name"))}{cfg("iban", "IBAN")}{cfg("swift", "SWIFT / BIC")}</div>}
      {p.id === "payment_link" && cfg("url", t("payment_link_url"))}
      <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={t("active")} />
      <div className="row"><button className="btn pri" onClick={save}>{t("save")}</button>{row && p.fields.length > 0 && <button className="btn" onClick={async () => { const r = await post(`/api/payment-providers/${p.id}/test`); toast((r.ok ? "✓ " : "✗ ") + (r.message ?? "")); }}>{t("test_connection")}</button>}</div>
      {(hook || p.id === "stripe") && <div className="small muted">Webhook URL: <span className="code">{hook ?? location.origin + "/api/public/pay/stripe/webhook"}</span> · event: checkout.session.completed</div>}
    </div>}</div>;
}
