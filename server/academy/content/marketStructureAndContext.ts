import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const MARKET_STRUCTURE_AND_CONTEXT_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-10-market-structure-and-context-module-05-lesson-01", memberLesson("course-10-market-structure-and-context-module-05-lesson-01", [
    { type: "heading", level: 2, text: "Clasificar el contexto sin inventar un estado único" },
    { type: "paragraph", text: "La clasificación de Market State en GoodTrading debe construirse desde familias de evidencia, no desde una etiqueta aislada. Precio y estructura, volatilidad, Gamma/positioning, liquidez, Order Flow, OI/derivatives y calidad de datos pueden apuntar en la misma dirección o entrar en conflicto." },
    { type: "list", items: ["Observado: spot, candles, trades, libro, OI, options y timestamps cuando están disponibles.", "Derivado: swing structure, volatility state, Gamma context, levels, pressure y confluence.", "Modelo: trend, balance/range, compression, expansion, transition o unclear.", "AI interpretation: resumen que debe conservar source, freshness y nivel de incertidumbre."] },
    { type: "callout", title: "No hay taxonomy universal", text: "Terminal Market State, Volatility Engine y Market Snapshot AI tienen owners y vocabularios diferentes. No uses LONG_GAMMA, range o trend_attempt como si fueran estados equivalentes de un único motor." },
    { type: "callout", title: "Criterio de salida", text: "La clasificación puede ser Context clear, Context mixed o Context invalid / insufficient. No incluye score propietario, gate ni decisión de trade." },
  ])],
  ["course-10-market-structure-and-context-module-05-lesson-02", memberLesson("course-10-market-structure-and-context-module-05-lesson-02", [
    { type: "heading", level: 2, text: "Construir contexto antes de buscar acción" },
    { type: "paragraph", text: "Construir contexto significa preguntar qué está haciendo cada capa y si las respuestas son compatibles. La jerarquía conceptual parte de Market State, Gamma, Liquidity, Order Flow, Acceptance/Rejection y Execution, pero el orden exacto y los gates propietarios no se publican aquí." },
    { type: "list", items: ["¿Qué estructura de precio está activa y en qué timeframe?", "¿La volatilidad está comprimida, normal o expandiéndose según qué fuente?", "¿Dónde están Gamma, walls, magnets y otros niveles, y qué tipo de dato los produce?", "¿La liquidez es persistente, se retira o está incompleta?", "¿Qué muestra la ejecución agresiva y qué respuesta obtiene?", "¿Qué cambia en OI/positioning y cuál es su venue y timestamp?", "¿La evidencia está fresca, parcial, stale o unavailable?", "¿Qué conflicto impide una narrativa fuerte?"] },
    { type: "callout", title: "Preparación, no Playbook", text: "Una lectura clara de contexto no es todavía setup qualification. No se publican confirmaciones exactas, entries, invalidations, targets, scoring ni management." },
    { type: "callout", title: "Incertidumbre válida", text: "Cuando las capas no están alineadas o una fuente es stub, simulate, partial, degraded o unavailable, conservar WAIT o INSUFFICIENT CONTEXT es más correcto que completar la historia." },
  ])],
  ["course-10-market-structure-and-context-module-05-lesson-03", memberLesson("course-10-market-structure-and-context-module-05-lesson-03", [
    { type: "heading", level: 2, text: "Context Market Scan: framework editorial" },
    { type: "paragraph", text: "Este Market Scan organiza observación contextual sin convertirla en el GoodTrading Playbook. Empieza verificando la fuente y termina clasificando la calidad del contexto, no ordenando una compra o una venta." },
    { type: "list", items: ["1. Verificar source, timestamp, age y completeness.", "2. Inspeccionar estructura de precio y horizonte relevante.", "3. Ubicar el contexto de volatilidad sin usar triggers operativos.", "4. Revisar Gamma regime y zonas importantes como contexto derivado/modelado.", "5. Revisar liquidez y distinguir observación de interpretación.", "6. Revisar Order Flow y su respuesta, no solo una ejecución.", "7. Revisar OI/positioning conservando instrumento, venue y unidad.", "8. Evaluar acceptance/rejection conceptualmente.", "9. Identificar conflictos, datos faltantes y fallback states.", "10. Clasificar: Context clear, Context mixed o Context invalid / insufficient."] },
    { type: "callout", title: "Conclusiones permitidas", text: "READY TO CONTINUE ANALYSIS · WAIT · INSUFFICIENT CONTEXT. Estas conclusiones no equivalen a BUY, SELL, LONG, SHORT ni a una recomendación ejecutable." },
    { type: "callout", title: "Boundary", text: "No incluye entry, stop, target, score, position size, trade management ni runtime integration. Course 11 convierte contexto en el GoodTrading Playbook ejecutable." },
  ])],
]);
