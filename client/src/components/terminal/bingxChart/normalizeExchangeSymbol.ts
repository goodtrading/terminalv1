/** Normalize exchange/chart symbols for comparison (BTC-USDT === BTCUSDT). */
export function normalizeExchangeSymbol(symbol: string): string {
  return symbol.replace(/[-/_]/g, "").toUpperCase();
}

export function exchangeSymbolsMatch(a: string, b: string): boolean {
  return normalizeExchangeSymbol(a) === normalizeExchangeSymbol(b);
}
