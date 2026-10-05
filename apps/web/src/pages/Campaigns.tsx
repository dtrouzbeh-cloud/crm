// Toplu kampanyalar: liste, kitle seçici (canlı önizleme), içerik (WhatsApp şablonu / e-posta), A/B, zamanlama, sonuçlar
import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, patch } from "../lib/api.ts";
import { PageHead, Spinner, Empty, toast, toastErr, confirmBox } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCan, useMe } from "../lib/auth.ts";
import { salesStageOrder, stageLabel, FLAGS } from "../lib/format.tsx";

const ST: Record<string, string> = { draft: "", scheduled: "info", sending: "warn", sent: "ok", canceled: "" };
const LANGS = ["tr", "en", "de", "ar"];

export default function Campaigns() { const { id } = useParams<{ id?: string }>(); return id ? <Editor id={id} /> : <List />; }

function List() {
  const { t, date } = useT(); const can = useCan(); const [, nav] = useLocation();
  const { data } = useQuery({ queryKey: ["campaigns"], queryFn: () => get<any[]>("/api/campaigns") });
  const create = async () => { try { const r = await post("/api/campaigns", { name: t("new_campaign"), channel: "whatsapp" }); nav(`/campaigns/${r.id}`); } catch (e) { toastErr(e); } };
  return <><PageHead title={t("nav_campaigns")} sub={t("campaigns_sub")} actions={can("settings.manage") && <button className="btn pri" onClick={create}><Icon n="plus" />{t("new_campaign")}</button>} />
    <div className="card">{!data ? <Spinner /> : !data.length ? <Empty icon="send" text={t("no_campaigns")} /> : <div className="twrap"><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("channel")}</th><th>{t("status")}</th><th className="r">{t("recipients")}</th><th className="r">{t("sent")}</th><th>{t("date")}</th></tr></thead><tbody>
      {data.map((c) => <tr key={c.id} className="click" onClick={() => nav(`/campaigns/${c.id}`)}><td><b>{c.name}</b></td><td>{c.channel === "whatsapp" ? "🟢 WhatsApp" : "✉️ E-posta"}</td><td><span className={"bdg " + ST[c.status]}>{t("cst_" + c.status)}</span></td>
        <td className="r num">{c.stats?.recipients ?? "—"}</td><td className="r num">{c.sentCount}</td><td className="small muted">{date(c.startedAt ?? c.scheduleAt ?? c.createdAt)}</td></tr>)}</tbody></table></div>}</div></>;
}

function Editor({ id }: { id: string }) {
  const { t } = useT(); const qc = useQueryClient(); const can = useCan(); const { data: me } = useMe();
  const { data } = useQuery({ queryKey: ["campaign", id], queryFn: () => get(`/api/campaigns/${id}`), refetchInterval: (q: any) => (q.state.data?.status === "sending" ? 5000 : false) });
  const { data: tpls } = useQuery({ queryKey: ["wa-templates"], queryFn: () => get<any[]>("/api/inbox/templates").catch(() => []) });
  const [d, setD] = useState<any>(null); const [pv, setPv] = useState<any>(null); const [L, setL] = useState("tr"); const [ab, setAb] = useState(false);
  const c = d ?? data; const ro = !can("settings.manage") || (data && data.status !== "draft");
  useEffect(() => { if (!c) return; const h = setTimeout(async () => { try { setPv(await post("/api/campaigns/preview", { audience: c.audience ?? {}, channel: c.channel })); } catch { setPv(null); } }, 400); return () => clearTimeout(h); }, [JSON.stringify(c?.audience), c?.channel]);
  useEffect(() => { if (data) setAb(!!data.variantB); }, [data?.id]);
  if (!c) return <Spinner />;
  const set = (p: any) => setD({ ...c, ...p }); const aud = c.audience ?? {}; const setA = (p: any) => set({ audience: { ...aud, ...p } });
  const content = c.content ?? {}, vb = c.variantB ?? {};
  const setC = (p: any, b = false) => (b ? set({ variantB: { ...vb, ...p } }) : set({ content: { ...content, ...p } }));
  const save = async () => { try { await patch(`/api/campaigns/${id}`, { name: c.name, channel: c.channel, audience: aud, content, variantB: ab ? vb : null, scheduleAt: c.scheduleAt ?? null }); setD(null); qc.invalidateQueries({ queryKey: ["campaign", id] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  const launch = async () => { if (d) await save(); if (!(await confirmBox(t("launch_campaign"), t("launch_confirm", { n: pv?.reachable ?? 0 }), t("launch_campaign")))) return;
    try { const r = await post(`/api/campaigns/${id}/launch`); toast(`${r.recipients} ${t("recipients")}`); qc.invalidateQueries({ queryKey: ["campaign", id] }); qc.invalidateQueries({ queryKey: ["campaigns"] }); } catch (e) { toastErr(e); } };
  const multi = (k: string, opts: [string, string][]) => <div className="row wrap" style={{ gap: 4 }}>{opts.map(([v, l]) => { const on = (aud[k] ?? []).includes(v); return <button key={v} type="button" disabled={ro} className={"chip" + (on ? " on" : "")} style={{ height: 26 }} onClick={() => setA({ [k]: on ? aud[k].filter((x: string) => x !== v) : [...(aud[k] ?? []), v] })}>{l}</button>; })}</div>;
  const sources = ((me?.clinic as any)?.settings?.leadSources as string[]) ?? [];
  const msg = (x: any, b: boolean) => c.channel === "whatsapp" ? <div className="col" style={{ gap: 6 }}>
    <select className="inp sm" disabled={ro} value={x.template?.name ?? ""} onChange={(e) => { const tp = (tpls ?? []).find((y) => y.name === e.target.value); setC({ template: { name: e.target.value, language: tp?.language ?? "tr", params: x.template?.params ?? ["{firstName}"] } }, b); }}>
      <option value="">{t("choose_template")}</option>{(tpls ?? []).filter((y) => y.status === "APPROVED" || !y.status).map((y) => <option key={y.name + y.language} value={y.name}>{y.name} · {y.language}</option>)}</select>
    <input className="inp sm" disabled={ro} placeholder="template_name (manual)" value={x.template?.name ?? ""} onChange={(e) => setC({ template: { ...(x.template ?? {}), name: e.target.value } }, b)} />
    <input className="inp sm" disabled={ro} placeholder="{firstName}, {clinic}" value={(x.template?.params ?? []).join(", ")} onChange={(e) => setC({ template: { ...(x.template ?? {}), params: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } }, b)} />
    <span className="tiny muted">{t("wa_campaign_hint")}</span></div>
    : <div className="col" style={{ gap: 6 }}><div className="seg">{LANGS.map((l) => <button key={l} className={L === l ? "on" : ""} onClick={() => setL(l)}>{l.toUpperCase()}</button>)}</div>
      <input className="inp sm" disabled={ro} placeholder={t("subject")} value={x.subject?.[L] ?? ""} onChange={(e) => setC({ subject: { ...(x.subject ?? {}), [L]: e.target.value } }, b)} />
      <textarea className="inp" rows={6} disabled={ro} placeholder={t("message_body_ph")} value={x.body?.[L] ?? ""} onChange={(e) => setC({ body: { ...(x.body ?? {}), [L]: e.target.value } }, b)} />
      <span className="tiny muted">{t("variables")}: {"{firstName} {name} {clinic}"} · {t("unsub_auto")}</span></div>;
  return <><PageHead title={<input className="inp" style={{ fontSize: 20, fontWeight: 700, maxWidth: 460 }} disabled={ro} value={c.name} onChange={(e) => set({ name: e.target.value })} />} sub={<Link href="/campaigns">← {t("nav_campaigns")}</Link>}
    actions={<><span className={"bdg " + ST[c.status]}>{t("cst_" + c.status)}</span>{!ro && <><button className="btn" disabled={!d} onClick={save}>{t("save")}</button><button className="btn pri" onClick={launch}><Icon n="send" />{c.scheduleAt ? t("schedule") : t("launch_campaign")}</button></>}
      {data?.status === "sending" && can("settings.manage") && <button className="btn ghost danger" onClick={async () => { await post(`/api/campaigns/${id}/cancel`); qc.invalidateQueries({ queryKey: ["campaign", id] }); }}>{t("cancel")}</button>}</>} />
    <div className="side-grid">
      <div className="col" style={{ gap: 12 }}>
        <div className="card pad col" style={{ gap: 10 }}><b>👥 {t("audience")}</b>
          <div className="row" style={{ gap: 8 }}><span className="small muted">{t("channel")}</span><div className="seg">{["whatsapp", "email"].map((ch) => <button key={ch} disabled={ro} className={c.channel === ch ? "on" : ""} onClick={() => set({ channel: ch })}>{ch === "whatsapp" ? "WhatsApp" : "E-posta"}</button>)}</div></div>
          <div><div className="tiny muted">{t("stage")}</div>{multi("stages", salesStageOrder().map((k) => [k, stageLabel(t, k)]))}</div>
          <div><div className="tiny muted">{t("source")}</div>{multi("sources", sources.map((s) => [s, t("src_" + s)]))}</div>
          <div><div className="tiny muted">{t("country")}</div>{multi("countries", Object.keys(FLAGS).slice(0, 18).map((k) => [k, FLAGS[k] + " " + k]))}</div>
          <div><div className="tiny muted">{t("language")}</div>{multi("languages", LANGS.map((l) => [l, l.toUpperCase()]))}</div>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="row small" style={{ gap: 6 }}>{t("tag")}<input className="inp sm" style={{ width: 140 }} disabled={ro} value={(aud.tags ?? []).join(",")} onChange={(e) => setA({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
            <label className="row small" style={{ gap: 6 }}>{t("inactive_days")}<input className="inp sm num" style={{ width: 70 }} type="number" disabled={ro} value={aud.inactiveDays ?? ""} onChange={(e) => setA({ inactiveDays: e.target.value ? +e.target.value : undefined })} /></label>
            <label className="row small" style={{ gap: 6 }}>{t("deal")}<select className="inp sm" style={{ width: "auto" }} disabled={ro} value={aud.hasDeal === undefined ? "" : String(aud.hasDeal)} onChange={(e) => setA({ hasDeal: e.target.value === "" ? undefined : e.target.value === "true" })}><option value="">{t("all")}</option><option value="true">{t("has_deal")}</option><option value="false">{t("no_deal")}</option></select></label>
            <label className="row small" style={{ gap: 6 }}>Pipeline<select className="inp sm" style={{ width: "auto" }} disabled={ro} value={aud.pipeline ?? ""} onChange={(e) => setA({ pipeline: e.target.value || undefined })}><option value="">—</option>{["nurture", "aftercare", "recall"].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          </div></div>
        <div className="card pad col" style={{ gap: 8 }}><div className="row"><b className="grow">✉️ {t("content")}</b>{!ro && <label className="row tiny" style={{ gap: 4 }}><input type="checkbox" checked={ab} onChange={(e) => { setAb(e.target.checked); set({ variantB: e.target.checked ? { ...content } : null }); }} />A/B</label>}</div>
          {ab ? <div className="grid g2" style={{ gap: 10 }}><div><div className="tiny muted">A</div>{msg(content, false)}</div><div><div className="tiny muted">B</div>{msg(vb, true)}</div></div> : msg(content, false)}
          <label className="row small" style={{ gap: 6 }}>{t("schedule_at")}<input className="inp sm" type="datetime-local" disabled={ro} value={c.scheduleAt ? new Date(new Date(c.scheduleAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(e) => set({ scheduleAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /><span className="tiny muted">{t("schedule_hint")}</span></label>
        </div>
      </div>
      <div className="col" style={{ gap: 12 }}>
        <div className="card pad"><b className="small">🎯 {t("preview")}</b>{!pv ? <Spinner /> : <div className="col" style={{ gap: 4, marginTop: 8 }}>
          <div className="row"><span className="grow small">{t("matching_leads")}</span><b className="num">{pv.total}</b></div>
          <div className="row"><span className="grow small">{t("reachable")}</span><b className="num" style={{ color: "var(--ok)" }}>{pv.reachable}</b></div>
          {Object.entries(pv.reasons as Record<string, number>).map(([k, v]) => <div key={k} className="row tiny muted"><span className="grow">↳ {t("sr_" + k)}</span><span>{v}</span></div>)}
          <div className="tiny faint" style={{ marginTop: 6 }}>{pv.sample.map((s: any) => s.name).join(", ")}</div></div>}</div>
        {data?.results?.length > 0 && <div className="card pad"><b className="small">📊 {t("results")}</b><table className="tbl" style={{ marginTop: 6 }}><thead><tr><th /><th className="r">{t("sent")}</th><th className="r">{t("replied")}</th><th className="r">Deal</th></tr></thead><tbody>
          {data.results.map((r: any) => <tr key={r.variant}><td>{r.variant}</td><td className="r num">{r.sent}<div className="tiny faint">{r.skipped ? `⤼ ${r.skipped}` : ""}</div></td><td className="r num">{r.replied}{r.sent ? <div className="tiny faint">{Math.round(100 * r.replied / r.sent)}%</div> : null}</td><td className="r num">{r.converted}</td></tr>)}</tbody></table></div>}
        <div className="alert info"><Icon n="info" /><span className="tiny">{t("campaign_consent_info")}</span></div>
      </div>
    </div></>;
}
