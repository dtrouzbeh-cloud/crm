// Almanya için maliyet planı (Heil- und Kostenplan formatında Kostenvoranschlag) — /q/:token/hkp?o=0 — teklif snapshot'ından, yazdırılabilir
import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get } from "../lib/api.ts";
import { Spinner } from "../components/ui.tsx";

const UP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], LO = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
// Befund (HKP-Kürzel)
const BEF: Record<string, string> = { missing: "f", root: "x", crown: "k", implant: "i", impl_crown: "i", impl_abut: "i", bridge: "k", pontic: "b", caries: "ww", impacted: "x" };
// Therapieplanung nach Darstellungsart des Katalogs
const PLAN: Record<string, string> = { implant: "I", crown: "K", veneer: "V", ext: "X", fill: "F", inlay: "H", rct: "W", graft: "A", sinus: "SL", arch: "S" };
const tn = (n: any, l: string) => (Array.isArray(n) ? n[["tr", "en", "de", "ar"].indexOf(l)] ?? n[1] : n);
const eur = (v: number, cur: string) => new Intl.NumberFormat("de-DE", { style: "currency", currency: cur }).format(v);

export default function Kostenplan() {
  const { token } = useParams<{ token: string }>();
  const { data: q, error } = useQuery({ queryKey: ["pq", token], queryFn: () => get(`/api/public/q/${token}`), retry: false });
  useEffect(() => { document.title = "Heil- und Kostenplan"; document.documentElement.lang = "de"; document.documentElement.dir = "ltr"; }, []);
  if (error) return <div style={{ padding: 40 }}>404</div>;
  if (!q) return <Spinner />;
  const s = q.snapshot; const oi = Number(new URLSearchParams(location.search).get("o") ?? Math.max(0, s.options.findIndex((o: any) => o.rec)));
  const op = s.options[oi] ?? s.options[0]; const calc = op.calc; const cur = s.currency;
  const txById = Object.fromEntries((s.catalog?.treatments ?? []).map((t: any) => [t.id, t]));
  const bById = Object.fromEntries((s.catalog?.bundles ?? []).map((b: any) => [b.id, b]));
  // Planung pro Zahn
  const plan: Record<number, string[]> = {};
  for (const l of calc.lines as any[]) {
    const r = l.txId ? txById[l.txId]?.render : l.b ? "arch" : null; const code = r ? PLAN[r] : null; if (!code) continue;
    // çene paketleri (All-on-4/6, sabit protez, snap-on): ilgili çenenin tüm dişlerine
    const teeth = l.teeth?.length ? l.teeth : l.b ? (/_u$/.test(l.b) ? UP : /_l$/.test(l.b) ? LO : []) : (l.jaws ?? []).flatMap((j: string) => (j === "u" ? UP : LO));
    for (const t of teeth) (plan[t] ??= []).includes(code) || plan[t].push(code);
  }
  const bef = (t: number) => BEF[s.situation?.[t]?.s] ?? "";
  const lineName = (l: any) => (l.txId && txById[l.txId] ? tn(txById[l.txId].n, "de") : l.b && bById[l.b] ? tn(bById[l.b].n, "de") : l.nm);
  const row = (teeth: number[], kind: "B" | "P") => <tr>{teeth.map((t) => <td key={t} style={{ border: "1px solid #999", textAlign: "center", width: 30, height: 22, fontWeight: kind === "P" ? 700 : 400, color: kind === "P" ? "#0B5" : "#111", fontSize: 11 }}>{kind === "B" ? bef(t) : (plan[t] ?? []).join(",")}</td>)}</tr>;
  const head = (teeth: number[]) => <tr>{teeth.map((t) => <th key={t} style={{ border: "1px solid #999", fontSize: 10, background: "#F1F4F6", padding: 2 }}>{t}</th>)}</tr>;
  const pkgSum = (calc.pkg as any[]).reduce((a, p) => a + p.total, 0);
  const lineSum = (calc.lines as any[]).reduce((a, l) => a + l.total, 0);
  const adj = calc.total - lineSum - pkgSum;
  return <div style={{ background: "#E9EDF0", minHeight: "100vh", padding: "20px 8px", fontFamily: "Arial, Helvetica, sans-serif", color: "#111" }}>
    <style>{`@media print{.noprint{display:none!important}body{background:#fff}.sheet{box-shadow:none!important;margin:0!important}}@page{size:A4;margin:12mm}`}</style>
    <div className="noprint" style={{ maxWidth: 820, margin: "0 auto 10px", display: "flex", gap: 8 }}><button onClick={() => print()} style={{ padding: "8px 14px", borderRadius: 8, border: 0, background: "#0E7C86", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Drucken / PDF</button>
      {s.options.length > 1 && <select value={oi} onChange={(e) => { const u = new URL(location.href); u.searchParams.set("o", e.target.value); location.href = u.toString(); }}>{s.options.map((o: any, i: number) => <option key={i} value={i}>{o.name}</option>)}</select>}</div>
    <div className="sheet" style={{ maxWidth: 820, margin: "0 auto", background: "#fff", padding: 30, boxShadow: "0 4px 20px rgba(0,0,0,.1)", fontSize: 12.5, lineHeight: 1.45 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
        <div><div style={{ fontSize: 20, fontWeight: 800 }}>Heil- und Kostenplan</div><div style={{ color: "#555" }}>Kostenvoranschlag für zahnärztliche Behandlung (Privatbehandlung im Ausland)</div></div>
        <div style={{ textAlign: "right", fontSize: 12 }}><b>{s.clinic.legalName || s.clinic.name}</b><br />{[s.clinic.address, s.clinic.city].filter(Boolean).join(", ")}<br />{s.clinic.phone} · {s.clinic.email}</div>
      </div>
      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse", fontSize: 12.5 }}><tbody>
        <tr><td style={{ padding: 3, width: 170, color: "#555" }}>Patient/in</td><td style={{ padding: 3, fontWeight: 700 }}>{s.patient.name}</td><td style={{ padding: 3, color: "#555" }}>Plan-Nr.</td><td style={{ padding: 3 }}>{q.number}-v{q.version}</td></tr>
        <tr><td style={{ padding: 3, color: "#555" }}>Behandelnde/r Zahnarzt/-ärztin</td><td style={{ padding: 3 }}>{s.staff?.dentist ?? "—"}</td><td style={{ padding: 3, color: "#555" }}>Datum</td><td style={{ padding: 3 }}>{new Date().toLocaleDateString("de-DE")}</td></tr>
        <tr><td style={{ padding: 3, color: "#555" }}>Behandlungsvariante</td><td style={{ padding: 3 }}>{op.name}</td><td style={{ padding: 3, color: "#555" }}>Gültig bis</td><td style={{ padding: 3 }}>{new Date(q.validUntil).toLocaleDateString("de-DE")}</td></tr>
      </tbody></table>

      <h3 style={{ fontSize: 13.5, margin: "18px 0 6px" }}>I. Befund und Behandlungsplanung</h3>
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", margin: "0 auto" }}><tbody>
        <tr><td style={{ fontSize: 10, paddingRight: 6, color: "#0B5", fontWeight: 700 }}>TP</td><td><table style={{ borderCollapse: "collapse" }}><tbody>{row(UP, "P")}{head(UP)}{row(UP, "B")}</tbody></table></td></tr>
        <tr><td style={{ fontSize: 10, paddingRight: 6, color: "#555" }}>B</td><td><table style={{ borderCollapse: "collapse", marginTop: 6 }}><tbody>{row(LO, "B")}{head(LO)}{row(LO, "P")}</tbody></table></td></tr>
      </tbody></table></div>
      <div style={{ fontSize: 10.5, color: "#555", marginTop: 6 }}><b>B = Befund:</b> f fehlender Zahn · x nicht erhaltungswürdiger Zahn · k Krone · i Implantat · b Brückenglied · ww erhaltungswürdiger Zahn mit weitgehender Zerstörung &nbsp;|&nbsp; <b>TP = Therapieplanung:</b> I Implantat · K Krone · V Veneer · X Extraktion · F Füllung · H Inlay/Onlay · W Wurzelbehandlung · A Knochenaufbau · SL Sinuslift · S implantatgetragene Suprakonstruktion</div>

      <h3 style={{ fontSize: 13.5, margin: "18px 0 6px" }}>II. Kostenaufstellung</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ background: "#F1F4F6" }}>{["Leistung", "Zahn / Region", "Anzahl", "Einzelpreis", "Betrag"].map((h, i) => <th key={h} style={{ border: "1px solid #ccc", padding: 5, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>)}</tr></thead><tbody>
        {(calc.lines as any[]).map((l, i) => <tr key={i}><td style={{ border: "1px solid #ddd", padding: 5 }}>{lineName(l)}{l.br ? ` (${l.br})` : ""}</td><td style={{ border: "1px solid #ddd", padding: 5 }}>{(l.teeth ?? []).join(", ") || (l.jaws ?? []).map((j: string) => (j === "u" ? "OK" : "UK")).join(", ") || (/_u$/.test(l.b ?? "") ? "OK" : /_l$/.test(l.b ?? "") ? "UK" : "—")}</td>
          <td style={{ border: "1px solid #ddd", padding: 5, textAlign: "right" }}>{l.qty}</td><td style={{ border: "1px solid #ddd", padding: 5, textAlign: "right" }}>{eur(l.unit, cur)}</td><td style={{ border: "1px solid #ddd", padding: 5, textAlign: "right" }}>{eur(l.total, cur)}</td></tr>)}
        {(calc.pkg as any[]).filter((p) => p.total).map((p, i) => <tr key={"p" + i}><td colSpan={4} style={{ border: "1px solid #ddd", padding: 5, color: "#555" }}>{p.k === "hotel" ? "Unterkunft (Hotel)" : p.k === "transfer" ? "Transfer" : p.k === "flight" ? "Flugkostenzuschuss" : p.nm}</td><td style={{ border: "1px solid #ddd", padding: 5, textAlign: "right" }}>{eur(p.total, cur)}</td></tr>)}
        {Math.abs(adj) >= 0.01 && <tr><td colSpan={4} style={{ border: "1px solid #ddd", padding: 5, color: "#555" }}>Rabatt / Rundung</td><td style={{ border: "1px solid #ddd", padding: 5, textAlign: "right" }}>{eur(adj, cur)}</td></tr>}
        <tr><td colSpan={4} style={{ border: "1px solid #999", padding: 6, fontWeight: 800 }}>Voraussichtliche Gesamtkosten</td><td style={{ border: "1px solid #999", padding: 6, textAlign: "right", fontWeight: 800 }}>{eur(calc.total, cur)}</td></tr>
        {calc.deposit > 0 && <tr><td colSpan={4} style={{ border: "1px solid #ddd", padding: 5, color: "#555" }}>davon Anzahlung bei Terminbestätigung</td><td style={{ border: "1px solid #ddd", padding: 5, textAlign: "right" }}>{eur(calc.deposit, cur)}</td></tr>}
      </tbody></table>

      <h3 style={{ fontSize: 13.5, margin: "18px 0 6px" }}>III. Behandlungsablauf</h3>
      <div>{(calc.visits as any[]).filter((v) => v.lines.length).map((v) => <div key={v.v}>{v.v}. Aufenthalt: {v.lines.map((l: any) => lineName(l)).join(", ")}</div>)}
        {calc.visits.length > 1 && <div style={{ color: "#555" }}>Einheilzeit zwischen den Aufenthalten: ca. {s.gap?.min ?? 3}–{s.gap?.max ?? 6} Monate.</div>}</div>

      <h3 style={{ fontSize: 13.5, margin: "18px 0 6px" }}>IV. Hinweise</h3>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#333" }}>
        <li>Es handelt sich um eine privatzahnärztliche Behandlung im Ausland. Die Erstattung richtet sich nach Ihrem Versicherungstarif; bitte reichen Sie diesen Plan vor Behandlungsbeginn bei Ihrer Kranken- bzw. Zusatzversicherung ein.</li>
        <li>Der Plan basiert auf den vorliegenden Unterlagen (Fotos/Röntgenbilder). Nach der klinischen Untersuchung und 3D-Diagnostik können sich Änderungen ergeben; diese werden vor Durchführung mit Ihnen abgestimmt.</li>
        <li>Material- und Laborkosten sind in den Einzelpreisen enthalten.</li>
      </ul>

      <div style={{ display: "flex", gap: 40, marginTop: 40 }}>
        <div style={{ flex: 1, borderTop: "1px solid #333", paddingTop: 4, fontSize: 11 }}>Datum, Unterschrift und Stempel der Praxis</div>
        <div style={{ flex: 1, borderTop: "1px solid #333", paddingTop: 4, fontSize: 11 }}>Datum, Unterschrift Patient/in</div>
      </div>
    </div></div>;
}
