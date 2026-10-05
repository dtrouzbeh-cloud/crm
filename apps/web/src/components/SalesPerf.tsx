// Ekip performansı (Raporlar), hedef düzenleme, panoda "hedefim"
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, put, qs } from "../lib/api.ts";
import { Spinner, toast, toastErr } from "./ui.tsx";
import { useCan } from "../lib/auth.ts";
import { QaButton } from "./AiReports.tsx";

export function SalesPerformance() {
  const { t, money } = useT(); const can = useCan(); const qc = useQueryClient();
  const [range, setRange] = useState(0);
  const d = new Date(); const from = new Date(d.getFullYear(), d.getMonth() - range, 1).toISOString().slice(0, 10);
  const { data } = useQuery({ queryKey: ["sales-perf", range], queryFn: () => get("/api/reports/sales" + qs({ from })) });
  if (!data) return <Spinner />;
  const M = (v: number, c = data.currency) => money(Number(v) / 100, c);
  const setTarget = async (userId: string, revenue: number, deals: number) => { try { await put("/api/targets", { userId, month: new Date().toISOString().slice(0, 10), revenueMinor: Math.round(revenue * 100), deals, currency: data.currency }); qc.invalidateQueries({ queryKey: ["sales-perf"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  const ai = Object.fromEntries((data.aiVsHuman as any[]).map((x) => [x.firstContact, x]));
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + "%" : "—");
  return <>
    <div className="card" style={{ marginTop: 14 }}><div className="hd"><h3 className="grow">👥 {t("team_performance")}</h3><div className="seg">{[[0, t("this_month")], [2, "3" + t("mo")], [11, "12" + t("mo")]].map(([v, l]) => <button key={String(v)} className={range === v ? "on" : ""} onClick={() => setRange(v as number)}>{l}</button>)}</div></div>
      <div className="twrap"><table className="tbl"><thead><tr><th>{t("user")}</th><th className="r">Lead</th><th className="r">{t("first_response")}</th><th className="r">{t("f_quoted")}</th><th className="r">Deal</th><th className="r">{t("collected")}</th><th className="r">{t("lost")}</th><th className="r">SLA</th><th className="r">{t("g_overdue")}</th><th>{t("monthly_target")}</th></tr></thead><tbody>
        {(data.reps as any[]).map((r) => { const tr = r.target; const prog = tr?.revenue ? Math.min(100, Math.round((100 * Number(r.collected)) / Number(tr.revenue))) : null;
          return <tr key={r.userId}><td><b className="small">{r.name}</b><div className="tiny muted">{t("role_" + r.role)}</div></td><td className="r num">{r.leads}<div className="tiny faint">{pct(r.contacted, r.leads)}</div></td>
            <td className="r num" style={{ color: r.medianResponseMin != null && r.medianResponseMin > 15 ? "var(--warn)" : undefined }}>{r.medianResponseMin != null ? r.medianResponseMin + " dk" : "—"}</td><td className="r num">{r.quotes}</td><td className="r num"><b>{r.deals}</b></td><td className="r num">{M(r.collected)}</td>
            <td className="r num">{r.lost}</td><td className="r num" style={{ color: r.slaBreaches ? "var(--err)" : undefined }}>{r.slaBreaches}</td><td className="r num" style={{ color: r.overdueTasks ? "var(--warn)" : undefined }}>{r.overdueTasks}</td>
            <td style={{ minWidth: 160 }}>{prog != null && <div><div className="prog" style={{ height: 6 }}><i style={{ width: prog + "%" }} /></div><div className="tiny muted">{prog}% · {M(tr.revenue, tr.currency)} / {tr.deals} deal</div></div>}
              {can("team.manage") && <QaButton userId={r.userId} name={r.name} />}{can("team.manage") && <button className="btn xs ghost" onClick={() => { const rv = prompt(t("target_revenue"), tr ? String(Number(tr.revenue) / 100) : ""); if (rv == null) return; const dl = prompt(t("target_deals"), tr ? String(tr.deals) : "0"); setTarget(r.userId, Number(rv) || 0, Number(dl) || 0); }}>🎯</button>}</td></tr>; })}
      </tbody></table></div></div>
    {(ai.ai || ai.human) && <div className="card" style={{ marginTop: 14 }}><div className="hd"><h3 className="grow">🤖 {t("ai_vs_human")}</h3></div><div className="twrap"><table className="tbl"><thead><tr><th>{t("first_contact")}</th><th className="r">Lead</th><th className="r">{t("first_response")}</th><th className="r">{t("f_quoted")}</th><th className="r">Deal</th></tr></thead><tbody>
      {["ai", "human"].filter((k) => ai[k]).map((k) => <tr key={k}><td>{k === "ai" ? "🤖 AI" : "👤 " + t("human")}</td><td className="r num">{ai[k].leads}</td><td className="r num">{ai[k].medianResponseMin != null ? ai[k].medianResponseMin + " dk" : "—"}</td><td className="r num">{ai[k].quoted} <span className="tiny faint">{pct(ai[k].quoted, ai[k].leads)}</span></td><td className="r num">{ai[k].won} <span className="tiny faint">{pct(ai[k].won, ai[k].leads)}</span></td></tr>)}</tbody></table></div></div>}
  </>;
}

export function MyTarget() {
  const { t, money } = useT();
  const { data } = useQuery({ queryKey: ["my-target"], queryFn: () => get("/api/targets/me") });
  if (!data) return null;
  const rv = Number(data.target.revenueMinor), ac = Number(data.actual.revenue), p = rv ? Math.min(100, Math.round((100 * ac) / rv)) : 0;
  return <div className="card pad row wrap" style={{ marginBottom: 16, gap: 14 }}><span>🎯 <b>{t("monthly_target")}</b></span>
    <div className="grow" style={{ minWidth: 200 }}><div className="prog" style={{ height: 8 }}><i style={{ width: p + "%" }} /></div></div>
    <span className="small"><b className="num">{money(ac / 100, data.target.currency)}</b> / {money(rv / 100, data.target.currency)} · {data.actual.deals}/{data.target.deals} deal</span></div>;
}
