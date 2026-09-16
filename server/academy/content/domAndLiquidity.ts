import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const DOM_AND_LIQUIDITY_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-05-dom-and-liquidity-module-04-lesson-01", memberLesson("course-05-dom-and-liquidity-module-04-lesson-01", [
    { type: "heading", level: 2, text: "Wall persistente frente a wall no persistente" },
    { type: "paragraph", text: "Una wall contextualmente defendida combina aproximación, interacción agresiva, persistencia o replenishment y progreso limitado. Una wall débil puede retirarse, migrar o no mostrar defensa ejecutada; eso describe su comportamiento, no prueba engaño." },
    { type: "list", items: ["¿La cantidad persistió al acercarse el precio?", "¿Hubo ejecuciones contra el nivel?", "¿La cantidad se repuso durante la interacción?", "¿El precio progresó o quedó limitado?", "¿La wall fue retirada antes de ser tocada?"] },
    { type: "callout", title: "Lenguaje preciso", text: "Usa persistente, no persistente o pulled. No conviertas una wall grande en soporte, resistencia o intención institucional." },
  ])],
  ["course-05-dom-and-liquidity-module-04-lesson-02", memberLesson("course-05-dom-and-liquidity-module-04-lesson-02", [
    { type: "heading", level: 2, text: "Pull Before Touch" },
    { type: "paragraph", text: "El patrón descriptivo es: existe tamaño visible, el precio se aproxima y la liquidez se cancela antes de una interacción significativa. Después de esa cancelación, la evidencia de la wall original ya no debe tratarse como liquidez activa." },
    { type: "list", items: ["Registra ubicación y tamaño inicial.", "Observa la aproximación del precio.", "Comprueba si hubo ejecución real.", "Marca reducción o desaparición antes del touch.", "Actualiza la lectura con el book actual."] },
    { type: "callout", title: "Frontera", text: "Pulling antes del touch no demuestra spoofing. La cancelación puede ser normal y la intención no se prueba desde este evento aislado." },
  ])],
  ["course-05-dom-and-liquidity-module-04-lesson-03", memberLesson("course-05-dom-and-liquidity-module-04-lesson-03", [
    { type: "heading", level: 2, text: "Replenishment con interacción real" },
    { type: "paragraph", text: "El replenishment significativo requiere una secuencia: ejecuciones consumen cantidad, aparece nuevamente tamaño y el comportamiento persiste a través de interacciones repetidas. Una fotografía estática de una wall no alcanza." },
    { type: "list", items: ["Confirma trades en el nivel o cerca de él.", "Compara cantidad antes y después del consumo.", "Busca reaparición del tamaño.", "Registra si el precio progresa pese a la reposición.", "Mantén separadas observación e hipótesis."] },
    { type: "callout", title: "No iceberg automático", text: "La reposición puede ser compatible con participación pasiva persistente, pero no identifica automáticamente una iceberg ni quién la colocó." },
  ])],
  ["course-05-dom-and-liquidity-module-04-lesson-04", memberLesson("course-05-dom-and-liquidity-module-04-lesson-04", [
    { type: "heading", level: 2, text: "Migration en contexto" },
    { type: "paragraph", text: "Analiza Liquidity Migration comparando la ubicación previa con la actual y su relación con precio, estructura, ejecución y lado del book. Pregunta si la liquidez se aleja, se acerca, sigue al precio o desaparece." },
    { type: "list", items: ["Ubicación anterior y nueva.", "Cambios de Bid y Ask por separado.", "Cancelación en un nivel y adición en otro.", "Ejecuciones durante el desplazamiento.", "Respuesta y progreso del precio."] },
    { type: "callout", title: "Sin regla determinista", text: "La migración aporta contexto sobre dónde está visible la liquidez ahora. No define por sí misma continuación, reversión ni intención." },
  ])],
  ["course-05-dom-and-liquidity-module-04-lesson-05", memberLesson("course-05-dom-and-liquidity-module-04-lesson-05", [
    { type: "heading", level: 2, text: "Aggressor y lado pasivo" },
    { type: "paragraph", text: "El Footprint registra transacciones ejecutadas y ayuda a observar la agresión. El DOM muestra la liquidez pasiva visible antes y durante la interacción. La lectura útil surge al comparar ejecución, persistencia y respuesta del precio." },
    { type: "list", items: ["Agresión con progreso: la ejecución encuentra camino.", "Agresión sin progreso: hay fricción o respuesta que limita.", "Liquidez pasiva persistente: permanece durante la interacción.", "Liquidez pasiva retirada: cambia la evidencia disponible."] },
    { type: "callout", title: "Capas distintas", text: "Ninguna capa revela directamente la intención. Describe primero qué se mostró y ejecutó; formula la interpretación como hipótesis contextual." },
  ])],
  ["course-05-dom-and-liquidity-module-04-lesson-06", memberLesson("course-05-dom-and-liquidity-module-04-lesson-06", [
    { type: "heading", level: 2, text: "Situaciones de ejecución en DOM" },
    { type: "paragraph", text: "Esta lesson usa situaciones analíticas, no setups propietarios. El objetivo es reconocer cómo cambia el contexto de ejecución cuando el book es thick, thin, se retira liquidez o empeora el spread y la profundidad." },
    { type: "list", items: ["Entrar hacia una zona thick puede aumentar la fricción.", "Tras una retirada, la evidencia anterior deja de estar activa.", "Un book thin puede aumentar impacto y slippage.", "Perseguir precio con spread o depth deteriorados empeora la información.", "La situación debe evaluarse junto con ejecución y riesgo."] },
    { type: "callout", title: "Alcance", text: "No se incluyen nombres de setups GoodTrading, triggers exactos, stops, targets ni thresholds fijos." },
  ])],
  ["course-05-dom-and-liquidity-module-04-lesson-07", memberLesson("course-05-dom-and-liquidity-module-04-lesson-07", [
    { type: "heading", level: 2, text: "DOM Replay Lab" },
    { type: "paragraph", text: "El replay prepara una reconstrucción ordenada del libro y evita leer solo el resultado final. Registra qué estaba visible, qué cambió, qué se ejecutó y cómo respondió el precio." },
    { type: "list", items: ["Best Bid y Best Ask.", "Spread.", "Depth y distribución cercana.", "Walls y clusters relevantes.", "Adds y pulls.", "Ejecuciones contra la liquidez.", "Replenishment.", "Progreso del precio.", "Conclusión analítica Trade / Wait."] },
    { type: "callout", title: "Metadatos", text: "Este contenido prepara el análisis de replay para DOM. No implementa replay en vivo ni conecta N5/N5G o un motor adicional." },
  ])],
]);
