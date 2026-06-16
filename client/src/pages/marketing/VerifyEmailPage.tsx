import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { getTerminalRedirect } from "@/lib/platformAccess";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { cn } from "@/lib/utils";

export default function VerifyEmailPage() {
  const { authReady, authenticated, user, emailVerified, refreshSession } = useTerminalAuth();
  const { isAuthenticated, hasActiveSubscription } = usePlatformAccess();
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!authenticated) {
      setLocation("/login");
      return;
    }
    if (emailVerified) {
      setLocation(getTerminalRedirect({ isAuthenticated, hasActiveSubscription, emailVerified: true }));
    }
  }, [authReady, authenticated, emailVerified, isAuthenticated, hasActiveSubscription, setLocation]);

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    const normalized = code.replace(/\D/g, "").slice(0, 6);
    if (normalized.length !== 6) {
      setErr("Ingresá el código de 6 dígitos.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "VERIFY_FAILED");
      }
      await refreshSession();
      setInfo("Email verificado correctamente.");
      setLocation(getTerminalRedirect({ isAuthenticated: true, hasActiveSubscription, emailVerified: true }));
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : "";
      setErr(msg.includes("INVALID_CODE") ? "Código inválido o expirado." : "No se pudo verificar el código.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr(null);
    setInfo(null);
    setResendBusy(true);
    try {
      const res = await fetch("/api/auth/resend-verification-code", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "RESEND_FAILED");
      }
      setInfo("Código reenviado. Revisá tu email.");
    } catch {
      setErr("No se pudo reenviar el código. Probá más tarde.");
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <MarketingLayout>
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-16">
        <div className="w-full rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8">
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
              GoodTrading
            </p>
            <h1 className="text-2xl font-bold text-white">Verificá tu email</h1>
            <p className="text-sm leading-relaxed text-[#9ca3af]">
              Enviamos un código de 6 dígitos a{" "}
              <span className="text-white">{user?.email ?? "tu email"}</span>.
            </p>
          </div>

          <form className="space-y-4" onSubmit={submitCode}>
            <div>
              <label className="mb-1 block text-xs text-[#9ca3af]">Código de verificación</label>
              <input
                className={cn(
                  "h-11 w-full rounded-xl border bg-[#030303] px-3 text-center text-lg tracking-[0.35em] text-white outline-none focus:border-blue-500/50",
                  err ? "border-red-500/60" : "border-white/10",
                )}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
              />
            </div>

            {err && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {err}
              </div>
            )}
            {info && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Verificando…" : "Verificar email"}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2 text-center text-sm">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={resendBusy}
              className="font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              {resendBusy ? "Reenviando…" : "Reenviar código"}
            </button>
            <Link href="/account" className="text-[#9ca3af] hover:text-white">
              Ir a mi cuenta
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
