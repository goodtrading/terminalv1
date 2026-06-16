import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";

/**
 * Legacy logout landing: clears session then sends user to `/login`.
 * Kept for gated screens that link to `/login` expecting a fresh sign-in form.
 */
export default function LoginRoute() {
  const { logout, authReady } = useTerminalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authReady) return;
    logout();
    setLocation("/login");
  }, [authReady, logout, setLocation]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#030303] text-[#9ca3af] text-sm px-4">
      Cerrando sesión…
    </div>
  );
}
