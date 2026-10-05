// Herkese açık landing page (/p/:clinic/:slug) — bloklar, katalog fiyatları, klinik içerikleri, form → lead, sohbet widget'ı
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get, post, ApiError } from "../lib/api.ts";
import { Spinner } from "../components/ui.tsx";

const T: Record<string, Record<string, string>> = {
  en: { from: "from", name: "Full name", phone: "WhatsApp / phone", email: "Email", treat: "Treatment", msg: "Tell us about your situation", consent: "I agree to be contacted", send: "Get my free plan", ok: "Thank you! We'll contact you shortly.", faq: "Frequently asked questions", reviews: "What our patients say", team: "Our team", prices: "Prices", results: "Results", need: "Name and phone or email are required" },
  tr: { from: "başlayan", name: "Ad soyad", phone: "WhatsApp / telefon", email: "E-posta", treat: "Tedavi", msg: "Durumunuzu anlatın", consent: "Benimle iletişime geçilmesini kabul ediyorum", send: "Ücretsiz plan iste", ok: "Teşekkürler! En kısa sürede size ulaşacağız.", faq: "Sık sorulan sorular", reviews: "Hastalarımız ne diyor", team: "Ekibimiz", prices: "Fiyatlar", results: "Sonuçlar", need: "Ad ve telefon veya e-posta gerekli" },
  de: { from: "ab", name: "Vollständiger Name", phone: "WhatsApp / Telefon", email: "E-Mail", treat: "Behandlung", msg: "Beschreiben Sie Ihre Situation", consent: "Ich stimme der Kontaktaufnahme zu", send: "Kostenlosen Plan erhalten", ok: "Danke! Wir melden uns in Kürze.", faq: "Häufige Fragen", reviews: "Das sagen unsere Patienten", team: "Unser Team", prices: "Preise", results: "Ergebnisse", need: "Name und Telefon oder E-Mail erforderlich" },
  ar: { from: "يبدأ من", name: "الاسم الكامل", phone: "واتساب / هاتف", email: "البريد", treat: "العلاج", msg: "صف حالتك", consent: "أوافق على التواصل", send: "احصل على خطة مجانية", ok: "شكراً! سنتواصل معك قريباً.", faq: "الأسئلة الشائعة", reviews: "آراء مرضانا", team: "فريقنا", prices: "الأسعار", results: "النتائج", need: "الاسم والهاتف أو البريد مطلوبان" },
};
const pk = (v: any, l: string) => (typeof v === "string" ? v : v?.[l] ?? v?.en ?? v?.tr ?? Object.values(v ?? {})[0] ?? "");

export default function LandingPage() {
  const { clinic, slug } = useParams<{ clinic: string; slug: string }>();
  const prev = new URLSearchParams(location.search).has("preview");
  const { data: p, error } = useQuery({ queryKey: ["lp", clinic, slug], queryFn: () => get(`/api/public/lp/${clinic}/${slug}${prev ? "?preview=1" : ""}`), retry: false });
  const [f, setF] = useState({ name: "", phone: "", email: "", treatment: "", message: "", consent: false }); const [done, setDone] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (!p) return; document.title = p.title; document.documentElement.lang = p.lang; document.documentElement.dir = p.lang === "ar" ? "rtl" : "ltr";
    if (p.widgetKey && !document.querySelector("script[data-df]")) { const s = document.createElement("script"); s.src = "/widget.js"; s.dataset.key = p.widgetKey; s.dataset.df = "1"; document.body.appendChild(s); } }, [p]);
  if (error) return <div style={{ padding: 40, textAlign: "center" }}>404</div>;
  if (!p) return <Spinner />;
  const L = T[p.lang] ? p.lang : "en", t = T[L]!, c1 = p.clinic.color || "#0E7C86";
  const money = (v: number) => new Intl.NumberFormat(L, { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(v);
  const content = (k: string) => (p.content as any[]).filter((x) => x.kind === k);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); if (!f.name || (!f.phone && !f.email)) { setErr(t.need); return; }
    const utm: Record<string, string> = {}; new URLSearchParams(location.search).forEach((v, k) => { if (/^utm_|^ref$|^gclid$|^fbclid$/.test(k)) utm[k.replace(/^utm_/, "")] = v; });
    try { await post(`/api/public/lp/${clinic}/${slug}/lead`, { ...f, email: f.email || undefined, phone: f.phone || undefined, utm }); setDone(true); } catch (x) { setErr((x as ApiError).message); } };
  const wrap = { maxWidth: 1000, margin: "0 auto", padding: "0 18px" } as const; const sec = { padding: "48px 0" } as const;
  const inp = { width: "100%", border: "1px solid #D7DEE3", borderRadius: 10, padding: "12px", font: "inherit", boxSizing: "border-box" } as const;
  const form = (title?: string) => <div id="form" style={{ background: "#fff", borderRadius: 18, padding: 22, boxShadow: "0 8px 30px rgba(0,0,0,.08)", color: "#1B2730" }}>
    {title && <h3 style={{ margin: "0 0 12px" }}>{title}</h3>}
    {done ? <div style={{ textAlign: "center", padding: 20 }}>✅ <b>{t.ok}</b></div> : <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input style={inp} placeholder={t.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /><input style={inp} placeholder={t.phone} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <input style={inp} placeholder={t.email} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><textarea style={{ ...inp, minHeight: 70 }} placeholder={t.msg} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      <label style={{ display: "flex", gap: 8, fontSize: 13, color: "#5B6B76" }}><input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />{t.consent}</label>
      {err && <div style={{ color: "#B91C1C", fontSize: 13 }}>{err}</div>}<button style={{ border: 0, borderRadius: 12, padding: 14, color: "#fff", fontWeight: 700, fontSize: 16, background: c1, cursor: "pointer" }}>{t.send}</button></form>}</div>;
  return <div style={{ fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: "#1B2730", background: "#F7F9FA" }} dir={L === "ar" ? "rtl" : "ltr"}>
    <div style={{ background: "#fff", borderBottom: "1px solid #E3E8EC" }}><div style={{ ...wrap, display: "flex", alignItems: "center", gap: 10, height: 60 }}>{p.clinic.logo ? <img src={p.clinic.logo} alt="" style={{ height: 34 }} /> : <b>🦷</b>}<b>{p.clinic.name}</b><span style={{ flex: 1 }} />{p.clinic.phone && <a href={`tel:${p.clinic.phone}`} style={{ color: c1, fontWeight: 600 }}>{p.clinic.phone}</a>}</div></div>
    {(p.blocks as any[]).map((b, i) => { const pr = b.props ?? {};
      if (b.type === "hero") return <div key={i} style={{ background: `linear-gradient(135deg, ${c1}, color-mix(in srgb, ${c1} 60%, #000))`, color: "#fff" }}><div style={{ ...wrap, ...sec, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 30, alignItems: "center" }}>
        <div><h1 style={{ fontSize: "clamp(28px,4vw,44px)", margin: 0, lineHeight: 1.15, color: "#fff" }}>{pk(pr.title, L) || p.title}</h1><p style={{ fontSize: 18, opacity: 0.92, marginTop: 14 }}>{pk(pr.subtitle, L)}</p>
          {pr.cta && <a href="#form" style={{ display: "inline-block", marginTop: 14, background: "#fff", color: c1, padding: "12px 20px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>{pk(pr.cta, L)} →</a>}</div>{form()}</div></div>;
      if (b.type === "benefits") return <div key={i} style={{ ...wrap, ...sec }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>{((pr.items as any[]) ?? []).map((it, k) => <div key={k} style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #E3E8EC", fontWeight: 600 }}>✓ {pk(it, L)}</div>)}</div></div>;
      if (b.type === "prices" && p.prices.length) return <div key={i} style={{ ...wrap, ...sec }}><h2>{pk(pr.title, L) || t.prices}</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>{(p.prices as any[]).map((x, k) => <div key={k} style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #E3E8EC" }}><div style={{ fontWeight: 600 }}>{x.name}</div><div style={{ color: c1, fontSize: 22, fontWeight: 800, marginTop: 6 }}>{money(x.from)} <span style={{ fontSize: 13, color: "#7A8A95", fontWeight: 500 }}>{t.from}</span></div></div>)}</div></div>;
      if (b.type === "testimonials" && content("testimonial").length) return <div key={i} style={{ ...wrap, ...sec }}><h2>{t.reviews}</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>{content("testimonial").map((x, k) => <div key={k} style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #E3E8EC" }}>⭐⭐⭐⭐⭐<p style={{ margin: "8px 0" }}>“{pk(x.data.text ?? x.data.quote, L)}”</p><b style={{ fontSize: 13 }}>{x.data.name} {x.data.country ?? ""}</b></div>)}</div></div>;
      if (b.type === "gallery" && content("gallery").length) return <div key={i} style={{ ...wrap, ...sec }}><h2>{t.results}</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>{content("gallery").filter((x) => x.image).map((x, k) => <img key={k} src={x.image} alt={pk(x.data.caption, L)} style={{ width: "100%", borderRadius: 12, aspectRatio: "4/3", objectFit: "cover" }} />)}</div></div>;
      if (b.type === "team" && content("team").length) return <div key={i} style={{ ...wrap, ...sec }}><h2>{t.team}</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>{content("team").map((x, k) => <div key={k} style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #E3E8EC", textAlign: "center" }}>{x.image && <img src={x.image} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover" }} />}<div style={{ fontWeight: 700, marginTop: 8 }}>{pk(x.data.name, L)}</div><div style={{ fontSize: 13, color: "#7A8A95" }}>{pk(x.data.title, L)}</div></div>)}</div></div>;
      if (b.type === "faq") { const items = [...((pr.items as any[]) ?? []), ...content("faq").map((x) => x.data)]; if (!items.length) return null;
        return <div key={i} style={{ ...wrap, ...sec }}><h2>{t.faq}</h2>{items.map((x, k) => <details key={k} style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #E3E8EC", marginBottom: 8 }}><summary style={{ fontWeight: 600, cursor: "pointer" }}>{pk(x.q, L)}</summary><p style={{ marginBottom: 0 }}>{pk(x.a, L)}</p></details>)}</div>; }
      if (b.type === "text") return <div key={i} style={{ ...wrap, ...sec, whiteSpace: "pre-wrap", fontSize: 16, lineHeight: 1.7 }}>{pr.title && <h2>{pk(pr.title, L)}</h2>}{pk(pr.body, L)}</div>;
      if (b.type === "cta") return <div key={i} style={{ background: c1, color: "#fff", textAlign: "center" }}><div style={{ ...wrap, ...sec }}><h2 style={{ color: "#fff", margin: 0 }}>{pk(pr.title, L)}</h2><a href="#form" style={{ display: "inline-block", marginTop: 14, background: "#fff", color: c1, padding: "12px 20px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>{pk(pr.cta, L) || t.send}</a></div></div>;
      if (b.type === "form" && !(p.blocks as any[]).some((x) => x.type === "hero")) return <div key={i} style={{ ...wrap, ...sec, maxWidth: 520 }}>{form(pk(pr.title, L))}</div>;
      if (b.type === "form") return <div key={i} style={{ ...wrap, ...sec, maxWidth: 520 }}>{form(pk(pr.title, L))}</div>;
      return null; })}
    <div style={{ textAlign: "center", padding: 24, fontSize: 13, color: "#7A8A95" }}>{[p.clinic.name, p.clinic.city, p.clinic.email, p.clinic.website].filter(Boolean).join(" · ")}</div>
  </div>;
}
