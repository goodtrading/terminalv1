export const marketStatus = {
  bias: "BEARISH",
  gamma: "SHORT",
  zone: "DISTRIBUTION",
  scenario: "RISK OFF",
  lastUpdate: "09 APR 2026 · 14:32 UTC",
  biasStrength: 78,
};

export const scenarioDetail = {
  title: "DISTRIBUCIÓN ACTIVA",
  description:
    "El mercado se encuentra en fase de distribución institucional. Los participantes grandes están reduciendo exposición. La gamma corta amplifica los movimientos a la baja. Zonas clave de liquidez por debajo.",
  probability: 78,
  outlook: "NEUTRAL → BEARISH",
  timeframe: "4H – 1D",
  tags: ["DISTRIBUCIÓN", "GAMMA SHORT", "RIESGO ALTO"],
};

export const keyZones = [
  { label: "RESISTENCIA MAYOR", price: "84,200", type: "resistance", distance: "+2.1%" },
  { label: "RESISTENCIA MENOR", price: "82,450", type: "resistance", distance: "+0.3%" },
  { label: "PRECIO ACTUAL", price: "82,200", type: "current", distance: "—" },
  { label: "SOPORTE CLAVE", price: "80,500", type: "support", distance: "-2.1%" },
  { label: "SOPORTE MAYOR", price: "78,000", type: "support", distance: "-5.1%" },
];

export const gammaStatus = {
  state: "SHORT",
  level: -72,
  netGamma: "-$1.2B",
  flipPoint: "83,500",
  description:
    "Gamma neta negativa. Los market makers amplifican los movimientos. Alta volatilidad esperada en zonas de liquidez.",
  dominantExpiry: "APR 11",
};

export const alerts = [
  {
    id: "1",
    text: "BTC alcanzó zona de resistencia menor en 82,450. Reacción bajista confirmada.",
    timestamp: "09 ABR · 14:30",
    status: "active",
    type: "price",
  },
  {
    id: "2",
    text: "Gamma flip detectado. Transición de long a short gamma completada.",
    timestamp: "09 ABR · 12:15",
    status: "active",
    type: "gamma",
  },
  {
    id: "3",
    text: "Zona de soporte 80,500 en vigilancia. Volumen institucional acumulando.",
    timestamp: "09 ABR · 10:02",
    status: "active",
    type: "zone",
  },
  {
    id: "4",
    text: "Alerta ejecutada: Resistencia 84,200 tocada y rechazada. -3.2% desde máximo.",
    timestamp: "08 ABR · 18:45",
    status: "executed",
    type: "price",
  },
  {
    id: "5",
    text: "Absorción detectada en 80,000. Posible acumulación de interés abierto.",
    timestamp: "08 ABR · 15:20",
    status: "executed",
    type: "absorption",
  },
  {
    id: "6",
    text: "Escenario actualizado a RISK OFF. Bias cambia a BEARISH.",
    timestamp: "08 ABR · 09:00",
    status: "executed",
    type: "scenario",
  },
];

export const watchlist = [
  {
    id: "1",
    symbol: "BTC",
    name: "Bitcoin",
    price: "82,200",
    change: "-2.34%",
    changeDirection: "down",
    nearestLevel: "80,500",
    levelType: "support",
    levelDistance: "-2.1%",
  },
  {
    id: "2",
    symbol: "ETH",
    name: "Ethereum",
    price: "1,842",
    change: "-3.12%",
    changeDirection: "down",
    nearestLevel: "1,800",
    levelType: "support",
    levelDistance: "-2.3%",
  },
  {
    id: "3",
    symbol: "SOL",
    name: "Solana",
    price: "118.40",
    change: "+1.05%",
    changeDirection: "up",
    nearestLevel: "125.00",
    levelType: "resistance",
    levelDistance: "+5.6%",
  },
  {
    id: "4",
    symbol: "SPX",
    name: "S&P 500",
    price: "5,162",
    change: "-1.87%",
    changeDirection: "down",
    nearestLevel: "5,000",
    levelType: "support",
    levelDistance: "-3.1%",
  },
  {
    id: "5",
    symbol: "DXY",
    name: "US Dollar Index",
    price: "103.45",
    change: "+0.42%",
    changeDirection: "up",
    nearestLevel: "105.00",
    levelType: "resistance",
    levelDistance: "+1.5%",
  },
];

export const learnCards = [
  {
    id: "1",
    title: "GAMMA EXPOSURE",
    shortDef: "Cómo los dealers amplifican el mercado",
    content:
      "Gamma es la tasa de cambio del Delta de las opciones. Cuando los market makers tienen gamma corta, venden cuando sube y compran cuando baja, amplificando los movimientos. Gamma larga hace lo opuesto: estabiliza el precio.",
    keyPoints: [
      "Gamma corta = volatilidad amplificada",
      "Gamma larga = mercado más estable",
      "El gamma flip point es zona crítica",
    ],
    category: "OPCIONES",
    level: "INTERMEDIO",
  },
  {
    id: "2",
    title: "LIQUIDEZ",
    shortDef: "Donde están las órdenes institucionales",
    content:
      "La liquidez en mercados financieros representa las órdenes pendientes acumuladas. Los precios se mueven hacia zonas de alta liquidez para ejecutar las órdenes institucionales. Entender esto permite anticipar movimientos.",
    keyPoints: [
      "Stops = fuente de liquidez",
      "El precio 'caza' liquidez antes de revertir",
      "Zonas redondas = alta concentración",
    ],
    category: "ESTRUCTURA",
    level: "BÁSICO",
  },
  {
    id: "3",
    title: "ABSORCIÓN",
    shortDef: "Señal de acumulación institucional",
    content:
      "La absorción ocurre cuando grandes participantes absorben toda la presión vendedora (o compradora) sin mover significativamente el precio. Es una señal temprana de que el dinero institucional está tomando posición.",
    keyPoints: [
      "Alto volumen + precio estable = absorción",
      "Precede a movimientos fuertes",
      "Visible en el perfil de volumen",
    ],
    category: "VOLUMEN",
    level: "AVANZADO",
  },
  {
    id: "4",
    title: "BIAS DE MERCADO",
    shortDef: "Dirección predominante institucional",
    content:
      "El bias es la dirección de menor resistencia determinada por el posicionamiento institucional, flujos de opciones y estructura macro. No es una predicción, es un contexto operativo que define las probabilidades a favor.",
    keyPoints: [
      "Bias alcista: buscar longs en soporte",
      "Bias bajista: buscar shorts en resistencia",
      "Bias neutro: reducir tamaño de posición",
    ],
    category: "ANÁLISIS",
    level: "BÁSICO",
  },
];
