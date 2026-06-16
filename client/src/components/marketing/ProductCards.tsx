import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { openDesktopDownload } from "@/lib/downloadDesktop";

const TOOLS = [
  "Gamma Exposure",
  "Options Panel",
  "Market Structure",
  "Order Flow",
  "Liquidity / Bookmap Desktop",
];

function CardShell({
  title,
  badge,
  children,
  className,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group flex flex-col rounded-[20px] border border-white/[0.08] bg-[#050505]/75 p-7 shadow-[0_8px_40px_rgba(0,0,0,0.35)] transition-all duration-300 hover:border-white/[0.14] hover:shadow-[0_12px_48px_rgba(255,59,59,0.06)]",
        className,
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        {badge}
      </div>
      <div className="mt-3 flex flex-1 flex-col space-y-5 text-sm leading-relaxed text-[#9ca3af]">
        {children}
      </div>
    </article>
  );
}

export function ProductCards() {
  const [, setLocation] = useLocation();
  const { terminalRedirect } = usePlatformAccess();

  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-8">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold text-white">Plataforma GoodTrading</h2>
        <p className="mt-3 text-base leading-relaxed text-[#9ca3af]">
          Web liviana para operar desde el navegador. Desktop para Bookmap, heatmap avanzado y
          procesamiento local.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <CardShell title="Terminal Web">
          <p>
            Acceso rápido desde navegador. Gamma, opciones, estructura de mercado y herramientas
            esenciales sin instalar nada.
          </p>
          <p className="text-xs text-[#6b7280]">Versión web liviana — sin Bookmap pesado.</p>
          <button
            type="button"
            onClick={() => setLocation(terminalRedirect)}
            className="mt-auto w-full rounded-xl bg-gradient-to-r from-[#ff3b3b]/90 to-red-700/90 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Entrar a Terminal Web
          </button>
        </CardShell>

        <CardShell title="App Desktop">
          <p>
            Versión descargable para Windows con módulos avanzados: Bookmap, heatmap de liquidez, DOM
            avanzado y procesamiento local.
          </p>
          <p className="text-xs text-blue-300/80">Incluye Bookmap / Heatmap completo.</p>
          <button
            type="button"
            onClick={() => openDesktopDownload("home_card_desktop")}
            className="mt-auto w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
          >
            Descargar App Desktop
          </button>
        </CardShell>

        <CardShell title="App Móvil">
          <p>Alertas, watchlists y seguimiento de mercado. En desarrollo.</p>
          <button
            type="button"
            disabled
            className="mt-auto w-full cursor-not-allowed rounded-xl border border-white/10 py-3 text-sm font-medium text-[#6b7280]"
          >
            Próximamente
          </button>
        </CardShell>

        <CardShell title="Herramientas">
          <ul className="space-y-2">
            {TOOLS.map((tool) => (
              <li
                key={tool}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-[#d1d5db]"
              >
                {tool}
              </li>
            ))}
          </ul>
          <Link
            href="/products"
            className="mt-auto text-center text-sm font-medium text-blue-400 hover:text-blue-300"
          >
            Ver todos los productos →
          </Link>
        </CardShell>
      </div>
    </section>
  );
}
