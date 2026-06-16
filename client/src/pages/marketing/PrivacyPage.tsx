import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export default function PrivacyPage() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
            Legal
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">Política de privacidad</h1>
          <p className="mt-4 text-sm leading-relaxed text-[#9ca3af]">
            Texto preliminar. GoodTrading trata datos de cuenta, acceso y uso de la plataforma con
            fines de autenticación, soporte y mejora del servicio.
          </p>
          <div className="mt-8 space-y-4 text-sm leading-relaxed text-[#d1d5db]">
            <p>
              No compartimos datos de cuenta con terceros salvo obligación legal o proveedores
              necesarios para operar el servicio (por ejemplo, procesamiento de pagos).
            </p>
            <p>
              Podés solicitar información sobre tus datos contactando a soporte.
            </p>
            <p>
              Contacto:{" "}
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
