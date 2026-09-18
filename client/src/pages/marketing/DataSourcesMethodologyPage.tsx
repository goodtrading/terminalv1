import { useEffect } from "react";
import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const PAGE_TITLE = "Fuentes de datos de GoodTrading | Metodología y transparencia";
const PAGE_DESCRIPTION =
  "Conocé de dónde obtiene GoodTrading sus datos de Bitcoin, Order Flow, liquidez y opciones, y cómo distingue información observada de métricas calculadas y modelos estructurales.";
const PAGE_URL = "https://goodtrading.com.ar/methodology/data-sources";
const ORGANIZATION_ID = "https://goodtrading.com.ar/#organization";

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function useMethodologyMetadata() {
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

    const scriptId = "goodtrading-data-sources-jsonld";
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
const labelClass = "text-xs font-semibold uppercase tracking-[0.16em] text-[#737b85]";

const observedTable = [
  ["BTC trades", "Binance market-trade feeds", "OBSERVED", "Executed aggregated transactions; aggressor side is normalized from exchange trade fields."],
  ["Order book", "Binance spot / USDT-M perpetual depth feeds", "OBSERVED", "Displayed bids and asks at the time of the update; not guaranteed future execution."],
  ["Options chain", "Deribit public option-chain data", "OBSERVED", "Listed contracts, strike, expiry, option type, open interest, IV and available quote/underlying fields."],
  ["BTC price references", "Exchange ticker/candle providers", "OBSERVED", "A market reference from the selected provider and market; provider can vary by module and availability."],
  ["Delta / trade aggression", "Executed market trades", "DERIVED", "A mathematical aggregation of buy- and sell-side executed volume."],
  ["Gamma, Vanna and Charm", "Deribit options data", "DERIVED", "Options-market analytics calculated from observable contract data and model inputs."],
  ["Structural zones / walls / magnets", "Market and options inputs", "STRUCTURAL PROXY", "Analytical levels calculated from underlying data, not exchange-native price levels."],
  ["AI interpretation", "GoodTrading market and derived context", "AI INTERPRETATION", "Downstream explanation that does not turn an estimate into an observed fact."],
] as const;

function DataTable() {
  return (
    <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.09] bg-[#0a0b0d]/70">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <caption className="sr-only">Clasificación de datos observados y derivados de GoodTrading</caption>
        <thead className="border-b border-white/[0.09] text-[#737b85]">
          <tr>
            <th scope="col" className="px-5 py-4 font-medium">Dato / métrica</th>
            <th scope="col" className="px-5 py-4 font-medium">Tipo de fuente</th>
            <th scope="col" className="px-5 py-4 font-medium">Clasificación</th>
            <th scope="col" className="px-5 py-4 font-medium">Qué representa</th>
          </tr>
        </thead>
        <tbody>
          {observedTable.map(([metric, source, classification, meaning]) => (
            <tr key={metric} className="border-b border-white/[0.06] align-top last:border-0">
              <th scope="row" className="px-5 py-4 font-medium text-[#f5f7fa]">{metric}</th>
              <td className="px-5 py-4 leading-6 text-[#a7afb9]">{source}</td>
              <td className="px-5 py-4 font-mono text-xs tracking-wide text-[#ff6b73]">{classification}</td>
              <td className="px-5 py-4 leading-6 text-[#a7afb9]">{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConceptCard({ title, children }: { title: string; children: string }) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5 sm:p-6">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-[#a7afb9]">{children}</p>
    </article>
  );
}

export default function DataSourcesMethodologyPage() {
  useMethodologyMetadata();

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <nav aria-label="Breadcrumb" className="mb-10 text-sm text-[#737b85]">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="marketing-focus-ring hover:text-white">Inicio</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/about" className="marketing-focus-ring hover:text-white">Qué es GoodTrading</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-[#a7afb9]">Fuentes de datos</li>
          </ol>
        </nav>

        <header className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ff303c]">Transparencia de datos</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">Fuentes de datos y metodología</h1>
          <p className="mt-7 max-w-4xl text-lg leading-8 text-[#d7dce3] sm:text-xl">GoodTrading combina datos observados directamente en mercados de Bitcoin y derivados con métricas calculadas y modelos estructurales desarrollados sobre esos datos.</p>
          <p className={bodyClass}>No todas las variables mostradas por la Terminal representan observaciones directas del mercado. Algunas son datos raw, otras son transformaciones matemáticas y otras son modelos estructurales utilizados para interpretar el contexto. GoodTrading documenta esta diferencia para que el usuario pueda saber qué está observando y qué está siendo inferido.</p>
        </header>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Principio de procedencia</h2>
          <p className={bodyClass}>Cada métrica importante debería poder responder, de forma conceptual, cinco preguntas:</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <ConceptCard title="SOURCE">Origen de la información de mercado.</ConceptCard>
            <ConceptCard title="TIMESTAMP">Cuándo fue observada la información subyacente.</ConceptCard>
            <ConceptCard title="TRANSFORMATION TYPE">Si es raw, derivada matemáticamente, proxy estructural o interpretación de IA.</ConceptCard>
            <ConceptCard title="UNIT">La unidad física o financiera cuando corresponde.</ConceptCard>
            <ConceptCard title="INTERPRETATION">Qué intenta describir la métrica.</ConceptCard>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Datos de precio de Bitcoin</h2>
          <p className={bodyClass}>GoodTrading utiliza referencias de precio y velas de mercados spot de Bitcoin. La cadena de proveedores soportada incluye Binance, Bybit, Coinbase y Kraken; el proveedor efectivo puede variar según el módulo, la preferencia de fuente y la disponibilidad del momento.</p>
          <p className={bodyClass}>El libro y los trades de mercado perpetuo se mantienen separados de los datos spot. Por eso no existe una única cotización universal que represente de la misma manera a todos los módulos: cada contexto conserva su mercado y su referencia.</p>
          <p className={bodyClass}>Las referencias tienen timestamp. Si una fuente deja de actualizarse o no puede validarse, el sistema puede reintentar con una fuente alternativa soportada o dejar el dato como no disponible; no debería presentar un valor fabricado como una observación nueva.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Trades y Order Flow</h2>
          <p className={bodyClass}>El Order Flow se construye a partir de trades de mercado ejecutados públicamente. GoodTrading utiliza feeds de aggregated trades de Binance para spot y USDT-M perpetual, tanto para buffers recientes como para consultas históricas acotadas.</p>
          <p className={bodyClass}>Los campos de la operación permiten normalizar precio, cantidad, timestamp y lado agresor. Delta, agresión compradora/vendedora y cálculos tipo CVD son transformaciones derivadas de esas operaciones ejecutadas; no son señales observadas aparte del mercado.</p>
          <p className="mt-6 max-w-4xl border-l-2 border-[#ff303c] pl-4 text-sm leading-7 text-[#d7dce3]">Una métrica de Order Flow describe operaciones ejecutadas y su agregación. No revela por sí sola la intención completa del participante ni garantiza continuidad del movimiento.</p>
          <p className="mt-6"><Link href="/order-flow-bitcoin" className={linkClass}>Leer la página pública de Order Flow en Bitcoin</Link></p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Order book y liquidez</h2>
          <p className={bodyClass}>La Terminal recibe profundidad de mercado de Binance spot y Binance USDT-M perpetual, con bids, asks y actualizaciones de profundidad. Estos datos alimentan la visualización de liquidez y, cuando corresponde, muestreos históricos del libro.</p>
          <p className={bodyClass}>Un nivel del order book representa liquidez mostrada en ese momento, no una ejecución futura garantizada. La liquidez puede retirarse, cambiar de precio o ser consumida antes de que una orden interactúe con ella.</p>
          <p className={bodyClass}>Las visualizaciones como heatmap, walls o persistencia son representaciones y transformaciones del libro. No publicamos aquí sus fórmulas de intensidad, scoring, thresholds ni heurísticas internas.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Opciones de Bitcoin</h2>
          <p className={bodyClass}>La fuente live de opciones de Bitcoin es Deribit, mediante información pública del chain de opciones. La base observable incluye instrumento, strike, vencimiento, tipo call/put, open interest, volatilidad implícita, precios/cantidades disponibles y referencia del subyacente cuando el proveedor la entrega.</p>
          <p className={bodyClass}>Si la ingesta live no está disponible, el sistema puede utilizar un dataset CSV de bootstrap. Ese estado se clasifica como <strong className="font-medium text-[#f5f7fa]">BOOTSTRAP</strong>, no como <strong className="font-medium text-[#f5f7fa]">LIVE_DERIBIT</strong>. La procedencia y disponibilidad deben conservar esa diferencia.</p>
          <p className="mt-6"><Link href="/gamma-exposure-bitcoin" className={linkClass}>Conocer el contexto público de Gamma Exposure de Bitcoin</Link></p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Gamma, Vanna y Charm</h2>
          <p className={bodyClass}>Gamma, Vanna y Charm mostrados por GoodTrading son analíticas derivadas calculadas a partir de datos del mercado de opciones. No son trades directos ni observaciones directas del inventario de dealers.</p>
          <p className={bodyClass}>El open interest muestra la cantidad de posiciones de opciones abiertas, pero por sí solo no identifica qué participante está long o short. Por lo tanto, cualquier interpretación direccional que dependa del posicionamiento de contrapartes debe tratarse como un modelo o proxy, no como inventario de dealers observado directamente.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Microestructura y niveles derivados</h2>
          <p className={bodyClass}>GoodTrading puede combinar trades ejecutados, liquidez del order book, cambios en liquidez mostrada y posicionamiento de opciones para estudiar microestructura. La combinación de entradas no convierte una salida derivada en verdad observada del mercado.</p>
          <p className={bodyClass}>Niveles relacionados con gamma, zonas estructurales, walls, magnets o regiones de transición pueden ser calculados a partir de datos subyacentes. Son outputs analíticos, no niveles nativos del exchange y no garantizan que el precio reaccione en ellos.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Modelos estructurales y capas de interpretación</h2>
          <p className={bodyClass}>Algunos módulos combinan varias entradas derivadas para describir estructura de mercado o presión de posicionamiento. Estos resultados se presentan como modelos estructurales o proxies, no como acceso directo a la intención privada de participantes.</p>
          <p className={bodyClass}>Cuando una función de GoodTrading AI o Mentor está disponible, su interpretación es downstream de los datos de mercado y de las métricas derivadas. Una explicación generada por IA no transforma una estimación en un hecho observado. No se publican prompts, corpus privados, pesos ni reglas internas.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Freshness, fallback e históricos</h2>
          <ul className="mt-6 grid gap-4 text-sm leading-7 text-[#a7afb9] sm:grid-cols-2">
            <li className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5"><strong className="text-[#f5f7fa]">Feeds live.</strong> Trades, profundidad y referencias de mercado pueden actualizarse con frecuencias diferentes según la familia de datos.</li>
            <li className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5"><strong className="text-[#f5f7fa]">Timestamps.</strong> La frescura se evalúa respecto del timestamp de la entrada, no solo respecto del momento de renderizado.</li>
            <li className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5"><strong className="text-[#f5f7fa]">Stale o unavailable.</strong> Un dato viejo o no disponible no debe presentarse como una observación recién recibida.</li>
            <li className="rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 p-5"><strong className="text-[#f5f7fa]">Históricos.</strong> El sistema puede combinar buffers recientes, consultas históricas acotadas y cachés de continuidad; eso no equivale a un feed live.</li>
          </ul>
          <p className="mt-6 max-w-4xl text-sm leading-7 text-[#737b85]">Cuando una fuente alternativa responde, la procedencia debe mantenerse distinguible. Si no hay una fuente válida, el estado correcto es no disponible, no cero ni un valor neutral inventado.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Observed vs calculated</h2>
          <DataTable />
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Limitaciones conocidas</h2>
          <ul className="mt-6 max-w-4xl space-y-3 text-[15px] leading-8 text-[#a7afb9] sm:text-base">
            <li>GoodTrading no tiene visibilidad directa del inventario privado de cada dealer o institución.</li>
            <li>GoodTrading no puede conocer la intención detrás de cada orden.</li>
            <li>La liquidez mostrada puede cancelarse antes de ejecutarse.</li>
            <li>El open interest no revela por sí mismo la intención direccional de ambas contrapartes.</li>
            <li>Los modelos derivados representan interpretaciones analíticas de datos observables.</li>
            <li>Los niveles derivados no predicen una reacción del precio con certeza.</li>
          </ul>
        </section>

        <section className={`${sectionClass} pb-4`}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Principios de calidad y alcance</h2>
          <p className={bodyClass}>GoodTrading prioriza entradas con timestamp, cálculos deterministas cuando corresponde, estados explícitos de null o unavailable, interpretación consciente de la fuente y separación entre observación e inferencia.</p>
          <p className={bodyClass}>Esta página documenta fuentes y categorías de procedencia de datos de mercado. No describe privacidad de usuarios ni publica fórmulas propietarias, constantes de normalización, thresholds, rankings, transiciones de estado, combinaciones de confirmación, reglas de estrategia, datasets privados ni arquitectura interna competitiva.</p>
          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/about" className={linkClass}>Volver a Qué es GoodTrading</Link><Link href="/methodology/classification" className={linkClass}>Ver la clasificación pública</Link><Link href="/privacy" className={linkClass}>Consultar la Política de Privacidad</Link></p>
        </section>
      </article>
    </MarketingLayout>
  );
}
