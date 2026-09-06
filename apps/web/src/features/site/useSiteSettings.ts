import { useQuery } from "@tanstack/react-query";
import { getSiteSettingsRequest } from "./siteApi";

export const siteSettingsKey = ["site-settings", "public"] as const;

export function useSiteSettings() {
  return useQuery({
    queryKey: siteSettingsKey,
    queryFn: getSiteSettingsRequest,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
