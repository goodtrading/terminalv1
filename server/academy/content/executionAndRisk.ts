import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const EXECUTION_AND_RISK_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-02-execution-and-risk-module-04-lesson-01", memberLesson("course-02-execution-and-risk-module-04-lesson-01", [
    { type: "heading", level: 2, text: "Agresiva frente a confirmada" },
    { type: "paragraph", text: "Una entrada agresiva prioriza participar antes de que la confirmación sea completa; una entrada confirmada espera evidencia adicional de respuesta, aceptación o ejecución. La diferencia es temporal y de información, no una garantía de mejor resultado." },
    { type: "list", items: ["Agresiva: menor latencia, mayor incertidumbre.", "Confirmada: más información, posible peor precio o menor recorrido.", "Ambas requieren una invalidación y un riesgo definido.", "La respuesta posterior del mercado importa más que la etiqueta de la entrada."] },
    { type: "callout", title: "Marco", text: "Elegir entre agresividad y confirmación es elegir qué incertidumbre aceptas: información incompleta o precio menos favorable." },
  ])],
  ["course-02-execution-and-risk-module-04-lesson-02", memberLesson("course-02-execution-and-risk-module-04-lesson-02", [
    { type: "heading", level: 2, text: "Elegir la invalidación" },
    { type: "paragraph", text: "La invalidación debe describir qué observación contradice la hipótesis. Puede relacionarse con estructura, respuesta del precio, tiempo o comportamiento de la liquidez, siempre que el criterio esté definido antes de que la posición esté bajo presión." },
    { type: "list", items: ["Define la hipótesis en términos observables.", "Identifica la condición que la contradice.", "Calcula el tamaño desde esa distancia y el riesgo permitido.", "No alejes la invalidación solo para evitar una salida."] },
    { type: "callout", title: "Disciplina", text: "Una invalidación útil cambia porque cambió la hipótesis, no porque el resultado momentáneo sea incómodo." },
  ])],
  ["course-02-execution-and-risk-module-04-lesson-03", memberLesson("course-02-execution-and-risk-module-04-lesson-03", [
    { type: "heading", level: 2, text: "Limit o Market según el contexto" },
    { type: "paragraph", text: "Market prioriza obtener ejecución contra la liquidez disponible. Limit prioriza controlar el precio aceptable y puede no ejecutarse. La elección depende de la urgencia, la liquidez, la distancia a la invalidación y el coste de no participar." },
    { type: "list", items: ["Usa Market cuando la ejecución inmediata es parte de la hipótesis.", "Usa Limit cuando el precio mínimo o máximo es una restricción real.", "Una Limit marketable puede ejecutar inmediatamente.", "No confundas un mejor precio potencial con una ejecución garantizada."] },
    { type: "callout", title: "Trade-off", text: "Cada tipo de orden intercambia dos riesgos: perder el movimiento o aceptar un precio menos controlado." },
  ])],
  ["course-02-execution-and-risk-module-04-lesson-04", memberLesson("course-02-execution-and-risk-module-04-lesson-04", [
    { type: "heading", level: 2, text: "Gestionar una posición parcialmente" },
    { type: "paragraph", text: "La gestión parcial cambia el tamaño de la exposición por etapas. Puede realizar parte del resultado y dejar una fracción abierta, pero cada reducción modifica el riesgo restante y exige revisar las protecciones asociadas." },
    { type: "list", items: ["Define por adelantado qué parte se reduce y bajo qué condición.", "Recalcula el riesgo de la posición restante.", "Verifica el tamaño confirmado después de cada fill.", "No conviertas una gestión parcial en una serie de decisiones improvisadas."] },
    { type: "callout", title: "Estado", text: "La posición restante es una nueva exposición: debe tener una lógica y un riesgo propios." },
  ])],
  ["course-02-execution-and-risk-module-04-lesson-05", memberLesson("course-02-execution-and-risk-module-04-lesson-05", [
    { type: "heading", level: 2, text: "Cuándo no mover a Break Even" },
    { type: "paragraph", text: "Mover una protección a Break Even demasiado pronto puede sacar la posición por una oscilación normal antes de que la hipótesis se desarrolle. La decisión debe considerar estructura, volatilidad, liquidez y la distancia que el mercado necesita para confirmar o rechazar la idea." },
    { type: "list", items: ["No muevas el stop solo porque la posición muestra una ganancia momentánea.", "Distingue avance favorable de confirmación suficiente.", "Considera comisiones y precio promedio real.", "Si el mercado aún puede fluctuar dentro de la hipótesis, Break Even puede ser prematuro."] },
    { type: "callout", title: "Criterio", text: "Break Even no elimina el riesgo: cambia el riesgo de pérdida por el riesgo de salida prematura." },
  ])],
  ["course-02-execution-and-risk-module-04-lesson-06", memberLesson("course-02-execution-and-risk-module-04-lesson-06", [
    { type: "heading", level: 2, text: "Gestionar alrededor de liquidez" },
    { type: "paragraph", text: "La liquidez visible puede facilitar o dificultar una ejecución, pero no es una promesa de defensa. Gestionar alrededor de ella exige observar si permanece, se consume, se repone o desaparece, y separar esos hechos de cualquier inferencia sobre intención." },
    { type: "list", items: ["Mide la cantidad disponible frente al tamaño de tu orden.", "Considera spread, profundidad y velocidad de cambio.", "No coloques una protección basándote solo en una pared visible.", "Después de ejecutar, vuelve a leer la liquidez y el estado de la posición."] },
    { type: "callout", title: "Observación", text: "Una zona de liquidez es un contexto de ejecución; no es automáticamente soporte, resistencia ni objetivo." },
  ])],
  ["course-02-execution-and-risk-module-04-lesson-07", memberLesson("course-02-execution-and-risk-module-04-lesson-07", [
    { type: "heading", level: 2, text: "Revisar la ejecución" },
    { type: "paragraph", text: "Execution Replay consiste en reconstruir la secuencia de una operación: contexto, orden enviada, fills, cambios de protección, respuesta del precio y estado final. El objetivo es comparar el plan con lo que realmente ocurrió, no fabricar una explicación retrospectiva." },
    { type: "list", items: ["Registra la hipótesis y la invalidación antes de ejecutar.", "Separa decisión, latencia, fill y gestión posterior.", "Compara el precio solicitado con el precio confirmado.", "Evalúa el proceso incluso cuando el resultado fue favorable."] },
    { type: "callout", title: "Replay", text: "Una revisión útil identifica decisiones observables y condiciones del mercado; no atribuye intención donde solo hay una inferencia." },
  ])],
]);
