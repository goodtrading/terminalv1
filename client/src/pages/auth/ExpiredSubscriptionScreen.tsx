import { useTerminalAuth } from "@/contexts/TerminalAuthContext";

export default function ExpiredSubscriptionScreen({ onRenew }: { onRenew: () => void }) {
  const { user, logout } = useTerminalAuth();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-text px-4">
      <div className="w-full max-w-lg border border-terminal-border bg-terminal-panel p-6 rounded-sm space-y-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="space-y-2">
          <h1 className="text-lg font-bold tracking-widest text-white uppercase">Suscripcion expirada</h1>
          <p className="text-xs text-terminal-muted font-mono leading-relaxed">
            Tu acceso vencio. Para continuar, necesitas renovar tu suscripcion.
          </p>
          <p className="text-xs text-terminal-muted font-mono">
            Usuario: <span className="text-terminal-accent">{user?.email}</span>
          </p>
        </div>

        <div className="pt-2 border-t border-terminal-border/60 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onRenew}
            className="text-xs font-mono border border-terminal-accent px-3 py-1.5 rounded-sm text-terminal-accent hover:bg-terminal-accent/10 transition-colors"
          >
            Renovar suscripcion
          </button>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-mono border border-terminal-border px-3 py-1.5 rounded-sm text-terminal-muted hover:text-white hover:border-white/30 transition-colors"
          >
            LOG OUT
          </button>
        </div>
      </div>
    </div>
  );
}
