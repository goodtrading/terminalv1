import type { AcademyContentBlock } from "@shared/academy-content";

export const BTC_SCALPING_CONTENT: Record<string, AcademyContentBlock[]> = {
  "btc-scalping-01-what-is-scalping": [
    { type: "heading", level: 2, text: "Decisiones de horizonte corto" },
    { type: "paragraph", text: "Scalping es tomar decisiones con un horizonte de tenencia corto, donde la calidad de la ejecución y la lectura de la microestructura importan mucho. El horizonte no convierte una hipótesis débil en una oportunidad." },
    { type: "list", items: ["Empieza por el contexto, no por la velocidad de hacer clic.", "Observa qué evidencia es directa y qué parte es interpretación.", "Considera fill, slippage, latencia y datos incompletos.", "Selecciona; más operaciones no significa mejor scalping."] },
    { type: "callout", title: "Principio", text: "El scalping disciplinado protege la calidad de la decisión antes de buscar frecuencia." },
  ],
  "btc-scalping-02-what-scalping-is-not": [
    { type: "heading", level: 2, text: "Lo que no es scalping" },
    { type: "paragraph", text: "Scalping no es clicar constantemente, perseguir cada vela, maximizar leverage ni reaccionar a cada impresión de Order Flow. La velocidad puede reducir el tiempo para pensar sin aportar una ventaja real." },
    { type: "list", items: ["No ignores estructura ni volatilidad por mirar un detalle rápido.", "No conviertas un print aislado en una orden.", "No confundas actividad con selectividad.", "No uses apalancamiento para compensar una tesis incompleta."] },
    { type: "callout", title: "Ruido", text: "Si la información no permite explicar qué invalida la idea, esperar es más profesional que forzar una entrada." },
  ],
  "btc-scalping-03-context-before-trigger": [
    { type: "heading", level: 2, text: "Contexto antes del trigger" },
    { type: "paragraph", text: "Course 11 presenta el método general. En BTC, el mismo razonamiento debe comenzar por el entorno en el que aparece un evento corto: estructura, volatilidad, Gamma, liquidez, Order Flow, posicionamiento y calidad de datos." },
    { type: "list", items: ["¿Qué está haciendo la estructura de precio?", "¿La volatilidad acompaña o contradice la lectura?", "¿Qué contexto aporta Gamma y con qué frescura?", "¿La liquidez persiste, se retira o migra?", "¿La ejecución agresiva produce progreso?", "¿OI y posicionamiento son relevantes y están disponibles?", "¿La fuente es fresca, parcial o unavailable?"] },
    { type: "callout", title: "Límite", text: "Este mapa organiza preguntas. No publica gates finales ni el trigger propietario de BTC." },
  ],
  "btc-scalping-04-trading-around-liquidity": [
    { type: "heading", level: 2, text: "Leer la liquidez alrededor del precio" },
    { type: "paragraph", text: "BTC se negocia alrededor de profundidad visible y cambiante. El DOM y el Heatmap pueden mostrar persistencia, interacción, retiro, replenishment y migración, pero una wall visible no garantiza soporte, resistencia ni intención." },
    { type: "list", items: ["Distingue liquidez mostrada de ejecución efectivamente realizada.", "Observa qué cambia cuando el precio se aproxima.", "Compara retiro con consumo.", "Busca respuesta del precio y del flujo después de la interacción.", "Mantén pulling como observación, no como dirección automática."] },
    { type: "callout", title: "Precisión", text: "Una cancelación aislada no prueba spoofing y una wall no es una orden de trading." },
  ],
  "btc-scalping-05-btc-microstructure": [
    { type: "heading", level: 2, text: "Microestructura BTC y procedencia" },
    { type: "paragraph", text: "BTC se negocia continuamente y su información está distribuida entre venues y mercados. El producto separa el contexto Spot de Binance y otros proveedores, la infraestructura Perpetual de BingX y el contexto de opciones de Deribit." },
    { type: "list", items: ["Precio y libro pertenecen a una fuente concreta.", "Perpetual agrega leverage, funding y OI propios.", "Deribit aporta opciones, expiries y variables para Gamma.", "Unir fuentes para contexto no las convierte en una sola venue.", "Cada observación necesita símbolo, mercado, fuente y frescura."] },
    { type: "callout", title: "Provenance", text: "La primera pregunta no es qué significa el número, sino de qué mercado proviene y qué tan actual es." },
  ],
  "btc-scalping-06-spot-vs-perpetual": [
    { type: "heading", level: 2, text: "Dos mercados, distintas preguntas" },
    { type: "paragraph", text: "Spot y Perpetual pueden referirse al mismo activo sin representar la misma microestructura. Cambian el instrumento, la venue, el leverage, el funding, el posicionamiento, el libro y el significado de OI." },
    { type: "list", items: ["Confirma qué mercado estás observando.", "No mezcles un libro Spot con una decisión de ejecución Perpetual sin declarar el contexto.", "Usa Gamma y OI como contexto derivado con su fuente.", "Una relación entre mercados puede ser informativa sin ser causal ni mecánica."] },
    { type: "callout", title: "Separación", text: "GoodTrading puede consumir varias fuentes, pero la identidad de cada mercado debe permanecer visible." },
  ],
  "btc-scalping-07-session-behavior": [
    { type: "heading", level: 2, text: "Condiciones que cambian durante el día" },
    { type: "paragraph", text: "La participación, la liquidez y la volatilidad pueden cambiar a lo largo del día. Eso modifica la calidad de ejecución y la facilidad para interpretar una señal, sin crear automáticamente una sesión propietaria o un setup." },
    { type: "list", items: ["Observa si el libro está profundo o fragmentado.", "Compara la actividad y la calidad de los fills.", "Revisa si la volatilidad acompaña el contexto.", "Declara cuándo una condición no está disponible.", "No inventes reglas de Asia, Londres o Nueva York."] },
    { type: "callout", title: "Alcance", text: "El producto no confirma un runtime canónico de named sessions ni una opening-range rule de GoodTrading." },
  ],
};
