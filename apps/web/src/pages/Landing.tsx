// Landing page yönetimi: liste, şablondan oluştur, blok düzenleyici, yayınla
import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, put, del } from "../lib/api.ts";
import { PageHead, Spinner, Empty, Switch, toast, toastErr, confirmBox } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";

const TYPES = ["hero", "benefits", "prices", "testimonials", "gallery", "team", "faq", "text", "cta", "form"];

export default function Landing() { const { id } = useParams<{ id?: string }>(); return id ? <Editor id={id} /> : <List />; }

function List() {
  const { t } = useT(); const can = useCan(); const [, nav] = useLocation();
  const { data } = useQuery({ queryKey: ["landing"], queryFn: () => get<any[]>("/api/landing") });
  const { data: tpl } = useQuery({ queryKey: ["landing-tpl"], queryFn: () => get<any[]>("/api/landing/templates") });
  const create = async (template?: string) => { try { const r = await post("/api/landing", { template }); nav(`/landing/${r.id}`); } catch (e) { toastErr(e); } };
  return <><PageHead title={t("nav_landing")} sub={t("landing_sub")} actions={can("settings.manage") && <button className="btn pri" onClick={() => create()}><Icon n="plus" />{t("new")}</button>} />
    {can("settings.manage") && <div className="card pad row wrap" style={{ gap: 8, marginBottom: 14 }}><span className="small muted">{t("seq_templates")}:</span>{(tpl ?? []).map((x) => <button key={x.key} className="chip" onClick={() => create(x.key)}><Icon n="spark" size={13} />{x.title} · {x.lang.toUpperCase()}</button>)}</div>}
    <div className="card">{!data ? <Spinner /> : !data.length ? <Empty icon="globe" text={t("no_records")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>URL</th><th className="r">{t("views")}</th><th className="r">Lead</th><th className="r">{t("conversion")}</th><th>{t("status")}</th></tr></thead><tbody>
      {data.map((p) => <tr key={p.id} className="click" onClick={() => nav(`/landing/${p.id}`)}><td><b>{p.title}</b><div className="tiny muted">{p.campaign}</div></td><td className="small"><a href={p.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>/{p.slug}</a></td>
        <td className="r num">{p.views}</td><td className="r num">{p.leads}</td><td className="r num">{p.views ? ((100 * p.leads) / p.views).toFixed(1) + "%" : "—"}</td><td><span className={"bdg " + (p.published ? "ok" : "")}>{p.published ? t("published") : t("draft")}</span></td></tr>)}</tbody></table></div>}</div></>;
}

function Editor({ id }: { id: string }) {
  const { t } = useT(); const qc = useQueryClient(); const [, nav] = useLocation(); const can = useCan();
  const { data } = useQuery({ queryKey: ["landing", id], queryFn: () => get(`/api/landing/${id}`) });
  const [d, setD] = useState<any>(null);
  if (!data) return <Spinner />;
  const p = d ?? data; const set = (x: any) => setD({ ...p, ...x }); const ro = !can("settings.manage");
  const setB = (i: number, props: any) => set({ blocks: p.blocks.map((b: any, j: number) => (j === i ? { ...b, props: { ...b.props, ...props } } : b)) });
  const move = (i: number, k: number) => { const a = [...p.blocks]; const j = i + k; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ blocks: a }); };
  const save = async (extra: any = {}) => { try { await put(`/api/landing/${id}`, { slug: p.slug, title: p.title, lang: p.lang, blocks: p.blocks, theme: p.theme ?? {}, campaign: p.campaign ?? null, published: p.published, ...extra }); setD(null); qc.invalidateQueries({ queryKey: ["landing"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  const str = (v: any) => (typeof v === "string" ? v : v?.[p.lang] ?? v?.en ?? "");
  return <><PageHead title={<input className="inp" style={{ fontSize: 20, fontWeight: 700, maxWidth: 480 }} disabled={ro} value={p.title} onChange={(e) => set({ title: e.target.value })} />} sub={<Link href="/landing">← {t("nav_landing")}</Link>}
    actions={<><a className="btn" href={data.url + "?preview=1"} target="_blank" rel="noopener"><Icon n="eye" />{t("preview")}</a>{!ro && <><Switch checked={p.published} onChange={(v) => save({ published: v })} label={t("published")} />
      <button className="btn ghost danger" onClick={async () => { if (await confirmBox(t("delete"), p.title, t("delete"), true)) { await del(`/api/landing/${id}`); nav("/landing"); } }}><Icon n="trash" /></button><button className="btn pri" disabled={!d} onClick={() => save()}>{t("save")}</button></>}</>} />
    <div className="side-grid"><div className="col" style={{ gap: 10 }}>
      {p.blocks.map((b: any, i: number) => <div key={i} className="card pad" style={{ padding: 12 }}><div className="row" style={{ gap: 6, marginBottom: 6 }}><b className="small grow">{t("lb_" + b.type)}</b>
        {!ro && <><button className="btn xs ghost icon" onClick={() => move(i, -1)}>↑</button><button className="btn xs ghost icon" onClick={() => move(i, 1)}>↓</button><button className="btn xs ghost icon danger" onClick={() => set({ blocks: p.blocks.filter((_: any, j: number) => j !== i) })}><Icon n="x" /></button></>}</div>
        {["hero", "cta", "text", "form", "prices"].includes(b.type) && <input className="inp sm" disabled={ro} placeholder={t("title")} value={str(b.props.title)} onChange={(e) => setB(i, { title: e.target.value })} style={{ marginBottom: 6 }} />}
        {b.type === "hero" && <><textarea className="inp" rows={2} disabled={ro} placeholder={t("subtitle")} value={str(b.props.subtitle)} onChange={(e) => setB(i, { subtitle: e.target.value })} /><input className="inp sm" disabled={ro} placeholder={t("button_text")} value={str(b.props.cta)} onChange={(e) => setB(i, { cta: e.target.value })} style={{ marginTop: 6 }} /></>}
        {b.type === "cta" && <input className="inp sm" disabled={ro} placeholder={t("button_text")} value={str(b.props.cta)} onChange={(e) => setB(i, { cta: e.target.value })} />}
        {b.type === "text" && <textarea className="inp" rows={4} disabled={ro} value={str(b.props.body)} onChange={(e) => setB(i, { body: e.target.value })} />}
        {b.type === "benefits" && <textarea className="inp" rows={4} disabled={ro} placeholder={t("one_per_line")} value={((b.props.items as any[]) ?? []).map(str).join("\n")} onChange={(e) => setB(i, { items: e.target.value.split("\n").filter(Boolean) })} />}
        {b.type === "prices" && <input className="inp sm" disabled={ro} placeholder="implant, crown_zr, ao4_u…" value={[...((b.props.tx as string[]) ?? []), ...((b.props.bundles as string[]) ?? [])].join(", ")}
          onChange={(e) => { const all = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); setB(i, { tx: all.filter((x) => !/_[ul]$/.test(x)), bundles: all.filter((x) => /_[ul]$/.test(x)) }); }} />}
        {b.type === "faq" && <textarea className="inp" rows={4} disabled={ro} placeholder={t("faq_format")} value={((b.props.items as any[]) ?? []).map((x) => `${str(x.q)} | ${str(x.a)}`).join("\n")} onChange={(e) => setB(i, { items: e.target.value.split("\n").filter((l) => l.includes("|")).map((l) => { const [q, ...a] = l.split("|"); return { q: q!.trim(), a: a.join("|").trim() }; }) })} />}
        {["testimonials", "gallery", "team"].includes(b.type) && <span className="tiny muted">{t("lb_from_content")}</span>}
      </div>)}
      {!ro && <div className="row wrap" style={{ gap: 6 }}>{TYPES.map((k) => <button key={k} className="chip" onClick={() => set({ blocks: [...p.blocks, { type: k, props: {} }] })}><Icon n="plus" size={12} />{t("lb_" + k)}</button>)}</div>}
    </div>
      <div className="card pad col" style={{ gap: 10 }}><b className="small">⚙️ {t("settings")}</b>
        <label className="f">{t("page_url")}<input className="inp sm" disabled={ro} value={p.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label>
        <label className="f">{t("language")}<select className="inp sm" disabled={ro} value={p.lang} onChange={(e) => set({ lang: e.target.value })}>{["tr", "en", "de", "ar"].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select></label>
        <label className="f">{t("campaign")}<input className="inp sm" disabled={ro} value={p.campaign ?? ""} onChange={(e) => set({ campaign: e.target.value })} /></label>
        <label className="row small" style={{ gap: 6 }}>{t("color")}<input type="color" disabled={ro} value={p.theme?.color ?? "#0E7C86"} onChange={(e) => set({ theme: { ...(p.theme ?? {}), color: e.target.value } })} /></label>
        <div className="tiny muted" style={{ wordBreak: "break-all" }}>{data.url}</div>
        <div className="tiny muted">👁 {data.views} · 📝 {data.leads} lead</div>
      </div></div></>;
}
