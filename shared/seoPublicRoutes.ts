/** Public marketing SEO routes (home meta lives in client/index.html). */

export const SEO_SITE_ORIGIN = "https://goodtrading.com.ar";
export const SEO_OG_IMAGE = `${SEO_SITE_ORIGIN}/opengraph.jpg`;
export const SEO_ROBOTS = "index,follow,max-image-preview:large";
export const ABOUT_PAGE_SEO = {
  path: "/about",
  title: "Qué es GoodTrading | Trading Technology, Order Flow y Bitcoin",
  description:
    "Conocé qué es GoodTrading, quién lo fundó y cómo funciona su ecosistema de análisis de Bitcoin, Order Flow, liquidez, opciones y microestructura de mercado.",
  ogTitle: "Qué es GoodTrading | Trading Technology, Order Flow y Bitcoin",
  ogDescription:
    "Conocé qué es GoodTrading, quién lo fundó y cómo funciona su ecosistema de análisis de Bitcoin, Order Flow, liquidez, opciones y microestructura de mercado.",
  twitterTitle: "Qué es GoodTrading | Trading Technology, Order Flow y Bitcoin",
  twitterDescription:
    "La página oficial sobre GoodTrading, su fundador, GoodTrading Terminal y su foco en análisis de Bitcoin.",
  breadcrumbName: "Qué es GoodTrading",
  webpageName: "Qué es GoodTrading",
} as const;
export const DATA_SOURCES_PAGE_SEO = {
  path: "/methodology/data-sources",
  title: "Fuentes de datos de GoodTrading | Metodología y transparencia",
  description:
    "Conocé de dónde obtiene GoodTrading sus datos de Bitcoin, Order Flow, liquidez y opciones, y cómo distingue información observada de métricas calculadas y modelos estructurales.",
  ogTitle: "Fuentes de datos de GoodTrading | Metodología y transparencia",
  ogDescription:
    "Fuentes de datos de Bitcoin, Order Flow, liquidez y opciones de GoodTrading, con una distinción clara entre observaciones y métricas calculadas.",
  twitterTitle: "Fuentes de datos y metodología | GoodTrading",
  twitterDescription:
    "Cómo GoodTrading documenta fuentes, timestamps, transformaciones, unidades e interpretación de sus métricas.",
  breadcrumbName: "Fuentes de datos",
  webpageName: "Fuentes de datos y metodología",
} as const;
export const CLASSIFICATION_PAGE_SEO = {
  path: "/methodology/classification",
  title: "Cómo clasifica GoodTrading sus datos y modelos | Metodología",
  description:
    "Conocé la diferencia entre datos observados, métricas derivadas, proxies estructurales e interpretaciones de IA dentro de GoodTrading.",
  ogTitle: "Cómo clasifica GoodTrading sus datos y modelos | Metodología",
  ogDescription:
    "La clasificación pública de GoodTrading: OBSERVED, DERIVED, STRUCTURAL PROXY y AI INTERPRETATION.",
  twitterTitle: "Clasificación de datos y modelos | GoodTrading",
  twitterDescription:
    "Diferencias entre observación, cálculo, proxy estructural e interpretación de IA en GoodTrading.",
  breadcrumbName: "Clasificación",
  webpageName: "Cómo clasifica GoodTrading sus datos y modelos",
} as const;
export const GAMMA_OPTIONS_PAGE_SEO = {
  path: "/methodology/gamma-options",
  title: "Cómo calcula GoodTrading Gamma y opciones | Metodología",
  description:
    "Conocé cómo GoodTrading utiliza datos de opciones de Bitcoin para analizar Gamma, Vanna, Charm, Gamma Flip, niveles estructurales y posicionamiento del mercado.",
  ogTitle: "Cómo calcula GoodTrading Gamma y opciones | Metodología",
  ogDescription:
    "Metodología pública de GoodTrading para interpretar opciones de Bitcoin, Gamma, Vanna, Charm y estructura de mercado.",
  twitterTitle: "Gamma y opciones en GoodTrading | Metodología",
  twitterDescription:
    "Qué representan Gamma, Gamma Exposure, Gamma Flip, walls, magnets, Vanna y Charm en GoodTrading.",
  breadcrumbName: "Gamma y opciones",
  webpageName: "Gamma y opciones en GoodTrading",
} as const;
export const LIMITATIONS_PAGE_SEO = {
  path: "/methodology/limitations",
  title: "Limitaciones de GoodTrading | Riesgo de modelo y metodología",
  description:
    "Conocé las limitaciones de los datos, métricas derivadas, proxies estructurales e interpretaciones de IA utilizadas por GoodTrading.",
  ogTitle: "Limitaciones de GoodTrading | Riesgo de modelo y metodología",
  ogDescription:
    "Cómo interpretar la incertidumbre, los supuestos y el riesgo de modelo en las analíticas de GoodTrading.",
  twitterTitle: "Limitaciones y riesgo de modelo | GoodTrading",
  twitterDescription:
    "Limitaciones de datos observados, métricas derivadas, proxies estructurales e interpretaciones de IA.",
  breadcrumbName: "Limitaciones",
  webpageName: "Limitaciones y riesgo de modelo en GoodTrading",
} as const;

export type PublicSeoLanding = {
  path: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  twitterTitle: string;
  twitterDescription: string;
  breadcrumbName: string;
  webpageName: string;
};

export const PUBLIC_SEO_LANDINGS: readonly PublicSeoLanding[] = [
  {
    path: "/terminal-trading-cripto",
    title: "Terminal de Trading Cripto para Bitcoin | GoodTrading",
    description:
      "Terminal de trading cripto con Order Flow, gamma, opciones, niveles operativos y paper trading para analizar Bitcoin con contexto institucional.",
    ogTitle: "Terminal de Trading Cripto para Bitcoin | GoodTrading",
    ogDescription:
      "Terminal de trading cripto con Order Flow, gamma, opciones, niveles operativos y paper trading para analizar Bitcoin.",
    twitterTitle: "Terminal de Trading Cripto para Bitcoin | GoodTrading",
    twitterDescription:
      "Analizá Bitcoin con Order Flow, gamma, opciones, niveles y paper trading en GoodTrading Terminal.",
    breadcrumbName: "Terminal de trading cripto",
    webpageName: "Terminal de Trading Cripto para Bitcoin",
  },
  {
    path: "/order-flow-bitcoin",
    title: "Order Flow en Bitcoin: Delta, Absorción y Liquidez | GoodTrading",
    description:
      "Aprendé a interpretar el Order Flow de Bitcoin mediante delta, absorción, agresión, liquidez pasiva y contexto estructural dentro de GoodTrading.",
    ogTitle: "Order Flow en Bitcoin: Delta, Absorción y Liquidez | GoodTrading",
    ogDescription:
      "Interpretá delta, absorción, agresión y liquidez pasiva de Bitcoin con contexto estructural en GoodTrading.",
    twitterTitle: "Order Flow en Bitcoin | GoodTrading",
    twitterDescription:
      "Delta, absorción, agresión y liquidez pasiva para leer el Order Flow de Bitcoin en GoodTrading.",
    breadcrumbName: "Order Flow en Bitcoin",
    webpageName: "Order Flow en Bitcoin: Delta, Absorción y Liquidez",
  },
  {
    path: "/gamma-exposure-bitcoin",
    title: "Gamma Exposure de Bitcoin: Flip, Walls y Régimen | GoodTrading",
    description:
      "Interpretá la Gamma Exposure de Bitcoin mediante gamma flip, call wall, put wall, régimen y zonas de transición dentro de GoodTrading Terminal.",
    ogTitle: "Gamma Exposure de Bitcoin: Flip, Walls y Régimen | GoodTrading",
    ogDescription:
      "Gamma flip, call wall, put wall y régimen de dealers para contextualizar Bitcoin en GoodTrading Terminal.",
    twitterTitle: "Gamma Exposure de Bitcoin | GoodTrading",
    twitterDescription:
      "Flip, walls y régimen de gamma para leer Bitcoin con contexto institucional en GoodTrading.",
    breadcrumbName: "Gamma Exposure de Bitcoin",
    webpageName: "Gamma Exposure de Bitcoin: Flip, Walls y Régimen",
  },
  {
    path: "/heatmap-liquidez-bitcoin",
    title: "Heatmap de Liquidez en Bitcoin | GoodTrading",
    description:
      "Analizá la liquidez pasiva de Bitcoin mediante heatmap, paredes, persistencia, consumo, pulling y spoofing dentro de GoodTrading Terminal.",
    ogTitle: "Heatmap de Liquidez en Bitcoin | GoodTrading",
    ogDescription:
      "Heatmap, paredes, persistencia, consumo, pulling y spoofing para leer liquidez pasiva de Bitcoin.",
    twitterTitle: "Heatmap de Liquidez en Bitcoin | GoodTrading",
    twitterDescription:
      "Leé liquidez resting, paredes y consumo de Bitcoin con heatmap en GoodTrading Terminal.",
    breadcrumbName: "Heatmap de liquidez",
    webpageName: "Heatmap de Liquidez en Bitcoin",
  },
] as const;

export function normalizePublicSeoPath(rawPath: string): string {
  const pathOnly = (rawPath.split("?")[0] || "/").split("#")[0] || "/";
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }
  return pathOnly || "/";
}

export function getPublicSeoLanding(rawPath: string): PublicSeoLanding | null {
  const path = normalizePublicSeoPath(rawPath);
  if (path === ABOUT_PAGE_SEO.path) return ABOUT_PAGE_SEO;
  if (path === DATA_SOURCES_PAGE_SEO.path) return DATA_SOURCES_PAGE_SEO;
  if (path === CLASSIFICATION_PAGE_SEO.path) return CLASSIFICATION_PAGE_SEO;
  if (path === GAMMA_OPTIONS_PAGE_SEO.path) return GAMMA_OPTIONS_PAGE_SEO;
  if (path === LIMITATIONS_PAGE_SEO.path) return LIMITATIONS_PAGE_SEO;
  return PUBLIC_SEO_LANDINGS.find((page) => page.path === path) ?? null;
}

export function canonicalUrlForPath(path: string): string {
  const normalized = normalizePublicSeoPath(path);
  if (normalized === "/") return `${SEO_SITE_ORIGIN}/`;
  return `${SEO_SITE_ORIGIN}${normalized}`;
}
