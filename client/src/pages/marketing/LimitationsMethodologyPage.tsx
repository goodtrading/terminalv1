import { useEffect } from "react";
import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const PAGE_TITLE = "Limitaciones de GoodTrading | Riesgo de modelo y metodología";
const PAGE_DESCRIPTION = "Conocé las limitaciones de los datos, métricas derivadas, proxies estructurales e interpretaciones de IA utilizadas por GoodTrading.";
const CANONICAL = "https://goodtrading.com.ar/methodology/limitations";

function useLimitationsMetadata() {
  useEffect(() => {
    const previousTitle = document.title;
    const previousDescription = document.querySelector('meta[name="description"]')?.getAttribute("content");
    const canonical = document.querySelector('link[rel="canonical"]');
    const previousCanonical = canonical?.getAttribute("href");
    document.title = PAGE_TITLE;
    document.querySelector('meta[name="description"]')?.setAttribute("content", PAGE_DESCRIPTION);
    canonical?.setAttribute("href", CANONICAL);
    return () => {
      document.title = previousTitle;
      if (previousDescription) document.querySelector('meta[name="description"]')?.setAttribute("content", previousDescription);
      if (previousCanonical) canonical?.setAttribute("href", previousCanonical);
    };
  }, []);
}

const sectionClass = "mt-16 border-t border-white/[0.08] pt-12";
const bodyClass = "mt-5 max-w-4xl text-[15px] leading-8 text-[#a7afb9] sm:text-base";
const linkClass = "text-[#ff6b73] underline decoration-[#ff303c]/50 underline-offset-4 hover:text-white";

const taxonomyRows = [
  ["OBSERVED", "Dato recibido de un exchange o proveedor en un momento concreto.", "Tiene fuente, timestamp, venue y calidad de feed; no es verdad perfecta ni futuro garantizado."],
  ["DERIVED", "Cálculo determinista basado en uno o más inputs observados.", "Depende de inputs, unidades, convenciones y supuestos de cálculo."],
  ["STRUCTURAL PROXY", "Modelo que aproxima una condición que no puede observarse directamente.", "Puede ser útil como contexto, pero no prueba inventario privado, causalidad ni intención."],
  ["AI INTERPRETATION", "Explicación o síntesis generada sobre las capas anteriores.", "Hereda sus límites y no convierte una inferencia en un hecho observado."],
];

const riskRows = [
  ["Order book", "Liquidez visible cancelable, movible, parcial o reemplazable.", "No tratar una pared o heatmap como ejecución futura garantizada."],
  ["Order Flow", "Mide actividad ejecutada, no identidad, motivo ni posición total.", "Una operación agresiva grande no garantiza continuidad."],
  ["Opciones", "OI identifica contratos abiertos, no quién está long/short ni el dealer.", "Gamma firmado y presión de dealers son modelos estructurales."],
  ["Freshness", "Feeds, snapshots y proveedores tienen ritmos y gaps diferentes.", "Un input stale no equivale al estado actual del mercado."],
  ["Venue", "Binance y Deribit representan sus propios mercados.", "No asumir que un venue es todo el mercado global."],
];

const terminologyRows = [
  ["Institutional Bias", "Puede sonar a inventario institucional observado.", "Sesgo institucional modelado", "Sí"],
  ["Dealer Reaction Map", "Puede sugerir órdenes privadas visibles.", "Mapa estructural de presión modelada", "Sí"],
  ["Squeeze Probability", "Puede presentar un score heurístico como probabilidad calibrada.", "Squeeze conditions / squeeze pressure", "Sí"],
  ["expansionProbability", "El nombre puede implicar calibración estadística.", "Expansion conditions modeladas", "Sí"],
  ["Trade Decision", "Puede sugerir recomendación o certeza operativa.", "Contexto o condición analítica", "Sí"],
  ["positionSizeSuggestion", "Puede confundirse con sizing apropiado garantizado.", "Sugerencia modelada, no instrucción", "Sí"],
  ["Dealer pressure", "Puede confundirse con inventario privado.", "Presión de dealers modelada", "Sí"],
  ["Gamma Magnet", "Puede implicar atracción mecánica del precio.", "Referencia estructural de Gamma", "No"],
];

const faqs = [
  ["¿GoodTrading puede ver posiciones reales de dealers?", "No. GoodTrading no tiene visibilidad directa del inventario privado ni de las órdenes de hedge de los dealers. Las salidas relacionadas se clasifican como STRUCTURAL PROXY."],
  ["¿Gamma predice el precio?", "No. Gamma es una sensibilidad y Gamma Exposure es una métrica derivada. Pueden aportar contexto, pero no garantizan dirección ni reacción futura."],
  ["¿Una Gamma Magnet garantiza que el precio llegue allí?", "No. Es una referencia analítica basada en concentración estructural de Gamma, no un objetivo garantizado ni una atracción mecánica."],
  ["¿El heatmap muestra órdenes que necesariamente se ejecutarán?", "No. Visualiza liquidez mostrada a lo largo del tiempo. Esa liquidez puede cancelarse, moverse o no ejecutarse."],
  ["¿Order Flow identifica quién está operando?", "No. Describe actividad ejecutada y su interacción con liquidez resting, pero no identifica trader, institución, inventario o motivo."],
  ["¿Los modelos de GoodTrading son probabilidades?", "No automáticamente. Un score o estado modelado no es una probabilidad estadística calibrada sin validación y calibración explícitas."],
  ["¿La IA puede saber algo que los datos no muestran?", "No. Puede resumir, comparar y contextualizar la información disponible, pero no crear hechos faltantes ni eliminar la incertidumbre."],
  ["¿Qué significa unavailable o null?", "Significa que no hay evidencia suficiente o válida para producir una salida. Es un estado correcto y preferible a fabricar cero, señal o nivel."],
];

function TaxonomyTable() {
  return <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.10]"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-white/[0.05] text-xs uppercase tracking-[0.12em] text-[#d7dce3]"><tr><th className="px-5 py-4">Capa</th><th className="px-5 py-4">Qué significa</th><th className="px-5 py-4">Riesgo principal</th></tr></thead><tbody>{taxonomyRows.map(([layer, meaning, risk]) => <tr key={layer} className="border-t border-white/[0.08] align-top"><td className="px-5 py-5 font-mono text-xs text-[#ff6b73]">{layer}</td><td className="px-5 py-5 leading-7 text-[#d7dce3]">{meaning}</td><td className="px-5 py-5 leading-7 text-[#a7afb9]">{risk}</td></tr>)}</tbody></table></div>;
}

export default function LimitationsMethodologyPage() {
  useLimitationsMetadata();
  return <MarketingLayout><article className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
    <nav aria-label="Breadcrumb" className="mb-10 text-sm text-[#737b85]"><ol className="flex flex-wrap items-center gap-2"><li><Link href="/" className="marketing-focus-ring hover:text-white">Inicio</Link></li><li aria-hidden="true">/</li><li><Link href="/methodology/data-sources" className="marketing-focus-ring hover:text-white">Fuentes de datos</Link></li><li aria-hidden="true">/</li><li aria-current="page" className="text-[#a7afb9]">Limitaciones</li></ol></nav>
    <header className="max-w-4xl"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ff303c]">Riesgo de modelo</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">Limitaciones y riesgo de modelo en GoodTrading</h1><p className="mt-7 text-lg leading-8 text-[#d7dce3] sm:text-xl">GoodTrading combina datos observados, métricas derivadas, modelos estructurales e interpretación de IA.</p><p className={bodyClass}>Cada capa agrega utilidad, pero también introduce distintos tipos de incertidumbre. Ninguna métrica debe interpretarse fuera de su fuente, timestamp, freshness, supuestos y clasificación metodológica.</p></header>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">La utilidad no elimina la incertidumbre</h2><p className={bodyClass}>Esta página no es un disclaimer separado del producto. Es una guía técnica para entender dónde entra la incertidumbre en el recorrido desde un feed de mercado hasta una explicación analítica.</p><TaxonomyTable /><div className="mt-8 rounded-2xl border border-[#ff303c]/30 bg-[#ff303c]/[0.06] p-6"><p className="font-mono text-xs tracking-[0.16em] text-[#ff6b73]">PRINCIPIO DE CONFIANZA</p><p className="mt-4 text-base leading-8 text-[#d7dce3]">Cuando la evidencia no alcanza, <strong className="text-white">null, unavailable o no valid level</strong> son salidas correctas. GoodTrading no debería fabricar una señal únicamente para completar la interfaz.</p></div></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Limitaciones de datos observados</h2><p className={bodyClass}>OBSERVED significa que la información fue recibida directamente de una fuente, no que sea perfecta, completa o predictiva.</p><div className="mt-8 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><h3 className="font-semibold text-white">Order book y liquidez visible</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">La liquidez mostrada puede cancelarse, moverse, ser parcialmente ejecutada, reemplazarse o reflejar comportamiento de corta duración. GoodTrading no conoce directamente la intención detrás de cada orden.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><h3 className="font-semibold text-white">Feeds y snapshots</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Los feeds pueden desconectarse, retrasarse o perder mensajes. Un snapshot describe un momento y un venue; no representa automáticamente todo el mercado global.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><h3 className="font-semibold text-white">Order Flow</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Los trades agregados representan actividad ejecutada. La clasificación del agresor describe su interacción con liquidez resting, no identidad, motivo, inventario total ni dirección futura.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><h3 className="font-semibold text-white">Heatmap y spoofing</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Un heatmap visualiza liquidez mostrada en el tiempo; no prueba ejecución, soporte o intención. Spoofing y pulling son inferencias sobre comportamiento de órdenes, no conclusiones legales sobre intención.</p></div></div><p className={bodyClass}>Absorption también es una interpretación de ejecuciones agresivas interactuando con liquidez pasiva. No prueba quién era el participante pasivo ni cuál era su motivo.</p></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Opciones, open interest y Gamma</h2><p className={bodyClass}>Open interest muestra contratos abiertos. No identifica quién está long o short, cuál lado corresponde a un dealer, quién es el participante, cuál es su intención ni cuál será su hedge.</p><p className={bodyClass}>Gamma Exposure depende de la calidad y freshness del chain, volatilidad, estructura de expiries, referencia del subyacente y convenciones de modelado. Gamma, Vanna y Charm son sensibilidades derivadas, no compras, ventas u órdenes de hedge observadas.</p><div className="mt-8 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-5"><h3 className="font-semibold text-white">Gamma</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Referencia derivada de sensibilidad, no predicción cierta de precio.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-5"><h3 className="font-semibold text-white">Vanna / Charm</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Cambios de sensibilidad frente a volatilidad o paso del tiempo, no flow observado.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-5"><h3 className="font-semibold text-white">Dealer model</h3><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Dealer pressure y hedging pressure son STRUCTURAL PROXY.</p></div></div></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Riesgo de modelos estructurales</h2><p className={bodyClass}>Structural Acceleration, Options Positioning Pressure, Squeeze, Market Mode, regímenes, walls, magnets, transition zones y Gamma Flip pueden resumir condiciones de mercado, pero no prueban causalidad ni garantizan reacción.</p><p className={bodyClass}>Una relación histórica entre Gamma, liquidez, Order Flow, posicionamiento y precio no demuestra por sí sola que una variable cause la otra. Bitcoin puede estar afectado simultáneamente por múltiples factores.</p><p className={bodyClass}>Los regímenes también pueden quedar stale cuando cambian las entradas. Un régimen es una clasificación de condiciones actuales, no una predicción.</p></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Venue, fallback, historial y freshness</h2><div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.10]"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-white/[0.05] text-xs uppercase tracking-[0.12em] text-[#d7dce3]"><tr><th className="px-5 py-4">Riesgo</th><th className="px-5 py-4">Qué puede ocurrir</th><th className="px-5 py-4">Interpretación correcta</th></tr></thead><tbody>{riskRows.map(([name, issue, interpretation]) => <tr key={name} className="border-t border-white/[0.08] align-top"><td className="px-5 py-5 font-medium text-white">{name}</td><td className="px-5 py-5 leading-7 text-[#a7afb9]">{issue}</td><td className="px-5 py-5 leading-7 text-[#d7dce3]">{interpretation}</td></tr>)}</tbody></table></div><p className={bodyClass}>Los proveedores alternativos pueden diferir en precio, velas, liquidez, timestamps y microestructura. No se publica la cadena operativa de fallback. Históricos y order-book samples también pueden estar limitados por retención, cache local, resolución, gaps de reconnect y profundidad histórica.</p><p className={bodyClass}>Binance representa los mercados de Binance y Deribit representa su mercado de opciones. Ninguno equivale por sí solo a toda la actividad global de Bitcoin.</p></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">IA: explicación, no evidencia nueva</h2><p className={bodyClass}>La IA puede resumir, explicar, comparar y contextualizar el contexto de GoodTrading. No puede crear datos faltantes, conocer inventario privado, garantizar resultados, convertir un proxy en OBSERVED ni quitar incertidumbre a los modelos subyacentes.</p><p className={bodyClass}>Las explicaciones generadas pueden contener incertidumbre y deben permanecer ancladas a los inputs disponibles. No se afirma que la generación de texto sea infalible.</p></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Score no significa probabilidad</h2><p className={bodyClass}>Un score heurístico o un estado de modelo no es automáticamente una probabilidad estadística calibrada. Sólo una métrica con calibración, validación y definición estadística explícitas debería presentarse como probabilidad o porcentaje de likelihood.</p><p className={bodyClass}>Los nombres actuales con apariencia probabilística, como <code className="text-[#f5f7fa]">Squeeze Probability</code> o <code className="text-[#f5f7fa]">expansionProbability</code>, requieren interpretación cuidadosa hasta que exista una calibración pública verificable. Esta slice documenta el riesgo, pero no modifica labels.</p></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Cómo interpretar cada salida</h2><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><p className="font-mono text-xs text-[#ff6b73]">OBSERVED</p><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Hecho de mercado recibido de una fuente en un timestamp. Sigue teniendo riesgo de venue, delay, cancelación o cobertura incompleta.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><p className="font-mono text-xs text-[#ff6b73]">DERIVED</p><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Cálculo basado en observaciones; depende de inputs, unidades y convenciones.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><p className="font-mono text-xs text-[#ff6b73]">STRUCTURAL PROXY</p><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Interpretación modelada de una condición que no puede observarse directamente.</p></div><div className="rounded-2xl border border-white/[0.10] bg-[#0a0b0d]/70 p-6"><p className="font-mono text-xs text-[#ff6b73]">AI INTERPRETATION</p><p className="mt-3 text-sm leading-7 text-[#a7afb9]">Contextualización downstream que hereda las limitaciones de las capas anteriores.</p></div></div></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Terminología que requiere cuidado</h2><div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.10]"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-white/[0.05] text-xs uppercase tracking-[0.12em] text-[#d7dce3]"><tr><th className="px-5 py-4">Label</th><th className="px-5 py-4">Riesgo</th><th className="px-5 py-4">Interpretación pública</th><th className="px-5 py-4">Rename recomendado</th></tr></thead><tbody>{terminologyRows.map(([label, risk, wording, rename]) => <tr key={label} className="border-t border-white/[0.08] align-top"><td className="px-5 py-5 font-mono text-xs text-[#ff6b73]">{label}</td><td className="px-5 py-5 leading-7 text-[#a7afb9]">{risk}</td><td className="px-5 py-5 leading-7 text-[#d7dce3]">{wording}</td><td className="px-5 py-5 text-[#a7afb9]">{rename}</td></tr>)}</tbody></table></div></section>

    <section className={sectionClass}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Qué GoodTrading no afirma</h2><ul className="mt-6 max-w-4xl space-y-3 text-[15px] leading-8 text-[#a7afb9] sm:text-base"><li>No conoce inventario institucional privado.</li><li>No predice cada movimiento del mercado.</li><li>No garantiza que un nivel mantenga, revierta o sea alcanzado.</li><li>No garantiza rentabilidad.</li><li>No observa el hedge flow futuro.</li><li>No conoce el motivo detrás de cada orden.</li><li>No convierte modelos estructurales en certeza.</li></ul></section>

    <section className={`${sectionClass} pb-4`}><h2 className="text-2xl font-semibold text-white sm:text-3xl">Preguntas frecuentes</h2><div className="mt-8 space-y-3">{faqs.map(([question, answer]) => <details key={question} className="group rounded-xl border border-white/[0.08] bg-[#0a0b0d]/70 px-5 py-4"><summary className="cursor-pointer list-none pr-8 text-sm font-medium text-[#f5f7fa]">{question}</summary><p className="mt-3 text-sm leading-7 text-[#a7afb9]">{answer}</p></details>)}</div><p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/about" className={linkClass}>Qué es GoodTrading</Link><Link href="/methodology/data-sources" className={linkClass}>Fuentes de datos</Link><Link href="/methodology/classification" className={linkClass}>Clasificación</Link><Link href="/methodology/gamma-options" className={linkClass}>Gamma y opciones</Link></p></section>
  </article></MarketingLayout>;
}
