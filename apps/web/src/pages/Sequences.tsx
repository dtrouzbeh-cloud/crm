// Takip dizileri: liste, hazır şablonlar, adım düzenleyici (çok dilli mesaj, A/B), tetikleyici/durdurma, istatistik
import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, put, del } from "../lib/api.ts";
import { PageHead, Spinner, Empty, Switch, toast, toastErr, confirmBox } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan } from "../lib/auth.ts";
import { salesStageOrder, stageLabel } from "../lib/format.tsx";

const KINDS = ["whatsapp", "email", "task", "stage", "tag", "form", "wait", "sms", "ai_message", "ai_call"] as const;
const KIND_IC: Record<string, string> = { whatsapp: "wa", email: "mail", task: "tasks", stage: "kanban", tag: "list", form: "pen", wait: "clock", sms: "phone", ai_message: "spark", ai_call: "phone" };
const SOON = new Set(["sms", "ai_message", "ai_call"]);
const EVENTS = ["", "lead.created", "lead.stage", "quote.sent", "quote.viewed", "deal.created", "deal.stage", "pipeline.stage_entered", "pipeline.sla_breached", "form.completed"];
const STOPS = ["replied", "quote_viewed", "quote_accepted", "deal_created", "stage_won", "stage_lost", "stage_changed", "form_completed", "paid", "opted_out"];
const LANGS = ["tr", "en", "de", "ar"];

export default function Sequences() {
  const { id } = useParams<{ id?: string }>();
  return id ? <Editor id={id} /> : <List />;
}

function List() {
  const { t, lang } = useT(); const can = useCan(); const qc = useQueryClient(); const [, nav] = useLocation();
  const { data } = useQuery({ queryKey: ["sequences"], queryFn: () => get<any[]>("/api/sequences") });
  const { data: tpls } = useQuery({ queryKey: ["seq-templates"], queryFn: () => get<any[]>("/api/sequences/templates") });
  const fromTpl = async (key: string) => { try { const r = await post("/api/sequences/from-template", { key, lang }); qc.invalidateQueries({ queryKey: ["sequences"] }); nav(`/sequences/${r.id}`); } catch (e) { toastErr(e); } };
  const create = async () => { try { const r = await post("/api/sequences", { name: t("new_sequence"), steps: [] }); nav(`/sequences/${r.id}`); } catch (e) { toastErr(e); } };
  return <><PageHead title={t("nav_sequences")} sub={t("sequences_sub")} actions={can("settings.manage") && <button className="btn pri" onClick={create}><Icon n="plus" />{t("new_sequence")}</button>} />
    {can("settings.manage") && <div className="card pad" style={{ marginBottom: 14 }}><div className="small muted" style={{ marginBottom: 8 }}>{t("seq_templates")}</div>
      <div className="row wrap" style={{ gap: 8 }}>{(tpls ?? []).map((x) => <button key={x.key} className="chip" onClick={() => fromTpl(x.key)}><Icon n="spark" size={13} />{x.name[lang] ?? x.name.en} <span className="faint">· {x.steps} {t("steps")}</span></button>)}</div></div>}
    <div className="card">{!data ? <Spinner /> : !data.length ? <Empty icon="spark" text={t("no_sequences")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("trigger")}</th><th className="r">{t("steps")}</th><th className="r">{t("active_enrollments")}</th><th className="r">{t("conversion")}</th><th>{t("active")}</th></tr></thead><tbody>
      {data.map((s) => <tr key={s.id} className="click" onClick={() => nav(`/sequences/${s.id}`)}><td><b>{s.name}</b>{s.settings?.marketing && <span className="bdg warn" style={{ marginInlineStart: 6 }}>{t("marketing")}</span>}</td>
        <td className="small muted">{s.trigger?.event ? t("evt_" + s.trigger.event.replace(".", "_")) + (s.trigger.stage ? " · " + s.trigger.stage : "") : t("manual_only")}</td>
        <td className="r num">{s.stepCount}</td><td className="r num">{s.activeCount}</td><td className="r num">{s.totalCount ? Math.round((100 * s.converted) / s.totalCount) + "%" : "—"}</td>
        <td onClick={(e) => e.stopPropagation()}><Switch checked={s.active} onChange={async (v) => { await put(`/api/sequences/${s.id}`, { active: v }); qc.invalidateQueries({ queryKey: ["sequences"] }); }} /></td></tr>)}
    </tbody></table></div>}</div></>;
}

function Editor({ id }: { id: string }) {
  const { t, lang, rel } = useT(); const qc = useQueryClient(); const [, nav] = useLocation(); const can = useCan();
  const { data } = useQuery({ queryKey: ["sequence", id], queryFn: () => get(`/api/sequences/${id}`) });
  const { data: forms } = useQuery({ queryKey: ["form-templates"], queryFn: () => get<any[]>("/api/forms/templates") });
  const [d, setD] = useState<any>(null); const [busy, setBusy] = useState(false);
  if (!data) return <Spinner />;
  const s = d ?? { name: data.name, description: data.description, active: data.active, trigger: data.trigger ?? {}, stopOn: data.stopOn, settings: data.settings ?? {}, steps: data.steps.map((x: any) => ({ kind: x.kind, delayMinutes: x.delayMinutes, config: x.config ?? {}, variantB: x.variantB, id: x.id })) };
  const set = (p: any) => setD({ ...s, ...p });
  const setStep = (i: number, p: any) => set({ steps: s.steps.map((x: any, j: number) => (j === i ? { ...x, ...p } : x)) });
  const move = (i: number, dd: number) => { const a = [...s.steps]; const j = i + dd; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ steps: a }); };
  const save = async () => { setBusy(true); try { await put(`/api/sequences/${id}`, { ...s, steps: s.steps.map(({ id: _x, ...r }: any) => r) }); setD(null); qc.invalidateQueries({ queryKey: ["sequence", id] }); qc.invalidateQueries({ queryKey: ["sequences"] }); toast(t("saved")); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  const stat = (stepId: string, status: string) => data.stats.filter((x: any) => x.stepId === stepId && x.status === status).reduce((a: number, x: any) => a + x.n, 0);
  const ro = !can("settings.manage");
  return <><PageHead title={<input className="inp" style={{ fontSize: 20, fontWeight: 700, maxWidth: 480 }} value={s.name} disabled={ro} onChange={(e) => set({ name: e.target.value })} />} sub={<Link href="/sequences">← {t("nav_sequences")}</Link>}
    actions={!ro && <><Switch checked={s.active} onChange={(v) => set({ active: v })} label={t("active")} /><button className="btn ghost danger" onClick={async () => { if (await confirmBox(t("delete"), s.name, t("delete"), true)) { await del(`/api/sequences/${id}`); nav("/sequences"); } }}><Icon n="trash" /></button><button className="btn pri" disabled={busy || !d} onClick={save}>{t("save")}</button></>} />
    <div className="side-grid">
      <div className="col" style={{ gap: 10 }}>
        <div className="card pad"><div className="row wrap" style={{ gap: 10 }}><b className="small">⚡ {t("trigger")}</b>
          <select className="inp sm" style={{ width: "auto" }} disabled={ro} value={s.trigger.event ?? ""} onChange={(e) => set({ trigger: { ...s.trigger, event: e.target.value || undefined } })}>{EVENTS.map((ev) => <option key={ev} value={ev}>{ev ? t("evt_" + ev.replace(".", "_")) : t("manual_only")}</option>)}</select>
          {["lead.stage", "deal.stage", "pipeline.stage_entered", "pipeline.sla_breached"].includes(s.trigger.event) && <input className="inp sm" style={{ width: 140 }} disabled={ro} placeholder={t("stage")} value={s.trigger.stage ?? ""} onChange={(e) => set({ trigger: { ...s.trigger, stage: e.target.value || undefined } })} />}
          {s.trigger.event?.startsWith("pipeline.") && <select className="inp sm" style={{ width: "auto" }} disabled={ro} value={s.trigger.pipeline ?? ""} onChange={(e) => set({ trigger: { ...s.trigger, pipeline: e.target.value || undefined } })}><option value="">{t("all")}</option>{["sales", "nurture", "aftercare", "recall"].map((k) => <option key={k} value={k}>{k}</option>)}</select>}
          {s.trigger.event === "lead.created" && <input className="inp sm" style={{ width: 120 }} disabled={ro} placeholder={t("source")} value={s.trigger.source ?? ""} onChange={(e) => set({ trigger: { ...s.trigger, source: e.target.value || undefined } })} />}
        </div></div>
        {s.steps.map((st: any, i: number) => <StepCard key={i} i={i} st={st} ro={ro} forms={forms ?? []} onChange={(p) => setStep(i, p)} onMove={(dd) => move(i, dd)} onRemove={() => set({ steps: s.steps.filter((_: any, j: number) => j !== i) })}
          stats={st.id ? { sent: stat(st.id, "sent") + stat(st.id, "done"), skipped: stat(st.id, "skipped"), failed: stat(st.id, "failed") } : null} />)}
        {!ro && <div className="row wrap" style={{ gap: 6 }}>{KINDS.map((k) => <button key={k} className="chip" disabled={SOON.has(k)} title={SOON.has(k) ? t("coming_soon") : ""} onClick={() => set({ steps: [...s.steps, { kind: k, delayMinutes: s.steps.length ? 1440 : 0, config: {} }] })}><Icon n={KIND_IC[k]!} size={13} />{t("sk_" + k)}{SOON.has(k) && " ⏳"}</button>)}</div>}
      </div>
      <div className="col" style={{ gap: 10 }}>
        <div className="card pad"><b className="small">🛑 {t("stop_when")}</b><div className="col" style={{ gap: 4, marginTop: 8 }}>{STOPS.map((k) => <label key={k} className="row small" style={{ gap: 6 }}><input type="checkbox" disabled={ro || k === "opted_out"} checked={s.stopOn.includes(k)} onChange={(e) => set({ stopOn: e.target.checked ? [...s.stopOn, k] : s.stopOn.filter((x: string) => x !== k) })} />{t("so_" + k)}</label>)}</div></div>
        <div className="card pad col" style={{ gap: 8 }}><b className="small">🌙 {t("delivery_rules")}</b>
          <div className="row small" style={{ gap: 6 }}>{t("quiet_hours")}<input className="inp sm num" style={{ width: 54 }} type="number" min={0} max={23} disabled={ro} value={s.settings.quietStart ?? 21} onChange={(e) => set({ settings: { ...s.settings, quietStart: +e.target.value } })} />–<input className="inp sm num" style={{ width: 54 }} type="number" min={0} max={23} disabled={ro} value={s.settings.quietEnd ?? 9} onChange={(e) => set({ settings: { ...s.settings, quietEnd: +e.target.value } })} /></div>
          <Switch checked={s.settings.weekends ?? true} onChange={(v) => !ro && set({ settings: { ...s.settings, weekends: v } })} label={t("send_weekends")} />
          <Switch checked={!!s.settings.marketing} onChange={(v) => !ro && set({ settings: { ...s.settings, marketing: v } })} label={t("is_marketing")} />
          <p className="tiny muted" style={{ margin: 0 }}>{t("delivery_hint")}</p></div>
        <div className="card"><div className="hd"><h3 className="grow">{t("enrollments")}</h3></div><div className="bd col" style={{ gap: 4, maxHeight: 360, overflow: "auto" }}>
          {!data.enrollments.length ? <span className="small muted">{t("none")}</span> : data.enrollments.map((e: any) => <Link key={e.id} href={`/leads/${e.leadId}`} className="row small" style={{ color: "inherit", gap: 6 }}>
            <span className="grow">{e.fullName}</span><span className={"bdg " + (e.status === "active" ? "info" : e.status === "completed" ? "ok" : "")}>{e.status === "active" ? `${e.stepIndex + 1}/${s.steps.length}` : t("so_" + (e.stopReason ?? e.status)) }</span><span className="tiny faint">{rel(e.startedAt)}</span></Link>)}</div></div>
      </div>
    </div></>;
}

function StepCard({ i, st, ro, forms, onChange, onMove, onRemove, stats }: { i: number; st: any; ro: boolean; forms: any[]; onChange: (p: any) => void; onMove: (d: number) => void; onRemove: () => void; stats: any }) {
  const { t } = useT(); const [L, setL] = useState("tr"); const [ab, setAb] = useState(!!st.variantB);
  const unit = st.delayMinutes % 1440 === 0 && st.delayMinutes ? 1440 : st.delayMinutes % 60 === 0 && st.delayMinutes ? 60 : 1;
  const cfg = st.config ?? {};
  const setCfg = (p: any, b = false) => (b ? onChange({ variantB: { ...(st.variantB ?? cfg), ...p } }) : onChange({ config: { ...cfg, ...p } }));
  const msg = (c: any, b: boolean) => <div className="col" style={{ gap: 6 }}>
    {st.kind === "email" && <input className="inp sm" disabled={ro} placeholder={t("subject")} value={c.subject?.[L] ?? ""} onChange={(e) => setCfg({ subject: { ...(c.subject ?? {}), [L]: e.target.value } }, b)} />}
    <textarea className="inp" rows={3} disabled={ro} dir={L === "ar" ? "rtl" : "ltr"} placeholder={t("message_body_ph")} value={c.body?.[L] ?? ""} onChange={(e) => setCfg({ body: { ...(c.body ?? {}), [L]: e.target.value } }, b)} />
    {st.kind === "whatsapp" && <div className="row wrap tiny muted" style={{ gap: 6 }}>{t("wa_template_fallback")}:<input className="inp sm" style={{ width: 150 }} disabled={ro} placeholder="template_name" value={c.template?.name ?? ""} onChange={(e) => setCfg({ template: { ...(c.template ?? {}), name: e.target.value } }, b)} />
      <input className="inp sm grow" disabled={ro} placeholder="{firstName}, {clinic}" value={(c.template?.params ?? []).join(", ")} onChange={(e) => setCfg({ template: { ...(c.template ?? {}), params: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } }, b)} /></div>}
  </div>;
  return <div className="card pad" style={{ padding: 12, borderInlineStart: "3px solid var(--brand)" }}>
    <div className="row wrap" style={{ gap: 8 }}>
      <span className="bdg brand">{i + 1}</span>
      <span className="small muted">{t("wait")}</span>
      <input className="inp sm num" style={{ width: 64 }} type="number" min={0} disabled={ro} value={st.delayMinutes / unit} onChange={(e) => onChange({ delayMinutes: Math.max(0, +e.target.value) * unit })} />
      <select className="inp sm" style={{ width: "auto" }} disabled={ro} value={unit} onChange={(e) => onChange({ delayMinutes: Math.round(st.delayMinutes / unit) * +e.target.value })}><option value={1}>{t("minutes")}</option><option value={60}>{t("hours")}</option><option value={1440}>{t("days")}</option></select>
      <span className="small muted">→</span><b className="row" style={{ gap: 4 }}><Icon n={KIND_IC[st.kind]!} size={14} />{t("sk_" + st.kind)}</b>
      <span className="grow" />
      {stats && <span className="tiny muted">✓ {stats.sent}{stats.skipped ? ` · ⤼ ${stats.skipped}` : ""}{stats.failed ? ` · ✖ ${stats.failed}` : ""}</span>}
      {!ro && <><button className="btn xs ghost icon" onClick={() => onMove(-1)}>↑</button><button className="btn xs ghost icon" onClick={() => onMove(1)}>↓</button><button className="btn xs ghost icon danger" onClick={onRemove}><Icon n="x" /></button></>}
    </div>
    <div style={{ marginTop: 8 }}>
      {(st.kind === "whatsapp" || st.kind === "email" || st.kind === "sms") && <>
        <div className="row" style={{ gap: 6, marginBottom: 6 }}><div className="seg">{LANGS.map((l) => <button key={l} className={L === l ? "on" : ""} onClick={() => setL(l)}>{l.toUpperCase()}{cfg.body?.[l] ? "" : " ·"}</button>)}</div><span className="grow" />
          {!ro && <label className="row tiny" style={{ gap: 4 }}><input type="checkbox" checked={ab} onChange={(e) => { setAb(e.target.checked); onChange({ variantB: e.target.checked ? { ...cfg } : null }); }} />A/B</label>}</div>
        {ab ? <div className="grid g2" style={{ gap: 8 }}><div><div className="tiny muted">A</div>{msg(cfg, false)}</div><div><div className="tiny muted">B</div>{msg(st.variantB ?? {}, true)}</div></div> : msg(cfg, false)}
        <div className="tiny faint" style={{ marginTop: 4 }}>{t("variables")}: {"{firstName} {name} {clinic} {owner} {quoteLink}"}</div></>}
      {st.kind === "task" && <div className="row wrap" style={{ gap: 6 }}><input className="inp sm grow" disabled={ro} placeholder={t("task_title")} value={cfg.title?.tr ?? cfg.title ?? ""} onChange={(e) => setCfg({ title: { tr: e.target.value, en: e.target.value } })} />
        <select className="inp sm" style={{ width: "auto" }} disabled={ro} value={cfg.priority ?? "med"} onChange={(e) => setCfg({ priority: e.target.value })}>{["high", "med", "low"].map((p) => <option key={p} value={p}>{t("p_" + p)}</option>)}</select>
        <select className="inp sm" style={{ width: "auto" }} disabled={ro} value={cfg.taskType ?? "follow_up"} onChange={(e) => setCfg({ taskType: e.target.value })}>{["call", "follow_up", "general"].map((p) => <option key={p} value={p}>{t("tt_" + p)}</option>)}</select></div>}
      {st.kind === "stage" && <div className="row wrap" style={{ gap: 6 }}><select className="inp sm" style={{ width: "auto" }} disabled={ro} value={cfg.pipeline ?? "sales"} onChange={(e) => setCfg({ pipeline: e.target.value, stageKey: "" })}>{["sales", "nurture", "aftercare", "recall"].map((k) => <option key={k} value={k}>{k}</option>)}</select>
        {(cfg.pipeline ?? "sales") === "sales" ? <select className="inp sm" style={{ width: "auto" }} disabled={ro} value={cfg.stageKey ?? ""} onChange={(e) => setCfg({ stageKey: e.target.value })}><option value="">—</option>{salesStageOrder().map((k) => <option key={k} value={k}>{stageLabel(t, k)}</option>)}</select>
          : <input className="inp sm" style={{ width: 140 }} disabled={ro} placeholder="stage key" value={cfg.stageKey ?? ""} onChange={(e) => setCfg({ stageKey: e.target.value })} />}</div>}
      {st.kind === "tag" && <input className="inp sm" style={{ width: 200 }} disabled={ro} placeholder={t("tag")} value={cfg.tag ?? ""} onChange={(e) => setCfg({ tag: e.target.value })} />}
      {st.kind === "form" && <select className="inp sm" disabled={ro} value={cfg.templateId ?? ""} onChange={(e) => setCfg({ templateId: e.target.value })}><option value="">—</option>{forms.filter((f) => f.active).map((f) => <option key={f.id} value={f.id}>{f.name} · {f.lang.toUpperCase()}</option>)}</select>}
      {SOON.has(st.kind) && <div className="tiny muted">⏳ {t("coming_soon")}</div>}
    </div>
  </div>;
}
