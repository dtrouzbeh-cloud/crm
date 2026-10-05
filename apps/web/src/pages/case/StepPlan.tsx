import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../lib/i18n.tsx";
import { post, put, ApiError } from "../../lib/api.ts";
import { toast, toastErr, confirmBox, Modal } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { Chart } from "../../components/Chart.tsx";
import { useMe, useCan } from "../../lib/auth.ts";
import { vcol } from "@dentaflow/core/chart";
import { CATEGORIES } from "@dentaflow/core/catalog";
import { toothStates, checkRules, spansFor, brandOf, itemName, convert, tn, ALL_TEETH, UPPER, LOWER, type Catalog, type PlanItem, type RuleHit } from "@dentaflow/core/engine";

const uid = () => Math.random().toString(36).slice(2, 10);
const PRESENT = ["intact", "root", "rct", "crown", "caries", "comp", "amalg", "inlay", "veneer", "bridge", "impacted", "other"];

export function RuleList({ rules }: { rules: RuleHit[] }) {
  const { t } = useT();
  return <>{rules.map((r, i) => <div key={i} className={"alert " + (r.sev === "block" ? "err" : r.sev === "info" ? "info" : "warn")}><Icon n={r.sev === "block" ? "ban" : r.sev === "info" ? "info" : "alert"} /><span><b>{r.code}</b> · {t("r_" + r.code, r.p)}</span></div>)}</>;
}

export default function StepPlan({ data, cat, onDiagnosed, reload }: { data: any; cat: Catalog; onDiagnosed: () => void; reload: () => void }) {
  const { t, lang, money } = useT(); const can = useCan(); const { data: me } = useMe();
  const k = data.case, sit = k.situation ?? {};
  const [items, setItems] = useState<PlanItem[]>(k.planItems ?? []);
  const [visits, setVisits] = useState<number>(k.visits ?? 1);
  const [rev, setRev] = useState<number>(k.planRevision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [undo, setUndo] = useState<PlanItem[][]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [curV, setCurV] = useState(1);
  const [pick, setPick] = useState<{ tx?: string; b?: string }>({});
  const [brand, setBrand] = useState<string | null>(null);
  const [jaws, setJaws] = useState<("u" | "l")[]>(["u"]);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"tx" | "b">("tx");
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState<null | { kind: "block" | "warn"; rules: RuleHit[] }>(null);
  const [busy, setBusy] = useState(false);
  const editable = can("case.write");
  const cur = useMemo(() => curV > visits ? visits : curV, [curV, visits]);
  const med = { flags: data.medical?.flags ?? [], age: data.medical?.age ?? null };
  const states = useMemo(() => toothStates(cat, sit, items), [cat, sit, items]);
  const spans = useMemo(() => spansFor(cat, sit, items, lang, { implants: (n) => t("implants_n", { n }), jaw: (j) => t(j === "u" ? "jaw_u" : "jaw_l") }), [cat, sit, items, lang, t]);
  const rules = useMemo(() => checkRules(cat, sit, items, visits, med, lang, (j) => t(j === "u" ? "jaw_u" : "jaw_l")), [cat, sit, items, visits, lang]);
  const preview = pick.b ? new Set(cat.bundle(pick.b)?.teeth ?? []) : null;

  // dirty iken sayfadan çıkışta uyar
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } }; addEventListener("beforeunload", h); return () => removeEventListener("beforeunload", h); }, [dirty]);
  const change = (next: PlanItem[], nv = visits) => { setUndo((u) => [...u.slice(-39), items]); setItems(next); setVisits(nv); setDirty(true); };

  const selRef = useRef(sel); selRef.current = sel;
  const onStroke = useCallback((tt: number, first: boolean, mode: "paint" | "erase" | null) => {
    if (pick.b) setPick({});
    const m = first ? (selRef.current.has(tt) ? "erase" : "paint") : (mode ?? "paint");
    setSel((s) => { const n = new Set(pick.b ? [] : s); if (m === "erase") n.delete(tt); else n.add(tt); return n; });
    return m;
  }, [pick.b]);

  const x = pick.tx ? cat.tx(pick.tx) : undefined, bu = pick.b ? cat.bundle(pick.b) : undefined;
  const needTeeth = x && (x.unit === "tooth" || x.unit === "side");
  const canAdd = !!bu || (!!x && (needTeeth ? sel.size > 0 : x.unit === "arch" ? jaws.length > 0 : true));
  const sortedSel = [...sel].sort((a, b) => ALL_TEETH.indexOf(a) - ALL_TEETH.indexOf(b));

  const autoExtract = (list: PlanItem[], teeth: number[], v: number): PlanItem[] => {
    const st = toothStates(cat, sit, list);
    const need = teeth.filter((tt) => { const s = sit[tt]; return (!s || PRESENT.includes(s.s ?? "intact")) && !st[tt]!.cekim && !(s && ["impab", "impcr"].includes(s.s ?? "")); });
    if (!need.length) return list;
    toast(t("auto_ext", { teeth: need.join(", ") }));
    const ex = list.find((i) => i.v === v && i.tx === "ext_simple");
    if (ex) return list.map((i) => i === ex ? { ...i, teeth: [...new Set([...(i.teeth ?? []), ...need])] } : i);
    const it = { id: uid(), v, tx: "ext_simple", teeth: need, auto: true }; setNewIds((s) => new Set(s).add(it.id)); return [...list, it];
  };
  const add = () => {
    if (!canAdd) return;
    let next = [...items];
    if (bu) { const it: PlanItem = { id: uid(), v: cur, b: bu.id, teeth: [] }; next.push(it); setNewIds((s) => new Set(s).add(it.id)); next = autoExtract(next, bu.imp, cur); }
    else if (x) {
      const it: PlanItem = { id: uid(), v: cur, tx: x.id, teeth: needTeeth ? sortedSel : [] };
      if (x.brands) it.brand = brand ?? x.brands[0]!.id;
      if (x.unit === "arch") it.jaws = [...jaws];
      if (x.unit === "piece" || x.unit === "mouth") it.qty = Math.max(1, qty);
      const same = next.find((i) => i.v === it.v && i.tx === it.tx && (i.brand ?? "") === (it.brand ?? "") && x.unit === "tooth");
      if (same) { next = next.map((i) => i === same ? { ...i, teeth: [...new Set([...(i.teeth ?? []), ...(it.teeth ?? [])])] } : i); setNewIds((s) => new Set(s).add(same.id)); }
      else { next.push(it); setNewIds((s) => new Set(s).add(it.id)); }
      if (x.render === "implant") next = autoExtract(next, sortedSel, cur);
    }
    change(next); setSel(new Set()); if (bu) setPick({});
  };
  const pickTx = (id: string) => { const tx = cat.tx(id)!; setPick({ tx: id }); if (pick.b) setSel(new Set()); setBrand(tx.brands ? (id === "implant" ? "b_neod" : tx.brands[0]!.id) : null); if (!tx.visits.includes(cur)) toast(t("visit_hint", { v: tx.visits.map((v) => "V" + v).join("/") })); };
  const pickB = (id: string) => { setPick({ b: id }); setSel(new Set(cat.bundle(id)!.teeth)); };

  const saveDraft = async (silent = false): Promise<number | null> => {
    try { const r = await put(`/api/cases/${k.id}/plan`, { visits, items, expectedRevision: rev }); setRev(r.revision); setDirty(false); setNewIds(new Set()); if (!silent) toast(t("draft_saved")); return r.revision; }
    catch (e) { if ((e as ApiError).code === "revision_conflict") { toastErr(new Error(t("conflict_reload"))); reload(); } else toastErr(e); return null; }
  };
  const complete = async (ack = false) => {
    setBusy(true);
    try { if (dirty || !ack) { const r = await saveDraft(true); if (r == null) return; }
      await post(`/api/cases/${k.id}/diagnose`, { acknowledge: ack }); setDlg(null); toast(t("dx_done")); onDiagnosed();
    } catch (e) { const a = e as ApiError; if (a.code === "rule_block") setDlg({ kind: "block", rules: a.details.rules }); else if (a.code === "rule_warnings") setDlg({ kind: "warn", rules: a.details.rules }); else toastErr(e); }
    finally { setBusy(false); }
  };
  const suggest = async () => {
    if (items.length && !(await confirmBox(t("suggest"), t("suggest_replace"), t("replace")))) return;
    const r = await post(`/api/cases/${k.id}/suggest`); change(r.items, r.visits); setNewIds(new Set(r.items.map((i: PlanItem) => i.id))); setCurV(1); toast(t("suggested"));
  };
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName) && undo.length) { e.preventDefault(); setItems(undo[undo.length - 1]!); setUndo(undo.slice(0, -1)); setDirty(true); } }; addEventListener("keydown", h); return () => removeEventListener("keydown", h); }, [undo]);

  const cur$ = me?.clinic?.defaultCurrency ?? "EUR", showMoney = me?.perms?.["field.price"] !== "hide";
  const ql = q.toLowerCase();
  return <>
    <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
      <div className="row" style={{ gap: 6 }}><span className="small muted">{t("visits")}</span><button className="btn sm icon" disabled={!editable || visits <= 1} onClick={() => { if (items.some((i) => i.v === visits)) return toast(t("visit_not_empty")); setVisits(visits - 1); setDirty(true); }}>−</button>
        <b className="num" style={{ minWidth: 16, textAlign: "center" }}>{visits}</b><button className="btn sm icon" disabled={!editable || visits >= 10} onClick={() => { setVisits(visits + 1); setCurV(visits + 1); setDirty(true); }}>+</button></div>
      <div className="vtabs">{Array.from({ length: visits }, (_, i) => i + 1).map((v) => { const n = items.filter((i) => i.v === v).length;
        return <button key={v} className={"vtab" + (cur === v ? " on" : "")} onClick={() => setCurV(v)}><span className="dot" style={{ background: vcol(v) }} />{t("visit_n", { n: v })}<span className={"c" + (n ? "" : " e")}>{n || t("empty")}</span></button>; })}</div>
      <span className="grow" />
      {dirty && <span className="unsaved">{t("unsaved")}</span>}
      {editable && <><button className="btn sm" onClick={suggest} title={t("suggest_tip")}><Icon n="spark" />{t("suggest")}</button>
        <button className="btn sm icon" disabled={!undo.length} title={t("undo") + " (Ctrl+Z)"} onClick={() => { setItems(undo[undo.length - 1]!); setUndo(undo.slice(0, -1)); setDirty(true); }}><Icon n="undo" /></button>
        <button className="btn sm" disabled={!dirty} onClick={() => saveDraft()}>{t("save_draft")}</button></>}
      {can("case.diagnose") && <button className="btn sm pri" disabled={!items.length || busy} onClick={() => complete(false)}>{t("complete_plan")}</button>}
    </div>
    <div className="ws">
      <div className="col">
        <Chart states={states} sel={sel} preview={preview} spans={spans} numbering={me?.clinic?.toothNumbering} onStroke={editable ? onStroke : undefined} />
        <div className="selbar"><span className="muted">{t("selected")}:</span> <b className="num">{sortedSel.length ? sortedSel.join(", ") : "—"}</b> · <span className="dot" style={{ background: vcol(cur) }} /> {t("visit_n", { n: cur })}
          <span className="grow" />{[["u", UPPER], ["l", LOWER]].map(([j, row]) => <button key={j as string} className="btn xs" onClick={() => { const r = row as number[]; const all = r.every((x) => sel.has(x)); const n = new Set(sel); r.forEach((x) => all ? n.delete(x) : n.add(x)); setSel(n); setPick((p) => p.b ? {} : p); }}>{t(j === "u" ? "jaw_u" : "jaw_l")}</button>)}
          {sel.size > 0 && <button className="btn xs ghost" onClick={() => { setSel(new Set()); setPick((p) => p.b ? {} : p); }}>{t("clear_sel")}</button>}</div>
        <div className="row between" style={{ marginTop: 6 }}><h2>{t("plan_summary")}</h2>{k.situationSkipped && <span className="bdg">{t("sit_skipped")}</span>}</div>
        <div className="col">{Array.from({ length: visits }, (_, i) => i + 1).map((v) => { const its = items.filter((i) => i.v === v);
          return <div key={v} className="plan-v"><div className="h"><span className="dot" style={{ background: vcol(v) }} />{t("visit_n", { n: v })}<span className="grow" />{its.length ? <span className="tiny muted">{t("n_items", { n: its.length })}</span> : <span className="tiny" style={{ color: "var(--err)" }}>{t("empty_visit")}</span>}</div>
            {its.map((it) => { const tx = it.tx ? cat.tx(it.tx) : undefined, b = brandOf(cat, it), bb = it.b ? cat.bundle(it.b) : undefined;
              return <div key={it.id} className={"pitem" + (newIds.has(it.id) ? " new" : "")}><i className="dot" style={{ background: bb?.color ?? tx?.color ?? "#94A3B8", borderRadius: 3 }} />
                <div className="grow"><div style={{ fontWeight: 550 }}>{itemName(cat, it, lang)}{bb && <span className="bdg brand" style={{ marginInlineStart: 6 }}>{t("package")}</span>}{it.auto && <span className="bdg" style={{ marginInlineStart: 6 }}>{t("auto")}</span>}</div>
                  <div className="t">{it.teeth?.length ? `${t("teeth")}: ${it.teeth.join(", ")}` : bb ? `${t("teeth")}: ${bb.teeth.join(", ")}` : it.jaws?.length ? it.jaws.map((j) => t(j === "u" ? "jaw_u" : "jaw_l")).join(" + ") : `× ${it.qty ?? 1}`}{b ? ` · ${b.n}` : ""}{bb?.crown.length === 14 ? <b> · {t("full_jaw")}</b> : null}</div></div>
                {editable && <><select className="inp sm" style={{ width: "auto" }} value={it.v} title={t("move_visit")} onChange={(e) => change(items.map((x) => x.id === it.id ? { ...x, v: +e.target.value } : x))}>{Array.from({ length: visits }, (_, j) => <option key={j} value={j + 1}>V{j + 1}</option>)}</select>
                  <button className="btn xs ghost icon" title={t("remove")} onClick={() => change(items.filter((x) => x.id !== it.id))}><Icon n="x" /></button></>}</div>; })}</div>; })}</div>
      </div>
      <div className="col" style={{ gap: 12 }}>
        {editable && <><div className="small muted">{t("plan_steps")}</div>
          <div className="card"><div className="hd" style={{ padding: "10px 12px" }}><div className="seg grow"><button style={{ flex: 1 }} className={tab === "tx" ? "on" : ""} onClick={() => setTab("tx")}>{t("treatments")}</button><button style={{ flex: 1 }} className={tab === "b" ? "on" : ""} onClick={() => setTab("b")}>{t("bundles")}</button></div></div>
            <div className="bd picker" style={{ padding: 12 }}>
              <input className="inp sm" placeholder={t("search_tx")} value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="txlist">{tab === "tx" ? Object.keys(CATEGORIES).map((c) => { const xs = cat.treatments.filter((x) => x.cat === c && x.active && (!ql || x.n.join(" ").toLowerCase().includes(ql))); if (!xs.length) return null;
                return <div key={c}><div className="txcat">{tn(CATEGORIES[c], lang)}</div>{xs.map((x) => <div key={x.id} className={"tx" + (pick.tx === x.id ? " on" : "")} onClick={() => pickTx(x.id)}><i style={{ background: x.color ?? "#94A3B8" }} /><span>{tn(x.n, lang)}</span>
                  <span className="p">{showMoney ? money(convert(cat, x.brands ? Math.min(...x.brands.map((b) => b.price)) : x.price, cur$), cur$) + (x.brands ? "+" : "") : ""} <span className="faint">/{t("u_" + x.unit)}</span></span></div>)}</div>; })
                : cat.bundles.filter((b) => b.active && (!ql || b.n.join(" ").toLowerCase().includes(ql))).map((b) => <div key={b.id} className={"tx" + (pick.b === b.id ? " on" : "")} onClick={() => pickB(b.id)}><i style={{ background: b.color }} />
                  <span>{tn(b.n, lang)}<div className="tiny muted">{t(b.jaw === "u" ? "jaw_u" : "jaw_l")} · {b.teeth.length} {t("teeth_s")}{b.prereq ? ` · ${t("needs_imp", { n: b.prereq.count })}` : ""}{b.minVisits > 1 ? ` · ${t("min_v", { n: b.minVisits })}` : ""}</div></span>
                  <span className="p">{showMoney ? money(convert(cat, b.price, cur$), cur$) : ""}</span></div>)}</div>
              {x && <div className="col" style={{ gap: 8, paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                {x.brands && <label className="f">{x.id === "graft" ? t("amount") : t("brand")}<select className="inp sm" value={brand ?? ""} onChange={(e) => setBrand(e.target.value)}>{x.brands.map((b) => <option key={b.id} value={b.id}>{b.n}{showMoney ? " — " + money(convert(cat, b.price, cur$), cur$) : ""}</option>)}</select></label>}
                {x.unit === "arch" && <div className="row" style={{ gap: 6 }}><span className="small muted">{t("jaw")}:</span>{(["u", "l"] as const).map((j) => <button key={j} className={"chip" + (jaws.includes(j) ? " on" : "")} onClick={() => setJaws(jaws.includes(j) ? jaws.filter((y) => y !== j) : [...jaws, j])}>{t(j === "u" ? "jaw_u" : "jaw_l")}</button>)}</div>}
                {(x.unit === "piece" || x.unit === "mouth") && <label className="f">{t("qty")}<input className="inp sm" type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value || 1)} style={{ width: 90 }} /></label>}
                {x.desc && <div className="tiny muted">{tn(x.desc, lang)}</div>}
                <div className="tiny faint">{t("allowed_v")}: {x.visits.map((v) => "V" + v).join(", ")} · {t("unit")}: {t("u_" + x.unit)}</div></div>}
              <button className="btn pri" disabled={!canAdd} style={{ width: "100%" }} onClick={add}><Icon n="plus" />{!x && !bu ? t("pick_first") : needTeeth && !sel.size ? t("tap_teeth") : t("add_to_visit", { n: cur }) + (needTeeth ? ` · ${sel.size} ${t("teeth_s")}` : "")}</button>
            </div></div></>}
        <div className="col" style={{ gap: 6 }}>{items.length ? (rules.length ? <RuleList rules={rules} /> : <div className="alert ok"><Icon n="ok" /><span>{t("rules_ok")}</span></div>) : null}</div>
        {k.dxAt && <div className="tiny muted">✓ {t("cs_diagnosed")} · {new Date(k.dxAt).toLocaleString()}</div>}
      </div>
    </div>
    {dlg && <Modal onClose={() => setDlg(null)}><div className="hd"><Icon n={dlg.kind === "block" ? "ban" : "alert"} size={28} style={{ color: dlg.kind === "block" ? "var(--err)" : "var(--warn)" }} /><div><h2>{t(dlg.kind === "block" ? "cant_complete" : "clin_warn")}</h2><p className="muted small" style={{ margin: "4px 0 0" }}>{t(dlg.kind === "block" ? "cant_complete_d" : "clin_warn_d")}</p></div></div>
      <div className="bd col"><RuleList rules={dlg.rules} /></div>
      <div className="ft">{dlg.kind === "block" ? <button className="btn pri" onClick={() => setDlg(null)}>{t("ok")}</button> : <><button className="btn" onClick={() => setDlg(null)}>{t("go_back")}</button><button className="btn pri" disabled={busy} onClick={() => complete(true)}>{t("ack_proceed")}</button></>}</div></Modal>}
  </>;
}
