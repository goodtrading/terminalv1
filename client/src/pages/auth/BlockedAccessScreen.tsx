import { useState, type ReactNode } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { SubscriptionPage } from "@/pages/auth/SubscriptionPage";
import PendingApprovalScreen from "@/pages/auth/PendingApprovalScreen";
import AccountInactiveScreen from "@/pages/auth/AccountInactiveScreen";
import ExpiredSubscriptionScreen from "@/pages/auth/ExpiredSubscriptionScreen";
import { cn } from "@/lib/utils";

export default function BlockedAccessScreen({ children }: { children: ReactNode }) {
  const { saasDisabled, authReady, user, access, login, register } = useTerminalAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [renewingExpired, setRenewingExpired] = useState(false);

  if (!authReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-muted text-sm font-mono">
        Loading session…
      </div>
    );
  }

  if (saasDisabled) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-terminal-bg text-terminal-text px-6">
        <div className="max-w-md border border-terminal-border bg-terminal-panel p-6 rounded-sm text-center space-y-3">
          <h1 className="text-sm font-bold tracking-widest text-white">AUTH SERVICE UNAVAILABLE</h1>
          <p className="text-xs text-terminal-muted font-mono leading-relaxed">
            The server has no database connection (<code className="text-terminal-accent">DATABASE_URL</code>).
            Login and subscriptions are disabled until SaaS is configured and the server is restarted.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    const isRegister = mode === "register";

    const mapAuthError = (msg: string) => {
      if (msg.includes("EMAIL_TAKEN")) return "That email is already registered.";
      if (msg.includes("INVALID_CREDENTIALS")) return "Invalid email or password.";
      if (msg.includes("ACCOUNT_DISABLED")) return "Your account is currently inactive.";
      if (msg.includes("REGISTER_FAILED")) return "Could not create account. Try again.";
      if (msg.includes("LOGIN_FAILED")) return "Could not sign in. Try again.";
      return msg || "Request failed.";
    };

    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-terminal-bg text-terminal-text px-4">
        <div className="w-full max-w-md border border-terminal-border bg-terminal-panel p-7 rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.03)] space-y-5">
          <div className="space-y-1">
            <p className="text-[10px] font-mono tracking-widest text-terminal-muted uppercase">GoodTrading</p>
            <h1 className="text-xl font-bold tracking-wide text-white">
              {isRegister ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-xs text-terminal-muted font-mono">
              {isRegister
                ? "Create your account to start the approval process."
                : "Sign in to continue to your terminal access flow."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 border border-terminal-border rounded-sm bg-terminal-bg/50">
            <button
              type="button"
              className={cn(
                "py-2 text-xs font-mono border rounded-sm transition-colors",
                mode === "login"
                  ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                  : "border-transparent text-terminal-muted hover:text-white hover:border-terminal-border",
              )}
              onClick={() => {
                setMode("login");
                setErr(null);
                setFieldErr({});
              }}
            >
              LOGIN
            </button>
            <button
              type="button"
              className={cn(
                "py-2 text-xs font-mono border rounded-sm transition-colors",
                mode === "register"
                  ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                  : "border-transparent text-terminal-muted hover:text-white hover:border-terminal-border",
              )}
              onClick={() => {
                setMode("register");
                setErr(null);
                setFieldErr({});
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
              setFieldErr({});

              const fe: Record<string, string> = {};
              const normalizedEmail = email.trim();
              const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
              if (!emailOk) fe.email = "Enter a valid email address.";
              if (password.length < (isRegister ? 8 : 1)) {
                fe.password = isRegister
                  ? "Password must be at least 8 characters."
                  : "Password is required.";
              }
              if (isRegister && confirmPassword !== password) {
                fe.confirmPassword = "Passwords do not match.";
              }
              if (Object.keys(fe).length > 0) {
                setFieldErr(fe);
                return;
              }

              setBusy(true);
              try {
                if (mode === "login") await login(normalizedEmail, password);
                else await register(normalizedEmail, password);
              } catch (ex: any) {
                setErr(mapAuthError(ex?.message || ""));
              } finally {
                setBusy(false);
              }
            }}
          >
            {isRegister && (
              <div>
                <label className="block text-[10px] text-terminal-muted mb-1 font-mono">NAME (OPTIONAL)</label>
                <input
                  className="w-full h-10 bg-terminal-bg border border-terminal-border px-3 text-sm font-mono text-white rounded-sm outline-none focus:border-terminal-accent"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">EMAIL</label>
              <input
                className={cn(
                  "w-full h-10 bg-terminal-bg border px-3 text-sm font-mono text-white rounded-sm outline-none focus:border-terminal-accent",
                  fieldErr.email ? "border-red-500/70" : "border-terminal-border",
                )}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {fieldErr.email && <p className="mt-1 text-[11px] text-red-400 font-mono">{fieldErr.email}</p>}
            </div>
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">PASSWORD</label>
              <input
                className={cn(
                  "w-full h-10 bg-terminal-bg border px-3 text-sm font-mono text-white rounded-sm outline-none focus:border-terminal-accent",
                  fieldErr.password ? "border-red-500/70" : "border-terminal-border",
                )}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={isRegister ? "Minimum 8 characters" : "Enter your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 8 : 1}
              />
              {fieldErr.password && <p className="mt-1 text-[11px] text-red-400 font-mono">{fieldErr.password}</p>}
            </div>
            {isRegister && (
              <div>
                <label className="block text-[10px] text-terminal-muted mb-1 font-mono">CONFIRM PASSWORD</label>
                <input
                  className={cn(
                    "w-full h-10 bg-terminal-bg border px-3 text-sm font-mono text-white rounded-sm outline-none focus:border-terminal-accent",
                    fieldErr.confirmPassword ? "border-red-500/70" : "border-terminal-border",
                  )}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
                {fieldErr.confirmPassword && (
                  <p className="mt-1 text-[11px] text-red-400 font-mono">{fieldErr.confirmPassword}</p>
                )}
              </div>
            )}
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
              {busy
                ? mode === "login"
                  ? "SIGNING IN..."
                  : "SUBMITTING REQUEST..."
                : mode === "login"
                  ? "SIGN IN"
                  : "REQUEST ACCESS"}
            </button>
            {isRegister && (
              <p className="text-[11px] text-terminal-muted font-mono leading-relaxed pt-1">
                After registration, your account will remain pending until an administrator approves access.
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  if (!access?.allowed) {
    const reason = access?.reason || "inactive";
    if (reason === "pending_approval") {
      return <PendingApprovalScreen />;
    }
    if (reason === "inactive") {
      return <AccountInactiveScreen />;
    }
    if (reason === "expired") {
      if (renewingExpired) return <SubscriptionPage />;
      return <ExpiredSubscriptionScreen onRenew={() => setRenewingExpired(true)} />;
    }
    if (reason === "no_subscription") {
      return <SubscriptionPage />;
    }
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-terminal-bg text-terminal-text px-4">
        <div className="w-full max-w-lg border border-terminal-border bg-terminal-panel p-6 rounded-sm space-y-3">
          <h1 className="text-lg font-bold tracking-wider text-white">ACCESO NO DISPONIBLE</h1>
          <p className="text-xs text-terminal-muted font-mono">
            Tu cuenta no tiene acceso activo en este momento. Contacta al administrador.
          </p>
          <p className="text-xs text-terminal-muted font-mono">
            Estado: <span className="text-terminal-accent">{reason}</span>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
