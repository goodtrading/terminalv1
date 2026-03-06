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
  // Mapping Spanish/Deribit headers to standard names
  if (h.includes('instrumento')) return 'instrument';
  if (h.includes('gamma')) return 'gamma';
  if (h.includes('abrir')) return 'open_interest'; // User requirement: Map ABRIR to Open Interest
  if (h.includes('iv bid') || h.includes('iv ask')) return 'implied_volatility';
  if (h.includes('instrumento')) return 'instrument';
  return h;
}

export function parseOptionsCSV(filePath: string): OptionsEntry[] {
  console.log(`[Analytics] Using file path: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) throw new Error("CSV file is empty or missing data");
  
  const rawHeaders = lines[0].split(',').map(h => h.trim());
  const headers = rawHeaders.map(normalizeHeader);
  console.log(`[Analytics] Column names detected: ${rawHeaders.join(', ')}`);
  console.log(`[Analytics] Mapped Open Interest column: ${rawHeaders[headers.indexOf('open_interest')]}`);

  const data: OptionsEntry[] = [];
  lines.slice(1).forEach((line) => {
    const values = line.split(',').map(v => v.trim());
    const instrument = values[headers.indexOf('instrument')];
    if (!instrument) return;

    // Extract strike and type from instrument string e.g., "BTC-7MAR26-59000-C"
    const parts = instrument.split('-');
    if (parts.length < 4) return;
    
    const strike = parseFloat(parts[2]);
    const type = parts[3] === 'C' ? 'CALL' : 'PUT';
    const expiration = parts[1]; // e.g. 7MAR26

    const gammaStr = values[headers.indexOf('gamma')];
    const gamma = (gammaStr === '-' || !gammaStr) ? 0 : parseFloat(gammaStr);
    
    const oiStr = values[headers.indexOf('open_interest')];
    const openInterest = (oiStr === '-' || !oiStr) ? 0 : parseFloat(oiStr);

    const ivBid = parseFloat(values[headers.indexOf('iv bid')] || '0');
    const ivAsk = parseFloat(values[headers.indexOf('iv ask')] || '0');
    const iv = (ivBid + ivAsk) / 2 || 0.5; // fallback to 0.5 if no IV

    data.push({
      strike,
      gamma,
      open_interest: openInterest,
      implied_volatility: iv / 100, // percentage to decimal
      option_type: type,
      expiration
    });
  });

  console.log(`[Analytics] Loaded ${data.length} rows from CSV`);
  
  // Top 5 by OI
  const topOI = [...data].sort((a, b) => b.open_interest - a.open_interest).slice(0, 5);
  console.log("[Analytics] Top 5 strikes by Open Interest:");
  topOI.forEach(s => console.log(`  Strike: ${s.strike}, OI: ${s.open_interest}`));

  // Top 5 by GEX (estimated for log)
  const spotPlaceholder = 68000; 
  const topGEX = [...data].sort((a, b) => {
    const gexA = Math.abs(a.gamma * a.open_interest * Math.pow(spotPlaceholder, 2));
    const gexB = Math.abs(b.gamma * b.open_interest * Math.pow(spotPlaceholder, 2));
    return gexB - gexA;
  }).slice(0, 5);
  console.log("[Analytics] Top 5 strikes by Gamma Exposure:");
  topGEX.forEach(s => {
    const gex = s.gamma * s.open_interest * Math.pow(spotPlaceholder, 2);
    console.log(`  Strike: ${s.strike}, GEX: ${(gex/1e6).toFixed(2)}M`);
  });

  return data;
}

export function calculateGEX(data: OptionsEntry[], spotPrice: number): number {
  return data.reduce((total, entry) => {
    return total + entry.gamma * entry.open_interest * Math.pow(spotPrice, 2);
  }, 0);
}

export function findGammaFlip(data: OptionsEntry[]): number {
  const strikes = Array.from(new Set(data.map(d => d.strike))).sort((a, b) => a - b);
  if (strikes.length === 0) return 0;
  
  let closestFlip = strikes[0];
  let minGexDiff = Infinity;

  for (let i = 0; i < strikes.length; i++) {
    const price = strikes[i];
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
  
  const callWall = calls.length ? calls.reduce((prev, curr) => prev.open_interest > curr.open_interest ? prev : curr).strike : 0;
  const putWall = puts.length ? puts.reduce((prev, curr) => prev.open_interest > curr.open_interest ? prev : curr).strike : 0;
  
  const oiByStrike: Record<number, number> = {};
  data.forEach(d => {
    oiByStrike[d.strike] = (oiByStrike[d.strike] || 0) + d.open_interest;
  });
  
  const strikes = Object.keys(oiByStrike).map(Number);
  const oiConcentration = strikes.length ? strikes.reduce((a, b) => oiByStrike[a] > oiByStrike[b] ? a : b) : 0;
  
  const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma), 0);
  const dealerPivot = totalAbsGamma > 0 
    ? data.reduce((acc, d) => acc + d.strike * (Math.abs(d.gamma) / totalAbsGamma), 0)
    : oiConcentration;
  
  return { callWall, putWall, oiConcentration, dealerPivot };
}

export function calculateKeyLevels(data: OptionsEntry[], spot: number) {
  const strikes = Array.from(new Set(data.map(d => d.strike))).sort((a, b) => a - b);
  
  const strikeGex = strikes.map(s => ({
    strike: s,
    gex: calculateGEX(data.filter(d => d.strike === s), spot)
  }));

  const gammaMagnets = strikeGex
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
    .slice(0, 3)
    .map(d => d.strike);
  
  const flip = findGammaFlip(data);
  
  const shortPockets = strikeGex.filter(s => s.gex < 0);
  const shortGammaPocketStart = shortPockets.length ? Math.min(...shortPockets.map(p => p.strike)) : flip - 1000;
  const shortGammaPocketEnd = shortPockets.length ? Math.max(...shortPockets.map(p => p.strike)) : flip - 200;

  return {
    gammaMagnets,
    shortGammaPocketStart,
    shortGammaPocketEnd,
    deepRiskPocketStart: shortGammaPocketStart - 3000,
    deepRiskPocketEnd: shortGammaPocketStart - 2500
  };
}

export function calculateAcceleration(data: OptionsEntry[], spot: number): string {
  const gexAtSpot = calculateGEX(data, spot);
  const gexAbove = calculateGEX(data, spot * 1.01);
  const change = Math.abs((gexAbove - gexAtSpot) / (gexAtSpot || 1));
  
  if (change > 0.5) return "HIGH";
  if (change > 0.2) return "MODERATE";
  return "LOW";
}
