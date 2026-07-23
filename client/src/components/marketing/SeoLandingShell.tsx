import type { ReactNode } from "react";
import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { DynamicCtaButtons } from "@/components/marketing/DynamicCtaButtons";

export type SeoRelatedLink = {
  href: string;
  label: string;
};

export function SeoLandingShell({
  eyebrow,
  title,
  lead,
  breadcrumbLabel,
  related,
  children,
  imageSrc,
  imageAlt,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  breadcrumbLabel: string;
  related: SeoRelatedLink[];
  children: ReactNode;
  imageSrc?: string;
  imageAlt?: string;
}) {
  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-[#6b7280]">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-white">
                Inicio
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-[#9ca3af]">{breadcrumbLabel}</li>
          </ol>
        </nav>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff3b3b]/90">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[#9ca3af]">{lead}</p>

        {imageSrc ? (
          <figure className="mt-10 overflow-hidden rounded-[16px] border border-white/[0.10] bg-[#080808]">
            <img src={imageSrc} alt={imageAlt ?? title} className="h-auto w-full object-contain" />
          </figure>
        ) : null}

        <div className="prose-seo mt-10 space-y-5 text-[15px] leading-relaxed text-[#d1d5db] sm:text-base">
          {children}
        </div>

        <section className="mt-12 rounded-[18px] border border-white/[0.09] bg-[#050505]/90 p-6">
          <h2 className="text-xl font-semibold text-white">Seguí explorando</h2>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href="/" className="text-sm font-medium text-[#ff8a8a] hover:text-white">
                Volver al inicio de GoodTrading
              </Link>
            </li>
            {related.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-sm font-medium text-[#ff8a8a] hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/products" className="text-sm font-medium text-[#ff8a8a] hover:text-white">
                Ver productos GoodTrading
              </Link>
            </li>
            <li>
              <Link href="/register" className="text-sm font-medium text-[#ff8a8a] hover:text-white">
                Crear cuenta en GoodTrading
              </Link>
            </li>
          </ul>
        </section>

        <section className="mt-10 rounded-[22px] border border-white/[0.09] bg-[#050505] px-6 py-10 text-center sm:px-10">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Probalo en la Terminal Web</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#9ca3af] sm:text-base">
            Creá una cuenta o entrá a la Terminal Web para trabajar contexto, niveles y ejecución de
            Bitcoin en un entorno profesional.
          </p>
          <DynamicCtaButtons source="seo_landing_cta" className="justify-center pt-6" size="large" />
        </section>
      </article>
    </MarketingLayout>
  );
}

export function SeoH2({ children }: { children: ReactNode }) {
  return <h2 className="!mt-10 !mb-3 text-2xl font-semibold text-white">{children}</h2>;
}

export function SeoH3({ children }: { children: ReactNode }) {
  return <h3 className="!mt-7 !mb-2 text-lg font-semibold text-white">{children}</h3>;
}
