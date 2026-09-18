import type { AcademyContentBlock } from "@shared/academy-content";

export const MARKET_STRUCTURE_AND_CONTEXT_CONTENT: Record<string, AcademyContentBlock[]> = {
  "market-structure-and-context-01-trend": [
    { type: "heading", level: 2, text: "Trend como condición contextual" },
    { type: "paragraph", text: "Una tendencia describe progreso direccional que se sostiene mediante una secuencia de movimientos y respuestas, no una sola vela positiva o negativa. Para estudiarla conviene observar desplazamiento, continuidad, retrocesos y persistencia dentro de un horizonte definido." },
    { type: "list", items: ["Observado: precio, velas, volumen y timestamps.", "Derivado: secuencias estructurales y métricas de progreso.", "Modelo: la lectura de continuidad o pérdida de dirección.", "Interpretación AI: un resumen contextual cuya calidad depende de la evidencia disponible."] },
    { type: "callout", title: "Límite", text: "El repositorio no tiene un detector universal de trend. Distintas capas pueden inferirlo de manera diferente; trend no es una señal long/short automática." },
  ],
  "market-structure-and-context-02-range": [
    { type: "heading", level: 2, text: "Range como balance temporal" },
    { type: "paragraph", text: "Un range describe un mercado que pasa tiempo negociando entre límites relativos, con rotación y progreso direccional limitado. La observación importante es la repetición de intercambio de dos lados y no solo la existencia visual de dos líneas." },
    { type: "list", items: ["Observado: precios que se superponen, volumen y ejecución.", "Derivado: límites, amplitud y relación con niveles.", "Modelo: balance, rotación o falta de resolución.", "La misma amplitud puede tener significados distintos según volatilidad y liquidez."] },
    { type: "callout", title: "No es setup", text: "Range aporta contexto de subasta. Este curso no define reglas exactas para operar extremos ni convierte balance en una entrada." },
  ],
  "market-structure-and-context-03-expansion": [
    { type: "heading", level: 2, text: "Expansion: más movimiento, no garantía" },
    { type: "paragraph", text: "Expansion es un aumento del desplazamiento, del rango o de la energía negociada. Puede aparecer con cambios en ATR, volumen, liquidez o contexto Gamma. Una expansión describe una condición observada o derivada; no garantiza continuación direccional." },
    { type: "list", items: ["Observado: rango de velas, volumen, trades y estado del libro cuando existe.", "Derivado: volatilidad, expansión de rango y presión de liquidez.", "Modelo: riesgo de aceleración o continuación.", "Un movimiento amplio también puede terminar en rechazo o volver a balance."] },
    { type: "callout", title: "Frontera", text: "El Volatility Engine tiene triggers y acciones operativas, pero esos detalles no forman parte de Course 10." },
  ],
  "market-structure-and-context-04-compression": [
    { type: "heading", level: 2, text: "Compression del mercado" },
    { type: "paragraph", text: "Market compression describe una reducción o concentración del movimiento realizado y del progreso de la subasta. Es un contexto de energía contenida, no una promesa de dirección futura." },
    { type: "list", items: ["Observado: velas estrechas, solapamiento y menor desplazamiento.", "Derivado: range, ATR y estado de energía del Volatility Engine.", "Modelo: posibilidad de expansión o continuación de balance.", "La liquidez puede cambiar mientras el precio parece comprimido."] },
    { type: "callout", title: "No mezclar conceptos", text: "Market compression no es automáticamente Passive Compression del curso de Heatmap. Passive Compression es un marco específico de liquidez pasiva; aquí solo integramos contexto." },
  ],
  "market-structure-and-context-05-volatility": [
    { type: "heading", level: 2, text: "Volatilidad como contexto" },
    { type: "paragraph", text: "Realized volatility se deriva de precio y candles. Implied volatility es un dato recibido de options cuando existe y es válido. El volatility regime es una clasificación derivada o modelada que puede cambiar el significado de la misma observación de Order Flow." },
    { type: "list", items: ["Baja volatilidad puede hacer que un desplazamiento pequeño sea relevante sin implicar tendencia.", "Alta volatilidad puede producir progreso amplio y también más ruido.", "Gamma y liquidez pueden refinar la lectura, pero no reemplazan la fuente.", "Si IV, candles o timestamps faltan, la conclusión debe degradarse."] },
    { type: "callout", title: "Fuente primero", text: "No toda etiqueta de volatilidad es live. Distingue datos observados, métricas derivadas y la interpretación del engine antes de explicar un régimen." },
  ],
  "market-structure-and-context-06-swing-structure": [
    { type: "heading", level: 2, text: "Organizar el precio con swings" },
    { type: "paragraph", text: "Los swings son máximos y mínimos locales que ayudan a ordenar la secuencia del precio dentro de un timeframe. Son una representación derivada: dependen del horizonte, de la resolución y de cuándo se considera confirmado un extremo." },
    { type: "list", items: ["Observado: OHLC y timestamps.", "Derivado: highs, lows y relaciones entre swings.", "Modelo: estructura ascendente, descendente o balanceada.", "Un swing aislado no define el contexto completo."] },
    { type: "callout", title: "Limitación", text: "Course 10 no publica thresholds propietarios de detección, cantidad de velas ni reglas de confirmación de swings." },
  ],
  "market-structure-and-context-07-higher-high-higher-low": [
    { type: "heading", level: 2, text: "HH y HL como progreso descriptivo" },
    { type: "paragraph", text: "Una secuencia de Higher High y Higher Low puede describir progreso estructural hacia arriba: un máximo supera una referencia anterior y el retroceso conserva un mínimo relativamente superior. La etiqueta organiza evidencia; no expresa por sí sola una señal." },
    { type: "list", items: ["Compara swings dentro del mismo horizonte.", "Observa si existe desplazamiento y follow-through.", "Contrasta la secuencia con volatilidad y liquidez.", "Una secuencia puede perder validez sin convertirse inmediatamente en reversión."] },
    { type: "callout", title: "No automatizar", text: "HH/HL no equivale a long automático. El producto no expone aquí una regla universal de bias ni un trigger de ejecución." },
  ],
  "market-structure-and-context-08-lower-high-lower-low": [
    { type: "heading", level: 2, text: "LH y LL como progreso descriptivo" },
    { type: "paragraph", text: "Una secuencia de Lower High y Lower Low puede describir progreso estructural hacia abajo. Su valor está en ordenar el comportamiento observado y compararlo con el contexto, no en convertir dos etiquetas en una decisión." },
    { type: "list", items: ["Usa un horizonte explícito.", "Distingue desplazamiento real de una excursión breve.", "Observa respuesta de liquidez y ejecución.", "Una estructura descendente puede coexistir con un rebote o transición."] },
    { type: "callout", title: "No es señal", text: "LH/LL no equivale a short automático. Las reglas exactas de bias y setup quedan fuera de Course 10." },
  ],
  "market-structure-and-context-09-balance": [
    { type: "heading", level: 2, text: "Balance como aceptación de intercambio" },
    { type: "paragraph", text: "Balance describe una subasta que acepta negocio alrededor de un área: el precio se superpone, rota y no logra sostener progreso direccional amplio. Es una lectura de comportamiento, no una definición ejecutable de rango." },
    { type: "list", items: ["Observado: repetición de trade, solapamiento y volumen.", "Derivado: área de balance y relación con extremos.", "Modelo: equilibrio temporal o falta de resolución.", "Liquidez y volatilidad pueden alterar rápidamente la apariencia del balance."] },
    { type: "callout", title: "Alcance", text: "Aquí balance organiza contexto. No define cuándo comprar un extremo, vender otro, ni cuándo un balance se convierte en un setup." },
  ],
  "market-structure-and-context-10-breakout": [
    { type: "heading", level: 2, text: "Breakout como salida estructural" },
    { type: "paragraph", text: "Un breakout es el desplazamiento del precio fuera de un área estructural previa. El primer print fuera del área es una observación; la aceptación posterior, el progreso y la respuesta de liquidez pertenecen a capas adicionales." },
    { type: "list", items: ["Observado: precio fuera de una referencia, ejecución y libro.", "Derivado: ruptura de rango o nivel.", "Modelo: posibilidad de continuación, rechazo o fakeout.", "La ausencia de follow-through mantiene la lectura abierta."] },
    { type: "callout", title: "Distinción crítica", text: "Breakout attempt no es lo mismo que accepted breakout. Course 10 no publica la confirmación exacta ni la secuencia operativa." },
  ],
  "market-structure-and-context-11-failed-breakout": [
    { type: "heading", level: 2, text: "Cuando la ruptura no se sostiene" },
    { type: "paragraph", text: "Failed breakout describe una salida de la estructura que no consigue sostener negocio fuera de ella. El retorno al área previa, la falta de progreso y la respuesta opuesta de liquidez o ejecución pueden aportar evidencia." },
    { type: "list", items: ["Separa el print inicial de la respuesta posterior.", "Observa si el precio vuelve al área previa.", "Revisa progreso, agresión, liquidez y volatilidad.", "El fracaso de una ruptura no demuestra automáticamente una reversión."] },
    { type: "callout", title: "Frontera", text: "La lectura es contextual. No se convierte en un setup de reversión, entrada, stop o target." },
  ],
  "market-structure-and-context-12-acceptance": [
    { type: "heading", level: 2, text: "Acceptance como concepto de subasta" },
    { type: "paragraph", text: "Acceptance significa que la subasta logra sostener negocio más allá o alrededor de un área estructural. Puede estudiarse mediante tiempo, trade repetido, progreso, volumen y comportamiento de la liquidez, pero ningún elemento aislado es una definición universal." },
    { type: "list", items: ["Observado: tiempo, ejecuciones, precio y liquidez cuando están disponibles.", "Derivado: permanencia, progreso y relación con el nivel.", "Modelo: aceptación o falta de aceptación.", "AI interpretation: resumen condicionado a la calidad de la evidencia."] },
    { type: "callout", title: "Sin regla propietaria", text: "GoodTrading tiene varias superficies que usan acceptance. No existe un owner universal confirmado; este curso no publica duración, cantidad de velas, volumen, delta, liquidez ni trigger exactos." },
  ],
  "market-structure-and-context-13-rejection": [
    { type: "heading", level: 2, text: "Rejection como incapacidad de sostener" },
    { type: "paragraph", text: "Rejection describe el fracaso de sostener negocio en o más allá de un área. El retorno a valor previo, la falta de continuación y la respuesta de ejecución o liquidez pueden ser evidencia, pero siguen siendo capas distintas." },
    { type: "list", items: ["Observa si el precio puede mantener la zona.", "Distingue retorno rápido de aceptación en el área anterior.", "Relaciona ejecución y progreso, no solo una mecha.", "Mantén la conclusión como modelo si faltan datos de tiempo o liquidez."] },
    { type: "callout", title: "Límite", text: "No hay criterios universales publicados para la rejection de GoodTrading. Los thresholds y la decisión ejecutable pertenecen a Course 11." },
  ],
  "market-structure-and-context-14-value-migration": [
    { type: "heading", level: 2, text: "Value que cambia de ubicación" },
    { type: "paragraph", text: "Value migration describe que el área donde la subasta realiza negocio puede desplazarse con el tiempo. Es útil para diferenciar continuidad, rotación y transición, siempre que se identifique qué métrica o perfil se está usando." },
    { type: "list", items: ["Observado: distribución de precios, tiempo y volumen según la fuente.", "Derivado: áreas de negocio y desplazamiento entre ventanas.", "Modelo: migración, permanencia o rechazo del nuevo contexto.", "No todas las superficies calculan value de la misma manera."] },
    { type: "callout", title: "Precisión", text: "El repositorio no prueba un único value metric propietario transversal. Enseñamos el concepto, no una fórmula ni una regla de ejecución." },
  ],
  "market-structure-and-context-15-price-discovery": [
    { type: "heading", level: 2, text: "Price discovery" },
    { type: "paragraph", text: "Price discovery ocurre cuando la subasta explora áreas con poca referencia transaccional previa. Puede producir rangos más amplios, liquidez inestable y menor densidad de niveles conocidos." },
    { type: "list", items: ["Observado: desplazamiento, trades, spreads y profundidad cuando existen.", "Derivado: distancia respecto de referencias y expansión del rango.", "Modelo: exploración, continuación posible o búsqueda de balance.", "Discovery no garantiza continuidad direccional."] },
    { type: "callout", title: "No confundir", text: "Una zona de price discovery no es automáticamente una oportunidad ni una dirección. Primero se verifica la calidad y la respuesta del mercado." },
  ],
  "market-structure-and-context-16-higher-timeframe": [
    { type: "heading", level: 2, text: "Higher timeframe como contexto" },
    { type: "paragraph", text: "Un timeframe mayor permite observar estructura más amplia, estados de volatilidad de mayor horizonte y niveles con otra escala. Es contexto para interpretar una señal local, no una confirmación mágica ni una garantía de dirección." },
    { type: "list", items: ["A mayor horizonte, menor detalle de ejecución inmediata.", "Los niveles pueden pertenecer a roles macro o intradía distintos.", "Gamma y posicionamiento también tienen expiries y ventanas diferentes.", "El repositorio no prueba un agregador canónico MTF de Market State."] },
    { type: "callout", title: "Límite", text: "No se afirma que GoodTrading requiera una confirmación HTF específica. Esa regla propietaria, si existe, pertenece a Course 11." },
  ],
  "market-structure-and-context-17-execution-timeframe": [
    { type: "heading", level: 2, text: "Execution timeframe" },
    { type: "paragraph", text: "El execution timeframe es la resolución donde se observa el comportamiento inmediato de precio, Order Flow, Footprint, DOM y liquidez. Su función es aportar detalle; no reemplaza el contexto de mayor escala." },
    { type: "list", items: ["Define qué significa un movimiento reciente.", "Puede revelar agresión, absorción o respuesta del libro.", "Está expuesto a ruido y señales incompletas.", "El producto no fija aquí un timeframe de ejecución único."] },
    { type: "callout", title: "Separación", text: "Context timeframe y execution timeframe cumplen roles diferentes. Course 10 no publica una resolución obligatoria ni una secuencia de entrada." },
  ],
  "market-structure-and-context-18-context-vs-trigger": [
    { type: "heading", level: 2, text: "Contexto versus trigger" },
    { type: "paragraph", text: "Contexto responde dónde y bajo qué condiciones está el mercado. Un trigger describe un evento específico que podría justificar avanzar en el análisis. Gamma zone, liquidity, OI y trend son contexto; un evento de Order Flow puede contribuir a un trigger, pero no constituye por sí solo el Playbook final." },
    { type: "list", items: ["Contexto organiza el ambiente.", "Trigger requiere una definición de evento y evidencia temporal.", "La misma señal cambia de significado en otro régimen.", "Datos stale o incompletos pueden invalidar una interpretación antes de buscar trigger."] },
    { type: "callout", title: "Frontera Course 11", text: "Este curso explica la diferencia conceptual. No publica el orden propietario, la pila final de confirmaciones ni una entrada ejecutable." },
  ],
  "market-structure-and-context-19-why-low-timeframe-signals-fail": [
    { type: "heading", level: 2, text: "Por qué falla una señal de bajo timeframe" },
    { type: "paragraph", text: "Una señal local puede fallar cuando contradice la subasta más amplia, aparece en un régimen de volatilidad incompatible o se interpreta sin liquidez, aceptación y follow-through. El problema no siempre está en el evento: puede estar en el contexto ausente." },
    { type: "list", items: ["Conflicto con estructura o balance de mayor horizonte.", "Volatilidad demasiado alta o demasiado comprimida para la lectura.", "Liquidez insuficiente, stale o en transición.", "Sin aceptación, progreso o respuesta posterior.", "Sobre reacción a una sola ejecución o a un dato incompleto."] },
    { type: "callout", title: "Diagnóstico", text: "Antes de descartar o ejecutar una señal, separa fuente, frescura, derivación y modelo. Course 10 no publica filtros cuantificados propietarios." },
  ],
};
