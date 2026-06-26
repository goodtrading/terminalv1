import { DynamicCtaButtons } from "./DynamicCtaButtons";

export function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#050505] px-8 py-12 text-center sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,59,59,0.10),transparent_55%,rgba(34,197,94,0.06))]" />
        <div className="relative mx-auto max-w-2xl space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#ff3b3b]/80">
            GoodTrading Terminal
          </p>
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Contexto, timing y ejecución para Bitcoin en una sola terminal
          </h2>
          <p className="text-base text-[#9ca3af] sm:text-lg">
            Creá una cuenta, entrá a la Terminal Web y operá con estructura, niveles y reportes en
            un entorno profesional.
          </p>
          <DynamicCtaButtons source="final_cta" className="justify-center pt-2" size="large" />
        </div>
      </div>
    </section>
  );
}
