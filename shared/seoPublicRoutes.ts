/** Public marketing SEO routes (home meta lives in client/index.html). */

export const SEO_SITE_ORIGIN = "https://goodtrading.com.ar";
export const SEO_OG_IMAGE = `${SEO_SITE_ORIGIN}/opengraph.jpg`;
export const SEO_ROBOTS = "index,follow,max-image-preview:large";

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
  return PUBLIC_SEO_LANDINGS.find((page) => page.path === path) ?? null;
}

export function canonicalUrlForPath(path: string): string {
  const normalized = normalizePublicSeoPath(path);
  if (normalized === "/") return `${SEO_SITE_ORIGIN}/`;
  return `${SEO_SITE_ORIGIN}${normalized}`;
}
