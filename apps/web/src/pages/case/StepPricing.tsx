import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../lib/i18n.tsx";
import { post, put } from "../../lib/api.ts";
import { toast, toastErr } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { useMe, useCan } from "../../lib/auth.ts";
import { useCatalog } from "../../lib/catalog.ts";
import { vcol } from "@dentaflow/core/chart";
import { LANG_NAMES, translate } from "@dentaflow/core/i18n";
import { calcOption, spansFor, stayDays, hasImplants, brandList, itemName, CROWN_GROUP, BUNDLE_SWAP, tn, type Catalog, type PriceOption, type PlanItem } from "@dentaflow/core/engine";
import { QuoteDoc, type DocData } from "./QuoteDoc.tsx";

const CURS = ["EUR", "USD", "GBP", "TRY", "AED", "SAR", "CHF", "SEK", "NOK", "DKK", "PLN", "CAD", "AUD"];
const uid = () => Math.random().toString(36).slice(2, 10);

export function buildDoc(cat: Catalog, k: any, patient: any, clinic: any, p: any, lang = p.language, staff?: any): DocData {
  const L = { unit: (u: string) => translate(lang, "u_" + u), pkg: (kk: string, n?: number) => translate(lang, kk === "hotel" ? "pk_hotel" : kk === "transfer" ? "pk_transfer" : "pk_flight", { n }) };
  const opts = (p.options as PriceOption[]).slice(0, p.nOpt).map((op) => { const calc = calcOption(cat, op, k.visits, p.currency, lang, L.unit, L.pkg, p.depositBps);
    return { name: op.custom || translate(lang, op.name), rec: !!op.rec, items: op.items, calc, spans: spansFor(cat, k.situation, op.items, lang, { implants: (n) => translate(lang, "implants_n", { n }), jaw: (j) => translate(lang, j === "u" ? "jaw_u" : "jaw_l") }),
      stays: calc.visits.filter((v) => v.lines.length).map((v) => stayDays(cat, v.lines)), implants: hasImplants(cat, op.items) }; });
  return { draft: true, lang, currency: p.currency, pricesHidden: p.pricesHidden, note: p.note, depositBps: p.depositBps, visits: k.visits, validUntil: Date.now() + p.validDays * 86400000,
    patient: { name: patient?.fullName ?? "", country: patient?.country, issue: patient?.issue ?? "" }, clinic: { name: clinic.name, color: clinic.brandColor },
    staff, situation: k.situation, gap: { min: cat.gapMinMonths, max: cat.gapMaxMonths }, options: opts };
}

export default function StepPricing({ data, cat, reload, onNext }: { data: any; cat: Catalog; reload: () => void; onNext: () => void }) {
  const { t, lang, money } = useT(); const can = useCan(); const { data: me } = useMe(); const { raw } = useCatalog();
  const k = data.case;
  const [p, setP] = useState<any>(() => structuredClone(k.pricing));
  const [oi, setOi] = useState(0);
  const [saving, setSaving] = useState(false);
  const [ex, setEx] = useState({ sel: "", v: 1, name: "", price: "" });
  const tm = useRef<ReturnType<typeof setTimeout>>(null);
  const outdated = (p?.syncedRevision ?? -1) !== k.planRevision;
  const limit = Math.min(Number(me?.perms?.["discount.max"] ?? 0), Number(me?.clinic?.settings?.discountLimits?.[me?.role ?? ""] ?? 100));
  const update = (fn: (d: any) => void) => { setP((cur: any) => { const n = structuredClone(cur); fn(n); queueSave(n); return n; }); };
  const queueSave = (n: any) => { if (tm.current) clearTimeout(tm.current); setSaving(true); tm.current = setTimeout(async () => { try { await put(`/api/cases/${k.id}/pricing`, n); } catch (e) { toastErr(e); } finally { setSaving(false); } }, 600); };
  useEffect(() => () => { if (tm.current) clearTimeout(tm.current); }, []);
  const op: PriceOption = p.options[Math.min(oi, p.nOpt - 1)];
  const unitL = (u: string) => t("u_" + u), pkgL = (kk: string, n?: number) => t(kk === "hotel" ? "pk_hotel" : kk === "transfer" ? "pk_transfer" : "pk_flight", { n });
  const calcs = useMemo(() => p.options.slice(0, p.nOpt).map((o: PriceOption) => calcOption(cat, o, k.visits, p.currency, lang, unitL, pkgL, p.depositBps)), [p, cat, lang]);
  const calc = calcs[Math.min(oi, p.nOpt - 1)];
  const doc = useMemo(() => buildDoc(cat, k, data.patient, me!.clinic, p), [p, cat, k]);
  const needAppr = (o: PriceOption) => (o.disc > limit || me?.clinic?.settings?.quote?.requireApprovalAll) && !o.approvedBy;
  const setNOpt = async (n: number) => {
    const extra: PriceOption[] = [];
    for (let i = p.options.length; i < n; i++) extra.push(await post(`/api/cases/${k.id}/pricing/option`, { index: i }));
    update((d) => { d.options.push(...extra); d.nOpt = n; d.options.forEach((o: PriceOption, i: number) => (o.rec = i === (n > 1 ? 1 : 0))); });
    setOi(Math.min(oi, n - 1));
  };
  const resync = async () => { try { const r = await post(`/api/cases/${k.id}/pricing/resync`); setP(r.pricing); toast(t("resynced")); reload(); } catch (e) { toastErr(e); } };
  const approval = async (action: "request" | "approve" | "reject") => { try { await put(`/api/cases/${k.id}/pricing`, p); const r = await post(`/api/cases/${k.id}/pricing/approval`, { optionId: op.id, action }); setP((cur: any) => { const n = structuredClone(cur); n.options = n.options.map((o: PriceOption) => o.id === op.id ? r.option : o); return n; }); toast(t(action === "request" ? "appr_requested" : "approved")); } catch (e) { toastErr(e); } };
  const lineCtl = (it: PlanItem) => {
    const sw = it.b && BUNDLE_SWAP.find((g) => g.includes(it.b!)); const bl = brandList(cat, it); const tx = it.tx ? cat.tx(it.tx) : undefined;
    const set = (patch: Partial<PlanItem>) => update((d) => { const o = d.options[oi]; o.items = o.items.map((x: PlanItem) => x.id === it.id ? { ...x, ...patch } : x); });
    if (sw) return <select className="inp sm" style={{ maxWidth: 180 }} value={it.b!} onChange={(e) => set({ b: e.target.value })}>{sw.map((id) => <option key={id} value={id}>{tn(cat.bundle(id)?.n, lang)}</option>)}</select>;
    if (bl) return <select className="inp sm" style={{ maxWidth: 180 }} value={it.brand ?? ""} onChange={(e) => set({ brand: e.target.value || null })}>{it.b && <option value="">{t("std_choice")}</option>}{bl.map((b) => <option key={b.id} value={b.id}>{b.n}</option>)}</select>;
    if (tx && CROWN_GROUP.includes(tx.id)) return <select className="inp sm" style={{ maxWidth: 180 }} value={it.tx!} onChange={(e) => set({ tx: e.target.value })}>{CROWN_GROUP.map((id) => <option key={id} value={id}>{tn(cat.tx(id)?.n, lang)}</option>)}</select>;
    return null;
  };
  const addExtra = () => { if (!ex.sel) return; update((d) => { const o = d.options[oi];
    if (ex.sel === "__m") { if (!ex.name) return; o.extras.push({ id: uid(), manual: true, name: ex.name, price: +ex.price || 0, qty: 1, v: ex.v }); }
    else { const x = cat.tx(ex.sel)!; o.extras.push({ id: uid(), tx: ex.sel, v: ex.v, qty: 1, jaws: x.unit === "arch" ? ["u"] : undefined }); } }); setEx({ ...ex, sel: "", name: "", price: "" }); };
  const editable = can("quote.price");
  const M = (v: number) => money(v, p.currency);
  return <>
    {outdated && <div className="alert warn" style={{ marginBottom: 12 }}><Icon n="alert" /><span className="grow">{t("plan_changed")}</span><button className="btn sm" onClick={resync}>{t("resync")}</button></div>}
    <div className="grid ws2" style={{ gridTemplateColumns: "minmax(340px,440px) minmax(0,1fr)", alignItems: "start" }}>
      <div className="col" style={{ gap: 12 }}>
        <div className="card"><div className="bd col">
          <div className="grid g2"><label className="f">{t("currency")}<select className="inp sm" value={p.currency} disabled={!editable} onChange={(e) => update((d) => (d.currency = e.target.value))}>{CURS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="f">{t("quote_lang")}<select className="inp sm" value={p.language} disabled={!editable} onChange={(e) => update((d) => (d.language = e.target.value))}>{Object.entries(LANG_NAMES).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label></div>
          <div className="row wrap between"><span className="small muted">{t("n_options")}</span><div className="seg">{[1, 2, 3].map((n) => <button key={n} className={p.nOpt === n ? "on" : ""} disabled={!editable} onClick={() => setNOpt(n)}>{n}</button>)}</div></div>
          {p.nOpt > 1 && <div className="seg" style={{ width: "100%" }}>{(["mat", "diff"] as const).map((m) => <button key={m} style={{ flex: 1 }} className={p.mode === m ? "on" : ""} onClick={() => update((d) => (d.mode = m))}>{t("mode_" + m)}</button>)}</div>}
          {raw?.hotels?.length > 0 && <label className="f">{t("hotels")}<select className="inp sm" value={p.hotelId ?? ""} onChange={(e) => update((d) => (d.hotelId = e.target.value || null))}><option value="">{t("std_choice")}</option>{raw.hotels.filter((h: any) => h.active).map((h: any) => <option key={h.id} value={h.id}>{h.name} · {money(Number(h.nightEur), "EUR")}</option>)}</select></label>}
        </div></div>
        {p.nOpt > 1 && <div className="row wrap" style={{ gap: 6 }}>{p.options.slice(0, p.nOpt).map((o: PriceOption, i: number) => <button key={o.id} className={"vtab" + (oi === i ? " on" : "")} onClick={() => setOi(i)} style={{ flex: 1, flexDirection: "column", alignItems: "flex-start", height: "auto", padding: "8px 12px" }}>
          {o.rec && <span className="bdg brand">★ {t("recommended")}</span>}<span>{o.custom || t(o.name)}</span><span className="num" style={{ fontWeight: 700 }}>{M(calcs[i].total)}</span>{needAppr(o) && <span className="bdg warn"><Icon n="lock" size={11} /></span>}</button>)}</div>}
        <div className="card"><div className="hd">
          <select className="inp sm" style={{ width: "auto" }} value={op.custom ? "opt_custom" : op.name} onChange={(e) => update((d) => { const o = d.options[oi]; if (e.target.value === "opt_custom") o.custom = o.custom || t("opt_custom"); else { o.name = e.target.value; o.custom = ""; } })}>{["opt_std", "opt_rec", "opt_prem", "opt_custom"].map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
          {op.custom ? <input className="inp sm" value={op.custom} onChange={(e) => update((d) => (d.options[oi].custom = e.target.value))} /> : null}
          <span className="grow" /><button className={"chip" + (op.rec ? " on" : "")} onClick={() => update((d) => d.options.forEach((o: PriceOption, i: number) => (o.rec = i === oi)))}>★ {t("recommended")}</button></div>
          <div className="bd" style={{ paddingTop: 4 }}>
            {[...op.items].sort((a, b) => a.v - b.v).map((it) => { const lc = calcOption(cat, { ...op, items: [it], extras: [], hotel: { n: 0, free: false }, transfer: { on: false, free: false }, disc: 0 }, k.visits, p.currency, lang, unitL, pkgL).lines[0];
              return <div key={it.id} className="pitem" style={{ padding: "8px 0" }}><span className="dot" style={{ background: vcol(it.v) }} /><div className="grow"><div style={{ fontWeight: 550 }}>{itemName(cat, it, lang)}</div>
                <div className="t">{it.teeth?.length && !it.b ? it.teeth.join(", ") : it.jaws?.map((j) => t(j === "u" ? "jaw_u" : "jaw_l")).join(" + ")} {lc && `· ${lc.qty} × ${M(lc.unit)}`}</div></div>
                {editable && lineCtl(it)}<b className="num" style={{ minWidth: 74, textAlign: "end" }}>{lc ? M(lc.total) : ""}</b>
                {editable && p.mode === "diff" && <button className="btn xs ghost icon" onClick={() => update((d) => (d.options[oi].items = d.options[oi].items.filter((x: PlanItem) => x.id !== it.id)))}><Icon n="x" /></button>}</div>; })}
            <div className="small muted" style={{ margin: "12px 0 6px" }}>{t("extras")}</div>
            {op.extras.map((e) => <div key={e.id} className="pitem" style={{ padding: "6px 0" }}><span className="dot" style={{ background: vcol(e.v) }} /><span className="grow">{e.manual ? e.name : itemName(cat, e, lang)} × {e.qty ?? 1}</span>{e.manual && <b className="num">{M((e.price ?? 0) * (e.qty ?? 1))}</b>}
              {editable && <button className="btn xs ghost icon" onClick={() => update((d) => (d.options[oi].extras = d.options[oi].extras.filter((x: PlanItem) => x.id !== e.id)))}><Icon n="x" /></button>}</div>)}
            {editable && <><div className="row" style={{ gap: 6, marginTop: 6 }}><select className="inp sm grow" value={ex.sel} onChange={(e) => setEx({ ...ex, sel: e.target.value })}><option value="">{t("add_extra")}…</option>
              {cat.treatments.filter((x) => x.active && ["piece", "mouth", "arch"].includes(x.unit)).map((x) => <option key={x.id} value={x.id}>{tn(x.n, lang)}</option>)}<option value="__m">✎ {t("manual_item")}</option></select>
              <select className="inp sm" style={{ width: "auto" }} value={ex.v} onChange={(e) => setEx({ ...ex, v: +e.target.value })}>{Array.from({ length: k.visits }, (_, j) => <option key={j} value={j + 1}>V{j + 1}</option>)}</select><button className="btn sm" onClick={addExtra}><Icon n="plus" /></button></div>
              {ex.sel === "__m" && <div className="row" style={{ gap: 6, marginTop: 6 }}><input className="inp sm grow" placeholder={t("item_name")} value={ex.name} onChange={(e) => setEx({ ...ex, name: e.target.value })} /><input className="inp sm" type="number" placeholder={p.currency} style={{ width: 100 }} value={ex.price} onChange={(e) => setEx({ ...ex, price: e.target.value })} /></div>}</>}
          </div></div>
        <div className="card"><div className="hd"><h3 className="grow">{t("package_incl")}</h3></div><div className="bd col">
          <div className="row"><span className="grow small"><Icon n="desk" size={14} /> {t("hotel_nights")}</span><input className="inp sm" type="number" min={0} value={op.hotel.n} style={{ width: 70 }} onChange={(e) => update((d) => (d.options[oi].hotel.n = Math.max(0, +e.target.value || 0)))} />
            <label className="row small" style={{ gap: 6 }}><span className="switch"><input type="checkbox" checked={op.hotel.free} onChange={(e) => update((d) => (d.options[oi].hotel.free = e.target.checked))} /><span /></span>{t("free")}</label></div>
          <div className="row"><span className="grow small"><Icon n="plane" size={14} /> {t("vip_transfer")}</span><label className="switch"><input type="checkbox" checked={op.transfer.on} onChange={(e) => update((d) => (d.options[oi].transfer.on = e.target.checked))} /><span /></label>
            <label className="row small" style={{ gap: 6 }}><span className="switch"><input type="checkbox" checked={op.transfer.free} onChange={(e) => update((d) => (d.options[oi].transfer.free = e.target.checked))} /><span /></span>{t("free")}</label></div>
          <div className="row"><span className="grow small">✈ {t("flight_contrib")}</span><input className="inp sm" type="number" min={0} max={100} placeholder="%" value={op.flightPct ?? ""} style={{ width: 64 }} onChange={(e) => update((d) => (d.options[oi].flightPct = +e.target.value || 0))} /><input className="inp sm" type="number" min={0} placeholder={p.currency} value={op.flightCost ?? ""} style={{ width: 84 }} onChange={(e) => update((d) => (d.options[oi].flightCost = +e.target.value || 0))} /></div>
        </div></div>
        <div className="card"><div className="hd"><h3 className="grow">{t("discount")}</h3><span className={"bdg" + (op.disc > limit ? " warn" : "")}>{t("your_limit", { n: limit })}</span></div><div className="bd col">
          <div className="row"><input type="range" min={0} max={30} className="grow" defaultValue={op.disc} key={op.id + op.disc} onMouseUp={(e) => update((d) => { d.options[oi].disc = +(e.target as HTMLInputElement).value; d.options[oi].approvedBy = null; })} onTouchEnd={(e) => update((d) => { d.options[oi].disc = +(e.target as HTMLInputElement).value; d.options[oi].approvedBy = null; })} />
            <input className="inp sm" type="number" min={0} max={100} value={op.disc} style={{ width: 70 }} onChange={(e) => update((d) => { d.options[oi].disc = Math.max(0, Math.min(100, +e.target.value || 0)); d.options[oi].approvedBy = null; })} /><span>%</span></div>
          {needAppr(op) ? <div className="alert warn"><Icon n="lock" /><span className="grow">{t("needs_approval", { n: limit })}</span>{can("quote.approve") && op.disc <= limit ? <button className="btn sm" onClick={() => approval("approve")}>{t("approve")}</button> : can("quote.approve") ? null :
            <button className="btn sm" disabled={op.approvalRequested} onClick={() => approval("request")}>{op.approvalRequested ? t("appr_requested") : t("request_appr")}</button>}</div>
            : op.approvedBy ? <div className="alert ok"><Icon n="ok" /><span>{t("approved")}</span></div> : null}
        </div></div>
        <div className="card"><div className="bd col" style={{ gap: 4 }}>
          <div className="row small"><span className="grow muted">{t("subtotal")}</span><span className="num">{M(calc.sub)}</span></div>
          {calc.tierAdj > 0 && <div className="row small" style={{ color: "var(--ok)" }}><span className="grow">{t("tier_adv", { n: calc.tierInfo?.n })}</span><span className="num">−{M(calc.tierAdj)}</span></div>}
          {calc.disc > 0 && <div className="row small" style={{ color: "var(--ok)" }}><span className="grow">{t("discount")} %{calc.discPct}</span><span className="num">−{M(calc.disc)}</span></div>}
          {calc.rnd !== 0 && <div className="row small"><span className="grow muted">{t("rounding")}</span><span className="num">{calc.rnd > 0 ? "+" : "−"}{M(Math.abs(calc.rnd))}</span></div>}
          <div className="row" style={{ fontSize: 18, fontWeight: 750, paddingTop: 6, borderTop: "1px solid var(--line)" }}><span className="grow">{t("total")}</span><span className="num" style={{ color: "var(--brand)" }}>{M(calc.total)}</span></div>
          <div className="row small"><span className="grow muted">{t("deposit")} (%{p.depositBps / 100})</span><span className="num">{M(calc.deposit)}</span></div>
          {calc.pay.map((x: any) => <div key={x.v} className="row small"><span className="dot" style={{ background: vcol(x.v) }} /><span className="grow muted">{t("pay_at_visit", { n: x.v })}</span><span className="num">{M(x.amount)}</span></div>)}
        </div></div>
        <div className="card"><div className="bd col">
          <div className="grid g2"><label className="f">{t("deposit")} %<input className="inp sm" type="number" min={0} max={100} value={p.depositBps / 100} onChange={(e) => update((d) => (d.depositBps = Math.round((+e.target.value || 0) * 100)))} /></label>
            <label className="f">{t("valid_days")}<input className="inp sm" type="number" min={1} max={365} value={p.validDays} onChange={(e) => update((d) => (d.validDays = Math.max(1, +e.target.value || 1)))} /></label></div>
          <label className="row small" style={{ gap: 8 }}><span className="switch"><input type="checkbox" checked={p.pricesHidden} onChange={(e) => update((d) => (d.pricesHidden = e.target.checked))} /><span /></span>{t("hide_prices")}</label>
          <label className="f">{t("patient_note")}<textarea className="inp" value={p.note} placeholder={t("patient_note_ph")} onChange={(e) => update((d) => (d.note = e.target.value))} /></label>
        </div></div>
        <div className="row"><span className="tiny muted">{saving ? t("saving") : "✓ " + t("saved_ok")}</span><span className="grow" /><button className="btn pri" onClick={async () => { if (tm.current) { clearTimeout(tm.current); await put(`/api/cases/${k.id}/pricing`, p); } reload(); onNext(); }}>{t("review_send")} →</button></div>
      </div>
      <div style={{ position: "sticky", top: 70 }}><div className="row small muted" style={{ marginBottom: 6 }}><Icon n="eye" size={14} /> {t("live_preview")} · {LANG_NAMES[p.language]}</div>
        <div className="docwrap" style={{ maxHeight: "calc(100vh - 110px)" }}><QuoteDoc d={doc} cat={cat} /></div></div>
    </div>
  </>;
}
