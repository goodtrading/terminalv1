export const marketStatus = {
  bias: "BEARISH",
  gamma: "SHORT",
  zone: "$82K",
  scenario: "RISK OFF",
  lastUpdate: "09 ABR · 14:32 UTC",
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
  setup: "RECHAZO → CONTINUACIÓN",
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
    text: "BTC tocó resistencia menor en $82,450. Reacción bajista confirmada. Próximo objetivo: $80,500.",
    timestamp: "09 ABR · 14:30",
    status: "active",
    type: "price",
  },
  {
    id: "2",
    text: "Gamma flip completado. Transición LONG → SHORT gamma. Los dealers ahora amplifican movimientos a la baja.",
    timestamp: "09 ABR · 12:15",
    status: "active",
    type: "gamma",
  },
  {
    id: "3",
    text: "Zona $80,500 en vigilancia máxima. Volumen institucional absorbiendo presión vendedora.",
    timestamp: "09 ABR · 10:02",
    status: "active",
    type: "zone",
  },
  {
    id: "4",
    text: "EJECUTADA: Resistencia $84,200 rechazada con fuerza. Caída de -3.2% desde máximo. Setup funcionó.",
    timestamp: "08 ABR · 18:45",
    status: "executed",
    type: "price",
  },
  {
    id: "5",
    text: "Absorción masiva detectada en $80,000. Interés abierto acumulado: +18K contratos.",
    timestamp: "08 ABR · 15:20",
    status: "executed",
    type: "absorption",
  },
  {
    id: "6",
    text: "Escenario actualizado. Bias cambia a BEARISH. Reducir exposición larga inmediatamente.",
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
    pressure: "VENDEDORES",
    pressureStrength: 74,
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
    pressure: "VENDEDORES",
    pressureStrength: 81,
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
    pressure: "COMPRADORES",
    pressureStrength: 55,
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
    pressure: "VENDEDORES",
    pressureStrength: 68,
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
    pressure: "COMPRADORES",
    pressureStrength: 62,
  },
];

export const learnCards = [
  {
    id: "1",
    title: "GAMMA EXPOSURE",
    shortDef: "Por qué el mercado se mueve más rápido de lo esperado",
    content:
      "Cuando los dealers tienen gamma corta, se ven obligados a vender cuando el precio sube y comprar cuando baja. No lo hacen porque quieran: tienen que hacerlo para cubrir su posición. El resultado: cada movimiento se amplifica. No es el mercado siendo irracional — son los dealers haciendo su trabajo y llevándote por delante.",
    keyPoints: [
      "Gamma corta = moves de 3x lo esperado",
      "Gamma larga = el mercado 'amortigua' en soporte",
      "El flip point es el nivel más peligroso del día",
    ],
    category: "OPCIONES",
    level: "INTERMEDIO",
  },
  {
    id: "2",
    title: "LIQUIDEZ",
    shortDef: "Dónde te cazan antes de moverse",
    content:
      "El precio no se mueve al azar. Se mueve a donde están las órdenes pendientes — los stops de los traders atrapados. Los institucionales necesitan contraparte para ejecutar. Tu stop loss es su liquidez. Antes de cualquier movimiento grande, el mercado primero barrió stops. Siempre.",
    keyPoints: [
      "Tus stops = combustible para el movimiento real",
      "Los números redondos concentran órdenes (son trampas)",
      "El precio 'visita' la liquidez antes de ir a destino",
    ],
    category: "ESTRUCTURA",
    level: "BÁSICO",
  },
  {
    id: "3",
    title: "ABSORCIÓN",
    shortDef: "Cuando el dinero grande entra en silencio",
    content:
      "La absorción es cuando ves volumen masivo pero el precio no se mueve. Eso no es ineficiencia — es un institucional absorbiendo todo lo que el mercado lanza. Está construyendo posición sin mover el precio. Es la calma antes del movimiento. Si sabes leerla, entras con ellos. Si no la ves, eres la contraparte.",
    keyPoints: [
      "Volumen alto + precio estancado = alguien acumula",
      "Precede los movimientos más fuertes del día",
      "Visible en el perfil de volumen como nodo de alto volumen",
    ],
    category: "VOLUMEN",
    level: "AVANZADO",
  },
  {
    id: "4",
    title: "BIAS DE MERCADO",
    shortDef: "La dirección que el dinero ya decidió",
    content:
      "El bias no es una opinión. Es la lectura del posicionamiento institucional real: flujos de opciones, interés abierto, futuros vs spot. Cuando el bias es bajista, buscar longs es nadar contra la corriente. El mercado no te debe nada — opera con el bias o acepta las consecuencias.",
    keyPoints: [
      "Bias alcista: únicamente buscar entradas largas",
      "Bias bajista: solo shorts en rebotes a resistencia",
      "Sin bias claro: tamaño reducido o sin posición",
    ],
    category: "ANÁLISIS",
    level: "BÁSICO",
  },
];
