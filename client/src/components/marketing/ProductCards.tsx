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

export function ProductCards() {
  const [, setLocation] = useLocation();
  const { terminalRedirect } = usePlatformAccess();

  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-8">
      <div className="mb-12 max-w-3xl">
        <h2 className="text-3xl font-bold text-white sm:text-4xl">Plataforma GoodTrading</h2>
        <p className="mt-3 text-base leading-relaxed text-[#9ca3af] sm:text-lg">
          Web liviana para operar desde el navegador. Desktop para Bookmap, heatmap avanzado y
          procesamiento local.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <article className="flex min-h-[360px] flex-col rounded-[18px] border border-white/[0.08] bg-[#050505]/75 p-7">
          <h3 className="text-xl font-semibold text-white">Terminal Web</h3>
          <p className="mt-5 text-sm leading-relaxed text-[#9ca3af]">
            Acceso rápido desde navegador. Gamma, opciones, estructura de mercado y herramientas
            esenciales sin instalar nada.
          </p>
          <p className="mt-6 text-xs leading-relaxed text-[#6b7280]">
            Versión web liviana — sin Bookmap pesado.
          </p>
          <button
            type="button"
            onClick={() => setLocation(terminalRedirect)}
            className="mt-auto rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Entrar a Terminal Web
          </button>
        </article>

        <article className="flex min-h-[360px] flex-col rounded-[18px] border border-white/[0.08] bg-[#050505]/75 p-7">
          <h3 className="text-xl font-semibold text-white">App Desktop</h3>
          <p className="mt-5 text-sm leading-relaxed text-[#9ca3af]">
            Versión descargable para Windows con módulos avanzados: Bookmap, heatmap de liquidez,
            DOM avanzado y procesamiento local.
          </p>
          <p className="mt-6 text-xs font-semibold text-blue-300">
            Incluye Bookmap / Heatmap completo.
          </p>
          <button
            type="button"
            onClick={() => openDesktopDownload("platform_panel")}
            className="mt-auto rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
          >
            Descargar App Desktop
          </button>
        </article>

        <article className="flex min-h-[360px] flex-col rounded-[18px] border border-white/[0.08] bg-[#050505]/75 p-7">
          <h3 className="text-xl font-semibold text-white">App Móvil</h3>
          <p className="mt-5 text-sm leading-relaxed text-[#9ca3af]">
            Alertas, watchlists y seguimiento de mercado. En desarrollo.
          </p>
          <button
            type="button"
            disabled
            className="mt-auto cursor-not-allowed rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-[#6b7280]"
          >
            Próximamente
          </button>
        </article>

        <article className="flex min-h-[360px] flex-col rounded-[18px] border border-white/[0.08] bg-[#050505]/75 p-7">
          <h3 className="text-xl font-semibold text-white">Herramientas</h3>
          <ul className="mt-5 flex flex-col gap-2">
            {TOOLS.map((tool) => (
              <li
                key={tool}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-xs font-semibold text-[#d1d5db]"
              >
                {tool}
              </li>
            ))}
          </ul>
          <Link
            href="/products"
            className={cn("mt-auto text-sm font-semibold text-blue-400 hover:text-blue-300")}
          >
            Ver todos los productos →
          </Link>
        </article>
      </div>
    </section>
  );
}
