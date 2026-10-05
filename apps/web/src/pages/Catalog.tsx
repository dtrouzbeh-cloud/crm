import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { post, put, del } from "../lib/api.ts";
import { PageHead, Spinner, toast, toastErr, confirmBox, Switch, Drawer } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useMe } from "../lib/auth.ts";
import { useCatalog } from "../lib/catalog.ts";
import { CATEGORIES } from "@dentaflow/core/catalog";
import { convert, tn } from "@dentaflow/core/engine";

export default function Catalog() {
  const { tab = "tx" } = useParams<{ tab?: string }>(); const [, nav] = useLocation(); const { t, lang, money } = useT(); const { cat, raw } = useCatalog(); const { data: me } = useMe(); const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null); const [editing, setEditing] = useState<any>(null);
  if (!cat || !raw) return <Spinner />;
  const cur = me?.clinic?.defaultCurrency ?? "EUR";
  const refresh = () => qc.invalidateQueries({ queryKey: ["catalog"] });
  const saveTx = async (code: string, body: any) => { try { await put(`/api/catalog/treatments/${code}`, body); refresh(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const saveB = async (code: string, body: any) => { try { await put(`/api/catalog/bundles/${code}`, body); refresh(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const TABS = [["tx", "treatments", cat.treatments.length], ["b", "bundles", cat.bundles.length], ["hotels", "hotels", raw.hotels.length], ["rules", "clin_rules", null]] as const;
  return <>
    <PageHead title={t("nav_catalog")} sub={t("catalog_sub")} actions={tab === "tx" ? <><button className="btn" onClick={async () => { if (await confirmBox(t("reset_defaults"), t("reset_cat_q"), t("reset_defaults"), true)) { await post("/api/catalog/reset"); refresh(); } }}>{t("reset_defaults")}</button>
      <button className="btn pri" onClick={() => setEditing({ code: "x" + Date.now().toString(36), names: ["", "", "", ""], category: "other", unit: "tooth", render: "none", priceEur: 100, visits: [1, 2], isNew: true })}><Icon n="plus" />{t("new_tx")}</button></> : null} />
    <div className="tabs" style={{ marginBottom: 14 }}>{TABS.map(([k, l, n]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => nav(`/catalog/${k}`)}>{t(l)}{n != null && <span className="bdg">{n}</span>}</button>)}</div>
    {tab === "tx" && <><div className="alert info" style={{ marginBottom: 12 }}><Icon n="info" /><span>{t("cat_hint", { cur })}</span></div>
      {Object.keys(CATEGORIES).map((c) => { const xs = cat.treatments.filter((x) => x.cat === c); if (!xs.length) return null;
        return <div key={c} className="card" style={{ marginBottom: 12 }}><div className="hd"><h3 className="grow">{tn(CATEGORIES[c], lang)}</h3><span className="bdg">{xs.length}</span></div><div className="twrap"><table className="tbl"><thead><tr><th style={{ width: "34%" }}>{t("name")}</th><th>{t("unit")}</th><th>{t("allowed_v")}</th><th>{t("chart_icon")}</th><th className="r">{t("price")} (EUR)</th><th className="r">{cur}</th><th>{t("active")}</th><th /></tr></thead><tbody>
          {xs.map((x) => <>{/* satır */}<tr key={x.id}><td><div className="row"><i className="dot" style={{ background: x.color, borderRadius: 3 }} /><b style={{ fontWeight: 600 }}>{tn(x.n, lang)}</b></div>
            {x.brands && <button className="btn xs ghost" style={{ marginTop: 4 }} onClick={() => setOpen(open === x.id ? null : x.id)}>{x.brands.length} {t(x.id === "graft" ? "sizes" : "brands")} {open === x.id ? "▴" : "▾"}</button>}{x.tiers && <span className="bdg info">{t("tiers")}</span>}{x.prereq && <span className="bdg">{t("needs_imp", { n: x.prereq.count })}</span>}</td>
            <td className="small">{t("u_" + x.unit)}</td><td className="small">{x.visits.map((v) => "V" + v).join(" ")}</td><td className="small muted">{t("rd_" + x.render)}</td>
            <td className="r"><input className="inp sm num" type="number" min={0} defaultValue={x.price} style={{ width: 90, textAlign: "end" }} disabled={!!x.brands} onBlur={(e) => +e.target.value !== x.price && saveTx(x.id, { priceEur: +e.target.value || 0 })} /></td>
            <td className="r small muted num">{money(convert(cat, x.price, cur), cur)}</td><td><label className="switch"><input type="checkbox" defaultChecked={x.active} onChange={(e) => saveTx(x.id, { active: e.target.checked })} /><span /></label></td>
            <td><button className="btn xs ghost icon" onClick={() => setEditing({ code: x.id, names: x.n, category: x.cat, unit: x.unit, render: x.render, priceEur: x.price, visits: x.visits, material: x.mat ?? null, color: x.color })}><Icon n="edit" /></button></td></tr>
            {open === x.id && x.brands!.map((b, i) => <tr key={x.id + b.id} style={{ background: "var(--subtle)" }}><td colSpan={4} style={{ paddingInlineStart: 40 }}><input className="inp sm" defaultValue={b.n} style={{ maxWidth: 280 }} onBlur={(e) => { if (e.target.value === b.n) return; const brands = x.brands!.map((y, j) => j === i ? { ...y, n: e.target.value } : y); saveTx(x.id, { brands }); }} /> {b.form && b.form !== "std" && <span className="bdg">{t("form_" + b.form)}</span>}</td>
              <td className="r"><input className="inp sm num" type="number" defaultValue={b.price} style={{ width: 90, textAlign: "end" }} onBlur={(e) => { if (+e.target.value === b.price) return; const brands = x.brands!.map((y, j) => j === i ? { ...y, price: +e.target.value || 0 } : y); saveTx(x.id, { brands }); }} /></td>
              <td className="r small muted num">{money(convert(cat, b.price, cur), cur)}</td><td colSpan={2}><button className="btn xs ghost icon danger" onClick={() => saveTx(x.id, { brands: x.brands!.filter((_, j) => j !== i) })}><Icon n="x" /></button></td></tr>)}
            {open === x.id && <tr key={x.id + "add"} style={{ background: "var(--subtle)" }}><td colSpan={8} style={{ paddingInlineStart: 40 }}><button className="btn xs" onClick={() => saveTx(x.id, { brands: [...x.brands!, { id: "b" + Date.now().toString(36), n: t("new_brand"), price: x.brands!.at(-1)?.price ?? 0, form: "std" }] })}><Icon n="plus" />{t("add_brand")}</button></td></tr>}</>)}
        </tbody></table></div></div>; })}</>}
    {tab === "b" && <div className="card"><div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("jaw")}</th><th>{t("auto_teeth")}</th><th>{t("prereq")}</th><th>{t("allowed_v")}</th><th className="r">{t("price")} (EUR)</th><th>{t("active")}</th></tr></thead><tbody>
      {cat.bundles.map((b) => <tr key={b.id}><td><div className="row"><i className="dot" style={{ background: b.color, borderRadius: 3 }} /><b style={{ fontWeight: 600 }}>{tn(b.n, lang)}</b></div>{b.brands && <div className="tiny muted">{b.brands.map((x) => x.n.split(" / ")[0]).join(" · ")}</div>}</td>
        <td className="small">{t(b.jaw === "u" ? "jaw_u" : "jaw_l")}</td><td className="small num">{b.imp.length ? `${t("lg_implant")}: ${b.imp.join(", ")}` : ""}{b.crown.length ? <>{b.imp.length ? <br /> : null}{t("crowns")}: {b.crown[0]}–{b.crown.at(-1)} ({b.crown.length})</> : null}</td>
        <td className="small">{b.prereq ? t("needs_imp", { n: b.prereq.count }) : "—"}{b.minVisits > 1 && <><br />{t("min_v", { n: b.minVisits })}</>}</td><td className="small">{b.visits.map((v) => "V" + v).join(" ")}</td>
        <td className="r"><input className="inp sm num" type="number" defaultValue={b.price} style={{ width: 90, textAlign: "end" }} onBlur={(e) => +e.target.value !== b.price && saveB(b.id, { priceEur: +e.target.value || 0 })} /></td>
        <td><label className="switch"><input type="checkbox" defaultChecked={b.active} onChange={(e) => saveB(b.id, { active: e.target.checked })} /><span /></label></td></tr>)}</tbody></table></div></div>}
    {tab === "hotels" && <div className="card"><div className="hd"><h3 className="grow">{t("hotels")}</h3><button className="btn sm" onClick={async () => { await put("/api/catalog/hotels/new", { name: "Hotel", nightEur: 70 }); refresh(); }}><Icon n="plus" /></button></div><div className="bd col">
      {raw.hotels.map((h: any) => <div key={h.id} className="row wrap"><input className="inp sm grow" defaultValue={h.name} onBlur={(e) => put(`/api/catalog/hotels/${h.id}`, { name: e.target.value }).then(refresh)} />
        <select className="inp sm" style={{ width: "auto" }} defaultValue={h.stars ?? 4} onChange={(e) => put(`/api/catalog/hotels/${h.id}`, { stars: +e.target.value }).then(refresh)}>{[3, 4, 5].map((s) => <option key={s} value={s}>{s}★</option>)}</select>
        <input className="inp sm num" type="number" defaultValue={Number(h.nightEur)} style={{ width: 90 }} onBlur={(e) => put(`/api/catalog/hotels/${h.id}`, { nightEur: +e.target.value }).then(refresh)} /><span className="small muted">€/gece</span>
        <Switch checked={h.active} onChange={(v) => put(`/api/catalog/hotels/${h.id}`, { active: v }).then(refresh)} /><button className="btn xs ghost icon danger" onClick={async () => { if (await confirmBox(t("delete"), h.name, t("delete"), true)) { await del(`/api/catalog/hotels/${h.id}`); refresh(); } }}><Icon n="trash" /></button></div>)}</div></div>}
    {tab === "rules" && <div className="grid g2" style={{ alignItems: "start" }}><div className="card"><div className="hd"><h3 className="grow"><Icon n="lock" size={15} /> {t("rules_block")}</h3></div><div className="bd col">{raw.blockRules.map((k: string) => <div key={k} className="row small" style={{ alignItems: "flex-start" }}><span className="bdg err">{k}</span><span className="grow">{t("rd_rule_" + k)}</span></div>)}</div></div>
      <div className="card"><div className="hd"><h3 className="grow">{t("rules_warn")}</h3></div><div className="bd col">{raw.warnRules.filter((k: string) => k !== "VISIT").map((k: string) => <label key={k} className="row small" style={{ alignItems: "flex-start", cursor: "pointer" }}><span className="bdg warn">{k}</span><span className="grow">{t("rd_rule_" + k)}</span>
        <span className="switch"><input type="checkbox" defaultChecked={cat.rules[k] !== false} onChange={async (e) => { await put("/api/catalog/rules", { ...cat.rules, [k]: e.target.checked }); refresh(); }} /><span /></span></label>)}</div></div></div>}
    {editing && <TxEditor init={editing} onClose={() => setEditing(null)} onSave={async (b: any) => { await saveTx(editing.code, b); setEditing(null); }} />}
  </>;
}

function TxEditor({ init, onClose, onSave }: any) {
  const { t, lang } = useT(); const [f, setF] = useState({ ...init });
  return <Drawer title={init.isNew ? t("new_tx") : tn(init.names, lang)} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" onClick={() => onSave({ names: f.names.map((n: string, i: number) => n || f.names[1] || f.names[0]), category: f.category, unit: f.unit, render: f.render, priceEur: +f.priceEur, visits: f.visits, material: f.render === "crown" || f.render === "veneer" ? f.material ?? "zr" : null, color: f.color ?? "#0E7C86" })}>{t("save")}</button></>}>
    {["TR", "EN", "DE", "AR"].map((l, i) => <label key={l} className="f">{t("name")} ({l})<input className="inp" value={f.names[i] ?? ""} onChange={(e) => { const n = [...f.names]; n[i] = e.target.value; setF({ ...f, names: n }); }} /></label>)}
    <div className="grid g2"><label className="f">{t("category")}<select className="inp" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.keys(CATEGORIES).map((k) => <option key={k} value={k}>{tn(CATEGORIES[k], lang)}</option>)}</select></label>
      <label className="f">{t("unit")}<select className="inp" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{["tooth", "side", "arch", "mouth", "piece"].map((u) => <option key={u} value={u}>{t("u_" + u)}</option>)}</select></label></div>
    <div className="grid g2"><label className="f">{t("chart_icon")}<select className="inp" value={f.render} onChange={(e) => setF({ ...f, render: e.target.value })}>{["none", "implant", "crown", "veneer", "ext", "fill", "inlay", "rct", "graft", "sinus", "arch"].map((r) => <option key={r} value={r}>{t("rd_" + r)}</option>)}</select></label>
      <label className="f">{t("price")} (EUR)<input className="inp" type="number" value={f.priceEur} onChange={(e) => setF({ ...f, priceEur: e.target.value })} /></label></div>
    {(f.render === "crown" || f.render === "veneer") && <label className="f">Materyal<select className="inp" value={f.material ?? "zr"} onChange={(e) => setF({ ...f, material: e.target.value })}>{["zr", "emax", "srm", "por", "temp", "acr"].map((m) => <option key={m} value={m}>{t("lg_m_" + m)}</option>)}</select></label>}
    <label className="f">{t("allowed_v")}<div className="row">{[1, 2, 3, 4].map((v) => <label key={v} className="row small" style={{ gap: 4 }}><input type="checkbox" checked={f.visits.includes(v)} onChange={(e) => setF({ ...f, visits: e.target.checked ? [...f.visits, v].sort() : f.visits.filter((x: number) => x !== v) })} />V{v}</label>)}</div></label>
    <label className="f">Renk<input type="color" value={f.color ?? "#0E7C86"} onChange={(e) => setF({ ...f, color: e.target.value })} /></label>
  </Drawer>;
}
