// Hasta form sayfası (/f/:token): onam, anamnez, anket — imza alanı ile. Oturum gerekmez.
import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get, post, ApiError } from "../lib/api.ts";
import { Spinner } from "../components/ui.tsx";
import { SignaturePad } from "../components/SignaturePad.tsx";

const PF: Record<string, Record<string, string>> = {
  en: { submit: "Submit", yes: "Yes", no: "No", sign: "Sign here", clear: "Clear", name: "Full name", thanks: "Thank you!", done: "Your form has been received.", review: "Would you share your experience?", invalid: "This link is invalid or has expired.", already: "This form has already been completed.", required: "Please complete the required fields.", preview: "Staff preview — submissions are disabled", not_likely: "Not likely", very_likely: "Very likely", agree_sig: "By signing, I confirm that I have read and agree to the above." },
  tr: { submit: "Gönder", yes: "Evet", no: "Hayır", sign: "Buraya imzalayın", clear: "Temizle", name: "Ad soyad", thanks: "Teşekkürler!", done: "Formunuz alındı.", review: "Deneyiminizi paylaşır mısınız?", invalid: "Bu bağlantı geçersiz veya süresi dolmuş.", already: "Bu form zaten doldurulmuş.", required: "Lütfen zorunlu alanları doldurun.", preview: "Personel önizlemesi — gönderim kapalı", not_likely: "Hiç olası değil", very_likely: "Çok olası", agree_sig: "İmzalayarak yukarıdakileri okuduğumu ve kabul ettiğimi onaylıyorum." },
  de: { submit: "Absenden", yes: "Ja", no: "Nein", sign: "Hier unterschreiben", clear: "Löschen", name: "Vollständiger Name", thanks: "Vielen Dank!", done: "Ihr Formular wurde empfangen.", review: "Möchten Sie Ihre Erfahrung teilen?", invalid: "Dieser Link ist ungültig oder abgelaufen.", already: "Dieses Formular wurde bereits ausgefüllt.", required: "Bitte füllen Sie die Pflichtfelder aus.", preview: "Mitarbeitervorschau — Absenden deaktiviert", not_likely: "Unwahrscheinlich", very_likely: "Sehr wahrscheinlich", agree_sig: "Mit meiner Unterschrift bestätige ich, das Obige gelesen zu haben und zuzustimmen." },
  ar: { submit: "إرسال", yes: "نعم", no: "لا", sign: "وقّع هنا", clear: "مسح", name: "الاسم الكامل", thanks: "شكراً لك!", done: "تم استلام النموذج.", review: "هل تشاركنا تجربتك؟", invalid: "هذا الرابط غير صالح أو منتهي.", already: "تم ملء هذا النموذج مسبقاً.", required: "يرجى ملء الحقول المطلوبة.", preview: "معاينة الموظفين — الإرسال معطل", not_likely: "غير محتمل", very_likely: "محتمل جداً", agree_sig: "بتوقيعي أؤكد أنني قرأت ما سبق وأوافق عليه." },
};

function rich(s: string) { return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p)); }

export default function PatientForm() {
  const { token } = useParams<{ token: string }>();
  const preview = new URLSearchParams(location.search).has("preview");
  const { data, error } = useQuery({ queryKey: ["pf", token], queryFn: () => get(`/api/public/f/${token}`), retry: false });
  const [a, setA] = useState<Record<string, any>>({}); const [sig, setSig] = useState<string | null>(null); const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null); const [bad, setBad] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { reviews: { name: string; url: string }[] }>(null);
  const s = data?.snapshot; const L = s?.lang && PF[s.lang] ? s.lang : (navigator.language.slice(0, 2) in PF ? navigator.language.slice(0, 2) : "en"); const T = PF[L]!;
  useEffect(() => { if (data && !preview && data.status !== "completed") post(`/api/public/f/${token}/open`).catch(() => {}); }, [data?.status]);
  useEffect(() => { if (s) { document.title = `${s.clinic.name} — ${s.title}`; document.documentElement.lang = L; document.documentElement.dir = L === "ar" ? "rtl" : "ltr"; setName((n) => n || s.patient.name); } }, [s]);
  if (error) return <Shell color="#0E7C86"><div className="pc"><h2>{T.invalid}</h2></div></Shell>;
  if (!data) return <Spinner />;
  if (data.status === "expired") return <Shell color={s.clinic.color} s={s}><div className="pc"><h2>{T.invalid}</h2></div></Shell>;
  if (done || data.status === "completed") {
    const reviews: { name: string; url: string }[] = done?.reviews ?? data.reviews ?? [];
    return <Shell color={s.clinic.color} s={s}><div className="pc" style={{ textAlign: "center", padding: 34 }}>
      <div style={{ fontSize: 48 }}>✅</div><h2 style={{ margin: "8px 0" }}>{T.thanks}</h2><p style={{ color: "#5B6B76" }}>{done ? T.done : T.already}</p>
      {reviews.length > 0 && <><p style={{ marginTop: 22, fontWeight: 650 }}>⭐ {T.review}</p><div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {reviews.map((r) => <a key={r.url} className="btn pri" href={r.url} target="_blank" rel="noopener" style={{ background: s.clinic.color, borderColor: s.clinic.color }}>{r.name}</a>)}</div></>}
    </div></Shell>;
  }
  const set = (k: string, v: any) => { setA({ ...a, [k]: v }); setBad(null); };
  const submit = async () => {
    setErr(null);
    for (const f of s.fields) {
      if (f.type === "heading" || !f.required) continue; const v = a[f.key];
      if (v === undefined || v === null || v === "" || (f.type === "checkbox" && v !== true) || (Array.isArray(v) && !v.length)) { setBad(f.key); setErr(T.required); document.getElementById("f-" + f.key)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    }
    if (s.requireSignature && (!sig || name.trim().length < 2)) { setErr(T.required); setBad("__sig"); return; }
    setBusy(true);
    try { const r = await post(`/api/public/f/${token}/submit`, { answers: a, signedName: s.requireSignature ? name.trim() : undefined, signature: s.requireSignature ? sig : undefined }); setDone({ reviews: r.reviews ?? [] }); scrollTo(0, 0); }
    catch (e) { const x = e as ApiError; setErr(x.message); if (x.details?.key) setBad(x.details.key); } finally { setBusy(false); }
  };
  const box = (k: string) => ({ id: "f-" + k, style: { padding: "12px 0", borderBottom: "1px solid #EEF2F4", ...(bad === k ? { background: "#FFF5F5", boxShadow: "0 0 0 2px #F5B5B5", borderRadius: 8, padding: 12 } : {}) } });
  return <Shell color={s.clinic.color} s={s}>
    {preview && <div className="prevbar">{T.preview}</div>}
    {s.body && <div className="pc" style={{ lineHeight: 1.65, fontSize: 15 }}>{s.body.split(/\n\n+/).map((p: string, i: number) => <p key={i} style={{ margin: "0 0 12px" }}>{rich(p)}</p>)}</div>}
    <div className="pc">
      {s.fields.map((f: any) => {
        if (f.type === "heading") return <h3 key={f.key} style={{ margin: "18px 0 4px", color: s.clinic.color }}>{f.label}</h3>;
        const lbl = <div style={{ fontWeight: 600, marginBottom: 8 }}>{f.label}{f.required && <span style={{ color: "#D33" }}> *</span>}</div>;
        const v = a[f.key];
        if (f.type === "checkbox") return <label key={f.key} {...box(f.key)} className="row" ><input type="checkbox" style={{ width: 20, height: 20, flex: "none" }} checked={v === true} onChange={(e) => set(f.key, e.target.checked)} /><span style={{ fontWeight: 600 }}>{f.label}{f.required && <span style={{ color: "#D33" }}> *</span>}</span></label>;
        return <div key={f.key} {...box(f.key)}>{lbl}
          {f.type === "yesno" && <div style={{ display: "flex", gap: 8 }}>{[true, false].map((b) => <button key={String(b)} type="button" className="btn" style={v === b ? { background: s.clinic.color, color: "#fff", borderColor: s.clinic.color, minWidth: 90 } : { minWidth: 90 }} onClick={() => set(f.key, b)}>{b ? T.yes : T.no}</button>)}</div>}
          {f.type === "text" && <input className="inp" value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />}
          {f.type === "number" && <input className="inp" inputMode="numeric" style={{ maxWidth: 140 }} value={v ?? ""} onChange={(e) => set(f.key, e.target.value.replace(/[^\d.]/g, ""))} />}
          {f.type === "date" && <input className="inp" type="date" style={{ maxWidth: 200 }} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />}
          {f.type === "textarea" && <textarea className="inp" rows={3} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />}
          {f.type === "choice" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{(f.options ?? []).map((o: string) => <button key={o} type="button" className="chip" style={v === o ? { background: s.clinic.color, color: "#fff", borderColor: s.clinic.color } : {}} onClick={() => set(f.key, o)}>{o}</button>)}</div>}
          {f.type === "multi" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{(f.options ?? []).map((o: string) => { const on = (v ?? []).includes(o); return <button key={o} type="button" className="chip" style={on ? { background: s.clinic.color, color: "#fff", borderColor: s.clinic.color } : {}} onClick={() => set(f.key, on ? v.filter((x: string) => x !== o) : [...(v ?? []), o])}>{on ? "✓ " : ""}{o}</button>; })}</div>}
          {f.type === "rating" && <div style={{ display: "flex", gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={String(n)} onClick={() => set(f.key, n)} style={{ fontSize: 30, background: "none", border: 0, cursor: "pointer", color: (v ?? 0) >= n ? "#F5A524" : "#D5DCE1", padding: 0 }}>★</button>)}</div>}
          {f.type === "nps" && <div><div style={{ display: "grid", gridTemplateColumns: "repeat(11,1fr)", gap: 4 }}>{Array.from({ length: 11 }, (_, n) => <button key={n} type="button" onClick={() => set(f.key, n)} style={{ height: 40, borderRadius: 8, border: "1px solid #D7DEE3", cursor: "pointer", fontWeight: 650, background: v === n ? (n >= 9 ? "#16A34A" : n >= 7 ? "#F59E0B" : "#DC2626") : "#fff", color: v === n ? "#fff" : "#1B2730" }}>{n}</button>)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8A99A4", marginTop: 4 }}><span>{T.not_likely}</span><span>{T.very_likely}</span></div></div>}
        </div>;
      })}
      {s.requireSignature && <div {...box("__sig")} style={{ ...box("__sig").style, borderBottom: 0 }}>
        <p style={{ fontSize: 13, color: "#5B6B76" }}>{T.agree_sig}</p>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>{T.name} *<input className="inp" style={{ marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <SignaturePad onChange={setSig} label={T.sign} clear={T.clear} />
      </div>}
      {err && <div className="alert err" style={{ marginTop: 12 }}>{err}</div>}
      <button className="btn pri lg" style={{ width: "100%", marginTop: 16, height: 48, fontSize: 16, background: s.clinic.color, borderColor: s.clinic.color }} disabled={busy || preview} onClick={submit}>{T.submit}</button>
    </div>
  </Shell>;
}

function Shell({ color, s, children }: { color: string; s?: any; children: React.ReactNode }) {
  return <div className="pp" style={{ ["--c1" as never]: color || "#0E7C86" }} dir={s?.lang === "ar" ? "rtl" : "ltr"}>
    <div className="hero" style={{ paddingBottom: 64 }}><div className="in" style={{ maxWidth: 720 }}>
      {s && <div className="row" style={{ gap: 10, fontWeight: 750, fontSize: 17 }}>{s.clinic.logo ? <img src={s.clinic.logo} alt="" style={{ height: 34, borderRadius: 8, background: "#fff" }} /> : <span style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center" }}>🦷</span>}{s.clinic.name}</div>}
      {s && <><h1 style={{ fontSize: 26, marginTop: 22, color: "#fff" }}>{s.title}</h1><div style={{ opacity: 0.85 }}>{s.patient.name}</div></>}
    </div></div>
    <div className="body" style={{ maxWidth: 720 }}>{children}</div>
  </div>;
}
