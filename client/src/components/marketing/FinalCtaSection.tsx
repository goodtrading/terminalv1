import { DynamicCtaButtons } from "./DynamicCtaButtons";

export function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.09] bg-gradient-to-br from-[#050505] via-[#08080f] to-[#050508] px-8 py-12 text-center sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,59,59,0.08),transparent_65%)]" />
        <div className="relative mx-auto max-w-2xl space-y-6">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Empezá a leer Bitcoin con ventaja institucional
          </h2>
          <p className="text-base text-[#9ca3af] sm:text-lg">
            Terminal web liviana para acceso inmediato. App Desktop para Bookmap avanzado y módulos
            profesionales.
          </p>
          <DynamicCtaButtons source="final_cta" className="justify-center pt-2" size="large" />
        </div>
      </div>
    </section>
  );
}
