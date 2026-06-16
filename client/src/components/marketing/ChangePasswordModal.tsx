import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ChangePasswordModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FieldErrors = {
  current?: string;
  next?: string;
  confirm?: string;
  form?: string;
};

const inputClass = (hasError: boolean) =>
  cn(
    "h-11 w-full rounded-xl border bg-[#030303] px-3 text-sm text-white outline-none focus:border-blue-500/50",
    hasError ? "border-red-500/60" : "border-white/10",
  );

/** Mock password change UI — connect to POST /api/auth/change-password later. */
export function ChangePasswordModal({ open, onOpenChange }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFieldErrors({});
    setSuccess(false);
    setBusy(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccess(false);

    const errors: FieldErrors = {};
    if (!currentPassword.trim()) errors.current = "Ingresá tu contraseña actual.";
    if (newPassword.length < 8) {
      errors.next = "La nueva contraseña debe tener al menos 8 caracteres.";
    }
    if (confirmPassword !== newPassword) {
      errors.confirm = "Las contraseñas no coinciden.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setBusy(true);
    // TODO: replace with real auth API — e.g. await changePassword({ current, next })
    await new Promise((resolve) => setTimeout(resolve, 600));
    setBusy(false);
    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-white/10 bg-[#050505] text-[#f3f4f6] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Cambiar contraseña</DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            Actualizá tu contraseña de acceso a GoodTrading. Por ahora es una vista de prueba —
            conectar con auth real próximamente.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs text-[#9ca3af]">Contraseña actual</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass(!!fieldErrors.current)}
              disabled={busy || success}
            />
            {fieldErrors.current && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.current}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#9ca3af]">Nueva contraseña</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass(!!fieldErrors.next)}
              disabled={busy || success}
              minLength={8}
            />
            {fieldErrors.next && <p className="mt-1 text-xs text-red-400">{fieldErrors.next}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#9ca3af]">Confirmar nueva contraseña</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass(!!fieldErrors.confirm)}
              disabled={busy || success}
              minLength={8}
            />
            {fieldErrors.confirm && (
              <p className="mt-1 text-xs text-red-400">{fieldErrors.confirm}</p>
            )}
          </div>

          {fieldErrors.form && (
            <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {fieldErrors.form}
            </p>
          )}

          {success && (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              Contraseña actualizada correctamente
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || success}
              className="rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Guardando…" : "Guardar contraseña"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
