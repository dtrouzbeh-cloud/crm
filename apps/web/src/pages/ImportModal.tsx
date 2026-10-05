import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { post } from "../lib/api.ts";
import { Modal, toastErr } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";

const FIELDS = ["fullName", "phone", "email", "country", "city", "language", "interest", "issue", "campaign", "budget"];
export default function ImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient();
  const [csv, setCsv] = useState(""); const [name, setName] = useState(""); const [prev, setPrev] = useState<any>(null); const [map, setMap] = useState<Record<string, string>>({}); const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false);
  const load = async (f: File) => { const text = await f.text(); setCsv(text); setName(f.name); try { const p = await post("/api/import/preview", { csv: text, fileName: f.name }); setPrev(p); setMap(p.mapping); } catch (e) { toastErr(e); } };
  const run = async () => { setBusy(true); try { setRes(await post("/api/import/run", { csv, mapping: map, fileName: name, source: "import" })); qc.invalidateQueries({ queryKey: ["leads"] }); } catch (e) { toastErr(e); } finally { setBusy(false); } };
  return <Modal onClose={onClose} width={760}><div className="hd"><h2>{t("import_leads")}</h2></div><div className="bd col">
    {!prev && <label className="btn" style={{ height: 90, borderStyle: "dashed" }}><Icon n="upload" />{t("import_pick")}<input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>}
    {prev && !res && <><div className="small muted">{name} · {prev.total} {t("rows")}</div>
      <div className="grid g2">{FIELDS.map((f) => <label key={f} className="f">{t("if2_" + f)}<select className="inp sm" value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value })}><option value="">—</option>{prev.header.map((h: string) => <option key={h} value={h}>{h}</option>)}</select></label>)}</div>
      <div className="twrap" style={{ maxHeight: 180 }}><table className="tbl"><thead><tr>{prev.header.map((h: string) => <th key={h}>{h}</th>)}</tr></thead><tbody>{prev.sample.map((r: any, i: number) => <tr key={i}>{prev.header.map((h: string) => <td key={h} className="small">{r[h]}</td>)}</tr>)}</tbody></table></div>
      <div className="alert info"><Icon n="info" /><span>{t("import_dedupe")}</span></div></>}
    {res && <div className="alert ok" style={{ flexDirection: "column" }}><b>✓ {t("import_done")}</b><span>{t("created")}: {res.created} · {t("skipped")}: {res.skipped} · {t("errors")}: {res.errors.length}</span>{res.errors.slice(0, 5).map((e: any) => <span key={e.row} className="tiny">#{e.row}: {e.error}</span>)}</div>}
  </div><div className="ft"><button className="btn" onClick={onClose}>{res ? t("ok") : t("cancel")}</button>{prev && !res && <button className="btn pri" disabled={busy || (!map.fullName && !map.phone)} onClick={run}>{busy ? t("saving") : t("import_run", { n: prev.total })}</button>}</div></Modal>;
}
