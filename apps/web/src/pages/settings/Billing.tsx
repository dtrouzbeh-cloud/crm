import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, post } from "../../lib/api.ts";
import { Spinner, toastErr } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { minor } from "../../lib/format.tsx";

export default function BillingTab() {
  const { t, money, date } = useT();
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => get("/api/billing") });
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly"); const [seats, setSeats] = useState(5);
  if (!data) return <Spinner />;
  const s = data.subscription, u = data.usage, L = s?.limits ?? {};
  const price = (p: any) => { const extra = Math.max(0, seats - p.includedSeats), m = p.clinicPriceMinor + extra * p.seatPriceMinor; return period === "yearly" ? Math.round(m * 12 * (1 - p.yearlyDiscountBps / 10000)) : m; };
  const bar = (used: number, lim: number) => <div className="prog" style={{ marginTop: 4 }}><i style={{ width: lim > 0 ? Math.min(100, (100 * used) / lim) + "%" : "8%", background: lim > 0 && used >= lim ? "var(--err)" : undefined }} /></div>;
  const trialLeft = s?.trialEndsAt ? Math.ceil((new Date(s.trialEndsAt).getTime() - Date.now()) / 86400000) : null;
  return <div className="col" style={{ gap: 14 }}>
    <div className="card pad"><div className="row wrap" style={{ gap: 16 }}><div className="grow"><div className="small muted">{t("current_plan")}</div><h2 style={{ fontSize: 20 }}>{s?.planName} <span className={"bdg " + (s?.status === "active" ? "ok" : "warn")}>{t("sub_" + s?.status)}</span></h2>
      {s?.status === "trialing" && trialLeft != null && <div className="small" style={{ color: trialLeft <= 3 ? "var(--err)" : "var(--muted)" }}>{t("trial_left", { n: Math.max(0, trialLeft) })}</div>}
      {s?.currentPeriodEnd && <div className="small muted">{t("renews")}: {date(s.currentPeriodEnd)}</div>}</div>
      {s?.providerCustomerId && <button className="btn" onClick={async () => { try { location.href = (await post("/api/billing/portal")).url; } catch (e) { toastErr(e); } }}><Icon n="card" />{t("manage_billing")}</button>}</div>
      <div className="grid g4" style={{ marginTop: 14 }}>
        <div><div className="small muted">{t("seats")}</div><b>{u.seats} / {s?.seats}</b>{bar(u.seats, s?.seats ?? 0)}</div>
        <div><div className="small muted">{t("quotes_month")}</div><b>{u.quotesMonth} / {L.quotesPerMonth > 0 ? L.quotesPerMonth : "∞"}</b>{bar(u.quotesMonth, L.quotesPerMonth)}</div>
        <div><div className="small muted">WhatsApp</div><b>{u.waNumbers} / {L.waNumbers > 0 ? L.waNumbers : "∞"}</b>{bar(u.waNumbers, L.waNumbers)}</div>
        <div><div className="small muted">{t("storage")}</div><b>{(Number(u.storageBytes) / 1e9).toFixed(2)} / {L.storageGb ?? "∞"} GB</b>{bar(Number(u.storageBytes) / 1e9, L.storageGb ?? 0)}</div></div></div>
    <div className="row wrap"><div className="seg">{(["monthly", "yearly"] as const).map((p) => <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>{t("per_" + p)}{p === "yearly" && <span className="bdg ok" style={{ marginInlineStart: 6 }}>-17%</span>}</button>)}</div>
      <label className="row small" style={{ gap: 6 }}>{t("seats")}<input className="inp sm" type="number" min={1} max={500} value={seats} style={{ width: 70 }} onChange={(e) => setSeats(Math.max(1, +e.target.value || 1))} /></label></div>
    <div className="grid g3">{data.plans.map((p: any) => <div key={p.id} className="card pad" style={p.id === s?.planId ? { borderColor: "var(--brand)", boxShadow: "0 0 0 1px var(--brand)" } : undefined}>
      <h3>{p.name}</h3><div style={{ fontSize: 26, fontWeight: 750, margin: "6px 0" }}>{money(minor(price(p)), p.currency)}<span className="small muted"> / {t(period === "yearly" ? "year" : "month")}</span></div>
      <div className="small muted">{money(minor(p.clinicPriceMinor), p.currency)} {t("clinic_fee")} + {money(minor(p.seatPriceMinor), p.currency)} / {t("seat")} ({p.includedSeats} {t("included_seats")})</div>
      <ul className="small" style={{ paddingInlineStart: 18, margin: "10px 0" }}><li>{p.limits.quotesPerMonth > 0 ? p.limits.quotesPerMonth : "∞"} {t("quotes_month")}</li><li>{p.limits.waNumbers > 0 ? p.limits.waNumbers : "∞"} WhatsApp</li>{p.features.map((f: string) => <li key={f}>{t("feat_" + f)}</li>)}</ul>
      <button className="btn pri" style={{ width: "100%" }} disabled={!data.stripe} onClick={async () => { try { location.href = (await post("/api/billing/checkout", { planId: p.id, period, seats })).url; } catch (e) { toastErr(e); } }}>{p.id === s?.planId && s?.status === "active" ? t("change_plan") : t("choose_plan")}</button></div>)}</div>
    {!data.stripe && <div className="alert info"><Icon n="info" /><span>{t("billing_offline")}</span></div>}
  </div>;
}
