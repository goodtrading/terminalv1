import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { DynamicCtaButtons } from "./DynamicCtaButtons";

type AccessCTAProps = {
  className?: string;
};

export function AccessCTA({ className }: AccessCTAProps) {
  return (
    <section className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.09] bg-gradient-to-br from-[#050505] via-[#07070c] to-[#050508] px-8 py-14 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#ff3b3b]/10 blur-[100px]" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-violet-600/12 blur-[110px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_55%)]" />

        <div className="relative mx-auto max-w-4xl space-y-8">
          <div className="flex flex-wrap gap-2.5">
            <StatusBadge variant="available">Web Terminal disponible</StatusBadge>
            <StatusBadge variant="desktop">Desktop App con Bookmap avanzado</StatusBadge>
            <StatusBadge variant="soon">Mobile próximamente</StatusBadge>
          </div>

          <div className="space-y-5">
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              GoodTrading Terminal
            </h1>
            <p className="max-w-3xl text-lg leading-relaxed text-[#b0b8c4] sm:text-xl">
              Terminal profesional para leer Bitcoin con Gamma, opciones, liquidez y estructura de
              mercado.
            </p>
            <p className="max-w-3xl rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3 text-sm leading-relaxed text-[#9ca3af]">
              La versión web está optimizada para acceso rápido. Bookmap avanzado, heatmap completo y
              DOM institucional están disponibles en la{" "}
              <span className="text-blue-300">App Desktop</span>.
            </p>
          </div>

          <DynamicCtaButtons source="hero_cta" size="large" className="pt-2" />
        </div>
      </div>
    </section>
  );
}
