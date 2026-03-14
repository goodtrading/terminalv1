#!/usr/bin/env node

/**
 * Deribit GEX Engine (first working prototype)
 *
 * Reads deribit_options.json from project root, parses option instruments,
 * computes Black–Scholes gamma and an approximate signed GEX per strike,
 * then aggregates to infer:
 * - totalGex
 * - gammaRegime (LONG / SHORT / NEUTRAL)
 * - gammaFlip (strike where cumulative GEX crosses zero, if any)
 * - top gamma magnets (strikes with largest |GEX|)
 *
 * Output is written to deribit_gex_output.json and a concise summary is
 * printed to the terminal.
 *
 * No external dependencies; pure Node.js.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const INPUT_FILE = path.join(ROOT_DIR, "deribit_options.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "deribit_gex_output.json");

const counters = {
  total: 0,
  parsed: 0,
  invalidInstrument: 0,
  invalidSpot: 0,
  invalidIV: 0,
  expired: 0,
  invalidGamma: 0,
  kept: 0,
};

function readJsonFileSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[DeribitGEX] Failed to read or parse ${filePath}:`, err.message);
    return null;
  }
}

function parseInstrumentName(nameOrOption) {
  const name = typeof nameOrOption === "string" ? nameOrOption : nameOrOption?.instrument_name;
  if (typeof name !== "string") return null;
  const strikeFromField =
    typeof nameOrOption === "object" && nameOrOption != null && Number.isFinite(Number(nameOrOption.strike))
      ? Number(nameOrOption.strike)
      : null;
  const parts = name.split("-");
  if (parts.length < 4) {
    if (strikeFromField != null) {
      const type = name.includes("-C") || name.endsWith("C") ? "C" : name.includes("-P") || name.endsWith("P") ? "P" : null;
      if (type) return { strike: strikeFromField, type };
    }
    return null;
  }
  const [underlying, expiryRaw, strikeRaw, typeRaw] = parts;
  const strike = strikeFromField ?? Number(strikeRaw);
  const type = typeRaw === "C" ? "C" : typeRaw === "P" ? "P" : null;
  if (!underlying || !expiryRaw || !Number.isFinite(strike) || strike <= 0 || !type) {
    return null;
  }
  return { underlying, expiry: expiryRaw, strike, type };
}

/** Extract OI from instrument using robust fallback chain. */
function extractOpenInterest(instrument) {
  if (!instrument || typeof instrument !== "object") return 0;
  const oiRaw =
    instrument.open_interest ??
    instrument.openInterest ??
    instrument.stats?.open_interest ??
    instrument.volume ??
    0;
  const n = Number(oiRaw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseExpiryToDate(expiryStr) {
  // Deribit format e.g. 28MAR25 -> DDMMMYY in UTC; we can approximate by parsing.
  if (typeof expiryStr !== "string" || expiryStr.length < 7) return null;
  const day = expiryStr.slice(0, 2);
  const mon = expiryStr.slice(2, 5).toUpperCase();
  const yr = expiryStr.slice(5, 7);
  const monthMap = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };
  const m = monthMap[mon];
  const d = Number(day);
  const y = Number(yr);
  if (!Number.isFinite(d) || !Number.isFinite(y) || m == null) return null;
  // Convert YY to 20YY (Deribit uses near-dated expiries; safe for now)
  const fullYear = 2000 + y;
  // Use 08:00 UTC as an approximate expiry time to avoid TZ edge cases
  return new Date(Date.UTC(fullYear, m, d, 8, 0, 0, 0));
}

function timeToExpiryYears(expiryDate, now = new Date()) {
  if (!(expiryDate instanceof Date) || isNaN(expiryDate.getTime())) return 0;
  const diffMs = expiryDate.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  return diffMs / yearMs;
}

function normCdf(x) {
  // Abramowitz & Stegun approximation for normal CDF
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const kSum =
    k *
    (0.319381530 +
      k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
  const oneOverRootTwoPi = 0.3989422804014327;
  const phi = oneOverRootTwoPi * Math.exp((-x * x) / 2);
  const cdf = 1 - phi * kSum;
  return x >= 0 ? cdf : 1 - cdf;
}

function blackScholesGamma(spot, strike, t, vol, rate) {
  // spot: S, strike: K, t: time to expiry in years, vol: sigma, rate: r (risk-free)
  if (!Number.isFinite(spot) || !Number.isFinite(strike) || spot <= 0 || strike <= 0) return 0;
  if (!Number.isFinite(t) || t <= 0) return 0;
  if (!Number.isFinite(vol) || vol <= 0) return 0;
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * t) / (vol * sqrtT);
  const oneOverRootTwoPi = 0.3989422804014327;
  const phi = oneOverRootTwoPi * Math.exp((-d1 * d1) / 2);
  return phi / (spot * vol * sqrtT);
}

function normalizeIv(rawIv) {
  if (!Number.isFinite(rawIv) || rawIv <= 0) return null;
  // If IV > 3, assume it's in percent form and divide by 100.
  return rawIv > 3 ? rawIv / 100 : rawIv;
}

function computeOptionGammaAndGex(option, now) {
  const inst = parseInstrumentName(option);
  if (!inst) {
    counters.invalidInstrument++;
    return null;
  }
  const { strike, type } = inst;
  counters.parsed++;

  const spot = Number(option.underlying_price);
  if (!Number.isFinite(spot) || spot <= 0) {
    counters.invalidSpot++;
    return null;
  }

  const rawBidIv = Number(option.bid_iv);
  const rawAskIv = Number(option.ask_iv);
  const rawMarkIv = Number(option.mark_iv);

  let rawIv = null;
  const hasBid = Number.isFinite(rawBidIv) && rawBidIv > 0;
  const hasAsk = Number.isFinite(rawAskIv) && rawAskIv > 0;
  const hasMark = Number.isFinite(rawMarkIv) && rawMarkIv > 0;

  if (hasBid && hasAsk) {
    rawIv = (rawBidIv + rawAskIv) / 2;
  } else if (hasBid) {
    rawIv = rawBidIv;
  } else if (hasAsk) {
    rawIv = rawAskIv;
  } else if (hasMark) {
    rawIv = rawMarkIv;
  }

  const vol = normalizeIv(rawIv);
  if (!Number.isFinite(vol) || vol <= 0) {
    counters.invalidIV++;
    return null;
  }

  const expiryDate =
    typeof option.expiration_timestamp === "number"
      ? new Date(option.expiration_timestamp)
      : parseExpiryToDate(inst.expiry);
  const t = timeToExpiryYears(expiryDate, now);
  if (t <= 0) {
    counters.expired++;
    return null;
  }

  const rate = 0; // crypto: assume near-zero risk-free for this first engine
  const gamma = blackScholesGamma(spot, strike, t, vol, rate);
  if (!Number.isFinite(gamma) || gamma === 0) {
    counters.invalidGamma++;
    return null;
  }

  const size = extractOpenInterest(option);
  if (!Number.isFinite(size) || size <= 0) return null;

  // Signed GEX: calls positive, puts negative
  const sign = type === "C" ? 1 : -1;
  const gex = sign * gamma * size * spot * spot;

  counters.kept++;

  return {
    strike,
    type,
    gamma,
    gex,
    oiContracts: size,
  };
}

function aggregateByStrike(entries) {
  const byStrike = new Map();
  for (const e of entries) {
    if (!e) continue;
    const key = String(e.strike);
    const oi = Number(e.oiContracts) || 0;
    const current = byStrike.get(key) || {
      strike: e.strike,
      totalGamma: 0,
      totalGex: 0,
      callGex: 0,
      putGex: 0,
      callOiContracts: 0,
      putOiContracts: 0,
      totalOiContracts: 0,
    };
    current.totalGamma += e.gamma;
    current.totalGex += e.gex;
    if (e.type === "C") {
      current.callGex += e.gex;
      current.callOiContracts += oi;
    } else {
      current.putGex += e.gex;
      current.putOiContracts += oi;
    }
    current.totalOiContracts += oi;
    byStrike.set(key, current);
  }
  return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
}

/**
 * OI-only aggregation from ALL instruments (no IV/gamma filter).
 * Ensures we always have strikes with OI for Gravity Map even if GEX filters everything.
 */
function aggregateOiByStrike(resultArray) {
  const byStrike = new Map();
  for (const row of resultArray) {
    if (!row || typeof row !== "object") continue;
    const inst = parseInstrumentName(row);
    if (!inst) continue;
    const oi = extractOpenInterest(row);
    if (!Number.isFinite(oi) || oi <= 0) continue;
    const key = String(inst.strike);
    const current = byStrike.get(key) || {
      strike: inst.strike,
      callOiContracts: 0,
      putOiContracts: 0,
      totalOiContracts: 0,
    };
    if (inst.type === "C") {
      current.callOiContracts += oi;
    } else {
      current.putOiContracts += oi;
    }
    current.totalOiContracts += oi;
    byStrike.set(key, current);
  }
  return Array.from(byStrike.values())
    .filter((r) => r.totalOiContracts > 0)
    .sort((a, b) => a.strike - b.strike);
}

/** Merge OI-only strikes into GEX strike rows. Ensures all OI strikes appear in output. */
function mergeOiIntoStrikes(strikeRows, oiOnlyRows) {
  const byStrike = new Map();
  for (const r of strikeRows) {
    byStrike.set(String(r.strike), { ...r });
  }
  for (const o of oiOnlyRows) {
    const key = String(o.strike);
    const existing = byStrike.get(key);
    if (existing) {
      existing.callOiContracts = Math.max(existing.callOiContracts ?? 0, o.callOiContracts ?? 0);
      existing.putOiContracts = Math.max(existing.putOiContracts ?? 0, o.putOiContracts ?? 0);
      existing.totalOiContracts = Math.max(existing.totalOiContracts ?? 0, o.totalOiContracts ?? 0);
    } else {
      byStrike.set(key, {
        strike: o.strike,
        totalGamma: 0,
        totalGex: 0,
        callGex: 0,
        putGex: 0,
        callOiContracts: o.callOiContracts,
        putOiContracts: o.putOiContracts,
        totalOiContracts: o.totalOiContracts,
      });
    }
  }
  return Array.from(byStrike.values())
    .filter((r) => (r.totalOiContracts ?? 0) > 0)
    .sort((a, b) => a.strike - b.strike);
}

function computeGammaFlip(strikeRows) {
  if (!strikeRows.length) return null;
  // Sort by strike ascending and compute cumulative GEX
  let cum = 0;
  let lastStrike = strikeRows[0].strike;
  let lastCum = 0;
  let flipStrike = null;
  for (const row of strikeRows) {
    cum += row.totalGex;
    if (lastCum === 0) {
      lastCum = cum;
      lastStrike = row.strike;
      continue;
    }
    if ((lastCum <= 0 && cum > 0) || (lastCum >= 0 && cum < 0)) {
      // Zero crossing between lastStrike and row.strike; interpolate
      const w = Math.abs(lastCum) / (Math.abs(lastCum) + Math.abs(cum));
      flipStrike = lastStrike + (row.strike - lastStrike) * w;
      break;
    }
    lastCum = cum;
    lastStrike = row.strike;
  }
  return flipStrike;
}

function computeGammaRegime(totalGex) {
  const eps = 1e-6;
  if (totalGex > eps) return "LONG_GAMMA";
  if (totalGex < -eps) return "SHORT_GAMMA";
  return "NEUTRAL";
}

function findTopMagnets(strikeRows, count) {
  const sorted = [...strikeRows].sort(
    (a, b) => Math.abs(b.totalGex) - Math.abs(a.totalGex)
  );
  return sorted.slice(0, count).map((row) => ({
    strike: row.strike,
    totalGex: row.totalGex,
  }));
}

function main() {
  const payload = readJsonFileSafe(INPUT_FILE);
  if (!payload) {
    console.error("[DeribitGEX] No deribit_options.json payload found or failed to parse.");
    process.exitCode = 1;
    return;
  }

  const resultArray = Array.isArray(payload.result)
    ? payload.result
    : Array.isArray(payload)
    ? payload
    : [];

  if (!resultArray.length) {
    console.error("[DeribitGEX] No option rows found in deribit_options.json.");
    process.exitCode = 1;
    return;
  }

  console.log("[DeribitGEX] Instruments fetched:", resultArray.length);

  const now = new Date();
  const perOption = [];
  counters.total = resultArray.length;
  for (const row of resultArray) {
    if (!row || typeof row !== "object") continue;
    const entry = computeOptionGammaAndGex(row, now);
    if (entry) perOption.push(entry);
  }

  const oiOnlyRows = aggregateOiByStrike(resultArray);
  const gexStrikeRows = perOption.length > 0 ? aggregateByStrike(perOption) : [];
  const strikeRows = mergeOiIntoStrikes(gexStrikeRows, oiOnlyRows);

  if (strikeRows.length === 0) {
    console.error("[DeribitGEX] No strikes with OI after OI aggregation.");
    console.log(
      `[DeribitGEX] rows total=${counters.total}\n` +
        `[DeribitGEX] rows parsed=${counters.parsed}\n` +
        `[DeribitGEX] rows skipped invalid instrument=${counters.invalidInstrument}\n` +
        `[DeribitGEX] rows skipped invalid spot=${counters.invalidSpot}\n` +
        `[DeribitGEX] rows skipped invalid IV=${counters.invalidIV}\n` +
        `[DeribitGEX] rows skipped expired=${counters.expired}\n` +
        `[DeribitGEX] rows skipped invalid gamma=${counters.invalidGamma}\n` +
        `[DeribitGEX] rows kept=${counters.kept}\n` +
        `[DeribitGEX] OI-only strikes=${oiOnlyRows.length}`
    );
    process.exitCode = 1;
    return;
  }

  console.log("[DeribitGEX] Strikes with OI:", strikeRows.length);
  const totalGex = gexStrikeRows.reduce((sum, r) => sum + (r.totalGex || 0), 0);
  const gammaRegime = computeGammaRegime(totalGex);
  const gammaFlip = gexStrikeRows.length > 0 ? computeGammaFlip(gexStrikeRows) : null;
  const topMagnets = gexStrikeRows.length > 0 ? findTopMagnets(gexStrikeRows, 5) : [];
  let spotValue = null;
  for (const row of resultArray) {
    const p = row?.underlying_price ?? row?.underlying_index_price;
    if (typeof p === "number" && Number.isFinite(p) && p > 0) {
      spotValue = p;
      break;
    }
  }
  if (spotValue == null && resultArray[0]) {
    const p = resultArray[0].underlying_price ?? resultArray[0].underlying_index_price;
    if (typeof p === "number" && Number.isFinite(p) && p > 0) spotValue = p;
  }

  const output = {
    asOf: now.toISOString(),
    spot: spotValue,
    totalGex,
    gammaRegime,
    gammaFlip,
    topMagnets,
    strikes: strikeRows,
  };

  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
    console.log(`[DeribitGEX] output written path=${OUTPUT_FILE}`);
  } catch (err) {
    console.error("[DeribitGEX] Failed to write output file:", err.message);
  }

  // Concise terminal summary
  const flipStr = gammaFlip != null ? gammaFlip.toFixed(0) : "n/a";
  const totalGexStr =
    Math.abs(totalGex) >= 1e9
      ? (totalGex / 1e9).toFixed(2) + "B"
      : Math.abs(totalGex) >= 1e6
      ? (totalGex / 1e6).toFixed(2) + "M"
      : totalGex.toFixed(0);
  console.log(
    `[DeribitGEX] Regime=${gammaRegime} totalGex=${totalGexStr} flip=${flipStr} magnets=${topMagnets
      .map((m) => m.strike)
      .join(", ")}`
  );

  console.log(
    `[DeribitGEX] rows total=${counters.total}\n` +
      `[DeribitGEX] rows parsed=${counters.parsed}\n` +
      `[DeribitGEX] rows skipped invalid instrument=${counters.invalidInstrument}\n` +
      `[DeribitGEX] rows skipped invalid spot=${counters.invalidSpot}\n` +
      `[DeribitGEX] rows skipped invalid IV=${counters.invalidIV}\n` +
      `[DeribitGEX] rows skipped expired=${counters.expired}\n` +
      `[DeribitGEX] rows skipped invalid gamma=${counters.invalidGamma}\n` +
      `[DeribitGEX] rows kept=${counters.kept}`
  );
}

main();

