import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export default function TermsPage() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
            Legal
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">Términos de uso</h1>
          <p className="mt-4 text-sm leading-relaxed text-[#9ca3af]">
            Texto preliminar. Estos términos regulan el acceso y uso de la plataforma GoodTrading,
            incluyendo Terminal Web, herramientas de análisis y productos asociados.
          </p>
          <div className="mt-8 space-y-4 text-sm leading-relaxed text-[#d1d5db]">
            <p>
              El acceso puede requerir aprobación manual y suscripción activa. El usuario es
              responsable de mantener la confidencialidad de sus credenciales.
            </p>
            <p>
              GoodTrading no garantiza resultados de trading. Las herramientas son informativas y
              operativas según el plan contratado.
            </p>
            <p>
              Para consultas:{" "}
              <a
                href="mailto:GoodTradingpay@gmail.com"
                className="font-medium text-blue-400 hover:text-blue-300"
              >
                GoodTradingpay@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
