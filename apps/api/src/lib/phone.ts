// E.164 telefon ön ekinden ülke ve (tek dilli ülkelerde) dil tahmini — kanal lead'lerinde ülke/dil boş kalmasın, dile göre temsilci ataması çalışsın
const DIAL: [string, string][] = [
  ["971", "AE"], ["966", "SA"], ["965", "KW"], ["974", "QA"], ["973", "BH"], ["968", "OM"], ["964", "IQ"], ["962", "JO"], ["961", "LB"], ["972", "IL"], ["994", "AZ"], ["995", "GE"],
  ["353", "IE"], ["351", "PT"], ["359", "BG"], ["380", "UA"], ["420", "CZ"], ["421", "SK"], ["370", "LT"], ["371", "LV"], ["372", "EE"], ["385", "HR"], ["386", "SI"], ["381", "RS"], ["352", "LU"], ["356", "MT"], ["357", "CY"], ["213", "DZ"], ["212", "MA"], ["216", "TN"], ["218", "LY"],
  ["44", "GB"], ["49", "DE"], ["31", "NL"], ["32", "BE"], ["33", "FR"], ["34", "ES"], ["39", "IT"], ["41", "CH"], ["43", "AT"], ["45", "DK"], ["46", "SE"], ["47", "NO"], ["48", "PL"], ["30", "GR"], ["36", "HU"], ["40", "RO"],
  ["90", "TR"], ["20", "EG"], ["61", "AU"], ["64", "NZ"], ["27", "ZA"], ["98", "IR"], ["1", "US"], ["7", "RU"],
];
const LANG: Record<string, string> = { DE: "de", AT: "de", GB: "en", IE: "en", US: "en", AU: "en", NZ: "en", NL: "nl", FR: "fr", IT: "it", ES: "es", PT: "pt", RU: "ru", PL: "pl", TR: "tr",
  AE: "ar", SA: "ar", KW: "ar", QA: "ar", BH: "ar", OM: "ar", IQ: "ar", JO: "ar", LB: "ar", EG: "ar", LY: "ar", SE: "sv", DK: "da", NO: "no", GR: "el", RO: "ro", HU: "hu", CZ: "cs", BG: "bg", UA: "uk" };

export function countryFromPhone(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/[^\d+]/g, ""); if (!d.startsWith("+") || d.length < 8) return null;
  const n = d.slice(1); for (const [code, cc] of DIAL) if (n.startsWith(code)) return cc; return null;
}
export const languageForCountry = (cc: string | null | undefined) => (cc ? LANG[cc] ?? null : null);
