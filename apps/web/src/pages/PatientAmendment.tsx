// Hasta plan revizyonu onay sayfası (/a/:token)
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, ApiError } from "../lib/api.ts";
import { Spinner } from "../components/ui.tsx";
import { fmtMoney } from "@dentaflow/core/i18n";

const P: Record<string, Record<string, string>> = {
  en: { title: "Treatment plan update", why: "Why the plan changed", added: "Added", removed: "Removed", before: "Previous total", change: "Change", after: "New total", agree: "I have read the changes and agree to the updated plan and price.", name: "Full name", approve: "Approve changes", reject: "I don't agree", reject_msg: "Tell us why (optional)", approved: "Thank you — the changes are approved.", rejected: "Your answer has been sent. Your coordinator will contact you.", invalid: "This link is invalid or has expired.", teeth: "teeth", send: "Send" },
  tr: { title: "Tedavi planı güncellemesi", why: "Plan neden değişti", added: "Eklenen", removed: "Çıkarılan", before: "Önceki toplam", change: "Değişiklik", after: "Yeni toplam", agree: "Değişiklikleri okudum; güncel plan ve fiyatı kabul ediyorum.", name: "Ad soyad", approve: "Değişiklikleri onayla", reject: "Kabul etmiyorum", reject_msg: "Nedenini yazın (isteğe bağlı)", approved: "Teşekkürler — değişiklikler onaylandı.", rejected: "Yanıtınız iletildi. Koordinatörünüz sizinle iletişime geçecek.", invalid: "Bu bağlantı geçersiz veya süresi dolmuş.", teeth: "diş", send: "Gönder" },
  de: { title: "Aktualisierung des Behandlungsplans", why: "Warum sich der Plan geändert hat", added: "Hinzugefügt", removed: "Entfernt", before: "Bisherige Summe", change: "Änderung", after: "Neue Summe", agree: "Ich habe die Änderungen gelesen und stimme dem aktualisierten Plan und Preis zu.", name: "Vollständiger Name", approve: "Änderungen bestätigen", reject: "Ich stimme nicht zu", reject_msg: "Grund (optional)", approved: "Danke — die Änderungen sind bestätigt.", rejected: "Ihre Antwort wurde gesendet. Ihr Koordinator meldet sich.", invalid: "Dieser Link ist ungültig oder abgelaufen.", teeth: "Zähne", send: "Senden" },
  ar: { title: "تحديث خطة العلاج", why: "سبب تغيير الخطة", added: "مُضاف", removed: "مُزال", before: "الإجمالي السابق", change: "التغيير", after: "الإجمالي الجديد", agree: "قرأت التغييرات وأوافق على الخطة والسعر المحدثين.", name: "الاسم الكامل", approve: "الموافقة على التغييرات", reject: "لا أوافق", reject_msg: "السبب (اختياري)", approved: "شكراً — تمت الموافقة على التغييرات.", rejected: "تم إرسال ردك. سيتواصل معك المنسق.", invalid: "هذا الرابط غير صالح أو منتهي.", teeth: "أسنان", send: "إرسال" },
};

export default function PatientAmendment() {
  const { token } = useParams<{ token: string }>(); const qc = useQueryClient();
  const { data: a, error } = useQuery({ queryKey: ["pa", token], queryFn: () => get(`/api/public/a/${token}`), retry: false });
  const [name, setName] = useState(""); const [agree, setAgree] = useState(false); const [rej, setRej] = useState(false); const [msg, setMsg] = useState(""); const [err, setErr] = useState<string | null>(null);
  const L = a && P[a.lang] ? a.lang : "en", T = P[L]!;
  useEffect(() => { if (a) { setName((n) => n || a.patient); document.title = `${a.clinic.name} — ${T.title}`; document.documentElement.dir = L === "ar" ? "rtl" : "ltr"; } }, [a]);
  if (error) return <div className="pp"><div className="hero"><div className="in"><h1 style={{ color: "#fff" }}>{T.invalid}</h1></div></div></div>;
  if (!a) return <Spinner />;
  const M = (v: number) => fmtMoney(Number(v) / 100, a.currency, L); const c1 = a.clinic.color || "#0E7C86";
  const respond = async (action: string) => { setErr(null); try { await post(`/api/public/a/${token}/respond`, { action, name, agree, message: msg || undefined }); qc.invalidateQueries({ queryKey: ["pa", token] }); } catch (e) { setErr((e as ApiError).message); } };
  const group = (k: string) => (a.lines as any[]).filter((l) => l.kind === k);
  return <div className="pp" style={{ ["--c1" as never]: c1 }} dir={L === "ar" ? "rtl" : "ltr"}>
    <div className="hero" style={{ paddingBottom: 64 }}><div className="in" style={{ maxWidth: 720 }}><div style={{ fontWeight: 750 }}>🦷 {a.clinic.name}</div><h1 style={{ fontSize: 26, marginTop: 20, color: "#fff" }}>{T.title} #{a.number}</h1><div style={{ opacity: 0.85 }}>{a.patient}</div></div></div>
    <div className="body" style={{ maxWidth: 720 }}>
      <div className="pc"><div style={{ fontSize: 12, textTransform: "uppercase", color: "#7A8A95", fontWeight: 700 }}>{T.why}</div><p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>{a.reason}</p></div>
      <div className="pc">{(["add", "remove"] as const).map((k) => group(k).length > 0 && <div key={k} style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: k === "add" ? "#15803D" : "#B91C1C", marginBottom: 6 }}>{k === "add" ? "＋ " + T.added : "－ " + T.removed}</div>
        {group(k).map((l, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #EEF2F4" }}><span style={{ flex: 1, textDecoration: k === "remove" ? "line-through" : undefined }}>{l.name}{l.teeth?.length ? <span style={{ color: "#7A8A95" }}> · {T.teeth} {l.teeth.join(", ")}</span> : null}</span><span style={{ color: "#7A8A95" }}>× {l.qty}</span><b>{M(l.totalMinor)}</b></div>)}</div>)}
        <div style={{ borderTop: "2px solid #1B2730", marginTop: 8, paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>{T.before}</span><span>{M(a.beforeMinor)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: Number(a.deltaMinor) > 0 ? "#B45309" : "#15803D" }}><span>{T.change}</span><b>{Number(a.deltaMinor) >= 0 ? "+" : ""}{M(a.deltaMinor)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, marginTop: 4 }}><span>{T.after}</span><span>{M(a.afterMinor)}</span></div></div></div>
      {a.status === "approved" ? <div className="pc" style={{ textAlign: "center" }}><div style={{ fontSize: 42 }}>✅</div><b>{T.approved}</b></div>
        : a.status === "rejected" ? <div className="pc" style={{ textAlign: "center" }}><b>{T.rejected}</b></div>
        : <div className="pc">
          <label style={{ display: "block", fontWeight: 600 }}>{T.name}<input className="inp" style={{ marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} /></label>
          {!rej ? <><label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14 }}><input type="checkbox" style={{ width: 20, height: 20, flex: "none" }} checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>{T.agree}</span></label>
            {err && <div className="alert err" style={{ marginTop: 10 }}>{err}</div>}
            <button className="btn pri" style={{ width: "100%", height: 48, marginTop: 14, fontSize: 16, background: c1, borderColor: c1 }} disabled={!agree || name.trim().length < 2} onClick={() => respond("approve")}>{T.approve}</button>
            <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setRej(true)}>{T.reject}</button></>
          : <><textarea className="inp" style={{ marginTop: 12 }} rows={3} placeholder={T.reject_msg} value={msg} onChange={(e) => setMsg(e.target.value)} />{err && <div className="alert err" style={{ marginTop: 10 }}>{err}</div>}
            <button className="btn" style={{ width: "100%", marginTop: 10 }} disabled={name.trim().length < 2} onClick={() => respond("reject")}>{T.send}</button></>}
        </div>}
    </div>
  </div>;
}
