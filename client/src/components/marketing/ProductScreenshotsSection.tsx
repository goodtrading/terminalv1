import { MarketingSectionShell } from "./MarketingSectionShell";

const SCREENSHOTS = [
  {
    title: "Contexto institucional en tiempo real",
    description: "Leé régimen, niveles, transición y timing operativo directamente sobre el gráfico.",
    src: "/screenshots/hero-terminal.png",
    placeholder: "Terminal principal",
    featured: true,
  },
  {
    title: "Options Panel BTC",
    description: "Call walls, put walls, ATM, max volume y zonas relevantes en una sola vista.",
    src: "/screenshots/feature-options.png",
    placeholder: "Options Panel BTC",
  },
  {
    title: "Paper trading y reportes",
    description: "Practicá, revisá ejecución y documentá sesiones dentro de la terminal.",
    src: "/screenshots/feature-reports.png",
    placeholder: "Paper trading y reportes",
  },
];

export function ProductScreenshotsSection() {
  return (
    <MarketingSectionShell
      className="py-14 sm:py-18"
      title="GoodTrading Terminal en producto real"
      subtitle="Una terminal sobria para leer Bitcoin, preparar escenarios y revisar ejecución sin saltar entre herramientas."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {SCREENSHOTS.map((item) => (
          <article
            key={item.title}
            className={`overflow-hidden rounded-[14px] border border-white/[0.10] bg-[#050505]/90 shadow-[0_24px_80px_rgba(0,0,0,0.36)] ${
              item.featured ? "lg:col-span-2" : ""
            }`}
          >
            <div
              className={`relative border-b border-white/[0.08] bg-[#080808] ${
                item.featured ? "aspect-[24/10]" : "aspect-[16/9]"
              }`}
            >
              <img
                src={item.src}
                alt={item.title}
                className="h-full w-full object-contain"
                onLoad={(event) => {
                  const placeholder = event.currentTarget.nextElementSibling as HTMLElement | null;
                  if (placeholder) placeholder.style.display = "none";
                }}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <div className="absolute inset-0 grid place-items-center bg-[#080808]">
                <div className="rounded border border-white/[0.12] bg-black/70 px-4 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9ca3af]">
                    Screenshot pendiente
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{item.placeholder}</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </MarketingSectionShell>
  );
}
