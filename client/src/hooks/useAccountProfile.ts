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

const MOCK_PROFILE: AccountProfile = {
  name: "Nicolas Trader",
  email: "demo@goodtrading.io",
  country: "Argentina",
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

/** Mock + real auth snapshot for /account — no backend yet. */
export function useAccountProfile() {
  const { authReady, isAuthenticated, hasActiveSubscription } = usePlatformAccess();
  const { user, access, logout } = useTerminalAuth();

  const status: AccountStatus = useMemo(() => {
    if (!isAuthenticated) return "visitor";
    if (hasActiveSubscription) return "active";
    return "no_plan";
  }, [isAuthenticated, hasActiveSubscription]);

  const profile = useMemo<AccountProfile>(() => {
    if (status === "visitor") {
      return { name: "—", email: "—", country: "—" };
    }
    const email = user?.email ?? MOCK_PROFILE.email;
    const nameFromEmail = email.split("@")[0]?.replace(/[._]/g, " ") ?? MOCK_PROFILE.name;
    return {
      name: nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1),
      email,
      country: MOCK_PROFILE.country,
    };
  }, [status, user?.email]);

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

    const mockEnd = new Date();
    mockEnd.setDate(mockEnd.getDate() + 27);
    return {
      plan,
      active: true,
      daysRemaining: 27,
      renewsAt: formatDate(mockEnd.toISOString()),
    };
  }, [status, access?.subscription]);

  const statusLabel =
    status === "active"
      ? "Cliente activo"
      : status === "no_plan"
        ? "Sin plan activo"
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
  };
}
