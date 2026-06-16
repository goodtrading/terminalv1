import type { ReactNode } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { SubscriptionPage } from "@/pages/auth/SubscriptionPage";
import PendingApprovalScreen from "@/pages/auth/PendingApprovalScreen";
import AccountInactiveScreen from "@/pages/auth/AccountInactiveScreen";
import ExpiredSubscriptionScreen from "@/pages/auth/ExpiredSubscriptionScreen";
import {
  TerminalAccessBlockedPanel,
  type TerminalAccessBlockedVariant,
} from "@/components/marketing/TerminalAccessBlockedPanel";
import { isDesktopBuild } from "@/lib/desktopStorage";
import {
  DesktopConnectionErrorScreen,
  DesktopLoadingScreen,
} from "@/pages/auth/DesktopBootScreens";

function reasonToVariant(reason: string): TerminalAccessBlockedVariant {
  switch (reason) {
    case "pending_approval":
      return "pending_approval";
    case "inactive":
      return "inactive";
    case "expired":
      return "expired";
    case "no_subscription":
      return "no_subscription";
    case "approved_to_pay":
      return "approved_to_pay";
    case "pending_payment_review":
      return "payment_review";
    default:
      return "generic";
  }
}

export default function BlockedAccessScreen({ children }: { children: ReactNode }) {
  const { saasDisabled, authReady, authenticated, user, access, authError, refreshSession } =
    useTerminalAuth();

  if (!authReady) {
    if (isDesktopBuild) {
      return <DesktopLoadingScreen />;
    }
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#030303] text-sm text-[#9ca3af]">
        Cargando sesión…
      </div>
    );
  }

  if (isDesktopBuild && authError && !authenticated) {
    return (
      <DesktopConnectionErrorScreen
        detail={authError}
        onRetry={() => {
          void refreshSession();
        }}
      />
    );
  }

  if (saasDisabled) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#030303] px-6 text-[#f3f4f6]">
        <div className="max-w-md space-y-3 rounded-[22px] border border-white/[0.09] bg-[#050505]/90 p-6 text-center">
          <h1 className="text-lg font-bold text-white">Servicio de acceso no disponible</h1>
          <p className="text-sm leading-relaxed text-[#9ca3af]">
            El servidor no tiene conexión a base de datos. Login y suscripciones están deshabilitados
            hasta que SaaS esté configurado.
          </p>
        </div>
      </div>
    );
  }

  if (!authenticated || !user) {
    return <TerminalAccessBlockedPanel variant="login_required" />;
  }

  if (user.emailVerified === false) {
    return <TerminalAccessBlockedPanel variant="email_unverified" />;
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
      return <ExpiredSubscriptionScreen />;
    }
    if (reason === "no_subscription") {
      return <SubscriptionPage />;
    }
    return <TerminalAccessBlockedPanel variant={reasonToVariant(reason)} />;
  }

  return <>{children}</>;
}
