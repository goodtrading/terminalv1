import { useEffect } from "react";
import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const PAGE_TITLE = "Cómo clasifica GoodTrading sus datos y modelos | Metodología";
const PAGE_DESCRIPTION =
  "Conocé la diferencia entre datos observados, métricas derivadas, proxies estructurales e interpretaciones de IA dentro de GoodTrading.";
const PAGE_URL = "https://goodtrading.com.ar/methodology/classification";
const ORGANIZATION_ID = "https://goodtrading.com.ar/#organization";

const categories = [
  {
    name: "OBSERVED",
    title: "Datos observados",
    accent: "border-white/[0.18]",
    definition: "Información recibida directamente de una fuente de mercado o proveedor de datos, sin que GoodTrading la convierta en una inferencia estructural.",
    examples: "Trades ejecutados, bids y asks del order book, strike, expiry, tipo de opción, open interest, IV, timestamps y precios spot/perpetual.",
    limitation: "No significa ejecución futura garantizada. La liquidez mostrada puede cancelarse y el open interest no revela quién está long o short.",
  },
  {
    name: "DERIVED",
    title: "Métricas derivadas",
    accent: "border-[#ff303c]/45",
    definition: "Métricas calculadas determinísticamente a partir de uno o más datos observados.",
    examples: "Delta, imbalance de agresión, métricas tipo CVD, gamma exposure, Vanna, Charm, agregaciones por strike y distancias a niveles.",
    limitation: "Puede ser reproducible matemáticamente y aun así depender de supuestos, calidad de inputs y convenciones de cálculo.",
  },
  {
    name: "STRUCTURAL PROXY",
    title: "Proxy estructural",
    accent: "border-[#a7afb9]/35",
    definition: "Modelo utilizado para aproximar o describir una condición de mercado que GoodTrading no puede observar directamente.",
    examples: "Presión de dealers o de hedging, aceleración gamma, regímenes, market mode, cascade/squeeze risk y niveles con interpretación estructural.",
    limitation: "No es evidencia directa de inventario institucional privado, intención ni movimiento futuro del precio.",
  },
  {
    name: "AI INTERPRETATION",
    title: "Interpretación de IA",
    accent: "border-[#737b85]/45",
    definition: "Explicación, síntesis o contexto generado por IA usando información de mercado y métricas de GoodTrading.",
    examples: "Una explicación contextual de la Terminal o de Mentor sobre datos observados, métricas derivadas y proxies estructurales.",
    limitation: "La IA no crea hechos de mercado ni convierte un proxy en un dato observado o una métrica en un resultado garantizado.",
  },
] as const;

const rows = [
  ["BTC executed trades", "OBSERVED", "Llegan de un feed público de operaciones ejecutadas.", "No significa que se conozca la intención completa del participante."],
  ["Order book bids/asks", "OBSERVED", "Son niveles de liquidez mostrada recibidos del exchange.", "No son ejecución futura garantizada; pueden cancelarse."],
  ["Options chain fields", "OBSERVED", "Strike, expiry, tipo, OI, IV y campos entregados por el proveedor.", "El OI no identifica la dirección de cada contraparte."],
  ["Delta / aggression / CVD-like", "DERIVED", "Agregan matemáticamente trades ejecutados y su lado agresor.", "No son una señal independiente ni una garantía direccional."],
  ["Gamma / Vanna / Charm", "DERIVED", "Calculan analíticas de opciones a partir de inputs observados.", "No son trades ni inventario de dealers observado."],
  ["Dealer / hedging pressure", "STRUCTURAL PROXY", "Aproxima presión estructural mediante inputs de opciones y mercado.", "No prueba inventario, intención ni acción de dealers."],
  ["Gamma acceleration / regimes", "STRUCTURAL PROXY", "Describe estados o presión estructural modelada por GoodTrading.", "No predice con certeza una reacción del precio."],
  ["Structural walls / magnets", "STRUCTURAL PROXY", "Un nivel calculado recibe una interpretación estructural adicional.", "No es un nivel nativo del exchange."],
  ["AI Mentor/context explanation", "AI INTERPRETATION", "Resume o interpreta contexto de mercado y métricas.", "No convierte una inferencia en un hecho observado."],
] as const;

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function useClassificationMetadata() {
  useEffect(() => {
    document.title = PAGE_TITLE;
    upsertMeta("name", "description", PAGE_DESCRIPTION);
    upsertMeta("name", "robots", "index,follow,max-image-preview:large");
    upsertMeta("property", "og:type", "article");
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

    const scriptId = "goodtrading-classification-jsonld";
    document.getElementById(scriptId)?.remove();
    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${PAGE_URL}#article`,
      url: PAGE_URL,
      headline: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      about: { "@id": ORGANIZATION_ID },
      isPartOf: { "@id": "https://goodtrading.com.ar/#website" },
      inLanguage: "es-AR",
      author: { "@id": ORGANIZATION_ID },
      publisher: { "@id": ORGANIZATION_ID },
    });
    document.head.appendChild(script);
    return () => document.getElementById(scriptId)?.remove();
  }, []);
}

const sectionClass = "border-t border-white/[0.08] py-12 sm:py-16";
const bodyClass = "mt-5 max-w-4xl text-[15px] leading-8 text-[#a7afb9] sm:text-base";
const linkClass = "font-medium text-[#ff6b73] underline decoration-[#ff303c]/40 underline-offset-4 hover:text-white";

export default function ClassificationMethodologyPage() {
  useClassificationMetadata();

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <nav aria-label="Breadcrumb" className="mb-10 text-sm text-[#737b85]">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="marketing-focus-ring hover:text-white">Inicio</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/about" className="marketing-focus-ring hover:text-white">Qué es GoodTrading</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/methodology/data-sources" className="marketing-focus-ring hover:text-white">Fuentes de datos</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-[#a7afb9]">Clasificación</li>
          </ol>
        </nav>

        <header className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ff303c]">Taxonomía pública</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">Cómo clasifica GoodTrading sus datos y modelos</h1>
          <p className="mt-7 max-w-4xl text-lg leading-8 text-[#d7dce3] sm:text-xl">GoodTrading separa la información que muestra según su origen y nivel de transformación.</p>
          <p className={bodyClass}>No todos los valores de la Terminal representan datos observados directamente en un exchange. Algunos son cálculos matemáticos, otros son modelos estructurales y otros son interpretaciones generadas por IA sobre datos anteriores. Esta clasificación permite distinguir observación de cálculo e inferencia.</p>
        </header>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Las cuatro categorías</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {categories.map((category) => (
              <article key={category.name} className={`rounded-2xl border bg-[#0a0b0d]/70 p-6 ${category.accent}`}>
                <p className="font-mono text-xs font-semibold tracking-[0.16em] text-[#ff6b73]">{category.name}</p>
                <h3 className="mt-3 text-xl font-semibold text-white">{category.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[#d7dce3]">{category.definition}</p>
                <p className="mt-4 text-sm leading-7 text-[#a7afb9]"><strong className="text-[#f5f7fa]">Ejemplos:</strong> {category.examples}</p>
                <p className="mt-4 border-t border-white/[0.08] pt-4 text-sm leading-7 text-[#737b85]"><strong className="text-[#a7afb9]">No significa:</strong> {category.limitation}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Jerarquía de información</h2>
          <div className="mt-8 flex flex-col items-center gap-2 text-center sm:flex-row sm:items-stretch sm:justify-between sm:gap-0">
            {["OBSERVED", "DERIVED", "STRUCTURAL PROXY", "AI INTERPRETATION"].map((label, index) => (
              <div key={label} className="flex w-full items-center gap-2 sm:w-auto sm:flex-1 sm:flex-col sm:gap-3">
                <div className="w-full rounded-xl border border-white/[0.12] bg-[#0a0b0d]/80 px-4 py-4 font-mono text-xs tracking-wide text-[#f5f7fa]">{label}</div>
                {index < 3 ? <span aria-hidden="true" className="text-[#ff303c] sm:text-xl">↓</span> : null}
              </div>
            ))}
          </div>
          <p className={bodyClass}>La jerarquía indica que las capas superiores pueden consumir una o más capas inferiores. No toda métrica debe pasar por las cuatro categorías: un precio puede permanecer OBSERVED, mientras que una explicación de IA puede usar una combinación de datos OBSERVED, métricas DERIVED y un STRUCTURAL PROXY.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Tabla de clasificación</h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.09] bg-[#0a0b0d]/70">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <caption className="sr-only">Clasificación pública de datos y modelos de GoodTrading</caption>
              <thead className="border-b border-white/[0.09] text-[#737b85]">
                <tr>
                  <th scope="col" className="px-5 py-4 font-medium">Dato o métrica</th>
                  <th scope="col" className="px-5 py-4 font-medium">Clasificación</th>
                  <th scope="col" className="px-5 py-4 font-medium">Por qué</th>
                  <th scope="col" className="px-5 py-4 font-medium">Qué no significa</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([metric, classification, why, limitation]) => (
                  <tr key={metric} className="border-b border-white/[0.06] align-top last:border-0">
                    <th scope="row" className="px-5 py-4 font-medium text-[#f5f7fa]">{metric}</th>
                    <td className="px-5 py-4 font-mono text-xs tracking-wide text-[#ff6b73]">{classification}</td>
                    <td className="px-5 py-4 leading-6 text-[#a7afb9]">{why}</td>
                    <td className="px-5 py-4 leading-6 text-[#a7afb9]">{limitation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Métricas mixtas</h2>
          <p className={bodyClass}>Algunas salidas tienen más de una capa. Por ejemplo, un strike y su open interest pueden ser OBSERVED; una agregación de exposición por strike puede ser DERIVED; y un “structural magnet” agrega una interpretación de estructura, por lo que su clasificación pública final es STRUCTURAL PROXY.</p>
          <p className="mt-6 max-w-4xl border-l-2 border-[#ff303c] pl-4 text-sm leading-7 text-[#d7dce3]">La clasificación final describe el significado público de la salida, no elimina las capas de datos que la originan.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Lenguaje de confianza</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5 text-sm leading-7 text-[#a7afb9]"><strong className="text-white">OBSERVED:</strong> “muestra”, “fue observado”, “dato de mercado”.</div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5 text-sm leading-7 text-[#a7afb9]"><strong className="text-white">DERIVED:</strong> “calculado”, “derivado”, “computado”.</div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5 text-sm leading-7 text-[#a7afb9]"><strong className="text-white">STRUCTURAL PROXY:</strong> “estima”, “modela”, “sugiere presión estructural”, “proxy”.</div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5 text-sm leading-7 text-[#a7afb9]"><strong className="text-white">AI INTERPRETATION:</strong> “interpreta”, “resume”, “proporciona contexto”.</div>
          </div>
          <p className="mt-6 text-sm leading-7 text-[#737b85]">Para proxies no corresponde afirmar que el sistema “prueba”, “sabe” o que los dealers o instituciones “definitivamente” están haciendo algo. Tampoco corresponde presentar una predicción como certeza.</p>
        </section>

        <section className={`${sectionClass} pb-4`}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Límites y documentación relacionada</h2>
          <p className={bodyClass}>Un modelo estructural no es inventario institucional privado ni intención de mercado observada. Una interpretación de IA no puede transformar PROXY → OBSERVED FACT ni DERIVED METRIC → GUARANTEED MARKET OUTCOME.</p>
          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/about" className={linkClass}>Qué es GoodTrading</Link><Link href="/methodology/data-sources" className={linkClass}>Fuentes de datos y procedencia</Link></p>
        </section>
      </article>
    </MarketingLayout>
  );
}
