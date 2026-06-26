import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { SubscriptionPage } from "@/pages/auth/SubscriptionPage";

function TerminalGateRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/terminal");
  }, [setLocation]);
  return null;
}

/** Authenticated users without subscription see the existing checkout flow. */
export default function PricingPage() {
  const { authReady, authenticated, access } = useTerminalAuth();

  if (!authReady) {
    return (
      <MarketingLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#9ca3af]">
          Cargando...
        </div>
      </MarketingLayout>
    );
  }

  if (authenticated && access && !access.allowed) {
    const reason = access.reason || "inactive";
    if (reason === "no_subscription" || reason === "expired") {
      return <SubscriptionPage />;
    }
    return <TerminalGateRedirect />;
  }

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8 text-center sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff3b3b]/80">
            Acceso a GoodTrading Terminal
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">USD 25 / mes</h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[#9ca3af]">
            Acceso mensual a la Terminal Web para leer Bitcoin con gamma, opciones, estructura y
            niveles operativos.
          </p>

          <div className="mx-auto mt-8 max-w-sm rounded-xl border border-white/[0.08] bg-black/30 p-5">
            <p className="text-sm font-medium text-white">Incluye</p>
            <ul className="mt-4 space-y-2 text-left text-xs text-[#9ca3af]">
              <li>• Terminal Web BTC</li>
              <li>• Gamma + Options + Market Structure</li>
              <li>• Niveles integrados al chart</li>
              <li>• Paper Trading + Reports</li>
              <li>• Actualizaciones del producto</li>
            </ul>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Crear cuenta
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
            >
              Entrar a Terminal Web
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
