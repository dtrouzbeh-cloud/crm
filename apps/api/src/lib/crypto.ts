// Bağımlılıksız kripto yardımcıları: şifre (scrypt), token, TOTP (RFC 6238), AES-256-GCM
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config.ts";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, s, k] = stored.split("$");
  if (alg !== "scrypt" || !s || !k) return false;
  const key = await scrypt(pw.normalize("NFKC"), Buffer.from(s, "base64url"), 32, { ...SCRYPT, N: Number(n) });
  const want = Buffer.from(k, "base64url");
  return want.length === key.length && timingSafeEqual(want, key);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ── AES-256-GCM (MFA sırları, entegrasyon anahtarları) ──
const encKey = createHash("sha256").update(config.encryptionKey).digest();
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", encKey, iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(data!), d.final()]).toString("utf8");
}

// ── TOTP ──
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32Encode(randomBytes(20));
export function totpCode(secret: string, step = Math.floor(Date.now() / 30000)): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const now = Math.floor(Date.now() / 30000), c = code.replace(/\s/g, "");
  for (let w = -window; w <= window; w++) if (totpCode(secret, now + w) === c) return true;
  return false;
}
export const totpUri = (secret: string, email: string, issuer = "DentaFlow") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
