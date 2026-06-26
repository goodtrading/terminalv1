import { MarketingSectionShell } from "./MarketingSectionShell";

const VALUE_ITEMS = [
  {
    title: "Identificá el régimen antes de operar",
    body: "Leé transición, flip, bias y estructura desde una sola vista.",
    accent: "from-[#ff3b3b]/20 to-transparent",
  },
  {
    title: "Ubicá zonas relevantes directamente en el gráfico",
    body: "Walls, niveles, transición y contexto operativo integrados al chart.",
    accent: "from-violet-600/20 to-transparent",
  },
  {
    title: "Prepará escenarios antes de ejecutar",
    body: "No esperar a ver qué pasa: entrar con contexto, timing y plan.",
    accent: "from-blue-600/20 to-transparent",
  },
  {
    title: "Practicá y revisá tu ejecución",
    body: "Paper trading y reports para convertir lectura en proceso.",
    accent: "from-emerald-600/15 to-transparent",
  },
];

export function AudienceSection() {
  return (
    <MarketingSectionShell
      className="py-16 sm:py-20"
      title="Tomá decisiones con contexto, no con indicadores atrasados"
      subtitle="GoodTrading Terminal organiza régimen, niveles y ejecución para que la lectura operativa tenga estructura antes de entrar al mercado."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_ITEMS.map((item) => (
          <article
            key={item.title}
            className="group relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#050505]/70 p-6 transition-colors hover:border-white/[0.14]"
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.accent} opacity-80`}
            />
            <div className="relative">
              <div className="mb-4 h-1 w-10 rounded-full bg-gradient-to-r from-[#ff3b3b] to-violet-600" />
              <h3 className="text-base font-semibold leading-snug text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#9ca3af]">{item.body}</p>
            </div>
          </article>
        ))}
      </div>
    </MarketingSectionShell>
  );
}
