import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, qs } from "../lib/api.ts";
import { PageHead, Spinner } from "../components/ui.tsx";
import { minor } from "../lib/format.tsx";
import { RoasReport } from "../components/AdsPanels.tsx";
import { SalesPerformance } from "../components/SalesPerf.tsx";
import { ObjectionsCard, LossReportCard } from "../components/AiReports.tsx";

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
export default function Reports() {
  const { t, money } = useT();
  const [days, setDays] = useState(90); const [by, setBy] = useState("source");
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = useQuery({ queryKey: ["reports", days, by], queryFn: () => get("/api/reports" + qs({ from, by })) });
  if (!data) return <Spinner />;
  const k = data.kpi, maxB = Math.max(1, ...data.breakdown.map((r: any) => r.leads));
  const funnel: [string, number][] = [["f_leads", k.leads], ["f_contacted", k.contacted], ["f_cases", k.cases], ["f_quoted", k.quoted], ["f_won", k.won]];
  const qd = data.quotes, qTot = Object.values(qd as Record<string, number>).reduce((a, b) => a + b, 0);
  const revByMonth: Record<string, Record<string, number>> = {}; data.revenue.forEach((r: any) => ((revByMonth[r.month] ??= {})[r.currency] = minor(r.total)));
  const curs = [...new Set(data.revenue.map((r: any) => r.currency))] as string[]; const maxRev = Math.max(1, ...data.revenue.map((r: any) => minor(r.total)));
  return <><PageHead title={t("nav_analytics")} sub={t("reports_sub")} actions={<div className="seg">{[30, 90, 180, 365].map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}g</button>)}</div>} />
    <div className="grid g4" style={{ marginBottom: 14 }}>
      <div className="card kpi"><span className="l">{t("f_leads")}</span><span className="v num">{k.leads}</span></div>
      <div className="card kpi"><span className="l">{t("conv_rate")}</span><span className="v num">{pct(k.won, k.leads)}%</span><span className="d muted">{k.won} {t("f_won").toLowerCase()}</span></div>
      <div className="card kpi"><span className="l">{t("first_response")}</span><span className="v num">{k.medianResponseMin != null ? Math.round(k.medianResponseMin) + " dk" : "—"}</span><span className="d muted">{pct(k.withinHour, k.contacted)}% &lt; 1 saat</span></div>
      <div className="card kpi"><span className="l">{t("k_acc")}</span><span className="v num">{pct(qd.accepted ?? 0, (qd.accepted ?? 0) + (qd.declined ?? 0) + (qd.expired ?? 0))}%</span><span className="d muted">{qTot} {t("nav_quotes").toLowerCase()}</span></div></div>
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><div className="hd"><h3 className="grow">{t("funnel")}</h3></div><div className="bd col">{funnel.map(([l, n], i) => <div key={l}><div className="row small"><span className="grow">{t(l)}</span><b className="num">{n}</b><span className="tiny muted" style={{ width: 44, textAlign: "end" }}>{i ? pct(n, funnel[i - 1]![1]) + "%" : ""}</span></div><div className="prog"><i style={{ width: pct(n, k.leads) + "%" }} /></div></div>)}</div></div>
      <div className="card"><div className="hd"><h3 className="grow">{t("breakdown")}</h3><select className="inp sm" style={{ width: "auto" }} value={by} onChange={(e) => setBy(e.target.value)}>{["source", "campaign", "country", "owner", "language"].map((b) => <option key={b} value={b}>{t("by_" + b)}</option>)}</select></div>
        <div className="twrap" style={{ maxHeight: 340 }}><table className="tbl"><thead><tr><th /><th className="r">{t("f_leads")}</th><th className="r">{t("f_quoted")}</th><th className="r">{t("f_won")}</th><th className="r">%</th></tr></thead><tbody>
          {data.breakdown.map((r: any) => <tr key={r.key}><td><div className="small" style={{ fontWeight: 600 }}>{by === "source" ? t("src_" + r.key) : r.key}</div><div className="prog" style={{ height: 4 }}><i style={{ width: (100 * r.leads) / maxB + "%" }} /></div></td><td className="r num">{r.leads}</td><td className="r num">{r.quoted}</td><td className="r num">{r.won}</td><td className="r num">{pct(r.won, r.leads)}%</td></tr>)}</tbody></table></div></div>
      {curs.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("revenue_12m")}</h3></div><div className="bd"><div className="row" style={{ alignItems: "flex-end", gap: 6, height: 160 }}>{Object.entries(revByMonth).map(([m, v]) => <div key={m} className="col grow" style={{ alignItems: "center", gap: 2 }}>
        {curs.map((c, i) => <div key={c} title={`${c} ${money(v[c] ?? 0, c)}`} style={{ width: "70%", height: Math.max(2, (130 * (v[c] ?? 0)) / maxRev), background: ["var(--brand)", "#F59E0B", "#6366F1"][i % 3], borderRadius: 3 }} />)}<span className="tiny muted">{m.slice(5)}</span></div>)}</div>
        <div className="row tiny muted" style={{ gap: 10 }}>{curs.map((c, i) => <span key={c}><span className="dot" style={{ background: ["var(--brand)", "#F59E0B", "#6366F1"][i % 3] }} /> {c} {money(data.revenue.filter((r: any) => r.currency === c).reduce((a: number, r: any) => a + minor(r.total), 0), c)}</span>)}</div></div></div>}
      {data.treatments.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("top_treatments")}</h3></div><div className="twrap"><table className="tbl"><tbody>{data.treatments.map((r: any, i: number) => <tr key={i}><td className="small">{r.name}</td><td className="r num small">× {r.qty}</td><td className="r num"><b>{money(Number(r.total), r.currency)}</b></td></tr>)}</tbody></table></div></div>}
      {data.reps.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("team_perf")}</h3></div><div className="twrap"><table className="tbl"><thead><tr><th /><th className="r">{t("f_leads")}</th><th className="r">{t("f_won")}</th><th className="r">{t("first_response")}</th><th className="r">{t("activities")}</th></tr></thead><tbody>
        {data.reps.map((r: any) => <tr key={r.name}><td><b className="small">{r.name}</b></td><td className="r num">{r.leads}</td><td className="r num">{r.won}</td><td className="r num">{r.medianResponseMin != null ? Math.round(r.medianResponseMin) + " dk" : "—"}</td><td className="r num">{r.activities}</td></tr>)}</tbody></table></div></div>}
      {data.lost.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("loss_reasons")}</h3></div><div className="bd col">{data.lost.map((r: any) => <div key={r.reason} className="row small"><span className="grow">{t("lr_" + r.reason) !== "lr_" + r.reason ? t("lr_" + r.reason) : r.reason}</span><b>{r.n}</b></div>)}</div></div>}
    </div><SalesPerformance />
    <ObjectionsCard />
    <LossReportCard />
    <RoasReport />
  </>;
}
