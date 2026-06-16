import { MarketingSectionShell } from "./MarketingSectionShell";

const AUDIENCE_ITEMS = [
  {
    title: "Gamma + opciones + estructura",
    body: "Operar con Gamma, opciones y estructura de mercado en un solo entorno.",
    accent: "from-[#ff3b3b]/20 to-transparent",
  },
  {
    title: "Escenarios antes del precio",
    body: "Preparar escenarios antes de que el precio llegue a la zona clave.",
    accent: "from-violet-600/20 to-transparent",
  },
  {
    title: "Liquidez relevante",
    body: "Detectar zonas de liquidez relevantes sin depender solo del chart tradicional.",
    accent: "from-blue-600/20 to-transparent",
  },
  {
    title: "Gamma + order flow",
    body: "Combinar lectura macro de gamma con ejecución de order flow.",
    accent: "from-[#ff3b3b]/15 to-transparent",
  },
  {
    title: "Más allá de indicadores",
    body: "Evitar depender solamente de indicadores atrasados.",
    accent: "from-violet-600/15 to-transparent",
  },
  {
    title: "Contexto · timing · ejecución",
    body: "Separar contexto, timing y ejecución con claridad institucional.",
    accent: "from-blue-600/15 to-transparent",
  },
];

export function AudienceSection() {
  return (
    <MarketingSectionShell
      className="py-16 sm:py-20"
      title="Para traders que quieren leer Bitcoin con contexto institucional"
      subtitle="GoodTrading une régimen de mercado, niveles operativos y flujo para tomar decisiones con ventaja estructural."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUDIENCE_ITEMS.map((item) => (
          <article
            key={item.title}
            className="group relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#050505]/70 p-6 transition-colors hover:border-white/[0.14]"
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.accent} opacity-80`}
            />
            <div className="relative">
              <div className="mb-3 h-1 w-10 rounded-full bg-gradient-to-r from-[#ff3b3b] to-violet-600" />
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9ca3af]">{item.body}</p>
            </div>
          </article>
        ))}
      </div>
    </MarketingSectionShell>
  );
}
