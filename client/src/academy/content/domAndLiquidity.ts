import type { AcademyContentBlock } from "@shared/academy-content";

export const DOM_AND_LIQUIDITY_CONTENT: Record<string, AcademyContentBlock[]> = {
  "dom-and-liquidity-01-what-is-the-dom": [
    { type: "heading", level: 2, text: "La escalera de liquidez resting" },
    { type: "paragraph", text: "El DOM (Depth of Market) muestra órdenes resting organizadas por precio en una escalera. Permite observar Bid, Ask/Offer, mejores precios y cantidad disponible en distintos niveles." },
    { type: "list", items: ["Bid: liquidez compradora mostrada.", "Ask u Offer: liquidez vendedora mostrada.", "Best Bid y Best Ask: los precios más cercanos al mercado.", "La cantidad es un snapshot dinámico, no una promesa de ejecución."] },
    { type: "callout", title: "DOM vs Footprint", text: "El DOM muestra liquidez mostrada/resting. El Footprint muestra transacciones ejecutadas. Son capas distintas y complementarias." },
  ],
  "dom-and-liquidity-02-bids": [
    { type: "heading", level: 2, text: "Bids" },
    { type: "paragraph", text: "Los Bids son órdenes limit esperando comprar. Su cantidad puede aparecer por debajo del precio actual o en el Best Bid, y cambia cuando se agregan, ejecutan, modifican o cancelan órdenes." },
    { type: "list", items: ["Observa el precio y la cantidad, no solo el tamaño.", "La profundidad cercana suele cambiar con rapidez.", "Un Bid grande describe liquidez visible en ese momento.", "La ejecución real debe confirmarse con trades, no inferirse del tamaño."] },
    { type: "callout", title: "Límite", text: "Un Bid grande no es automáticamente soporte. Puede ser ejecutado, reducido o retirado antes de que el precio llegue." },
  ],
  "dom-and-liquidity-03-offers": [
    { type: "heading", level: 2, text: "Offers o Ask" },
    { type: "paragraph", text: "Las Offers, también llamadas Ask, son órdenes limit esperando vender. Su cantidad se distribuye normalmente por encima del mercado y en el Best Ask." },
    { type: "list", items: ["Ask/Offer son nombres para el lado vendedor del libro.", "La cantidad mostrada puede cambiar continuamente.", "Una Offer puede ejecutarse de forma parcial o total.", "También puede cancelarse antes de cualquier ejecución."] },
    { type: "callout", title: "Límite", text: "Una Offer grande no es resistencia automática ni prueba de intención institucional. Es liquidez visible sujeta a cambios." },
  ],
  "dom-and-liquidity-04-depth": [
    { type: "heading", level: 2, text: "Profundidad por nivel" },
    { type: "paragraph", text: "Depth es la cantidad disponible a través de varios precios. Near-touch depth describe los niveles cercanos al Best Bid y Best Ask; la profundidad más lejana puede tener otra relevancia y otra estabilidad." },
    { type: "list", items: ["La profundidad puede aumentar con nuevas órdenes.", "Puede disminuir por ejecuciones o cancelaciones.", "Puede cambiar de lado y de precio.", "El snapshot observado envejece con cada actualización."] },
    { type: "callout", title: "Lectura", text: "El DOM informa qué cantidad está mostrada ahora, no qué cantidad seguirá allí cuando el mercado la alcance." },
  ],
  "dom-and-liquidity-05-spread": [
    { type: "heading", level: 2, text: "Spread dentro del DOM" },
    { type: "paragraph", text: "El spread es la distancia entre Best Ask y Best Bid: Best Ask − Best Bid. El DOM permite observar esa separación junto con la cantidad disponible en ambos lados." },
    { type: "list", items: ["Spread estrecho: menor fricción explícita entre mejores precios.", "Spread amplio: mayor distancia para cruzar y potencialmente más fricción.", "La profundidad cercana condiciona la calidad de ejecución.", "El spread por sí solo no define dirección."] },
    { type: "callout", title: "No direccional", text: "Un spread puede cambiar por liquidez, volatilidad o actualización del libro. No es una señal bullish o bearish aislada." },
  ],
  "dom-and-liquidity-06-market-depth": [
    { type: "heading", level: 2, text: "Distribución del mercado visible" },
    { type: "paragraph", text: "Market Depth sintetiza múltiples niveles Bid y Ask: concentración, separación, gaps y zonas con mayor o menor cantidad mostrada. Es una fotografía viva del libro, no un registro histórico de ejecuciones." },
    { type: "list", items: ["Concentración: más cantidad en una zona.", "Gap: poca cantidad relativa entre niveles.", "Thin o thick: profundidad relativa del snapshot.", "La distribución puede reordenarse antes de que haya trades."] },
    { type: "callout", title: "Separación de capas", text: "Usa el DOM para describir resting liquidity y el Footprint para describir ejecución. No sustituyas una capa por la otra." },
  ],
  "dom-and-liquidity-07-resting-orders": [
    { type: "heading", level: 2, text: "Órdenes esperando" },
    { type: "paragraph", text: "Una resting order es una orden limit que permanece disponible en el libro esperando una posible ejecución. Resting no significa que la orden vaya a ejecutarse." },
    { type: "list", items: ["Puede llenarse completa o parcialmente.", "Puede modificarse o reducirse.", "Puede cancelarse antes de ser tocada.", "La cantidad visible no revela toda la liquidez posible."] },
    { type: "callout", title: "Principio", text: "Describe la orden como liquidez mostrada en un instante. Evita convertir una espera observable en una predicción." },
  ],
  "dom-and-liquidity-08-walls": [
    { type: "heading", level: 2, text: "Walls" },
    { type: "paragraph", text: "Una Wall es una concentración grande de liquidez resting visible en relación con los niveles cercanos. Es una descripción de tamaño y ubicación, no una conclusión sobre intención." },
    { type: "list", items: ["Compara el tamaño con el book circundante.", "Observa si persiste, se consume o se retira.", "Una wall puede ser parcial o cambiar de precio.", "La ejecución efectiva importa más que el tamaño inicial."] },
    { type: "callout", title: "No confundir", text: "Wall no equivale automáticamente a soporte, resistencia, institución o intención. Su comportamiento a través del tiempo es la evidencia adicional." },
  ],
  "dom-and-liquidity-09-liquidity-clusters": [
    { type: "heading", level: 2, text: "Clusters de liquidez" },
    { type: "paragraph", text: "Un Liquidity Cluster es una concentración distribuida en varios niveles cercanos. A diferencia de una wall aislada, el cluster describe una zona de cantidad relativa." },
    { type: "list", items: ["Revisa amplitud y continuidad de la zona.", "Compara los niveles internos, no solo el máximo.", "Un cluster puede ofrecer más superficie de interacción.", "La distribución también puede desaparecer o migrar."] },
    { type: "callout", title: "Lectura", text: "Un cluster organiza posibles zonas de fricción en el libro visible; no garantiza que el precio se detenga allí." },
  ],
  "dom-and-liquidity-10-liquidity-gaps": [
    { type: "heading", level: 2, text: "Gaps de liquidez" },
    { type: "paragraph", text: "Un Liquidity Gap es un tramo con poca liquidez mostrada relativa entre niveles. Al haber menos cantidad resting visible, un flujo agresivo puede atravesar la zona con menor interacción mostrada." },
    { type: "list", items: ["El gap depende de la escala y del snapshot.", "La liquidez puede aparecer dentro del tramo.", "Un gap no obliga al precio a recorrerlo.", "La ejecución real y la actualización del libro deben observarse."] },
    { type: "callout", title: "Sin garantía", text: "Poca liquidez visible puede facilitar repricing, pero no es una predicción direccional ni una promesa de velocidad." },
  ],
  "dom-and-liquidity-11-thin-liquidity": [
    { type: "heading", level: 2, text: "Thin Liquidity" },
    { type: "paragraph", text: "Thin Liquidity describe baja profundidad mostrada en una zona o lado del libro. Menos cantidad disponible puede aumentar el impacto de una orden agresiva, el slippage o la velocidad del repricing." },
    { type: "list", items: ["Mira la profundidad near-touch.", "Considera spread y tamaño de ejecución.", "La condición puede cambiar en pocos instantes.", "No confundas book thin con ausencia total de liquidez."] },
    { type: "callout", title: "Cuidado", text: "El DOM es dinámico: un book thin observado ahora puede engrosarse antes de la próxima interacción." },
  ],
  "dom-and-liquidity-12-thick-liquidity": [
    { type: "heading", level: 2, text: "Thick Liquidity" },
    { type: "paragraph", text: "Thick Liquidity describe mayor profundidad mostrada en una zona o lado relativo al book cercano. Puede requerir más ejecución agresiva para atravesarse y producir más interacción." },
    { type: "list", items: ["Compara cantidad, no un número aislado.", "Distingue cantidad estática de cantidad que se repone.", "Una zona thick puede ejecutarse o retirarse.", "La respuesta del precio confirma lo que ocurrió, no lo que se esperaba."] },
    { type: "callout", title: "No es defensa garantizada", text: "Más liquidez visible puede crear fricción, pero no prueba soporte, resistencia ni intención de defender un precio." },
  ],
  "dom-and-liquidity-13-stacking": [
    { type: "heading", level: 2, text: "Stacking" },
    { type: "paragraph", text: "Stacking describe liquidez que se agrega o aumenta en un lado o alrededor de una zona. Puede verse como nuevo tamaño resting o como incremento de profundidad en niveles relacionados." },
    { type: "list", items: ["Identifica el lado y los precios afectados.", "Observa si el aumento persiste.", "Separa una actualización aislada de una secuencia.", "Relaciona el cambio con ejecuciones y precio, sin atribuir intención."] },
    { type: "callout", title: "Estado del producto", text: "El concepto de stacking es observable en la evolución de un libro, pero no se presenta aquí como una señal automática propietaria del Terminal." },
  ],
  "dom-and-liquidity-14-pulling": [
    { type: "heading", level: 2, text: "Pulling" },
    { type: "paragraph", text: "Pulling es la retirada o cancelación de liquidez resting antes de que esa cantidad sea ejecutada. El nivel puede reducirse o desaparecer sin que exista consumo equivalente." },
    { type: "list", items: ["Pulling: desaparece sin trade contra esa cantidad.", "Consumption: ejecuciones agresivas atraviesan la liquidez.", "Una cancelación ordinaria no prueba manipulación.", "La secuencia temporal ayuda a separar ambos fenómenos."] },
    { type: "callout", title: "Frontera", text: "No llames spoofing a toda retirada. La intención no puede probarse solo observando una cancelación." },
  ],
  "dom-and-liquidity-15-replenishment": [
    { type: "heading", level: 2, text: "Replenishment" },
    { type: "paragraph", text: "Replenishment describe que la cantidad resting vuelve a aparecer mientras ocurren ejecuciones en el nivel o cerca de él. La interacción es parte necesaria de la observación." },
    { type: "list", items: ["Primero debe existir consumo o interacción observable.", "Luego aparece nuevamente cantidad disponible.", "La persistencia puede repetirse en varios tests.", "No identifica automáticamente una orden iceberg ni a un participante."] },
    { type: "callout", title: "No confundir", text: "Una wall grande e inmóvil no es replenishment por sí sola. Replenishment requiere ejecuciones y refresh de cantidad." },
  ],
  "dom-and-liquidity-16-reloading": [
    { type: "heading", level: 2, text: "Reloading" },
    { type: "paragraph", text: "Reloading se usa aquí como concepto relacionado con replenishment: la cantidad visible se refresca o vuelve a cargarse después de interacción. La denominación puede variar entre plataformas." },
    { type: "list", items: ["Registra qué había antes de la ejecución.", "Observa qué cantidad queda después.", "Busca reaparición, no solo tamaño inicial.", "Evita inventar una diferencia propietaria si la plataforma no la define."] },
    { type: "callout", title: "Precisión", text: "Reloading y replenishment describen patrones de actualización; no prueban por sí mismos una iceberg, intención o dirección futura." },
  ],
  "dom-and-liquidity-17-cancellation": [
    { type: "heading", level: 2, text: "Cancellation" },
    { type: "paragraph", text: "Cancellation es la eliminación de una orden resting antes de su ejecución. Es una operación normal de un libro que se actualiza continuamente." },
    { type: "list", items: ["Puede ocurrir lejos o cerca del touch.", "Puede afectar una parte o todo el tamaño.", "Puede acompañar un cambio de precio.", "Debe distinguirse de una reducción causada por trades."] },
    { type: "callout", title: "Preparación", text: "No toda cancelación es manipulación. La lectura de spoofing requiere más evidencia y pertenece principalmente al estudio de Heatmap & Bookmap." },
  ],
  "dom-and-liquidity-18-liquidity-migration": [
    { type: "heading", level: 2, text: "Liquidity Migration" },
    { type: "paragraph", text: "Liquidity Migration describe el desplazamiento de la concentración visible desde un área de precios hacia otra. Puede producirse al cancelar en un nivel, agregar en otro o repricing mientras cambia el mercado." },
    { type: "list", items: ["Compara ubicación anterior y actual.", "Indica si la liquidez se aleja o se acerca al precio.", "Observa ambos lados y la relación con la estructura.", "La migración describe el libro; no revela por sí sola el motivo."] },
    { type: "callout", title: "Observación", text: "Habla de migración solo cuando la secuencia de cancelaciones y adiciones la respalda. No conviertas movimiento de liquidez en una regla direccional." },
  ],
};
