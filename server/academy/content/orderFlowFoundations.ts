import type { AcademyContentBlock, AcademyMemberContentResponse } from "@shared/academy-content";

const memberLesson = (lessonId: string, content: AcademyContentBlock[]): AcademyMemberContentResponse => ({ lessonId, content });

export const ORDER_FLOW_FOUNDATIONS_MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  ["course-03-order-flow-foundations-module-05-lesson-01", memberLesson("course-03-order-flow-foundations-module-05-lesson-01", [
    { type: "heading", level: 2, text: "Absorción dentro del contexto" },
    { type: "paragraph", text: "La absorción no tiene el mismo significado en todas las ubicaciones. Se interpreta junto con la subasta previa, la estructura, la liquidez disponible y la respuesta posterior del precio. El mismo patrón de ejecución puede describir procesos distintos en el centro de un rango o tras una expansión." },
    { type: "list", items: ["Ubicación: dónde aparece respecto de la estructura.", "Contexto: qué intentaba hacer la subasta.", "Agresión: qué flujo se ejecutó.", "Respuesta: cuánto progreso produjo y qué ocurrió después."] },
    { type: "callout", title: "Principio", text: "Una huella de absorción es una observación; su relevancia depende de la relación entre lugar, proceso y respuesta." },
  ])],
  ["course-03-order-flow-foundations-module-05-lesson-02", memberLesson("course-03-order-flow-foundations-module-05-lesson-02", [
    { type: "heading", level: 2, text: "Absorción y Open Interest" },
    { type: "paragraph", text: "Absorción describe ejecución y progreso restringido. Open Interest agrega información sobre contratos de derivados que permanecen abiertos. Juntos pueden ayudar a contextualizar un intento de precio, pero no identifican con certeza el lado comprador, vendedor o la cobertura de cada participante." },
    { type: "list", items: ["Agresión ejecutada: qué lado cruzó liquidez.", "Respuesta del precio: cuánto avanzó o retrocedió.", "OI: cómo cambia la cantidad de contratos abiertos.", "Interpretación: hipótesis condicionada, no etiqueta determinista."] },
    { type: "callout", title: "Límite", text: "OI no convierte una absorción en bullish o bearish automáticamente. La combinación sigue necesitando ubicación, tiempo y calidad de datos." },
  ])],
  ["course-03-order-flow-foundations-module-05-lesson-03", memberLesson("course-03-order-flow-foundations-module-05-lesson-03", [
    { type: "heading", level: 2, text: "La absorción puede fallar" },
    { type: "paragraph", text: "Una zona que absorbió agresión antes puede dejar de hacerlo. Los tests repetidos, el flujo que continúa, la disminución o cambio de liquidez y la aceptación más allá del área muestran que la condición anterior no es permanente." },
    { type: "list", items: ["La agresión vuelve a probar el área.", "La liquidez disponible se consume, se mueve o no se repone.", "El precio consigue progresar más allá del nivel observado.", "El mercado negocia y acepta el nuevo territorio."] },
    { type: "callout", title: "Regla de lectura", text: "Una absorción observada anteriormente es evidencia histórica, no una defensa garantizada para el siguiente test." },
  ])],
  ["course-03-order-flow-foundations-module-05-lesson-04", memberLesson("course-03-order-flow-foundations-module-05-lesson-04", [
    { type: "heading", level: 2, text: "Delta dentro de su contexto" },
    { type: "paragraph", text: "Delta adquiere significado al relacionarse con ubicación, estructura, progreso del precio, liquidez y Open Interest cuando está disponible. Un Delta positivo sin avance no describe lo mismo que un Delta positivo acompañado por aceptación sostenida más arriba." },
    { type: "list", items: ["Pregunta dónde ocurrió el desequilibrio.", "Compara tamaño de la agresión con progreso real.", "Observa si el área fue aceptada o rechazada.", "Separa dato observado de inferencia sobre posicionamiento."] },
    { type: "callout", title: "Contexto", text: "No preguntes solo si Delta es positivo o negativo. Pregunta qué hizo el mercado con esa ejecución en esa ubicación." },
  ])],
  ["course-03-order-flow-foundations-module-05-lesson-05", memberLesson("course-03-order-flow-foundations-module-05-lesson-05", [
    { type: "heading", level: 2, text: "Condiciones potencialmente atrapadas" },
    { type: "paragraph", text: "Puede existir una condición vulnerable cuando la participación agresiva entra en una dirección, el precio no sostiene el progreso y luego vuelve contra esa participación. Decimos potencialmente porque no observamos cada posición, stop o intención privada." },
    { type: "list", items: ["Aparece agresión direccional.", "El avance falla o es rechazado.", "El precio retorna contra el área de entrada probable.", "La vulnerabilidad se infiere desde el comportamiento, no se confirma para cada trader."] },
    { type: "callout", title: "Precisión", text: "Trapped Traders es un modelo de exposición potencial. No es una lectura literal de las cuentas ni de las intenciones del mercado." },
  ])],
  ["course-03-order-flow-foundations-module-05-lesson-06", memberLesson("course-03-order-flow-foundations-module-05-lesson-06", [
    { type: "heading", level: 2, text: "Continuación frente a reversión" },
    { type: "paragraph", text: "La interpretación compara el contexto antes de decidir si el proceso continúa o cambia. No se trata de clasificar una señal aislada, sino de estudiar cómo responde el mercado al flujo ejecutado en esa ubicación." },
    { type: "list", items: ["Contexto y ubicación.", "Agresión y progreso del precio.", "Absorción o agotamiento.", "Acceptance o rejection.", "OI y liquidez cuando están disponibles."] },
    { type: "callout", title: "Pregunta correcta", text: "En lugar de preguntar si una absorción es bullish, pregunta qué está haciendo el mercado con el flujo ejecutado en ese lugar." },
  ])],
  ["course-03-order-flow-foundations-module-05-lesson-07", memberLesson("course-03-order-flow-foundations-module-05-lesson-07", [
    { type: "heading", level: 2, text: "Cuándo ignorar una señal de Order Flow" },
    { type: "paragraph", text: "Ignorar una señal aparente también es una decisión analítica cuando la evidencia es débil, contradictoria o está fuera de contexto. Más indicadores no convierten datos insuficientes en evidencia mejor." },
    { type: "list", items: ["Ubicación pobre o contexto superior contradictorio.", "Print aislado, ruido extremo o evidencia antigua.", "Liquidez o datos insuficientes.", "Sin respuesta observable del precio.", "Venue o instrumento no comparable.", "Señal ya invalidada por la evolución posterior."] },
    { type: "callout", title: "Disciplina", text: "Cuando la evidencia no alcanza, WAIT puede ser la conclusión correcta. No fuerces una interpretación para mantener actividad." },
  ])],
  ["course-03-order-flow-foundations-module-06-lesson-01", memberLesson("course-03-order-flow-foundations-module-06-lesson-01", [
    { type: "heading", level: 2, text: "Preparar un Order Flow Replay" },
    { type: "paragraph", text: "Un replay reconstruye una secuencia observada para comparar contexto, ejecución y respuesta. No debe convertirse en una explicación retrospectiva inventada ni en una regla de entrada automática." },
    { type: "list", items: ["Contexto: qué estructura y subasta existían.", "Ubicación: dónde ocurre la interacción.", "Agresor: qué liquidez se cruza.", "Respuesta pasiva: qué oposición aparece.", "Progreso: cuánto avanza el precio.", "OI y liquidez si están disponibles.", "Acceptance o rejection.", "Conclusión analítica: Trade o Wait, sin forzar una operación."] },
    { type: "callout", title: "Alcance", text: "Esta lesson prepara la observación del replay. No incluye precio de entrada, regla de stop, target ni setup propietario del Playbook." },
  ])],
]);
