// Teklif dokümanı — hem canlı önizleme hem hasta sayfası hem PDF için tek bileşen
import { useMemo } from "react";
import { chartSVG, legendHTML, vcol } from "@dentaflow/core/chart";
import { toothStates, type Catalog } from "@dentaflow/core/engine";
import { translate, fmtMoney, fmtDate } from "@dentaflow/core/i18n";
import { Icon } from "../../components/Icon.tsx";

export interface DocData {
  number?: string | number | null; version?: number; created?: string | number; draft?: boolean;
  lang: string; currency: string; pricesHidden: boolean; note: string; depositBps: number; visits: number; validUntil: string | number;
  patient: { name: string; country?: string; issue?: string }; clinic: { name: string; legalName?: string; phone?: string; email?: string; website?: string; address?: string; city?: string; color?: string };
  staff?: { dentist?: string | null; coordinator?: string | null }; situation: any; gap: { min: number; max: number };
  options: { name: string; rec: boolean; items: any[]; calc: any; spans: any[]; stays: [number, number][]; implants: boolean }[];
}

export function OptionBlock({ d, op, cat, lang }: { d: DocData; op: DocData["options"][number]; cat: Catalog; lang: string }) {
  const T = (k: string, p?: any) => translate(lang, k, p), M = (v: number) => fmtMoney(v, d.currency, lang), hide = d.pricesHidden, c = op.calc;
  const states = useMemo(() => toothStates(cat, d.situation ?? {}, op.items), [cat, d.situation, op.items]);
  const svg = useMemo(() => chartSVG(states, { spans: op.spans }), [states, op.spans]);
  return <>
    <div className="chartwrap" dangerouslySetInnerHTML={{ __html: svg }} />
    <div className="legend" style={{ color: "#55636D" }} dangerouslySetInnerHTML={{ __html: legendHTML(states, (k: string) => T(k)) }} />
    {c.visits.filter((v: any) => v.lines.length).map((vv: any, i: number) => <div key={vv.v}>
      <div className="vh"><span className="dot" style={{ background: vcol(vv.v) }} />{T("visit_n", { n: vv.v })}<span style={{ fontWeight: 400, color: "#7A8790", fontSize: 11 }}>· {T("stay_days", { a: op.stays[i]?.[0] ?? 1, b: op.stays[i]?.[1] ?? 2 })}</span></div>
      <table><thead><tr><th>{T("treatment")}</th><th>{T("teeth")}</th><th className="r">{T("qty")}</th>{!hide && <><th className="r">{T("unit_price")}</th><th className="r">{T("amount")}</th></>}</tr></thead><tbody>
        {vv.lines.map((l: any, j: number) => <tr key={j}><td><b style={{ fontWeight: 600 }}>{l.nm}</b>{l.br && <div style={{ color: "#7A8790", fontSize: 10.5 }}>{l.br}</div>}</td>
          <td style={{ color: "#55636D" }}>{l.b ? T("package") : l.teeth.length ? l.teeth.join(", ") : l.jaws.length ? l.jaws.map((j: string) => T(j === "u" ? "jaw_u" : "jaw_l")).join(" + ") : "—"}</td>
          <td className="r">{l.qty} <span style={{ color: "#7A8790", fontSize: 10 }}>{l.unitL}</span></td>
          {!hide && <><td className="r">{l.manual && !l.unit ? <span style={{ color: "#B42318" }}>{T("price_tbd")}</span> : M(l.unit)}</td><td className="r"><b>{M(l.total)}</b></td></>}</tr>)}
      </tbody></table></div>)}
    {c.pkg.length > 0 && <><div className="vh">{T("package_incl")}</div><table><tbody>{c.pkg.map((p: any) => <tr key={p.k}><td>{p.nm}</td><td className="r">{hide ? "" : p.free ? <b style={{ color: "var(--c1)" }}>{T("included")}</b> : M(p.total)}</td></tr>)}</tbody></table></>}
    {hide ? <div className="note">{T("prices_soon")}</div> : <>
      <table className="tot" style={{ marginTop: 12, width: "56%", marginInlineStart: "auto" }}><tbody>
        <tr><td>{T("subtotal")}</td><td className="r">{M(c.sub)}</td></tr>
        {c.tierAdj > 0 && <tr><td style={{ color: "var(--c1)" }}>{T("tier_adv", { n: c.tierInfo?.n })}</td><td className="r" style={{ color: "var(--c1)" }}>−{M(c.tierAdj)}</td></tr>}
        {c.disc > 0 && <tr><td style={{ color: "var(--c1)" }}>{T("special_disc", { n: c.discPct })}</td><td className="r" style={{ color: "var(--c1)" }}>−{M(c.disc)}</td></tr>}
        {c.rnd !== 0 && <tr><td style={{ color: "#7A8790" }}>{T("rounding")}</td><td className="r" style={{ color: "#7A8790" }}>{c.rnd > 0 ? "+" : "−"}{M(Math.abs(c.rnd))}</td></tr>}
        <tr className="g"><td>{T("total")}</td><td className="r">{M(c.total)}</td></tr></tbody></table>
      <h3>{T("pay_plan")}</h3><table><tbody><tr><td>{T("deposit_book")}</td><td className="r"><b>{M(c.deposit)}</b></td></tr>
        {c.pay.map((p: any) => <tr key={p.v}><td><span className="dot" style={{ background: vcol(p.v) }} /> {T("pay_at_visit", { n: p.v })}</td><td className="r">{M(p.amount)}</td></tr>)}</tbody></table></>}
    {c.visits.filter((v: any) => v.lines.length).length > 1 && <><h3>{T("timeline_t")}</h3><div className="tl">{c.visits.filter((v: any) => v.lines.length).map((vv: any, i: number) => <span key={vv.v} style={{ display: "contents" }}>
      {i > 0 && <div className="g">→<br />{op.implants ? T("gap_months", { a: d.gap.min, b: d.gap.max }) : T("gap_days")}</div>}
      <div className="s" style={{ borderTop: `3px solid ${vcol(vv.v)}` }}><b>{T("visit_n", { n: vv.v })}</b><br />{T("stay_days", { a: op.stays[i]?.[0] ?? 1, b: op.stays[i]?.[1] ?? 2 })}</div></span>)}</div></>}
  </>;
}

export function QuoteDoc({ d, cat, print }: { d: DocData; cat: Catalog; print?: boolean }) {
  const lang = d.lang, T = (k: string, p?: any) => translate(lang, k, p), M = (v: number) => fmtMoney(v, d.currency, lang);
  const multi = d.options.length > 1;
  return <div className="doc" style={{ ["--c1" as never]: d.clinic.color || "#0E7C86" }} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    {d.draft && <div className="wm"><span>{T("draft_wm")}</span></div>}
    <div className="dhead"><div><div className="dlogo"><i><Icon n="tooth" size={20} /></i>{d.clinic.name}</div><div style={{ color: "#7A8790", fontSize: 10.5, marginTop: 4 }}>{[d.clinic.address, d.clinic.city].filter(Boolean).join(" · ")}</div></div>
      <div className="meta"><span>{T("quote_no")}</span><b>{d.number ? `Q-${d.number}-v${d.version}` : "—"}</b><span>{T("date")}</span><b>{fmtDate(d.created ?? Date.now(), lang)}</b><span>{T("valid_until")}</span><b>{fmtDate(d.validUntil, lang)}</b>
        {d.staff?.dentist && <><span>{T("dentist")}</span><b>{d.staff.dentist}</b></>}{d.staff?.coordinator && <><span>{T("coordinator")}</span><b>{d.staff.coordinator}</b></>}</div></div>
    <div style={{ margin: "22px 0 6px" }}><div style={{ color: "#7A8790", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>{T("plan_for")}</div><h1>{d.patient.name}</h1></div>
    <p>{T("intro", { name: d.patient.name.split(" ")[0], clinic: d.clinic.name })}</p>
    {d.note && <div className="note">{d.note}</div>}
    {d.patient.issue && <><h2>{T("you_shared")}</h2><p style={{ margin: 0 }}>{d.patient.issue}</p></>}
    {multi && <><h2>{T("your_options")}</h2><div className="opts">{d.options.map((op, i) => <div key={i} className={"opt" + (op.rec ? " rec" : "")}>{op.rec && <span className="tag">★ {T("recommended")}</span>}
      <div style={{ fontWeight: 650 }}>{op.name}</div>{!d.pricesHidden && <div className="p">{M(op.calc.total)}</div>}
      <div style={{ color: "#7A8790", fontSize: 10.5 }}>{T("n_visits", { n: op.calc.visits.filter((v: any) => v.lines.length).length })} · {T("n_items", { n: op.calc.lines.length })}</div>
      <div style={{ fontSize: 10.5, marginTop: 4 }}>{[...new Set(op.calc.lines.map((l: any) => l.br).filter(Boolean))].slice(0, 3).join(" · ")}</div></div>)}</div></>}
    {d.options.map((op, i) => <div key={i}><h2 className={i && print ? "pb" : ""}>{multi ? `${T("option")} ${i + 1} · ${op.name}` : T("your_plan")}{op.rec && multi && <span style={{ fontSize: 10, background: "var(--c1)", color: "#fff", borderRadius: 999, padding: "2px 8px", marginInlineStart: 6, verticalAlign: 2 }}>★ {T("recommended")}</span>}</h2>
      <OptionBlock d={d} op={op} cat={cat} lang={lang} /></div>)}
    <h2>{T("whats_included")}</h2><div className="incl">{["inc_consult", "inc_xray", "inc_coord", "inc_aftercare"].map((k) => <div key={k}>{T(k)}</div>)}{d.options[0]?.calc.pkg.filter((p: any) => p.total <= 0).map((p: any) => <div key={p.k}>{p.nm}</div>)}</div>
    <h2>{T("next_steps")}</h2><ol style={{ margin: 0, paddingInlineStart: 18 }}>{["ns_1", "ns_2", "ns_3"].map((k) => <li key={k}>{T(k, { dep: d.depositBps / 100 })}</li>)}</ol>
    <div className="foot"><span>{[d.clinic.legalName || d.clinic.name, d.clinic.phone, d.clinic.email, d.clinic.website].filter(Boolean).join(" · ")}</span><span>{T("disclaimer")}</span></div>
  </div>;
}
