// Giden istek koruması (SSRF): klinik tarafından girilen URL'ler iç ağa, localhost'a veya bulut meta veri servisine gidemez.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config.ts";

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function privateIp(ip: string) {
  if (isIP(ip) === 4) return privateV4(ip);
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return privateV4(x.slice(7));
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}
/** URL dışarıya açık bir adrese mi gidiyor? Değilse hata fırlatır. WEBHOOK_ALLOW_PRIVATE=1 yalnız test örneği içindir. */
export async function assertPublicUrl(raw: string) {
  let u: URL; try { u = new URL(raw); } catch { throw new Error("Geçersiz URL"); }
  if (u.protocol !== "https:" && (config.isProd || u.protocol !== "http:")) throw new Error("HTTPS gerekli");
  if (process.env.WEBHOOK_ALLOW_PRIVATE === "1") return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new Error("İç ağ adresine gönderim yapılamaz");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error("Alan adı çözümlenemedi"); });
  if (addrs.some((a) => privateIp(a.address))) throw new Error("İç ağ adresine gönderim yapılamaz");
}
