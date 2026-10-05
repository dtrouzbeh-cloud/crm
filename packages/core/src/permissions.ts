// Rol ve izin modeli — API ve web aynı tanımı kullanır.
// İzin değerleri: boolean | kapsam ("own" | "team" | "all") | sayı (limit) | alan görünürlüğü ("show" | "mask" | "hide")

export const ROLES = ["admin", "manager", "sales", "dentist", "coordinator", "reception", "translator", "accounting"] as const;
export type Role = (typeof ROLES)[number];

export type Scope = "own" | "team" | "all" | false;
export type FieldVis = "show" | "mask" | "hide";

export interface Permissions {
  "lead.read": Scope; "lead.write": boolean; "lead.delete": boolean; "lead.assign": boolean; "lead.import": boolean; "lead.export": boolean;
  "inbox.use": Scope;
  "case.read": Scope; "case.write": boolean; "case.diagnose": boolean;
  "quote.price": boolean; "quote.send": boolean; "quote.approve": boolean; "discount.max": number;
  "deal.read": Scope; "deal.write": boolean; "payment.record": boolean; "payment.refund": boolean;
  "trip.manage": boolean; "appointment.read": Scope; "appointment.manage": boolean; "reception.use": boolean;
  "task.manage": boolean;
  "catalog.manage": boolean; "settings.manage": boolean; "team.manage": boolean; "integrations.manage": boolean; "billing.manage": boolean;
  "reports.view": Scope; "audit.view": boolean; "finance.view": boolean; "finance.manage": boolean;
  "field.price": FieldVis; "field.phone": FieldVis; "field.email": FieldVis; "field.passport": FieldVis; "field.medical": FieldVis;
}
export type PermKey = keyof Permissions;

const NONE: Permissions = {
  "lead.read": false, "lead.write": false, "lead.delete": false, "lead.assign": false, "lead.import": false, "lead.export": false,
  "inbox.use": false,
  "case.read": false, "case.write": false, "case.diagnose": false,
  "quote.price": false, "quote.send": false, "quote.approve": false, "discount.max": 0,
  "deal.read": false, "deal.write": false, "payment.record": false, "payment.refund": false,
  "trip.manage": false, "appointment.read": false, "appointment.manage": false, "reception.use": false,
  "task.manage": true,
  "catalog.manage": false, "settings.manage": false, "team.manage": false, "integrations.manage": false, "billing.manage": false,
  "reports.view": false, "audit.view": false, "finance.view": false, "finance.manage": false,
  "field.price": "hide", "field.phone": "mask", "field.email": "mask", "field.passport": "hide", "field.medical": "hide",
};

export const SCOPE_KEYS: PermKey[] = ["lead.read", "inbox.use", "case.read", "deal.read", "appointment.read", "reports.view"];
const ALL: Permissions = Object.fromEntries(Object.entries(NONE).map(([k, v]) => [k,
  SCOPE_KEYS.includes(k as PermKey) ? "all" : k.startsWith("field.") ? "show" : typeof v === "number" ? 100 : true])) as unknown as Permissions;

export const ROLE_DEFAULTS: Record<Role, Permissions> = {
  admin: { ...ALL },
  manager: { ...ALL, "settings.manage": false, "team.manage": false, "billing.manage": false, "integrations.manage": false, "discount.max": 15, "payment.refund": false, "finance.manage": false },
  sales: { ...NONE, "lead.read": "own", "lead.write": true, "inbox.use": "own", "case.read": "own", "case.write": true,
    "quote.price": true, "quote.send": true, "discount.max": 5, "deal.read": "own", "deal.write": true, "payment.record": true,
    "appointment.read": "all", "reports.view": "own", "field.price": "show", "field.phone": "show", "field.email": "show", "field.passport": "mask", "field.medical": "show" },
  dentist: { ...NONE, "case.read": "all", "case.write": true, "case.diagnose": true, "appointment.read": "own", "field.medical": "show", "field.phone": "mask" },
  coordinator: { ...NONE, "lead.read": "team", "inbox.use": "all", "case.read": "all", "deal.read": "all", "trip.manage": true, "appointment.read": "all", "appointment.manage": true,
    "field.phone": "show", "field.email": "show", "field.passport": "show", "field.medical": "mask" },
  reception: { ...NONE, "appointment.read": "all", "appointment.manage": true, "reception.use": true, "payment.record": true, "deal.read": "all",
    "field.phone": "show", "field.passport": "show", "field.price": "show" },
  translator: { ...NONE, "case.read": "own", "appointment.read": "own", "field.medical": "show" },
  accounting: { ...NONE, "finance.view": true, "finance.manage": true, "deal.read": "all", "payment.record": true, "payment.refund": true, "reports.view": "all", "field.price": "show", "field.phone": "mask" },
};

/** Rol varsayılanı + klinik rol özelleştirmesi + kullanıcı istisnası → etkin izinler */
export function effectivePermissions(role: Role, clinicRole?: Partial<Permissions> | null, overrides?: Partial<Permissions> | null): Permissions {
  return { ...(ROLE_DEFAULTS[role] ?? NONE), ...(clinicRole ?? {}), ...(overrides ?? {}) };
}

export function maskValue(v: string | null | undefined, vis: FieldVis): string | null {
  if (v == null || v === "") return v ?? null;
  if (vis === "show") return v;
  if (vis === "hide") return null;
  if (v.includes("@")) { const [u, d] = v.split("@"); return `${u!.slice(0, 2)}•••@${d}`; }
  return v.length > 6 ? `${v.slice(0, 4)}•••${v.slice(-2)}` : "•••";
}

export const ROLE_LABELS: Record<Role, Record<string, string>> = {
  admin: { tr: "Klinik yöneticisi", en: "Clinic admin" }, manager: { tr: "Satış müdürü", en: "Sales manager" },
  sales: { tr: "Satış temsilcisi", en: "Sales rep" }, dentist: { tr: "Diş hekimi", en: "Dentist" },
  coordinator: { tr: "Hasta koordinatörü", en: "Patient coordinator" }, reception: { tr: "Resepsiyon", en: "Reception" },
  translator: { tr: "Tercüman", en: "Translator" }, accounting: { tr: "Muhasebe", en: "Accounting" },
};
