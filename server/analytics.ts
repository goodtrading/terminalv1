export interface OptionsEntry {
  strike: number;
  gamma: number;
  open_interest: number;
  implied_volatility: number;
  option_type: "CALL" | "PUT";
  expiration: string;
}

export function calculateGEX(data: OptionsEntry[], spotPrice: number): number {
  return data.reduce((total, entry) => {
    return total + entry.gamma * entry.open_interest * Math.pow(spotPrice, 2);
  }, 0);
}

export function findGammaFlip(data: OptionsEntry[], minStrike: number, maxStrike: number): number {
  let closestFlip = minStrike;
  let minGexDiff = Infinity;

  for (let price = minStrike; price <= maxStrike; price += 100) {
    const gex = calculateGEX(data, price);
    if (Math.abs(gex) < minGexDiff) {
      minGexDiff = Math.abs(gex);
      closestFlip = price;
    }
  }

  return closestFlip;
}

export function calculateVanna(data: OptionsEntry[]): number {
  // Simplified Vanna calculation for prototype
  return data.reduce((total, entry) => total + entry.gamma * entry.implied_volatility, 0) * 1000;
}

export function calculateCharm(data: OptionsEntry[]): number {
  // Simplified Charm calculation for prototype
  return data.reduce((total, entry) => total + entry.gamma * entry.open_interest, 0) * -1e6;
}
