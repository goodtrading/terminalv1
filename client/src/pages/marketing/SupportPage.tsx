import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const SUPPORT_EMAIL = "GoodTradingpay@gmail.com";

export default function SupportPage() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
            Soporte
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">Soporte</h1>
          <p className="mt-4 text-sm leading-relaxed text-[#9ca3af]">
            Para soporte, escribinos a{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-blue-400 hover:text-blue-300"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-8 inline-flex rounded-xl bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Enviar email a soporte
          </a>
        </div>
      </div>
    </MarketingLayout>
  );
}
