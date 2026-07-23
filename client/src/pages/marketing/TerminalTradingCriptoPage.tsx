import { SeoH2, SeoH3, SeoLandingShell } from "@/components/marketing/SeoLandingShell";

export default function TerminalTradingCriptoPage() {
  return (
    <SeoLandingShell
      eyebrow="GoodTrading Terminal"
      title="Terminal de trading cripto para analizar Bitcoin"
      lead="Una terminal pensada para leer Bitcoin con contexto: estructura, gamma, opciones, Order Flow y herramientas de revisión en el mismo entorno de trabajo."
      breadcrumbLabel="Terminal de trading cripto"
      imageSrc="/screenshots/hero-terminal.png"
      imageAlt="GoodTrading Terminal mostrando contexto de Bitcoin"
      related={[
        { href: "/order-flow-bitcoin", label: "Order Flow de Bitcoin" },
        { href: "/gamma-exposure-bitcoin", label: "Gamma Exposure de Bitcoin" },
        { href: "/heatmap-liquidez-bitcoin", label: "Heatmap de liquidez en Bitcoin" },
      ]}
    >
      <p>
        Operar o analizar Bitcoin hoy suele fragmentarse entre gráficos, paneles de opciones,
        lecturas de flujo y hojas de registro. Cada herramienta aporta un fragmento, pero el
        criterio se pierde cuando el contexto no se mira junto. GoodTrading Terminal nace para
        reducir esa fricción: concentrar lectura institucional y ejecución en una terminal de
        trading cripto coherente.
      </p>

      <SeoH2>Qué problema resuelve</SeoH2>
      <p>
        El problema no es la falta de datos. El problema es la desconexión entre capas. Un nivel
        de gamma sin precio, un imbalance de Order Flow sin estructura, o un paper trade sin
        journal terminan en decisiones apresuradas. La terminal busca unir esas capas para que el
        analista vea régimen, zonas relevantes y timing en una misma sesión de trabajo.
      </p>
      <p>
        No promete predicciones ni resultados. Ofrece un marco de lectura: observar, contrastar y
        documentar. Eso es especialmente útil en Bitcoin, donde la microestructura y las opciones
        pueden cambiar el mapa operativo en pocas horas.
      </p>

      <SeoH2>Qué herramientas integra</SeoH2>
      <p>
        En la Terminal Web encontrás módulos orientados a contexto y ejecución: gamma y niveles
        sobre el gráfico, Options Panel BTC, estructura de mercado, Order Flow, paper trading y
        reportes. La App Desktop agrega capas más intensivas de visualización y procesamiento
        local, incluyendo herramientas avanzadas de liquidez cuando el setup lo requiere.
      </p>
      <p>
        La idea no es acumular widgets. Es mantener una narrativa operativa: qué régimen hay, dónde
        están las zonas sensibles, cómo responde el flujo y cómo se revisa después la ejecución.
      </p>

      <SeoH2>Indicador aislado versus sistema de lectura</SeoH2>
      <SeoH3>El límite del indicador suelto</SeoH3>
      <p>
        Un indicador aislado puede ser correcto y aun así insuficiente. Puede marcar una zona
        interesante sin explicar si el mercado está absorbiendo, impulsando o simplemente rotando
        alrededor de un imán de opciones. Sin contexto, cualquier lectura se vuelve frágil.
      </p>
      <SeoH3>El valor de un sistema</SeoH3>
      <p>
        Un sistema de lectura combina evidencia. Gamma y walls aportan mapa. Order Flow aporta
        comportamiento. La estructura ordena temporalidades. Paper trading y reportes cierran el
        ciclo con revisión. GoodTrading Terminal está diseñado alrededor de esa secuencia, no
        alrededor de una sola alerta.
      </p>

      <SeoH2>Gamma y niveles operativos</SeoH2>
      <p>
        La Gamma Exposure ayuda a enmarcar dónde dealers pueden amortiguar o amplificar movimientos.
        Flip, call wall, put wall y zonas de transición no son entradas automáticas: son referencias
        para anticipar compresión, expansión o rotación. En la terminal esos niveles se trabajan
        junto al gráfico para no perder el vínculo con el precio.
      </p>
      <p>
        Los niveles operativos sirven para planificar escenarios. La pregunta útil no es “¿sube o
        baja?”, sino “si el precio llega aquí, qué evidencia necesito ver en flujo y estructura
        antes de actuar o descartar la idea”.
      </p>

      <SeoH2>Opciones dentro del mismo contexto</SeoH2>
      <p>
        El Options Panel BTC concentra información de paredes, ATM y zonas de volumen relevantes.
        Ver opciones al lado del gráfico reduce el salto mental entre “derivados” y “spot”. Eso
        importa porque buena parte del mapa intradía de Bitcoin se entiende mejor cuando se
        contrastan niveles de opciones con la acción de precio.
      </p>

      <SeoH2>Paper trading y reportes</SeoH2>
      <p>
        La práctica sin registro suele repetir errores. Paper trading permite ensayar lecturas sin
        confundir el ejercicio con una promesa de rentabilidad. Los reportes y el journal ayudan a
        revisar timing, disciplina y calidad de la idea. En GoodTrading esas piezas forman parte
        del flujo de trabajo de la terminal, no un complemento externo improvisado.
      </p>

      <SeoH2>Terminal Web y App Desktop</SeoH2>
      <p>
        La Terminal Web está pensada para acceso inmediato desde el navegador: contexto, gamma,
        opciones, Order Flow y revisión en un entorno profesional. GoodTrading Desktop suma
        capacidad para setups más exigentes de visualización y liquidez. Mobile sigue en evolución
        para seguimiento; no se presenta aquí como producto terminado.
      </p>
      <p>
        Si buscás una terminal de trading cripto para analizar Bitcoin con lectura institucional,
        el camino corto es crear una cuenta, explorar productos y entrar a la Terminal Web con un
        criterio claro: contexto primero, ejecución después, revisión siempre.
      </p>
    </SeoLandingShell>
  );
}
