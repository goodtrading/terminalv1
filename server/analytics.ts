import fs from 'fs';
import path from 'path';

export interface OptionsEntry {
  strike: number;
  gamma: number;
  open_interest: number;
  implied_volatility: number;
  option_type: "CALL" | "PUT";
  expiration: string;
}

export function parseOptionsCSV(filePath: string): OptionsEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const entry: any = {};
    headers.forEach((header, index) => {
      const val = values[index];
      if (['strike', 'gamma', 'open_interest', 'implied_volatility'].includes(header)) {
        entry[header] = parseFloat(val);
      } else {
        entry[header] = val;
      }
    });
    return entry as OptionsEntry;
  });
}

export function calculateGEX(data: OptionsEntry[], spotPrice: number): number {
  return data.reduce((total, entry) => {
    // Standard GEX formula: Gamma * OI * Spot^2 * 0.01 (often used for normalization)
    // Here we use the formula requested: GEX = Gamma * OI * Spot^2
    return total + entry.gamma * entry.open_interest * Math.pow(spotPrice, 2);
  }, 0);
}

export function findGammaFlip(data: OptionsEntry[]): number {
  let minStrike = Math.min(...data.map(d => d.strike));
  let maxStrike = Math.max(...data.map(d => d.strike));
  
  let closestFlip = minStrike;
  let minGexDiff = Infinity;

  // Step through price range to find where GEX crosses zero
  for (let price = minStrike; price <= maxStrike; price += 50) {
    const gex = calculateGEX(data, price);
    if (Math.abs(gex) < minGexDiff) {
      minGexDiff = Math.abs(gex);
      closestFlip = price;
    }
  }

  return closestFlip;
}

export function calculateVanna(data: OptionsEntry[]): number {
  return data.reduce((total, entry) => total + entry.gamma * entry.implied_volatility, 0) * 1e6;
}

export function calculateCharm(data: OptionsEntry[]): number {
  return data.reduce((total, entry) => total + entry.gamma * entry.open_interest, 0) * -1e9;
}

export function detectWalls(data: OptionsEntry[]) {
  const calls = data.filter(d => d.option_type === 'CALL');
  const puts = data.filter(d => d.option_type === 'PUT');
  
  const callWall = calls.reduce((prev, current) => (prev.open_interest > current.open_interest) ? prev : current).strike;
  const putWall = puts.reduce((prev, current) => (prev.open_interest > current.open_interest) ? prev : current).strike;
  
  // OI Concentration is typically the strike with highest total OI
  const oiByStrike: Record<number, number> = {};
  data.forEach(d => {
    oiByStrike[d.strike] = (oiByStrike[d.strike] || 0) + d.open_interest;
  });
  
  const oiConcentration = parseFloat(Object.keys(oiByStrike).reduce((a, b) => oiByStrike[parseFloat(a)] > oiByStrike[parseFloat(b)] ? a : b));
  
  return { callWall, putWall, oiConcentration, dealerPivot: oiConcentration };
}

export function calculateKeyLevels(data: OptionsEntry[]) {
  // Magnets are strikes with highest absolute gamma
  const sortedByGamma = [...data].sort((a, b) => Math.abs(b.gamma) - Math.abs(a.gamma));
  const gammaMagnets = Array.from(new Set(sortedByGamma.slice(0, 3).map(d => d.strike)));
  
  const flip = findGammaFlip(data);
  
  return {
    gammaMagnets,
    shortGammaPocketStart: flip - 1000,
    shortGammaPocketEnd: flip - 200,
    deepRiskPocketStart: flip - 5000,
    deepRiskPocketEnd: flip - 4500
  };
}
