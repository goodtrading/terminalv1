import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { DynamicCtaButtons } from "./DynamicCtaButtons";
import { FlickeringGrid } from "@/components/ui/FlickeringGrid";
import { BlurFade } from "@/components/ui/BlurFade";
import { HeroMarketCore } from "./HeroMarketCore";

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
      <div className="relative isolate overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#050505] px-8 py-14 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
        <FlickeringGrid
          className="z-0 opacity-90"
          squareSize={3}
          gridGap={14}
          color="#7a7f87"
          maxOpacity={0.18}
          flickerChance={0.018}
          animationInterval={140}
        />
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_8%,rgba(5,5,5,0.2)_48%,rgba(5,5,5,0.92)_100%)]" />
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(135deg,rgba(255,48,60,0.07),transparent_42%,rgba(255,255,255,0.015))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px bg-gradient-to-r from-transparent via-[#ff303c]/55 to-transparent" />

        <div className="pointer-events-none absolute inset-0 z-10 hidden md:block">
          <HeroMarketCore className="absolute right-6 top-[calc(50%-20px)] h-[clamp(390px,43vw,460px)] w-auto -translate-y-1/2 md:right-8 lg:right-7 lg:h-[clamp(490px,46vw,600px)] 2xl:right-16" />
        </div>

        <div className="relative z-20 max-w-4xl space-y-8 lg:max-w-3xl">
          <BlurFade delay={0}>
            <div className="flex flex-wrap gap-2.5">
              <StatusBadge variant="available">WEB TERMINAL DISPONIBLE</StatusBadge>
              <StatusBadge variant="desktop">DESKTOP APP CON HERRAMIENTAS AVANZADAS</StatusBadge>
              <StatusBadge variant="soon">MOBILE PROXIMAMENTE</StatusBadge>
            </div>
          </BlurFade>

          <div className="space-y-5">
            <BlurFade delay={80}>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Leé Bitcoin con ventaja institucional
              </h1>
            </BlurFade>
            <BlurFade delay={160}>
              <div className="space-y-5">
                <p className="max-w-3xl text-base leading-relaxed text-[#a7afb9] sm:text-lg">
                  Analizá Bitcoin con Order Flow, gamma, opciones y niveles operativos en una terminal
                  creada para concentrar contexto, timing y ejecución.
                </p>
              </div>
            </BlurFade>
            <BlurFade delay={240}>
              <div className="grid max-w-3xl gap-2 sm:grid-cols-2">
                {HERO_BULLETS.map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-[#d1d5db]"
                  >
                    <span className="mr-2 text-[#ff303c]">•</span>
                    {item}
                  </div>
                ))}
              </div>
            </BlurFade>
          </div>

          <BlurFade delay={320}>
            <DynamicCtaButtons source="hero_cta" size="large" className="pt-2" />
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
