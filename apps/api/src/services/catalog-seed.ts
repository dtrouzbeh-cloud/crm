// Klinik oluşturulurken varsayılan katalog ve örnek oteller yüklenir
import type { Tx } from "../db.ts";
import { DEFAULT_TREATMENTS, DEFAULT_BUNDLES } from "@dentaflow/core/catalog";

export async function seedClinicCatalog(tx: Tx, clinicId: string): Promise<void> {
  let i = 0;
  for (const t of DEFAULT_TREATMENTS) {
    await tx`insert into treatment_types (clinic_id, code, category, names, descriptions, unit, render, material, visits, color, price_eur, brands, tiers, needs_implant, prereq, sort)
      values (${clinicId}, ${t.id}, ${t.cat}, ${tx.json(t.n as never)}, ${t.desc ? tx.json(t.desc as never) : null}, ${t.unit}, ${t.render}, ${t.mat ?? null}, ${t.visits}, ${t.color ?? null},
              ${t.price}, ${t.brands ? tx.json(t.brands as never) : null}, ${t.tiers ? tx.json(t.tiers as never) : null}, ${!!t.needsImplant}, ${t.prereq ? tx.json(t.prereq as never) : null}, ${i++})`;
  }
  i = 0;
  for (const b of DEFAULT_BUNDLES) {
    await tx`insert into bundles (clinic_id, code, names, jaw, implant_teeth, crown_teeth, material, arch_treatment, min_visits, visits, prereq, brands, price_eur, color, sort)
      values (${clinicId}, ${b.id}, ${tx.json(b.n as never)}, ${b.jaw}, ${b.imp}, ${b.crown}, ${b.mat}, ${b.arch}, ${b.minVisits}, ${b.visits},
              ${b.prereq ? tx.json(b.prereq as never) : null}, ${b.brands ? tx.json(b.brands as never) : null}, ${b.price}, ${b.color}, ${i++})`;
  }
  await tx`insert into hotels (clinic_id, name, stars, night_eur, sort) values (${clinicId}, 'Partner Hotel (4★)', 4, 65, 0), (${clinicId}, 'Premium Hotel (5★)', 5, 120, 1)`;
  await tx`insert into transfer_options (clinic_id, name, price_eur) values (${clinicId}, ${tx.json(["VIP transfer", "VIP transfer", "VIP-Transfer", "نقل VIP"] as never)}, 60)`;
  for (const [i2, q] of [["Tedavi ağrılı mı?", "Will it hurt?"], ["Neden iki ziyaret?", "Why two visits?"], ["Fiyata neler dahil?", "What's included?"]].entries())
    await tx`insert into clinic_content (clinic_id, kind, data, sort) values (${clinicId}, 'faq', ${tx.json({ q: { tr: q[0], en: q[1] }, a: { tr: "", en: "" } } as never)}, ${i2})`;
}
