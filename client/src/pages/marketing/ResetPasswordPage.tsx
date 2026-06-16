import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { cn } from "@/lib/utils";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!token) {
      setErr("Enlace inválido o expirado.");
      return;
    }
    if (password.length < 8) {
      setErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "RESET_FAILED");
      }
      setSuccess(true);
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : "";
      setErr(msg.includes("INVALID_TOKEN") ? "Enlace inválido o expirado." : "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
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
            <h1 className="text-2xl font-bold text-white">Nueva contraseña</h1>
            <p className="text-sm text-[#9ca3af]">Elegí una contraseña segura para tu cuenta.</p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                Contraseña actualizada. Ya podés iniciar sesión.
              </div>
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 py-3 text-sm font-semibold text-white"
              >
                Ir a iniciar sesión
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div>
                <label className="mb-1 block text-xs text-[#9ca3af]">Nueva contraseña</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
                    err ? "border-red-500/60" : "border-white/10",
                  )}
                  disabled={busy}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#9ca3af]">Confirmar contraseña</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={cn(
                    "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
                    err ? "border-red-500/60" : "border-white/10",
                  )}
                  disabled={busy}
                />
              </div>
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
                {busy ? "Guardando…" : "Restablecer contraseña"}
              </button>
              <Link href="/login" className="block text-center text-sm text-blue-400 hover:text-blue-300">
                Volver a iniciar sesión
              </Link>
            </form>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
