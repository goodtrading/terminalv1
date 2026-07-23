import { SeoH2, SeoH3, SeoLandingShell } from "@/components/marketing/SeoLandingShell";

export default function HeatmapLiquidezBitcoinPage() {
  return (
    <SeoLandingShell
      eyebrow="Liquidez"
      title="Cómo leer un heatmap de liquidez en Bitcoin"
      lead="Paredes, persistencia, consumo, pulling y spoofing explicados como lectura de liquidez pasiva, no como garantía de reversión."
      breadcrumbLabel="Heatmap de liquidez"
      related={[
        { href: "/order-flow-bitcoin", label: "Order Flow de Bitcoin" },
        { href: "/gamma-exposure-bitcoin", label: "Gamma Exposure de Bitcoin" },
        { href: "/terminal-trading-cripto", label: "Terminal de trading cripto" },
      ]}
    >
      <p>
        Un heatmap de liquidez muestra dónde se concentra interés pasivo en el libro a lo largo del
        tiempo. En Bitcoin ayuda a ver paredes, su duración y cómo se consumen. GoodTrading
        Terminal incorpora esta lectura dentro del ecosistema de la terminal, con visualización más
        intensiva en setups Desktop cuando el flujo de datos lo requiere.
      </p>

      <SeoH2>Qué representa un heatmap</SeoH2>
      <p>
        El heatmap traduce profundidad y persistencia en una vista visual: intensidades que marcan
        zonas con más liquidez resting. No dice por sí solo quién gana la sesión. Dice dónde el
        mercado ha mostrado interés en absorber o proveer tamaño, y cómo ese interés evoluciona.
      </p>

      <SeoH2>Liquidez resting</SeoH2>
      <p>
        La liquidez resting es la que espera en el libro para ser tomada. Es distinta de la
        agresión que cruza el spread. Entender esa diferencia evita confundir “hay mucha liquidez
        visible” con “el precio no puede pasar”. La liquidez puede retirarse, reubicarse o
        ejecutarse parcialemente en segundos.
      </p>

      <SeoH2>Paredes persistentes y temporales</SeoH2>
      <SeoH3>Paredes persistentes</SeoH3>
      <p>
        Una pared persistente se mantiene a través del tiempo y suele atraer atención operativa.
        Puede frenar avances, servir de referencia o ser consumida de forma ordenada. Su valor está
        en la persistencia relativa, no en el tamaño absoluto aislado.
      </p>
      <SeoH3>Paredes temporales</SeoH3>
      <p>
        Las paredes temporales aparecen y desaparecen. A veces son ruido; a veces son pruebas de
        profundidad. Tratarlas como soporte/resistencia fijo es un error clásico. El heatmap sirve
        precisamente para ver esa caducidad.
      </p>

      <SeoH2>Consumo de liquidez</SeoH2>
      <p>
        Consumir una pared implica que la agresión toma ese tamaño. Un consumo limpio con
        continuación sugiere aceptación. Un consumo parcial seguido de rechazo sugiere que la
        liquidez cumplió su rol de absorción. El heatmap ayuda a ver el proceso; el Order Flow
        ayuda a calificar la agresión que lo produce.
      </p>

      <SeoH2>Pulling</SeoH2>
      <p>
        Pulling es el retiro de liquidez antes de ser ejecutada. En el heatmap se percibe como
        intensidades que se apagan al acercarse el precio. Puede anticipar un vacío local, pero
        también puede ser gestión normal de riesgo. Se interpreta con cautela y siempre con
        confirmación de precio.
      </p>

      <SeoH2>Spoofing</SeoH2>
      <p>
        Spoofing describe liquidez engañosa diseñada para influir percepciones. Detectarlo con
        certeza desde una sola herramienta es limitado. Lo práctico es identificar patrones de
        aparición/desaparición inconsistentes y no operar solo porque “había una pared enorme”. En
        GoodTrading se presenta como riesgo de lectura, no como etiqueta automática confiable.
      </p>

      <SeoH2>Absorción pasiva</SeoH2>
      <p>
        La absorción pasiva ocurre cuando liquidez resting recibe agresión y el precio no avanza.
        Es el espejo conceptual de la absorción vista desde Order Flow. Ver ambas capas reduce
        falsas conclusiones: a veces el heatmap muestra la pared; el flujo muestra si realmente se
        está defendiendo.
      </p>

      <SeoH2>Live edge</SeoH2>
      <p>
        El live edge es la frontera actual entre lo negociado y la liquidez aún disponible. Leer
        solo historia de heatmap sin mirar el borde vivo es incompleto. La combinación de memoria
        visual y estado presente del libro es lo que permite decidir si una zona sigue vigente.
      </p>

      <SeoH2>Liquidez histórica versus DOM actual</SeoH2>
      <p>
        El heatmap histórico resume cómo se comportó la liquidez. El DOM actual muestra el estado
        inmediato. Ambos pueden divergir. Una zona que fue pared fuerte hace una hora puede estar
        vacía ahora. Por eso GoodTrading enfatiza contrastar capas en lugar de anclarse a una
        imagen atrasada.
      </p>

      <SeoH2>Por qué una pared no implica reversión</SeoH2>
      <p>
        Una pared puede ser consumida, rodeada o usada como trampolín de continuación. También
        puede ser irrelevante frente a un flujo mayor. La reversión es una hipótesis que necesita
        evidencia de rechazo, absorción y estructura. Sin eso, la pared es solo un dato del mapa.
      </p>

      <SeoH2>Integración en GoodTrading</SeoH2>
      <p>
        En el ecosistema GoodTrading el heatmap se interpreta junto a Order Flow, estructura y, cuando
        corresponde, el mapa de opciones/gamma. La Terminal Web concentra el trabajo diario de
        contexto; Desktop potencia visualizaciones avanzadas de liquidez. Para la lectura de
        agresión, profundizá en el{" "}
        <a className="font-medium text-[#ff8a8a] hover:text-white" href="/order-flow-bitcoin">
          Order Flow de Bitcoin
        </a>
        . Para el régimen de dealers, revisá la{" "}
        <a className="font-medium text-[#ff8a8a] hover:text-white" href="/gamma-exposure-bitcoin">
          Gamma Exposure de Bitcoin
        </a>
        .
      </p>
    </SeoLandingShell>
  );
}
