import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });
const protectedNote = "El target STRATEGY_LAB es metadata curricular. No implica que exista hoy un entorno automatizado, builder, runner o botón operativo.";

export const STRATEGY_LAB_AND_RESEARCH_MEMBER_CONTENT = new Map<string, AcademyMemberContentResponse>([
  ["course-13-strategy-lab-and-research-module-03-lesson-01", memberLesson("course-13-strategy-lab-and-research-module-03-lesson-01", [
    { type: "heading", level: 2, text: "Especificación manual de estrategia" },
    { type: "paragraph", text: "Una especificación de investigación convierte una idea en un objeto de trabajo aunque hoy no exista un objeto canónico en GoodTrading. Escribe nombre, hipótesis, mercado, timeframe, variables, condiciones, trigger, entrada, salida, invalidación, riesgo, datos requeridos y limitaciones." },
    { type: "list", items: ["Congela el significado de cada variable.", "Declara qué información debe existir en el timestamp.", "Especifica las suposiciones de ejecución.", "Anota qué parte es manual y qué parte está soportada por el producto.", "Usa ejemplos públicos o sintéticos."] },
    { type: "callout", title: "Estado actual", text: "No existe un builder de Strategy Lab ni un objeto canónico de estrategia. Este worksheet no se guarda, exporta ni importa automáticamente. " + protectedNote },
  ])],
  ["course-13-strategy-lab-and-research-module-03-lesson-02", memberLesson("course-13-strategy-lab-and-research-module-03-lesson-02", [
    { type: "heading", level: 2, text: "Diseñar condiciones reproducibles" },
    { type: "paragraph", text: "Una condición describe el entorno donde una hipótesis será evaluada. Debe ser observable, definida antes del test, reproducible y no ambigua. Señal, condición y trigger cumplen funciones diferentes dentro de una especificación." },
    { type: "list", items: ["Define unidad, fuente y timestamp.", "Explica cómo se resuelve un dato ausente.", "Distingue evento observado de estado derivado.", "Prueba la definición con ejemplos positivos y negativos.", "Usa variables públicas y sintéticas, no gates propietarios."] },
    { type: "callout", title: "Caveat", text: "GoodTrading no expone un runtime de condiciones de Strategy Lab. La clasificación aquí es una metodología manual." },
  ])],
  ["course-13-strategy-lab-and-research-module-03-lesson-03", memberLesson("course-13-strategy-lab-and-research-module-03-lesson-03", [
    { type: "heading", level: 2, text: "Trigger e instante de decisión" },
    { type: "paragraph", text: "Un trigger marca el evento que habilita una acción hipotética dentro de la regla. Para ser investigable necesita input explícito, semántica temporal y una suposición de precio que no use información futura." },
    { type: "list", items: ["Especifica qué evento activa el test.", "Fija si se evalúa al inicio, cierre o siguiente dato disponible.", "Declara latencia y precio asumido.", "Verifica que ningún campo dependa del futuro.", "Registra eventos no ejecutables por datos faltantes."] },
    { type: "callout", title: "No es runtime", text: "No existe hoy un trigger engine de Strategy Lab. No uses triggers de ejecución propietarios de GoodTrading o BTC como ejemplos operativos." },
  ])],
  ["course-13-strategy-lab-and-research-module-03-lesson-04", memberLesson("course-13-strategy-lab-and-research-module-03-lesson-04", [
    { type: "heading", level: 2, text: "Filtros y población de prueba" },
    { type: "paragraph", text: "Un filtro reduce la población en la que se evalúa una hipótesis. Variables públicas como estado de volatilidad, hora normalizada, régimen genérico o estructura de precio pueden servir como ejemplos si se definen antes del estudio." },
    { type: "list", items: ["Explica qué observaciones excluye el filtro.", "Mide cuántos eventos quedan después de aplicarlo.", "Compara con una referencia sin filtro.", "Evita acumular filtros solo porque mejoran una muestra.", "No uses distancia Gamma, OI, liquidez o setup score propietarios."] },
    { type: "callout", title: "Producto", text: "No existe un motor de filtros de Strategy Lab en la versión actual. El filtro se diseña y aplica manualmente." },
  ])],
  ["course-13-strategy-lab-and-research-module-03-lesson-05", memberLesson("course-13-strategy-lab-and-research-module-03-lesson-05", [
    { type: "heading", level: 2, text: "Protocolo manual de test" },
    { type: "paragraph", text: "GoodTrading no tiene hoy un runner de Strategy Lab. Aun así, una investigación puede seguir un protocolo manual disciplinado y dejar evidencia de sus límites." },
    { type: "list", items: ["Congela las reglas.", "Define la muestra histórica.", "Establece provenance y calidad de datos.", "Verifica disponibilidad punto en el tiempo.", "Recorre cronológicamente.", "Aplica la regla sin hindsight.", "Registra cada evento elegible.", "Aplica supuestos de ejecución constantes.", "Registra outcomes y datos faltantes.", "Calcula métricas y documenta limitaciones.", "No cambies reglas dentro de la muestra."] },
    { type: "callout", title: "Estado actual", text: "Esto es un workflow manual de research, no una función automatizada de Run Test y no debe presentarse como tal." },
  ])],
  ["course-13-strategy-lab-and-research-module-03-lesson-06", memberLesson("course-13-strategy-lab-and-research-module-03-lesson-06", [
    { type: "heading", level: 2, text: "Comparar versiones manualmente" },
    { type: "paragraph", text: "Cuando una hipótesis cambia, conserva un registro legible. V1 puede ser la hipótesis original y V2 un único cambio controlado. Compara la misma clase de muestra, reglas modificadas, trade count, EV, Profit Factor, drawdown y modos de fallo." },
    { type: "list", items: ["Describe exactamente qué cambió.", "Evita cambiar varias dimensiones sin necesidad.", "Conserva la muestra y las suposiciones.", "Compara distribución, no solo resultado agregado.", "Registra por qué aceptas o rechazas una modificación."] },
    { type: "callout", title: "No implementado", text: "No existen version IDs, diff automático, rollback ni UI de comparación de resultados. La comparación es manual y documental." },
  ])],
  ["course-13-strategy-lab-and-research-module-04-lesson-01", memberLesson("course-13-strategy-lab-and-research-module-04-lesson-01", [
    { type: "heading", level: 2, text: "Gamma como variable de research" },
    { type: "paragraph", text: "Gamma puede formularse como variable contextual, pero un test histórico válido necesitaría chain de opciones, OI, IV, expiry, strike, spot y cálculos derivados alineados al timestamp. Los valores actuales o un CSV aislado no prueban una reconstrucción punto en el tiempo." },
    { type: "list", items: ["Define qué input es observado y qué métrica es derivada.", "Versiona la fuente y la hora de captura.", "Declara qué ocurre si falta una expiración o IV.", "Usa un ejemplo sintético para diseñar la hipótesis.", "No publiques filtros Gamma propietarios."] },
    { type: "callout", title: "Caveat crítico", text: "La reconstrucción histórica de Gamma en GoodTrading no está probada ni está lista para backtesting. No se debe fabricar un replay histórico." },
  ])],
  ["course-13-strategy-lab-and-research-module-04-lesson-02", memberLesson("course-13-strategy-lab-and-research-module-04-lesson-02", [
    { type: "heading", level: 2, text: "OI como variable de research" },
    { type: "paragraph", text: "Open Interest puede ser una variable de investigación si se define venue, instrumento, timestamp, unidades y provenance. La capacidad live actual no equivale a un dataset histórico listo para backtest." },
    { type: "list", items: ["Separa Spot, Perpetual y Futures.", "Registra la unidad y el proveedor.", "Comprueba si el valor estaba disponible entonces.", "Distingue snapshot actual de serie histórica.", "No uses thresholds propietarios de OI."] },
    { type: "callout", title: "Estado actual", text: "OI Perpetual/Futures tiene soporte estable en el código N5 actual, pero el dataset histórico validado para backtesting no está disponible y el despliegue público sigue pendiente." },
  ])],
  ["course-13-strategy-lab-and-research-module-04-lesson-03", memberLesson("course-13-strategy-lab-and-research-module-04-lesson-03", [
    { type: "heading", level: 2, text: "Liquidez como dimensión de investigación" },
    { type: "paragraph", text: "La liquidez puede estudiarse como condición, pero el DOM y el Heatmap actuales no constituyen por sí solos un archivo histórico determinista. Una visualización presente no reconstruye walls, pulling, replenishment ni el lifecycle completo." },
    { type: "list", items: ["Define qué evento de libro estás midiendo.", "Conserva snapshots y timestamps si el dataset existe.", "Separa liquidez mostrada de ejecución realizada.", "Declara gaps y cambios de fuente.", "No confundas visual replay con backtest."] },
    { type: "callout", title: "Producto", text: "GoodTrading no tiene un store histórico probado para DOM, walls, pulling, replenishment o heatmap lifecycle determinista." },
  ])],
  ["course-13-strategy-lab-and-research-module-04-lesson-04", memberLesson("course-13-strategy-lab-and-research-module-04-lesson-04", [
    { type: "heading", level: 2, text: "Regímenes definidos por el investigador" },
    { type: "paragraph", text: "La investigación puede condicionar resultados por tendencia, rango, compresión, expansión o volatilidad. Pero cada régimen debe tener una definición y una fuente: GoodTrading no tiene un único owner universal que vuelva equivalentes todas sus etiquetas." },
    { type: "list", items: ["Define el régimen antes de revisar el outcome.", "Explica qué datos lo producen.", "Evita mezclar labels de motores distintos.", "Mide cuántos eventos hay por régimen.", "No reutilices gates propietarios del Playbook."] },
    { type: "callout", title: "Caveat", text: "No hay hoy un engine universal de filtros de régimen dentro de Strategy Lab. La clasificación es manual y explícita." },
  ])],
  ["course-13-strategy-lab-and-research-module-04-lesson-05", memberLesson("course-13-strategy-lab-and-research-module-04-lesson-05", [
    { type: "heading", level: 2, text: "Filtros temporales" },
    { type: "paragraph", text: "Hora UTC, día de la semana o ventanas horarias pueden ser variables públicas de investigación. Normaliza timezone, documenta la conversión y evita convertir nombres de sesiones en una lógica canónica de GoodTrading sin evidencia." },
    { type: "list", items: ["Guarda timestamp original y timezone normalizado.", "Define límites de la ventana.", "Comprueba cambios de horario y datos faltantes.", "Compara contra una referencia sin filtro.", "No inventes reglas Asia, London o New York."] },
    { type: "callout", title: "Alcance", text: "No existe un named-session system canónico conectado a Strategy Lab. Esta lección describe diseño de investigación, no una feature actual." },
  ])],
  ["course-13-strategy-lab-and-research-module-04-lesson-06", memberLesson("course-13-strategy-lab-and-research-module-04-lesson-06", [
    { type: "heading", level: 2, text: "Filtros de volatilidad" },
    { type: "paragraph", text: "Un estudio puede utilizar volatilidad realizada, una medida pública tipo ATR o IV pública cuando exista una historia válida. Realized e implied son observaciones distintas y no deben mezclarse sin definir la relación." },
    { type: "list", items: ["Declara ventana y unidad de la medida.", "Separa precio realizado de IV.", "Verifica disponibilidad en el timestamp.", "Evalúa estabilidad por régimen.", "No copies thresholds de Volatility Playbook."] },
    { type: "callout", title: "Estado actual", text: "No existe un filter engine de volatilidad de Strategy Lab. Las variables se pueden estudiar manualmente con datos cuya provenance sea demostrable." },
  ])],
  ["course-13-strategy-lab-and-research-module-05-lesson-01", memberLesson("course-13-strategy-lab-and-research-module-05-lesson-01", [
    { type: "heading", level: 2, text: "Validación out-of-sample manual" },
    { type: "paragraph", text: "La validación OOS debe ejecutarse sobre una muestra intacta y con reglas congeladas. El objetivo es observar degradación, distribución y regímenes de fallo sin ajustar la hipótesis después de cada resultado." },
    { type: "list", items: ["Congela reglas y parámetros.", "Selecciona una muestra no usada.", "Ejecuta el recorrido sin cambios.", "Compara degradación y distribución.", "Inspecciona regímenes de fallo.", "Documenta desviaciones.", "Rechaza o cambia la hipótesis solo después de revisar."] },
    { type: "callout", title: "No automatizado", text: "GoodTrading no tiene split OOS automático ni walk-forward runner. Este es un checklist manual, no un resultado generado por Strategy Lab." },
  ])],
  ["course-13-strategy-lab-and-research-module-05-lesson-02", memberLesson("course-13-strategy-lab-and-research-module-05-lesson-02", [
    { type: "heading", level: 2, text: "Validación manual en Paper" },
    { type: "paragraph", text: "GoodTrading sí tiene Paper Trading para ejecución simulada manual. No existe hoy un flujo que convierta una definición de estrategia en deployment automático a Paper." },
    { type: "list", items: ["Escribe reglas congeladas.", "Observa el mercado live sin reescribirlas.", "Ejecuta manualmente solo eventos calificables.", "Registra contexto, datos faltantes y decisión.", "Compara el comportamiento con la expectativa de research.", "Recuerda que Paper usa supuestos de ejecución simplificados."] },
    { type: "callout", title: "Distinción crítica", text: "Paper Trading manual es una superficie actual; Strategy Lab → Paper deployment automático no está implementado." },
  ])],
  ["course-13-strategy-lab-and-research-module-05-lesson-03", memberLesson("course-13-strategy-lab-and-research-module-05-lesson-03", [
    { type: "heading", level: 2, text: "Iterar sin perseguir pérdidas" },
    { type: "paragraph", text: "Una iteración disciplinada reúne evidencia, identifica un modo de fallo, formula una hipótesis nueva, cambia un componente significativo y vuelve a evaluar. Cambiar la estrategia después de cada trade perdedor destruye la capacidad de aprender." },
    { type: "list", items: ["Espera una muestra suficiente para describir un patrón.", "Cambia una dimensión significativa por vez cuando sea posible.", "Registra motivo y efecto esperado.", "Conserva la versión anterior para comparar manualmente.", "Revisa costos, datos y supuestos junto con el resultado."] },
    { type: "callout", title: "Estado actual", text: "No existe persistencia de versiones de Strategy Lab. Usa un journal manual; no se ofrece rollback, diff ni comparación automática." },
  ])],
  ["course-13-strategy-lab-and-research-module-05-lesson-04", memberLesson("course-13-strategy-lab-and-research-module-05-lesson-04", [
    { type: "heading", level: 2, text: "Proyecto final de research" },
    { type: "paragraph", text: "El proyecto final debe ser manual, sintético y trazable. Usa una estrategia pública genérica, no setups propietarios de Course 11 o BTC de Course 12. El objetivo es demostrar un proceso de investigación honesto, no simular una feature inexistente." },
    { type: "list", items: ["Formula hipótesis, variables y condiciones.", "Define trigger, entrada, salida e invalidación.", "Declara dataset y provenance requeridos.", "Diseña plan in-sample y out-of-sample.", "Define métricas y supuestos de simulación.", "Documenta limitaciones y plan de Paper.", "Escribe un plan de iteración.", "Clasifica cada etapa como actualmente soportada, manual o no automatizada."] },
    { type: "callout", title: "Criterio de cierre", text: "No uses screenshots falsos ni workflow de Strategy Lab. El proyecto debe dejar claro qué GoodTrading soporta hoy y qué pertenece al futuro." },
  ])],
]);
