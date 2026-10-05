// Hasta garanti kartı + implant pasaportu (/w/:token) — yazdırılabilir, 4 dil
import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get } from "../lib/api.ts";
import { Spinner } from "../components/ui.tsx";

const W: Record<string, Record<string, string>> = {
  en: { title: "Treatment Warranty", no: "Certificate No.", issued: "Issued", patient: "Patient", treat: "Treatment", teeth: "Teeth", period: "Warranty", lifetime: "Lifetime", years: "years", until: "valid until", passport: "Implant Passport", tooth: "Tooth", brand: "Brand / System", size: "Ø × L (mm)", placed: "Placed", cond: "Conditions", print: "Print / Save PDF", void: "This certificate is no longer valid.", def: "The warranty requires regular check-ups (at least once a year) and good oral hygiene. It does not cover damage caused by accidents, misuse or treatment by third parties. Keep this card and show it to any dentist treating you." },
  tr: { title: "Tedavi Garanti Belgesi", no: "Belge No", issued: "Düzenlenme", patient: "Hasta", treat: "Tedavi", teeth: "Dişler", period: "Garanti", lifetime: "Ömür boyu", years: "yıl", until: "geçerlilik", passport: "İmplant Pasaportu", tooth: "Diş", brand: "Marka / Sistem", size: "Ø × L (mm)", placed: "Takılma", cond: "Koşullar", print: "Yazdır / PDF", void: "Bu belge artık geçerli değildir.", def: "Garanti, düzenli kontroller (en az yılda bir) ve iyi ağız hijyeni şartına bağlıdır. Kaza, hatalı kullanım veya başka hekimlerce yapılan müdahalelerden kaynaklanan hasarları kapsamaz. Bu kartı saklayın ve sizi tedavi eden her hekime gösterin." },
  de: { title: "Behandlungsgarantie", no: "Zertifikat-Nr.", issued: "Ausgestellt", patient: "Patient", treat: "Behandlung", teeth: "Zähne", period: "Garantie", lifetime: "Lebenslang", years: "Jahre", until: "gültig bis", passport: "Implantatpass", tooth: "Zahn", brand: "Marke / System", size: "Ø × L (mm)", placed: "Gesetzt", cond: "Bedingungen", print: "Drucken / PDF", void: "Dieses Zertifikat ist nicht mehr gültig.", def: "Die Garantie setzt regelmäßige Kontrollen (mindestens jährlich) und gute Mundhygiene voraus. Schäden durch Unfälle, unsachgemäße Nutzung oder Behandlung durch Dritte sind ausgeschlossen. Bewahren Sie diesen Pass auf." },
  ar: { title: "شهادة ضمان العلاج", no: "رقم الشهادة", issued: "تاريخ الإصدار", patient: "المريض", treat: "العلاج", teeth: "الأسنان", period: "الضمان", lifetime: "مدى الحياة", years: "سنوات", until: "صالح حتى", passport: "جواز الزرعات", tooth: "السن", brand: "العلامة / النظام", size: "Ø × L (مم)", placed: "تاريخ التركيب", cond: "الشروط", print: "طباعة / PDF", void: "هذه الشهادة لم تعد صالحة.", def: "يتطلب الضمان فحوصات منتظمة (مرة سنوياً على الأقل) ونظافة فموية جيدة، ولا يشمل الأضرار الناتجة عن الحوادث أو سوء الاستخدام أو علاج أطراف أخرى." },
};

export default function WarrantyCard() {
  const { token } = useParams<{ token: string }>();
  const { data: w, error } = useQuery({ queryKey: ["pw", token], queryFn: () => get(`/api/public/w/${token}`), retry: false });
  const L = w && W[w.lang] ? w.lang : "en", T = W[L]!;
  useEffect(() => { if (w) { document.title = `${w.clinic.name} — ${T.title}`; document.documentElement.dir = L === "ar" ? "rtl" : "ltr"; } }, [w]);
  if (error) return <div style={{ padding: 40, textAlign: "center" }}>404</div>;
  if (!w) return <Spinner />;
  const c1 = w.clinic.color || "#0E7C86"; const d = (x: string) => new Date(x).toLocaleDateString(L, { day: "numeric", month: "long", year: "numeric" });
  const until = (y: number | null) => (y === null ? T.lifetime : `${y} ${T.years} · ${T.until} ${d(new Date(new Date(w.issuedAt).getTime() + y * 365.25 * 86400000).toISOString())}`);
  return <div style={{ minHeight: "100vh", background: "#F3F6F7", padding: "24px 12px", color: "#1B2730" }} dir={L === "ar" ? "rtl" : "ltr"}>
    <style>{`@media print{.noprint{display:none!important}body{background:#fff}}`}</style>
    <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
      <div style={{ background: c1, color: "#fff", padding: "26px 28px" }}><div style={{ opacity: 0.85, fontWeight: 700 }}>🦷 {w.clinic.name}</div>
        <h1 style={{ margin: "10px 0 0", fontSize: 26, color: "#fff" }}>🛡 {T.title}</h1>
        <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 13, opacity: 0.9, flexWrap: "wrap" }}><span>{T.no}: <b>W-{String(w.number).padStart(5, "0")}</b></span><span>{T.issued}: {d(w.issuedAt)}</span><span>{T.patient}: <b>{w.patient}</b></span></div></div>
      <div style={{ padding: 28 }}>
        {w.status !== "active" && <div style={{ background: "#FEE2E2", color: "#B91C1C", padding: 10, borderRadius: 8, marginBottom: 14, fontWeight: 700 }}>{T.void}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}><thead><tr style={{ borderBottom: "2px solid #1B2730", textAlign: "start" }}><th style={{ padding: 6, textAlign: "start" }}>{T.treat}</th><th style={{ padding: 6, textAlign: "start" }}>{T.teeth}</th><th style={{ padding: 6, textAlign: "start" }}>{T.period}</th></tr></thead>
          <tbody>{(w.items as any[]).map((it, i) => <tr key={i} style={{ borderBottom: "1px solid #E5E7EB" }}><td style={{ padding: 6 }}>{it.desc}</td><td style={{ padding: 6 }}>{it.teeth?.join(", ") || "—"}</td><td style={{ padding: 6, fontWeight: 650, color: it.years === null ? c1 : undefined }}>{until(it.years)}</td></tr>)}</tbody></table>
        {w.implants.length > 0 && <><h2 style={{ fontSize: 17, marginTop: 26 }}>🔩 {T.passport}</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ borderBottom: "2px solid #1B2730" }}>{[T.tooth, T.brand, T.size, "LOT", "SN", T.placed].map((h) => <th key={h} style={{ padding: 6, textAlign: "start" }}>{h}</th>)}</tr></thead>
            <tbody>{(w.implants as any[]).map((i, k) => <tr key={k} style={{ borderBottom: "1px solid #E5E7EB" }}><td style={{ padding: 6, fontWeight: 700 }}>{i.tooth}</td><td style={{ padding: 6 }}>{i.brand} {i.system ?? ""}</td><td style={{ padding: 6 }}>{i.diameter ?? "—"} × {i.length ?? "—"}</td><td style={{ padding: 6, fontFamily: "monospace" }}>{i.lot ?? "—"}</td><td style={{ padding: 6, fontFamily: "monospace" }}>{i.serial ?? "—"}</td><td style={{ padding: 6 }}>{d(i.placedAt)}</td></tr>)}</tbody></table></>}
        <h3 style={{ fontSize: 14, marginTop: 24 }}>{T.cond}</h3><p style={{ fontSize: 12.5, color: "#5B6B76", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.conditions || T.def}</p>
        <div style={{ marginTop: 18, fontSize: 12, color: "#5B6B76" }}>{[w.clinic.address, w.clinic.phone, w.clinic.email, w.clinic.website].filter(Boolean).join(" · ")}</div>
        <button className="btn pri noprint" style={{ marginTop: 18, background: c1, borderColor: c1 }} onClick={() => print()}>{T.print}</button>
      </div></div></div>;
}
