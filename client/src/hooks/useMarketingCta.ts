import { useMemo } from "react";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { getMarketingCtas, type MarketingCtaPair } from "@/lib/platformAccess";

export function useMarketingCta(): MarketingCtaPair & {
  terminalRedirect: string;
} {
  const { isAuthenticated, hasActiveSubscription, terminalRedirect } = usePlatformAccess();

  const ctas = useMemo(
    () => getMarketingCtas({ isAuthenticated, hasActiveSubscription }),
    [isAuthenticated, hasActiveSubscription],
  );

  return { ...ctas, terminalRedirect };
}
