import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/apiBase";

const SUCCESS_MESSAGE =
  "Si el email existe en GoodTrading, recibirás instrucciones para recuperar tu cuenta.";

type ForgotPasswordRecoveryProps = {
  onBack: () => void;
  /** Pre-fill email from login form when switching inline */
  initialEmail?: string;
};

export function ForgotPasswordRecovery({ onBack, initialEmail = "" }: ForgotPasswordRecoveryProps) {
  const [email, setEmail] = useState(initialEmail);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErr(null);
    setSuccess(false);

    const normalized = email.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!emailOk) {
      setFieldErr("Ingresá un email válido.");
      return;
    }

    setBusy(true);
    try {
      await fetch(apiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
    } catch {
      // Always show generic success — no email enumeration.
    } finally {
      setBusy(false);
      setSuccess(true);
    }
  };

  return (
    <>
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
          GoodTrading
        </p>
        <h1 className="text-2xl font-bold text-white">Recuperar cuenta</h1>
        <p className="text-sm leading-relaxed text-[#9ca3af]">
          Ingresá tu email y te enviaremos instrucciones para restablecer tu contraseña.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-xs text-[#9ca3af]">Email</label>
          <input
            className={cn(
              "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
              fieldErr ? "border-red-500/60" : "border-white/10",
            )}
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy || success}
            required
          />
          {fieldErr && <p className="mt-1 text-xs text-red-400">{fieldErr}</p>}
        </div>

        {success && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-300">
            {SUCCESS_MESSAGE}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || success}
          className="w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Enviar instrucciones"}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full text-center text-sm font-medium text-blue-400 hover:text-blue-300"
        >
          Volver a iniciar sesión
        </button>
      </form>
    </>
  );
}
