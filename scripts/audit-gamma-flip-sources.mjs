#!/usr/bin/env node
/**
 * Auditoría offline: fuentes de gamma flip / GEX en GoodTrading.
 * No llama a Deribit; solo lee artefactos del repo y resume rutas de código.
 *
 * Uso: node scripts/audit-gamma-flip-sources.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GEX_JSON = path.join(ROOT, "deribit_gex_output.json");

function readJson(p) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return { error: e.message };
  }
}

console.log("=== GoodTrading — AUDITORÍA GAMMA FLIP (offline) ===\n");

console.log("--- 1) Archivo deribit_gex_output.json (ruta snapshot servidor) ---");
if (!fs.existsSync(GEX_JSON)) {
  console.log("  (no existe)", GEX_JSON);
} else {
  const j = readJson(GEX_JSON);
  if (j.error) console.log("  ERROR:", j.error);
  else {
    console.log("  asOf:", j.asOf ?? "n/a");
    console.log("  spot (en archivo):", j.spot ?? "n/a");
    console.log("  totalGex:", j.totalGex ?? "n/a");
    console.log("  gammaRegime:", j.gammaRegime ?? "n/a");
    console.log("  gammaFlip (JSON / script deribit-gex.js):", j.gammaFlip ?? "n/a");
    const strikes = Array.isArray(j.strikes) ? j.strikes : [];
    console.log("  strikes en archivo:", strikes.length);
    if (strikes.length) {
      const k = strikes.map((s) => s.strike).filter(Number.isFinite);
      console.log("  rango strikes:", Math.min(...k), "..", Math.max(...k));
    }
    console.log(
      "\n  INTERPRETACIÓN: este flip es cumulative-zero-crossing sobre strikes del OUTPUT del script,"
    );
    console.log(
      "  usando deribit_options.json (no el CSV español). OI: open_interest con fallback a volume en extractOpenInterest."
    );
  }
}

console.log("\n--- 2) UI panel izquierdo (MARKET STATE) ---");
console.log("  Endpoint: GET /api/market-state");
console.log("  Fuente: MemStorage.marketState, actualizado por server/options-engine.ts →");
console.log("  DeribitOptionsGateway.getSummary() → gammaFlip = operational flip (grid ± spot).");
console.log("  Campo mostrado: market.gammaFlip (schema market_state.gamma_flip)\n");

console.log("--- 3) Panel Options Snapshot (RightSidebar) ---");
console.log("  Endpoint: GET /api/terminal/state → state.options");
console.log("  Fuente: getDeribitOptionsSnapshot() lee deribit_gex_output.json en cada request.");
console.log("  Campo: opts.gammaFlip (puede DIFERIR del panel izquierdo si JSON está viejo).\n");

console.log("--- 4) Arquitectura crítica (por qué 73869 ≠ manual ~80k) ---");
console.log(
  "  En getSummary(), totalGex usa signedNetGexForOptionAtSpot(opt, SPOT_TICKER, ...) con ventana ±15% fija al spot."
);
console.log(
  "  El GAMMA FLIP operativo recalcula la suma en cada punto S del grid con signedNetGexForOptionAtSpot(opt, S, ...):"
);
console.log(
  "  la ventana ±15% se mide vs S, así el CONJUNTO de opciones incluidas CAMBIA con S → el cruce cero no es el mismo"
);
console.log(
  "  que un 'flip táctico' con universo fijo alrededor de 78883. Ver server/deribit-gateway.ts ~900–914 vs ~816–824.\n"
);

console.log("--- 5) Fórmula GEX (live gateway) ---");
console.log("  gex = gamma_BS * OI * contractSize * S_eval  ; calls + , puts −");
console.log("  (NO usa Spot^2 en gateway; el script deribit-gex.js sí usa spot*spot línea ~222.)\n");

console.log("--- 6) CSV bootstrap (storage recomputeAll) ---");
console.log("  analytics.findGammaFlip: NO es cruce acumulativo; minimiza |calculateGEX(data, price)| por strike.");
console.log("  calculateGEX: suma gamma*OI*spot^2 — distinto convención al live gateway.\n");

console.log("=== Fin. Para flip en vivo mirá logs [GammaFlipTrace][Solver] del servidor. ===\n");
