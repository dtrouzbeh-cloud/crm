// Telefon normalizasyonu (E.164). Mükerrer tespiti ve WhatsApp eşleştirmesi bu biçime dayanır.
export const DIAL: Record<string, string> = {
  TR: "90", GB: "44", IE: "353", DE: "49", NL: "31", BE: "32", FR: "33", CH: "41", AT: "43", IT: "39", ES: "34", PT: "351",
  SE: "46", NO: "47", DK: "45", FI: "358", PL: "48", CZ: "420", HU: "36", RO: "40", BG: "359", GR: "30", AL: "355", RS: "381",
  US: "1", CA: "1", AU: "61", NZ: "64", SA: "966", AE: "971", KW: "965", QA: "974", BH: "973", OM: "968", IL: "972",
  RU: "7", UA: "380", AZ: "994", GE: "995", KZ: "7", IR: "98", IQ: "964", EG: "20", MA: "212", DZ: "213", TN: "216", LY: "218", ZA: "27", NG: "234",
};
export function normalizePhone(raw: string | null | undefined, country?: string | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  const plus = s.startsWith("+");
  let d = s.replace(/\D/g, "");
  if (!d) return null;
  if (plus) return "+" + d;
  if (d.startsWith("00")) return "+" + d.slice(2);
  const cc = country ? DIAL[country.toUpperCase()] : undefined;
  if (cc) {
    if (d.startsWith(cc) && d.length > 10) return "+" + d;
    if (d.startsWith("0")) d = d.slice(1);
    return "+" + cc + d;
  }
  return d.length > 10 ? "+" + d : d;
}
export const waDigits = (e164: string | null | undefined) => (e164 ?? "").replace(/\D/g, "");
