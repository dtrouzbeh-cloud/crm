// Tercüman ekranı: günün randevuları, hastanın planı iki dilde, tıbbi uyarılar, cümle kitabı (büyük ekran + sesli okuma), randevu notu
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, post } from "../lib/api.ts";
import { PageHead, Spinner, Empty, toast, toastErr, Switch } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useCatalog } from "../lib/catalog.ts";
import { tn } from "@dentaflow/core/engine";
import { LANG_NAMES } from "@dentaflow/core/i18n";
import { flag } from "../lib/format.tsx";
import { PHRASES, PHRASE_LANGS, SPEECH } from "../lib/phrases.ts";

const speak = (text: string, lang: string) => { try { const u = new SpeechSynthesisUtterance(text); u.lang = SPEECH[lang] ?? lang; u.rate = 0.92; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* desteklenmiyor */ } };
const STC: Record<string, string> = { booked: "", confirmed: "info", arrived: "warn", in_chair: "brand", done: "ok" };

export default function Interpreter() {
  const { t, lang, date } = useT(); const { cat } = useCatalog(); const qc = useQueryClient();
  const [mine, setMine] = useState(true); const [sel, setSel] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["interp", mine], queryFn: () => get<any[]>(`/api/interpreter/agenda?days=2&mine=${mine}`), refetchInterval: 60_000 });
  const a = data?.find((x) => x.id === sel) ?? data?.[0];
  const pl = a?.language && PHRASE_LANGS.includes(a.language) ? a.language : "en";
  const [pLang, setPLang] = useState<string | null>(null); const target = pLang ?? pl;
  const [catF, setCatF] = useState("greet"); const [big, setBig] = useState<string | null>(null); const [note, setNote] = useState("");
  const nameIn = (it: any, L: string) => { const x = it.txId && cat?.tx(it.txId); if (x) return tn(x.n, L); const b = it.b && cat?.bundle(it.b); if (b) return tn((b as any).n, L); return it.name; };
  const own = PHRASE_LANGS.indexOf((PHRASE_LANGS as readonly string[]).includes(lang) ? lang as any : "tr");
  const ti = PHRASE_LANGS.indexOf(target as any);
  const cats = useMemo(() => [...new Set(PHRASES.map((p) => p.cat))], []);
  const addNote = async () => { if (!a || !note.trim()) return; try { await post(`/api/interpreter/appointments/${a.id}/note`, { text: note }); setNote(""); qc.invalidateQueries({ queryKey: ["interp"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <><PageHead title={t("nav_interpreter")} sub={t("interpreter_sub")} actions={<Switch checked={mine} onChange={setMine} label={t("only_mine")} />} />
    <div className="interp-grid">
      <div className="card"><div className="hd"><h3 className="grow">{t("agenda")}</h3></div>
        {!data ? <Spinner /> : !data.length ? <Empty icon="cal" text={t("no_appointments")} /> : <div className="col" style={{ gap: 0 }}>{data.map((x) => <button key={x.id} onClick={() => { setSel(x.id); setPLang(null); }}
          style={{ textAlign: "start", border: 0, borderBottom: "1px solid var(--line)", background: a?.id === x.id ? "var(--brand-soft)" : "transparent", padding: "10px 14px", cursor: "pointer", color: "inherit" }}>
          <div className="row" style={{ gap: 8 }}><b className="num">{date(x.startAt, { hour: "2-digit", minute: "2-digit" })}</b><span className="tiny muted">{date(x.startAt, { weekday: "short", day: "numeric" })}</span><span className="grow" /><span className={"bdg " + (STC[x.status] ?? "")}>{t("ap_" + x.status)}</span></div>
          <div style={{ fontWeight: 600 }}>{flag(x.country)} {x.fullName}</div><div className="tiny muted">{LANG_NAMES[x.language as keyof typeof LANG_NAMES] ?? x.language ?? "—"} · {x.title}{x.dentistName ? " · " + x.dentistName : ""}</div>
        </button>)}</div>}
      </div>
      {a ? <div className="col" style={{ gap: 14 }}>
        <div className="card pad"><div className="row wrap" style={{ gap: 12 }}>
          <div className="grow"><div style={{ fontSize: 20, fontWeight: 750 }}>{flag(a.country)} {a.fullName}</div><div className="small muted">{a.title} · {date(a.startAt, { hour: "2-digit", minute: "2-digit" })}{a.chair ? " · " + t("chair") + " " + a.chair : ""}{a.visitNo ? " · " + t("visit_n", { n: a.visitNo }) : ""}</div></div>
          <span className="bdg brand" style={{ fontSize: 13, height: 26 }}>🗣 {LANG_NAMES[a.language as keyof typeof LANG_NAMES] ?? a.language ?? "?"}</span>
          {a.phone && <a className="btn sm" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${String(a.phone).replace(/\D/g, "")}`}><Icon n="wa" />WhatsApp</a>}
        </div>
          {(a.flags?.length > 0 || a.allergies) && <div className="alert err" style={{ marginTop: 10 }}><Icon n="alert" /><span><b>{t("medical_alerts")}:</b> {(a.flags ?? []).map((f: string) => t("med_" + f)).join(", ")}{a.allergies ? ` · ${t("allergies")}: ${a.allergies}` : ""}{a.medications ? ` · ${t("medications")}: ${a.medications}` : ""}</span></div>}
          {a.notes && <pre className="small" style={{ whiteSpace: "pre-wrap", background: "var(--subtle)", padding: 10, borderRadius: 8, marginTop: 10, fontFamily: "inherit" }}>{a.notes}</pre>}
          <div className="row" style={{ gap: 6, marginTop: 10 }}><input className="inp sm grow" placeholder={t("interp_note_ph")} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} /><button className="btn sm" onClick={addNote}>{t("add")}</button></div>
        </div>
        {a.items?.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("todays_plan")}</h3><span className="tiny muted">{(LANG_NAMES as any)[lang]} ⇄ {(LANG_NAMES as any)[target]}</span></div><div className="twrap"><table className="tbl"><tbody>
          {a.items.map((it: any, i: number) => <tr key={i} style={{ opacity: it.amended === "remove" ? 0.5 : 1 }}><td className="small"><b>{nameIn(it, lang)}</b>{it.amended && <span className={"bdg " + (it.amended === "add" ? "ok" : "err")} style={{ marginInlineStart: 6 }}>{it.amended === "add" ? "+" : "−"}</span>}</td>
            <td className="small" dir={target === "ar" ? "rtl" : "ltr"}>{nameIn(it, target)} <button className="btn xs ghost icon" title={t("speak")} onClick={() => speak(nameIn(it, target), target)}>🔊</button></td>
            <td className="small muted">{it.teeth?.length ? it.teeth.join(", ") : ""} × {it.qty}</td></tr>)}
        </tbody></table></div></div>}
        <div className="card"><div className="hd" style={{ flexWrap: "wrap", gap: 8 }}><h3 className="grow">{t("phrasebook")}</h3>
          <select className="inp sm" style={{ width: "auto" }} value={target} onChange={(e) => setPLang(e.target.value)}>{PHRASE_LANGS.map((l) => <option key={l} value={l}>{(LANG_NAMES as any)[l]}</option>)}</select></div>
          <div className="bd" style={{ paddingTop: 0 }}><div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>{cats.map((c) => <button key={c} className={"chip" + (catF === c ? " on" : "")} onClick={() => setCatF(c)}>{t("ph_" + c)}</button>)}</div>
            <div className="col" style={{ gap: 6 }}>{PHRASES.filter((p) => p.cat === catF).map((p, i) => <div key={i} className="row" style={{ gap: 8, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10 }}>
              <div className="grow"><div className="small muted">{p.p[own]}</div><div style={{ fontWeight: 600, fontSize: 15 }} dir={target === "ar" ? "rtl" : "ltr"}>{p.p[ti]}</div></div>
              <button className="btn sm ghost icon" title={t("speak")} onClick={() => speak(p.p[ti]!, target)}>🔊</button>
              <button className="btn sm ghost icon" title={t("show_patient")} onClick={() => setBig(p.p[ti]!)}><Icon n="eye" /></button></div>)}</div></div></div>
      </div> : <div className="card"><Empty icon="globe" text={t("no_appointments")} /></div>}
    </div>
    {big && <div onClick={() => setBig(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "#0B1F2A", color: "#fff", display: "grid", placeItems: "center", padding: 32, cursor: "pointer" }}>
      <div dir={target === "ar" ? "rtl" : "ltr"} style={{ fontSize: "clamp(28px,5vw,64px)", fontWeight: 700, lineHeight: 1.3, textAlign: "center", maxWidth: 1100 }}>{big}</div>
      <div style={{ position: "absolute", bottom: 24, opacity: 0.6, fontSize: 14 }}>{t("tap_to_close")}</div></div>}
  </>;
}
