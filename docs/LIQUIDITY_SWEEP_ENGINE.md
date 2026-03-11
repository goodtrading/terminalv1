# Liquidity Sweep Engine – Institutional Detection Module

## 1. Auditoría del sweep anterior

### Ubicación
- **Motor:** `server/terminal-state.ts`, bloque ENGINE #20 (~140 líneas inline).
- **UI:** `client/src/components/terminal/RightSidebar.tsx`, panel "Liquidity Sweep".
- **Overlays:** MainChart, sweepLevels, sweepZones consumen `sweepRisk`, `sweepDirection`, `sweepTrigger`, `sweepTargetZone`.

### Inputs que usaba
- Spot, `liveHeatmap.liquidityHeatZones`, `liquidityPressure`, market mode.
- Dealer flow, cascade, squeeze, trade direction.
- Walls (call/put), dealer pivot, vacuum (opcional).

### Lógica que usaba
- Zonas bid/ask cerca del spot (1.5%).
- Risk score por puntos (liquidez, presión, etc.) → LOW / MEDIUM / HIGH / EXTREME.
- Dirección por “votación”: liquidez arriba/abajo, DHF, trade dir, squeeze, cascade, bias, book → UP / DOWN / TWO_SIDED / NONE.
- Trigger y target como texto derivado de la zona más intensa (o call/put wall).
- Summary como array de líneas descriptivas.

### Limitaciones
- Sin historial de precio entre requests: no podía detectar “precio cruzó zona y luego reclaim”.
- Sin clasificación de tipo de sweep (continuation, exhaustion, failed, etc.).
- Sin confidence numérico.
- Sin outcome (continuation, reclaim, rejection, follow-through).
- Trigger/target eran “setup” (niveles a vigilar), no ejecución real (cruce + consumo de liquidez).

### Condiciones débiles o simplistas
- Cualquier liquidez cercana generaba riesgo; no se distinguía agresión real vs solo proximidad.
- No había invalidación explícita ni swept zone.
- No se medía desplazamiento ni follow-through.

### Partes útiles conservadas
- Risk score y dirección (votación) se mantienen como base.
- Uso de heatZones, walls, dealer/cascade/squeeze para contexto.
- Formato de trigger/target/summary para compatibilidad con overlays.

---

## 2. Nuevo contrato de datos

Definido en `server/lib/liquiditySweepEngine.ts`. Salida del motor:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | IDLE \| SETUP \| TRIGGERED \| IN_PROGRESS \| RESOLVED |
| `direction` | string | UP \| DOWN \| TWO_SIDED \| NONE |
| `type` | string | SETUP_UP \| SETUP_DOWN \| SETUP_TWO_SIDED \| CONTINUATION \| EXHAUSTION \| FAILED \| ABSORPTION \| TWO_SIDED \| TRAP; vacío `""` cuando status es IDLE |
| `confidence` | number | 0–100, por risk + confluence + tipo de evento |
| `risk` | string | LOW \| MEDIUM \| HIGH \| EXTREME |
| `trigger` | string | Descripción del nivel/condición de trigger |
| `target` | string | Zona objetivo |
| `invalidation` | string | Nivel que invalida el setup |
| `sweptZone` | string | Zona barrida (cuando aplica) |
| `executionStats` | object | zoneSizeBTC, aggressionScore, displacementPct, followThroughPct |
| `confluence` | object | score (0–1), factors (string[]) |
| `outcome` | string | PENDING \| STRONG_FOLLOW_THROUGH \| WEAK_FOLLOW_THROUGH \| RECLAIM \| REJECTION \| N/A |
| `summary` | string[] | Líneas de resumen |

Campos legacy (mismos nombres que antes) para overlays: `sweepRisk`, `sweepDirection`, `sweepTrigger`, `sweepTargetZone`, `sweepSummary`.

---

## 3. Motor institucional – resumen

### A. Pre-sweep context
- Zonas bid/ask en rango ~1.8% del spot.
- Intensidad y concentración por lado (bid vs ask).
- Confluencia con gamma, walls, vacuum, dealer flow, cascade, squeeze, institutional bias, trade direction.

### B. Trigger real
- Estado persistente entre llamadas: último spot, timestamp, dirección, zona (mid, side), status.
- Si el precio cruza una zona (above ask / below bid) y luego reclaim → FAILED / RECLAIM.
- Si cruza y mantiene con avance → CONTINUATION / STRONG_FOLLOW_THROUGH.
- Si cruza y mantiene sin avance fuerte → ABSORPTION / WEAK_FOLLOW_THROUGH.
- Si estaba IN_PROGRESS y el precio vuelve al otro lado de la zona → EXHAUSTION / REJECTION.
- Sin cruce reciente → status SETUP_UP / SETUP_DOWN / SETUP_TWO_SIDED, outcome PENDING o N/A.

### C. Clasificación (type)
- CONTINUATION, EXHAUSTION, FAILED, ABSORPTION, TWO_SIDED, TRAP según cruce, reclaim y follow-through.

### D. Confidence score
- Base por risk + confluence; bonus si hay tipo de evento (sweep confirmado).

### E. Outcome
- STRONG_FOLLOW_THROUGH, WEAK_FOLLOW_THROUGH, RECLAIM, REJECTION, PENDING, N/A.

---

## 4. Lógica eliminada vs mantenida

| Eliminada | Mantenida |
|-----------|-----------|
| Cálculo inline de risk/direction en terminal-state | Risk y direction calculados en el engine con misma idea (puntos + votación) |
| Trigger/target solo como “setup” estático | Trigger/target/invalidation/sweptZone derivados del contexto y del estado |
| Sin estado entre requests | Estado previo (spot, zone, status) en módulo para detectar cruce y reclaim |
| Sin tipo ni outcome | Clasificación (type) y outcome en cada respuesta |
| Sin confidence ni confluence numéricos | confidence 0–100 y confluence (score + factors) |

---

## 5. Qué muestra ahora el panel (RightSidebar)

- **Status:** IDLE, SETUP_UP/DOWN/TWO_SIDED, IN_PROGRESS, o tipo de evento.
- **Risk** y **Direction** (igual que antes).
- **Type** y **Outcome** cuando aplican (eventos confirmados).
- **Confidence** en % (con color según umbral).
- **Trigger**, **Target** (igual que antes).
- **Invalidation** y **Swept zone** cuando existen.
- **Confluence:** score y hasta 3 factores.
- **Zone size** (BTC) si viene en executionStats.
- **Summary:** líneas del motor (incluye “Type | Outcome” cuando hay evento).

El layout del panel no cambia; solo se añaden bloques condicionales para los nuevos campos.

---

## 6. Validación y ajustes finos (post-implementación)

### Ajustes aplicados
- **IDLE sin falso positivo de tipo:** cuando `status === "IDLE"` el output devuelve `type: ""`. El panel no muestra "Type" si type es vacío.
- **Confidence no inflada:** en IDLE confidence se capa a máx. 50; en SETUP a máx. 55. Si SETUP pero sin liquidez del lado de la dirección (UP sin ask near, DOWN sin bid near) se capa a 45.
- **Resumen no repetitivo:** en IDLE se muestra una sola línea ("No sweep setup; low liquidity risk or balanced context"). En SETUP/evento solo se añade una línea de padding si hace falta ("Awaiting catalyst or clear break"), no varias iguales.
- **Cruce con buffer:** para contar "precio cruzó la zona" se exige que el spot supere la zona en al menos 0.03% (`CROSS_BUFFER_PCT`), evitando wicks que tocan y vuelven.
- **TWO_SIDED no contamina estado:** cuando `direction === "TWO_SIDED"` no se actualiza el estado interno con `spot` como zona; se mantiene `prev` para no sobrescribir zoneMid/zoneSide con valores sin sentido.
- **Constantes de tiempo:** `RECENT_MS = 60_000` (cruce válido 60 s) e `IN_PROGRESS_AGE_MS = 120_000` (ventana de exhaustion).

### Edge cases corregidos
- **IDLE con type SETUP_UP:** antes se devolvía type SETUP_UP con status IDLE; ahora type es `""` en IDLE.
- **TWO_SIDED guardando zoneMid = spot:** se dejaba de actualizar el estado cuando la dirección era TWO_SIDED para no usar el spot como zona falsa en la siguiente detección de cruce.
- **Confidence alta en solo setup:** setups sin evento confirmado ya no pueden superar 55% (45% si no hay liquidez del lado de la dirección).
- **Varios "Monitor for directional catalyst":** sustituido por una única línea de padding cuando hace falta.

### Condiciones para pasar de SETUP a confirmado (CONTINUATION / FAILED / ABSORPTION / EXHAUSTION)
1. **Estado previo:** debe existir `prev` con `direction` UP o DOWN, `zoneMid` y `zoneSide` (ASK para UP, BID para DOWN).
2. **Cruce:** para UP: `prev.spot <= zoneMid` y `spot > zoneMid * 1.0003`. Para DOWN: `prev.spot >= zoneMid` y `spot < zoneMid * 0.9997`.
3. **Ventana:** el estado previo debe ser reciente (`ageMs < RECENT_MS`).
4. **FAILED:** si tras cruzar el precio hace reclaim (por encima de ask: spot < zoneMid*0.998; por debajo de bid: spot > zoneMid*1.002).
5. **CONTINUATION:** cruce + hold (spot del otro lado de la zona) + avance ≥ 0.3% desde prev.spot.
6. **ABSORPTION:** cruce + hold pero avance < 0.3%.
7. **EXHAUSTION:** ya se había marcado IN_PROGRESS y, dentro de `IN_PROGRESS_AGE_MS`, el precio vuelve al otro lado de la zona (ask: spot < zoneMid*0.995; bid: spot > zoneMid*1.005).

---

## 7. Fase 2 – Integración visual en el chart (implementada)

### Dónde se dibuja
- **MainChart** (modo SQUEEZE, sin HEATMAP): mismas price lines que antes más las nuevas.
- **Overlays** `sweepLevels` y `sweepZones`: misma lógica que el chart para mantener compatibilidad.

### Qué se renderiza
- **Trigger:** línea horizontal punteada "SW TRIG" (nivel derivado de `sweepTrigger` / `trigger`).
- **Target zone:** banda con líneas según `sweepTargetZone` / `target`, etiqueta "SWEEP ↑/↓" o "SW ↑ CONT" (etc.) si hay tipo.
- **Swept zone:** cuando `sweptZone !== "--"`, segunda banda en ámbar (rgba 251,191,36), etiqueta "SWEPT".
- **Invalidation:** línea punteada "INV" cuando `invalidation !== "--"` (precio extraído del texto).
- **Type marker:** en la etiqueta del extremo de la zona: CONT (CONTINUATION), FAIL (FAILED), ABS (ABSORPTION), EXH (EXHAUSTION), 2S (SETUP_TWO_SIDED). Minimalista, sin iconos extra.

### Histórico corto
- **Store:** `client/src/lib/sweepHistory.ts` – lista en memoria (máx. 10 entradas), dedupe por (type + zone + bucket 60 s).
- **Push:** en RightSidebar, `useEffect` que observa `positioning`; si `liquiditySweepDetector.type` ∈ {CONTINUATION, FAILED, ABSORPTION, EXHAUSTION} se llama `pushSweepEvent({ direction, type, confidence, zone, outcome })`. El store evita duplicados en la misma ventana.
- **UI:** en el panel "Liquidity Sweep", bloque "Recent sweeps" (hasta 8 ítems) con timestamp, direction, type, confidence, zone. Solo visible cuando hay al menos un evento.

### Compatibilidad
- HeatmapCanvas no se toca. Walls y Bookmap siguen igual. Layout general sin cambios. Los overlays existentes usan los mismos campos legacy más los nuevos (`sweptZone`, `invalidation`, `type`, `trigger`/`target`).

---

## 8. Fase 3 (pendiente)

- **Backtesting / estadísticas:** persistir eventos en servidor o local, comparar con movimiento real para calibrar confidence y umbrales.
- **TRAP:** clasificación tipo TRAP (false break y reversión) aún no implementada.
- **Markers avanzados:** iconos por tipo en el chart (opcional), tooltips al pasar sobre zonas.
