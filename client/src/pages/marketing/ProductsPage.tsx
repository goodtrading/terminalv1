import { Link, useLocation } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { StatusBadge } from "@/components/marketing/StatusBadge";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { openDesktopDownload } from "@/lib/downloadDesktop";
import { cn } from "@/lib/utils";

const PRODUCTS = [
  {
    id: "web",
    title: "Terminal Web",
    badge: "available" as const,
    description:
      "Terminal en el navegador para leer Bitcoin con gamma, opciones, estructura, niveles, paper trading y reportes.",
    note: "Acceso inmediato desde el navegador.",
    cta: "Entrar a Terminal Web",
    action: "terminal" as const,
    featured: true,
  },
  {
    id: "desktop",
    title: "GoodTrading Desktop",
    badge: "desktop" as const,
    description:
      "Capa avanzada con Bookmap, heatmap completo, DOM avanzado y procesamiento local de datos.",
    note: "Pensada para setups más intensivos.",
    cta: "Descargar App Desktop",
    action: "download" as const,
    featured: false,
  },
  {
    id: "mobile",
    title: "Seguimiento móvil",
    badge: "soon" as const,
    description: "Alertas, watchlists y seguimiento de mercado desde el teléfono.",
    note: "Parte de la evolución del ecosistema GoodTrading.",
    cta: "En desarrollo",
    action: "disabled" as const,
    featured: false,
  },
];

const TOOL_GROUPS = [
  {
    title: "Contexto",
    accent: "from-[#ff3b3b]/15 to-transparent",
    items: [
      "Gamma Exposure",
      "Options Panel",
      "Volatility Panel",
      "Market Structure",
      "Zonas gamma integradas al gráfico",
      "Temporalidades intradía",
    ],
  },
  {
    title: "Ejecución",
    accent: "from-violet-600/15 to-transparent",
    items: ["Order Flow", "Operativa desde la terminal", "Paper Trading"],
  },
  {
    title: "Revisión",
    accent: "from-blue-600/15 to-transparent",
    items: ["Reports", "Journal operativo", "Track record"],
  },
] as const;

export default function ProductsPage() {
  const [, setLocation] = useLocation();
  const { terminalRedirect } = usePlatformAccess();

  const handleAction = (action: (typeof PRODUCTS)[number]["action"]) => {
    if (action === "terminal") setLocation(terminalRedirect);
    if (action === "download") openDesktopDownload("products_page");
  };

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-14 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff3b3b]/90">
            Productos GoodTrading
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-white sm:text-5xl">
            Leé Bitcoin con una terminal profesional
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[#9ca3af]">
            Terminal Web para acceso inmediato. GoodTrading Desktop agrega módulos avanzados para
            visualización, liquidez y procesamiento local.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {PRODUCTS.map((product) => (
            <article
              key={product.id}
              className={cn(
                "flex flex-col rounded-[22px] border bg-[#050505]/80 p-7 transition-all hover:border-white/[0.14]",
                product.featured
                  ? "border-[#ff3b3b]/25 shadow-[0_0_40px_rgba(255,59,59,0.08)]"
                  : "border-white/[0.08]",
              )}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-white">{product.title}</h2>
                <StatusBadge variant={product.badge}>
                  {product.badge === "available"
                    ? "Disponible"
                    : product.badge === "desktop"
                      ? "Desktop"
                      : "En desarrollo"}
                </StatusBadge>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-[#9ca3af]">{product.description}</p>
              <p className="mt-3 text-xs text-[#6b7280]">{product.note}</p>
              <button
                type="button"
                disabled={product.action === "disabled"}
                onClick={() => handleAction(product.action)}
                className={cn(
                  "mt-6 rounded-xl py-3 text-sm font-semibold transition-colors",
                  product.action === "disabled"
                    ? "cursor-not-allowed border border-white/10 text-[#6b7280]"
                    : product.featured
                      ? "bg-gradient-to-r from-[#ff3b3b] to-red-700 text-white hover:opacity-90"
                      : "border border-white/15 text-white hover:bg-white/[0.06]",
                )}
              >
                {product.cta}
              </button>
            </article>
          ))}
        </div>

        <div className="mt-14 rounded-[22px] border border-white/[0.08] bg-[#050505]/60 p-8 sm:p-10">
          <h3 className="text-2xl font-semibold text-white">Herramientas del ecosistema</h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#9ca3af]">
            GoodTrading organiza contexto, ejecución y revisión. La web concentra el flujo operativo
            principal; Desktop suma profundidad visual para setups avanzados.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {TOOL_GROUPS.map((group) => (
              <article
                key={group.title}
                className="relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#030303]/50 p-5"
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${group.accent}`}
                />
                <div className="relative">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-[#ff3b3b]/90">
                    {group.title}
                  </h4>
                  <ul className="mt-4 flex flex-col gap-2">
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs font-medium text-[#d1d5db]"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-6 text-xs leading-relaxed text-[#6b7280]">
            GoodTrading Desktop agrega Bookmap, heatmap completo, DOM avanzado, Modo Pro y
            procesamiento local para análisis más intensivo.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
          >
            ← Volver al inicio
          </Link>
          <button
            type="button"
            onClick={() => setLocation(terminalRedirect)}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Abrir Terminal Web
          </button>
          <button
            type="button"
            onClick={() => openDesktopDownload("products_footer")}
            className="inline-flex items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-6 py-3 text-sm font-semibold text-blue-200 hover:bg-blue-500/15"
          >
            Descargar App Desktop v0.1.7
          </button>
        </div>
      </div>
    </MarketingLayout>
  );
}
