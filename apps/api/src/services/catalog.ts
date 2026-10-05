// Klinik kataloğunu motor (core/engine) formatına yükler; kısa süreli önbellek, düzenlemede geçersiz kılınır.
import type { Tx } from "../db.ts";
import { makeCatalog, type Catalog } from "@dentaflow/core/engine";
import type { Treatment, Bundle } from "@dentaflow/core/catalog";

const cache = new Map<string, { at: number; cat: Catalog }>();
export const invalidateCatalog = (clinicId: string) => cache.delete(clinicId);

export async function loadCatalog(tx: Tx, clinicId: string): Promise<Catalog> {
  const hit = cache.get(clinicId);
  if (hit && Date.now() - hit.at < 60_000) return hit.cat;
  const [cl] = await tx`select settings from clinics where id = ${clinicId}`;
  const s = (cl?.settings ?? {}) as Record<string, any>;
  const tr = await tx`select * from treatment_types where clinic_id = ${clinicId} order by sort`;
  const bu = await tx`select * from bundles where clinic_id = ${clinicId} order by sort`;
  const treatments: Treatment[] = tr.map((r) => ({ id: r.code, cat: r.category, n: r.names, unit: r.unit, render: r.render, mat: r.material ?? undefined, visits: r.visits, color: r.color ?? undefined,
    price: Number(r.priceEur), prices: r.prices ?? undefined, brands: r.brands ?? undefined, tiers: r.tiers ?? undefined, needsImplant: r.needsImplant, prereq: r.prereq, active: r.active, desc: r.descriptions }));
  const bundles: Bundle[] = bu.map((r) => ({ id: r.code, n: r.names, jaw: r.jaw, imp: r.implantTeeth, crown: r.crownTeeth, teeth: [...new Set([...r.implantTeeth, ...r.crownTeeth])],
    mat: r.material, arch: r.archTreatment, minVisits: r.minVisits, visits: r.visits, prereq: r.prereq, brands: r.brands ?? undefined, price: Number(r.priceEur), prices: r.prices ?? undefined, color: r.color ?? "#64748B", active: r.active }));
  const q = s.quote ?? {};
  const cat = makeCatalog(treatments, bundles, { rules: s.rules ?? {}, fx: s.fxRates ?? { EUR: 1 }, rounding: q.rounding ?? 10, depositBps: q.depositBps ?? 1000,
    hotelNightEur: q.hotelNightEur ?? 65, transferEur: q.transferEur ?? 60, gapMinMonths: q.gapMinMonths ?? 3, gapMaxMonths: q.gapMaxMonths ?? 6 });
  cache.set(clinicId, { at: Date.now(), cat });
  return cat;
}
