import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });
const source = (text: string): AcademyContentBlock => ({ type: "callout", title: "Procedencia y límite", text });

export const GOOD_TRADING_PLAYBOOK_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-11-goodtrading-playbook-module-02-lesson-01", memberLesson("course-11-goodtrading-playbook-module-02-lesson-01", [
    { type: "heading", level: 2, text: "Un scan de evidencia, no una lista mecánica" },
    { type: "paragraph", text: "GoodTrading Market Scan organiza preguntas antes de considerar ejecución. El objetivo es saber qué evidencia existe, qué calidad tiene y dónde las capas coinciden o discrepan." },
    { type: "list", items: ["Revisa source, timestamp, frescura y completitud.", "Describe el Market State desde sus familias de evidencia.", "Ubica Gamma y positioning sin convertirlos en dirección automática.", "Observa liquidez, Order Flow y OI conservando su instrumento y fuente.", "Evalúa acceptance o rejection y la preparación para ejecución.", "Registra conflictos en lugar de forzar una conclusión."] },
    source("La secuencia exacta, sus gates, pesos, scores y transiciones de producción permanecen internos. Esta lesson enseña preguntas y razonamiento, no parámetros clonables."),
  ])],
  ["course-11-goodtrading-playbook-module-02-lesson-02", memberLesson("course-11-goodtrading-playbook-module-02-lesson-02", [
    { type: "heading", level: 2, text: "Trade, Wait o Invalid" },
    { type: "paragraph", text: "TRADE no significa certeza: indica que la evidencia es suficientemente coherente como para evaluar ejecución. WAIT significa que existe una hipótesis posible, pero falta claridad, confirmación o calidad de datos. INVALID significa que la evidencia actual ya no es explicada por la tesis original." },
    { type: "list", items: ["TRADE: las capas relevantes no presentan un conflicto dominante.", "WAIT: la idea puede seguir viva, pero la acción sería prematura.", "INVALID: cambió el contexto o apareció evidencia contradictoria.", "Revisar la clasificación es parte del método.", "No operar también es una decisión válida."] },
    { type: "callout", title: "WAIT no es fracaso", text: "Esperar protege la calidad de la decisión cuando la información todavía no permite distinguir una oportunidad de una narrativa forzada." },
    source("Los estados de runtime y sus transiciones no son una publicación de los gates humanos GoodTrading. Los scores y cutoffs permanecen internos."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-01", memberLesson("course-11-goodtrading-playbook-module-03-lesson-01", [
    { type: "heading", level: 2, text: "Gamma Flip Rejection como familia conceptual" },
    { type: "paragraph", text: "Esta familia estudia una interacción con Gamma Flip o una zona de transición cuando el mercado no logra establecer negocio donde la hipótesis esperaba continuidad." },
    { type: "list", items: ["¿El precio sostiene o pierde el área estructural?", "¿La ejecución muestra progreso o falla de progreso?", "¿La liquidez defiende, se retira o contradice la lectura?", "¿El contexto Gamma sigue siendo válido y fresco?", "¿La respuesta posterior confirma o debilita la hipótesis?"] },
    { type: "callout", title: "Invalidación conceptual", text: "Si el mercado establece acceptance donde se esperaba rejection, la tesis se debilita o deja de aplicar. Eso no publica una entrada contraria automática." },
    source("No se enseñan criterios exactos de rejection, distancia, duración, trigger, stop, target ni score."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-02", memberLesson("course-11-goodtrading-playbook-module-03-lesson-02", [
    { type: "heading", level: 2, text: "Gamma Flip Acceptance como hipótesis de establecimiento" },
    { type: "paragraph", text: "Cruzar el Flip no alcanza. La hipótesis de acceptance pregunta si el mercado consigue trabajar y sostenerse alrededor o más allá del área, con progreso y una respuesta de liquidez compatible." },
    { type: "list", items: ["Distingue cruce de establecimiento.", "Observa progreso de la ejecución, no solo precio.", "Comprueba si la liquidez se adapta, se consume o contradice.", "Revisa si Gamma sigue siendo relevante para el contexto actual.", "Mantén abierta la posibilidad de transición o falsa resolución."] },
    source("No se publican hold time, cantidad de velas, distancia, flow threshold, entry ni la secuencia exacta de confirmación."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-03", memberLesson("course-11-goodtrading-playbook-module-03-lesson-03", [
    { type: "heading", level: 2, text: "Magnet Rotation: modelo, no target" },
    { type: "paragraph", text: "Un magnet puede perder relevancia relativa mientras otra zona se vuelve más importante para el contexto. La hipótesis puede acompañar cambios de spot, OI, expiries, Gamma y comportamiento de la subasta." },
    { type: "list", items: ["Compara snapshots y timestamps.", "Pregunta qué input cambió y qué parte es derivada.", "Separa magnet, wall, Flip y transition zone.", "Observa si el precio realmente interactúa con la nueva zona.", "Trata la rotación como actualización de mapa, no como predicción obligatoria."] },
    source("No se publica ranking de magnets, trigger de rotación, score, distancia ni target-ranking logic."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-04", memberLesson("course-11-goodtrading-playbook-module-03-lesson-04", [
    { type: "heading", level: 2, text: "Passive Compression Breakout: concepto redactado" },
    { type: "paragraph", text: "Passive Compression combina interacción pasiva persistente con progreso restringido de la subasta. Una hipótesis de breakout pregunta si el mercado está dejando esa resolución contenida y pasando a progreso direccional aceptado." },
    { type: "list", items: ["Liquidez pasiva y su persistencia.", "Interacción observable y respuesta del precio.", "Ejecución agresiva y progreso real.", "OI como contexto de exposición, no como dirección automática.", "Gamma como contexto estructural, no como filtro suficiente.", "Contradicciones y calidad de fuente."] },
    { type: "callout", title: "Frontera propietaria", text: "El GoodTrading Playbook de producción aplica criterios internos adicionales de qualification que intencionalmente no forman parte de esta lesson." },
    source("No se publican qualification threshold, directionality formula, entry, trigger, confirmation stack, invalidation, target, OI/Gamma weighting, spoof filter ni score."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-05", memberLesson("course-11-goodtrading-playbook-module-03-lesson-05", [
    { type: "heading", level: 2, text: "Cuando falla la compresión" },
    { type: "paragraph", text: "Una tesis de compresión pierde fuerza cuando la resolución direccional no se sostiene, la estructura pasiva deja de ser confiable, el precio vuelve a la subasta previa o aparece acceptance opuesta." },
    { type: "list", items: ["Distingue una pausa de una pérdida de estructura.", "Revisa si el flujo produce progreso o vuelve a ser absorbido.", "Observa qué liquidez permanece después de la resolución.", "Actualiza el contexto si cambia Gamma, OI o la volatilidad.", "Una compresión fallida no es automáticamente una entrada de reversión."] },
    source("No se publican failure threshold, timing, entry, invalidation, target ni gestión."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-06", memberLesson("course-11-goodtrading-playbook-module-03-lesson-06", [
    { type: "heading", level: 2, text: "Liquidity Wall Rejection" },
    { type: "paragraph", text: "Una wall visible es contexto. La hipótesis de rejection gana calidad cuando se observa persistencia, interacción real, replenishment o respuesta del precio sin progreso suficiente." },
    { type: "list", items: ["¿La cantidad permaneció cuando el precio se aproximó?", "¿Hubo ejecuciones contra ella?", "¿Se repuso el pasivo después del consumo?", "¿El precio progresó o volvió al área?", "¿La wall se retiró antes de la interacción?"] },
    { type: "callout", title: "No confundir", text: "Una wall grande no es automáticamente soporte, resistencia ni defensa institucional. La lectura debe conservar observación e interpretación separadas." },
    source("No se publican wall-strength threshold, interaction count, distance buffer, entry, stop ni target."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-07", memberLesson("course-11-goodtrading-playbook-module-03-lesson-07", [
    { type: "heading", level: 2, text: "Liquidity Pull Continuation" },
    { type: "paragraph", text: "Pulling puede cambiar el camino de menor resistencia cuando una liquidez mostrada desaparece. Pero pulling es una observación sobre el libro, no una señal de continuación por sí misma." },
    { type: "list", items: ["Confirma qué estaba mostrado y cuándo cambió.", "Comprueba si hubo ejecución o cancelación.", "Observa la respuesta del precio después del retiro.", "Revisa la liquidez que queda y el contexto de estructura.", "Busca contradicciones en Order Flow y Gamma."] },
    { type: "callout", title: "Alcance", text: "El retiro modifica la evidencia disponible; no determina automáticamente dirección ni ejecución." },
    source("No se publican pull threshold, lifetime, timing, distance, continuation qualifier, entry, target ni score."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-08", memberLesson("course-11-goodtrading-playbook-module-03-lesson-08", [
    { type: "heading", level: 2, text: "Spoof + Execution: proteger la lectura" },
    { type: "paragraph", text: "El comportamiento spoof-like puede reducir la confianza en una liquidez mostrada y obligar a revisar la hipótesis. No debe convertirse en un setup ejecutable desde una sola cancelación." },
    { type: "list", items: ["Cancellation no equivale a spoofing.", "Pull before touch no prueba intención.", "Short lifetime no prueba manipulación.", "Compara secuencia, interacción, ejecución y respuesta.", "El estado server-side de spoof interpretation continúa siendo UNKNOWN / hypothesis-oriented."] },
    { type: "callout", title: "Disciplina", text: "La lección enseña a no sobre-confiar en una pared sospechosa, no a operar una acusación de spoofing." },
    source("No se publica spoof detector, TTL, score, trigger, entry, direction ni execution rule."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-09", memberLesson("course-11-goodtrading-playbook-module-03-lesson-09", [
    { type: "heading", level: 2, text: "Absorption Reversal" },
    { type: "paragraph", text: "La hipótesis aparece cuando participantes agresivos ejecutan repetidamente, pero el precio no progresa de forma proporcional porque la liquidez pasiva absorbe esa presión." },
    { type: "list", items: ["Ubica la interacción dentro de la estructura.", "Describe la agresión realmente observada.", "Revisa persistencia o respuesta del pasivo.", "Comprueba el fallo de progreso.", "Observa la subasta posterior antes de interpretar una reversión."] },
    { type: "callout", title: "No alcanza por sí sola", text: "Absorption puede explicar fricción, pero no define automáticamente reversión. La hipótesis necesita contexto y puede quedar invalidada por progreso contrario." },
    source("No se publican absorption score, numeric threshold, entry sequence, stop ni target."),
  ])],
  ["course-11-goodtrading-playbook-module-03-lesson-10", memberLesson("course-11-goodtrading-playbook-module-03-lesson-10", [
    { type: "heading", level: 2, text: "Failed Breakout" },
    { type: "paragraph", text: "Un Failed Breakout estudia un intento de abandonar una estructura que no consigue establecer aceptación. El retorno al área previa puede cambiar la tesis, pero no implica un fade automático." },
    { type: "list", items: ["Identifica el intento de ruptura.", "Evalúa falta de follow-through.", "Observa el retorno a la estructura.", "Revisa respuesta de liquidez y ejecución opuesta.", "Distingue rechazo temporal de nueva aceptación posterior."] },
    source("No se publican reclaim rule, distance, timing, entry, stop ni target."),
  ])],
  ["course-11-goodtrading-playbook-module-04-lesson-01", memberLesson("course-11-goodtrading-playbook-module-04-lesson-01", [
    { type: "heading", level: 2, text: "GoodTrading Market Replay" },
    { type: "paragraph", text: "El replay redactado reconstruye una cronología de razonamiento sin convertirla en una receta. Empieza por lo que se observó, continúa con lo derivado y separa la interpretación de la decisión final." },
    { type: "list", items: ["Registrar timestamps y calidad de cada fuente.", "Describir Market State, Gamma, liquidez, flujo y OI.", "Marcar dónde las capas coincidieron o entraron en conflicto.", "Explicar cómo el contexto mejoró o se degradó.", "Cerrar con TRADE, WAIT o INVALID como conclusión razonada, no como orden."] },
    { type: "callout", title: "Replay redactado", text: "El objetivo es enseñar la cronología de pensamiento. No se reconstruyen thresholds, scan algorithm, score, entry, stop, target, sizing ni management tree." },
  ])],
  ["course-11-goodtrading-playbook-module-04-lesson-02", memberLesson("course-11-goodtrading-playbook-module-04-lesson-02", [
    { type: "heading", level: 2, text: "Complete Market Scan: framework redactado" },
    { type: "paragraph", text: "Un Complete Market Scan reúne las categorías que deben revisarse antes de evaluar ejecución, sin publicar el algoritmo de qualification de producción." },
    { type: "list", items: ["Data quality y procedencia.", "Market State y estructura.", "Gamma y positioning.", "Liquidity y respuesta pasiva.", "Order Flow y progreso.", "OI conservando venue, instrumento y unidad.", "Acceptance / Rejection.", "Execution readiness.", "Conflict analysis.", "Final decision state: TRADE, WAIT o INVALID."] },
    { type: "callout", title: "Protección intencional", text: "The exact GoodTrading production qualification logic remains internal. La ausencia de parámetros aquí es protección de IP, no contenido faltante." },
    source("No se publican ordering gates, branching tree, score, threshold, setup selector ni exact execution criteria."),
  ])],
]);
