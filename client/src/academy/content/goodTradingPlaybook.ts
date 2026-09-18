import type { AcademyContentBlock } from "@shared/academy-content";

export const GOOD_TRADING_PLAYBOOK_CONTENT: Record<string, AcademyContentBlock[]> = {
  "goodtrading-playbook-01-what-is-the-goodtrading-method": [
    { type: "heading", level: 2, text: "Pensar en capas, no seguir un indicador" },
    { type: "paragraph", text: "El método GoodTrading no trata un indicador aislado como una orden. Construye una hipótesis a partir de varias familias de evidencia y conserva la posibilidad de no operar cuando esas capas no son coherentes." },
    { type: "list", items: ["Market State describe el entorno.", "Gamma aporta contexto estructural de opciones.", "Liquidity describe lo que se muestra y cómo cambia.", "Order Flow describe lo que se ejecuta.", "Acceptance o rejection ayudan a evaluar la respuesta de la subasta.", "Execution llega después de comprender la tesis y su invalidación."] },
    { type: "callout", title: "Jerarquía explicativa", text: "Market State → Gamma → Liquidity → Order Flow → Acceptance / Rejection → Execution es una forma de ordenar preguntas, no la publicación del algoritmo propietario ni una garantía de operación." },
  ],
  "goodtrading-playbook-02-market-state": [
    { type: "heading", level: 2, text: "El entorno antes de la decisión" },
    { type: "paragraph", text: "Market State responde: ¿en qué entorno estoy operando? Course 10 ya desarrolló esta lectura; aquí solo se ubica dentro del método GoodTrading." },
    { type: "list", items: ["Revisa estructura y comportamiento de la subasta.", "Considera volatilidad y energía del movimiento.", "Integra Gamma y positioning como contexto, no como orden.", "Observa liquidez y ejecución disponibles.", "Comprueba la calidad, frescura y completitud de los datos."] },
    { type: "callout", title: "Sin taxonomía única", text: "Las distintas superficies del producto pueden interpretar Market State de manera diferente. No existe aquí una transición universal que deba copiarse como método humano." },
  ],
  "goodtrading-playbook-03-gamma-map": [
    { type: "heading", level: 2, text: "Gamma como mapa estructural" },
    { type: "paragraph", text: "Gamma puede aportar un mapa de régimen, Flip, magnets, walls, concentración y relevancia de expiries cuando sus inputs son válidos. Ese mapa organiza el contexto; no es una trade signal." },
    { type: "list", items: ["Distingue datos observados de métricas derivadas.", "Comprueba source, timestamp y cobertura.", "Separa Flip, magnet, wall y transition zone.", "Observa si precio, liquidez y ejecución confirman o contradicen el mapa.", "Reduce confianza cuando el snapshot es stale, parcial o bootstrap."] },
    { type: "callout", title: "Límite", text: "El ranking de zonas, la relevancia de expiries, Magnet Rotation y la calificación de setups pertenecen a una capa protegida y no se definen en esta lesson." },
  ],
  "goodtrading-playbook-04-liquidity": [
    { type: "heading", level: 2, text: "Leer lo que el pasivo muestra" },
    { type: "paragraph", text: "Liquidity responde qué participantes pasivos están mostrando y cómo cambia esa pantalla cuando el precio se aproxima o interactúa. Una wall visible no equivale automáticamente a soporte, resistencia o intención institucional." },
    { type: "list", items: ["Observa persistencia y ubicación.", "Distingue retiro de consumo ejecutado.", "Busca replenishment solo cuando existe interacción observable.", "Compara migración, profundidad y respuesta del precio.", "Mantén spoof-like behavior como hipótesis, no como hecho."] },
    { type: "callout", title: "Información, no mandato", text: "La liquidez cambia la calidad de una hipótesis. No publica aquí thresholds de wall, lifetime, pulling, spoofing ni parámetros de setup." },
  ],
  "goodtrading-playbook-05-order-flow": [
    { type: "heading", level: 2, text: "Leer lo que realmente se ejecuta" },
    { type: "paragraph", text: "Order Flow responde qué agresión ocurre ahora y si produce progreso. Delta, imbalance, footprint o velocidad del tape son evidencias que necesitan ubicación, estructura y respuesta pasiva." },
    { type: "list", items: ["Agresión con progreso puede apoyar una tesis.", "Agresión sin progreso puede señalar fricción, absorción o agotamiento.", "Un imbalance necesita contexto de nivel.", "Absorption y exhaustion no son sinónimos.", "Una ejecución aislada no es automáticamente un trigger."] },
    { type: "callout", title: "No perseguir prints", text: "El método evita convertir una impresión rápida del tape en una decisión sin contexto, invalidación y lectura de liquidez." },
  ],
  "goodtrading-playbook-06-acceptance-rejection": [
    { type: "heading", level: 2, text: "La respuesta de la subasta" },
    { type: "paragraph", text: "Contexto propone una idea. Acceptance o rejection ayudan a evaluar si el comportamiento posterior sostiene o contradice esa idea." },
    { type: "list", items: ["Acceptance: el mercado opera y sostiene negocio alrededor o más allá de un área.", "Rejection: el mercado no logra establecerse y vuelve a una referencia previa o pierde continuidad.", "La ejecución debe mostrar una respuesta compatible con la lectura.", "La liquidez puede confirmar, limitar o contradecir la interpretación.", "Un cruce aislado no demuestra acceptance."] },
    { type: "callout", title: "Sin regla clonable", text: "Esta lesson no define duración, velas, delta, volumen, distancia ni persistencia exacta. Esas decisiones pertenecen a una capa protegida." },
  ],
  "goodtrading-playbook-07-execution": [
    { type: "heading", level: 2, text: "De la tesis al fill" },
    { type: "paragraph", text: "La disciplina conceptual separa tesis, evidencia, trigger, orden y fill. Antes de evaluar una orden hay que entender qué observación invalida la hipótesis." },
    { type: "list", items: ["La tesis explica qué se espera y por qué.", "La evidencia debe conservar source y calidad.", "El trigger es un evento de decisión, no cualquier movimiento.", "La orden puede no llenarse o llenarse con slippage.", "El resultado del fill no convierte una mala hipótesis en correcta."] },
    { type: "callout", title: "Market o Limit", text: "Market prioriza participar contra la liquidez disponible; Limit prioriza controlar el precio y puede no ejecutarse. La elección exacta del método GoodTrading no se publica aquí." },
  ],
  "goodtrading-playbook-08-full-public-example": [
    { type: "heading", level: 2, text: "Ejemplo educativo redactado" },
    { type: "paragraph", text: "Supongamos un mercado cuya estructura amplia parece contenida, con un mapa Gamma que señala una zona de transición y una wall visible cerca del precio. La wall persiste durante la aproximación, pero el flujo agresivo todavía no produce progreso claro." },
    { type: "list", items: ["Mercado: contexto de rango o transición, sin asumir una taxonomía universal.", "Gamma: referencia estructural derivada, con calidad de fuente por revisar.", "Liquidity: wall observada y todavía no confirmada como defensa.", "Order Flow: agresión presente, pero respuesta y progreso conflictivos.", "Acceptance / rejection: todavía no hay evidencia suficiente para cerrar la lectura."] },
    { type: "callout", title: "Decisión", text: "La conclusión educativa es WAIT: existe una hipótesis, pero la evidencia no es suficientemente coherente para evaluar ejecución. Si el mercado contradice la hipótesis, la clasificación pasa a INVALID; si las capas se alinean, puede convertirse en TRADE CANDIDATE." },
  ],
};
