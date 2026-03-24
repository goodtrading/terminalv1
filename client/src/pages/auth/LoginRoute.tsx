import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";

/**
 * Landing for `/login`: clears client session and cookie logout, then sends user to `/`
 * where the login form is shown. Used by "Volver al login" from gated screens.
 */
export default function LoginRoute() {
  const { logout, authReady } = useTerminalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authReady) return;
    logout();
    setLocation("/");
  }, [authReady, logout, setLocation]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-muted text-sm font-mono px-4">
      Redirigiendo al inicio de sesión…
    </div>
  );
}
