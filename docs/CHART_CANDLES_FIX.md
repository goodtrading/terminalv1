# Diagnóstico y fix: chart no renderizaba velas

## 1. Flujo auditado

### Dónde se hace el fetch de velas
- **MainChart.tsx** (líneas ~221-255): una sola fuente de velas vía `useQuery` con `queryKey: ["btc-history"]`.
- **URL usada:** `GET /api/market/candles?symbol=BTCUSDT&interval=15m&limit=500` (fija; no se usa `/api/chart/history` ni `source` en el front).
- No hay otro fetch de velas en MainChart; no se usa `source` ni en la URL ni en la queryKey.

### Cómo se construye la query cuando se selecciona source
- **Hoy no se selecciona source en el front:** la URL está hardcodeada sin `source`. Aunque el backend soporte `?source=kraken`, el cliente nunca lo envía.
- **queryKey:** `["btc-history"]` — no incluye `source`, por lo que no hay refetch al cambiar de exchange.
- **Conclusión:** el problema de “no renderiza velas” no viene de `source` (no se usa); puede venir de respuesta no array, parseo o formato de tiempo.

### Cómo se parsea la respuesta
- `rawCandles = await res.json()` — se asume que es un array.
- Si la API devolvía algo distinto (objeto, null), `rawCandles.map()` fallaba o el resultado no era un array de velas.
- **normalizeCandle:** exige `time` (o alias), `open`, `high`, `low`, `close` numéricos; devuelve `null` si algo falla. Si el backend envía nombres distintos o `time` en ms/string, se rechazan velas.
- **Lightweight Charts** espera `time` como **UTCTimestamp** (segundos desde epoch, entero). Si se pasaba `time` en ms o con decimales, el chart puede no pintar.

### Cómo se aplica al chart
- **useEffect** con deps `[history]`: si `history && history.length > 0` y `candleSeriesRef.current` existe, se llama `candleSeriesRef.current.setData(history)`.
- **Posibles fallos:** (1) `history` normalizado con objetos que incluyen `volume` o formato distinto al esperado por la serie; (2) `time` no en segundos enteros; (3) respuesta no array y por tanto `history` vacío o no definido; (4) efecto corre antes de que el chart exista (`candleSeriesRef.current === null`) y no se vuelve a intentar.

## 2. Causa exacta del problema (hipótesis tratadas con el fix)

1. **Respuesta no array:** si en algún caso la API devolvía `{}` o otro tipo, `rawCandles.map` podía romper o dar datos inválidos → ahora se comprueba `Array.isArray(rawCandles)` y se devuelve `[]` si no es array.
2. **Formato de datos para setData:** la serie de velas de Lightweight Charts espera `{ time, open, high, low, close }` con `time` en segundos (entero). Se pasaba el objeto normalizado tal cual (con `volume` y sin garantizar `time` en segundos enteros) → ahora se mapea a ese shape y se fuerza `time` a segundos enteros.
3. **Condición de carrera chart vs history:** si el efecto de `setData` corría antes de que el chart estuviera creado, `candleSeriesRef.current` era `null` y no se aplicaban datos → se añadieron logs para ver `seriesExists` y un `console.warn` cuando hay history pero no serie.

## 3. Fix aplicado (mínimo, solo flujo de candles)

**Archivo:** `client/src/components/terminal/MainChart.tsx`

1. **Query (queryFn):**
   - Comprobar que la respuesta es un array; si no, log y `return []`.
   - Logs: URL pedida, `isArray`, `rawCount`, `firstCandleSample`, y tras normalizar: `normalizedCount`, `firstNormalized`.

2. **Efecto setData:**
   - Construir explícitamente el array para la serie: solo `{ time, open, high, low, close }`.
   - Asegurar **time en segundos enteros:** `time > 1e10` → ms → convertir a segundos; si no, usar segundos y hacer `Math.floor`.
   - Llamar `series.setData(data)` solo si hay datos y `candleSeriesRef.current` está definido.
   - Logs: si hay history, longitud, si existe serie, y si se llama `setData` (count + firstTime).
   - Si hay history pero no serie: `console.warn` para detectar race.

No se tocó: Bookmap, HeatmapCanvas, layout, ni otras rutas.

## 4. Logs agregados (solo flujo de candles)

| Log | Dónde | Qué muestra |
|-----|--------|--------------|
| `[CANDLES FETCH] URL:` | queryFn | URL final que se pide |
| `[CANDLES FETCH] Response: isArray=..., rawCount=..., firstCandleSample=...` | queryFn | Si la respuesta es array, cantidad de velas crudas y primera vela |
| `[CANDLES FETCH] Expected array, got:` | queryFn (si !isArray) | Tipo y valor cuando la respuesta no es array |
| `[CANDLES FETCH] After normalize: normalizedCount=..., firstNormalized=...` | queryFn | Cantidad tras normalizar y primera vela normalizada |
| `[CANDLES SETDATA] effect run: hasHistory=..., historyLength=..., seriesExists=...` | useEffect setData | Cada ejecución del efecto: si hay history, longitud y si la serie existe |
| `[CANDLES SETDATA] calling setData with count=..., firstTime=...` | useEffect setData | Confirmación de llamada a setData y tiempo de la primera vela |
| `[CANDLES SETDATA] history loaded but candleSeriesRef.current is null` | useEffect setData (warn) | History disponible pero chart aún no creado |

Con estos logs se puede ver en consola: URL, cantidad recibida, ejemplo de primera vela, cantidad tras parseo y si `setData` se ejecuta.

## 5. Archivos modificados

- **client/src/components/terminal/MainChart.tsx**
  - queryFn de `btc-history`: validación `Array.isArray(rawCandles)`, return `[]` si no, y logs anteriores.
  - useEffect de setData: mapeo explícito a `{ time, open, high, low, close }` con tiempo en segundos enteros, logs y warn cuando falta serie.

## 6. Próximos pasos opcionales

- Si se quiere usar **Kraken** desde la UI: añadir estado/selector de `source` y que la URL y la `queryKey` incluyan `source` (ej. `["btc-history", source]` y `fetch(\`/api/chart/history?symbol=BTCUSDT&interval=15m&limit=200&source=${source}\`)`).
- Revisar comparación `prevNormalized.time === tickerTime` en el efecto del ticker (time en segundos vs tickerTime en ms); no forma parte del fix mínimo de renderizado inicial de velas.
