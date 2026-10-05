import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { PageHead, Empty, Spinner, Avatar, toast, toastErr } from "../components/ui.tsx";
import { useCan } from "../lib/auth.ts";
import { useCatalog } from "../lib/catalog.ts";
import { CaseBadge, QuoteBadge, flag, minor } from "../lib/format.tsx";
import { chartSVG } from "@dentaflow/core/chart";
import { toothStates } from "@dentaflow/core/engine";

const TABS = ["pool", "diagnosed", "quoted", "accepted", "all"];
export default function Cases() {
  const { t, rel, money } = useT(); const can = useCan(); const [, nav] = useLocation(); const qc = useQueryClient(); const { cat } = useCatalog();
  const [tab, setTab] = useState("pool");
  const { data } = useQuery({ queryKey: ["cases", tab], queryFn: () => get("/api/cases" + (tab === "all" ? "" : "?status=" + tab)) });
  const claim = async (id: string) => { try { await post(`/api/cases/${id}/claim`); qc.invalidateQueries({ queryKey: ["cases"] }); toast(t("claimed")); nav(`/cases/${id}`); } catch (e) { toastErr(e); } };
  const total = data ? Object.values(data.counts as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
  return <>
    <PageHead title={t("nav_cases")} sub={t("cases_sub")} />
    <div className="tabs" style={{ marginBottom: 14 }}>{TABS.map((k) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(k === "all" ? "all" : "cs_" + k)} <span className="bdg">{k === "all" ? total : data?.counts?.[k] ?? 0}</span></button>)}</div>
    {!data || !cat ? <Spinner /> : data.items.length ? <div className="grid g3">{data.items.map((c: any) => <div key={c.id} className="card" style={{ overflow: "hidden" }}>
      <div className="mini-chart" style={{ background: "var(--subtle)", padding: "6px 8px 0", cursor: "pointer" }} onClick={() => nav(`/cases/${c.id}`)} dangerouslySetInnerHTML={{ __html: chartSVG(toothStates(cat, c.situation ?? {}, c.planItems?.length ? c.planItems : null), {}) }} />
      <div className="bd col" style={{ gap: 8 }}>
        <div className="row"><Avatar name={c.fullName} /><div className="grow"><b>{c.fullName}</b><div className="tiny muted">{flag(c.country)} #{c.number} · {c.age ? c.age + " · " : ""}{rel(c.createdAt)}</div></div><CaseBadge s={c.status} /></div>
        {c.flags?.length > 0 && <div className="tiny" style={{ color: "var(--err)" }}>⚠ {c.flags.map((f: string) => t("med_" + f)).join(", ")}</div>}
        <div className="row small muted"><span className="grow">{c.dentistName ? <><Avatar name={c.dentistName} sm /> {c.dentistName}</> : t("no_dentist")}</span>{c.planItems?.length > 0 && <span>{t("n_items", { n: c.planItems.length })} · {t("n_visits", { n: c.visits })}</span>}</div>
        {c.lastQuote && <div className="row small"><QuoteBadge s={c.lastQuote.status} /><span className="grow" />{c.lastQuote.total != null && <b className="num">{money(minor(c.lastQuote.total), c.lastQuote.currency)}</b>}</div>}
        <div className="row">{c.status === "pool" && !c.dentistId && can("case.diagnose") && <button className="btn sm" onClick={() => claim(c.id)}>{t("take_case")}</button>}<Link href={`/cases/${c.id}`} className="btn sm pri" style={{ marginInlineStart: "auto" }}>{t("open")} →</Link></div>
      </div></div>)}</div> : <div className="card"><Empty icon="tooth" text={t("no_cases")} /></div>}
  </>;
}
