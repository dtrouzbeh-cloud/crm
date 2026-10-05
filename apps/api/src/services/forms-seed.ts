// Varsayılan form şablonları (EN + TR). Klinik düzenleyebilir; yeni dil için kopyalayıp çevirebilir.
import type { Tx } from "../db.ts";

type F = { key: string; type: string; label: string; options?: string[]; required?: boolean; flag?: string; map?: string };
type T = { key: string; kind: "consent" | "intake" | "survey"; name: string; title: string; body: string; fields: F[]; sig: boolean };

const yn = (key: string, label: string, flag?: string): F => ({ key, type: "yesno", label, required: true, ...(flag ? { flag } : {}) });

const EN: T[] = [
  { key: "intake", kind: "intake", name: "Medical questionnaire", title: "Medical history questionnaire", sig: true,
    body: "Please answer honestly. Your answers are confidential and help your dentist plan a **safe** treatment. If anything is unclear, ask your coordinator.",
    fields: [
      { key: "h1", type: "heading", label: "General health" },
      { key: "age", type: "number", label: "Age", required: true, map: "age" },
      yn("diabetes", "Do you have diabetes?", "diabetes"), yn("heart", "Do you have a heart condition, pacemaker or high blood pressure?", "heart"),
      yn("anticoag", "Do you take blood thinners (e.g. aspirin, warfarin, Eliquis)?", "anticoag"),
      yn("bisph", "Have you ever taken bisphosphonates (osteoporosis medication) or had bone-related injections?", "bisph"),
      yn("chemo", "Have you had chemotherapy or radiotherapy to the head/neck?", "chemo"),
      yn("pregnant", "Are you pregnant or breastfeeding?", "pregnant"), yn("smoker", "Do you smoke or vape?", "smoker"),
      { key: "h2", type: "heading", label: "Medications & allergies" },
      { key: "medications", type: "textarea", label: "Medications you take regularly", map: "medications" },
      { key: "allergies", type: "textarea", label: "Allergies (medicine, latex, anaesthetic…)", map: "allergies" },
      { key: "other", type: "textarea", label: "Anything else your dentist should know?", map: "notes" },
      { key: "truth", type: "checkbox", label: "I confirm the information above is complete and correct.", required: true },
    ] },
  { key: "general_consent", kind: "consent", name: "General treatment consent", title: "Consent to dental treatment", sig: true,
    body: "I agree to the dental treatment plan explained to me by the clinic, including examinations, X-rays and local anaesthesia where required.\n\nI understand that **the treatment plan may change** after clinical examination and imaging, and that any change will be explained and priced before it is carried out.\n\nI understand that every treatment carries risks such as pain, swelling, bruising, infection, sensitivity or the need for further treatment, and that results depend partly on my own oral hygiene and attendance at follow-up visits.\n\nI have had the opportunity to ask questions and all my questions have been answered.",
    fields: [{ key: "read", type: "checkbox", label: "I have read and understood this consent form.", required: true }] },
  { key: "implant_consent", kind: "consent", name: "Implant & surgery consent", title: "Consent for dental implant surgery", sig: true,
    body: "Dental implant treatment involves placing a titanium fixture into the jaw bone, which may also require **bone grafting or a sinus lift**.\n\nPossible risks include: pain, swelling and bruising; infection; bleeding; temporary or permanent numbness of the lip, chin or tongue; sinus complications; failure of the implant to integrate with the bone; and the need for additional surgery.\n\nSmoking, diabetes and certain medications increase the risk of complications. I have disclosed my full medical history.\n\nI understand that a healing period of usually **3–6 months** is needed before the final teeth are fitted, and that I must follow the post-operative instructions.",
    fields: [
      { key: "read", type: "checkbox", label: "I have read and understood the risks described above.", required: true },
      { key: "sedation", type: "yesno", label: "I would like sedation (if offered)" },
    ] },
  { key: "privacy", kind: "consent", name: "Privacy & data consent (GDPR/KVKK)", title: "Consent to the processing of personal and health data", sig: false,
    body: "The clinic processes your personal data and health data (medical history, photos, X-rays) **only to plan and provide your treatment**, to organise your travel and to meet legal obligations.\n\nYour data may be shared with your treating dentists, laboratories and, where you request it, travel partners (hotel, transfer). It is stored securely and kept for the period required by law.\n\nYou may request access, correction or deletion of your data at any time by contacting the clinic.",
    fields: [
      { key: "data", type: "checkbox", label: "I consent to the processing of my personal and health data as described.", required: true },
      { key: "photos", type: "yesno", label: "I agree that anonymised before/after photos may be used for education and marketing." },
      { key: "marketing", type: "yesno", label: "I would like to receive news and offers from the clinic." },
    ] },
  { key: "nps", kind: "survey", name: "Satisfaction survey", title: "How was your experience?", sig: false,
    body: "Thank you for choosing us. It takes less than a minute and helps us improve.",
    fields: [
      { key: "nps", type: "nps", label: "How likely are you to recommend us to a friend? (0–10)", required: true },
      { key: "r_treat", type: "rating", label: "Treatment & results" }, { key: "r_coord", type: "rating", label: "Coordinator & communication" },
      { key: "r_travel", type: "rating", label: "Hotel & transfer" }, { key: "comment", type: "textarea", label: "Anything you would like to tell us?" },
    ] },
];

const TR: T[] = [
  { key: "intake", kind: "intake", name: "Tıbbi anamnez formu", title: "Tıbbi geçmiş formu", sig: true,
    body: "Lütfen dürüstçe yanıtlayın. Yanıtlarınız gizlidir ve hekiminizin **güvenli** bir tedavi planlamasına yardımcı olur.",
    fields: [
      { key: "h1", type: "heading", label: "Genel sağlık" },
      { key: "age", type: "number", label: "Yaş", required: true, map: "age" },
      yn("diabetes", "Diyabetiniz var mı?", "diabetes"), yn("heart", "Kalp rahatsızlığı, kalp pili veya yüksek tansiyonunuz var mı?", "heart"),
      yn("anticoag", "Kan sulandırıcı kullanıyor musunuz (aspirin, coumadin, Eliquis vb.)?", "anticoag"),
      yn("bisph", "Hiç bifosfonat (kemik erimesi ilacı) kullandınız mı veya kemik iğnesi oldunuz mu?", "bisph"),
      yn("chemo", "Baş/boyun bölgesine kemoterapi veya radyoterapi aldınız mı?", "chemo"),
      yn("pregnant", "Hamile misiniz veya emziriyor musunuz?", "pregnant"), yn("smoker", "Sigara veya elektronik sigara kullanıyor musunuz?", "smoker"),
      { key: "h2", type: "heading", label: "İlaçlar ve alerjiler" },
      { key: "medications", type: "textarea", label: "Düzenli kullandığınız ilaçlar", map: "medications" },
      { key: "allergies", type: "textarea", label: "Alerjiler (ilaç, lateks, anestezi…)", map: "allergies" },
      { key: "other", type: "textarea", label: "Hekiminizin bilmesi gereken başka bir durum var mı?", map: "notes" },
      { key: "truth", type: "checkbox", label: "Yukarıdaki bilgilerin eksiksiz ve doğru olduğunu onaylıyorum.", required: true },
    ] },
  { key: "general_consent", kind: "consent", name: "Genel tedavi onamı", title: "Diş tedavisi aydınlatılmış onam formu", sig: true,
    body: "Klinik tarafından bana açıklanan tedavi planını; muayene, röntgen ve gerektiğinde lokal anestezi dahil olmak üzere kabul ediyorum.\n\nKlinik muayene ve görüntüleme sonrasında **tedavi planının değişebileceğini**, her değişikliğin uygulanmadan önce açıklanıp fiyatlandırılacağını anlıyorum.\n\nHer tedavinin ağrı, şişlik, morarma, enfeksiyon, hassasiyet veya ek tedavi ihtiyacı gibi riskler taşıdığını; sonucun kısmen ağız hijyenime ve kontrollere gelmeme bağlı olduğunu anlıyorum.\n\nSoru sorma fırsatım oldu ve tüm sorularım yanıtlandı.",
    fields: [{ key: "read", type: "checkbox", label: "Bu onam formunu okudum ve anladım.", required: true }] },
  { key: "implant_consent", kind: "consent", name: "İmplant ve cerrahi onamı", title: "İmplant cerrahisi aydınlatılmış onam formu", sig: true,
    body: "İmplant tedavisi çene kemiğine titanyum bir vida yerleştirilmesini içerir; **kemik grefti veya sinüs lifting** gerekebilir.\n\nOlası riskler: ağrı, şişlik, morarma; enfeksiyon; kanama; dudak, çene veya dilde geçici ya da kalıcı uyuşma; sinüs komplikasyonları; implantın kemikle kaynaşmaması ve ek cerrahi ihtiyacı.\n\nSigara, diyabet ve bazı ilaçlar komplikasyon riskini artırır. Tıbbi geçmişimi eksiksiz bildirdim.\n\nKalıcı dişler takılmadan önce genellikle **3–6 aylık** bir iyileşme süresi gerektiğini ve ameliyat sonrası talimatlara uymam gerektiğini anlıyorum.",
    fields: [
      { key: "read", type: "checkbox", label: "Yukarıda açıklanan riskleri okudum ve anladım.", required: true },
      { key: "sedation", type: "yesno", label: "Sedasyon istiyorum (sunuluyorsa)" },
    ] },
  { key: "privacy", kind: "consent", name: "KVKK / GDPR açık rıza", title: "Kişisel ve sağlık verilerinin işlenmesine açık rıza", sig: false,
    body: "Klinik, kişisel verilerinizi ve sağlık verilerinizi (tıbbi geçmiş, fotoğraf, röntgen) **yalnızca tedavinizi planlamak ve uygulamak**, seyahatinizi organize etmek ve yasal yükümlülükleri yerine getirmek amacıyla işler.\n\nVerileriniz tedavi eden hekimler, laboratuvarlar ve talep etmeniz halinde seyahat iş ortakları (otel, transfer) ile paylaşılabilir; güvenli şekilde saklanır ve yasal süre boyunca tutulur.\n\nDilediğiniz zaman verilerinize erişim, düzeltme veya silme talebinde bulunabilirsiniz.",
    fields: [
      { key: "data", type: "checkbox", label: "Kişisel ve sağlık verilerimin açıklandığı şekilde işlenmesine rıza veriyorum.", required: true },
      { key: "photos", type: "yesno", label: "Anonimleştirilmiş önce/sonra fotoğraflarımın eğitim ve tanıtım amacıyla kullanılmasını kabul ediyorum." },
      { key: "marketing", type: "yesno", label: "Klinikten haber ve kampanya almak istiyorum." },
    ] },
  { key: "nps", kind: "survey", name: "Memnuniyet anketi", title: "Deneyiminiz nasıldı?", sig: false,
    body: "Bizi tercih ettiğiniz için teşekkürler. Bir dakikadan kısa sürer ve gelişmemize yardımcı olur.",
    fields: [
      { key: "nps", type: "nps", label: "Bizi bir arkadaşınıza tavsiye etme olasılığınız nedir? (0–10)", required: true },
      { key: "r_treat", type: "rating", label: "Tedavi ve sonuç" }, { key: "r_coord", type: "rating", label: "Koordinatör ve iletişim" },
      { key: "r_travel", type: "rating", label: "Otel ve transfer" }, { key: "comment", type: "textarea", label: "Bize iletmek istediğiniz bir şey var mı?" },
    ] },
];

export const FORM_DEFAULTS: Record<string, T[]> = { en: EN, tr: TR };

export async function seedClinicForms(tx: Tx, clinicId: string, lang: string): Promise<number> {
  const langs = [...new Set([FORM_DEFAULTS[lang] ? lang : "en", "en"])];
  let n = 0;
  for (const l of langs) for (const t of FORM_DEFAULTS[l]!) {
    const [ex] = await tx`select 1 from form_templates where clinic_id = ${clinicId} and key = ${t.key} and lang = ${l}`;
    if (ex) continue;
    await tx`insert into form_templates (clinic_id, kind, key, name, lang, title, body, fields, require_signature)
      values (${clinicId}, ${t.kind}, ${t.key}, ${t.name}, ${l}, ${t.title}, ${t.body}, ${tx.json(t.fields as never)}, ${t.sig})`;
    n++;
  }
  return n;
}
