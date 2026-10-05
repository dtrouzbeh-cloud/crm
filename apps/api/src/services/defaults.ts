// Yeni klinik varsayılanları
export function defaultClinicSettings() {
  return {
    quote: { depositBps: 1000, validDays: 14, rounding: 10, gapMinMonths: 3, gapMaxMonths: 6, hotelNightEur: 65, transferEur: 60, requireApprovalAll: false },
    discountLimits: { admin: 100, manager: 15, sales: 5, coordinator: 5, reception: 0, dentist: 0, translator: 0, accounting: 0 },
    lossReasons: ["ghosted", "after_photos", "after_offer", "price", "other_clinic", "health", "timing", "other"],
    channels: ["whatsapp", "call", "email", "sms", "telegram"],
    leadSources: ["meta", "google", "tiktok", "instagram", "website", "referral", "walkin", "whatsapp", "agency", "manual"],
    responseSlaMinutes: 15,
    assignment: { mode: "round_robin", byLanguage: true },
    caseRequired: { photos: true, xray: false, medical: true, issue: true },
    patientPage: { showMedical: false, otp: false, theme: "clean", sections: ["team", "gallery", "faq", "certificates"] },
    fxRates: { EUR: 1, USD: 1.08, GBP: 0.85, TRY: 38, AED: 3.97, SAR: 4.05 },
  };
}

type Rule = { name: string; trigger: Record<string, unknown>; actions: Record<string, unknown>[] };
export function defaultWorkflowRules(): Rule[] {
  const task = (title: string, dueHours: number, priority: string, type: string, assign = "owner") => ({ type: "task", title, dueHours, priority, taskType: type, assign });
  return [
    { name: "Yeni lead — 1 saat içinde ara", trigger: { event: "lead.created" }, actions: [task("{name} ile 1 saat içinde iletişime geç", 1, "high", "call")] },
    { name: "İlgileniyor — 2 saat içinde ara", trigger: { event: "lead.stage", stage: "interested" }, actions: [task("{name} kişisini 2 saat içinde ara", 2, "high", "call")] },
    { name: "Teşhis takibi", trigger: { event: "case.created" }, actions: [task("{name} için teşhisi takip et", 24, "med", "follow_up")] },
    { name: "Plan hazır — teklifi gönder", trigger: { event: "case.diagnosed" }, actions: [task("{name} için teklifi hazırla ve gönder", 0, "high", "follow_up")] },
    { name: "Teklif takibi (48 saat)", trigger: { event: "quote.sent" }, actions: [task("{name}: teklif takibi", 48, "med", "follow_up")] },
    { name: "Teklif görüntülendi — hemen ara", trigger: { event: "quote.viewed" }, actions: [task("{name} teklifi açtı — şimdi ara", 0, "high", "call")] },
    { name: "Kabul — seyahati teyit et", trigger: { event: "quote.accepted" }, actions: [task("{name} ile seyahat detaylarını teyit et", 24, "med", "general")] },
  ];
}
