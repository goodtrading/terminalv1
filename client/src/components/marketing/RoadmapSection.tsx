import { MarketingSectionShell } from "./MarketingSectionShell";
import { StatusBadge } from "./StatusBadge";

const ROADMAP = {
  available: [
    "Terminal Web liviana",
    "Gamma Exposure",
    "Options Panel",
    "Market Structure",
    "App Desktop v0.1.7",
  ],
  development: [
    "Bookmap avanzado",
    "Heatmap completo",
    "DOM avanzado",
    "Procesamiento local",
  ],
  soon: [
    "Modo Pro — gráfico limpio",
    "Footprint",
    "ETH",
    "NASDAQ",
    "SPX",
    "XAUUSD",
    "App móvil",
    "Watchlists",
    "Alertas",
  ],
};

function RoadmapColumn({
  title,
  variant,
  items,
}: {
  title: string;
  variant: "available" | "development" | "soon";
  items: string[];
}) {
  const badgeLabel =
    variant === "available" ? "Disponible" : variant === "development" ? "En desarrollo" : "Próximamente";

  return (
    <article className="rounded-[20px] border border-white/[0.08] bg-[#050505]/70 p-6">
      <StatusBadge variant={variant === "development" ? "development" : variant}>
        {badgeLabel}
      </StatusBadge>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-sm text-[#b0b8c4]"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff3b3b]/80" />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function RoadmapSection() {
  return (
    <MarketingSectionShell className="py-16 sm:py-20" title="Roadmap GoodTrading">
      <div className="grid gap-5 lg:grid-cols-3">
        <RoadmapColumn title="Disponible ahora" variant="available" items={ROADMAP.available} />
        <RoadmapColumn title="Desktop / en desarrollo" variant="development" items={ROADMAP.development} />
        <RoadmapColumn title="Próximamente" variant="soon" items={ROADMAP.soon} />
      </div>
    </MarketingSectionShell>
  );
}
