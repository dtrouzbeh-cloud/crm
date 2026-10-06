// Klinik plan motoru — API (doğrulama, teklif snapshot) ve web (canlı önizleme) aynı kodu çalıştırır.
import type { Treatment, Bundle, Material, Brand } from "./catalog.ts";

export const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const ALL_TEETH = [...UPPER, ...LOWER];
export const jawOf = (t: number) => (t < 30 ? "u" : "l");
export const quadOf = (t: number) => Math.floor(t / 10);
export const POSTERIOR_UP = [14, 15, 16, 17, 24, 25, 26, 27];
export const CROWN_GROUP = ["crown_zr", "crown_emax", "crown_pfm", "crown_por"];
export const BUNDLE_SWAP = [["smile_zr_u", "smile_emax_u"]];
const IMP_BASE = 450;

export const SITUATIONS = ["intact", "missing", "root", "rct", "crown", "caries", "comp", "amalg", "impab", "impcr", "bridge", "pontic", "impacted", "inlay", "veneer", "other"] as const;
export type SituationState = (typeof SITUATIONS)[number];
export const FINDINGS = ["sinusSark", "kemikAz"] as const;
export interface SitEntry { s?: SituationState; f?: Partial<Record<(typeof FINDINGS)[number], boolean>> }
export type Situation = Record<string, SitEntry>;

export interface PlanItem {
  id: string; v: number; tx?: string | null; b?: string | null; teeth?: number[]; jaws?: ("u" | "l")[]; qty?: number; brand?: string | null;
  manual?: boolean; name?: string; price?: number; auto?: boolean; note?: string;
}

export interface Catalog {
  tx: (id: string) => Treatment | undefined;
  bundle: (id: string) => Bundle | undefined;
  treatments: Treatment[];
  bundles: Bundle[];
  rules: Record<string, boolean>;
  fx: Record<string, number>;
  rounding: number;
  depositBps: number;
  hotelNightEur: number;
  transferEur: number;
  gapMinMonths: number;
  gapMaxMonths: number;
}
export function makeCatalog(treatments: Treatment[], bundles: Bundle[], opts: Partial<Omit<Catalog, "tx" | "bundle" | "treatments" | "bundles">> = {}): Catalog {
  const tm = new Map(treatments.map((t) => [t.id, t])), bm = new Map(bundles.map((b) => [b.id, b]));
  return { tx: (id) => tm.get(id), bundle: (id) => bm.get(id), treatments, bundles, rules: {}, fx: { EUR: 1 }, rounding: 10, depositBps: 1000, hotelNightEur: 65, transferEur: 60, gapMinMonths: 3, gapMaxMonths: 6, ...opts };
}

type Names = string[] | string;
export const tn = (arr: Names | null | undefined, lang: string, langs = ["tr", "en", "de", "ar"]) => {
  if (!arr) return ""; if (typeof arr === "string") return arr; const i = langs.indexOf(lang); return arr[i] || arr[1] || arr[0] || "";
};

export function brandOf(cat: Catalog, it: PlanItem): Brand | null {
  if (it.b) {
    const b = cat.bundle(it.b); if (!b || !it.brand) return null;
    if (b.brands) return b.brands.find((x) => x.id === it.brand) ?? null;
    if (b.imp.length) return (cat.tx("implant")?.brands ?? []).find((x) => x.id === it.brand) ?? null;
    return null;
  }
  const x = it.tx ? cat.tx(it.tx) : undefined;
  return x?.brands?.find((b) => b.id === it.brand) ?? null;
}
export function brandList(cat: Catalog, it: PlanItem): Brand[] | null {
  if (it.b) { const b = cat.bundle(it.b); if (!b) return null; if (b.brands) return b.brands; if (b.imp.length) return cat.tx("implant")?.brands ?? null; return null; }
  return (it.tx ? cat.tx(it.tx)?.brands : null) ?? null;
}
export function itemName(cat: Catalog, it: PlanItem, lang: string): string {
  if (it.b) return tn(cat.bundle(it.b)?.n, lang) || it.b;
  if (it.manual) return it.name ?? "";
  return tn(cat.tx(it.tx ?? "")?.n, lang) || (it.tx ?? "");
}

// ───────────── genişletme ve diş durumları ─────────────
export interface ToothEvent { t: number; txId: string; render: string; mat?: Material | null; form?: string | null; v: number; it: PlanItem; span?: string; viaBundle?: boolean }
export function expand(cat: Catalog, items: PlanItem[]) {
  const teeth: ToothEvent[] = [], arch: { jaw: "u" | "l"; txId: string; v: number; it: PlanItem }[] = [];
  for (const it of items ?? []) {
    if (it.b) {
      const b = cat.bundle(it.b); if (!b) continue;
      const br = brandOf(cat, it); const bf = (b.imp.length && !b.brands && br?.form) || "std";
      b.imp.forEach((t) => teeth.push({ t, txId: "implant", render: "implant", form: bf, v: it.v, it, viaBundle: true }));
      b.crown.forEach((t) => teeth.push({ t, txId: "bundle_crown", render: "crown", mat: b.mat, v: it.v, it, span: it.id, viaBundle: true }));
      if (b.arch) arch.push({ jaw: b.jaw, txId: b.arch, v: it.v, it });
      continue;
    }
    const x = it.tx ? cat.tx(it.tx) : undefined; if (!x) continue;
    if (x.unit === "arch") { (it.jaws ?? []).forEach((j) => arch.push({ jaw: j, txId: x.id, v: it.v, it })); continue; }
    if (x.unit === "tooth" || x.unit === "side") (it.teeth ?? []).forEach((t) => teeth.push({ t, txId: x.id, render: x.render, mat: x.mat ?? null, form: x.render === "implant" ? (brandOf(cat, it)?.form ?? "std") : null, v: it.v, it }));
  }
  return { teeth, arch };
}

export interface ToothState {
  gone?: boolean; cekim?: boolean; implant?: string; kron?: Material; span?: string; veneer?: Material; dolgu?: "comp" | "amalg" | "inlay" | "plan";
  kanal?: boolean; greft?: boolean; sinus?: boolean; sinusSark?: boolean; kemikAz?: boolean; caries?: boolean; rootOnly?: boolean; impacted?: boolean; other?: boolean; pv?: number;
}
export function sitRender(e?: SitEntry): ToothState {
  const s: ToothState = {}; if (!e) return s;
  switch (e.s) {
    case "missing": s.gone = true; break;
    case "root": s.rootOnly = true; break;
    case "rct": s.kanal = true; break;
    case "crown": case "bridge": s.kron = "old"; break;
    case "pontic": s.gone = true; s.kron = "old"; break;
    case "caries": s.caries = true; break;
    case "comp": s.dolgu = "comp"; break;
    case "amalg": s.dolgu = "amalg"; break;
    case "inlay": s.dolgu = "inlay"; break;
    case "impab": s.implant = "std"; s.gone = true; break;
    case "impcr": s.implant = "std"; s.gone = true; s.kron = "old"; break;
    case "impacted": s.impacted = true; break;
    case "veneer": s.veneer = "por"; break;
    case "other": s.other = true; break;
  }
  if (e.f?.sinusSark) s.sinusSark = true;
  if (e.f?.kemikAz) s.kemikAz = true;
  return s;
}
export function toothStates(cat: Catalog, situation: Situation, items: PlanItem[] | null, upto?: number): Record<number, ToothState> {
  const out: Record<number, ToothState> = {};
  ALL_TEETH.forEach((t) => (out[t] = sitRender(situation[t])));
  if (!items) return out;
  for (const e of expand(cat, items).teeth.filter((e) => !upto || e.v <= upto).sort((a, b) => a.v - b.v)) {
    const s = out[e.t]!;
    s.pv = s.pv ? Math.min(s.pv, e.v) : e.v;
    switch (e.render) {
      case "ext": s.cekim = true; s.gone = true; delete s.rootOnly; delete s.dolgu; delete s.kanal; delete s.caries; delete s.veneer; delete s.impacted;
        if (s.kron === "old") delete s.kron; if (e.txId === "implant_rem") delete s.implant; break;
      case "implant": s.implant = e.form ?? "std"; s.gone = true; delete s.rootOnly; delete s.impacted; if (s.kron === "old") delete s.kron; break;
      case "crown": s.kron = e.mat ?? "zr"; if (e.span) s.span = e.span; delete s.veneer; delete s.caries; break;
      case "veneer": s.veneer = e.mat ?? "por"; break;
      case "fill": s.dolgu = "plan"; delete s.caries; break;
      case "inlay": s.dolgu = "inlay"; delete s.caries; break;
      case "rct": s.kanal = true; break;
      case "graft": s.greft = true; break;
      case "sinus": s.sinus = true; break;
    }
  }
  return out;
}
export const crownKind = (s: ToothState) => (!s.kron ? null : s.implant ? "imp" : s.gone ? "pontic" : "nat");

export function implantsInJaw(cat: Catalog, situation: Situation, items: PlanItem[], jaw: "u" | "l", beforeV?: number) {
  let n = 0;
  for (const [t, e] of Object.entries(situation ?? {})) if (jawOf(+t) === jaw && (e.s === "impab" || e.s === "impcr")) n++;
  for (const e of expand(cat, items).teeth) if (e.render === "implant" && jawOf(e.t) === jaw && (beforeV == null || e.v < beforeV)) n++;
  return n;
}

export interface Span { teeth: number[]; label: string; v: number }
export function spansFor(cat: Catalog, situation: Situation, items: PlanItem[], lang: string, labels: { implants: (n: number) => string; jaw: (j: "u" | "l") => string }): Span[] {
  const sp: Span[] = [];
  for (const it of items ?? []) {
    if (it.b) {
      const b = cat.bundle(it.b); if (!b) continue;
      if (b.crown.length) { const ts = [...b.crown].sort((a, c) => ALL_TEETH.indexOf(a) - ALL_TEETH.indexOf(c));
        sp.push({ teeth: b.crown, v: it.v, label: `${tn(b.n, lang).replace(/\s*\(.*\)/, "")} ${ts[0]}–${ts[ts.length - 1]} · ${labels.implants(implantsInJaw(cat, situation, items, b.jaw))}` }); }
      if (b.arch) sp.push({ teeth: b.jaw === "u" ? UPPER : LOWER, v: it.v, label: tn(b.n, lang) });
      continue;
    }
    const x = it.tx ? cat.tx(it.tx) : undefined;
    if (x?.unit === "arch") (it.jaws ?? []).forEach((j) => sp.push({ teeth: j === "u" ? UPPER : LOWER, v: it.v, label: `${tn(x.n, lang)} · ${labels.jaw(j)}` }));
  }
  const seen = new Set<string>();
  return sp.filter((s) => { const k = s.teeth[0] + "|" + s.label; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
}

// ───────────── kural motoru ─────────────
export type Severity = "block" | "warn" | "info";
export interface RuleHit { sev: Severity; code: string; p: Record<string, string | number>; v?: number }
export interface Medical { flags?: string[]; age?: number | null }
export const BLOCK_RULES = ["B1", "B3", "B4", "B5", "DUP", "C1", "C1b", "MINV", "EMPTY"];
export const WARN_RULES = ["VISIT", "B6", "BRIDGE", "SINUS_NOIMP", "SINUS_LOW", "BONE", "PRESENT", "D1", "PREREQ", "M1", "M2", "M3", "M4", "M5", "M6"];

export function checkRules(cat: Catalog, situation: Situation, items: PlanItem[], visits: number, med: Medical, lang = "en", jawLabel: (j: "u" | "l") => string = (j) => j): RuleHit[] {
  const R: RuleHit[] = [], on = (k: string) => cat.rules[k] !== false, flags = new Set(med.flags ?? []);
  const ex = expand(cat, items), byT: Record<number, ToothEvent[]> = {};
  ex.teeth.forEach((e) => (byT[e.t] ??= []).push(e));
  const has = (t: number, r: string) => (byT[t] ?? []).some((e) => e.render === r);
  const push = (sev: Severity, code: string, p: Record<string, string | number> = {}, v?: number) => R.push({ sev, code, p, v });
  const sit = situation ?? {};
  const B: Record<string, number[]> = { B1: [], B3: [], B4: [], B5: [] };
  for (const k of Object.keys(byT)) { const t = +k;
    if (has(t, "ext") && has(t, "rct")) B.B1!.push(t);
    if (has(t, "implant") && has(t, "rct")) B.B3!.push(t);
    if (has(t, "veneer") && has(t, "crown")) B.B4!.push(t);
    if ((has(t, "implant") || ["impab", "impcr"].includes(sit[t]?.s ?? "")) && has(t, "veneer")) B.B5!.push(t);
  }
  for (const [k, v] of Object.entries(B)) if (v.length) push("block", k, { teeth: v.join(", ") });
  // DUP: aynı dişe iki implant, aynı tedavi iki kez ya da iki kalıcı kron (paket + tek kalem dahil) → çift faturalama
  const dup: number[] = [];
  for (const [k, evs] of Object.entries(byT)) {
    const imp = evs.filter((e) => e.render === "implant").length;
    const perm = evs.filter((e) => e.render === "crown" && e.mat !== "temp").length;
    const ids = evs.filter((e) => !e.viaBundle).map((e) => e.txId);
    if (imp > 1 || perm > 1 || ids.length !== new Set(ids).size) dup.push(+k);
  }
  if (dup.length) push("block", "DUP", { teeth: dup.sort((a, c) => ALL_TEETH.indexOf(a) - ALL_TEETH.indexOf(c)).join(", ") });
  const sinusT = ex.teeth.filter((e) => e.render === "sinus");
  const low = sinusT.filter((e) => jawOf(e.t) === "l").map((e) => e.t); if (low.length) push("block", "C1", { teeth: low.join(", ") });
  const ant = sinusT.filter((e) => jawOf(e.t) === "u" && !POSTERIOR_UP.includes(e.t)).map((e) => e.t); if (ant.length) push("block", "C1b", { teeth: ant.join(", ") });
  for (let v = 1; v <= visits; v++) if (!items.some((i) => i.v === v)) push("block", "EMPTY", { v }, v);
  for (const it of items) {
    if (it.b) { const b = cat.bundle(it.b); if (!b) continue;
      if (b.minVisits > visits) push("block", "MINV", { name: tn(b.n, lang), need: b.minVisits, have: visits }, it.v);
      if (!b.visits.includes(it.v)) push("warn", "VISIT", { name: tn(b.n, lang), v: it.v, ok: b.visits.join("/") }, it.v);
    } else { const x = it.tx ? cat.tx(it.tx) : undefined; if (x && !x.visits.includes(it.v) && !it.manual) push("warn", "VISIT", { name: tn(x.n, lang), v: it.v, ok: x.visits.join("/") }, it.v); }
  }
  const finalS = toothStates(cat, sit, items);
  if (on("B6")) { const bad = [...new Set(ex.teeth.filter((e) => cat.tx(e.txId)?.needsImplant && !finalS[e.t]!.implant).map((e) => e.t))]; if (bad.length) push("warn", "B6", { teeth: bad.join(", ") }); }
  if (on("BRIDGE")) for (const row of [UPPER, LOWER]) {
    let i = 0;
    while (i < row.length) {
      const s = finalS[row[i]!]!;
      if (crownKind(s) === "pontic" && !s.span) {
        let j = i; while (j < row.length && crownKind(finalS[row[j]!]!) === "pontic" && !finalS[row[j]!]!.span) j++;
        const ok = (x?: ToothState) => !!x && !!x.kron && crownKind(x) !== "pontic";
        if (!ok(i > 0 ? finalS[row[i - 1]!] : undefined) || !ok(j < row.length ? finalS[row[j]!] : undefined)) push("warn", "BRIDGE", { teeth: row.slice(i, j).join(", ") });
        i = j;
      } else i++;
    }
  }
  if (on("SINUS_NOIMP")) for (const q of [1, 2]) if (sinusT.some((e) => quadOf(e.t) === q) && !ALL_TEETH.some((t) => quadOf(t) === q && finalS[t]!.implant)) push("warn", "SINUS_NOIMP", { q });
  if (on("SINUS_LOW")) for (const q of [1, 2]) { const imp = ex.teeth.filter((e) => e.render === "implant" && quadOf(e.t) === q && POSTERIOR_UP.includes(e.t) && sit[e.t]?.f?.sinusSark);
    if (imp.length && !sinusT.some((e) => quadOf(e.t) === q)) push("warn", "SINUS_LOW", { teeth: imp.map((e) => e.t).join(", ") }); }
  if (on("BONE")) { const bad = ex.teeth.filter((e) => e.render === "implant" && sit[e.t]?.f?.kemikAz && e.form !== "short" && !has(e.t, "graft")).map((e) => e.t); if (bad.length) push("warn", "BONE", { teeth: bad.join(", ") }); }
  if (on("PRESENT")) { const bad = ex.teeth.filter((e) => e.render === "implant" && !finalS[e.t]!.cekim && (!sit[e.t] || ["intact", "rct", "crown", "caries", "comp", "amalg", "inlay", "veneer", "bridge", "other"].includes(sit[e.t]!.s ?? "intact"))).map((e) => e.t); if (bad.length) push("warn", "PRESENT", { teeth: bad.join(", ") }); }
  if (on("D1")) { const wv = items.filter((i) => i.tx === "whitening").map((i) => i.v), cv = ex.teeth.filter((e) => e.render === "crown" || e.render === "veneer").map((e) => e.v); if (wv.length && cv.length && Math.max(...wv) > Math.min(...cv)) push("warn", "D1"); }
  if (on("PREREQ")) for (const it of items) {
    const pr = it.b ? cat.bundle(it.b)?.prereq : it.tx ? cat.tx(it.tx)?.prereq : null; if (!pr) continue;
    const jaws: ("u" | "l")[] = it.b ? [cat.bundle(it.b)!.jaw] : (it.jaws ?? []);
    for (const j of jaws) { const have = implantsInJaw(cat, sit, items, j, it.v); if (have < pr.count) push("warn", "PREREQ", { name: itemName(cat, it, lang), need: pr.count, have, jaw: jawLabel(j) }, it.v); }
  }
  const any = (r: string[]) => ex.teeth.some((e) => r.includes(e.render));
  const age = Number(med.age) || 0;
  if (on("M1") && age && age < 18 && any(["implant"])) push("warn", "M1", { age });
  if (on("M2") && flags.has("bisph") && any(["implant", "ext"])) push("warn", "M2");
  if (on("M3") && flags.has("anticoag") && any(["ext", "implant", "sinus", "graft"])) push("warn", "M3");
  if (on("M4") && flags.has("diabetes") && any(["implant"])) push("warn", "M4");
  if (on("M5") && flags.has("chemo") && any(["ext", "implant", "sinus", "graft"])) push("warn", "M5");
  if (on("M6") && flags.has("pregnant") && any(["ext", "implant", "sinus", "graft"])) push("warn", "M6");
  return R;
}

// ───────────── akıllı öneri (kural tabanlı Magic Fill) ─────────────
export function suggestPlan(situation: Situation, newId: () => string): PlanItem[] {
  const sit = situation ?? {}, items: PlanItem[] = [];
  const it = (v: number, tx: string, teeth: number[], o: Partial<PlanItem> = {}) => items.push({ id: newId(), v, tx, teeth, ...o });
  const bad = (s?: SitEntry) => !!s && ["missing", "root", "pontic"].includes(s.s ?? "");
  for (const j of ["u", "l"] as const) {
    const row = j === "u" ? UPPER : LOWER, core = row.filter((t) => t % 10 !== 8);
    const lost = core.filter((t) => bad(sit[t]));
    if (lost.length >= 8) {
      const toExt = core.filter((t) => sit[t]?.s === "root").concat(core.filter((t) => !sit[t] || ["intact", "caries", "rct", "crown", "comp", "amalg"].includes(sit[t]?.s ?? "intact")));
      if (toExt.length) it(1, "ext_simple", toExt);
      items.push({ id: newId(), v: 1, b: j === "u" ? "ao4_u" : "ao4_l", teeth: [] });
      it(1, "temp_rem", [], { jaws: [j] });
      items.push({ id: newId(), v: 2, b: j === "u" ? "fp_u" : "fp_l", teeth: [] });
      continue;
    }
    const roots = core.filter((t) => sit[t]?.s === "root"), miss = core.filter((t) => sit[t]?.s === "missing");
    if (roots.length) it(1, "ext_simple", roots);
    const imp = [...roots, ...miss];
    if (imp.length) {
      it(1, "implant", imp, { brand: "b_neod" }); it(2, "crown_imp", imp);
      const bone = imp.filter((t) => sit[t]?.f?.kemikAz); if (bone.length) it(1, "graft", bone, { brand: "g1" });
      for (const q of [1, 2]) { const ts = imp.filter((t) => quadOf(t) === q && POSTERIOR_UP.includes(t) && sit[t]?.f?.sinusSark); if (ts.length) it(1, "sinus_open", [ts[0]!]); }
    }
  }
  const car = ALL_TEETH.filter((t) => sit[t]?.s === "caries"); if (car.length) it(1, "filling", car);
  if (!items.length) it(1, "consult", [], { qty: 1 }); else it(1, "pano", [], { qty: 1 });
  return items;
}

// ───────────── fiyatlandırma ─────────────
export interface PriceOption {
  id: string; name: string; custom?: string; rec: boolean; items: PlanItem[]; extras: PlanItem[]; disc: number;
  hotel: { n: number; free: boolean; hotelId?: string | null }; transfer: { on: boolean; free: boolean }; flightPct?: number; flightCost?: number;
  approvedBy?: string | null; approvalRequested?: boolean;
}
export interface Line { v: number; txId: string | null; b: string | null; brand: string | null; manual: boolean; nm: string; br: string; unitL: string; teeth: number[]; jaws: string[]; qty: number; unit: number; total: number }
export interface Calc {
  visits: { v: number; lines: Line[]; sub: number }[]; lines: Line[]; sub: number; tierAdj: number; tierInfo: { n: number; q: number; name: string } | null;
  pkg: { k: string; nm: string; total: number; free: boolean }[]; discPct: number; disc: number; rnd: number; total: number; deposit: number; pay: { v: number; amount: number }[]; missing: number; cur: string;
}
export function convert(cat: Catalog, eur: number, cur: string, prices?: Record<string, number>): number {
  if (prices && prices[cur] != null) return prices[cur]!;
  const v = eur * (cat.fx[cur] ?? 1); const step = cur === "TRY" ? 50 : v >= 1000 ? 10 : 5;
  return Math.round(v / step) * step;
}
const roundTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : Math.round(v));
export const curStep = (cat: Catalog, cur: string) => (cur === "TRY" ? cat.rounding * 10 : cat.rounding);
export function unitPrice(cat: Catalog, it: PlanItem, cur: string): number {
  if (it.manual) return Number(it.price) || 0;
  if (it.b) { const b = cat.bundle(it.b); if (!b) return 0; const br = brandOf(cat, it);
    if (br && b.brands) return convert(cat, br.price, cur);
    return convert(cat, b.price + (br ? (br.price - IMP_BASE) * b.imp.length : 0), cur, br ? undefined : b.prices); }
  const br = brandOf(cat, it); if (br) return convert(cat, br.price, cur);
  const x = it.tx ? cat.tx(it.tx) : undefined; return x ? convert(cat, x.price, cur, x.prices) : 0;
}
export function qtyOf(cat: Catalog, it: PlanItem): number {
  if (it.b) return 1; if (it.manual) return it.qty || 1;
  const x = it.tx ? cat.tx(it.tx) : undefined; if (!x) return 1;
  if (x.unit === "tooth") return (it.teeth ?? []).length || 1;
  if (x.unit === "side") return new Set((it.teeth ?? []).map(quadOf)).size || 1;
  if (x.unit === "arch") return (it.jaws ?? []).length || 1;
  return it.qty || 1;
}
export function calcOption(cat: Catalog, op: PriceOption, visitsCount: number, cur: string, lang: string, unitLabel: (u: string) => string, pkgLabel: (k: string, n?: number) => string, depositBps = cat.depositBps, hotelNight?: number): Calc {
  const vmap: Record<string, Line> = {}, lines: Line[] = [];
  for (const it of [...(op.items ?? []), ...(op.extras ?? [])]) {
    if (!it.v) continue;
    const key = `${it.v}|${it.b || it.tx || "m:" + it.name}|${it.brand ?? ""}|${it.manual ? it.id : ""}`;
    let L = vmap[key];
    if (!L) {
      const x = it.tx ? cat.tx(it.tx) : undefined;
      L = vmap[key] = { v: it.v, txId: it.tx ?? null, b: it.b ?? null, brand: it.brand ?? null, manual: !!it.manual, nm: itemName(cat, it, lang), br: brandOf(cat, it)?.n ?? "",
        unitL: unitLabel(it.b ? "pkg" : it.manual ? "piece" : x?.unit ?? "piece"), teeth: [], jaws: [], qty: 0, unit: unitPrice(cat, it, cur), total: 0 };
      lines.push(L);
    }
    L.qty += qtyOf(cat, it);
    for (const t of it.teeth ?? []) if (!L.teeth.includes(t)) L.teeth.push(t);
    for (const j of it.jaws ?? []) if (!L.jaws.includes(j)) L.jaws.push(j);
    L.total = L.qty * L.unit;
  }
  const order: Record<string, number> = { ext: 0, sinus: 1, graft: 2, implant: 3, rct: 4, fill: 5, inlay: 5, none: 6, arch: 7, crown: 8, veneer: 9 };
  const ord = (l: Line) => (l.b ? 3.5 : order[cat.tx(l.txId ?? "")?.render ?? ""] ?? 6);
  lines.sort((a, b) => a.v - b.v || ord(a) - ord(b));
  const nV = Math.max(visitsCount || 1, ...lines.map((l) => l.v), 1);
  const visits = Array.from({ length: nV }, (_, i) => { const ls = lines.filter((l) => l.v === i + 1); return { v: i + 1, lines: ls, sub: ls.reduce((a, l) => a + l.total, 0) }; });
  let tierAdj = 0, tierInfo: Calc["tierInfo"] = null;
  for (const x of cat.treatments.filter((x) => x.tiers)) {
    const ls = lines.filter((l) => l.txId === x.id), q = ls.reduce((a, l) => a + l.qty, 0); if (!q) continue;
    const unit = ls[0]!.unit, plain = q * unit; let best = plain, bn = 0;
    for (const [n, p] of x.tiers!) if (q >= n) { const v = convert(cat, p, cur) + (q - n) * unit; if (v < best) { best = v; bn = n; } }
    if (best < plain) { tierAdj += plain - best; tierInfo = { n: bn, q, name: tn(x.n, lang) }; }
  }
  const pkg: Calc["pkg"] = [];
  const hn = Number(op.hotel?.n) || 0;
  if (hn) pkg.push({ k: "hotel", nm: pkgLabel("hotel", hn), total: op.hotel.free ? 0 : hn * convert(cat, hotelNight ?? cat.hotelNightEur, cur), free: !!op.hotel.free });
  if (op.transfer?.on) pkg.push({ k: "transfer", nm: pkgLabel("transfer"), total: op.transfer.free ? 0 : convert(cat, cat.transferEur, cur) * nV, free: !!op.transfer.free });
  if (op.flightPct && op.flightCost) pkg.push({ k: "flight", nm: pkgLabel("flight", op.flightPct), total: -Math.round((op.flightCost * op.flightPct) / 100), free: false });
  const pkgSum = pkg.reduce((a, p) => a + p.total, 0);
  const sub = lines.reduce((a, l) => a + l.total, 0) + pkgSum;
  const discPct = Number(op.disc) || 0;
  const disc = Math.round(((sub - tierAdj) * discPct) / 100);
  const net = sub - tierAdj - disc;
  const step = curStep(cat, cur), total = Math.max(0, roundTo(net, step)), rnd = total - net;
  const deposit = roundTo((total * depositBps) / 10000, step);
  const share = visits.map((vv, i) => vv.sub + (i === 0 ? pkgSum : 0)), base = share.reduce((a, b) => a + b, 0) || 1;
  const pay = visits.map((vv, i) => ({ v: vv.v, amount: roundTo((total * share[i]!) / base, step) }));
  if (pay.length) { pay[pay.length - 1]!.amount += total - pay.reduce((a, p) => a + p.amount, 0); pay[0]!.amount -= deposit; }
  return { visits, lines, sub, tierAdj, tierInfo, pkg, discPct, disc, rnd, total, deposit, pay, missing: lines.filter((l) => l.manual && !l.unit).length, cur };
}

function brandTier(list: Brand[] | undefined, i: number): string | null {
  if (!list?.length) return null;
  const bs = list.filter((b) => !b.form || b.form === "std").sort((a, b) => a.price - b.price); if (!bs.length) return list[0]!.id;
  return (i === 0 ? bs[0] : i === 2 ? bs[bs.length - 1] : bs[Math.floor((bs.length - 1) / 2)])!.id;
}
/** Plan kalemlerinden fiyat seçeneği üretir: 0 ekonomik, 1 önerilen, 2 premium (marka/malzeme katmanı) */
export function makeOption(cat: Catalog, items: PlanItem[], visits: number, i: number, newId: () => string): PriceOption {
  const its = structuredClone(items).map((it) => {
    const x = it.tx ? cat.tx(it.tx) : undefined;
    if (x?.brands && x.id === "implant") it.brand = brandTier(x.brands, i) ?? it.brand ?? null;
    if (i === 2 && it.tx === "crown_zr") it.tx = "crown_emax";
    if (i === 0 && it.tx === "crown_emax") it.tx = "crown_zr";
    if (it.b) { const b = cat.bundle(it.b);
      if (b?.brands) it.brand = brandTier(b.brands, i);
      else if (b?.imp.length) it.brand = brandTier(cat.tx("implant")?.brands, i);
      if (i === 2 && it.b === "smile_zr_u") it.b = "smile_emax_u";
      if (i === 0 && it.b === "smile_emax_u") it.b = "smile_zr_u"; }
    return it;
  });
  return { id: newId(), name: ["opt_std", "opt_rec", "opt_prem"][i] ?? "opt_std", rec: i === 1, items: its, extras: [], disc: 0, hotel: { n: visits > 1 ? 5 : 6, free: i >= 1 }, transfer: { on: true, free: true } };
}

export function stayDays(cat: Catalog, lines: Line[]): [number, number] {
  const r = lines.map((l) => (l.b ? "implant" : cat.tx(l.txId ?? "")?.render));
  if (r.includes("crown") || r.includes("veneer")) return [5, 7];
  if (r.some((x) => ["implant", "sinus", "graft"].includes(x ?? ""))) return [3, 5];
  return [1, 2];
}
export const hasImplants = (cat: Catalog, items: PlanItem[]) => expand(cat, items).teeth.some((e) => e.render === "implant");
export const BANNED_WORDS = /\b(garanti\w*|guarantee\w*|ağrısız|painless|schmerzfrei|risksiz|risk-free|en iyi|the best|100\s?%|%\s?100|kesin sonuç|ömür boyu)\b/i;
