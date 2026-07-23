import { SeoH2, SeoH3, SeoLandingShell } from "@/components/marketing/SeoLandingShell";

export default function OrderFlowBitcoinPage() {
  return (
    <SeoLandingShell
      eyebrow="Order Flow"
      title="Cómo leer el Order Flow de Bitcoin"
      lead="Delta, absorción, agresión y liquidez pasiva explicados como lectura de contexto, no como señales automáticas de entrada."
      breadcrumbLabel="Order Flow en Bitcoin"
      related={[
        { href: "/gamma-exposure-bitcoin", label: "Gamma Exposure de Bitcoin" },
        { href: "/heatmap-liquidez-bitcoin", label: "Heatmap de liquidez en Bitcoin" },
        { href: "/terminal-trading-cripto", label: "Terminal de trading cripto" },
      ]}
    >
      <p>
        El Order Flow describe cómo se negocia el libro: quién agrede, quién absorbe y cómo cambia
        la liquidez mientras el precio se mueve. En Bitcoin, donde la velocidad y la profundidad
        varían con fuerza, leer flujo sin estructura suele producir sobreinterpretación. Esta
        guía ordena conceptos clave y cómo se trabajan dentro de GoodTrading.
      </p>

      <SeoH2>Qué es Order Flow</SeoH2>
      <p>
        Order Flow es la lectura del flujo de órdenes ejecutadas y de la liquidez disponible para
        ser consumida. No reemplaza al gráfico de precio: lo contextualiza. Mientras el precio
        muestra el resultado, el flujo muestra parte del proceso que lo produjo.
      </p>
      <p>
        En la práctica, el analista observa agresión compradora o vendedora, cambios de delta,
        zonas donde el precio avanza con facilidad y zonas donde el avance se frena pese a la
        presión. Esa lectura es relativa: depende de la sesión, la volatilidad y el mapa de
        niveles relevantes.
      </p>

      <SeoH2>Precio versus flujo de órdenes</SeoH2>
      <p>
        El precio puede subir con poca agresión si la liquidez vendedora es delgada, o estancarse
        con mucha agresión si hay absorción. Por eso una vela alcista no equivale automáticamente
        a dominio comprador sostenible. Separar “resultado” de “mecanismo” evita conclusiones
        apresuradas.
      </p>

      <SeoH2>Delta y CVD</SeoH2>
      <SeoH3>Delta</SeoH3>
      <p>
        El delta resume, en una ventana, la diferencia entre volumen agresivo de compra y de venta.
        Un delta positivo sugiere más agresión compradora en ese tramo; uno negativo, lo contrario.
        Su utilidad aparece al contrastarlo con el desplazamiento del precio: ¿el delta empuja o se
        consume sin progreso?
      </p>
      <SeoH3>CVD</SeoH3>
      <p>
        El CVD acumula esa diferencia en el tiempo. Sirve para ver divergencias o persistencia de
        presión. No es un oráculo: un CVD creciente con precio lateral puede anticipar absorción o
        una rotación posterior, pero también puede disolverse si cambia la liquidez. En GoodTrading
        se usa como evidencia, no como disparador automático.
      </p>

      <SeoH2>Absorción</SeoH2>
      <p>
        Hay absorción cuando aparece agresión significativa y el precio no avanza en esa dirección.
        Puede indicar presencia de liquidez pasiva fuerte o de un participante dispuesto a absorber
        flujo. También puede ser temporal. La lectura correcta exige confirmar con estructura,
        ubicación relativa a niveles y comportamiento posterior del libro.
      </p>
      <p>
        Presentar absorción como “señal de giro” es un error frecuente. Absorción es una hipótesis
        de interacción entre flujo y liquidez, no una orden de entrada.
      </p>

      <SeoH2>Agresión compradora y vendedora</SeoH2>
      <p>
        La agresión es el flujo que toma liquidez disponible. Rachas de agresión ayudan a entender
        impulso, pero el contexto decide su calidad. Agresión contra una pared persistente no es lo
        mismo que agresión en un vacío de liquidez. Por eso Order Flow y heatmap se complementan.
      </p>

      <SeoH2>Imbalances</SeoH2>
      <p>
        Un imbalance muestra desequilibrio local entre lados del libro o del flujo. Puede señalar
        urgencia, pero también ruido. En Bitcoin intradía abundan imbalances irrelevantes. La
        pregunta útil es si el imbalance aparece en una zona significativa y si deja huella en el
        precio y en la liquidez posterior.
      </p>

      <SeoH2>Spoofing y pulling</SeoH2>
      <p>
        Spoofing y pulling describen liquidez que aparece o se retira sin intención clara de ser
        ejecutada. Detectarlos con certeza absoluta desde una sola vista es difícil; lo operativo
        es sospechar cuando paredes grandes desaparecen al acercarse el precio o se recrean de
        forma inconsistente. No deben usarse como “confirmación mágica” de una operación.
      </p>

      <SeoH2>Contexto estructural</SeoH2>
      <p>
        Estructura de mercado —rangos, impulsos, breaks y retests— ordena el Order Flow. Un delta
        extremo en medio de un rango lateral no se interpreta igual que el mismo delta en la
        ruptura de una zona trabajada. GoodTrading prioriza esa combinación: flujo dentro de un
        mapa, no flujo suelto.
      </p>

      <SeoH2>Errores frecuentes</SeoH2>
      <p>
        Los errores más comunes son: tratar cada imbalance como entrada; ignorar la calidad de la
        liquidez; leer CVD sin mirar dónde está el precio; y buscar certeza donde solo hay
        probabilidad condicionada. Otro error es confundir velocidad con dirección sostenible.
      </p>

      <SeoH2>Cómo se integra en GoodTrading</SeoH2>
      <p>
        En GoodTrading Terminal el Order Flow se trabaja junto a estructura, gamma y herramientas
        de revisión. La meta es construir escenarios: qué evidencia de flujo confirmaría o
        invalidaría una idea alrededor de un nivel. Para profundizar el mapa de dealers, revisá la{" "}
        <a className="font-medium text-[#ff8a8a] hover:text-white" href="/gamma-exposure-bitcoin">
          Gamma Exposure de Bitcoin
        </a>
        . Para liquidez resting, explorá el{" "}
        <a className="font-medium text-[#ff8a8a] hover:text-white" href="/heatmap-liquidez-bitcoin">
          heatmap de liquidez en Bitcoin
        </a>
        .
      </p>
    </SeoLandingShell>
  );
}
