import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { DynamicCtaButtons } from "./DynamicCtaButtons";

type AccessCTAProps = {
  className?: string;
};

const HERO_BULLETS = [
  "Gamma y niveles integrados al chart",
  "Options Panel BTC",
  "Paper trading y reportes",
  "Terminal lista para usar desde el navegador",
];

export function AccessCTA({ className }: AccessCTAProps) {
  return (
    <section className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#050505] px-8 py-14 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,59,59,0.12),transparent_42%,rgba(34,197,94,0.06))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#ff3b3b]/60 to-transparent" />

        <div className="relative max-w-4xl space-y-8">
          <div className="flex flex-wrap gap-2.5">
            <StatusBadge variant="available">WEB TERMINAL DISPONIBLE</StatusBadge>
            <StatusBadge variant="desktop">DESKTOP APP CON HERRAMIENTAS AVANZADAS</StatusBadge>
            <StatusBadge variant="soon">MOBILE PROXIMAMENTE</StatusBadge>
          </div>

          <div className="space-y-5">
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Leé Bitcoin con ventaja institucional
            </h1>
            <p className="max-w-3xl text-base leading-relaxed text-[#9ca3af] sm:text-lg">
              Terminal de trading cripto para analizar Bitcoin con Order Flow, gamma, opciones y
              herramientas de lectura institucional.
            </p>
            <p className="max-w-3xl text-lg leading-relaxed text-[#b0b8c4] sm:text-xl">
              Gamma, opciones, estructura y niveles operativos en una sola terminal para contexto,
              timing y ejecución.
            </p>
            <div className="grid max-w-3xl gap-2 sm:grid-cols-2">
              {HERO_BULLETS.map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-[#d1d5db]"
                >
                  <span className="mr-2 text-[#ff3b3b]">•</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <DynamicCtaButtons source="hero_cta" size="large" className="pt-2" />
        </div>
      </div>
    </section>
  );
}
