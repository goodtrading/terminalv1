import { useState, type ReactNode } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { SubscriptionPage } from "@/pages/auth/SubscriptionPage";
import { cn } from "@/lib/utils";

export default function BlockedAccessScreen({ children }: { children: ReactNode }) {
  const { saasDisabled, authReady, user, access, login, register } = useTerminalAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-muted text-sm font-mono">
        Loading session…
      </div>
    );
  }

  if (saasDisabled) {
    return <>{children}</>;
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-terminal-bg text-terminal-text px-4">
        <div className="w-full max-w-md border border-terminal-border bg-terminal-panel p-6 rounded-sm shadow-lg">
          <h1 className="text-lg font-bold tracking-widest text-white mb-1">GOODTRADING</h1>
          <p className="text-xs text-terminal-muted mb-6 font-mono">
            Sign in to verify your subscription and access the terminal.
          </p>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              className={cn(
                "flex-1 py-2 text-xs font-mono border rounded-sm",
                mode === "login"
                  ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                  : "border-terminal-border text-terminal-muted",
              )}
              onClick={() => {
                setMode("login");
                setErr(null);
              }}
            >
              LOGIN
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 py-2 text-xs font-mono border rounded-sm",
                mode === "register"
                  ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                  : "border-terminal-border text-terminal-muted",
              )}
              onClick={() => {
                setMode("register");
                setErr(null);
              }}
            >
              REGISTER
            </button>
          </div>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              setBusy(true);
              try {
                if (mode === "login") await login(email, password);
                else await register(email, password);
              } catch (ex: any) {
                setErr(ex?.message || "Request failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">EMAIL</label>
              <input
                className="w-full bg-terminal-bg border border-terminal-border px-2 py-2 text-sm font-mono text-white rounded-sm"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">PASSWORD</label>
              <input
                className="w-full bg-terminal-bg border border-terminal-border px-2 py-2 text-sm font-mono text-white rounded-sm"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 8 : 1}
              />
            </div>
            {err && (
              <div className="text-xs text-red-400 font-mono border border-red-500/40 bg-red-500/10 px-2 py-1 rounded-sm">
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 text-xs font-bold tracking-widest bg-terminal-accent text-black rounded-sm hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!access?.allowed) {
    return <SubscriptionPage />;
  }

  return <>{children}</>;
}
