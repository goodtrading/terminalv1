import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const OPEN_INTEREST_AND_DERIVATIVES_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-07-open-interest-and-derivatives-module-04-lesson-01", memberLesson("course-07-open-interest-and-derivatives-module-04-lesson-01", [
    { type: "heading", level: 2, text: "OI y agresión" },
    { type: "paragraph", text: "Order Flow observa qué se ejecuta ahora; OI observa si la exposición abierta agregada se expande o se contrae. Compra agresiva junto con OI en expansión puede ser consistente con nueva exposición durante la compra, pero no identifica automáticamente nuevos longs." },
    { type: "list", items: ["Compra agresiva + OI en contracción podría incluir cierres.", "Venta agresiva + OI en expansión puede acompañar nueva exposición durante presión.", "Venta agresiva + OI en contracción podría incluir cierres o desapalancamiento.", "Verifica instrumento, venue, ventana y calidad de cada serie."] },
    { type: "callout", title: "Criterio", text: "La combinación acota hipótesis; no es un gatillo determinista ni una lectura de intención del participante." },
  ])],
  ["course-07-open-interest-and-derivatives-module-04-lesson-02", memberLesson("course-07-open-interest-and-derivatives-module-04-lesson-02", [
    { type: "heading", level: 2, text: "OI y absorción" },
    { type: "paragraph", text: "La absorción describe agresión que encuentra respuesta pasiva y no logra avanzar con facilidad. Si al mismo tiempo cambia OI, la observación puede aportar contexto sobre exposición abierta, pero no demuestra quién absorbió ni si la posición fue nueva o una cobertura." },
    { type: "list", items: ["Separa ejecución agresiva, respuesta del precio y cambio de OI.", "Comprueba si la absorción es persistente o solo una pausa.", "No conviertas una pared visible en identidad institucional.", "Registra la fuente de OI y su retraso frente al flujo."] },
    { type: "callout", title: "Lectura limitada", text: "Absorción + OI no revela dirección neta de cada participante. Describe capas complementarias que deben permanecer separadas." },
  ])],
  ["course-07-open-interest-and-derivatives-module-04-lesson-03", memberLesson("course-07-open-interest-and-derivatives-module-04-lesson-03", [
    { type: "heading", level: 2, text: "OI y compresión pasiva" },
    { type: "paragraph", text: "Una zona de liquidez pasiva que permanece visible mientras cambia el precio puede describirse como compresión solo si la evidencia temporal lo sostiene. OI añade información sobre exposición contractual, no sobre la validez de una defensa ni sobre el futuro breakout." },
    { type: "list", items: ["Liquidez indica órdenes mostradas; OI indica contratos abiertos.", "Una cancelación puede cambiar la imagen sin reducir OI.", "Un aumento de OI no confirma aceptación del nivel.", "La hipótesis debe sobrevivir a la respuesta posterior del precio."] },
    { type: "callout", title: "Sin setup", text: "Este marco prepara observación contextual. No define entrada, invalidación, objetivo ni reglas de ejecución." },
  ])],
  ["course-07-open-interest-and-derivatives-module-04-lesson-04", memberLesson("course-07-open-interest-and-derivatives-module-04-lesson-04", [
    { type: "heading", level: 2, text: "OI y breakout" },
    { type: "paragraph", text: "Un breakout con OI en expansión puede ser consistente con nueva exposición acompañando el desplazamiento. Un breakout con OI en contracción puede incluir cierres o short covering. En ambos casos, OI no determina si el movimiento continuará ni quién inició." },
    { type: "list", items: ["Evalúa aceptación después de la ruptura, no solo el primer tick.", "Compara agresión con progreso y liquidez disponible.", "Distingue expansión de contratos de transferencia de exposición.", "No extrapoles un contrato o exchange al mercado global."] },
    { type: "callout", title: "Pregunta correcta", text: "¿Qué cambió en precio, ejecución, liquidez y OI, en qué fuente y durante qué ventana? Esa pregunta es más sólida que llamar al breakout bullish por definición." },
  ])],
  ["course-07-open-interest-and-derivatives-module-04-lesson-05", memberLesson("course-07-open-interest-and-derivatives-module-04-lesson-05", [
    { type: "heading", level: 2, text: "OI como puente, no como Gamma" },
    { type: "paragraph", text: "OI ayuda a describir exposición abierta y prepara el vocabulario para estudiar opciones y hedging. No es GEX, no contiene por sí solo el signo de dealer y no permite construir una regla Gamma. Las opciones tienen OI por strike y expiración, distinto del OI de perpetuals o futures." },
    { type: "list", items: ["Compara instrumentos solo después de etiquetar sus unidades.", "No sumes opciones y perpetuals como una misma exposición.", "La distribución de opciones requiere modelo y supuestos explícitos.", "La relación con Gamma se estudia en el curso siguiente."] },
    { type: "callout", title: "Frontera Course 09", text: "Aquí solo se establece por qué el posicionamiento importa. GEX, Gamma Flip, signo de dealer, Magnet Rotation y hedging operativo quedan fuera." },
  ])],
  ["course-07-open-interest-and-derivatives-module-04-lesson-06", memberLesson("course-07-open-interest-and-derivatives-module-04-lesson-06", [
    { type: "heading", level: 2, text: "Casos de posicionamiento BTC" },
    { type: "paragraph", text: "Un caso útil no empieza con una etiqueta long o short. Comienza por fijar spot, perpetuals, futures u options; identificar venue y ventana; y luego comparar precio, volumen, ejecución, liquidez y OI sin ocultar los datos ausentes." },
    { type: "list", items: ["Caso A: precio y OI suben; hipótesis de expansión, no certeza de longs.", "Caso B: precio sube y OI cae; posible cierre, no prueba de short covering.", "Caso C: precio cae y OI sube; presión con nueva exposición posible, no shorts seguros.", "Caso D: precio cae y OI cae; reducción de exposición posible, no liquidación demostrada."] },
    { type: "callout", title: "Cierre", text: "La conclusión debe conservar fuente, unidad, timestamp y nivel de confianza. Una sola exchange no representa todo el posicionamiento de BTC." },
  ])],
]);
