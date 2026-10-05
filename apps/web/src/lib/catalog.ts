import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { get } from "./api.ts";
import { makeCatalog, type Catalog } from "@dentaflow/core/engine";
import type { Treatment, Bundle } from "@dentaflow/core/catalog";

export function useCatalog(): { cat: Catalog | null; raw: any } {
  const { data } = useQuery({ queryKey: ["catalog"], queryFn: () => get("/api/catalog"), staleTime: 5 * 60_000 });
  const cat = useMemo(() => data ? makeCatalog(data.treatments, data.bundles, { rules: data.rules, fx: data.fx, rounding: data.rounding, depositBps: data.depositBps, hotelNightEur: data.hotelNightEur, transferEur: data.transferEur, gapMinMonths: data.gapMinMonths, gapMaxMonths: data.gapMaxMonths }) : null, [data]);
  return { cat, raw: data };
}
/** Teklif snapshot'ındaki katalog alt kümesinden motor kataloğu */
export function catalogFromSnapshot(snap: any): Catalog {
  const tr = (snap.catalog?.treatments ?? []).map((t: any) => ({ visits: [1, 2, 3], price: 0, active: true, desc: null, cat: "other", ...t })) as Treatment[];
  return makeCatalog(tr, (snap.catalog?.bundles ?? []) as Bundle[]);
}
