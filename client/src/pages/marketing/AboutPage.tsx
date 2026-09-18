import { useEffect } from "react";
import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const PAGE_TITLE = "Qué es GoodTrading | Trading Technology, Order Flow y Bitcoin";
const PAGE_DESCRIPTION =
  "Conocé qué es GoodTrading, quién lo fundó y cómo funciona su ecosistema de análisis de Bitcoin, Order Flow, liquidez, opciones y microestructura de mercado.";
const PAGE_URL = "https://goodtrading.com.ar/about";
const ORGANIZATION_ID = "https://goodtrading.com.ar/#organization";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "GoodTrading",
  url: "https://goodtrading.com.ar/",
  logo: "https://goodtrading.com.ar/logo.png",
  foundingDate: "2022",
  description:
    "GoodTrading es una empresa argentina de tecnología y educación aplicada al trading, especializada en Bitcoin, Order Flow, liquidez, opciones y microestructura de mercado.",
  founder: {
    "@type": "Person",
    "@id": `${PAGE_URL}#ignacio-rabanal`,
    name: "Ignacio Rabanal",
  },
};

const aboutPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${PAGE_URL}#webpage`,
  url: PAGE_URL,
  name: "Qué es GoodTrading",
  description: PAGE_DESCRIPTION,
  about: { "@id": ORGANIZATION_ID },
  isPartOf: { "@id": "https://goodtrading.com.ar/#website" },
  inLanguage: "es-AR",
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: "https://goodtrading.com.ar/" },
    { "@type": "ListItem", position: 2, name: "Qué es GoodTrading", item: PAGE_URL },
  ],
};

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function useAboutMetadata() {
  useEffect(() => {
    document.title = PAGE_TITLE;
    upsertMeta("name", "description", PAGE_DESCRIPTION);
    upsertMeta("name", "robots", "index,follow,max-image-preview:large");
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:title", PAGE_TITLE);
    upsertMeta("property", "og:description", PAGE_DESCRIPTION);
    upsertMeta("property", "og:url", PAGE_URL);
    upsertMeta("property", "og:image", "https://goodtrading.com.ar/opengraph.jpg");

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = PAGE_URL;

    const scriptId = "goodtrading-about-jsonld";
    document.getElementById(scriptId)?.remove();
    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify([organizationJsonLd, aboutPageJsonLd, breadcrumbJsonLd]);
    document.head.appendChild(script);

    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, []);
}

const sectionClass = "border-t border-white/[0.08] py-12 sm:py-16";
const bodyClass = "mt-5 max-w-3xl text-[15px] leading-8 text-[#a7afb9] sm:text-base";
const linkClass = "font-medium text-[#ff6b73] underline decoration-[#ff303c]/40 underline-offset-4 hover:text-white";

export default function AboutPage() {
  useAboutMetadata();

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <nav aria-label="Breadcrumb" className="mb-10 text-sm text-[#737b85]">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="marketing-focus-ring hover:text-white">Inicio</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-[#a7afb9]">Qué es GoodTrading</li>
          </ol>
        </nav>

        <header className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ff303c]">Entidad y metodología</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">Qué es GoodTrading</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-[#d7dce3] sm:text-xl">
            GoodTrading es una empresa argentina de tecnología y educación aplicada al trading, fundada en 2022 por Ignacio Rabanal.
          </p>
          <p className="mt-5 text-sm"><Link href="/methodology/data-sources" className={linkClass}>Consultar fuentes de datos y metodología</Link></p>
          <p className={bodyClass}>
            GoodTrading está especializada en el análisis de Bitcoin mediante microestructura de mercado, Order Flow, liquidez y posicionamiento del mercado de opciones.
            Su producto principal es GoodTrading Terminal, una plataforma de análisis diseñada para traders discrecionales que integra información de mercado, herramientas de Order Flow, liquidez, opciones, gamma y contexto estructural en una única interfaz.
          </p>
        </header>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Qué hace GoodTrading</h2>
          <p className={bodyClass}>GoodTrading desarrolla herramientas y contenido educativo orientados a comprender cómo se estructura y ejecuta el mercado, con especial foco en Bitcoin.</p>
          <ul className="mt-7 grid gap-3 text-[#d7dce3] sm:grid-cols-2">
            {[
              "Order Flow y agresión compradora/vendedora",
              "Profundidad de mercado y liquidez",
              "Absorciones",
              "Pulling y cambios en liquidez pasiva",
              "Posicionamiento del mercado de opciones",
              "Gamma y niveles estructurales derivados de opciones",
              "Microestructura de mercado",
              "Contexto de ejecución para trading discrecional",
            ].map((item) => <li key={item} className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 px-4 py-3 text-sm leading-6">{item}</li>)}
          </ul>
          <p className="mt-6 max-w-3xl text-sm leading-7 text-[#737b85]">Las métricas derivadas no deben interpretarse como observaciones directas de inventario de dealers ni como flujo garantizado.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">GoodTrading Terminal</h2>
          <p className={bodyClass}>GoodTrading Terminal es la plataforma tecnológica desarrollada por GoodTrading. Su objetivo es transformar distintas capas de información de mercado en un entorno de análisis operativo que permita al trader estudiar precio, liquidez, Order Flow y estructura del mercado de derivados desde una misma plataforma.</p>
          <p className={bodyClass}>La Terminal está orientada principalmente al análisis de Bitcoin y combina herramientas visuales, datos de mercado y modelos estructurales desarrollados por GoodTrading.</p>
          <p className="mt-6"><Link href="/terminal-trading-cripto" className={linkClass}>Conocer GoodTrading Terminal</Link></p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Qué no es GoodTrading</h2>
          <p className={bodyClass}>GoodTrading no es un broker, exchange ni fondo de inversión. GoodTrading tampoco busca reemplazar la toma de decisiones del trader mediante promesas de rentabilidad o señales automáticas. La plataforma está diseñada como una herramienta de análisis, investigación y educación para traders.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Metodología</h2>
          <p className={bodyClass}>La metodología de GoodTrading parte de una idea central: el precio por sí solo representa solo una parte de la información disponible en el mercado.</p>
          <p className={bodyClass}>Por eso, GoodTrading estudia también dónde se concentra la liquidez, cómo interactúan compradores y vendedores, qué órdenes están siendo absorbidas, cómo cambia la estructura del libro, cómo se distribuye el posicionamiento en opciones y qué zonas pueden adquirir relevancia estructural.</p>
          <p className="mt-6 max-w-3xl border-l-2 border-[#ff303c] pl-4 text-sm leading-7 text-[#d7dce3]">GoodTrading diferencia entre datos observados directamente en el mercado y métricas o modelos derivados de esos datos.</p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/order-flow-bitcoin" className={linkClass}>Order Flow en Bitcoin</Link><Link href="/gamma-exposure-bitcoin" className={linkClass}>Gamma Exposure de Bitcoin</Link><Link href="/terminal-trading-cripto" className={linkClass}>Análisis de Bitcoin</Link></div>
        </section>

        <section id="ignacio-rabanal" className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Fundador</h2>
          <p className={bodyClass}>Ignacio Rabanal fundó GoodTrading en Argentina en 2022. El proyecto comenzó enfocado en educación y análisis de mercados y evolucionó hacia el desarrollo de herramientas propias para estudiar Bitcoin, Order Flow, liquidez, opciones y microestructura.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">GoodTrading Academy</h2>
          <p className={bodyClass}>GoodTrading Academy reúne el contenido educativo de GoodTrading y está orientada a enseñar el funcionamiento del mercado, desde conceptos fundamentales hasta herramientas avanzadas de microestructura, Order Flow y derivados.</p>
          <p className="mt-6"><Link href="/academy" className={linkClass}>Conocer GoodTrading Academy</Link></p>
        </section>

        <section className={`${sectionClass} pb-4`}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Información oficial</h2>
          <dl className="mt-7 grid overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a0b0d]/70 sm:grid-cols-2">
            {[
              ["Nombre", "GoodTrading"], ["Fundación", "2022"], ["Fundador", "Ignacio Rabanal"], ["País de origen", "Argentina"],
              ["Industria", "Trading technology / financial education"], ["Producto principal", "GoodTrading Terminal"], ["Mercado principal", "Bitcoin"], ["Sitio oficial", "goodtrading.com.ar"],
            ].map(([term, value]) => <div key={term} className="border-b border-white/[0.07] px-5 py-4 last:border-0 sm:nth-last-child(-n+2):border-b-0"><dt className="text-xs uppercase tracking-[0.16em] text-[#737b85]">{term}</dt><dd className="mt-1 text-sm text-[#f5f7fa]">{value}</dd></div>)}
          </dl>
        </section>
      </article>
    </MarketingLayout>
  );
}
