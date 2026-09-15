import type { AcademyContentBlock } from "@shared/academy-content";

export const EXECUTION_AND_RISK_CONTENT: Record<string, AcademyContentBlock[]> = {
  "execution-and-risk-01-market-entry": [
    { type: "heading", level: 2, text: "Entrar es asumir una exposición" },
    { type: "paragraph", text: "Una entrada convierte una hipótesis en exposición de mercado. Antes de ejecutar, define qué instrumento usarás, qué tamaño tendrá la posición y qué condición invalida la idea." },
    { type: "list", items: ["Market busca ejecución inmediata contra la liquidez disponible.", "Limit restringe el precio, pero puede no ejecutarse.", "La entrada no define por sí sola el riesgo total.", "El precio de ejecución puede diferir del precio observado antes de enviar la orden."] },
    { type: "callout", title: "Primero el riesgo", text: "Una entrada solo tiene sentido cuando el tamaño y la invalidación ya están definidos." },
  ],
  "execution-and-risk-02-limit-entry": [
    { type: "heading", level: 2, text: "Controlar el precio aceptable" },
    { type: "paragraph", text: "Una orden Limit fija el precio máximo al comprar o mínimo al vender. Puede aportar liquidez si queda esperando, pero también puede ser marketable y ejecutar de inmediato si cruza la cotización." },
    { type: "list", items: ["Puede permanecer parcialmente ejecutada.", "No garantiza fill aunque el precio llegue al nivel.", "La cola y las reglas del venue afectan la prioridad.", "La liquidez visible puede desaparecer antes de la ejecución."] },
    { type: "callout", title: "Trade-off", text: "Limit ofrece control de precio a cambio de aceptar incertidumbre sobre la ejecución." },
  ],
  "execution-and-risk-03-stop-orders": [
    { type: "heading", level: 2, text: "Activar una orden al alcanzar un nivel" },
    { type: "paragraph", text: "Una Stop permanece condicionada hasta que el precio de referencia alcanza su trigger. Al activarse, el sistema envía la orden definida por la configuración del instrumento y del venue." },
    { type: "list", items: ["El trigger no equivale necesariamente al precio final de ejecución.", "Movimientos rápidos pueden producir slippage.", "La fuente del precio de activación depende de la implementación.", "Una Stop debe evaluarse junto con tamaño, liquidez y riesgo máximo."] },
    { type: "callout", title: "No es garantía", text: "El nivel de stop activa una acción; no garantiza un fill exacto en ese mismo precio." },
  ],
  "execution-and-risk-04-stop-limit": [
    { type: "heading", level: 2, text: "Trigger con límite de precio" },
    { type: "paragraph", text: "Una Stop Limit combina un precio de activación con una orden Limit posterior. Cuando se alcanza el trigger, la orden limitada intenta ejecutarse dentro del rango de precio permitido." },
    { type: "list", items: ["El trigger y el límite cumplen funciones distintas.", "Puede proteger el precio máximo o mínimo aceptable.", "Si el mercado salta el límite, puede quedar sin fill.", "La protección contra slippage puede aumentar el riesgo de no ejecución."] },
    { type: "callout", title: "Decisión", text: "Stop Market prioriza la posibilidad de ejecución; Stop Limit prioriza el control de precio. Ninguna elimina todos los riesgos." },
  ],
  "execution-and-risk-05-reduce-only": [
    { type: "heading", level: 2, text: "Cerrar sin aumentar la posición" },
    { type: "paragraph", text: "Reduce Only indica que una orden solo puede reducir una posición existente. Su objetivo es evitar que una orden de salida cree o incremente exposición en la dirección opuesta si la posición ya se cerró o cambió." },
    { type: "list", items: ["Es una restricción de intención de reducción, no una garantía de ejecución.", "El resultado depende de la posición disponible en el momento del matching.", "El tamaño puede quedar limitado por la posición abierta.", "Debe distinguirse de abrir una posición contraria."] },
    { type: "callout", title: "Control", text: "Reduce Only ayuda a evitar una inversión accidental de posición, pero no reemplaza la revisión del estado real." },
  ],
  "execution-and-risk-06-partial-close": [
    { type: "heading", level: 2, text: "Reducir solo una parte" },
    { type: "paragraph", text: "Un cierre parcial disminuye el tamaño de una posición sin eliminarla por completo. Permite cambiar la exposición restante, pero también modifica el riesgo, el precio promedio y la relación entre la posición y sus protecciones." },
    { type: "list", items: ["El tamaño cerrado debe ser menor o igual a la posición disponible.", "La posición restante sigue expuesta al mercado.", "Las órdenes de protección pueden requerir revisión.", "Comisiones y ejecución afectan el resultado efectivo."] },
    { type: "callout", title: "Estado", text: "Después de un cierre parcial, vuelve a leer la posición y sus órdenes; no asumas que el estado anterior sigue vigente." },
  ],
  "execution-and-risk-07-full-close": [
    { type: "heading", level: 2, text: "Eliminar la exposición abierta" },
    { type: "paragraph", text: "Un cierre completo busca llevar la posición abierta a cantidad cero. La acción puede ejecutarse con Market o Limit, según la prioridad entre inmediatez y control de precio." },
    { type: "list", items: ["Cerrar no significa necesariamente ejecutar a un precio exacto.", "Una Limit puede quedar parcialmente ejecutada.", "Las órdenes vinculadas deben revisarse después del cierre.", "El estado confirmado debe venir de la cuenta o del venue, no solo de la interfaz."] },
    { type: "callout", title: "Verificación", text: "La posición se considera cerrada cuando el estado confirmado muestra cantidad cero, no solo cuando se envió la orden." },
  ],
  "execution-and-risk-08-stop-loss": [
    { type: "heading", level: 2, text: "Definir dónde la idea deja de ser válida" },
    { type: "paragraph", text: "Un Stop Loss es una orden o condición diseñada para limitar una pérdida cuando el precio alcanza un nivel. El nivel debe relacionarse con la invalidación de la hipótesis y con una pérdida aceptable." },
    { type: "list", items: ["El stop no debe elegirse solo por una distancia cómoda.", "El tamaño de la posición depende de la distancia al stop.", "La ejecución puede sufrir slippage.", "La orden debe existir realmente en el estado confirmado del sistema."] },
    { type: "callout", title: "Principio", text: "El stop protege una hipótesis invalidada; no debe colocarse arbitrariamente para evitar aceptar una pérdida." },
  ],
  "execution-and-risk-09-take-profit": [
    { type: "heading", level: 2, text: "Realizar una salida favorable" },
    { type: "paragraph", text: "Take Profit describe una salida planificada para realizar parte o toda una posición cuando se alcanza una condición favorable. El nivel debe formar parte de una distribución de resultados, no de una promesa sobre el mercado." },
    { type: "list", items: ["Puede ejecutarse parcialmente.", "La liquidez disponible determina la calidad del fill.", "Una salida reduce exposición, pero no controla el movimiento posterior.", "La relación con el stop permite evaluar el riesgo antes de entrar."] },
    { type: "callout", title: "Plan", text: "Una salida definida antes de la entrada evita cambiar el criterio únicamente por la emoción del movimiento." },
  ],
  "execution-and-risk-10-break-even": [
    { type: "heading", level: 2, text: "Mover la referencia de riesgo" },
    { type: "paragraph", text: "Break Even suele referirse a mover una protección cerca del precio de entrada para reducir la pérdida potencial. No convierte una operación en segura: comisiones, slippage y ejecución pueden dejar un resultado distinto de cero." },
    { type: "list", items: ["Debe considerar el precio promedio real.", "Puede reducir el riesgo monetario y también cortar variabilidad favorable.", "No es adecuado por defecto en cualquier contexto.", "El mercado puede volver a la entrada antes de desarrollar el movimiento esperado."] },
    { type: "callout", title: "Cuidado", text: "Break Even es una decisión de gestión, no un botón que mejora automáticamente una operación." },
  ],
  "execution-and-risk-11-trailing": [
    { type: "heading", level: 2, text: "Seguir el movimiento sin ampliar el riesgo" },
    { type: "paragraph", text: "Trailing ajusta una protección a medida que el mercado avanza en la dirección favorable. El objetivo es conservar parte del movimiento sin alejar el nivel para dar más espacio a una pérdida." },
    { type: "list", items: ["La regla de actualización debe ser conocida antes de usarla.", "Un trailing demasiado estrecho puede salir por ruido.", "Un trailing demasiado amplio puede devolver gran parte del resultado.", "La volatilidad y la estructura del mercado cambian la distancia útil."] },
    { type: "callout", title: "No perseguir", text: "Un trailing debe reducir riesgo o proteger estructura; moverlo repetidamente para evitar una salida invalida su propósito." },
  ],
  "execution-and-risk-12-invalidation-vs-arbitrary-stop": [
    { type: "heading", level: 2, text: "La diferencia entre lógica y comodidad" },
    { type: "paragraph", text: "Una invalidación describe la condición que contradice la hipótesis de mercado. Un stop arbitrario se coloca sin relación clara con esa condición, normalmente por una distancia fija o por el importe que se desea perder." },
    { type: "list", items: ["Primero se define la estructura que invalida la idea.", "Después se calcula el tamaño compatible con esa distancia.", "El riesgo monetario no debe decidir por sí solo la ubicación.", "La invalidación puede ser técnica, temporal o contextual según la hipótesis."] },
    { type: "callout", title: "Orden correcto", text: "Define la invalidación, mide la distancia y recién entonces ajusta el tamaño de la posición." },
  ],
  "execution-and-risk-13-risk-per-trade": [
    { type: "heading", level: 2, text: "Cuánto puede perder una operación" },
    { type: "paragraph", text: "Risk per trade es la pérdida máxima planificada para una operación si la hipótesis queda invalidada. Es una restricción de capital, no una predicción de cuánto perderás exactamente." },
    { type: "list", items: ["Incluye tamaño, distancia al stop y valor del instrumento.", "Comisiones y slippage pueden aumentar el resultado real.", "No debe ampliarse el riesgo para recuperar pérdidas previas.", "El límite se define antes de enviar la orden."] },
    { type: "callout", title: "Disciplina", text: "El tamaño debe adaptarse al riesgo permitido; no al revés." },
  ],
  "execution-and-risk-14-position-size": [
    { type: "heading", level: 2, text: "Traducir riesgo a cantidad" },
    { type: "paragraph", text: "Position Size es la cantidad de activo o contratos que puede tomarse con una distancia de invalidación y un riesgo monetario determinados. Cambiar el stop sin recalcular tamaño cambia el riesgo." },
    { type: "list", items: ["Riesgo aproximado = distancia al stop × cantidad.", "El cálculo depende de la unidad: BTC, contratos o USDT.", "Apalancamiento no reduce el riesgo de precio por sí mismo.", "El tamaño final está limitado por margen, liquidez y reglas del venue."] },
    { type: "callout", title: "Control", text: "La cantidad correcta es la que mantiene el riesgo dentro del límite después de considerar el precio y la invalidación." },
  ],
  "execution-and-risk-15-risk-reward": [
    { type: "heading", level: 2, text: "Comparar pérdida y resultado planificados" },
    { type: "paragraph", text: "Risk / Reward compara la distancia o pérdida potencial hasta la invalidación con el resultado planificado en una salida. Es una relación ex ante: el mercado no garantiza que alcance ninguno de los dos niveles." },
    { type: "list", items: ["Un ratio alto no compensa una hipótesis débil.", "Debe calcularse con precios y costes realistas.", "La gestión parcial cambia la distribución de resultados.", "El ratio aislado no determina la calidad de una operación."] },
    { type: "callout", title: "No confundir", text: "Risk / Reward no significa probabilidad de ganar. Solo compara magnitudes planificadas." },
  ],
  "execution-and-risk-16-expected-value": [
    { type: "heading", level: 2, text: "Pensar en una serie de operaciones" },
    { type: "paragraph", text: "Expected Value estima el resultado medio de una estrategia a partir de probabilidades, ganancias y pérdidas. No predice el resultado de la próxima operación." },
    { type: "list", items: ["EV aproximado = probabilidad de ganar × ganancia media − probabilidad de perder × pérdida media.", "Debe incluir costes y resultados parciales cuando corresponda.", "Una muestra pequeña puede producir una estimación inestable.", "La ejecución real puede diferir del modelo."] },
    { type: "callout", title: "Horizonte", text: "La ventaja estadística se evalúa sobre una muestra suficiente y comparable, no sobre una sola operación." },
  ],
  "execution-and-risk-17-winrate": [
    { type: "heading", level: 2, text: "Frecuencia de resultados positivos" },
    { type: "paragraph", text: "Winrate es el porcentaje de operaciones ganadoras dentro de una muestra definida. Por sí solo no informa cuánto se gana cuando se acierta ni cuánto se pierde cuando se falla." },
    { type: "list", items: ["Debe definirse qué cuenta como ganancia o pérdida.", "La muestra debe conservar el mismo criterio de medición.", "Winrate alto puede coexistir con pérdidas grandes.", "Winrate bajo puede ser compatible con valor esperado positivo."] },
    { type: "callout", title: "Contexto", text: "Lee winrate junto con payoff, costes, drawdown y tamaño de muestra." },
  ],
  "execution-and-risk-18-drawdown": [
    { type: "heading", level: 2, text: "La caída desde un máximo" },
    { type: "paragraph", text: "Drawdown mide la disminución de capital desde un máximo previo hasta un mínimo posterior antes de recuperar ese máximo. Describe el recorrido del capital, no solo el resultado final." },
    { type: "list", items: ["Puede expresarse en dinero o porcentaje.", "Incluye profundidad, duración y recuperación.", "Una estrategia rentable puede atravesar drawdowns.", "El límite tolerable debe definirse antes de operar."] },
    { type: "callout", title: "Riesgo real", text: "La capacidad de soportar un drawdown importa tanto como el resultado medio esperado." },
  ],
  "execution-and-risk-19-why-a-40-winrate-can-be-profitable": [
    { type: "heading", level: 2, text: "El resultado depende del tamaño de aciertos y fallos" },
    { type: "paragraph", text: "Una tasa de acierto del 40% puede ser rentable si las ganancias medias superan suficientemente a las pérdidas medias después de costes. La rentabilidad depende de la distribución completa de resultados." },
    { type: "list", items: ["Ejemplo conceptual: 4 aciertos de +2R y 6 fallos de -1R producen +2R antes de costes.", "R es la unidad de riesgo definida por la pérdida planificada.", "La secuencia puede producir drawdown aunque el valor esperado sea positivo.", "El ejemplo no es una promesa ni una regla universal."] },
    { type: "callout", title: "Cierre", text: "No optimices solo el winrate: evalúa expectativa, distribución, costes y drawdown en una muestra comparable." },
  ],
};
