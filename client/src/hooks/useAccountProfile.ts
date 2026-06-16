import { useMemo } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";

export type AccountStatus = "visitor" | "no_plan" | "active";

export type AccountProfile = {
  name: string;
  email: string;
  country: string;
};

export type SubscriptionSnapshot = {
  plan: string;
  active: boolean;
  daysRemaining: number;
  renewsAt: string | null;
};

function daysUntil(isoDate: string): number {
  const end = new Date(isoDate).getTime();
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function displayName(fullName: string | null | undefined, email: string): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  const local = email.split("@")[0]?.replace(/[._]/g, " ") ?? "Usuario";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Real auth snapshot for /account from GET /api/auth/me. */
export function useAccountProfile() {
  const { authReady, isAuthenticated, hasActiveSubscription } = usePlatformAccess();
  const { user, access, logout, emailVerified } = useTerminalAuth();

  const status: AccountStatus = useMemo(() => {
    if (!isAuthenticated) return "visitor";
    if (hasActiveSubscription) return "active";
    return "no_plan";
  }, [isAuthenticated, hasActiveSubscription]);

  const profile = useMemo<AccountProfile>(() => {
    if (status === "visitor") {
      return { name: "—", email: "—", country: "—" };
    }
    const email = user?.email ?? "—";
    return {
      name: email === "—" ? "—" : displayName(user?.fullName, email),
      email,
      country: "—",
    };
  }, [status, user?.email, user?.fullName]);

  const subscription = useMemo<SubscriptionSnapshot>(() => {
    const plan = access?.subscription?.planName ?? "GoodTrading Terminal";
    if (status !== "active") {
      return { plan, active: false, daysRemaining: 0, renewsAt: null };
    }

    const endsAt = access?.subscription?.endsAt;
    if (endsAt) {
      return {
        plan,
        active: true,
        daysRemaining: daysUntil(endsAt),
        renewsAt: formatDate(endsAt),
      };
    }

    return { plan, active: true, daysRemaining: 0, renewsAt: null };
  }, [status, access?.subscription]);

  const statusLabel =
    status === "active"
      ? "Cliente activo"
      : status === "no_plan"
        ? emailVerified === false
          ? "Email pendiente de verificación"
          : "Sin plan activo"
        : "Visitante";

  return {
    authReady,
    status,
    statusLabel,
    profile,
    subscription,
    logout,
    isAuthenticated,
    hasActiveSubscription,
    emailVerified,
  };
}
