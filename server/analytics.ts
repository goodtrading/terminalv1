import fs from 'fs';

const DAY_MS = 1000 * 60 * 60 * 24;
const DERIBIT_EXPIRY_HOUR_UTC = 8;

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

export interface OptionsEntry {
  strike: number;
  gamma: number;
  open_interest: number;
  implied_volatility: number | null;
  option_type: "CALL" | "PUT";
  expiration: string;
  dte: number | null; // Days to Expiry
}

export function parseDTE(expiration: string, nowMs: number): number | null {
  if (!Number.isFinite(nowMs)) return null;
  if (typeof expiration !== "string") return null;

  const trimmed = expiration.trim().toUpperCase();
  const match = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const monthStr = match[2];
  const yearOffset = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(yearOffset)) return null;

  const month = MONTHS[monthStr];
  if (month == null) return null;

  const year = 2000 + yearOffset;
  const expiryMs = Date.UTC(year, month, day, DERIBIT_EXPIRY_HOUR_UTC, 0, 0, 0);
  const expiry = new Date(expiryMs);
  const validCalendarDate =
    expiry.getUTCFullYear() === year &&
    expiry.getUTCMonth() === month &&
    expiry.getUTCDate() === day &&
    expiry.getUTCHours() === DERIBIT_EXPIRY_HOUR_UTC &&
    expiry.getUTCMinutes() === 0 &&
    expiry.getUTCSeconds() === 0 &&
    expiry.getUTCMilliseconds() === 0;

  if (!validCalendarDate) return null;
  if (expiryMs <= nowMs) return null;

  return (expiryMs - nowMs) / DAY_MS;
}

function normalizeHeader(header: string): string {
  const h = header.toLowerCase().trim();
  if (h === 'instrumento') return 'instrument';
  if (h === 'gamma') return 'gamma';
  if (h === 'abrir') return 'open_interest';
  if (h === 'iv bid') return 'iv_bid';
  if (h === 'iv ask') return 'iv_ask';
  if (h.includes('vega')) return 'vega';
  if (h.includes('theta')) return 'theta';
  if (h.includes('rho')) return 'rho';
  return h;
}

function parseIvPct(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseOptionsCSV(filePath: string, nowMs: number = Date.now()): OptionsEntry[] {
  if (!fs.existsSync(filePath)) throw new Error(`Critical: Deribit CSV file not found at ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) throw new Error("Critical: CSV file is empty or missing data rows");
  const rawHeaders = lines[0].split(',').map(h => h.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const instrumentIdx = headers.indexOf('instrument');
  const gammaIdx = headers.indexOf('gamma');
  const oiIdx = headers.indexOf('open_interest');
  if (instrumentIdx === -1 || gammaIdx === -1 || oiIdx === -1) throw new Error("Parser Error: Missing required columns");
  const data: OptionsEntry[] = [];
  lines.slice(1).forEach((line) => {
    const values = line.split(',').map(v => v.trim());
    const instrument = values[instrumentIdx];
    if (!instrument) return;
    const parts = instrument.split('-');
    if (parts.length < 4) return;
    const strike = parseFloat(parts[2]);
    const type = parts[3].toUpperCase() === 'C' ? 'CALL' : 'PUT';
    const expiration = parts[1];
    const dte = parseDTE(expiration, nowMs);
    const gamma = parseFloat(values[gammaIdx] || '0') || 0;
    const openInterest = parseFloat(values[oiIdx] || '0') || 0;

    const ivBidIdx = headers.indexOf('iv_bid');
    const ivAskIdx = headers.indexOf('iv_ask');
    const ivBid = ivBidIdx !== -1 ? parseIvPct(values[ivBidIdx]) : null;
    const ivAsk = ivAskIdx !== -1 ? parseIvPct(values[ivAskIdx]) : null;
    const rawIvPct = ivBid != null && ivAsk != null
      ? (ivBid + ivAsk) / 2
      : ivBid != null
        ? ivBid
        : ivAsk != null
          ? ivAsk
          : null;

    data.push({ strike, gamma, open_interest: openInterest, implied_volatility: rawIvPct == null ? null : rawIvPct / 100, option_type: type, expiration, dte });
  });
  return data;
}

export function calculateGEX(data: OptionsEntry[], spotPrice: number): number {
  return data.reduce((total, entry) => total + entry.gamma * entry.open_interest * Math.pow(spotPrice, 2), 0);
}

function hasActiveDte(entry: OptionsEntry): entry is OptionsEntry & { dte: number } {
  return entry.dte != null && Number.isFinite(entry.dte);
}

function hasValidImpliedVolatility(entry: OptionsEntry): entry is OptionsEntry & { implied_volatility: number } {
  return entry.implied_volatility != null && Number.isFinite(entry.implied_volatility) && entry.implied_volatility > 0;
}

type VannaRow = OptionsEntry & { dte: number; implied_volatility: number };

function calculateVannaFromRows(rows: VannaRow[], spot: number): number {
  const rawVannaExposure = rows.reduce((total, entry) => {
    const vannaProxy = entry.gamma * entry.implied_volatility;
    const distancePct = Math.abs(entry.strike - spot) / spot;
    const spotWeight = Math.max(0.15, 1 - distancePct * 8);
    const timeToExpiry = entry.dte / 365;
    if (!Number.isFinite(timeToExpiry) || timeToExpiry <= 0) return total;
    const timeWeight = 1 / timeToExpiry;
    const contribution = vannaProxy * entry.open_interest * spotWeight * timeWeight * (spot - entry.strike);
    return total + contribution;
  }, 0);
  const totalOI = rows.reduce((acc, d) => acc + d.open_interest, 0);
  const vannaExposure = rawVannaExposure / Math.max(totalOI, 1);
  return Math.max(-9.99, Math.min(9.99, vannaExposure));
}

export type BootstrapVannaResult = {
  value: number;
  validRows: number;
  totalRows: number;
};

export function findGammaFlip(data: OptionsEntry[]): number {
  const strikes = Array.from(new Set(data.map(d => d.strike))).sort((a, b) => a - b);
  if (strikes.length === 0) return 0;
  let closestFlip = strikes[0];
  let minGexDiff = Infinity;
  for (const price of strikes) {
    const gex = calculateGEX(data, price);
    if (Math.abs(gex) < minGexDiff) {
      minGexDiff = Math.abs(gex);
      closestFlip = price;
    }
  }
  return closestFlip;
}

/**
 * Enhanced Vanna Exposure Calculation
 */
export function calculateVanna(data: OptionsEntry[], spot: number): number {
  return calculateVannaWithCoverage(data, spot).value;
}

export function calculateVannaWithCoverage(data: OptionsEntry[], spot: number): BootstrapVannaResult {
  const activeData = data.filter(hasActiveDte);
  const validRows = activeData.filter(hasValidImpliedVolatility) as VannaRow[];
  return {
    value: calculateVannaFromRows(validRows, spot),
    validRows: validRows.length,
    totalRows: activeData.length,
  };
}

/**
 * Enhanced Charm Exposure Calculation
 * rawCharmExposure += charm * openInterest * timeWeight * spotWeight
 */
export function calculateCharm(data: OptionsEntry[], spot: number): number {
  const activeData = data.filter(hasActiveDte);
  const rawCharmExposure = activeData.reduce((total, entry) => {
    // Charm Institutional Proxy: dDelta / dTime
    // We use gamma * (strike - spot) as a directional proxy for Charm sensitivity
    const charmProxy = entry.gamma * (entry.strike - spot);

    // Time-to-Expiry Weighting: near expiries matter more
    const timeToExpiry = entry.dte / 365;
    if (!Number.isFinite(timeToExpiry) || timeToExpiry <= 0) return total;
    const timeWeight = 1 / timeToExpiry;

    // Spot Proximity Weighting
    const distancePct = Math.abs(entry.strike - spot) / spot;
    const spotWeight = Math.max(0.15, 1 - distancePct * 8);

    const contribution = charmProxy * entry.open_interest * timeWeight * spotWeight;
    return total + contribution;
  }, 0);

  // Normalize relative to total open interest
  const totalOI = activeData.reduce((acc, d) => acc + d.open_interest, 0);
  const charmExposure = rawCharmExposure / Math.max(totalOI, 1);

  // Clamp into readable range [-9.99, 9.99]
  return Math.max(-9.99, Math.min(9.99, charmExposure));
}

type WallCandidate = { strike: number; open_interest: number };

function isBetterWallCandidate(candidate: WallCandidate, current: WallCandidate | null, spot: number | null): boolean {
  if (!current) return true;
  if (candidate.open_interest !== current.open_interest) {
    return candidate.open_interest > current.open_interest;
  }
  if (spot != null && Number.isFinite(spot) && spot > 0) {
    const candidateDistance = Math.abs(candidate.strike - spot) / spot;
    const currentDistance = Math.abs(current.strike - spot) / spot;
    if (candidateDistance !== currentDistance) {
      return candidateDistance < currentDistance;
    }
  }
  return candidate.strike < current.strike;
}

function selectWallStrike(candidates: WallCandidate[], spot: number | null): number {
  const best = candidates.reduce<WallCandidate | null>((current, candidate) => {
    if (isBetterWallCandidate(candidate, current, spot)) return candidate;
    return current;
  }, null);
  return best?.strike ?? 0;
}

export function detectWalls(data: OptionsEntry[], spot: number | null = null) {
  const calls = data.filter(d => d.option_type === 'CALL');
  const puts = data.filter(d => d.option_type === 'PUT');
  const callWall = selectWallStrike(calls, spot);
  const putWall = selectWallStrike(puts, spot);
  const oiByStrike: Record<number, number> = {};
  data.forEach(d => oiByStrike[d.strike] = (oiByStrike[d.strike] || 0) + d.open_interest);
  const strikes = Object.keys(oiByStrike).map(Number);
  const oiConcentration = strikes.length
    ? strikes.reduce((a, b) => {
        if (oiByStrike[a] !== oiByStrike[b]) return oiByStrike[a] > oiByStrike[b] ? a : b;
        if (spot != null && Number.isFinite(spot) && spot > 0) {
          const distanceA = Math.abs(a - spot) / spot;
          const distanceB = Math.abs(b - spot) / spot;
          if (distanceA !== distanceB) return distanceA < distanceB ? a : b;
        }
        return a < b ? a : b;
      })
    : 0;
  const totalWeight = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
  const dealerPivot = totalWeight > 0 ? data.reduce((acc, d) => acc + d.strike * (Math.abs(d.gamma * d.open_interest) / totalWeight), 0) : oiConcentration;
  return { callWall, putWall, oiConcentration, dealerPivot };
}

export function calculateKeyLevels(data: OptionsEntry[], spot: number) {
  const strikes = Array.from(new Set(data.map(d => d.strike))).sort((a, b) => a - b);
  const strikeGex = strikes.map(s => ({ strike: s, gex: calculateGEX(data.filter(d => d.strike === s), spot) }));
  const shortPockets = strikeGex.filter(s => s.gex < 0);
  const shortGammaPocketStart = shortPockets.length ? Math.min(...shortPockets.map(p => p.strike)) : null;
  const shortGammaPocketEnd = shortPockets.length ? Math.max(...shortPockets.map(p => p.strike)) : null;
  return {
    gammaMagnets: [],
    shortGammaPocketStart,
    shortGammaPocketEnd,
    deepRiskPocketStart: null,
    deepRiskPocketEnd: null,
  };
}

export function calculateAcceleration(data: OptionsEntry[], spot: number): string {
  const gexAtSpot = calculateGEX(data, spot);
  const gexAbove = calculateGEX(data, spot * 1.01);
  const change = Math.abs((gexAbove - gexAtSpot) / (gexAtSpot || 1));
  if (change > 0.8) return "EXTREME";
  if (change > 0.5) return "HIGH";
  if (change > 0.2) return "MODERATE";
  return "LOW";
}
