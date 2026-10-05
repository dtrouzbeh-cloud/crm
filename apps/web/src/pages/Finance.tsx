// Finans: özet · faturalar · komisyonlar · giderler · iş ortakları ve kurallar
import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch, del, qs, put } from "../lib/api.ts";
import { PageHead, Spinner, toast, toastErr, confirmBox, Drawer, Empty, Switch } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan, useMe, useInvalidateMe } from "../lib/auth.ts";
import { minor } from "../lib/format.tsx";
import { InvoiceDrawer } from "../components/Invoice.tsx";

const TABS = [["overview", "fin_overview", "chart"], ["invoices", "invoices", "file"], ["commissions", "commissions", "star"], ["expenses", "expenses", "card"], ["partners", "partners", "users"]] as const;
const CATS = ["lab", "materials", "hotel", "transfer", "flight", "marketing", "commission", "salary", "rent", "software", "other"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };
const today = () => ymd(new Date());

function Range({ v, set }: { v: { from: string; to: string }; set: (v: { from: string; to: string }) => void }) {
  const { t } = useT();
  const preset = (m: number) => { const d = new Date(); set({ from: ymd(new Date(d.getFullYear(), d.getMonth() - m, 1)), to: today() }); };
  return <div className="row wrap" style={{ gap: 6 }}>
    <div className="seg"><button onClick={() => preset(0)}>{t("this_month")}</button><button onClick={() => preset(2)}>3{t("mo")}</button><button onClick={() => preset(11)}>12{t("mo")}</button></div>
    <input className="inp sm" type="date" style={{ width: 140 }} value={v.from} onChange={(e) => set({ ...v, from: e.target.value })} />
    <input className="inp sm" type="date" style={{ width: 140 }} value={v.to} onChange={(e) => set({ ...v, to: e.target.value })} />
  </div>;
}

export default function Finance() {
  const { t } = useT(); const can = useCan(); const [, nav] = useLocation();
  const { tab = can("finance.view") ? "overview" : "invoices" } = useParams<{ tab?: string }>();
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const tabs = TABS.filter(([k]) => can("finance.view") || k === "invoices");
  return <><PageHead title={t("nav_finance")} sub={t("finance_sub")} actions={tab !== "partners" && <Range v={range} set={setRange} />} />
    <div className="tabs" style={{ marginBottom: 14 }}>{tabs.map(([k, l, ic]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => nav(`/finance/${k}`)}><Icon n={ic} size={15} />{t(l)}</button>)}</div>
    {tab === "overview" && <Overview range={range} />}{tab === "invoices" && <Invoices range={range} />}{tab === "commissions" && <Commissions range={range} />}
    {tab === "expenses" && <Expenses range={range} />}{tab === "partners" && <Partners />}
  </>;
}

function Overview({ range }: { range: { from: string; to: string } }) {
  const { t, money } = useT();
  const { data } = useQuery({ queryKey: ["fin-summary", range], queryFn: () => get("/api/finance/summary" + qs(range)) });
  if (!data) return <Spinner />;
  const T = data.totals, B = data.base, M = (v: number) => money(minor(v), B);
  const max = Math.max(1, ...data.months.map((m: any) => Math.max(m.income, m.cost)));
  const expCats: Record<string, number> = {} as Record<string, number>; for (const e of data.expenses) expCats[e.category] = (expCats[e.category] ?? 0) + Number(e.total);
  const expMax = Math.max(1, ...Object.values(expCats));
  return <div className="col" style={{ gap: 14 }}>
    <div className="grid g4">
      <div className="card kpi"><span className="l">{t("fin_income")}</span><span className="v num">{M(T.income)}</span><span className="d muted">{data.collected.map((c: any) => money(minor(c.gross - c.refunds), c.currency)).join(" · ") || "—"}</span></div>
      <div className="card kpi"><span className="l">{t("expenses")}</span><span className="v num">{M(T.expenses)}</span></div>
      <div className="card kpi"><span className="l">{t("commissions")}</span><span className="v num">{M(T.commissions)}</span></div>
      <div className="card kpi"><span className="l">{t("fin_net")}</span><span className="v num" style={{ color: T.net >= 0 ? "var(--ok)" : "var(--err)" }}>{M(T.net)}</span><span className="d muted">{t("fin_net_hint")}</span></div>
    </div>
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><div className="hd"><h3 className="grow">{t("fin_12m")}</h3><span className="tiny muted">{B} · ■ {t("fin_income")} ■ {t("expenses")}</span></div><div className="bd">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 180 }}>{data.months.map((m: any) => <div key={m.month} title={`${m.month}: ${M(m.income)} / ${M(m.cost)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: "100%", width: "100%", justifyContent: "center" }}>
            <i style={{ width: "40%", height: `${(100 * m.income) / max}%`, background: "var(--brand)", borderRadius: "3px 3px 0 0", minHeight: m.income ? 2 : 0 }} />
            <i style={{ width: "40%", height: `${(100 * m.cost) / max}%`, background: "var(--warn)", opacity: 0.7, borderRadius: "3px 3px 0 0", minHeight: m.cost ? 2 : 0 }} /></div>
          <span className="tiny faint">{m.month.slice(5)}</span></div>)}</div></div></div>
      <div className="col" style={{ gap: 14 }}>
        <div className="card"><div className="hd"><h3 className="grow">{t("receivables")}</h3><b className="num">{M(T.receivables)}</b></div><div className="bd small muted">
          {data.receivables.length ? data.receivables.map((r: any) => <div key={r.currency} className="row"><span className="grow">{r.n} deal</span><b className="num">{money(minor(r.total), r.currency)}</b></div>) : t("none")}
          <div><Link href="/deals" className="tiny">{t("nav_deals")} →</Link></div></div></div>
        <div className="card"><div className="hd"><h3 className="grow">{t("exp_by_cat")}</h3></div><div className="bd col" style={{ gap: 6 }}>
          {Object.keys(expCats).length ? Object.entries(expCats).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k}><div className="row small"><span className="grow">{t("ec_" + k)}</span><b className="num">{money(minor(v), B)}</b></div><div className="prog" style={{ height: 4 }}><i style={{ width: (100 * v) / expMax + "%" }} /></div></div>) : <span className="small muted">{t("none")}</span>}
        </div></div>
      </div>
    </div>
    <div className="row wrap" style={{ gap: 8 }}>{["payments", "invoices", "commissions", "expenses"].map((w) => <a key={w} className="btn sm" href={`/api/finance/export/${w}${qs(range)}`}><Icon n="download" />CSV · {t(w === "payments" ? "payments" : w)}</a>)}</div>
  </div>;
}

const IST: Record<string, string> = { draft: "", issued: "info", paid: "ok", void: "err" };
function Invoices({ range }: { range: { from: string; to: string } }) {
  const { t, money, date } = useT(); const qc = useQueryClient();
  const [kind, setKind] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["invoices", range, kind], queryFn: () => get<any[]>("/api/finance/invoices" + qs({ ...range, kind })) });
  return <div className="card"><div className="hd"><div className="seg">{["", "invoice", "proforma", "receipt", "credit_note"].map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k ? t("ik_" + k) : t("all")}</button>)}</div><span className="grow" />
    <span className="tiny muted">{t("invoice_from_deal_hint")}</span></div>
    {!data ? <Spinner /> : !data.length ? <Empty icon="file" text={t("no_records")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("number")}</th><th>{t("type")}</th><th>{t("buyer")}</th><th>Deal</th><th>{t("date")}</th><th className="r">{t("total")}</th><th /></tr></thead><tbody>
      {data.map((i) => <tr key={i.id} className="click" onClick={() => setOpen(i.id)}><td><b>{i.number ?? <span className="muted">{t("draft")}</span>}</b></td><td className="small">{t("ik_" + i.kind)}</td><td className="small">{i.buyerName}</td>
        <td className="small muted">{i.dealNumber ? "#" + i.dealNumber : ""}</td><td className="small muted">{date(i.issuedAt ?? i.createdAt)}</td><td className="r num">{money(minor(i.totalMinor), i.currency)}</td><td><span className={"bdg " + IST[i.status]}>{t("is_" + i.status)}</span></td></tr>)}
    </tbody></table></div>}
    {open && <InvoiceDrawer id={open} onClose={() => { setOpen(null); qc.invalidateQueries({ queryKey: ["invoices"] }); }} />}
    <InvoiceSettings />
  </div>;
}

function InvoiceSettings() {
  const { t } = useT(); const can = useCan(); const { data: me } = useMe(); const inv = useInvalidateMe();
  const cur = ((me?.clinic as any)?.settings?.invoice ?? {}) as any;
  const [f, setF] = useState<any>({ prefix: cur.prefixes?.invoice ?? "INV", tax: (cur.taxBps ?? 0) / 100, dueDays: cur.dueDays ?? 14, bank: cur.bank ?? "", footer: cur.footer ?? "" });
  const [open, setOpen] = useState(false);
  if (!can("settings.manage")) return null;
  const save = async () => { try { await patch("/api/clinic", { settings: { invoice: { ...cur, prefixes: { ...(cur.prefixes ?? {}), invoice: f.prefix }, taxBps: Math.round(Number(f.tax) * 100), dueDays: Number(f.dueDays), bank: f.bank, footer: f.footer } } }); inv(); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="bd" style={{ borderTop: "1px solid var(--line)" }}>
    <button className="btn sm ghost" onClick={() => setOpen(!open)}><Icon n="gear" />{t("invoice_settings")}</button>
    {open && <div className="grid g4" style={{ gap: 10, marginTop: 10 }}>
      <label className="f">{t("prefix")}<input className="inp sm" value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value.toUpperCase() })} /></label>
      <label className="f">{t("default_tax")} %<input className="inp sm num" value={f.tax} onChange={(e) => setF({ ...f, tax: e.target.value })} /></label>
      <label className="f">{t("due_days")}<input className="inp sm num" value={f.dueDays} onChange={(e) => setF({ ...f, dueDays: e.target.value })} /></label>
      <span />
      <label className="f" style={{ gridColumn: "span 2" }}>{t("bank_details")}<textarea className="inp" rows={3} value={f.bank} placeholder="IBAN TR00 0000 … / SWIFT …" onChange={(e) => setF({ ...f, bank: e.target.value })} /></label>
      <label className="f" style={{ gridColumn: "span 2" }}>{t("invoice_footer")}<textarea className="inp" rows={3} value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} /></label>
      <div><button className="btn sm pri" onClick={save}>{t("save")}</button></div>
    </div>}
  </div>;
}

const CST: Record<string, string> = { pending: "warn", approved: "info", paid: "ok", void: "err" };
function Commissions({ range }: { range: { from: string; to: string } }) {
  const { t, money, date } = useT(); const qc = useQueryClient(); const can = useCan();
  const [status, setStatus] = useState("pending"); const [sel, setSel] = useState<string[]>([]); const [rules, setRules] = useState(false);
  const { data } = useQuery({ queryKey: ["commissions", range, status], queryFn: () => get("/api/finance/commissions" + qs({ ...range, status })) });
  const act = async (action: string) => {
    let ref: string | undefined; if (action === "pay") { ref = prompt(t("pay_ref")) ?? undefined; if (ref === undefined) return; }
    try { const r = await post("/api/finance/commissions/action", { ids: sel, action, ref }); toast(`${r.updated} ✓`); setSel([]); qc.invalidateQueries({ queryKey: ["commissions"] }); } catch (e) { toastErr(e); }
  };
  if (!data) return <Spinner />;
  const items = data.items as any[];
  const selTotal = items.filter((x) => sel.includes(x.id)).reduce((a, x) => ({ ...a, [x.currency]: (a[x.currency] ?? 0) + Number(x.amountMinor) }), {} as Record<string, number>);
  return <div className="col" style={{ gap: 14 }}>
    <div className="card"><div className="hd"><h3 className="grow">{t("by_recipient")}</h3>{can("finance.manage") && <button className="btn sm" onClick={() => setRules(true)}><Icon n="gear" />{t("commission_rules")}</button>}</div>
      <div className="twrap"><table className="tbl"><thead><tr><th>{t("recipient")}</th><th className="r">{t("cs_pending")}</th><th className="r">{t("cs_approved")}</th><th className="r">{t("cs_paid")}</th></tr></thead><tbody>
        {data.byRecipient.length ? data.byRecipient.map((r: any, i: number) => <tr key={i}><td><b>{r.name ?? "—"}</b> <span className="tiny muted">{r.partnerId ? t("partner") : t("user")}</span></td>
          <td className="r num">{money(minor(r.pending), r.currency)}</td><td className="r num">{money(minor(r.approved), r.currency)}</td><td className="r num muted">{money(minor(r.paid), r.currency)}</td></tr>) : <tr><td colSpan={4} className="empty small">{t("no_commissions_hint")}</td></tr>}
      </tbody></table></div></div>
    <div className="card"><div className="hd"><div className="seg">{["pending", "approved", "paid", "void"].map((s) => <button key={s} className={status === s ? "on" : ""} onClick={() => { setStatus(s); setSel([]); }}>{t("cs_" + s)}</button>)}</div><span className="grow" />
      {can("finance.manage") && sel.length > 0 && <div className="row" style={{ gap: 6 }}><span className="small muted">{sel.length} · {Object.entries(selTotal).map(([c, v]) => money(minor(v as number), c)).join(" + ")}</span>
        {status === "pending" && <button className="btn sm" onClick={() => act("approve")}>{t("approve")}</button>}
        {(status === "pending" || status === "approved") && <><button className="btn sm pri" onClick={() => act("pay")}>{t("mark_paid")}</button><button className="btn sm ghost danger" onClick={() => act("void")}>{t("void")}</button></>}
        {(status === "approved" || status === "void") && <button className="btn sm ghost" onClick={() => act("reopen")}>↺</button>}</div>}</div>
      {!items.length ? <Empty icon="star" text={t("no_records")} /> : <div className="twrap"><table className="tbl"><thead><tr>{can("finance.manage") && <th style={{ width: 30 }}><input type="checkbox" checked={sel.length === items.length} onChange={(e) => setSel(e.target.checked ? items.map((x) => x.id) : [])} /></th>}<th>{t("date")}</th><th>{t("recipient")}</th><th>Deal</th><th className="r">{t("base")}</th><th className="r">%</th><th className="r">{t("amount")}</th></tr></thead><tbody>
        {items.map((x) => <tr key={x.id}>{can("finance.manage") && <td><input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((s) => s !== x.id))} /></td>}
          <td className="small muted">{date(x.createdAt)}</td><td className="small"><b>{x.userName ?? x.partnerName}</b><div className="tiny faint">{x.ruleName}</div></td>
          <td className="small"><Link href={`/deals/${x.dealId}`}>#{x.dealNumber}</Link> <span className="muted">{x.patientName}</span>{Number(x.amountMinor) < 0 && <span className="bdg err" style={{ marginInlineStart: 6 }}>{t("refund")}</span>}</td>
          <td className="r num small">{money(minor(x.baseMinor), x.currency)}</td><td className="r num small">{x.rateBps / 100}</td><td className="r num"><b>{money(minor(x.amountMinor), x.currency)}</b>{x.paidRef && <div className="tiny faint">{x.paidRef}</div>}</td></tr>)}
      </tbody></table></div>}
    </div>
    {rules && <RulesDrawer onClose={() => setRules(false)} />}
  </div>;
}

function RulesDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const { data: me } = useMe();
  const { data } = useQuery({ queryKey: ["comm-rules"], queryFn: () => get<any[]>("/api/finance/commission-rules") });
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  const r = () => qc.invalidateQueries({ queryKey: ["comm-rules"] });
  const save = async (id: string | null, b: any) => { try { if (id) await patch(`/api/finance/commission-rules/${id}`, b); else await post("/api/finance/commission-rules", b); r(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const sources = ((me?.clinic as any)?.settings?.leadSources as string[]) ?? [];
  return <Drawer title={t("commission_rules")} onClose={onClose} width={760}>
    <div className="alert info" style={{ marginBottom: 12 }}><Icon n="info" /><span>{t("comm_rules_hint")}</span></div>
    {!data ? <Spinner /> : <div className="col" style={{ gap: 8 }}>
      {data.map((x) => <div key={x.id} className="card pad row wrap" style={{ gap: 8, opacity: x.active ? 1 : 0.5 }}>
        <Switch checked={x.active} onChange={(v) => save(x.id, { active: v })} />
        <input className="inp sm" style={{ maxWidth: 170 }} defaultValue={x.name} onBlur={(e) => e.target.value !== x.name && save(x.id, { name: e.target.value })} />
        <select className="inp sm" style={{ width: "auto" }} value={x.recipient} onChange={(e) => save(x.id, { recipient: e.target.value })}>{["deal_owner", "user", "lead_partner"].map((k) => <option key={k} value={k}>{t("rc_" + k)}</option>)}</select>
        {x.recipient === "user" && <select className="inp sm" style={{ width: "auto" }} value={x.userId ?? ""} onChange={(e) => save(x.id, { userId: e.target.value })}><option value="">—</option>{(team?.members ?? []).map((m: any) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select>}
        {x.recipient === "deal_owner" && <select className="inp sm" style={{ width: "auto" }} value={x.role ?? ""} onChange={(e) => save(x.id, { role: e.target.value || null })}><option value="">{t("any_role")}</option>{["sales", "coordinator", "manager"].map((k) => <option key={k} value={k}>{t("role_" + k)}</option>)}</select>}
        <input className="inp sm num" type="number" step="0.1" style={{ width: 70 }} defaultValue={x.rateBps / 100} onBlur={(e) => save(x.id, { rateBps: Math.round(+e.target.value * 100) })} /><span className="small">%</span>
        {x.recipient === "lead_partner" && !x.rateBps && <span className="tiny muted">{t("partner_rate")}</span>}
        <select className="inp sm" style={{ width: "auto" }} value={x.source ?? ""} onChange={(e) => save(x.id, { source: e.target.value || null })}><option value="">{t("all_sources")}</option>{sources.map((s) => <option key={s} value={s}>{t("src_" + s)}</option>)}</select>
      </div>)}
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm" onClick={() => save(null, { name: t("rc_deal_owner") + " 5%", recipient: "deal_owner", rateBps: 500 })}><Icon n="plus" />{t("rc_deal_owner")}</button>
        <button className="btn sm" onClick={() => save(null, { name: t("rc_lead_partner"), recipient: "lead_partner", rateBps: 0 })}><Icon n="plus" />{t("rc_lead_partner")}</button>
        <button className="btn sm" onClick={() => save(null, { name: t("rc_user"), recipient: "user", userId: team?.members?.[0]?.userId, rateBps: 100 })}><Icon n="plus" />{t("rc_user")}</button>
      </div>
    </div>}
  </Drawer>;
}

function Expenses({ range }: { range: { from: string; to: string } }) {
  const { t, money, date } = useT(); const qc = useQueryClient(); const can = useCan(); const { data: me } = useMe();
  const [cat, setCat] = useState(""); const [edit, setEdit] = useState<any | null>(null);
  const { data } = useQuery({ queryKey: ["expenses", range, cat], queryFn: () => get<any[]>("/api/finance/expenses" + qs({ ...range, category: cat })) });
  const cur = (me?.clinic as any)?.defaultCurrency ?? "EUR";
  const totals = (data ?? []).reduce((a, e) => ({ ...a, [e.currency]: (a[e.currency] ?? 0) + Number(e.amountMinor) }), {} as Record<string, number>);
  const save = async () => { try { const b = { category: edit.category, vendor: edit.vendor || null, description: edit.description || null, amountMinor: Math.round(Number(edit.amount) * 100), currency: edit.currency, spentOn: edit.spentOn };
    if (edit.id) await patch(`/api/finance/expenses/${edit.id}`, b); else await post("/api/finance/expenses", b); setEdit(null); qc.invalidateQueries({ queryKey: ["expenses"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="card"><div className="hd"><select className="inp sm" style={{ width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">{t("all")}</option>{CATS.map((c) => <option key={c} value={c}>{t("ec_" + c)}</option>)}</select>
    <span className="grow small muted">{Object.entries(totals).map(([c, v]) => money(minor(v as number), c)).join(" + ")}</span>
    {can("finance.manage") && <button className="btn sm pri" onClick={() => setEdit({ category: "lab", currency: cur, spentOn: today(), amount: "" })}><Icon n="plus" />{t("add_expense")}</button>}</div>
    {!data ? <Spinner /> : !data.length ? <Empty icon="card" text={t("no_records")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("date")}</th><th>{t("category")}</th><th>{t("vendor")}</th><th>{t("description")}</th><th className="r">{t("amount")}</th><th /></tr></thead><tbody>
      {data.map((e) => <tr key={e.id}><td className="small muted">{date(e.spentOn)}</td><td><span className="bdg">{t("ec_" + e.category)}</span></td><td className="small">{e.vendor}</td><td className="small muted">{e.description}{e.dealNumber && <> · <Link href={`/deals/${e.dealId}`}>#{e.dealNumber}</Link></>}</td>
        <td className="r num">{money(minor(e.amountMinor), e.currency)}</td>
        <td style={{ whiteSpace: "nowrap" }}>{can("finance.manage") && <><button className="btn xs ghost icon" onClick={() => setEdit({ ...e, amount: minor(e.amountMinor) })}><Icon n="pen" /></button>
          <button className="btn xs ghost icon danger" onClick={async () => { if (await confirmBox(t("delete"), e.vendor ?? "", t("delete"), true)) { await del(`/api/finance/expenses/${e.id}`); qc.invalidateQueries({ queryKey: ["expenses"] }); } }}><Icon n="trash" /></button></>}</td></tr>)}
    </tbody></table></div>}
    {edit && <Drawer title={edit.id ? t("edit") : t("add_expense")} onClose={() => setEdit(null)} footer={<><span className="grow" /><button className="btn" onClick={() => setEdit(null)}>{t("cancel")}</button><button className="btn pri" disabled={!(Number(edit.amount) > 0)} onClick={save}>{t("save")}</button></>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <label className="f">{t("category")}<select className="inp" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{t("ec_" + c)}</option>)}</select></label>
        <label className="f">{t("date")}<input className="inp" type="date" value={edit.spentOn?.slice(0, 10)} onChange={(e) => setEdit({ ...edit, spentOn: e.target.value })} /></label>
        <label className="f">{t("amount")}<input className="inp num" inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value.replace(",", ".") })} /></label>
        <label className="f">{t("currency")}<select className="inp" value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })}>{((me?.clinic as any)?.currencies ?? ["EUR", "USD", "GBP", "TRY"]).map((c: string) => <option key={c}>{c}</option>)}</select></label>
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("vendor")}<input className="inp" value={edit.vendor ?? ""} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} /></label>
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("description")}<textarea className="inp" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
      </div></Drawer>}
  </div>;
}

function Partners() {
  const { t } = useT(); const qc = useQueryClient(); const can = useCan();
  const [edit, setEdit] = useState<any | null>(null);
  const { data } = useQuery({ queryKey: ["partners"], queryFn: () => get<any[]>("/api/partners") });
  const save = async () => { try { const b = { name: edit.name, type: edit.type, email: edit.email || "", phone: edit.phone || null, country: edit.country || null, commissionBps: Math.round(Number(edit.rate || 0) * 100), refCode: edit.refCode || "", active: edit.active, notes: edit.notes || null };
    if (edit.id) await patch(`/api/partners/${edit.id}`, b); else await post("/api/partners", b); setEdit(null); qc.invalidateQueries({ queryKey: ["partners"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="card"><div className="hd"><h3 className="grow">{t("partners")}</h3>{can("finance.manage") && <button className="btn sm pri" onClick={() => setEdit({ type: "agency", rate: 10, active: true })}><Icon n="plus" />{t("new")}</button>}</div>
    <div className="bd tiny muted" style={{ paddingTop: 0 }}>{t("partners_hint")}</div>
    <ReferralSettings />
    {!data ? <Spinner /> : !data.length ? <Empty icon="users" text={t("no_records")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("type")}</th><th>{t("ref_code")}</th><th className="r">%</th><th className="r">Lead</th><th className="r">Deal</th><th className="r">{t("cs_pending")}</th><th className="r">{t("cs_paid")}</th></tr></thead><tbody>
      {data.map((p) => <tr key={p.id} className="click" style={{ opacity: p.active ? 1 : 0.5 }} onClick={() => can("finance.manage") && setEdit({ ...p, rate: p.commissionBps / 100 })}><td><b>{p.name}</b><div className="tiny faint">{p.email ?? ""}</div></td>
        <td className="small">{t("pt_" + p.type)}</td><td><span className="code">{p.refCode}</span></td><td className="r num">{(p.commissionBps ?? 0) / 100}</td><td className="r num">{p.leads}</td><td className="r num">{p.deals}</td>
        <td className="r num">{p.dueMinor != null ? (Number(p.dueMinor) / 100).toLocaleString() : ""}</td><td className="r num muted">{p.paidMinor != null ? (Number(p.paidMinor) / 100).toLocaleString() : ""}</td></tr>)}
    </tbody></table></div>}
    {edit && <Drawer title={edit.id ? edit.name : t("new")} onClose={() => setEdit(null)} footer={<><Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label={t("active")} /><span className="grow" /><button className="btn" onClick={() => setEdit(null)}>{t("cancel")}</button><button className="btn pri" disabled={!edit.name} onClick={save}>{t("save")}</button></>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("name")}<input className="inp" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        <label className="f">{t("type")}<select className="inp" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{["agency", "referrer", "influencer", "doctor", "other"].map((k) => <option key={k} value={k}>{t("pt_" + k)}</option>)}</select></label>
        <label className="f">{t("commission")} %<input className="inp num" inputMode="decimal" value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value.replace(",", ".") })} /></label>
        <label className="f">{t("email")}<input className="inp" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
        <label className="f">{t("phone")}<input className="inp" value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
        <label className="f">{t("ref_code")}<input className="inp" value={edit.refCode ?? ""} placeholder="AUTO" onChange={(e) => setEdit({ ...edit, refCode: e.target.value.toUpperCase() })} /></label>
        <label className="f">{t("country")}<input className="inp" maxLength={2} value={edit.country ?? ""} onChange={(e) => setEdit({ ...edit, country: e.target.value.toUpperCase() })} /></label>
        <label className="f" style={{ gridColumn: "1/-1" }}>{t("notes")}<textarea className="inp" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
        {edit.refCode && <div className="tiny muted" style={{ gridColumn: "1/-1" }}>{t("ref_hint")} <span className="code">?ref={edit.refCode}</span></div>}
      </div></Drawer>}
  </div>;
}

function ReferralSettings() {
  const { t } = useT(); const can = useCan(); const { data: me } = useMe(); const inv = useInvalidateMe();
  const cur = ((me?.clinic as any)?.settings?.referral ?? {}) as any;
  if (!can("settings.manage")) return null;
  const save = async (amount: string, currency: string) => { try { await put("/api/referral-settings", { rewardMinor: amount ? Math.round(Number(amount) * 100) : null, currency }); inv(); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="bd row wrap" style={{ gap: 8, paddingTop: 0 }}><span className="small">🎁 {t("referral_reward_setting")}</span>
    <input className="inp sm num" style={{ width: 90 }} defaultValue={cur.rewardMinor ? cur.rewardMinor / 100 : ""} id="rf-amt" /><input className="inp sm" style={{ width: 64 }} defaultValue={cur.currency ?? (me?.clinic as any)?.defaultCurrency ?? "EUR"} id="rf-cur" />
    <button className="btn sm" onClick={() => save((document.getElementById("rf-amt") as HTMLInputElement).value, (document.getElementById("rf-cur") as HTMLInputElement).value.toUpperCase())}>{t("save")}</button>
    <span className="tiny muted">{t("referral_reward_hint")}</span></div>;
}
