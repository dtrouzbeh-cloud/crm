// Ortam yapılandırması (12-factor). Bölge bağımsız: tüm dış bağımlılıklar env ile verilir.
function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Eksik ortam değişkeni: ${name}`);
  return v;
}
export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4100),
  appUrl: req("APP_URL", "http://localhost:5173"),
  sessionSecret: req("SESSION_SECRET"),
  encryptionKey: req("ENCRYPTION_KEY"),
  databaseUrl: req("DATABASE_URL"),
  databaseOwnerUrl: req("DATABASE_OWNER_URL"),
  storageDir: process.env.STORAGE_DIR ?? "./storage",
  smtpUrl: process.env.SMTP_URL ?? "",
  mailFrom: process.env.MAIL_FROM ?? "DentaFlow <no-reply@example.com>",
  sessionDays: 30,
};
// Meta (WhatsApp Business Platform, Lead Ads, Messenger/IG) — platformun Meta uygulaması (Tech Provider)
export const meta = {
  appId: process.env.META_APP_ID ?? "",
  appSecret: process.env.META_APP_SECRET ?? "",
  verifyToken: process.env.META_VERIFY_TOKEN ?? "",
  configId: process.env.META_ES_CONFIG_ID ?? "",     // Embedded Signup yapılandırma kimliği
  // Graph API sürümü tek yerden: v21.0 21.01.2027'de kapanıyor; v26.0 (Temmuz 2026). Yükseltme: META_GRAPH_URL
  graph: process.env.META_GRAPH_URL ?? "https://graph.facebook.com/v26.0",
};
// Platform SaaS faturalandırması (kliniklerden abonelik tahsilatı)
export const billing = {
  stripeSecret: process.env.PLATFORM_STRIPE_SECRET ?? "",
  stripeWebhookSecret: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET ?? "",
};
