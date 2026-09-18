import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const BTC_SCALPING_MEMBER_CONTENT = new Map<string, AcademyMemberContentResponse>([
  ["course-12-btc-scalping-module-02-lesson-01", memberLesson("course-12-btc-scalping-module-02-lesson-01", [
    { type: "heading", level: 2, text: "Gamma y compresión como relación contextual" },
    { type: "paragraph", text: "Gamma aporta contexto estructural de opciones; Compression describe una subasta constreñida; Liquidity muestra la respuesta pasiva; Order Flow observa la ejecución agresiva; OI aporta posicionamiento; Volatility ayuda a distinguir contracción y expansión. Son familias de evidencia, no una receta." },
    { type: "list", items: ["Pregunta si las capas describen el mismo entorno.", "Separa datos observados de métricas derivadas.", "Busca progreso real y respuesta de la liquidez.", "Declara conflictos en lugar de resolverlos con una narrativa.", "Trata la hipótesis como revisable."] },
    { type: "callout", title: "Protección IP", text: "La lógica de calificación de producción de GoodTrading para este setup permanece interna. No se publican weighting, trigger, entry, score, stop, target ni management." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-02", memberLesson("course-12-btc-scalping-module-02-lesson-02", [
    { type: "heading", level: 2, text: "Absorption como hipótesis" },
    { type: "paragraph", text: "Buyer Absorption describe ventas agresivas absorbidas por compradores pasivos. Seller Absorption describe compras agresivas absorbidas por vendedores pasivos. En ambos casos, el nombre es una interpretación que debe contrastarse con ubicación, ejecución y progreso." },
    { type: "list", items: ["Observado: lado y cantidad de trades, niveles bid/ask y precio.", "Derivado: delta, imbalance y balance de ejecución.", "Interpretado: respuesta pasiva y falta de progreso.", "Después: observa si la subasta sostiene, rechaza o cambia de contexto.", "No conviertas absorción aislada en entrada."] },
    { type: "callout", title: "Estado actual", text: "El Footprint builder no prueba un detector canónico activo de absorción. No se publican entry sequence, score, threshold, timing, stop ni target." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-03", memberLesson("course-12-btc-scalping-module-02-lesson-03", [
    { type: "heading", level: 2, text: "Pulling cambia la información disponible" },
    { type: "paragraph", text: "Pulling significa que liquidez mostrada se reduce o se retira. Consumption describe ejecuciones contra esa liquidez; migration describe un cambio de ubicación; spoof-like behavior es una hipótesis sobre intención. No son sinónimos." },
    { type: "list", items: ["Registra qué estaba visible antes de la interacción.", "Comprueba si hubo consumo equivalente.", "Observa la respuesta del precio y del flujo.", "Revisa la liquidez que permanece.", "Mantén la dirección como una conclusión pendiente."] },
    { type: "callout", title: "Límite", text: "El criterio de continuación BTC permanece interno. No se publican pull threshold, timing, distance, lifetime, trigger ni entry." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-04", memberLesson("course-12-btc-scalping-module-02-lesson-04", [
    { type: "heading", level: 2, text: "Spoofing no es una lectura automática" },
    { type: "paragraph", text: "Una orden que desaparece puede ser gestión normal, repricing, riesgo, stale quote o migración. La hipótesis de spoofing incorpora intención, y la intención no puede probarse desde una cancelación aislada." },
    { type: "list", items: ["Cancellation no equivale a spoofing.", "Pull before touch no prueba intención.", "Short lifetime no prueba manipulación.", "La repetición puede cambiar la confianza, no convertir la hipótesis en hecho.", "Describe primero el evento observable."] },
    { type: "callout", title: "Estado actual", text: "No existe un detector BTC canónico aprobado, ni TTL, score o regla de ejecución. La interpretación server-side permanece UNKNOWN / hypothesis-oriented." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-05", memberLesson("course-12-btc-scalping-module-02-lesson-05", [
    { type: "heading", level: 2, text: "Timing sin publicar el árbol propietario" },
    { type: "paragraph", text: "La lectura de corto horizonte separa contexto, setup thesis, confirmación y oportunidad de ejecución. Esa separación ayuda a no ejecutar una idea solo porque apareció un evento rápido." },
    { type: "list", items: ["Aggressive puede priorizar respuesta inmediata.", "Confirmed espera evidencia adicional.", "Retest observa cómo responde una zona al volver a visitarla.", "Continuation evalúa si el progreso se mantiene.", "Rejection evalúa si una aceptación esperada no se sostiene."] },
    { type: "callout", title: "Protección IP", text: "Las condiciones exactas de timing de producción permanecen internas. No se publican timing tree, confirmations, price buffer, candle count, flow threshold ni order-type decision." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-06", memberLesson("course-12-btc-scalping-module-02-lesson-06", [
    { type: "heading", level: 2, text: "El stop pertenece a la tesis" },
    { type: "paragraph", text: "Un stop conceptual debe ubicarse donde la tesis deja de explicar mejor la evidencia, no donde el trader se siente incómodo. Estructura, invalidación del setup, liquidez y volatilidad pueden aportar lenguaje para pensar el riesgo." },
    { type: "list", items: ["Define qué hecho invalidaría la idea antes de ejecutar.", "Distingue invalidación de una simple fluctuación.", "Considera slippage y fill al evaluar riesgo.", "Usa Course 02 para la educación genérica de riesgo.", "No confundas una guardia de runtime con el método humano."] },
    { type: "callout", title: "Redacción", text: "El algoritmo de stop BTC de GoodTrading no se publica. No hay distance, percentage, ATR multiple, liquidity offset ni risk formula en esta lesson." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-07", memberLesson("course-12-btc-scalping-module-02-lesson-07", [
    { type: "heading", level: 2, text: "Invalidación: cambiar de explicación" },
    { type: "paragraph", text: "Invalidar responde qué evidencia demuestra que la tesis original ya no es la mejor explicación del mercado. Es una revisión de la hipótesis, no una predicción de que el precio necesariamente invertirá." },
    { type: "list", items: ["Puede aparecer aceptación donde se esperaba rechazo.", "Puede desaparecer el progreso que sostenía la idea.", "Puede cambiar la estructura de liquidez.", "Gamma u Order Flow pueden contradecir la lectura.", "Datos stale o unavailable pueden quitar fundamento a la tesis."] },
    { type: "callout", title: "Límite", text: "La invalidación se enseña cualitativamente. Los thresholds exactos de cancelación permanecen internos." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-08", memberLesson("course-12-btc-scalping-module-02-lesson-08", [
    { type: "heading", level: 2, text: "Management es una nueva decisión" },
    { type: "paragraph", text: "Después de la entrada, el mercado aporta evidencia nueva. Management no debe ser una reacción automática: pregunta si la tesis se fortaleció, se debilitó, si cambió el objetivo estructural o si aumentó el riesgo de ejecución." },
    { type: "list", items: ["Revisa la tesis con información posterior a la entrada.", "Observa estructura, liquidez y progreso.", "Separa protección de una expectativa de resultado.", "No uses Paper Trading como prueba del método humano.", "Una posición abierta no obliga a sostener una narrativa."] },
    { type: "callout", title: "Redacción", text: "No se publican partial percentage, partial timing, Break Even, trailing, OCO behavior ni move-stop logic." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-09", memberLesson("course-12-btc-scalping-module-02-lesson-09", [
    { type: "heading", level: 2, text: "Full TP y contexto disponible" },
    { type: "paragraph", text: "Un full exit debería relacionarse con la tesis y con el contexto actual, no únicamente con una cifra prefijada. Gamma, liquidez, niveles estructurales, pérdida de progreso y finalización de la subasta son referencias conceptuales." },
    { type: "list", items: ["Revisa si el objetivo de la tesis sigue vigente.", "Observa si el mercado completó el comportamiento esperado.", "Considera si apareció oposición o falta de progreso.", "Distingue un nivel contextual de una orden automática.", "Registra incertidumbre cuando el contexto es incompleto."] },
    { type: "callout", title: "Protección IP", text: "La target hierarchy de producción permanece interna. No se publica magnet priority, wall priority, void priority, expected-move logic, R target ni full-exit algorithm." },
  ])],
  ["course-12-btc-scalping-module-02-lesson-10", memberLesson("course-12-btc-scalping-module-02-lesson-10", [
    { type: "heading", level: 2, text: "Failed Setup no es igual a trade perdedor" },
    { type: "paragraph", text: "Un setup puede degradarse antes de que exista una entrada. Una operación válida puede perder, y una operación pobre puede ganar. La evaluación debe separar el proceso de decisión del resultado observado." },
    { type: "list", items: ["Busca conflicto entre las familias de evidencia.", "Observa ausencia de continuación.", "Reconoce pérdida de contexto.", "Trata datos inválidos como una reducción de confianza.", "Identifica contradicciones estructurales antes de forzar una orden."] },
    { type: "callout", title: "Disciplina", text: "La degradación conceptual no publica un cancel gate exacto. La lógica operativa de producción permanece interna." },
  ])],
  ["course-12-btc-scalping-module-03-lesson-01", memberLesson("course-12-btc-scalping-module-03-lesson-01", [
    { type: "heading", level: 2, text: "Winning Long: proceso antes que resultado" },
    { type: "paragraph", text: "Caso compuesto y sintético: una lectura de BTC reúne contexto, datos de venue, Gamma, liquidez y ejecución. La narración muestra qué se observó, qué se derivó, qué se interpretó y por qué la decisión parecía defendible en ese momento." },
    { type: "list", items: ["Separa hechos de hipótesis.", "Registra conflictos que todavía existían.", "Describe la decisión como candidato, no como certeza.", "Evalúa la calidad del proceso antes del resultado.", "El beneficio posterior no demuestra que la lectura sea clonable."] },
    { type: "callout", title: "Caso redactado", text: "No se incluyen entry, stop, target, score, size ni management tree. El caso enseña cronología y proceso, no una operación replicable." },
  ])],
  ["course-12-btc-scalping-module-03-lesson-02", memberLesson("course-12-btc-scalping-module-03-lesson-02", [
    { type: "heading", level: 2, text: "Winning Short: evidencia y contexto" },
    { type: "paragraph", text: "Caso compuesto y sintético de una hipótesis bajista. La secuencia revisa contexto, evidencia de venue, respuesta de liquidez, ejecución y decisión sin convertir el resultado favorable en una señal automática." },
    { type: "list", items: ["Explica qué evidencia estaba disponible.", "Declara qué parte era derivada o hipotética.", "Observa si el precio progresó o falló.", "Revisa la decisión sin usar el resultado como prueba retroactiva.", "Mantén los parámetros de producción fuera del relato."] },
    { type: "callout", title: "Límite", text: "No se publica un short setup copiable ni la secuencia propietaria de confirmación." },
  ])],
  ["course-12-btc-scalping-module-03-lesson-03", memberLesson("course-12-btc-scalping-module-03-lesson-03", [
    { type: "heading", level: 2, text: "Losing Long: proceso válido, resultado adverso" },
    { type: "paragraph", text: "Una decisión de buena calidad puede terminar en pérdida porque el mercado no está obligado a realizar la hipótesis. El análisis debe mirar la información disponible al decidir, no reescribirla con hindsight." },
    { type: "list", items: ["Identifica la evidencia que apoyaba el candidato.", "Distingue incertidumbre conocida de error de proceso.", "Registra qué evidencia posterior debilitó la tesis.", "Separa outcome de decision quality.", "No uses el caso para construir una entrada."] },
    { type: "callout", title: "Caso redactado", text: "Se omite toda reconstrucción exacta de ejecución, stop, target, tamaño y management." },
  ])],
  ["course-12-btc-scalping-module-03-lesson-04", memberLesson("course-12-btc-scalping-module-03-lesson-04", [
    { type: "heading", level: 2, text: "Losing Short: actualizar la hipótesis" },
    { type: "paragraph", text: "Un caso bajista compuesto muestra cómo la evidencia puede cambiar después de una decisión. La utilidad está en reconocer invalidación y calidad de proceso, no en descubrir una fórmula de short." },
    { type: "list", items: ["Revisa fuente, contexto y ejecución.", "Observa contradicciones que aparecieron después.", "No confundas una pérdida con una tesis necesariamente mala.", "No confundas una tesis coherente con una promesa.", "Documenta lo que no podía conocerse en el momento."] },
    { type: "callout", title: "Seguridad", text: "El ejemplo es sintético y no contiene timestamps privados, cuenta, posición, parámetros ni árbol de gestión." },
  ])],
  ["course-12-btc-scalping-module-03-lesson-05", memberLesson("course-12-btc-scalping-module-03-lesson-05", [
    { type: "heading", level: 2, text: "No Trade: evidencia insuficiente" },
    { type: "paragraph", text: "Algunas lecturas tienen elementos atractivos, pero contexto conflictivo o incompleto. En ese caso, NO TRADE o WAIT protege contra convertir una narrativa parcial en una obligación de ejecutar." },
    { type: "list", items: ["Una señal local puede contradecir la estructura.", "La liquidez puede ser ambigua o stale.", "Gamma u OI pueden no estar disponibles con calidad suficiente.", "Order Flow puede mostrar actividad sin progreso.", "La ausencia de una decisión también puede ser una decisión correcta."] },
    { type: "callout", title: "Sin score", text: "El caso explica la razón cualitativa para esperar. No publica score, gate ni condición exacta de no-trade." },
  ])],
  ["course-12-btc-scalping-module-03-lesson-06", memberLesson("course-12-btc-scalping-module-03-lesson-06", [
    { type: "heading", level: 2, text: "Good Decision / Bad Outcome" },
    { type: "paragraph", text: "Una buena decisión se evalúa con la información disponible al momento, no con el resultado final. El mercado puede producir un resultado adverso aunque la lectura, el riesgo y la invalidación hayan sido tratados con disciplina." },
    { type: "list", items: ["Conserva la cronología de evidencia.", "No agregues información posterior al momento de decisión.", "Distingue hipótesis razonable de certeza.", "Evalúa si la invalidación estaba comprendida.", "No conviertas el caso en recomendación de trading."] },
    { type: "callout", title: "Caso redactado", text: "Solo se presenta el proceso educativo. No se incluyen datos privados ni reconstrucción operacional completa." },
  ])],
  ["course-12-btc-scalping-module-03-lesson-07", memberLesson("course-12-btc-scalping-module-03-lesson-07", [
    { type: "heading", level: 2, text: "Bad Decision / Good Outcome" },
    { type: "paragraph", text: "Un resultado positivo no valida una mala decisión. Perseguir, ignorar invalidación, actuar sobre una sola señal, ignorar datos stale o forzar contexto puede producir beneficio por variación, no por calidad." },
    { type: "list", items: ["Evalúa el proceso antes de mirar el resultado.", "Identifica la evidencia que fue ignorada.", "Separa suerte de repetibilidad.", "Registra qué habría invalidado la idea.", "No uses un ganador para justificar una regla propietaria."] },
    { type: "callout", title: "Disciplina", text: "El caso es sintético y redactado. No contiene entry, stop, target, size ni management tree." },
  ])],
  ["course-12-btc-scalping-module-04-lesson-01", memberLesson("course-12-btc-scalping-module-04-lesson-01", [
    { type: "heading", level: 2, text: "Replay redactado de BTC" },
    { type: "paragraph", text: "Un replay útil conserva la cronología de la evidencia sin reconstruir parámetros propietarios. Empieza verificando la fuente y sigue el contexto BTC, Gamma, liquidez, Order Flow y OI antes de revisar la tesis." },
    { type: "list", items: ["Verifica data/source quality.", "Establece el contexto de BTC.", "Inspecciona Gamma, liquidez y Order Flow.", "Revisa OI/positioning cuando sea válido.", "Evalúa si la tesis mejora o se degrada.", "Decide TRADE CANDIDATE, WAIT o INVALID.", "Revisa el outcome separado de decision quality."] },
    { type: "callout", title: "Producción", text: "Los parámetros de ejecución BTC de producción permanecen internos a GoodTrading. No se publican timing, entry, stop, target, size, partial, Break Even, trailing, score, thresholds ni scan algorithm." },
  ])],
]);
