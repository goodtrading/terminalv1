import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectPublicSeoHtml } from "./injectPublicSeoHtml";
import { PUBLIC_SEO_LANDINGS } from "@shared/seoPublicRoutes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(
  path.resolve(__dirname, "../../client/index.html"),
  "utf8",
);

describe("injectPublicSeoHtml", () => {
  it("leaves home HTML unchanged", () => {
    const out = injectPublicSeoHtml(indexHtml, "/");
    assert.equal(out, indexHtml);
  });

  it("injects unique meta and JSON-LD for each landing", () => {
    for (const page of PUBLIC_SEO_LANDINGS) {
      const out = injectPublicSeoHtml(indexHtml, page.path);
      assert.equal((out.match(/<title\b/gi) || []).length, 1);
      assert.equal((out.match(/name="description"/gi) || []).length, 1);
      assert.equal((out.match(/rel="canonical"/gi) || []).length, 1);
      assert.match(out, new RegExp(`<title>${page.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`));
      assert.ok(out.includes(`content="${page.description}"`));
      assert.ok(out.includes(`href="https://goodtrading.com.ar${page.path}"`));
      assert.ok(out.includes('name="robots" content="index,follow,max-image-preview:large"'));
      assert.ok(out.includes('property="og:site_name" content="GoodTrading"'));
      assert.ok(out.includes(`property="og:url" content="https://goodtrading.com.ar${page.path}"`));
      assert.ok(out.includes("https://goodtrading.com.ar/opengraph.jpg"));
      assert.equal((out.match(/application\/ld\+json/g) || []).length, 2);
      assert.ok(out.includes('"@type": "WebPage"'));
      assert.ok(out.includes('"@type": "BreadcrumbList"'));
      assert.equal(out.includes("replit"), false);
      assert.equal(out.includes("railway.app"), false);
      assert.equal(out.includes("noindex"), false);
      assert.equal(out.includes('"@type": "WebSite"'), false);
      assert.equal(out.includes('"@type": "Organization"'), false);
    }
  });
});
