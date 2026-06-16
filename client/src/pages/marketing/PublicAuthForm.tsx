import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { cn } from "@/lib/utils";
import { getTerminalRedirect } from "@/lib/platformAccess";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ForgotPasswordRecovery } from "@/components/marketing/ForgotPasswordRecovery";

type AuthMode = "login" | "register";

function mapAuthError(msg: string) {
  if (msg.includes("EMAIL_TAKEN")) return "Ya existe una cuenta con este email.";
  if (msg.includes("INVALID_CREDENTIALS")) return "Email o contraseña incorrectos.";
  if (msg.includes("ACCOUNT_DISABLED")) return "Tu cuenta está inactiva.";
  if (msg.includes("REGISTER_FAILED")) return "No se pudo crear la cuenta. Intentá de nuevo.";
  if (msg.includes("LOGIN_FAILED")) return "No se pudo iniciar sesión. Intentá de nuevo.";
  return msg || "Error en la solicitud.";
}

type PublicAuthFormProps = {
  mode: AuthMode;
};

export function PublicAuthForm({ mode }: PublicAuthFormProps) {
  const { authReady, login, register } = useTerminalAuth();
  const { isAuthenticated, hasActiveSubscription, emailVerified } = usePlatformAccess();
  const [, setLocation] = useLocation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const isRegister = mode === "register";

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    setLocation(
      getTerminalRedirect({ isAuthenticated, hasActiveSubscription, emailVerified }),
    );
  }, [authReady, isAuthenticated, hasActiveSubscription, emailVerified, setLocation]);

  return (
    <MarketingLayout>
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-16">
        <div className="w-full rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8 shadow-[0_0_48px_rgba(255,59,59,0.06)]">
          {!isRegister && showForgotPassword ? (
            <ForgotPasswordRecovery
              initialEmail={email}
              onBack={() => setShowForgotPassword(false)}
            />
          ) : (
            <>
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
              GoodTrading
            </p>
            <h1 className="text-2xl font-bold text-white">
              {isRegister ? "Crear cuenta" : "Iniciar sesión"}
            </h1>
            <p className="text-sm leading-relaxed text-[#9ca3af]">
              {isRegister
                ? "Creá tu cuenta para acceder a productos GoodTrading."
                : "Accedé a tu cuenta GoodTrading."}
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              setFieldErr({});

              const fe: Record<string, string> = {};
              const normalizedEmail = email.trim();
              const normalizedName = fullName.trim();
              const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
              if (isRegister && normalizedName.length < 2) {
                fe.fullName = "Ingresá tu nombre.";
              }
              if (!emailOk) fe.email = "Ingresá un email válido.";
              if (password.length < (isRegister ? 8 : 1)) {
                fe.password = isRegister
                  ? "La contraseña debe tener al menos 8 caracteres."
                  : "La contraseña es obligatoria.";
              }
              if (isRegister && confirmPassword !== password) {
                fe.confirmPassword = "Las contraseñas no coinciden.";
              }
              if (Object.keys(fe).length > 0) {
                setFieldErr(fe);
                return;
              }

              setBusy(true);
              try {
                if (isRegister) await register(normalizedEmail, password, normalizedName);
                else await login(normalizedEmail, password);
              } catch (ex: unknown) {
                const message = ex instanceof Error ? ex.message : "";
                setErr(mapAuthError(message));
              } finally {
                setBusy(false);
              }
            }}
          >
            {isRegister && (
              <div>
                <label className="mb-1 block text-xs text-[#9ca3af]">Nombre</label>
                <input
                  className={cn(
                    "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
                    fieldErr.fullName ? "border-red-500/60" : "border-white/10",
                  )}
                  type="text"
                  autoComplete="name"
                  placeholder="Tu nombre"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                {fieldErr.fullName && (
                  <p className="mt-1 text-xs text-red-400">{fieldErr.fullName}</p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-[#9ca3af]">Email</label>
              <input
                className={cn(
                  "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
                  fieldErr.email ? "border-red-500/60" : "border-white/10",
                )}
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {fieldErr.email && <p className="mt-1 text-xs text-red-400">{fieldErr.email}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#9ca3af]">Contraseña</label>
              <input
                className={cn(
                  "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
                  fieldErr.password ? "border-red-500/60" : "border-white/10",
                )}
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "Mínimo 8 caracteres" : "Tu contraseña"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isRegister ? 8 : 1}
              />
              {fieldErr.password && <p className="mt-1 text-xs text-red-400">{fieldErr.password}</p>}
              {!isRegister && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}
            </div>

            {isRegister && (
              <div>
                <label className="mb-1 block text-xs text-[#9ca3af]">Confirmar contraseña</label>
                <input
                  className={cn(
                    "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
                    fieldErr.confirmPassword ? "border-red-500/60" : "border-white/10",
                  )}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repetí tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
                {fieldErr.confirmPassword && (
                  <p className="mt-1 text-xs text-red-400">{fieldErr.confirmPassword}</p>
                )}
              </div>
            )}

            {err && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? isRegister
                  ? "Creando cuenta…"
                  : "Ingresando…"
                : isRegister
                  ? "Crear cuenta"
                  : "Iniciar sesión"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#9ca3af]">
            {isRegister ? (
              <>
                ¿Ya tenés cuenta?{" "}
                <Link href="/login" className="font-medium text-blue-400 hover:text-blue-300">
                  Iniciar sesión
                </Link>
              </>
            ) : (
              <>
                ¿No tenés cuenta?{" "}
                <Link href="/register" className="font-medium text-blue-400 hover:text-blue-300">
                  Crear cuenta
                </Link>
              </>
            )}
          </p>
            </>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
