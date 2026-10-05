// Lead listesi: gelişmiş filtreler (özel alanlar dahil) ve kayıtlı görünümler
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, del } from "../lib/api.ts";
import { toast, toastErr, confirmBox, Modal, Switch } from "./ui.tsx";
import { Icon } from "./Icon.tsx";
import { useMe, useCan } from "../lib/auth.ts";
import { FLAGS, TEMP } from "../lib/format.tsx";
import { LANG_NAMES } from "@dentaflow/core/i18n";

export type LeadFilter = { source?: string; temperature?: string; owner?: string; partner?: string; country?: string; language?: string; tag?: string; campaign?: string;
  createdFrom?: string; createdTo?: string; overdue?: boolean; noOwner?: boolean; cf?: Record<string, unknown> };
export const filterCount = (f: LeadFilter) => Object.entries(f).filter(([k, v]) => k === "cf" ? v && Object.keys(v as object).length : v !== undefined && v !== "" && v !== false).length;
export const filterParams = (f: LeadFilter) => ({ ...f, cf: f.cf && Object.keys(f.cf).length ? JSON.stringify(f.cf) : undefined, overdue: f.overdue || undefined, noOwner: f.noOwner || undefined });
export const cfLabel = (f: any, lang: string) => f.label?.[lang] ?? f.label?.default ?? f.key;

export function useCustomFields(entity = "lead") { return useQuery({ queryKey: ["custom-fields", entity], queryFn: () => get<any[]>(`/api/custom-fields?entity=${entity}`), staleTime: 60_000 }); }

export function FilterBar({ value, onChange }: { value: LeadFilter; onChange: (f: LeadFilter) => void }) {
  const { t, lang } = useT(); const { data: me } = useMe();
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => get<any[]>("/api/partners") });
  const { data: fields } = useCustomFields();
  const set = (p: Partial<LeadFilter>) => onChange({ ...value, ...p });
  const setCf = (k: string, v: unknown) => { const cf = { ...(value.cf ?? {}) }; if (v === "" || v === undefined || v === null) delete cf[k]; else cf[k] = v; set({ cf }); };
  const sel = (k: keyof LeadFilter, label: string, opts: [string, string][]) => <label className="f" style={{ minWidth: 130 }}><span className="tiny muted">{label}</span>
    <select className="inp sm" value={(value[k] as string) ?? ""} onChange={(e) => set({ [k]: e.target.value || undefined } as never)}><option value="">{t("all")}</option>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label>;
  const sources = ((me?.clinic as any)?.settings?.leadSources as string[]) ?? [];
  return <div className="row wrap" style={{ gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)", background: "var(--subtle)", alignItems: "flex-end" }}>
    {sel("source", t("source"), sources.map((s) => [s, t("src_" + s)]))}
    {sel("temperature", t("temp"), ["hot", "warm", "cold"].map((x) => [x, TEMP[x] + " " + t("temp_" + x)]))}
    {sel("owner", t("owner"), (team?.members ?? []).map((m: any) => [m.userId, m.name]))}
    {(partners?.length ?? 0) > 0 && sel("partner", t("partner"), (partners ?? []).map((p: any) => [p.id, p.name]))}
    {sel("country", t("country"), Object.keys(FLAGS).map((c) => [c, FLAGS[c] + " " + c]))}
    {sel("language", t("language"), Object.entries(LANG_NAMES) as [string, string][])}
    <label className="f"><span className="tiny muted">{t("tag")}</span><input className="inp sm" style={{ width: 110 }} value={value.tag ?? ""} onChange={(e) => set({ tag: e.target.value || undefined })} /></label>
    <label className="f"><span className="tiny muted">{t("created")}</span><div className="row" style={{ gap: 4 }}><input className="inp sm" type="date" style={{ width: 136 }} value={value.createdFrom ?? ""} onChange={(e) => set({ createdFrom: e.target.value || undefined })} /><input className="inp sm" type="date" style={{ width: 136 }} value={value.createdTo ?? ""} onChange={(e) => set({ createdTo: e.target.value || undefined })} /></div></label>
    {(fields ?? []).filter((f) => ["select", "boolean", "text"].includes(f.type)).map((f) => <label key={f.id} className="f" style={{ minWidth: 130 }}><span className="tiny muted">{cfLabel(f, lang)}</span>
      {f.type === "select" ? <select className="inp sm" value={(value.cf?.[f.key] as string) ?? ""} onChange={(e) => setCf(f.key, e.target.value)}><option value="">{t("all")}</option>{(f.options as string[]).map((o) => <option key={o}>{o}</option>)}</select>
        : f.type === "boolean" ? <select className="inp sm" value={value.cf?.[f.key] === undefined ? "" : String(value.cf[f.key])} onChange={(e) => setCf(f.key, e.target.value === "" ? undefined : e.target.value === "true")}><option value="">{t("all")}</option><option value="true">{t("yes")}</option><option value="false">{t("no")}</option></select>
        : <input className="inp sm" style={{ width: 120 }} value={(value.cf?.[f.key] as string) ?? ""} onChange={(e) => setCf(f.key, e.target.value)} />}</label>)}
    <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!value.overdue} onChange={(e) => set({ overdue: e.target.checked })} />{t("g_overdue")}</label>
    <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!value.noOwner} onChange={(e) => set({ noOwner: e.target.checked })} />{t("unassigned")}</label>
    {filterCount(value) > 0 && <button className="btn sm ghost" onClick={() => onChange({})}><Icon n="x" />{t("clear")}</button>}
  </div>;
}

export function SavedViews({ current, tab, onApply }: { current: LeadFilter; tab: string; onApply: (f: LeadFilter, tab?: string) => void }) {
  const { t } = useT(); const qc = useQueryClient(); const can = useCan();
  const { data } = useQuery({ queryKey: ["views", "lead"], queryFn: () => get<any[]>("/api/views?entity=lead") });
  const [saving, setSaving] = useState(false); const [name, setName] = useState(""); const [shared, setShared] = useState(false);
  const save = async () => { try { await post("/api/views", { entity: "lead", name, filters: { ...current, tab }, shared }); setSaving(false); setName(""); qc.invalidateQueries({ queryKey: ["views", "lead"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <div className="row wrap" style={{ gap: 6 }}>
    {(data ?? []).map((v) => <span key={v.id} className="chip" onClick={() => { const { tab: vt, ...f } = v.filters ?? {}; onApply(f, vt); }}>
      {v.shared ? "👥" : "★"} {v.name}{(v.mine || can("settings.manage")) && <span role="button" style={{ marginInlineStart: 4, opacity: 0.5 }} onClick={async (e) => { e.stopPropagation(); if (await confirmBox(t("delete"), v.name, t("delete"), true)) { await del(`/api/views/${v.id}`); qc.invalidateQueries({ queryKey: ["views", "lead"] }); } }}>×</span>}</span>)}
    {filterCount(current) > 0 && <button className="btn sm ghost" onClick={() => setSaving(true)}><Icon n="plus" />{t("save_view")}</button>}
    {saving && <Modal onClose={() => setSaving(false)} width={420}><div className="hd"><h2 className="grow">{t("save_view")}</h2></div><div className="bd col" style={{ gap: 10 }}>
      <input className="inp" autoFocus placeholder={t("view_name_ph")} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name && save()} />
      {(can("settings.manage") || can("lead.assign")) && <Switch checked={shared} onChange={setShared} label={t("share_with_team")} />}
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}><button className="btn" onClick={() => setSaving(false)}>{t("cancel")}</button><button className="btn pri" disabled={!name} onClick={save}>{t("save")}</button></div></div></Modal>}
  </div>;
}
