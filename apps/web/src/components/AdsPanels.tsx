// Reklam: Meta Ads/CAPI ayar kartı + CSV harcama içe aktarma (Entegrasyonlar), kampanya ROAS raporu (Raporlar)
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post, put, qs } from "../lib/api.ts";
import { Spinner, Switch, toast, toastErr } from "./ui.tsx";
import { Icon } from "./Icon.tsx";

export function MetaAdsCard() {
  const { t, rel } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ads-meta"], queryFn: () => get("/api/ads/meta") });
  const { data: conv } = useQuery({ queryKey: ["ads-conv"], queryFn: () => get<any[]>("/api/ads/conversions") });
  const [f, setF] = useState<any>({}); const [csv, setCsv] = useState({ platform: "google", currency: "EUR", text: "" }); const [busy, setBusy] = useState(false);
  if (!data) return null;
  const r = () => qc.invalidateQueries({ queryKey: ["ads-meta"] });
  const save = async (b: any) => { try { await put("/api/ads/meta", b); setF({}); r(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const cfg = data.config ?? {};
  const sent = (conv ?? []).filter((x) => x.status === "sent").length, skipped = (conv ?? []).filter((x) => x.status === "skipped").length;
  return <div className="card"><div className="hd"><h2 className="grow">📈 {t("ads_title")}</h2>{data.status && <span className={"bdg " + (data.status === "error" ? "err" : "ok")}>{data.status}</span>}</div><div className="bd col" style={{ gap: 12 }}>
    <div className="grid g2" style={{ gap: 10 }}>
      <label className="f">Meta ad account ID<input className="inp sm" placeholder="act_123…" defaultValue={cfg.adAccountId ?? ""} onBlur={(e) => e.target.value !== (cfg.adAccountId ?? "") && save({ adAccountId: e.target.value })} /></label>
      <label className="f">{t("ads_token")}{data.hasToken && <span className="tiny muted"> ✓</span>}<input className="inp sm" type="password" placeholder={data.hasToken ? "••••••" : "EAAG…"} value={f.token ?? ""} onChange={(e) => setF({ ...f, token: e.target.value })} onBlur={() => f.token && save({ token: f.token })} /></label>
      <label className="f">Dataset / Pixel ID<input className="inp sm" defaultValue={cfg.datasetId ?? ""} onBlur={(e) => e.target.value !== (cfg.datasetId ?? "") && save({ datasetId: e.target.value })} /></label>
      <label className="f">Conversions API token{data.hasCapiToken && <span className="tiny muted"> ✓</span>}<input className="inp sm" type="password" placeholder={data.hasCapiToken ? "••••••" : ""} value={f.capiToken ?? ""} onChange={(e) => setF({ ...f, capiToken: e.target.value })} onBlur={() => f.capiToken && save({ capiToken: f.capiToken })} /></label>
    </div>
    <div className="row wrap" style={{ gap: 14 }}>
      <Switch checked={!!cfg.capi} onChange={(v) => save({ capi: v })} label={t("capi_enable")} />
      <Switch checked={cfg.requireConsent ?? true} onChange={(v) => save({ requireConsent: v })} label={t("capi_consent")} />
      <button className="btn sm" disabled={busy || !cfg.adAccountId || !data.hasToken} onClick={async () => { setBusy(true); try { const x = await post("/api/ads/meta/sync"); toast(`${x.rows} ✓`); r(); qc.invalidateQueries({ queryKey: ["roas"] }); } catch (e) { toastErr(e); } finally { setBusy(false); } }}><Icon n="download" />{t("ads_sync")}</button>
      {data.lastSyncAt && <span className="tiny muted">{rel(data.lastSyncAt)}</span>}{data.lastError && <span className="tiny" style={{ color: "var(--err)" }}>{data.lastError}</span>}
    </div>
    <p className="tiny muted" style={{ margin: 0 }}>{t("capi_hint")}{conv?.length ? ` · ${sent} ${t("sent").toLowerCase()} · ${skipped} ${t("skipped")}` : ""}</p>
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }} className="col"><b className="small">{t("ads_csv")}</b>
      <div className="row wrap" style={{ gap: 6, marginTop: 6 }}><select className="inp sm" style={{ width: "auto" }} value={csv.platform} onChange={(e) => setCsv({ ...csv, platform: e.target.value })}>{["google", "tiktok", "meta", "other"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <input className="inp sm" style={{ width: 70 }} value={csv.currency} onChange={(e) => setCsv({ ...csv, currency: e.target.value.toUpperCase().slice(0, 3) })} />
        <input type="file" accept=".csv,text/csv" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) setCsv({ ...csv, text: await fl.text() }); }} />
        <button className="btn sm pri" disabled={!csv.text} onClick={async () => { try { const x = await post("/api/ads/import", { platform: csv.platform, currency: csv.currency, csv: csv.text }); toast(`${x.imported} ✓`); setCsv({ ...csv, text: "" }); qc.invalidateQueries({ queryKey: ["roas"] }); } catch (e) { toastErr(e); } }}><Icon n="upload" />{t("import")}</button>
        <a className="btn sm ghost" href="/api/ads/google-conversions.csv"><Icon n="download" />{t("google_offline_csv")}</a></div>
      <span className="tiny muted" style={{ marginTop: 4 }}>{t("ads_csv_hint")}</span></div>
  </div></div>;
}

export function RoasReport() {
  const { t, money } = useT();
  const [days, setDays] = useState(30);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = useQuery({ queryKey: ["roas", days], queryFn: () => get("/api/ads/roas" + qs({ from })) });
  if (!data) return <Spinner />;
  const rows = data.rows as any[]; if (!rows.length) return null;
  const tot = rows.reduce((a, r) => ({ spend: a.spend + Number(r.spend), leads: a.leads + r.leads, patients: a.patients + r.patients, revenue: a.revenue + Number(r.revenue) }), { spend: 0, leads: 0, patients: 0, revenue: 0 });
  const cur = rows.find((r) => r.currency)?.currency ?? "EUR"; const M = (v: number) => money(v / 100, cur);
  return <div className="card" style={{ marginTop: 14 }}><div className="hd"><h3 className="grow">📈 {t("roas_title")}</h3><div className="seg">{[30, 90, 365].map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d}g</button>)}</div></div>
    <div className="row wrap" style={{ gap: 18, padding: "0 16px 10px" }}><span className="small">{t("spend")}: <b>{M(tot.spend)}</b></span><span className="small">{t("cpl")}: <b>{tot.leads ? M(tot.spend / tot.leads) : "—"}</b></span>
      <span className="small">{t("cpa")}: <b>{tot.patients ? M(tot.spend / tot.patients) : "—"}</b></span><span className="small">ROAS: <b>{tot.spend ? (tot.revenue / tot.spend).toFixed(2) + "×" : "—"}</b></span></div>
    <div className="twrap"><table className="tbl"><thead><tr><th>{t("campaign")}</th><th className="r">{t("spend")}</th><th className="r">Lead</th><th className="r">{t("cpl")}</th><th className="r">{t("f_quoted")}</th><th className="r">{t("patients")}</th><th className="r">{t("cpa")}</th><th className="r">{t("collected")}</th><th className="r">ROAS</th></tr></thead><tbody>
      {rows.map((r, i) => { const sp = Number(r.spend), rv = Number(r.revenue); return <tr key={i}><td className="small"><b>{r.campaign}</b>{r.platform && <span className="tiny muted"> · {r.platform}</span>}</td>
        <td className="r num">{sp ? M(sp) : "—"}</td><td className="r num">{r.leads}</td><td className="r num">{sp && r.leads ? M(sp / r.leads) : "—"}</td><td className="r num">{r.quoted}</td><td className="r num">{r.patients}</td>
        <td className="r num">{sp && r.patients ? M(sp / r.patients) : "—"}</td><td className="r num">{rv ? M(rv) : "—"}</td><td className="r num" style={{ fontWeight: 700, color: sp && rv / sp >= 3 ? "var(--ok)" : sp && rv / sp < 1 ? "var(--err)" : undefined }}>{sp ? (rv / sp).toFixed(1) + "×" : "—"}</td></tr>; })}
    </tbody></table></div></div>;
}
