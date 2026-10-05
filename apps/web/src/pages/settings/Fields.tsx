// Ayarlar → Özel alanlar (lead / deal)
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, post, patch, del } from "../../lib/api.ts";
import { Spinner, toast, toastErr, Switch, confirmBox, Empty } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { cfLabel } from "../../components/LeadFilters.tsx";

const TYPES = ["text", "textarea", "number", "date", "select", "multiselect", "boolean", "url"];

export default function FieldsTab() {
  const { t, lang } = useT(); const qc = useQueryClient();
  const [entity, setEntity] = useState("lead");
  const { data } = useQuery({ queryKey: ["custom-fields-all", entity], queryFn: () => get<any[]>(`/api/custom-fields?entity=${entity}&all=true`) });
  const [nf, setNf] = useState({ label: "", type: "text", options: "" });
  const r = () => { qc.invalidateQueries({ queryKey: ["custom-fields-all"] }); qc.invalidateQueries({ queryKey: ["custom-fields"] }); };
  const save = async (id: string, b: any) => { try { await patch(`/api/custom-fields/${id}`, b); r(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const add = async () => { try { await post("/api/custom-fields", { entity, label: nf.label, type: nf.type, options: nf.options.split(",").map((s) => s.trim()).filter(Boolean), sort: (data?.length ?? 0) * 10 }); setNf({ label: "", type: "text", options: "" }); r(); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="col" style={{ gap: 14 }}>
    <div className="alert info"><Icon n="info" /><span>{t("fields_explain")}</span></div>
    <div className="seg" style={{ alignSelf: "flex-start" }}>{["lead", "deal"].map((e) => <button key={e} className={entity === e ? "on" : ""} onClick={() => setEntity(e)}>{e === "lead" ? t("nav_leads") : t("nav_deals")}</button>)}</div>
    <div className="card">{!data ? <Spinner /> : !data.length ? <Empty icon="list" text={t("no_records")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("label")}</th><th>{t("type")}</th><th>{t("key")}</th><th>{t("options")}</th><th>{t("in_list")}</th><th>{t("active")}</th><th /></tr></thead><tbody>
      {data.map((f) => <tr key={f.id} style={{ opacity: f.active ? 1 : 0.5 }}>
        <td><input className="inp sm" defaultValue={cfLabel(f, "default")} onBlur={(e) => e.target.value !== cfLabel(f, "default") && save(f.id, { label: e.target.value })} /></td>
        <td className="small">{t("cft_" + f.type)}</td><td><span className="code">{f.key}</span></td>
        <td>{["select", "multiselect"].includes(f.type) ? <input className="inp sm" defaultValue={(f.options as string[]).join(", ")} onBlur={(e) => save(f.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /> : <span className="faint">—</span>}</td>
        <td><Switch checked={f.showInList} onChange={(v) => save(f.id, { showInList: v })} /></td><td><Switch checked={f.active} onChange={(v) => save(f.id, { active: v })} /></td>
        <td><button className="btn xs ghost icon danger" onClick={async () => { if (await confirmBox(t("disable"), cfLabel(f, lang), t("disable"), true)) { await del(`/api/custom-fields/${f.id}`); r(); } }}><Icon n="trash" /></button></td></tr>)}
    </tbody></table></div>}
      <div className="bd row wrap" style={{ gap: 8, borderTop: "1px solid var(--line)" }}>
        <input className="inp sm" style={{ maxWidth: 220 }} placeholder={t("label")} value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} />
        <select className="inp sm" style={{ width: "auto" }} value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value })}>{TYPES.map((x) => <option key={x} value={x}>{t("cft_" + x)}</option>)}</select>
        {["select", "multiselect"].includes(nf.type) && <input className="inp sm grow" placeholder={t("options_csv")} value={nf.options} onChange={(e) => setNf({ ...nf, options: e.target.value })} />}
        <button className="btn sm pri" disabled={!nf.label} onClick={add}><Icon n="plus" />{t("add")}</button>
      </div></div>
  </div>;
}

/** Kayıt sayfasında özel alan düzenleyici */
export function CustomFieldsCard({ values, onSave, editable, entity = "lead" }: { values: Record<string, any>; onSave: (cf: Record<string, unknown>) => void; editable: boolean; entity?: string }) {
  const { t, lang } = useT();
  const { data } = useQuery({ queryKey: ["custom-fields", entity], queryFn: () => get<any[]>(`/api/custom-fields?entity=${entity}`), staleTime: 60_000 });
  if (!data?.length) return null;
  const save = (k: string, v: unknown) => onSave({ [k]: v });
  return <div className="card"><div className="hd"><h2 className="grow">{t("custom_fields")}</h2></div><div className="bd grid g2" key={JSON.stringify(values)}>
    {data.map((f) => { const v = values?.[f.key]; const L = cfLabel(f, lang) + (f.required ? " *" : "");
      if (f.type === "boolean") return <label key={f.id} className="f">{L}<select className="inp sm" disabled={!editable} defaultValue={v === undefined || v === null ? "" : String(v)} onChange={(e) => save(f.key, e.target.value === "" ? null : e.target.value === "true")}><option value="">—</option><option value="true">{t("yes")}</option><option value="false">{t("no")}</option></select></label>;
      if (f.type === "select") return <label key={f.id} className="f">{L}<select className="inp sm" disabled={!editable} defaultValue={v ?? ""} onChange={(e) => save(f.key, e.target.value || null)}><option value="">—</option>{(f.options as string[]).map((o) => <option key={o}>{o}</option>)}</select></label>;
      if (f.type === "multiselect") return <div key={f.id} className="f" style={{ gridColumn: "1/-1" }}>{L}<div className="row wrap" style={{ gap: 6, marginTop: 4 }}>{(f.options as string[]).map((o) => { const on = (v ?? []).includes(o);
        return <button key={o} type="button" disabled={!editable} className={"chip" + (on ? " on" : "")} onClick={() => save(f.key, on ? (v ?? []).filter((x: string) => x !== o) : [...(v ?? []), o])}>{o}</button>; })}</div></div>;
      if (f.type === "textarea") return <label key={f.id} className="f" style={{ gridColumn: "1/-1" }}>{L}<textarea className="inp" disabled={!editable} defaultValue={v ?? ""} onBlur={(e) => e.target.value !== (v ?? "") && save(f.key, e.target.value)} /></label>;
      return <label key={f.id} className="f">{L}{f.type === "url" && v ? <a className="tiny" href={v} target="_blank" rel="noopener"> ↗</a> : null}<input className="inp sm" disabled={!editable} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text"} defaultValue={v ?? ""} onBlur={(e) => e.target.value !== String(v ?? "") && save(f.key, e.target.value)} /></label>; })}
  </div></div>;
}
