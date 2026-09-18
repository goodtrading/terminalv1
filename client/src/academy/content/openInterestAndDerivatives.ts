import type { AcademyContentBlock } from "@shared/academy-content";

export const OPEN_INTEREST_AND_DERIVATIVES_CONTENT: Record<string, AcademyContentBlock[]> = {
  "open-interest-and-derivatives-01-what-is-a-perpetual": [
    { type: "heading", level: 2, text: "Un contrato perpetuo" },
    { type: "paragraph", text: "Un perpetual es un contrato de derivados sin vencimiento fijo que permite tomar exposición al movimiento de un activo mediante margen. El precio del contrato puede separarse del spot y utiliza mecanismos de financiación y referencia para mantener una relación razonable con el mercado subyacente." },
    { type: "list", items: ["No es el activo spot: representa un contrato sobre su precio.", "No tiene una fecha de expiración ordinaria.", "La exposición depende del tamaño, margen, precio y reglas de la venue.", "La contraparte existe aunque no podamos identificar su intención."] },
    { type: "callout", title: "Contexto GoodTrading", text: "El Terminal tiene contexto de ejecución perpetual BingX/Paper, pero eso no convierte cada dato interno en una medición global de derivados." },
  ],
  "open-interest-and-derivatives-02-funding": [
    { type: "heading", level: 2, text: "Funding como mecanismo de anclaje" },
    { type: "paragraph", text: "El funding es un mecanismo periódico de los contratos perpetuos que ayuda a mantener su precio relacionado con un índice o referencia. La convención exacta —incluidos cálculo, intervalo y quién paga o recibe— depende de la venue y del contrato." },
    { type: "list", items: ["Funding positivo no significa automáticamente que el mercado vaya a caer.", "Funding negativo no significa automáticamente que el mercado vaya a subir.", "Un valor extremo puede describir crowding o coste de mantener exposición.", "Debe leerse junto con precio, OI, liquidez y horizonte temporal."] },
    { type: "callout", title: "Disponibilidad", text: "El repositorio no confirma un feed estable de funding para el producto Academy. Se enseña la mecánica, no una lectura live que el Terminal no expone de forma confirmada." },
  ],
  "open-interest-and-derivatives-03-long": [
    { type: "heading", level: 2, text: "Qué significa estar long" },
    { type: "paragraph", text: "Una posición long en un contrato de derivados gana exposición económica cuando el precio de referencia sube, antes de considerar costes, margen y reglas del contrato. La palabra describe el lado de una posición, no la identidad, intención o convicción de quien la mantiene." },
    { type: "list", items: ["Cada posición long tiene una contraparte short.", "Long no equivale a comprador agresivo en cada trade.", "Una cobertura puede tener una función distinta a una apuesta direccional.", "El estado agregado de OI no separa por sí solo los motivos de las posiciones."] },
    { type: "callout", title: "No inferir desde OI", text: "Ver OI creciendo no permite afirmar que se estén abriendo longs. Para hablar de posicionamiento hace falta contexto adicional y lenguaje probabilístico." },
  ],
  "open-interest-and-derivatives-04-short": [
    { type: "heading", level: 2, text: "Qué significa estar short" },
    { type: "paragraph", text: "Una posición short en un contrato de derivados gana exposición económica cuando el precio de referencia baja, antes de costes y reglas específicas. Short describe una exposición relativa al precio; no demuestra que una venta observada haya abierto una posición nueva." },
    { type: "list", items: ["Cada posición short tiene una contraparte long.", "Una venta puede abrir, cerrar o reducir exposición.", "La cobertura puede producir una posición short con una finalidad no direccional.", "OI agregado no identifica automáticamente quién inició la operación."] },
    { type: "callout", title: "Precisión", text: "Price Down + OI Up puede ser consistente con nueva exposición durante la caída, pero no prueba que todos los participantes estén abriendo shorts." },
  ],
  "open-interest-and-derivatives-05-leverage": [
    { type: "heading", level: 2, text: "Exposición relativa al margen" },
    { type: "paragraph", text: "Leverage expresa cuánto valor nocional se controla en relación con el collateral o margen utilizado. Aumentar leverage no crea una ventaja: reduce el margen de error y vuelve más sensible la posición a movimientos adversos, fees y reglas de liquidación." },
    { type: "list", items: ["Amplifica el PnL porcentual sobre el collateral.", "Reduce el buffer antes de una liquidación.", "Hace más importante el tamaño y la distancia al precio de liquidación.", "No reemplaza una tesis, una invalidación ni una gestión de riesgo."] },
    { type: "callout", title: "Alcance", text: "El Terminal representa leverage en ticket, Paper y risk mirror, pero esta course no recomienda un múltiplo específico ni publica una regla de gestión." },
  ],
  "open-interest-and-derivatives-06-liquidation": [
    { type: "heading", level: 2, text: "Liquidación por restricciones de margen" },
    { type: "paragraph", text: "Una liquidación es una reducción o cierre forzado de una posición cuando las condiciones de margen y riesgo del contrato ya no permiten mantenerla. Puede generar ejecución agresiva y acelerar un movimiento, pero no toda operación grande es una liquidación." },
    { type: "list", items: ["Depende de margen, collateral, maintenance margin y reglas de la venue.", "Puede cerrar una posición sin revelar la intención original.", "Un cluster de liquidaciones es una hipótesis de flujo, no una línea garantizada.", "Debe distinguirse de cierres voluntarios y de nuevas entradas."] },
    { type: "callout", title: "Disponibilidad", text: "GoodTrading expone precios de liquidación/riesgo cuando existen en una posición read-only, pero no confirma un feed completo de liquidaciones de mercado para este curso." },
  ],
  "open-interest-and-derivatives-07-what-is-open-interest": [
    { type: "heading", level: 2, text: "Contratos que siguen abiertos" },
    { type: "paragraph", text: "Open Interest es la cantidad de contratos o exposición abierta que permanece vigente en un instrumento de derivados. Es un estado agregado de contratos outstanding, no el número de operaciones ejecutadas durante un periodo." },
    { type: "list", items: ["OI aumenta cuando se crea exposición abierta neta.", "OI disminuye cuando se cierra exposición abierta neta.", "Una transferencia entre participantes puede no cambiar el total.", "La unidad y el método dependen del instrumento y la venue."] },
    { type: "callout", title: "OI no identifica lados", text: "Cada contrato tiene una contraparte. OI no revela por sí solo quién inició, quién está long, quién está short, quién está cubierto ni quién ganará." },
  ],
  "open-interest-and-derivatives-08-price-up-oi-up": [
    { type: "heading", level: 2, text: "Precio arriba y OI arriba" },
    { type: "paragraph", text: "Cuando precio y OI suben, una lectura posible es que se esté agregando exposición abierta mientras el precio avanza. Eso puede ser consistente con nueva participación apalancada, pero el cuadrante no identifica automáticamente nuevos longs ni su intención." },
    { type: "list", items: ["Pregunta si el avance tiene aceptación o es solo un impulso breve.", "Compara OI con volumen, agresión y liquidez.", "Observa venue, contrato y ventana temporal.", "Mantén la conclusión como posible o consistente con, no como certeza."] },
    { type: "callout", title: "No es señal", text: "Price Up + OI Up no equivale a bullish automático. Describe una relación observada que necesita contexto de ejecución y respuesta." },
  ],
  "open-interest-and-derivatives-09-price-up-oi-down": [
    { type: "heading", level: 2, text: "Precio arriba y OI abajo" },
    { type: "paragraph", text: "Precio subiendo mientras OI cae puede ser consistente con cierre de exposición durante el avance. Short covering es una posibilidad, pero OI solo no prueba qué lado estaba cerrando ni si el movimiento fue impulsado por esa causa." },
    { type: "list", items: ["Distingue cierre de nuevas entradas.", "Revisa si la agresión compradora coincide con progreso.", "Observa si el movimiento pierde continuidad al terminar el cierre.", "Considera que distintas venues pueden mostrar lecturas divergentes."] },
    { type: "callout", title: "Interpretación", text: "OI descendente describe contracción de exposición abierta. No es una etiqueta automática de short squeeze ni de reversión." },
  ],
  "open-interest-and-derivatives-10-price-down-oi-up": [
    { type: "heading", level: 2, text: "Precio abajo y OI arriba" },
    { type: "paragraph", text: "Cuando precio y OI bajan o suben en direcciones opuestas, Price Down + OI Up puede ser consistente con nueva exposición durante presión vendedora. No permite afirmar que todos los contratos nuevos sean shorts ni que la caída continuará." },
    { type: "list", items: ["Compara agresión vendedora con progreso real.", "Observa liquidez pasiva y absorción.", "Distingue una expansión ordenada de una entrada tardía y frágil.", "Revisa el instrumento antes de extrapolar a todo BTC."] },
    { type: "callout", title: "Cuidado", text: "El cuadrante aporta contexto de exposición abierta, no identificación determinista de participantes." },
  ],
  "open-interest-and-derivatives-11-price-down-oi-down": [
    { type: "heading", level: 2, text: "Precio abajo y OI abajo" },
    { type: "paragraph", text: "Precio y OI descendiendo pueden ser consistentes con cierre o reducción de exposición durante la caída. Long liquidation es una posibilidad, pero también pueden coexistir cierres voluntarios, coberturas y cambios de participantes." },
    { type: "list", items: ["Busca si la caída tiene ejecución agresiva y progreso.", "Observa si la contracción de OI continúa o se estabiliza.", "Separa liquidación forzada de cierre voluntario.", "No conviertas OI down en bearish automático."] },
    { type: "callout", title: "Lectura correcta", text: "OI down significa menos exposición abierta agregada en esa fuente. La dirección futura requiere evidencia adicional." },
  ],
  "open-interest-and-derivatives-12-short-covering": [
    { type: "heading", level: 2, text: "Short covering como hipótesis" },
    { type: "paragraph", text: "Short covering describe el cierre de posiciones short que puede contribuir a compras y a un avance de precio. La combinación precio arriba + OI abajo puede ser compatible con esa hipótesis, pero no demuestra por sí sola que los shorts fueron quienes cerraron." },
    { type: "list", items: ["OI debe contraerse en una fuente definida.", "La compra debe tener evidencia de ejecución.", "El precio debe mostrar respuesta, no solo una cotización aislada.", "La hipótesis puede coexistir con nuevas posiciones long."] },
    { type: "callout", title: "Lenguaje", text: "Usa puede ser short covering o es consistente con cierre de shorts. No uses short covering como hecho probado desde un solo cuadrante." },
  ],
  "open-interest-and-derivatives-13-long-liquidation": [
    { type: "heading", level: 2, text: "Long liquidation como hipótesis" },
    { type: "paragraph", text: "Long liquidation describe el cierre forzado o acelerado de posiciones long que puede contribuir a ventas y presión descendente. Price Down + OI Down puede ser compatible con esa dinámica, pero no revela automáticamente el motivo de cada reducción." },
    { type: "list", items: ["Busca caída de OI en una fuente concreta.", "Relaciona el movimiento con ejecución y velocidad.", "Distingue liquidación de cierre voluntario.", "Revisa si la presión produce aceptación o solo una excursión."] },
    { type: "callout", title: "Sin certeza", text: "Una reducción de OI no identifica liquidaciones. Si el feed de liquidaciones no está disponible, la lectura permanece como hipótesis contextual." },
  ],
  "open-interest-and-derivatives-14-new-positioning": [
    { type: "heading", level: 2, text: "Nueva exposición sin leer intenciones" },
    { type: "paragraph", text: "New positioning significa que la exposición abierta agregada aumenta. Es una descripción de cambio de estado, no un inventario de quién entró, qué lado domina o si la nueva exposición está cubierta en otro instrumento." },
    { type: "list", items: ["OI up indica expansión de contratos abiertos.", "Volume indica actividad negociada, no necesariamente exposición final.", "El mismo aumento puede acompañar precio arriba o abajo.", "Spot, perpetuals, futures y options pueden divergir."] },
    { type: "callout", title: "Pregunta útil", text: "En vez de preguntar quién está atrapado, pregunta qué fuente cambió, cuánto cambió, cuándo cambió y qué evidencia de precio y ejecución coincide." },
  ],
  "open-interest-and-derivatives-15-liquidation-flow": [
    { type: "heading", level: 2, text: "Flujo asociado a desapalancamiento" },
    { type: "paragraph", text: "Liquidation Flow es un marco para estudiar si una secuencia de ejecución agresiva y cambio de exposición podría estar relacionada con restricciones de margen. Requiere más que una vela grande o una caída de OI." },
    { type: "list", items: ["Precio y velocidad del movimiento.", "Agresión observable y progreso.", "Cambio de OI en una fuente identificada.", "Liquidez disponible y respuesta del libro.", "Datos directos de liquidación, si la venue los entrega."] },
    { type: "callout", title: "Disponibilidad", text: "El producto actual no confirma un feed global de liquidaciones ni una lectura estable de futures OI. El análisis se mantiene conceptual y dependiente de fuente." },
  ],
};
