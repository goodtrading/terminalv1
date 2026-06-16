import { useLocation } from "wouter";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "GoodTradingpay@gmail.com";

export type TerminalAccessBlockedVariant =
  | "login_required"
  | "pending_approval"
  | "inactive"
  | "no_subscription"
  | "expired"
  | "payment_review"
  | "approved_to_pay"
  | "generic";

type VariantConfig = {
  eyebrow: string;
  title: string;
  text: string;
  detail?: string;
  showAccount: boolean;
  showSupportFooter: boolean;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryAction: "home" | "logout";
};

const VARIANTS: Record<TerminalAccessBlockedVariant, VariantConfig> = {
  login_required: {
    eyebrow: "Terminal Web",
    title: "Iniciá sesión para continuar",
    text: "Necesitás iniciar sesión para acceder a la Terminal Web.",
    showAccount: false,
    showSupportFooter: false,
    primaryLabel: "Iniciar sesión",
    primaryHref: "/login",
    secondaryLabel: "Volver al inicio",
    secondaryAction: "home",
  },
  pending_approval: {
    eyebrow: "Terminal Web",
    title: "Acceso a Terminal Web pendiente",
    text: "Tu cuenta fue creada correctamente, pero todavía no tenés acceso activo a la Terminal Web.",
    detail:
      "El acceso se habilita cuando tu cuenta queda aprobada o cuando se activa una suscripción.",
    showAccount: true,
    showSupportFooter: true,
    primaryLabel: "Volver al inicio",
    primaryHref: "/",
    secondaryLabel: "Cerrar sesión",
    secondaryAction: "logout",
  },
  inactive: {
    eyebrow: "Terminal Web",
    title: "Cuenta inactiva",
    text: "Tu cuenta está inactiva o fue deshabilitada. No podés acceder a la Terminal Web en este momento.",
    detail: "Si creés que esto es un error, contactá al soporte de GoodTrading.",
    showAccount: true,
    showSupportFooter: true,
    primaryLabel: "Volver al inicio",
    primaryHref: "/",
    secondaryLabel: "Cerrar sesión",
    secondaryAction: "logout",
  },
  no_subscription: {
    eyebrow: "Terminal Web",
    title: "Activá tu acceso",
    text: "Necesitás una suscripción activa para acceder a la Terminal Web.",
    showAccount: true,
    showSupportFooter: true,
    primaryLabel: "Ver planes",
    primaryHref: "/pricing",
    secondaryLabel: "Volver al inicio",
    secondaryAction: "home",
  },
  expired: {
    eyebrow: "Terminal Web",
    title: "Activá tu acceso",
    text: "Tu suscripción venció. Necesitás renovar tu acceso para volver a usar la Terminal Web.",
    showAccount: true,
    showSupportFooter: true,
    primaryLabel: "Ver planes",
    primaryHref: "/pricing",
    secondaryLabel: "Cerrar sesión",
    secondaryAction: "logout",
  },
  approved_to_pay: {
    eyebrow: "Terminal Web",
    title: "Activá tu acceso",
    text: "Tu cuenta fue aprobada. Para acceder a la Terminal Web, activá una suscripción.",
    showAccount: true,
    showSupportFooter: true,
    primaryLabel: "Ver planes",
    primaryHref: "/pricing",
    secondaryLabel: "Volver al inicio",
    secondaryAction: "home",
  },
  payment_review: {
    eyebrow: "Terminal Web",
    title: "Acceso a Terminal Web pendiente",
    text: "Recibimos tu solicitud de pago. Tu acceso se habilitará cuando el pago quede confirmado.",
    detail:
      "El acceso se habilita cuando tu cuenta queda aprobada o cuando se activa una suscripción.",
    showAccount: true,
    showSupportFooter: true,
    primaryLabel: "Volver al inicio",
    primaryHref: "/",
    secondaryLabel: "Cerrar sesión",
    secondaryAction: "logout",
  },
  generic: {
    eyebrow: "Terminal Web",
    title: "Acceso a Terminal Web pendiente",
    text: "Tu cuenta no tiene acceso activo a la Terminal Web en este momento.",
    detail:
      "El acceso se habilita cuando tu cuenta queda aprobada o cuando se activa una suscripción.",
    showAccount: true,
    showSupportFooter: true,
    primaryLabel: "Volver al inicio",
    primaryHref: "/",
    secondaryLabel: "Cerrar sesión",
    secondaryAction: "logout",
  },
};

type TerminalAccessBlockedPanelProps = {
  variant: TerminalAccessBlockedVariant;
  userEmail?: string | null;
};

export function TerminalAccessBlockedPanel({
  variant,
  userEmail,
}: TerminalAccessBlockedPanelProps) {
  const [, setLocation] = useLocation();
  const { user, logout } = useTerminalAuth();
  const config = VARIANTS[variant];
  const email = userEmail ?? user?.email;

  const handlePrimary = () => setLocation(config.primaryHref);

  const handleSecondary = () => {
    if (config.secondaryAction === "logout") {
      logout();
      setLocation("/login");
      return;
    }
    setLocation("/");
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#030303] text-[#f3f4f6]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[360px] w-[360px] rounded-full bg-[#ff3b3b]/8 blur-[120px]" />
        <div className="absolute top-1/3 -right-16 h-[280px] w-[280px] rounded-full bg-violet-600/10 blur-[100px]" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-[22px] border border-white/[0.09] bg-[#050505]/90 p-8 shadow-[0_0_48px_rgba(255,59,59,0.07)]">
          <div className="mb-8 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
              {config.eyebrow}
            </p>
            <h1 className="text-2xl font-bold leading-tight text-white">{config.title}</h1>
            <p className="text-sm leading-relaxed text-[#9ca3af]">{config.text}</p>
            {config.detail && (
              <p className="text-sm leading-relaxed text-[#6b7280]">{config.detail}</p>
            )}
            {config.showAccount && email && (
              <p className="pt-1 text-sm text-[#9ca3af]">
                Cuenta:{" "}
                <span className="font-medium text-white">{email}</span>
              </p>
            )}
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handlePrimary}
              className={cn(
                "w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700",
                "py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90",
              )}
            >
              {config.primaryLabel}
            </button>
            <button
              type="button"
              onClick={handleSecondary}
              className="w-full rounded-xl border border-white/15 bg-white/[0.04] py-3 text-sm font-medium text-[#d1d5db] transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
            >
              {config.secondaryLabel}
            </button>
          </div>

          <div className="mt-6 space-y-2 text-center">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-sm font-medium text-blue-400 transition-colors hover:text-blue-300"
            >
              ¿Necesitás ayuda? Contactar soporte
            </a>
            {config.showSupportFooter && (
              <p className="text-xs leading-relaxed text-[#6b7280]">
                Si creés que esto es un error, contactá al soporte de GoodTrading.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
