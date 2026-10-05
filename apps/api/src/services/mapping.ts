// Dış kaynak verisini lead alanlarına eşleme: açık eşleme (fieldMap) + otomatik tanıma
const get = (o: any, path: string) => path.split(".").reduce((a, k) => (a == null ? a : Array.isArray(a) && /^\d+$/.test(k) ? a[+k] : a[k]), o);
const ALIASES: Record<string, string[]> = {
  fullName: ["full_name", "fullname", "name", "Full Name", "full name", "ad_soyad", "adsoyad", "isim", "contact_name"],
  firstName: ["first_name", "firstname", "First Name", "given_name", "ad"], lastName: ["last_name", "lastname", "Last Name", "family_name", "soyad"],
  phone: ["phone", "phone_number", "Phone Number", "mobile", "telefon", "tel", "whatsapp", "phoneNumber"], email: ["email", "e-mail", "Email", "mail", "eposta", "e_posta"],
  country: ["country", "Country", "ulke", "country_code"], city: ["city", "City", "sehir"], language: ["language", "lang", "dil"],
  interest: ["treatment", "interest", "service", "tedavi", "which_treatment_are_you_interested_in", "procedure"], issue: ["message", "notes", "comment", "mesaj", "aciklama", "description"],
  campaign: ["campaign", "campaign_name", "utm_campaign"], budget: ["budget", "butce"], travelWindow: ["travel_date", "when", "seyahat"],
};
export function mapToLead(payload: Record<string, any>, fieldMap: Record<string, string> = {}) {
  const flat: Record<string, any> = { ...payload };
  // Meta/Google tarzı [{name, values}] veya [{column_id, string_value}] dizilerini düzleştir
  for (const arr of [payload.field_data, payload.user_column_data, payload.answers, payload.fields]) if (Array.isArray(arr))
    for (const f of arr) { const k = f.name ?? f.column_id ?? f.key ?? f.question; const v = f.values?.[0] ?? f.string_value ?? f.value ?? f.answer; if (k) flat[String(k)] = v; }
  const out: Record<string, any> = {};
  for (const [field, path] of Object.entries(fieldMap)) { const v = get(payload, path) ?? flat[path]; if (v != null && v !== "") out[field] = v; }
  const lower = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k.toLowerCase(), v]));
  for (const [field, al] of Object.entries(ALIASES)) if (out[field] == null) for (const a of al) { const v = flat[a] ?? lower[a.toLowerCase()]; if (v != null && v !== "") { out[field] = v; break; } }
  if (!out.fullName && (out.firstName || out.lastName)) out.fullName = [out.firstName, out.lastName].filter(Boolean).join(" ");
  delete out.firstName; delete out.lastName;
  for (const k of Object.keys(out)) out[k] = String(out[k]).trim();
  if (out.country && out.country.length > 2) out.country = undefined;
  return out as { fullName?: string; phone?: string; email?: string; country?: string; city?: string; language?: string; interest?: string; issue?: string; campaign?: string; budget?: string; travelWindow?: string };
}
