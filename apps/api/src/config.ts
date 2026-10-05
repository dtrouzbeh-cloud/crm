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
