import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get } from "./api.ts";
import type { Permissions, PermKey } from "@dentaflow/core/permissions";
export interface Me {
  user: { id: string; email: string; name: string; locale: string; mfaEnabled: boolean; isPlatformAdmin: boolean } | null;
  clinics: { id: string; slug: string; name: string; brandColor: string; role: string }[];
  clinic: { id: string; slug: string; name: string; brandColor: string; defaultCurrency: string; currencies: string[]; languages: string[]; defaultLanguage: string; toothNumbering: string; timezone: string; settings: any; status: string; country: string } | null;
  role: string | null; perms: Permissions | null;
}
export function useMe() { return useQuery({ queryKey: ["me"], queryFn: () => get<Me>("/api/auth/me"), staleTime: 60_000 }); }
export function useCan() {
  const { data } = useMe();
  return (k: PermKey) => { const v = data?.perms?.[k]; return !(v === false || v === 0 || v === "hide" || v == null); };
}
export function usePerms() { return useMe().data?.perms ?? null; }
export const useInvalidateMe = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["me"] }); };
