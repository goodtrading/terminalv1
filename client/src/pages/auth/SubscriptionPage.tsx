import { useState, useCallback } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";

const PLAN_PRICE = "$25 USD / mes";
const PAYPAL_LINK = "https://www.paypal.com/ncp/payment/4VPWL3R9MPVHS";
const USDT_ADDRESS = "0xb0e2ef9d8f730c047c631fe4941d3117268d5365";

export function SubscriptionPage() {
  const { logout, refreshSession } = useTerminalAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePayPalClick = useCallback(() => {
    window.open(PAYPAL_LINK, "_blank");
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
    <div className="min-h-screen w-full bg-terminal-bg text-terminal-text px-4 py-8 overflow-y-auto">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold tracking-wide text-white">Activar suscripción</h1>
          <p className="text-sm text-terminal-muted font-mono">
            Necesitás una suscripción activa para acceder al terminal.
          </p>
        </div>

        {/* Institutional access info */}
        <div className="border border-white/10 bg-black/30 rounded-sm px-4 py-3.5 text-center space-y-1.5">
          <p className="text-sm font-medium text-white">Acceso al terminal institucional</p>
          <p className="text-xs text-terminal-muted font-mono leading-relaxed">
            Acceso completo a herramientas profesionales de trading y análisis en tiempo real.
          </p>
          <p className="text-[11px] text-terminal-muted/80 font-mono">
            Activación manual para garantizar control y calidad del entorno.
          </p>
        </div>

        {/* Main plan card */}
        <section className="border border-white/12 bg-terminal-panel rounded-sm p-4">
          <p className="text-[10px] tracking-[0.2em] uppercase text-terminal-muted font-mono mb-1">Plan</p>
          <h2 className="text-lg font-bold text-white mb-1">GoodTrading Membership</h2>
          <p className="text-sm font-mono text-red-400/95 mb-4">{PLAN_PRICE}</p>
          <ul className="space-y-2 text-xs text-terminal-muted font-mono">
            <li className="flex items-start gap-2">
              <span className="text-red-500/80">•</span>
              <span>Acceso completo al sistema</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500/80">•</span>
              <span>Señales + análisis institucional</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500/80">•</span>
              <span>Operativa en tiempo real</span>
            </li>
          </ul>
        </section>

        {/* Primary CTA: PayPal */}
        <section className="space-y-3">
          <p className="text-[10px] tracking-wider uppercase text-terminal-muted font-mono">Activar acceso ahora</p>
          <p className="text-[10px] text-terminal-muted font-mono">Método recomendado</p>
          <button
            type="button"
            onClick={handlePayPalClick}
            className="block w-full py-3 text-center text-sm font-bold tracking-wider rounded-sm border border-red-600/80 bg-red-600/20 text-white hover:bg-red-600/30 hover:border-red-500/90 transition-colors"
          >
            Pagar con PayPal
          </button>
          <div className="space-y-0.5 text-[11px] text-terminal-muted font-mono">
            <p>El acceso puede cerrarse en cualquier momento</p>
            <p>Pago seguro • Activación en minutos</p>
            <p>+120 traders activos</p>
          </div>
        </section>

        {/* Secondary: USDT */}
        <section className="border border-white/10 bg-terminal-panel/50 rounded-sm p-4 space-y-3">
          <p className="text-[10px] tracking-wider uppercase text-terminal-muted font-mono">Opción alternativa</p>
          <p className="text-sm font-medium text-white">Pagar con USDT</p>
          <p className="text-[11px] text-terminal-muted font-mono">
            Recomendado para pagos sin comisiones
          </p>
          <div className="space-y-2">
            <p className="text-[10px] text-terminal-muted font-mono">USDT (BEP20):</p>
            <div className="bg-black/50 border border-white/10 rounded-sm px-3 py-2.5 font-mono text-xs text-white/90 break-all">
              {USDT_ADDRESS}
            </div>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="w-full py-2 text-xs font-mono border border-white/20 rounded-sm text-white/80 hover:bg-white/5 hover:border-white/30 transition-colors"
            >
              {copied ? "Copiado" : "Copiar dirección"}
            </button>
          </div>
        </section>

        {/* Payment instructions */}
        <div className="border-l-2 border-red-500/50 bg-red-950/15 px-3 py-2 rounded-r-sm space-y-2">
          <p className="text-[11px] text-amber-200/90 font-mono">
            ⚠️ Enviar únicamente USDT en red BEP20 (BSC). No enviar por otras redes (ERC20, TRC20), se perderán los fondos.
          </p>
          <p className="text-[11px] text-terminal-muted font-mono">
            Una vez realizado el pago, enviá el comprobante para activar tu acceso.
          </p>
        </div>

        {/* Final actions */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            type="button"
            onClick={handleRefreshAccess}
            disabled={refreshing}
            className="w-full py-2.5 text-xs font-mono font-medium border border-white/25 rounded-sm text-white/90 hover:bg-white/5 hover:border-white/35 disabled:opacity-50 transition-colors"
          >
            {refreshing ? "Verificando…" : "Ya realicé el pago — desbloquear acceso"}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="text-[11px] font-mono text-terminal-muted hover:text-white/80 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
