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
  if (['strike'].includes(h)) return 'strike';
  if (['gamma'].includes(h)) return 'gamma';
  if (['open_interest', 'open interest', 'oi', 'abrir'].includes(h)) return 'open_interest';
  if (['implied_volatility', 'iv', 'volatility'].includes(h)) return 'implied_volatility';
  if (['option_type', 'type', 'call_put'].includes(h)) return 'option_type';
  if (['expiration', 'expiry', 'exp'].includes(h)) return 'expiration';
  return h;
}

export function parseOptionsCSV(filePath: string): OptionsEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) throw new Error("CSV file is empty or missing data");
  
  const rawHeaders = lines[0].split(',').map(h => h.trim());
  const headers = rawHeaders.map(normalizeHeader);
  
  const required = ['strike', 'gamma', 'open_interest', 'implied_volatility', 'option_type', 'expiration'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')} (Raw: ${rawHeaders.join(', ')})`);
  }

  return lines.slice(1).map((line, lineIdx) => {
    const values = line.split(',').map(v => v.trim());
    const entry: any = {};
    headers.forEach((header, index) => {
      const val = values[index];
      if (['strike', 'gamma', 'open_interest', 'implied_volatility'].includes(header)) {
        entry[header] = parseFloat(val);
      } else if (header === 'option_type') {
        const t = val.toUpperCase();
        entry[header] = t.includes('CALL') ? 'CALL' : 'PUT';
      } else {
        entry[header] = val;
      }
    });
    return entry as OptionsEntry;
  });
}

export function calculateGEX(data: OptionsEntry[], spotPrice: number): number {
  return data.reduce((total, entry) => {
    return total + entry.gamma * entry.open_interest * Math.pow(spotPrice, 2);
  }, 0);
}

export function findGammaFlip(data: OptionsEntry[]): number {
  const strikes = Array.from(new Set(data.map(d => d.strike))).sort((a, b) => a - b);
  let closestFlip = strikes[0];
  let minGexDiff = Infinity;

  // Aggregate gamma by strike first for more accurate flip detection
  const gammaByStrike: Record<number, number> = {};
  data.forEach(d => {
    gammaByStrike[d.strike] = (gammaByStrike[d.strike] || 0) + d.gamma;
  });

  const uniqueStrikes = Object.keys(gammaByStrike).map(Number).sort((a, b) => a - b);
  
  for (let i = 0; i < uniqueStrikes.length; i++) {
    const price = uniqueStrikes[i];
    const gex = calculateGEX(data, price);
    if (Math.abs(gex) < minGexDiff) {
      minGexDiff = Math.abs(gex);
      closestFlip = price;
    }
  }

  return closestFlip;
}

export function calculateVanna(data: OptionsEntry[], spot: number): number {
  // Real-world approximation: Vanna ~ Gamma * (Strike - Spot) / Spot
  return data.reduce((total, entry) => {
    const vanna = entry.gamma * (entry.strike - spot) / spot;
    return total + vanna * entry.implied_volatility;
  }, 0) * 1e8;
}

export function calculateCharm(data: OptionsEntry[]): number {
  // Real-world approximation: Charm ~ Gamma * Time Decay
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
  
  // Dealer Pivot: weighted average strike by Gamma magnitude
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
  
  // Nearest contiguous negative gamma zone below/around spot
  const shortPockets = strikeGex.filter(s => s.gex < 0 && s.strike < spot + 2000 && s.strike > spot - 5000);
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
  const change = Math.abs((gexAbove - gexAtSpot) / gexAtSpot);
  
  if (change > 0.5) return "HIGH";
  if (change > 0.2) return "MODERATE";
  return "LOW";
}
