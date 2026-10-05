// Barındırılan lead formu (/l/:key) — reklam/landing bağlantısı veya iframe olarak kullanılır; UTM/ref otomatik
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get, post, ApiError } from "../lib/api.ts";
import { Spinner } from "../components/ui.tsx";

const L: Record<string, Record<string, string>> = {
  en: { title: "Get your free treatment plan", sub: "Send your details — our dentist will prepare a personal plan and quote.", name: "Full name", phone: "WhatsApp / phone", email: "Email", treat: "Treatment you're interested in", msg: "Tell us about your situation", consent: "I agree to be contacted about my enquiry", send: "Send", ok: "Thank you! We'll contact you shortly on WhatsApp.", need: "Name and phone or email are required" },
  tr: { title: "Ücretsiz tedavi planınızı alın", sub: "Bilgilerinizi gönderin — hekimimiz size özel plan ve fiyat teklifi hazırlasın.", name: "Ad soyad", phone: "WhatsApp / telefon", email: "E-posta", treat: "İlgilendiğiniz tedavi", msg: "Durumunuzu kısaca anlatın", consent: "Talebimle ilgili benimle iletişime geçilmesini kabul ediyorum", send: "Gönder", ok: "Teşekkürler! En kısa sürede WhatsApp'tan size ulaşacağız.", need: "Ad ve telefon veya e-posta gerekli" },
  de: { title: "Kostenlosen Behandlungsplan erhalten", sub: "Senden Sie uns Ihre Daten — unser Zahnarzt erstellt Ihren persönlichen Plan.", name: "Vollständiger Name", phone: "WhatsApp / Telefon", email: "E-Mail", treat: "Gewünschte Behandlung", msg: "Beschreiben Sie Ihre Situation", consent: "Ich stimme der Kontaktaufnahme zu", send: "Senden", ok: "Danke! Wir melden uns in Kürze per WhatsApp.", need: "Name und Telefon oder E-Mail erforderlich" },
  ar: { title: "احصل على خطة علاج مجانية", sub: "أرسل بياناتك وسيُعد طبيبنا خطة شخصية.", name: "الاسم الكامل", phone: "واتساب / هاتف", email: "البريد", treat: "العلاج المطلوب", msg: "صف حالتك", consent: "أوافق على التواصل معي", send: "إرسال", ok: "شكراً! سنتواصل معك قريباً عبر واتساب.", need: "الاسم والهاتف أو البريد مطلوبان" },
};

export default function LeadForm() {
  const { key } = useParams<{ key: string }>();
  const { data: cfg, error } = useQuery({ queryKey: ["lf", key], queryFn: () => get(`/api/public/widget/${key}/config`), retry: false });
  const lang = (new URLSearchParams(location.search).get("lang") ?? navigator.language).slice(0, 2); const T = L[lang] ?? L.en!;
  const [f, setF] = useState({ name: "", phone: "", email: "", treatment: new URLSearchParams(location.search).get("t") ?? "", message: "", consent: false });
  const [done, setDone] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (cfg) document.title = `${cfg.clinic} — ${T.title}`; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; }, [cfg]);
  if (error) return <div style={{ padding: 40, textAlign: "center" }}>404</div>;
  if (!cfg) return <Spinner />;
  const c1 = cfg.color;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!f.name.trim() || (!f.phone.trim() && !f.email.trim())) { setErr(T.need); return; }
    const utm: Record<string, string> = {}; new URLSearchParams(location.search).forEach((v, k) => { if (/^utm_|^ref$|^gclid$|^fbclid$/.test(k)) utm[k.replace(/^utm_/, "")] = v; });
    setBusy(true);
    try { await post(`/api/public/widget/${key}/lead`, { ...f, email: f.email || undefined, phone: f.phone || undefined, lang, page: document.referrer || location.href, utm }); setDone(true); }
    catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  };
  const inp = { width: "100%", border: "1px solid #D7DEE3", borderRadius: 10, padding: "11px 12px", font: "inherit", boxSizing: "border-box" } as const;
  return <div style={{ minHeight: "100vh", background: "#F3F6F7", display: "grid", placeItems: "center", padding: 16, color: "#1B2730", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif" }} dir={lang === "ar" ? "rtl" : "ltr"}>
    <div style={{ width: "min(460px,100%)", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,.08)" }}>
      <div style={{ background: c1, color: "#fff", padding: "22px 24px" }}><div style={{ opacity: 0.85, fontWeight: 700 }}>🦷 {cfg.clinic}</div><h1 style={{ margin: "8px 0 4px", fontSize: 22, color: "#fff" }}>{T.title}</h1><div style={{ opacity: 0.9, fontSize: 14 }}>{T.sub}</div></div>
      {done ? <div style={{ padding: 30, textAlign: "center" }}><div style={{ fontSize: 44 }}>✅</div><b>{T.ok}</b></div> :
        <form onSubmit={submit} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={inp} placeholder={T.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <input style={inp} placeholder={T.phone} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input style={inp} placeholder={T.email} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input style={inp} placeholder={T.treat} value={f.treatment} onChange={(e) => setF({ ...f, treatment: e.target.value })} />
          <textarea style={{ ...inp, minHeight: 80 }} placeholder={T.msg} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <label style={{ display: "flex", gap: 8, fontSize: 13, color: "#5B6B76" }}><input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />{T.consent}</label>
          {err && <div style={{ color: "#B91C1C", fontSize: 13 }}>{err}</div>}
          <button disabled={busy} style={{ border: 0, borderRadius: 12, padding: 13, color: "#fff", fontWeight: 700, fontSize: 16, background: c1, cursor: "pointer" }}>{T.send}</button>
        </form>}
    </div></div>;
}
