import { SeoH2, SeoH3, SeoLandingShell } from "@/components/marketing/SeoLandingShell";

export default function GammaExposureBitcoinPage() {
  return (
    <SeoLandingShell
      eyebrow="Gamma Exposure"
      title="Gamma Exposure aplicada al trading de Bitcoin"
      lead="Flip, walls y régimen de dealers como mapa de contexto. Útil para anticipar zonas sensibles, no para predecir el precio con certeza."
      breadcrumbLabel="Gamma Exposure de Bitcoin"
      imageSrc="/screenshots/feature-options.png"
      imageAlt="Options Panel BTC en GoodTrading Terminal"
      related={[
        { href: "/order-flow-bitcoin", label: "Order Flow de Bitcoin" },
        { href: "/terminal-trading-cripto", label: "Terminal de trading cripto" },
        { href: "/heatmap-liquidez-bitcoin", label: "Heatmap de liquidez en Bitcoin" },
      ]}
    >
      <p>
        La Gamma Exposure (GEX) resume cómo la gamma agregada de opciones puede influir en el
        comportamiento de cobertura de dealers. En Bitcoin, donde el mercado de opciones es
        relevante, ese mapa ayuda a pensar en compresión, expansión y zonas de interés. GoodTrading
        Terminal lo trata como capa de contexto, siempre contrastada con precio y Order Flow.
      </p>

      <SeoH2>Qué representa la gamma de dealers</SeoH2>
      <p>
        Cuando hay interés abierto significativo en opciones, los dealers que hacen mercado suelen
        gestionar riesgo de forma dinámica. La gamma describe la sensibilidad del delta de esas
        posiciones. Según el signo y la ubicación de esa gamma, la cobertura puede amortiguar o
        amplificar movimientos del subyacente.
      </p>
      <p>
        Es un modelo, no una fotografía perfecta del inventario real de cada mesa. Sirve para
        plantear escenarios de régimen, no para afirmar que “el precio debe ir” a un nivel.
      </p>

      <SeoH2>Long gamma y short gamma</SeoH2>
      <SeoH3>Long gamma</SeoH3>
      <p>
        En regímenes donde la cobertura tiende a vender rallies y comprar caídas, el precio puede
        mostrar más mean-reversion o menor continuidad de impulso. Eso no elimina tendencias; solo
        cambia la forma en que se desarrollan los movimientos.
      </p>
      <SeoH3>Short gamma</SeoH3>
      <p>
        Cuando la cobertura refuerza el movimiento, los desplazamientos pueden volverse más rápidos
        o inestables. Ahí importa aún más confirmar con flujo y liquidez: short gamma no es licencia
        para perseguir cualquier ruptura.
      </p>

      <SeoH2>Gamma flip</SeoH2>
      <p>
        El gamma flip es la zona donde el sesgo estimado cambia de signo. Cruzar esa área puede
        coincidir con un cambio de comportamiento del mercado, pero también puede ser irrelevante
        si el interés abierto, la expiración o el spot se reconfiguran. Se lee como frontera de
        régimen, no como interruptor mecánico.
      </p>

      <SeoH2>Global flip y local flip</SeoH2>
      <p>
        El global flip resume el cambio de régimen a nivel agregado. Los flips locales marcan
        transiciones en tramos más específicos del mapa. Distinguirlos evita confundir un ruido de
        strikes cercanos con un cambio estructural de toda la superficie. En GoodTrading se trabaja
        esa jerarquía para no sobrepeso a un solo número.
      </p>

      <SeoH2>Call wall y put wall</SeoH2>
      <p>
        Call wall y put wall señalan concentraciones relevantes de interés que pueden actuar como
        referencias de atención, imanes temporales o zonas de fricción. No son barreras físicas. El
        precio puede atravesarlas, rechazarlas o rotar alrededor según flujo y liquidez.
      </p>
      <p>
        La utilidad operativa está en preparar escenarios: qué evidencia confirmaría aceptación
        por encima de una wall, o rechazo con absorción cerca de ella.
      </p>

      <SeoH2>Zonas de transición y niveles imán</SeoH2>
      <p>
        Entre walls y flips aparecen zonas de transición donde el régimen es menos claro. También
        hay niveles que actúan como imanes de atención intradía. Esas áreas piden más paciencia:
        esperar Order Flow y estructura antes de asignar un sesgo fuerte.
      </p>

      <SeoH2>Limitaciones del modelo</SeoH2>
      <p>
        La gamma agregada depende de supuestos sobre posicionamiento, vol y vencimientos. Puede
        desactualizarse, ser sensible a strikes dominantes y no capturar shocks de inventario o
        flujos spot ajenos a opciones. Por eso GoodTrading enfatiza limitaciones: el mapa orienta,
        no certifica.
      </p>
      <p>
        Afirmar que la gamma predice el precio con certeza es incorrecto. La gamma mejora el
        contexto; la confirmación sigue estando en la interacción de precio, liquidez y flujo.
      </p>

      <SeoH2>Combinar gamma con precio y Order Flow</SeoH2>
      <p>
        Una wall sin evidencia de flujo es solo una hipótesis. Un flip sin estructura puede ser
        ruido. La secuencia útil suele ser: ubicar régimen y niveles, observar cómo reacciona el
        precio al llegar, y leer si hay agresión, absorción o vaciamiento de liquidez. Esa es la
        lógica de trabajo en la terminal.
      </p>

      <SeoH2>Integración en GoodTrading</SeoH2>
      <p>
        En GoodTrading Terminal la Gamma Exposure se integra al chart y al Options Panel para no
        separar el mapa de dealers del precio. Para la capa de microestructura, revisá el{" "}
        <a className="font-medium text-[#ff8a8a] hover:text-white" href="/order-flow-bitcoin">
          Order Flow de Bitcoin
        </a>
        . Para el entorno completo de trabajo, conocé la{" "}
        <a className="font-medium text-[#ff8a8a] hover:text-white" href="/terminal-trading-cripto">
          terminal de trading cripto
        </a>
        .
      </p>
    </SeoLandingShell>
  );
}
