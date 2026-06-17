import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { isAdminUser } from "@/lib/authRoles";

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, authReady, authenticated } = useTerminalAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-terminal-bg text-terminal-muted text-sm font-mono">
        Cargando panel admin…
      </div>
    );
  }

  if (!user || !authenticated) {
    return <Redirect to="/login" replace />;
  }

  if (!isAdminUser(user)) {
    return <Redirect to="/terminal" replace />;
  }

  return <>{children}</>;
}
