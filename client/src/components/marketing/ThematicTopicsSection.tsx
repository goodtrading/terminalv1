import { Link } from "wouter";
import { MarketingSectionShell } from "./MarketingSectionShell";

const TOPICS = [
  {
    title: "Terminal de trading cripto",
    description:
      "GoodTrading Terminal concentra gamma, opciones, estructura, Order Flow y herramientas de revisión en un entorno pensado para Bitcoin. La idea es leer contexto, timing y ejecución sin saltar entre pestañas desconectadas.",
    href: "/terminal-trading-cripto",
    anchor: "Conocer la terminal de trading cripto",
  },
  {
    title: "Order Flow en Bitcoin",
    description:
      "El Order Flow muestra cómo se agrede y se absorbe liquidez. En GoodTrading se combina delta, CVD y lectura de agresión con estructura de mercado, para no interpretar cada imbalance como una señal aislada.",
    href: "/order-flow-bitcoin",
    anchor: "Aprender a leer el Order Flow de Bitcoin",
  },
  {
    title: "Gamma Exposure de Bitcoin",
    description:
      "La Gamma Exposure describe el sesgo de cobertura de dealers: flip, walls y régimen. En la terminal se usa como mapa de zonas y transiciones, siempre contrastado con precio y flujo de órdenes.",
    href: "/gamma-exposure-bitcoin",
    anchor: "Entender la Gamma Exposure de Bitcoin",
  },
  {
    title: "Heatmap de liquidez",
    description:
      "El heatmap visualiza liquidez resting, paredes y su persistencia. Ayuda a distinguir liquidez útil de ruido, pulling o spoofing, y se interpreta junto al DOM y al contexto operativo de Bitcoin.",
    href: "/heatmap-liquidez-bitcoin",
    anchor: "Analizar el heatmap de liquidez",
  },
] as const;

export function ThematicTopicsSection() {
  return (
    <MarketingSectionShell
      className="pb-6 pt-4 sm:pt-6"
      title="Todo el contexto de Bitcoin en una sola terminal"
      subtitle="GoodTrading Terminal reúne estructura de mercado, gamma, opciones, liquidez y herramientas de ejecución para que el análisis no dependa de una única señal aislada."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <article
            key={topic.href}
            className="flex flex-col rounded-[18px] border border-white/[0.09] bg-[#050505]/85 p-6"
          >
            <h3 className="text-lg font-semibold text-white">{topic.title}</h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-[#9ca3af]">{topic.description}</p>
            <Link
              href={topic.href}
              className="mt-5 inline-flex text-sm font-semibold text-[#ff8a8a] transition-colors hover:text-white"
            >
              {topic.anchor}
            </Link>
          </article>
        ))}
      </div>
    </MarketingSectionShell>
  );
}
