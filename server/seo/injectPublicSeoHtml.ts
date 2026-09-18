import {
  SEO_OG_IMAGE,
  SEO_ROBOTS,
  SEO_SITE_ORIGIN,
  canonicalUrlForPath,
  getPublicSeoLanding,
  type PublicSeoLanding,
} from "@shared/seoPublicRoutes";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceTagContent(html: string, tag: string, content: string): string {
  const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(</${tag}>)`, "i");
  if (!re.test(html)) {
    return html.replace(/<\/head>/i, `    <${tag}>${content}</${tag}>\n  </head>`);
  }
  return html.replace(re, `$1${content}$3`);
}

function replaceMetaByName(html: string, name: string, content: string): string {
  const re = new RegExp(
    `(<meta\\b[^>]*\\bname=["']${name}["'][^>]*\\bcontent=["'])([^"']*)(["'][^>]*>)`,
    "i",
  );
  const reAlt = new RegExp(
    `(<meta\\b[^>]*\\bcontent=["'])([^"']*)(["'][^>]*\\bname=["']${name}["'][^>]*>)`,
    "i",
  );
  if (re.test(html)) return html.replace(re, `$1${escapeHtmlAttr(content)}$3`);
  if (reAlt.test(html)) return html.replace(reAlt, `$1${escapeHtmlAttr(content)}$3`);
  return html.replace(
    /<\/head>/i,
    `    <meta name="${name}" content="${escapeHtmlAttr(content)}" />\n  </head>`,
  );
}

function replaceMetaByProperty(html: string, property: string, content: string): string {
  const re = new RegExp(
    `(<meta\\b[^>]*\\bproperty=["']${property}["'][^>]*\\bcontent=["'])([^"']*)(["'][^>]*>)`,
    "i",
  );
  const reAlt = new RegExp(
    `(<meta\\b[^>]*\\bcontent=["'])([^"']*)(["'][^>]*\\bproperty=["']${property}["'][^>]*>)`,
    "i",
  );
  if (re.test(html)) return html.replace(re, `$1${escapeHtmlAttr(content)}$3`);
  if (reAlt.test(html)) return html.replace(reAlt, `$1${escapeHtmlAttr(content)}$3`);
  return html.replace(
    /<\/head>/i,
    `    <meta property="${property}" content="${escapeHtmlAttr(content)}" />\n  </head>`,
  );
}

function replaceCanonical(html: string, href: string): string {
  const re = /(<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'])([^"']*)(["'][^>]*>)/i;
  const reAlt = /(<link\b[^>]*\bhref=["'])([^"']*)(["'][^>]*\brel=["']canonical["'][^>]*>)/i;
  if (re.test(html)) return html.replace(re, `$1${escapeHtmlAttr(href)}$3`);
  if (reAlt.test(html)) return html.replace(reAlt, `$1${escapeHtmlAttr(href)}$3`);
  return html.replace(
    /<\/head>/i,
    `    <link rel="canonical" href="${escapeHtmlAttr(href)}" />\n  </head>`,
  );
}

function buildLandingJsonLd(page: PublicSeoLanding): string {
  const url = canonicalUrlForPath(page.path);
  if (page.path === "/about") {
    const organization = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SEO_SITE_ORIGIN}/#organization`,
      name: "GoodTrading",
      url: `${SEO_SITE_ORIGIN}/`,
      logo: `${SEO_SITE_ORIGIN}/logo.png`,
      foundingDate: "2022",
      description:
        "GoodTrading es una empresa argentina de tecnología y educación aplicada al trading, especializada en Bitcoin, Order Flow, liquidez, opciones y microestructura de mercado.",
      founder: {
        "@type": "Person",
        "@id": `${url}#ignacio-rabanal`,
        name: "Ignacio Rabanal",
      },
    };
    const aboutPage = {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "@id": `${url}#webpage`,
      url,
      name: "Qué es GoodTrading",
      description: page.description,
      about: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      isPartOf: { "@id": `${SEO_SITE_ORIGIN}/#website` },
      inLanguage: "es-AR",
    };
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${SEO_SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Qué es GoodTrading", item: url },
      ],
    };
    return [organization, aboutPage, breadcrumb]
      .map((entity) => `<script type="application/ld+json">\n${JSON.stringify(entity, null, 2)}\n    </script>`)
      .join("\n    ");
  }
  if (page.path === "/methodology/data-sources") {
    const article = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${url}#article`,
      url,
      headline: page.title,
      description: page.description,
      about: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      isPartOf: { "@id": `${SEO_SITE_ORIGIN}/#website` },
      inLanguage: "es-AR",
      author: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      publisher: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
    };
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${SEO_SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Qué es GoodTrading", item: `${SEO_SITE_ORIGIN}/about` },
        { "@type": "ListItem", position: 3, name: page.breadcrumbName, item: url },
      ],
    };
    return [article, breadcrumb]
      .map((entity) => `<script type="application/ld+json">\n${JSON.stringify(entity, null, 2)}\n    </script>`)
      .join("\n    ");
  }
  if (page.path === "/methodology/classification") {
    const article = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${url}#article`,
      url,
      headline: page.title,
      description: page.description,
      about: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      isPartOf: { "@id": `${SEO_SITE_ORIGIN}/#website` },
      inLanguage: "es-AR",
      author: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      publisher: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
    };
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${SEO_SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Qué es GoodTrading", item: `${SEO_SITE_ORIGIN}/about` },
        { "@type": "ListItem", position: 3, name: "Fuentes de datos", item: `${SEO_SITE_ORIGIN}/methodology/data-sources` },
        { "@type": "ListItem", position: 4, name: page.breadcrumbName, item: url },
      ],
    };
    return [article, breadcrumb]
      .map((entity) => `<script type="application/ld+json">\n${JSON.stringify(entity, null, 2)}\n    </script>`)
      .join("\n    ");
  }
  if (page.path === "/methodology/gamma-options") {
    const article = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${url}#article`,
      url,
      headline: page.title,
      description: page.description,
      about: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      isPartOf: { "@id": `${SEO_SITE_ORIGIN}/#website` },
      inLanguage: "es-AR",
      author: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      publisher: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
    };
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${SEO_SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Qué es GoodTrading", item: `${SEO_SITE_ORIGIN}/about` },
        { "@type": "ListItem", position: 3, name: "Fuentes de datos", item: `${SEO_SITE_ORIGIN}/methodology/data-sources` },
        { "@type": "ListItem", position: 4, name: "Clasificación", item: `${SEO_SITE_ORIGIN}/methodology/classification` },
        { "@type": "ListItem", position: 5, name: page.breadcrumbName, item: url },
      ],
    };
    return [article, breadcrumb]
      .map((entity) => `<script type="application/ld+json">\n${JSON.stringify(entity, null, 2)}\n    </script>`)
      .join("\n    ");
  }
  if (page.path === "/methodology/limitations") {
    const article = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${url}#article`,
      url,
      headline: page.title,
      description: page.description,
      about: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      isPartOf: { "@id": `${SEO_SITE_ORIGIN}/#website` },
      inLanguage: "es-AR",
      author: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
      publisher: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
    };
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${SEO_SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Qué es GoodTrading", item: `${SEO_SITE_ORIGIN}/about` },
        { "@type": "ListItem", position: 3, name: "Fuentes de datos", item: `${SEO_SITE_ORIGIN}/methodology/data-sources` },
        { "@type": "ListItem", position: 4, name: "Clasificación", item: `${SEO_SITE_ORIGIN}/methodology/classification` },
        { "@type": "ListItem", position: 5, name: "Gamma y opciones", item: `${SEO_SITE_ORIGIN}/methodology/gamma-options` },
        { "@type": "ListItem", position: 6, name: page.breadcrumbName, item: url },
      ],
    };
    return [article, breadcrumb]
      .map((entity) => `<script type="application/ld+json">\n${JSON.stringify(entity, null, 2)}\n    </script>`)
      .join("\n    ");
  }
  const webpage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.webpageName,
    description: page.description,
    isPartOf: { "@id": `${SEO_SITE_ORIGIN}/#website` },
    about: { "@id": `${SEO_SITE_ORIGIN}/#organization` },
    inLanguage: "es-AR",
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: `${SEO_SITE_ORIGIN}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: page.breadcrumbName,
        item: url,
      },
    ],
  };
  return [
    `<script type="application/ld+json">\n${JSON.stringify(webpage, null, 2)}\n    </script>`,
    `<script type="application/ld+json">\n${JSON.stringify(breadcrumb, null, 2)}\n    </script>`,
  ].join("\n    ");
}

function replaceJsonLd(html: string, scripts: string): string {
  const without = html.replace(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    "",
  );
  return without.replace(/<\/head>/i, `    ${scripts}\n  </head>`);
}

/**
 * Injects route-specific SEO tags into the SPA index.html shell.
 * Home (`/`) is returned unchanged so SEO-2 metadata stays intact.
 */
export function injectPublicSeoHtml(html: string, rawPath: string): string {
  const page = getPublicSeoLanding(rawPath);
  if (!page) return html;

  const canonical = canonicalUrlForPath(page.path);
  let next = html;
  next = replaceTagContent(next, "title", page.title);
  next = replaceMetaByName(next, "description", page.description);
  next = replaceMetaByName(next, "robots", SEO_ROBOTS);
  next = replaceCanonical(next, canonical);
  next = replaceMetaByProperty(next, "og:type", page.path.startsWith("/methodology/") ? "article" : "website");
  next = replaceMetaByProperty(next, "og:site_name", "GoodTrading");
  next = replaceMetaByProperty(next, "og:title", page.ogTitle);
  next = replaceMetaByProperty(next, "og:description", page.ogDescription);
  next = replaceMetaByProperty(next, "og:url", canonical);
  next = replaceMetaByProperty(next, "og:image", SEO_OG_IMAGE);
  next = replaceMetaByName(next, "twitter:card", "summary_large_image");
  next = replaceMetaByName(next, "twitter:title", page.twitterTitle);
  next = replaceMetaByName(next, "twitter:description", page.twitterDescription);
  next = replaceMetaByName(next, "twitter:image", SEO_OG_IMAGE);
  next = replaceJsonLd(next, buildLandingJsonLd(page));
  return next;
}
