# Fase 1B: Order book Kraken

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `server/kraken-gateway.ts` | Añadido `getKrakenOrderBook(symbol, limit)`: fetch a Kraken `/Depth?pair=XBTUSD&count=...`, normaliza a `{ bids, asks, timestamp }` con `{ price, size }[]` (mismo shape que Binance). Mapeo de símbolo vía `KRAKEN_SYMBOL_MAP` (BTCUSDT → XBTUSD). |
| `server/routes.ts` | Import de `getKrakenOrderBook`. Endpoint `GET /api/orderbook/raw` ahora es async, acepta query `source` y opcionalmente `symbol`. Respuesta unificada: `{ exchange, bids, asks, timestamp }`. Sin `source` o con cualquier valor distinto de `kraken` → Binance (sin cambios de comportamiento). Con `source=kraken` → Kraken. |

No se modificó: `server/services/orderbookService.ts`, `server/orderbook-gateway.ts`, `HeatmapCanvas`, `MainChart` (salvo que en el futuro se quiera elegir feed por query). El heatmap y las walls siguen usando solo Binance vía `getOrderBook()`.

## Cómo entra Kraken

- **Entrada:** El order book de Kraken entra solo cuando el cliente (o cualquier consumidor) pide explícitamente `GET /api/orderbook/raw?source=kraken`. Sin `source` se sigue sirviendo el snapshot de Binance desde `orderbookService` (WebSocket + REST).
- **Flujo:** `routes.ts` lee `req.query.source`; si es `"kraken"` llama a `getKrakenOrderBook(symbol, 500)` y responde con esa data; en caso contrario llama a `getOrderBook()` (Binance) y responde igual que antes, añadiendo `exchange: "binance"`.

## Cómo se normaliza

- **Kraken Depth API:** `GET https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=500`. Respuesta: `result.<pairId>` con `bids` y `asks` como array de `["price", "volume", "timestamp"]`.
- **Normalización en `getKrakenOrderBook`:** Se toma `price` (índice 0) y `volume` (índice 1); se filtra `volume > 0`; se convierte a `{ price: number, size: number }`; bids ordenados por precio descendente (mejor bid primero), asks ascendente (mejor ask primero). Mismo shape que `OrderBookSnapshot` de `orderbookService` (price/size).
- **En la ruta:** Tanto Binance como Kraken se serializan igual: `bids`/`asks` como `[string, string][]` (price y size en string) para compatibilidad con el cliente actual. Se añade el campo `exchange: "binance"` o `"kraken"`.

## Qué endpoint devuelve Kraken

- **Endpoint:** `GET /api/orderbook/raw?source=kraken`
- **Query opcionales:** `source=kraken` (activa Kraken), `symbol=BTCUSDT` (por defecto; se mapea a XBTUSD en Kraken).
- **Respuesta (unificada):**  
  `{ "exchange": "kraken", "bids": [["price","size"], ...], "asks": [...], "timestamp": <ms> }`  
  Mismo formato que sin `source` (que devuelve `exchange: "binance"`), así que el cliente puede seguir usando `bids`, `asks` y `timestamp` sin cambios.

## Qué quedó pendiente para usar Kraken visualmente en el chart

- **Selector de exchange en UI:** El MainChart y el HeatmapCanvas siguen usando una sola fuente: por defecto la query `orderbook-raw` sin `source`, es decir Binance. Para que el chart/heatmap muestre Kraken hace falta:
  - Añadir en la UI una forma de elegir exchange (p. ej. toggle o query param persistido) y que la query key de orderbook incluya esa elección, por ejemplo `["orderbook-raw", source]` y `fetch(\`/api/orderbook/raw?source=${source}\`)`.
- **HeatmapCanvas:** No requiere cambios de contrato: sigue recibiendo `bids`/`asks` en el mismo formato; si el cliente pasa datos de Kraken (mismo shape), el heatmap los pintará igual. Solo falta que el cliente pida `source=kraken` cuando el usuario elija Kraken.
- **Walls / liquidity:** La detección de walls y el heatmap de liquidez en el backend siguen usando `getOrderBook()` (Binance). Si en el futuro se quiere walls/heatmap desde Kraken, habría que permitir elegir fuente en `OrderBookGateway.getLiquidityHeatmap` o en un endpoint que alimente esas vistas (por ejemplo pasando `source` y, cuando sea Kraken, usar `getKrakenOrderBook` en lugar de `getOrderBook()`).

Resumen: Kraken order book está integrado y disponible vía `?source=kraken`; la respuesta es unificada y compatible. Lo pendiente es solo la parte de producto: selector de exchange en el front y, opcionalmente, usar Kraken en heatmap/walls en backend cuando esa opción esté activa.
