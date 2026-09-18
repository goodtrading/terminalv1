import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const HEATMAP_AND_BOOKMAP_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-06-heatmap-and-bookmap-module-04-lesson-01", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-01", [
    { type: "heading", level: 2, text: "Passive Compression como comportamiento observado" },
    { type: "paragraph", text: "Passive Compression describe un marco analítico: el precio interactúa repetidamente cerca de liquidez pasiva persistente, el progreso direccional se restringe y la subasta acumula información alrededor de un área." },
    { type: "list", items: ["Liquidez pasiva relevante.", "Interacción repetida.", "Progreso limitado.", "Persistencia temporal.", "Presión de la subasta."] },
    { type: "callout", title: "Alcance", text: "No es un detector automático estable del Terminal y esta lesson no define un trigger ejecutable." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-02", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-02", [
    { type: "heading", level: 2, text: "Cuándo una compresión merece atención" },
    { type: "paragraph", text: "Una compresión analíticamente relevante combina ubicación significativa, persistencia, interacción repetida, liquidez que continúa siendo relevante, progreso restringido y actividad suficiente." },
    { type: "list", items: ["Una wall estática no alcanza.", "El chop aleatorio puede parecer compresión sin serlo.", "Una banda stale pierde relevancia.", "Sin interacción no existe evidencia suficiente.", "La actividad debe distinguirse del ruido transitorio."] },
    { type: "callout", title: "Sin umbral", text: "Estas dimensiones orientan la observación. No constituyen thresholds, scoring ni una regla automática." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-03", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-03", [
    { type: "heading", level: 2, text: "Arquetipo de compresión alcista" },
    { type: "paragraph", text: "Un contexto de Bullish Passive Compression puede describir presión repetida contra una zona pasiva, progreso restringido y una posibilidad de resolución ascendente si cambian las condiciones de la subasta." },
    { type: "list", items: ["Describe la liquidez pasiva y su persistencia.", "Registra la presión agresiva y el progreso real.", "Observa si la zona sigue limitando o pierde relevancia.", "Distingue posibilidad de resolución de confirmación."] },
    { type: "callout", title: "No es compra", text: "Este arquetipo no es un buy setup y no incluye confirmación exacta, stop, target ni entry." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-04", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-04", [
    { type: "heading", level: 2, text: "Arquetipo de compresión bajista" },
    { type: "paragraph", text: "Un contexto de Bearish Passive Compression puede describir presión repetida sobre una zona pasiva, progreso restringido y una posibilidad de resolución descendente si la subasta cambia." },
    { type: "list", items: ["Observa persistencia y ubicación.", "Compara agresión con progreso.", "Registra si la liquidez permanece, se repone o se retira.", "Trata la resolución como posibilidad contextual."] },
    { type: "callout", title: "No es venta", text: "El arquetipo no es un sell setup y no publica trigger, stop, target ni una regla ejecutable." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-05", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-05", [
    { type: "heading", level: 2, text: "Liberación de una zona comprimida" },
    { type: "paragraph", text: "Compression Breakout describe conceptualmente una salida de una subasta previamente restringida: cambian las condiciones de liquidez, el precio comienza a progresar más allá del área y la aceptación se vuelve relevante." },
    { type: "list", items: ["Compression previa y ubicación.", "Cambio en liquidez o interacción.", "Primer progreso más allá del área.", "Diferencia entre intento y aceptación sostenida."] },
    { type: "callout", title: "Sin entry", text: "Un breakout attempt no equivale a accepted breakout y esta lesson no define una entrada." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-06", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-06", [
    { type: "heading", level: 2, text: "Cuando la tesis de compresión falla" },
    { type: "paragraph", text: "Compression Failure describe la pérdida de relevancia de una tesis: la resolución esperada no se desarrolla, la liquidez pasiva desaparece o el precio acepta el lado opuesto del área." },
    { type: "list", items: ["La expectativa no se confirma.", "La liquidez se retira o se consume.", "El lado opuesto obtiene aceptación.", "La zona original deja de organizar la subasta."] },
    { type: "callout", title: "Información, no reversión", text: "El fallo actualiza la hipótesis. No es automáticamente un setup de reversión ni una señal de entrada." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-07", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-07", [
    { type: "heading", level: 2, text: "Compression y Open Interest" },
    { type: "paragraph", text: "Compression describe comportamiento de precio y liquidez; Open Interest agrega cambios en contratos de derivados abiertos. Observar expansión o contracción de OI durante una compresión puede enriquecer el contexto, pero no identifica exactamente a los participantes." },
    { type: "list", items: ["OI en expansión: cambia el total de contratos abiertos.", "OI en contracción: disminuye el total abierto.", "La misma compresión puede coexistir con contextos distintos de OI.", "La fuente, frescura y estructura siguen importando."] },
    { type: "callout", title: "Sin matriz determinista", text: "No existe una tabla universal OI + Compression que entregue dirección o acción automática." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-08", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-08", [
    { type: "heading", level: 2, text: "Compression y Gamma como capas complementarias" },
    { type: "paragraph", text: "Gamma puede señalar un contexto de posicionamiento de opciones donde vale la pena observar. Compression describe cómo se comportan la liquidez pasiva y la subasta cerca de esa zona." },
    { type: "list", items: ["¿La compresión aparece cerca de un contexto Gamma relevante?", "¿La liquidez persiste o se retira?", "¿La ejecución apoya o contradice la lectura?", "¿La aceptación real coincide con la hipótesis?"] },
    { type: "callout", title: "Frontera propietaria", text: "No se incluyen Gamma Flip, Magnet Rotation, confluencias exactas, entry, stop, target ni reglas de ejecución." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-09", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-09", [
    { type: "heading", level: 2, text: "Compression y liquidez inestable" },
    { type: "paragraph", text: "Una hipótesis de Passive Compression pierde credibilidad cuando la liquidez mostrada es inestable o spoof-like. El análisis debe preguntar si la zona persiste, sobrevive la aproximación, se repone después de ejecuciones o desaparece repetidamente." },
    { type: "list", items: ["Persistencia de la liquidez.", "Supervivencia al acercamiento.", "Replenishment después de interacción.", "Pulling o desaparición repetida.", "Ejecución y respuesta del precio."] },
    { type: "callout", title: "Sin acusación", text: "Spoof-like behavior es una hipótesis contextual. No se enseñan TTL, scoring ni un setup Compression + Spoofing." },
  ])],
  ["course-06-heatmap-and-bookmap-module-04-lesson-10", memberLesson("course-06-heatmap-and-bookmap-module-04-lesson-10", [
    { type: "heading", level: 2, text: "Entry e invalidation como hipótesis estructurada" },
    { type: "paragraph", text: "Antes de considerar una participación, formula qué mantiene válida la tesis de compresión, qué comportamiento sugiere que comienza a resolverse, qué la contradice y qué condición deja de justificar continuar observando el escenario." },
    { type: "list", items: ["Define la evidencia que sostiene la tesis.", "Separa resolución posible de confirmación.", "Describe la evidencia contradictoria.", "Define cuándo la hipótesis deja de ser válida."] },
    { type: "callout", title: "Frontera", text: "No se publican precio exacto, stop, threshold, confirmation stack, target, nombre de setup ni scoring. El Playbook ejecutable se formaliza en Course 11." },
  ])],
  ["course-06-heatmap-and-bookmap-module-05-lesson-04", memberLesson("course-06-heatmap-and-bookmap-module-05-lesson-04", [
    { type: "heading", level: 2, text: "Absorption alrededor de una wall" },
    { type: "paragraph", text: "La lectura combina una wall visible, ejecuciones agresivas reales y la respuesta del precio. El Heatmap muestra la liquidez mostrada; el Footprint ayuda a verificar qué se ejecutó." },
    { type: "list", items: ["¿La wall fue realmente negociada?", "¿Persistió o se repuso?", "¿La agresión produjo progreso?", "¿La liquidez se retiró antes de la interacción?"] },
    { type: "callout", title: "No setup", text: "La combinación describe interacción y contexto. No publica una regla final de ejecución." },
  ])],
  ["course-06-heatmap-and-bookmap-module-05-lesson-05", memberLesson("course-06-heatmap-and-bookmap-module-05-lesson-05", [
    { type: "heading", level: 2, text: "Agresividad que pierde fuerza" },
    { type: "paragraph", text: "Aggressive Exhaustion describe actividad agresiva que se debilita cerca de un contexto de liquidez relevante. El Heatmap ayuda a ubicar la zona; las ejecuciones aportan la evidencia de la actividad." },
    { type: "list", items: ["Exhaustion: disminuye la agresión.", "Absorption: la agresión encuentra oposición y progresa poco.", "Una banda visual no reemplaza el registro de trades.", "La interpretación depende de ubicación y respuesta."] },
    { type: "callout", title: "Sin trigger", text: "Exhaustion no es una entrada automática ni una garantía de reversión." },
  ])],
  ["course-06-heatmap-and-bookmap-module-05-lesson-06", memberLesson("course-06-heatmap-and-bookmap-module-05-lesson-06", [
    { type: "heading", level: 2, text: "Cuando falla una defensa de liquidez" },
    { type: "paragraph", text: "Failed Liquidity Defence describe una zona que parecía persistente o defendida y luego pierde esa función contextual: continúa la agresión, la liquidez se consume o retira y el precio obtiene aceptación más allá del nivel." },
    { type: "list", items: ["Agresión persistente.", "Depletion o withdrawal de la liquidez.", "Pérdida de persistencia.", "Aceptación más allá del área."] },
    { type: "callout", title: "No breakout rule", text: "El fallo informa que cambió el contexto. No define una entrada automática de breakout." },
  ])],
  ["course-06-heatmap-and-bookmap-module-06-lesson-01", memberLesson("course-06-heatmap-and-bookmap-module-06-lesson-01", [
    { type: "heading", level: 2, text: "GoodTrading Heatmap Replay Lab" },
    { type: "paragraph", text: "El replay prepara una reconstrucción temporal de la liquidez y evita juzgar la banda solo por el resultado final. Registra qué era histórico, qué era live, qué cambió y cómo respondió el precio." },
    { type: "list", items: ["Contexto.", "Liquidez histórica frente a live.", "Walls relevantes.", "Persistencia.", "Pulling y cancellation.", "Replenishment.", "Agresión ejecutada.", "Progreso del precio.", "Compression si aparece.", "Acceptance o rejection.", "Conclusión analítica Trade / Wait."] },
    { type: "callout", title: "Metadatos", text: "Esta lesson prepara el análisis de replay con terminalTarget HEATMAP y labType REPLAY. No implementa replay runtime ni publica entry, stop o target." },
  ])],
]);
