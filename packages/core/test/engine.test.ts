import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TREATMENTS, DEFAULT_BUNDLES } from "../src/catalog.ts";
import { makeCatalog, checkRules, calcOption, makeOption, suggestPlan, toothStates, type PlanItem } from "../src/engine.ts";

const cat = makeCatalog(DEFAULT_TREATMENTS, DEFAULT_BUNDLES, { fx: { EUR: 1, GBP: 0.85, TRY: 38 } });
let n = 0; const id = () => "i" + ++n;
const codes = (items: PlanItem[], visits = 2, flags: string[] = [], sit = {}) => checkRules(cat, sit, items, visits, { flags }).map((r) => r.sev + ":" + r.code);

test("engelleyici kurallar", () => {
  const r = codes([{ id: id(), v: 1, tx: "implant", teeth: [36] }, { id: id(), v: 1, tx: "rct", teeth: [36] }, { id: id(), v: 1, tx: "sinus_open", teeth: [46] },
    { id: id(), v: 1, tx: "veneer_por", teeth: [11] }, { id: id(), v: 1, tx: "crown_zr", teeth: [11] }], 1);
  for (const c of ["block:B3", "block:B4", "block:C1"]) assert.ok(r.includes(c), c);
});

test("paket ön koşulu: All-on-4 içindeki implantlar sabit protezi karşılar (DentClosers hatası düzeltildi)", () => {
  const items: PlanItem[] = [{ id: id(), v: 1, b: "ao4_u" }, { id: id(), v: 2, b: "fp_u" }];
  assert.ok(!codes(items).some((c) => c.endsWith("PREREQ")));
  assert.ok(codes([{ id: id(), v: 1, tx: "consult", qty: 1 }, { id: id(), v: 2, b: "fp_u" }]).includes("warn:PREREQ"));
});

test("minimum ziyaret ve boş ziyaret", () => {
  assert.ok(codes([{ id: id(), v: 1, b: "ao4_u" }], 1).includes("block:MINV"));
  assert.ok(codes([{ id: id(), v: 1, tx: "filling", teeth: [16] }], 2).includes("block:EMPTY"));
});

test("anamnez uyarısı: diyabet + implant → M4", () => {
  assert.ok(codes([{ id: id(), v: 1, tx: "implant", teeth: [36] }], 1, ["diabetes"], { 36: { s: "missing" } }).includes("warn:M4"));
});

test("akıllı öneri: üst çenede 8+ eksik → All-on-4 + sabit protez", () => {
  const sit: Record<string, { s: "missing" | "root" }> = {}; [17, 16, 15, 14, 24, 25, 26, 27].forEach((t) => (sit[t] = { s: "missing" })); [13, 12].forEach((t) => (sit[t] = { s: "root" }));
  const items = suggestPlan(sit, id);
  assert.ok(items.some((i) => i.b === "ao4_u") && items.some((i) => i.b === "fp_u" && i.v === 2));
  const st = toothStates(cat, sit, items);
  assert.equal(st[17]!.kron, "zr"); assert.ok(st[15]!.implant);
});

test("fiyat: kademeli kron paketi, indirim, kapora ve ödeme planı toplamı tutar", () => {
  const teeth = [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 47, 46, 45, 44, 43, 42];
  const op = makeOption(cat, [{ id: id(), v: 1, tx: "crown_zr", teeth }], 1, 0, id);
  op.disc = 10; op.hotel = { n: 0, free: false }; op.transfer = { on: false, free: false };
  const c = calcOption(cat, op, 1, "EUR", "tr", (u) => u, (k) => k);
  assert.equal(c.lines[0]!.qty, 20);
  assert.equal(c.tierAdj, 20 * 180 - 3200);           // 20'li paket 3200 €
  assert.equal(c.total, Math.round((3200 * 0.9) / 10) * 10);
  assert.equal(c.pay.reduce((a, p) => a + p.amount, 0) + c.deposit, c.total);
});

test("seçenek katmanları farklı fiyat üretir (ekonomik < önerilen < premium)", () => {
  const items: PlanItem[] = [{ id: id(), v: 1, b: "ao4_u" }, { id: id(), v: 2, b: "fp_u" }];
  const t = [0, 1, 2].map((i) => calcOption(cat, makeOption(cat, items, 2, i, id), 2, "GBP", "en", (u) => u, (k) => k).total);
  assert.ok(t[0]! < t[1]! && t[1]! < t[2]!, t.join(" < "));
});
