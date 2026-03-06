import fs from 'fs';

export interface OptionsEntry {
  strike: number;
  gamma: number;
  open_interest: number;
  implied_volatility: number;
  option_type: "CALL" | "PUT";
  expiration: string;
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

export function parseOptionsCSV(filePath: string): OptionsEntry[] {
  console.log(`[Analytics] Using file path: ${filePath}`);
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
    const gamma = parseFloat(values[gammaIdx] || '0') || 0;
    const openInterest = parseFloat(values[oiIdx] || '0') || 0;
    const iv = 0.5; // Simplified
    data.push({ strike, gamma, open_interest: openInterest, implied_volatility: iv, option_type: type, expiration });
  });
  return data;
}

export function calculateGEX(data: OptionsEntry[], spotPrice: number): number {
  return data.reduce((total, entry) => total + entry.gamma * entry.open_interest * Math.pow(spotPrice, 2), 0);
}

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

export function calculateVanna(data: OptionsEntry[], spot: number): number {
  return data.reduce((total, entry) => {
    const vanna = entry.gamma * (entry.strike - spot) / spot;
    return total + vanna * entry.implied_volatility;
  }, 0) * 1e8;
}

export function calculateCharm(data: OptionsEntry[]): number {
  return data.reduce((total, entry) => total + entry.gamma * entry.open_interest, 0) * -1.2e9;
}

export function detectWalls(data: OptionsEntry[]) {
  const calls = data.filter(d => d.option_type === 'CALL');
  const puts = data.filter(d => d.option_type === 'PUT');
  const callWall = calls.length ? calls.reduce((p, c) => p.open_interest > c.open_interest ? p : c).strike : 0;
  const putWall = puts.length ? puts.reduce((p, c) => p.open_interest > c.open_interest ? p : c).strike : 0;
  const oiByStrike: Record<number, number> = {};
  data.forEach(d => oiByStrike[d.strike] = (oiByStrike[d.strike] || 0) + d.open_interest);
  const strikes = Object.keys(oiByStrike).map(Number);
  const oiConcentration = strikes.length ? strikes.reduce((a, b) => oiByStrike[a] > oiByStrike[b] ? a : b) : 0;
  const totalWeight = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
  const dealerPivot = totalWeight > 0 ? data.reduce((acc, d) => acc + d.strike * (Math.abs(d.gamma * d.open_interest) / totalWeight), 0) : oiConcentration;
  return { callWall, putWall, oiConcentration, dealerPivot };
}

export function calculateKeyLevels(data: OptionsEntry[], spot: number) {
  const strikes = Array.from(new Set(data.map(d => d.strike))).sort((a, b) => a - b);
  const strikeGex = strikes.map(s => ({ strike: s, gex: calculateGEX(data.filter(d => d.strike === s), spot) }));
  const gammaMagnets = strikeGex.sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 3).map(d => d.strike);
  const flip = findGammaFlip(data);
  const shortPockets = strikeGex.filter(s => s.gex < 0);
  const shortGammaPocketStart = shortPockets.length ? Math.min(...shortPockets.map(p => p.strike)) : flip - 1000;
  const shortGammaPocketEnd = shortPockets.length ? Math.max(...shortPockets.map(p => p.strike)) : flip - 200;
  return { gammaMagnets, shortGammaPocketStart, shortGammaPocketEnd, deepRiskPocketStart: shortGammaPocketStart - 3000, deepRiskPocketEnd: shortGammaPocketStart - 2500 };
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
