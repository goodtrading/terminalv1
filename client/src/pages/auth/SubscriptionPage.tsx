import { useState, useCallback, type ReactNode } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { cn } from "@/lib/utils";

const PLAN_PRICE = "$25 USD / mes";
const PAYPAL_LINK = "https://www.paypal.com/ncp/payment/4VPWL3R9MPVHS";
const USDT_ADDRESS = "0xb0e2ef9d8f730c047c631fe4941d3117268d5365";
const SUPPORT_EMAIL = "GoodTradingpay@gmail.com";

const PLAN_BENEFITS = [
  "Terminal Web",
  "Gamma Exposure",
  "Options Panel",
  "Volatility Panel",
  "Market Structure",
  "Zonas gamma integradas al gráfico",
  "Operativa en tiempo real",
  "Paper Trading",
  "Backtesting y Reports",
  "Acceso a actualizaciones de producto",
];

function CardShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-6 shadow-[0_0_40px_rgba(255,59,59,0.05)] sm:p-7",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SubscriptionPage() {
  const { logout, refreshSession } = useTerminalAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePayPalClick = useCallback(() => {
    void openExternalUrl(PAYPAL_LINK, { source: "paypal_subscription" }).catch((error) => {
      console.warn("[Subscription PayPal]", error);
    });
  }, []);

  const handleCopyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(USDT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }, []);

  const handleRefreshAccess = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSession();
    } finally {
      setRefreshing(false);
    }
  }, [refreshSession]);

  return (
    <MarketingLayout>
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="mx-auto mb-10 max-w-3xl text-center lg:mb-12">
          <span className="inline-flex rounded-full border border-[#ff3b3b]/30 bg-[#ff3b3b]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#ff8a8a]">
            GoodTrading Membership
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Activá tu acceso a GoodTrading
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#9ca3af] sm:text-lg">
            Accedé a la Terminal Web y a las herramientas profesionales de análisis, ejecución y
            seguimiento.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <CardShell>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
              Plan
            </p>
            <h2 className="mt-2 text-2xl font-bold text-white">GoodTrading Membership</h2>
            <p className="mt-3 text-3xl font-bold text-white">{PLAN_PRICE}</p>
            <p className="mt-2 text-sm text-[#9ca3af]">Acceso mensual a la plataforma GoodTrading.</p>

            <ul className="mt-6 space-y-2.5">
              {PLAN_BENEFITS.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-[#d1d5db]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff3b3b]/80" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
              <p className="text-sm leading-relaxed text-[#9ca3af]">
                La App Desktop incluye módulos avanzados como Bookmap, Heatmap, DOM avanzado, Modo
                Pro y procesamiento local.
              </p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-[#6b7280]">
              La activación puede requerir validación manual para mantener la calidad y seguridad del
              entorno.
            </p>
          </CardShell>

          <div className="space-y-6">
            <CardShell>
              <h3 className="text-lg font-semibold text-white">Pagar con PayPal</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">
                Método recomendado para activar tu acceso de forma rápida.
              </p>
              <button
                type="button"
                onClick={handlePayPalClick}
                className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Pagar con PayPal
              </button>
              <p className="mt-4 text-center text-xs text-[#6b7280]">
                Pago seguro · Activación en minutos · Podés cancelar en cualquier momento
              </p>
            </CardShell>

            <CardShell>
              <h3 className="text-lg font-semibold text-white">Pagar con USDT</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">
                Opción alternativa para pagos cripto sin comisiones de tarjeta.
              </p>

              <div className="mt-5 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">Red</p>
                  <p className="mt-1 text-sm font-medium text-white">USDT BEP20 / BSC</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">
                    Dirección
                  </p>
                  <div className="mt-2 rounded-xl border border-white/[0.1] bg-black/40 px-3 py-3 font-mono text-xs leading-relaxed text-white/90 break-all">
                    {USDT_ADDRESS}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-sm font-medium text-[#d1d5db] transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                >
                  {copied ? "Copiado" : "Copiar dirección"}
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                <p className="text-xs leading-relaxed text-amber-100/90">
                  Enviar únicamente USDT en red BEP20 (BSC). No enviar por otras redes como ERC20 o
                  TRC20; los fondos podrían perderse.
                </p>
              </div>
            </CardShell>

            <CardShell>
              <button
                type="button"
                onClick={handleRefreshAccess}
                disabled={refreshing}
                className="w-full rounded-xl border border-white/20 bg-white/[0.06] py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.1] disabled:opacity-50"
              >
                {refreshing ? "Verificando…" : "Ya realicé el pago — desbloquear acceso"}
              </button>
              <p className="mt-3 text-center text-sm leading-relaxed text-[#9ca3af]">
                Después de pagar, enviá el comprobante para que tu acceso sea activado.
              </p>
              <div className="mt-4 text-center">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-sm font-medium text-blue-400 transition-colors hover:text-blue-300"
                >
                  Contactar soporte de pagos
                </a>
              </div>
            </CardShell>

            <div className="text-center">
              <button
                type="button"
                onClick={() => logout()}
                className="text-sm text-[#6b7280] transition-colors hover:text-[#9ca3af]"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
