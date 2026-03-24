import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

/** Account disabled / rejected — not the same as pending admin approval. */
export default function AccountInactiveScreen() {
  const { user, logout } = useTerminalAuth();
  const [, setLocation] = useLocation();

  const goLogin = () => setLocation("/login");
  const signOut = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-text px-4">
      <div className="w-full max-w-lg border border-terminal-border bg-terminal-panel p-6 rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="space-y-2">
          <h1 className="text-lg font-bold tracking-widest text-white uppercase">Acceso no disponible</h1>
          <p className="text-xs text-terminal-muted font-mono leading-relaxed">
            Tu cuenta está inactiva o fue rechazada. Contactá al administrador si creés que es un error.
          </p>
          <p className="text-xs text-terminal-muted font-mono">
            Usuario: <span className="text-terminal-accent">{user?.email}</span>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-terminal-border/80 space-y-3">
          <button
            type="button"
            onClick={goLogin}
            className={cn(
              "w-full py-2.5 text-xs font-bold tracking-widest rounded-sm transition-opacity hover:opacity-90",
              "bg-terminal-accent text-black",
            )}
          >
            Volver al login
          </button>
          <button
            type="button"
            onClick={signOut}
            className="w-full py-2.5 text-xs font-mono rounded-sm border border-terminal-border bg-transparent text-terminal-muted hover:text-white hover:border-white/25 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
