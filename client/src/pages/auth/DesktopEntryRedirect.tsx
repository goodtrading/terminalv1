import { useEffect } from "react";
import { useLocation } from "wouter";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { DesktopLoadingScreen } from "@/pages/auth/DesktopBootScreens";

/**
 * Desktop `/` and marketing-route entry: send users to login, verify, pricing, or terminal.
 * Never renders the public web landing.
 */
export default function DesktopEntryRedirect() {
  const { authReady, terminalRedirect } = usePlatformAccess();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authReady) return;
    setLocation(terminalRedirect);
  }, [authReady, terminalRedirect, setLocation]);

  return <DesktopLoadingScreen />;
}
