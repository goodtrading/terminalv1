/**
 * Ejecuta DeribitOptionsGateway.getSummary con opciones sintéticas y spot fijo
 * para validar [GammaFlipFixedUniverse] sin levantar el servidor completo.
 *
 * Uso: npx tsx scripts/validate-gamma-flip-tactical.ts
 */
import { DeribitOptionsGateway, type NormalizedOption } from "../server/deribit-gateway";

const spot = 78883;
const sigma = 0.55;
/** Expiry ~45 días desde abr-2026 (parse Deribit DDMMMYY) */
const expiry = "10JUN26";

function opt(strike: number, type: "call" | "put", oi: number): NormalizedOption {
  return {
    strike,
    expiry,
    optionType: type,
    openInterest: oi,
    ivBid: sigma,
    ivAsk: sigma,
    ivMark: sigma,
  };
}

const options: NormalizedOption[] = [
  opt(70000, "put", 800),
  opt(72000, "put", 1200),
  opt(74000, "put", 1500),
  opt(76000, "call", 900),
  opt(78000, "call", 2000),
  opt(80000, "call", 2500),
  opt(82000, "call", 1800),
  opt(84000, "call", 1100),
  opt(86000, "put", 700),
  opt(88000, "put", 500),
];

async function main() {
  const summary = await DeribitOptionsGateway.getSummary(options, spot, "LIVE_DERIBIT");
  console.log("\n--- Resumen (equivale a lo que luego va a storage → /api/market-state) ---");
  console.log("market.gammaFlip (tactical):", summary.gammaFlip);
  console.log("gammaFlipOperationalLegacy:", summary.gammaFlipOperationalLegacy ?? null);
  console.log("totalGex / gammaState:", summary.totalGex, summary.gammaState);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
