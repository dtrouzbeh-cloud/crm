import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, post, patch, del } from "../../lib/api.ts";
import { Spinner, toast, toastErr, Switch, confirmBox, Drawer, Empty } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { useMe, useInvalidateMe } from "../../lib/auth.ts";
import { LANG_NAMES } from "@dentaflow/core/i18n";

const KINDS = ["intake", "consent", "survey"] as const;
const TYPES = ["heading", "text", "textarea", "number", "date", "yesno", "choice", "multi", "checkbox", "nps", "rating"];
const FLAGS = ["diabetes", "heart", "anticoag", "bisph", "chemo", "pregnant", "smoker"];
const MAPS = ["age", "medications", "allergies", "notes"];

export default function FormsTab() {
  const { t } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["form-templates"], queryFn: () => get<any[]>("/api/forms/templates") });
  const [edit, setEdit] = useState<any | null>(null);
  if (!data) return <Spinner />;
  const r = () => qc.invalidateQueries({ queryKey: ["form-templates"] });
  return <div className="col" style={{ gap: 14 }}>
    <div className="alert info"><Icon n="info" /><span>{t("forms_explain")}</span></div>
    {KINDS.map((k) => <div key={k} className="card"><div className="hd"><h2 className="grow">{t("fk_" + k)}</h2>
      <button className="btn sm" onClick={() => setEdit({ kind: k, name: "", lang: "en", title: "", body: "", fields: [], requireSignature: k === "consent", active: true })}><Icon n="plus" />{t("new")}</button></div>
      <div className="twrap"><table className="tbl"><tbody>
        {data.filter((f) => f.kind === k).map((f) => <tr key={f.id} style={{ opacity: f.active ? 1 : 0.5 }}>
          <td><b>{f.name}</b><div className="tiny muted">{f.title}</div></td>
          <td><span className="bdg">{f.lang.toUpperCase()}</span></td>
          <td className="small muted">{f.fields.filter((x: any) => x.type !== "heading").length} {t("fields")}{f.requireSignature && <> · ✍️ {t("signature")}</>}</td>
          <td className="small muted">v{f.version} · {f.used}×</td>
          <td style={{ textAlign: "end", whiteSpace: "nowrap" }}>
            <button className="btn xs ghost" onClick={() => setEdit({ ...f })}><Icon n="pen" />{t("edit")}</button>
            <button className="btn xs ghost icon" title={t("duplicate")} onClick={async () => { const { id, used, version, createdAt, updatedAt, clinicId, key, ...rest } = f; setEdit({ ...rest, name: f.name + " (2)" }); }}><Icon n="copy" /></button>
            <button className="btn xs ghost icon danger" onClick={async () => { if (await confirmBox(t("delete"), f.name, t("delete"), true)) { const x = await del(`/api/forms/templates/${f.id}`); toast(x.archived ? t("archived") : t("deleted")); r(); } }}><Icon n="trash" /></button>
          </td></tr>)}
      </tbody></table></div>
      {!data.some((f) => f.kind === k) && <Empty text={t("no_records")} />}
    </div>)}
    <ReviewLinks />
    {edit && <Editor init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); r(); }} />}
  </div>;
}

function ReviewLinks() {
  const { t } = useT(); const { data: me } = useMe(); const inv = useInvalidateMe();
  const [links, setLinks] = useState<{ name: string; url: string }[]>(((me?.clinic as any)?.settings?.reviewLinks as any[]) ?? []);
  const save = async () => { try { await patch("/api/clinic", { settings: { reviewLinks: links.filter((l) => /^https:\/\//.test(l.url)) } }); inv(); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="card"><div className="hd"><h2 className="grow">⭐ {t("review_links")}</h2></div><div className="bd col" style={{ gap: 8 }}>
    <p className="small muted" style={{ margin: 0 }}>{t("review_links_hint")}</p>
    {links.map((l, i) => <div key={i} className="row" style={{ gap: 8 }}>
      <input className="inp sm" style={{ maxWidth: 180 }} value={l.name} placeholder="Google" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
      <input className="inp sm grow" value={l.url} placeholder="https://g.page/r/…/review" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
      <button className="btn xs ghost icon danger" onClick={() => setLinks(links.filter((_, j) => j !== i))}><Icon n="x" /></button></div>)}
    <div className="row" style={{ gap: 8 }}>
      <button className="btn sm" onClick={() => setLinks([...links, { name: ["Google", "Trustpilot", "Whatclinic", "Facebook"][links.length] ?? "", url: "" }])}><Icon n="plus" />{t("add")}</button>
      <button className="btn sm pri" onClick={save}>{t("save")}</button></div>
  </div></div>;
}

function Editor({ init, onClose, onSaved }: { init: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [f, setF] = useState<any>(init); const set = (p: any) => setF({ ...f, ...p });
  const setField = (i: number, p: any) => set({ fields: f.fields.map((x: any, j: number) => (j === i ? { ...x, ...p } : x)) });
  const move = (i: number, d: number) => { const a = [...f.fields]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); set({ fields: a }); };
  const add = (type: string) => { let n = 1; while (f.fields.some((x: any) => x.key === `${type}_${n}`)) n++; set({ fields: [...f.fields, { key: `${type}_${n}`, type, label: "", required: false }] }); };
  const save = async () => {
    const body = { kind: f.kind, name: f.name, lang: f.lang, title: f.title, body: f.body, requireSignature: f.requireSignature, active: f.active,
      fields: f.fields.map((x: any) => ({ key: x.key, type: x.type, label: x.label || x.key, required: !!x.required, ...(x.options?.length ? { options: x.options } : {}), ...(x.flag ? { flag: x.flag } : {}), ...(x.map ? { map: x.map } : {}) })) };
    try { if (f.id) await patch(`/api/forms/templates/${f.id}`, body); else await post("/api/forms/templates", body); toast(t("saved")); onSaved(); } catch (e) { toastErr(e); }
  };
  return <Drawer title={f.id ? f.name : t("new") + " · " + t("fk_" + f.kind)} onClose={onClose} width={720}
    footer={<><Switch checked={f.active} onChange={(v) => set({ active: v })} label={t("active")} /><span className="grow" /><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" onClick={save} disabled={!f.name || !f.title}>{t("save")}</button></>}>
    <div className="grid g2" style={{ gap: 10 }}>
      <label className="f">{t("name")}<input className="inp" value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="f">{t("language")}<select className="inp" value={f.lang} onChange={(e) => set({ lang: e.target.value })}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}</select></label>
      <label className="f" style={{ gridColumn: "1/-1" }}>{t("form_title")}<input className="inp" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
      <label className="f" style={{ gridColumn: "1/-1" }}>{t("form_body")}<textarea className="inp" rows={8} value={f.body} onChange={(e) => set({ body: e.target.value })} /><span className="tiny faint">{t("form_body_hint")}</span></label>
      <div style={{ gridColumn: "1/-1" }}><Switch checked={f.requireSignature} onChange={(v) => set({ requireSignature: v })} label={"✍️ " + t("require_signature")} /></div>
    </div>
    <h3 style={{ margin: "18px 0 8px" }}>{t("fields")}</h3>
    <div className="col" style={{ gap: 8 }}>
      {f.fields.map((x: any, i: number) => <div key={i} className="card pad" style={{ padding: 10 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <select className="inp sm" style={{ width: 120 }} value={x.type} onChange={(e) => setField(i, { type: e.target.value })}>{TYPES.map((ty) => <option key={ty} value={ty}>{t("ft_" + ty)}</option>)}</select>
          <input className="inp sm grow" value={x.label} placeholder={t("label")} onChange={(e) => setField(i, { label: e.target.value })} />
          {x.type !== "heading" && <label className="row tiny muted" style={{ gap: 4 }}><input type="checkbox" checked={!!x.required} onChange={(e) => setField(i, { required: e.target.checked })} />{t("required")}</label>}
          <button className="btn xs ghost icon" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
          <button className="btn xs ghost icon" disabled={i === f.fields.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button className="btn xs ghost icon danger" onClick={() => set({ fields: f.fields.filter((_: any, j: number) => j !== i) })}><Icon n="x" /></button>
        </div>
        {(x.type === "choice" || x.type === "multi") && <input className="inp sm" style={{ marginTop: 6 }} placeholder={t("options_csv")} defaultValue={(x.options ?? []).join(", ")} onBlur={(e) => setField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />}
        {f.kind === "intake" && x.type === "yesno" && <label className="row tiny muted" style={{ gap: 6, marginTop: 6 }}>{t("maps_flag")}<select className="inp sm" style={{ width: "auto" }} value={x.flag ?? ""} onChange={(e) => setField(i, { flag: e.target.value || undefined })}><option value="">—</option>{FLAGS.map((fl) => <option key={fl} value={fl}>{t("med_" + fl)}</option>)}</select></label>}
        {f.kind === "intake" && ["text", "textarea", "number"].includes(x.type) && <label className="row tiny muted" style={{ gap: 6, marginTop: 6 }}>{t("maps_field")}<select className="inp sm" style={{ width: "auto" }} value={x.map ?? ""} onChange={(e) => setField(i, { map: e.target.value || undefined })}><option value="">—</option>{MAPS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>}
      </div>)}
      <div className="row wrap" style={{ gap: 6 }}>{TYPES.map((ty) => <button key={ty} className="chip" onClick={() => add(ty)}><Icon n="plus" size={12} />{t("ft_" + ty)}</button>)}</div>
    </div>
  </Drawer>;
}
