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
  desktop: [
    "Bookmap avanzado",
    "Heatmap completo",
    "DOM avanzado",
    "Procesamiento local",
  ],
  future: [
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
  badge,
  badgeVariant,
  title,
  items,
}: {
  badge: string;
  badgeVariant: "available" | "development" | "soon";
  title: string;
  items: string[];
}) {
  return (
    <article className="min-h-[395px] rounded-[18px] border border-white/[0.08] bg-[#050505]/70 p-6">
      <StatusBadge variant={badgeVariant}>{badge}</StatusBadge>
      <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-[#b0b8c4]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff3b3b]" />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function DesktopSection() {
  return (
    <MarketingSectionShell className="py-16 sm:py-20" title="Roadmap GoodTrading">
      <div className="grid gap-5 lg:grid-cols-3">
        <RoadmapColumn
          badge="Disponible"
          badgeVariant="available"
          title="Disponible ahora"
          items={ROADMAP.available}
        />
        <RoadmapColumn
          badge="En desarrollo"
          badgeVariant="development"
          title="Desktop / en desarrollo"
          items={ROADMAP.desktop}
        />
        <RoadmapColumn
          badge="Próximamente"
          badgeVariant="soon"
          title="Próximamente"
          items={ROADMAP.future}
        />
      </div>
    </MarketingSectionShell>
  );
}
