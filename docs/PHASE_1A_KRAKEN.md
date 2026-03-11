# Fase 1A: Integración mínima Kraken (ticker + candles)

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `server/kraken-gateway.ts` | **Nuevo.** Gateway Kraken: `getKrakenTicker`, `getKrakenCandles`, `KRAKEN_SYMBOL_MAP` (BTCUSDT → XBTUSD). |
| `server/market-gateway.ts` | Kraken añadido como proveedor en `getCandles` y `getTicker`. Parámetro opcional `preferredSource?: string`. Cadena por defecto: Binance → Bybit → Coinbase → Kraken. Con `preferredSource === 'kraken'` se intenta Kraken primero. Cache de ticker no se actualiza cuando se pide explícitamente `source=kraken`. |
| `server/routes.ts` | Query `source` en `/api/market/candles`, `/api/market/ticker` y `/api/chart/history`. Se pasa a `MarketDataGateway.getCandles(..., source)` y `MarketDataGateway.getTicker(symbol, source)`. |

## Endpoints afectados

| Endpoint | Cambio |
|----------|--------|
| `GET /api/market/candles?symbol=&interval=&limit=` | Acepta `source=kraken` (opcional). Sin `source`, comportamiento igual que antes (Binance → Bybit → Coinbase → Kraken como fallback). |
| `GET /api/market/ticker?symbol=` | Acepta `source=kraken` (opcional). Igual que arriba. |
| `GET /api/chart/history?symbol=&interval=&limit=` | Acepta `source=kraken` (opcional). Misma cadena de proveedores. |

No se modifican: `/api/orderbook/raw`, `/api/liquidity/heatmap`, `/api/terminal/state`, ni ningún otro. HeatmapCanvas y order book siguen usando Binance.

## Cómo se selecciona Kraken

- **Explícito:** en cualquier request a los tres endpoints anteriores, añadir `source=kraken` (ej. `GET /api/market/ticker?symbol=BTCUSDT&source=kraken`). Se usa Kraken primero; si falla, se sigue con el resto de proveedores.
- **Implícito:** si no se envía `source`, la cadena es Binance → Bybit → Coinbase → Kraken. Kraken solo se usa si los tres anteriores fallan.

El ticker en caché (usado por terminal state, options summary, etc.) solo se actualiza cuando no se usa `source=kraken`, de modo que el comportamiento por defecto no cambia.

## Símbolos (mapping Kraken)

- Interno `BTCUSDT` / `BTCUSD` → Kraken `XBTUSD`.
- Definido en `server/kraken-gateway.ts` (`KRAKEN_SYMBOL_MAP`). Para más pares, ampliar ese mapa.

## Qué quedó listo para Fase 1B (order book Kraken)

1. **`server/kraken-gateway.ts`**  
   Punto de extensión claro: en Fase 1B añadir `getKrakenOrderBook()` (REST o WS), devolviendo `{ bids, asks }[]` normalizado, y opcionalmente cache.

2. **Selección de fuente**  
   El patrón `source=kraken` ya existe en rutas y gateway. En 1B se puede reutilizar para elegir order book Kraken (p. ej. en `OrderBookGateway` o en un servicio de order book por fuente) sin tocar el flujo actual de Binance.

3. **Sin tocar**  
   - HeatmapCanvas, MainChart HEATMAP, walls.  
   - Order book actual (Binance WS + REST).  
   - Layout y sidebars.
