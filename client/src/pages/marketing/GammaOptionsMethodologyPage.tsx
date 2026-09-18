import { useEffect } from "react";
import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const PAGE_TITLE = "Cómo calcula GoodTrading Gamma y opciones | Metodología";
const PAGE_DESCRIPTION =
  "Conocé cómo GoodTrading utiliza datos de opciones de Bitcoin para analizar Gamma, Vanna, Charm, Gamma Flip, niveles estructurales y posicionamiento del mercado.";
const PAGE_URL = "https://goodtrading.com.ar/methodology/gamma-options";
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

function useGammaMetadata() {
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

    const scriptId = "goodtrading-gamma-options-jsonld";
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

const conceptRows = [
  ["Strike / expiration / call-put", "OBSERVED", "Identity and contract structure delivered by the options provider.", "Not an estimate of participant intent."],
  ["Open interest / IV / underlying reference", "OBSERVED", "Public option-chain fields used as inputs when valid.", "OI does not identify who is long or short."],
  ["Individual Greek sensitivity", "DERIVED", "A sensitivity calculated or validated from option inputs.", "Not an executed hedge or trade."],
  ["Gamma Exposure / Vanna / Charm", "DERIVED", "Aggregated analytics derived from the options layer.", "Not direct dealer inventory or flow."],
  ["Gamma Regime / Gamma Flip", "DERIVED / STRUCTURAL PROXY", "A modeled description of aggregate sign or regime structure.", "Not an exchange-native level or certainty about dealers."],
  ["Gamma Wall / Gamma Magnet", "STRUCTURAL PROXY", "An analytical interpretation of concentrated options exposure.", "Not an order-book wall or guaranteed support/resistance."],
  ["Dealer / hedging pressure", "STRUCTURAL PROXY", "A model of possible structural pressure from options sensitivities.", "Not observed private hedge orders."],
] as const;

const faqs = [
  ["¿De dónde obtiene GoodTrading los datos de opciones?", "De datos públicos de opciones de Bitcoin de Deribit cuando la Terminal opera en modo live. Si la ingesta live no está disponible, puede existir un estado BOOTSTRAP separado de LIVE_DERIBIT."],
  ["¿Qué es Gamma Exposure?", "Es una métrica DERIVED que agrega contribuciones de sensibilidad Gamma de contratos de opciones y sus posiciones abiertas, usando referencias de mercado y convenciones explícitas."],
  ["¿GoodTrading puede ver las posiciones reales de los dealers?", "No. El open interest no identifica quién está long o short ni revela el inventario privado de dealers."],
  ["¿Qué es Gamma Flip?", "Es una región o nivel modelado donde la estructura de Gamma agregada cambia de signo o régimen. Puede no existir en un snapshot válido y no es un nivel nativo del exchange."],
  ["¿Qué es un Gamma Wall?", "Es un nivel estructural derivado asociado a una concentración relevante de Gamma alrededor de un strike. No es una pared de órdenes del order book."],
  ["¿Qué es un Gamma Magnet?", "Es una interpretación estructural de una concentración de Gamma que puede ser una referencia analítica para el contexto. No implica atracción mecánica del precio."],
  ["¿Gamma predice el precio?", "No. Gamma aporta contexto de sensibilidad y estructura; no garantiza dirección, reversión, llegada a un nivel ni reacción del precio."],
  ["¿Qué son Vanna y Charm?", "Vanna describe una sensibilidad cruzada entre Delta y volatilidad implícita. Charm describe cómo puede cambiar Delta con el paso del tiempo bajo una convención de cálculo."],
  ["¿GoodTrading observa realmente el hedging de dealers?", "No. Cualquier dealer pressure o hedging pressure es STRUCTURAL PROXY, no una observación directa de órdenes privadas."],
] as const;

function FormulaCallout() {
  return (
    <div className="mt-8 rounded-2xl border border-[#ff303c]/25 bg-[#ff303c]/[0.06] p-6">
      <p className="font-mono text-xs font-semibold tracking-[0.16em] text-[#ff6b73]">RELACIÓN CONCEPTUAL</p>
      <p className="mt-4 text-sm leading-8 text-[#d7dce3]">Sensibilidad Gamma × open interest × escala de contrato/notional → contribución de exposición.</p>
      <p className="mt-3 text-sm leading-7 text-[#a7afb9]">Esta relación explica las entradas generales. GoodTrading no publica aquí constantes de escala, pesos por vencimiento, filtros, rankings ni la normalización final del engine.</p>
    </div>
  );
}

export default function GammaOptionsMethodologyPage() {
  useGammaMetadata();

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
            <li aria-current="page" className="text-[#a7afb9]">Gamma y opciones</li>
          </ol>
        </nav>

        <header className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ff303c]">Metodología de opciones</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">Gamma y opciones en GoodTrading</h1>
          <p className="mt-7 max-w-4xl text-lg leading-8 text-[#d7dce3] sm:text-xl">GoodTrading utiliza datos públicos de opciones de Bitcoin para calcular sensibilidades y estudiar estructura de mercado.</p>
          <p className={bodyClass}>La página separa los campos observados del chain de opciones, las métricas derivadas y las interpretaciones estructurales. No describe fórmulas propietarias ni convierte una lectura de opciones en una afirmación sobre inventario privado o futuro precio.</p>
        </header>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Fuente y procedencia de opciones</h2>
          <p className={bodyClass}>La fuente live de la capa de opciones es el mercado público de opciones de Bitcoin de Deribit. Entre los campos utilizados cuando están disponibles y son válidos se encuentran strike, expiration, tipo call/put, open interest, implied volatility, referencia del subyacente y campos de Greeks o cotización entregados por el proveedor.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#ff303c]/35 bg-[#0a0b0d]/75 p-6"><p className="font-mono text-xs tracking-[0.16em] text-[#ff6b73]">LIVE_DERIBIT</p><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Snapshot obtenido de la API pública live de Deribit y clasificado como fuente live cuando la ingesta entrega datos válidos.</p></div>
            <div className="rounded-2xl border border-white/[0.12] bg-[#0a0b0d]/75 p-6"><p className="font-mono text-xs tracking-[0.16em] text-[#a7afb9]">BOOTSTRAP</p><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Seed o dataset alternativo para continuidad cuando la ingesta live no está disponible. No debe describirse como estado live de Deribit.</p></div>
          </div>
          <p className="mt-6 text-sm leading-7 text-[#737b85]">La fuente, freshness y cobertura forman parte de la interpretación. Un snapshot bootstrap, stale, incompleto o NO_DATA no equivale a una observación live actual.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Qué es Gamma</h2>
          <p className={bodyClass}>Gamma mide cuánto puede cambiar la Delta de una opción cuando cambia el precio del subyacente. Es una sensibilidad de opciones: depende del contrato, del subyacente y de inputs como tiempo y volatilidad bajo una convención de cálculo.</p>
          <p className={bodyClass}>Gamma no es inventario de dealers, flujo ejecutado, actividad de hedging garantizada ni una predicción de precio. En F3, la sensibilidad y la exposición agregada se clasifican como <strong className="text-[#f5f7fa]">DERIVED</strong>; una interpretación sobre presión o régimen puede ser <strong className="text-[#f5f7fa]">STRUCTURAL PROXY</strong>.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Cómo se deriva Gamma Exposure</h2>
          <p className={bodyClass}>GoodTrading combina la sensibilidad Gamma de contratos abiertos con open interest y referencias relevantes del mercado, y agrega las contribuciones a través de strikes y vencimientos. El propósito es estudiar dónde se concentra la sensibilidad de la superficie de opciones.</p>
          <FormulaCallout />
          <p className="mt-6 max-w-4xl text-sm leading-7 text-[#737b85]">La exposición agregada depende de la calidad de las filas elegibles, la IV, el tiempo al vencimiento, la referencia del subyacente y la convención de signo. Una salida faltante no debe interpretarse como exposición cero válida.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Gross Gamma, signed Gamma y calls/puts</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><h3 className="text-lg font-semibold text-white">Gross Gamma</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Mide la magnitud total de las contribuciones Gamma sin permitir que aportes positivos y negativos se cancelen entre sí.</p></div>
            <div className="rounded-2xl border border-[#ff303c]/30 bg-[#0a0b0d]/70 p-6"><h3 className="text-lg font-semibold text-white">Signed / Net Gamma</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Representa el resultado neto después de aplicar una convención de signo estructural. Puede depender de supuestos sobre posicionamiento y no observa quién está long o short.</p></div>
          </div>
          <p className={bodyClass}>Calls y puts pueden contribuir de forma diferente a una agregación firmada. Sin embargo, open interest identifica contratos abiertos, no la propiedad direccional de ambas contrapartes. Por eso el signo del agregado es una convención analítica, no una lectura directa del inventario de dealers.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Gamma por strike y vencimiento</h2>
          <p className={bodyClass}>La agregación por strike permite estudiar concentraciones de sensibilidad y zonas que pueden adquirir relevancia analítica. La agregación por expiration incorpora la estructura temporal: los contratos cercanos al vencimiento pueden comportarse de forma distinta a los de mayor plazo porque cambia el tiempo restante y la sensibilidad.</p>
          <p className={bodyClass}>GoodTrading considera la estructura de vencimientos al estudiar la superficie, pero no publica aquí pesos por expiry, filtros de selección, rankings ni reglas de priorización.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Gamma Regime</h2>
          <p className={bodyClass}>Gamma Regime resume el signo y la estructura de la exposición agregada en un snapshot de opciones. Estados como <strong className="text-[#f5f7fa]">LONG GAMMA</strong> y <strong className="text-[#f5f7fa]">SHORT GAMMA</strong> deben leerse como estados de un modelo estructural: indican una estructura Gamma positiva o negativa estimada, no que los dealers sean definitivamente long o short Gamma.</p>
          <p className="mt-6 max-w-4xl border-l-2 border-[#ff303c] pl-4 text-sm leading-7 text-[#d7dce3]">Un régimen es una clasificación derivada o estructural. No es una observación privada de posiciones ni una señal independiente de ejecución.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Gamma Flip y estructura local/global</h2>
          <p className={bodyClass}>Gamma Flip es una región o nivel modelado donde la curva de Gamma neta estimada cambia de signo o de régimen. Es una salida DERIVED con interpretación STRUCTURAL PROXY cuando se usa como frontera de contexto.</p>
          <p className={bodyClass}>No es un nivel nativo del exchange, puede no existir en un snapshot válido y no debe fabricarse cuando la información no permite identificar un cruce. Una lectura local intenta describir comportamiento cercano al spot; una lectura broad/global describe una estructura más amplia de la superficie. Los criterios operativos exactos no se publican.</p>
          <p className="mt-6"><Link href="/gamma-exposure-bitcoin" className={linkClass}>Ver la explicación pública de Gamma Exposure de Bitcoin</Link></p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Gamma Walls, Magnets y Transition Zones</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-5"><h3 className="font-semibold text-white">Gamma Wall</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Nivel estructural asociado a concentración relevante de Gamma cerca de un strike. No es una pared de liquidez del order book ni garantiza soporte o resistencia.</p></div>
            <div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-5"><h3 className="font-semibold text-white">Gamma Magnet</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Referencia analítica basada en concentración de exposición que puede ser relevante para estudiar comportamiento. No implica atracción mecánica del precio.</p></div>
            <div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-5"><h3 className="font-semibold text-white">Transition Zone</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Área donde la estructura Gamma cambia alrededor de una frontera modelada. No es una zona garantizada de reversión.</p></div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Vanna y Charm</h2>
          <p className={bodyClass}><strong className="text-[#f5f7fa]">Vanna</strong> describe una sensibilidad cruzada relacionada con cómo cambia Delta cuando cambia la volatilidad implícita. <strong className="text-[#f5f7fa]">Charm</strong> describe cómo puede cambiar Delta con el paso del tiempo, manteniendo conceptualmente controlados otros inputs del modelo.</p>
          <p className={bodyClass}>En GoodTrading, Vanna y Charm son exposiciones DERIVED calculadas desde la capa de opciones cuando existen spot, strike, vencimiento futuro, OI e IV válidos. No son compras o ventas de dealers observadas. Estados como positivo, negativo, estabilizando, neutralizando o mixto resumen cambios de sensibilidades derivadas; no son thresholds publicados ni flujo ejecutado.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Dealer pressure, positioning pressure y structural acceleration</h2>
          <p className={bodyClass}>GoodTrading puede usar sensibilidades y estructura de opciones para estimar condiciones relacionadas con presión de hedging, distribución de posicionamiento o aceleración estructural. Estas salidas se clasifican como <strong className="text-[#f5f7fa]">STRUCTURAL PROXY</strong>.</p>
          <p className={bodyClass}>Dealer pressure no significa que GoodTrading observe inventario privado u órdenes de hedge. Structural acceleration no es un feed de liquidaciones ni una probabilidad estadística salvo que una versión futura publique explícitamente esa calibración. Squeeze o cascade risk, cuando aparecen como salidas del sistema, son modelos de condiciones y no pruebas de un evento futuro.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Mapa de capas</h2>
          <div className="mt-8 grid gap-3 text-center font-mono text-xs tracking-wide">
            <div className="rounded-xl border border-white/[0.15] bg-[#0a0b0d]/80 p-4 text-[#f5f7fa]">DERIBIT OPTION CHAIN — OBSERVED</div>
            <div className="text-[#ff303c]">↓</div>
            <div className="rounded-xl border border-[#ff303c]/35 bg-[#ff303c]/[0.06] p-4 text-[#f5f7fa]">GAMMA / VANNA / CHARM — DERIVED</div>
            <div className="text-[#ff303c]">↓</div>
            <div className="rounded-xl border border-[#a7afb9]/35 bg-[#0a0b0d]/80 p-4 text-[#f5f7fa]">REGIME / EXPOSURE STRUCTURE — DERIVED / STRUCTURAL PROXY</div>
            <div className="text-[#ff303c]">↓</div>
            <div className="rounded-xl border border-[#737b85]/45 bg-[#0a0b0d]/80 p-4 text-[#f5f7fa]">PRESSURE / MAGNET INTERPRETATION — STRUCTURAL PROXY</div>
            <div className="text-[#ff303c]">↓</div>
            <div className="rounded-xl border border-white/[0.10] bg-[#0a0b0d]/80 p-4 text-[#f5f7fa]">AI EXPLANATION — AI INTERPRETATION</div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Qué Gamma no permite saber</h2>
          <ul className="mt-6 max-w-4xl space-y-3 text-[15px] leading-8 text-[#a7afb9] sm:text-base">
            <li>No revela con certeza la dirección futura.</li>
            <li>No revela el inventario exacto de dealers o instituciones.</li>
            <li>No revela el hedge flow exacto ni la intención institucional.</li>
            <li>No garantiza que un nivel mantenga, que el precio revierta o que llegue a un magnet.</li>
            <li>No convierte open interest en una lectura de ownership direccional.</li>
          </ul>
          <p className="mt-6 max-w-4xl border-l-2 border-[#ff303c] pl-4 text-sm leading-7 text-[#d7dce3]">La estructura de opciones aporta contexto analítico, no certeza.</p>
        </section>

        <section className={sectionClass}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Freshness, validación y límites públicos</h2>
          <p className={bodyClass}>Los cálculos dependen de la frescura y completitud del snapshot de opciones. Si los inputs son stale, unavailable o parciales, las métricas derivadas no deben tratarse como observaciones actuales.</p>
          <p className={bodyClass}>GoodTrading puede validar cálculos deterministas de opciones contra inputs independientes de fila o agregados cuando corresponde. Esa validación no implica revisión externa ni publica fixtures, código o fórmulas completas.</p>
          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/methodology/data-sources" className={linkClass}>Fuentes de datos y procedencia</Link><Link href="/methodology/classification" className={linkClass}>Taxonomía OBSERVED / DERIVED / PROXY</Link><Link href="/about" className={linkClass}>Qué es GoodTrading</Link></p>
        </section>

        <section className={`${sectionClass} pb-4`}>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Preguntas frecuentes</h2>
          <div className="mt-8 space-y-3">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 px-5 py-4">
                <summary className="cursor-pointer list-none pr-8 text-sm font-medium text-[#f5f7fa] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff303c]/70">{question}</summary>
                <p className="mt-3 text-sm leading-7 text-[#a7afb9]">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </article>
    </MarketingLayout>
  );
}
