import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const FOOTPRINT_MASTERY_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-04-footprint-mastery-module-05-lesson-01", memberLesson("course-04-footprint-mastery-module-05-lesson-01", [
    { type: "heading", level: 2, text: "Absorción y Open Interest" },
    { type: "paragraph", text: "El Footprint muestra qué se ejecutó y cómo respondió el precio. Open Interest agrega información sobre contratos de derivados abiertos. Una absorción acompañada por expansión o contracción de OI puede describir dinámicas diferentes, pero no identifica automáticamente quién ocupa cada lado." },
    { type: "list", items: ["Absorción: agresión ejecutada con progreso restringido.", "OI en expansión: aumenta la cantidad de contratos abiertos.", "OI en contracción: disminuye la cantidad de contratos abiertos.", "La lectura final requiere contexto, tamaño, liquidez y fuente de datos."] },
    { type: "callout", title: "Límite", text: "Combinar Footprint y OI mejora el contexto disponible, pero no convierte una hipótesis de posicionamiento en una certeza sobre participantes." },
  ])],
  ["course-04-footprint-mastery-module-05-lesson-02", memberLesson("course-04-footprint-mastery-module-05-lesson-02", [
    { type: "heading", level: 2, text: "Absorción repetida en contexto" },
    { type: "paragraph", text: "La relevancia de una absorción repetida depende de su ubicación, la subasta previa, la estructura, los tests, el progreso y la liquidez. Repetición aporta dimensión temporal, pero no convierte una zona sin significado en una señal útil automáticamente." },
    { type: "list", items: ["Ubica la interacción dentro de la estructura.", "Compara cada test con el anterior.", "Observa si la oposición permanece, se repone o se consume.", "Actualiza la lectura cuando el precio cambia de comportamiento."] },
    { type: "callout", title: "Principio", text: "La misma firma de Footprint puede tener distinto significado según dónde y cuándo aparece." },
  ])],
  ["course-04-footprint-mastery-module-05-lesson-03", memberLesson("course-04-footprint-mastery-module-05-lesson-03", [
    { type: "heading", level: 2, text: "Footprint y Gamma" },
    { type: "paragraph", text: "Gamma puede aportar un contexto de posicionamiento o áreas donde vale la pena prestar atención. Footprint muestra qué ocurre cuando el precio interactúa con esas áreas: ejecuciones Bid/Ask, Delta, imbalances y progreso." },
    { type: "list", items: ["Gamma responde dónde estudiar el contexto.", "Footprint responde qué se está ejecutando allí.", "La interacción puede mostrar aceptación, rechazo, absorción o falta de progreso.", "Ninguna capa reemplaza la verificación de la otra."] },
    { type: "callout", title: "Alcance", text: "Esta relación es analítica. No incluye reglas Gamma Flip, entradas, invalidaciones, targets ni setups propietarios." },
  ])],
  ["course-04-footprint-mastery-module-05-lesson-04", memberLesson("course-04-footprint-mastery-module-05-lesson-04", [
    { type: "heading", level: 2, text: "Footprint y Heatmap" },
    { type: "paragraph", text: "Heatmap observa el comportamiento de liquidez mostrada o resting; Footprint organiza transacciones ejecutadas por precio. Juntos permiten comparar lo que estaba visible con lo que realmente se negoció." },
    { type: "list", items: ["¿La liquidez visible fue ejecutada o retirada?", "¿La agresión fue absorbida?", "¿La liquidez cambió antes de la interacción?", "¿La ejecución produjo progreso del precio?"] },
    { type: "callout", title: "Complementariedad", text: "Heatmap y Footprint describen capas distintas. No atribuyas intención a una pared ni conviertas su interacción en un setup automático." },
  ])],
  ["course-04-footprint-mastery-module-05-lesson-05", memberLesson("course-04-footprint-mastery-module-05-lesson-05", [
    { type: "heading", level: 2, text: "Marco Trade / Wait" },
    { type: "paragraph", text: "Un marco Trade / Wait ordena la evidencia antes de actuar. La ausencia de información suficiente debe producir WAIT, no una interpretación forzada ni una operación por defecto." },
    { type: "list", items: ["Contexto: qué subasta estaba ocurriendo.", "Ubicación: dónde se observa el Footprint.", "Ejecución: Bid, Ask, Delta e imbalance.", "Respuesta: progreso, aceptación o rechazo.", "Calidad: datos suficientes y evidencia no obsoleta.", "Contradicciones: señales que impiden una lectura coherente."] },
    { type: "callout", title: "Criterio", text: "Trade o Wait es una conclusión analítica. Esta lesson no define entry exacta, stop, target ni trigger propietario." },
  ])],
  ["course-04-footprint-mastery-module-05-lesson-06", memberLesson("course-04-footprint-mastery-module-05-lesson-06", [
    { type: "heading", level: 2, text: "Preparar un Footprint Replay" },
    { type: "paragraph", text: "El Replay Lab sirve para reconstruir una secuencia y separar observaciones de interpretaciones. El objetivo es comparar contexto, ejecución y respuesta sin inventar información que no estaba disponible en el momento." },
    { type: "list", items: ["Contexto y ubicación.", "Ejecuciones Bid/Ask.", "Delta e imbalances.", "Absorción o agotamiento como hipótesis.", "Progreso del precio.", "OI, Gamma y liquidez cuando estén disponibles.", "Acceptance o rejection.", "Conclusión Trade / Wait."] },
    { type: "callout", title: "Alcance", text: "El lab prepara el análisis de replay. No implementa un motor de replay ni publica reglas de entrada, invalidación o target." },
  ])],
]);
