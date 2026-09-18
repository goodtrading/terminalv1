import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });
const source = (text: string): AcademyContentBlock => ({ type: "callout", title: "Procedencia y límite", text });

export const GAMMA_AND_DEALER_HEDGING_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-01", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-01", [
    { type: "heading", level: 2, text: "Comparar expiraciones sin borrar contexto" },
    { type: "paragraph", text: "Priorizar expiraciones no significa ordenar una lista por una sola variable. Compara tiempo restante, OI, concentración, distancia al spot, cobertura de IV, calidad del snapshot y horizonte de análisis. Una expiración cercana puede ser sensible pero irrelevante si su cobertura es pobre; una lejana puede dominar una agregación por tamaño, pero no necesariamente el horizonte intradía." },
    { type: "list", items: ["Separa fuente LIVE_DERIBIT de BOOTSTRAP.", "Revisa filas válidas y contratos excluidos.", "Compara concentración por strike sin sumar relojes incompatibles.", "Declara qué información falta antes de elevar una expiración."] },
    { type: "paragraph", text: "La prioridad es una decisión contextual, no una etiqueta automática. El modelo puede ayudar a ordenar evidencia, pero la importancia económica sigue dependiendo de la cartera y del mercado subyacente." },
    source("La expiración es observada; DTE, concentración y relevancia son derivados. No se publica el weighting ni el ranking propietario de GoodTrading."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-02", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-02", [
    { type: "heading", level: 2, text: "Priorizar zonas, no perseguir etiquetas" },
    { type: "paragraph", text: "Una zona merece atención contextual cuando varias dimensiones son coherentes: concentración Gamma, distancia al spot, expiry relevante, frescura del source, cobertura de IV/OI y relación con otras zonas. El objetivo es decidir qué evidencia revisar primero, no convertir una zona en soporte o resistencia garantizada." },
    { type: "list", items: ["Compara score estructural con inputs que lo producen.", "Distingue magnet, wall, flip y pocket.", "Comprueba si dos zonas provienen de expiries diferentes.", "Observa si liquidez y ejecución confirman o contradicen el mapa."] },
    { type: "paragraph", text: "Si el mapa cambia por una actualización de spot, OI o IV, la prioridad debe actualizarse. No congeles una zona histórica y la presentes como verdad actual." },
    source("Las zonas son derivadas/modeladas. El ranking exacto, pesos y thresholds pertenecen al límite propietario y no se publican aquí."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-03", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-03", [
    { type: "heading", level: 2, text: "Acceptance como hipótesis de régimen" },
    { type: "paragraph", text: "Cruzar un Gamma Flip no alcanza para hablar de aceptación. Conceptualmente, acceptance exige que la subasta sostenga el nuevo contexto: el precio permanece o trabaja más allá de la transición, la ejecución progresa y la liquidez responde de forma compatible con el régimen modelado." },
    { type: "list", items: ["Observa persistencia, no un solo tick.", "Separa movimiento de precio y calidad de ejecución.", "Comprueba si la liquidez acepta, se retira o se repone.", "Revisa si el flip sigue vigente y de qué variante proviene."] },
    { type: "paragraph", text: "Acceptance no es una entrada. No se definen aquí número de velas, tiempo, threshold, trigger de Order Flow, stop, target ni gestión. Course 11 formaliza el criterio ejecutable." },
    source("Spot frente al flip es observación/relación; el flip es derivado; acceptance es interpretación estructural. No es un hecho binario observado directamente."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-04", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-04", [
    { type: "heading", level: 2, text: "Rejection como falta de establecimiento" },
    { type: "paragraph", text: "Una zona puede ser testeada sin que el mercado establezca el nuevo régimen. Conceptualmente, rejection describe un intento fallido de continuar: el precio vuelve hacia el área previa, la liquidez cambia o la ejecución no consigue progreso sostenido." },
    { type: "list", items: ["Un rechazo no prueba reversión inmediata.", "Distingue falta de continuación de absorción confirmada.", "Revisa si el flip o la zona se recalcularon.", "Incluye el contexto de liquidez y derivados no-opciones."] },
    { type: "paragraph", text: "Esta lesson no crea una regla de entrada contraria. No define trigger, stop, target, duración ni scoring. La interpretación permanece como hipótesis que puede quedar invalidada por el siguiente estado del mercado." },
    source("Rejection es una lectura estructural sobre precio, ejecución y liquidez frente a un nivel derivado; no es una orden ni un trade observado."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-05", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-05", [
    { type: "heading", level: 2, text: "Cuando cambia el magnet relevante" },
    { type: "paragraph", text: "Magnet Rotation describe una hipótesis: una zona Gamma que antes organizaba el contexto pierde relevancia relativa y otra pasa a ser más importante. La rotación puede acompañar cambios de spot, OI, expiry, IV, concentración y aceptación o rechazo de la subasta." },
    { type: "list", items: ["Compara snapshots y timestamps.", "Identifica si cambió el input o solo el score.", "Separa magnet, wall, flip y transición.", "Comprueba si el precio realmente interactúa con la nueva zona."] },
    { type: "paragraph", text: "Un magnet no es un objetivo de precio y la rotación no es un setup. No se publica entrada, stop, target, score ni condición de ejecución. Course 11 reserva el framework operativo." },
    source("La rotación es una interpretación derivada de estructura cambiante. No representa órdenes futuras ni una probabilidad calibrada."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-06", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-06", [
    { type: "heading", level: 2, text: "Gamma y ejecución observada" },
    { type: "paragraph", text: "Gamma aporta un mapa estructural de dónde una cartera de opciones podría tener sensibilidad. Order Flow aporta evidencia de qué agresión se ejecuta ahora, cómo progresa el precio y si la liquidez responde. Son capas diferentes y complementarias." },
    { type: "list", items: ["Pregunta si la ejecución confirma o contradice el régimen.", "Observa progreso, absorción y continuidad.", "No llames dealer buying a una compra agresiva observada.", "No conviertas una coincidencia entre GEX y flujo en causalidad probada."] },
    { type: "paragraph", text: "La confluencia es una forma de organizar evidencia, no una matriz determinista. La calidad de cada capa —source, timestamp, cobertura y definición— debe mantenerse visible." },
    source("Gamma/GEX es derivado; agresión y liquidez ejecutada son observaciones de otra superficie; confluencia es modelo interpretativo."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-07", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-07", [
    { type: "heading", level: 2, text: "Gamma y liquidez" },
    { type: "paragraph", text: "Una zona Gamma describe sensibilidad estructural modelada. Liquidez describe interés pasivo visible y su comportamiento actual: presencia, persistencia, pull, replenishment y aceptación del precio. Una no sustituye a la otra." },
    { type: "list", items: ["¿La liquidez está presente cuando el precio llega?", "¿Permanece o se retira antes del touch?", "¿Se ejecuta y repone, o solo aparece en el snapshot?", "¿El precio acepta a través de la zona?"] },
    { type: "paragraph", text: "Una wall de opciones no es una pared de órdenes spot. Un magnet tampoco garantiza atracción. La lectura gana calidad cuando cada afirmación conserva la venue, el instrumento y el timestamp de su fuente." },
    source("Gamma zone y magnet son derivados/modelados; liquidity behavior es observado en otra capa; la relación entre ambos es interpretativa."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-08", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-08", [
    { type: "heading", level: 2, text: "Dos OI, dos instrumentos" },
    { type: "paragraph", text: "Options OI organiza contratos por strike y expiración y sirve como input de posicionamiento para Gamma. Perpetual/Futures OI pertenece a otra superficie de derivados: puede aportar contexto sobre exposición abierta del contrato, pero no debe sumarse sin preservar unidades, venue, contrato y timestamp." },
    { type: "list", items: ["Options OI: input de la cadena Deribit.", "Perpetual/Futures OI: capacidad estable en el código N5 actual.", "Una variación de OI no identifica por sí sola el lado participante.", "Compara series solo después de etiquetar fuente y unidad."] },
    { type: "paragraph", text: "La implementación N5 está pendiente de publicación. Course 09 no debe llamarla live en producción ni construir una matriz determinista Gamma + OI. La interacción se estudia como evidencia complementaria." },
    source("Options OI es observado en su venue; GEX es derivado. Perpetual/Futures OI es una capacidad N5 estable en código, pero no debe presentarse como desplegada."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-09", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-09", [
    { type: "heading", level: 2, text: "Cuándo reducir la confianza" },
    { type: "paragraph", text: "Ignorar Gamma no significa negar las opciones; significa no concederle peso interpretativo cuando la calidad de inputs o el contexto no lo justifican. Un modelo puede ser correcto en su cálculo y aun así no ser útil para la situación observada." },
    { type: "list", items: ["Source BOOTSTRAP en lugar de LIVE_DERIBIT.", "Snapshot stale o spot desalineado.", "IV faltante o cobertura parcial.", "OI escaso, ambiguo o concentrado en pocas filas.", "Múltiples flips sin una lectura estable.", "Flow observado que contradice fuertemente la hipótesis.", "NO_DATA o estados de recuperación neutrales."] },
    { type: "paragraph", text: "La ausencia de confianza no debe convertirse en cero exposición. Registra la razón como unavailable, partial o conflicting y evita que un valor neutral de fallback parezca una lectura válida." },
    source("La procedencia y cobertura son parte del dato. LIVE_DERIBIT no significa que todos los campos sean válidos; BOOTSTRAP y NO_DATA no deben llamarse live."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-10", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-10", [
    { type: "heading", level: 2, text: "Cuándo una tesis deja de aplicar" },
    { type: "paragraph", text: "Una tesis Gamma pierde relevancia cuando cambian los inputs que la construyeron o cuando el mercado observado contradice persistentemente su interpretación. El spot puede desplazarse, OI puede redistribuirse, IV puede cambiar y una expiry puede dejar de ser la referencia." },
    { type: "list", items: ["El snapshot o la fuente cambian de estado.", "Se modifica el universo de strikes o expiries.", "La concentración cambia de ubicación.", "El precio y la ejecución no muestran el comportamiento esperado.", "Liquidez, futures, perpetuals o macro dominan la escena."] },
    { type: "paragraph", text: "Invalidation aquí significa retirar peso interpretativo, no ejecutar automáticamente la operación contraria. Los criterios finales, umbrales, gestión y consecuencias de un playbook pertenecen a Course 11." },
    source("Inputs observados y métricas derivadas pueden cambiar; invalidation es una interpretación de contexto, no un evento dealer observado."),
  ])],
  ["course-09-gamma-and-dealer-hedging-module-07-lesson-11", memberLesson("course-09-gamma-and-dealer-hedging-module-07-lesson-11", [
    { type: "heading", level: 2, text: "Replay: separar evidencia antes de interpretar" },
    { type: "paragraph", text: "Un replay Gamma debe comenzar por la procedencia, no por una conclusión. Registra si la fuente es LIVE_DERIBIT, BOOTSTRAP o NO_DATA; separa filas observadas de métricas calculadas y de interpretaciones de posicionamiento antes de comparar el resultado con el precio." },
    { type: "list", items: ["1. Verificar source, timestamp y cobertura.", "2. Identificar expiries y strikes relevantes.", "3. Revisar régimen, curva y variante de flip.", "4. Ubicar zonas y concentración Gamma.", "5. Revisar Vanna, Charm y Open Interest.", "6. Comparar con liquidez y Order Flow.", "7. Decidir si el contexto era útil, conflictivo o debía ignorarse.", "8. Registrar Trade, Wait o Invalid como conclusión analítica, sin convertirlo en ejecución."] },
    { type: "paragraph", text: "La conclusión debe explicar qué se observó, qué se calculó y qué se infirió. No reconstruyas dealer trades que no están en los datos y no atribuyas causalidad a una coincidencia entre capas." },
    source("Replay es un marco editorial. No agrega runtime integration y no incluye entry, stop, target, score ni gestión ejecutable."),
  ])],
]);
