import { openWebForgotPassword } from "@/lib/webPasswordRecovery";

type DesktopWebForgotPasswordPromptProps = {
  onBack?: () => void;
};

export function DesktopWebForgotPasswordPrompt({ onBack }: DesktopWebForgotPasswordPromptProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
          GoodTrading
        </p>
        <h1 className="text-2xl font-bold text-white">Recuperar contraseña</h1>
        <p className="text-sm leading-relaxed text-[#9ca3af]">
          Por seguridad, la recuperación de cuenta se realiza desde la web de GoodTrading.
        </p>
      </div>

      <button
        type="button"
        onClick={() => openWebForgotPassword()}
        className="w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 py-3 text-sm font-semibold text-white"
      >
        Recuperar contraseña en la web
      </button>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-full text-sm font-medium text-blue-400 hover:text-blue-300"
        >
          Volver al inicio de sesión
        </button>
      )}
    </div>
  );
}
