// Depolama sürücüsü: yerel disk (varsayılan). Arayüz S3 uyumlu sürücüye taşınabilir (bölge bağımsızlık).
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createHmac } from "node:crypto";
import { config } from "../config.ts";

const root = resolve(config.storageDir);
const safe = (key: string) => { const p = resolve(root, key); if (!p.startsWith(root)) throw new Error("bad key"); return p; };
export const storage = {
  async put(key: string, data: Buffer) { const p = safe(key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, data); },
  async get(key: string) { return readFile(safe(key)); },
  stream(key: string) { return createReadStream(safe(key)); },
  async size(key: string) { return (await stat(safe(key))).size; },
  async remove(key: string) { await unlink(safe(key)).catch(() => {}); },
};
/** Süreli imzalı dosya bağlantısı (hasta sayfası, PDF, e-posta) */
export function signFile(fileId: string, ttlSec = 3600) { const exp = Math.floor(Date.now() / 1000) + ttlSec; const sig = createHmac("sha256", config.sessionSecret).update(`${fileId}.${exp}`).digest("base64url"); return `/api/public/files/${fileId}?exp=${exp}&sig=${sig}`; }
export function verifyFileSig(fileId: string, exp: string, sig: string) { if (Number(exp) < Date.now() / 1000) return false; return createHmac("sha256", config.sessionSecret).update(`${fileId}.${exp}`).digest("base64url") === sig; }
export { join };
