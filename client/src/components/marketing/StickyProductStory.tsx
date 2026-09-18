import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    index: "01",
    label: "MARKET STATE",
    descriptor: "CONTEXTO",
    title: "Ubicá el estado general del mercado",
    description: "Empezá por el instrumento, el timeframe y el contexto antes de interpretar un detalle.",
  },
  {
    index: "02",
    label: "GAMMA REGIME",
    descriptor: "POSICIONAMIENTO",
    title: "Leé el régimen Gamma como contexto",
    description: "Flip, walls y exposición ayudan a describir posicionamiento; no son una señal aislada.",
  },
  {
    index: "03",
    label: "LIQUIDITY MAP",
    descriptor: "PROFUNDIDAD",
    title: "Observá dónde cambia la liquidez",
    description: "La liquidez resting, su persistencia y su respuesta agregan evidencia a la lectura del precio.",
  },
  {
    index: "04",
    label: "KEY LEVELS",
    descriptor: "ESTRUCTURA",
    title: "Mapeá las zonas que importan",
    description: "Niveles y estructura ordenan el contexto para preparar escenarios sin tratar una referencia como certeza.",
  },
  {
    index: "05",
    label: "DECISION CONTEXT",
    descriptor: "ESCENARIO",
    title: "Prepará la decisión antes de ejecutar",
    description: "Combiná contexto, niveles y respuesta del mercado antes de pasar de la lectura a la ejecución.",
  },
] as const;

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function StageRow({
  stage,
  index,
  active,
  emphasis,
  completed,
  finalStage,
  setNode,
  reducedMotion,
}: {
  stage: (typeof STAGES)[number];
  index: number;
  active: boolean;
  emphasis: "active" | "near" | "other";
  completed: boolean;
  finalStage: boolean;
  setNode: (node: HTMLElement | null) => void;
  reducedMotion: boolean;
}) {
  return (
    <li
      ref={setNode}
      data-stage-index={index}
      className={cn(
        "relative grid grid-cols-[3.75rem_minmax(0,1fr)] gap-4 border-b border-white/[0.10] py-5 transition-[opacity,transform,border-color] duration-300 ease-out last:border-b-0 sm:grid-cols-[4.75rem_minmax(0,1fr)] sm:gap-6 sm:py-6",
        reducedMotion || emphasis === "active"
          ? "opacity-100"
          : emphasis === "near"
            ? "opacity-[0.48]"
            : "opacity-[0.34]",
        active && "border-white/[0.22]",
        active && finalStage && "border-l-2 border-l-[#ff303c]/65 pl-4 sm:pl-5",
      )}
      aria-current={active ? "step" : undefined}
    >
      <div className="relative flex flex-col items-center">
        <span
          className={cn(
            "mt-1 h-2 w-2 rounded-full border transition-[background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
            active
              ? "border-[#ff303c] bg-[#ff303c] shadow-[0_0_0_4px_rgba(255,48,60,0.10)]"
              : "border-white/[0.30] bg-[#050505]",
          )}
          aria-hidden="true"
        />
        {index < STAGES.length - 1 ? (
          <span
            className={cn(
              "absolute top-4 h-[calc(100%+1.5rem)] w-px transition-colors duration-300 ease-out motion-reduce:transition-none",
              completed ? "bg-[#ff303c]/35" : "bg-white/[0.18]",
            )}
            aria-hidden="true"
          />
        ) : null}
        <span className="mt-3 font-mono text-[10px] font-semibold tracking-[0.20em] text-[#737b85]">
          {stage.index}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-mono text-xs font-semibold tracking-[0.18em] text-white sm:text-sm">{stage.label}</h3>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff6b73]">{stage.descriptor}</span>
        </div>
        <p className="mt-2 text-base font-medium leading-snug text-[#e5e7eb] sm:text-lg">{stage.title}</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#a7afb9]">{stage.description}</p>
      </div>
    </li>
  );
}

export function StickyProductStory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const stageNodes = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (reducedMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        const nextIndex = Number((visible.target as HTMLElement).dataset.stageIndex);
        if (Number.isInteger(nextIndex)) setActiveIndex(nextIndex);
      },
      { root: null, rootMargin: "-30% 0px -45% 0px", threshold: [0.2, 0.5, 0.8] },
    );

    stageNodes.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <section
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      aria-labelledby="market-decision-title"
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-start lg:gap-20">
        <div className="lg:sticky lg:top-[100px]">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-[#ff6b73]">
            GOODTRADING / READING SYSTEM
          </p>
          <h2 id="market-decision-title" className="mt-5 max-w-xl text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">
            Del mercado a una decisión
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-[#a7afb9] sm:text-lg">
            GoodTrading reúne contexto, régimen, liquidez y niveles para preparar escenarios antes de ejecutar.
          </p>
          <div className="mt-8 hidden border-t border-white/[0.10] pt-4 lg:block">
            <p className="font-mono text-[10px] uppercase tracking-[0.20em] text-[#737b85]">
              MULTIPLE SIGNALS <span className="px-2 text-[#ff303c]">→</span> CONTEXT <span className="px-2 text-[#ff303c]">→</span> SCENARIO
            </p>
          </div>
        </div>

        <ol className="relative" aria-label="Secuencia de lectura de mercado a decisión">
          {STAGES.map((stage, index) => (
            <StageRow
              key={stage.label}
              stage={stage}
              index={index}
              active={reducedMotion || activeIndex === index}
              emphasis={
                reducedMotion || activeIndex === index
                  ? "active"
                  : Math.abs(index - activeIndex) === 1
                    ? "near"
                    : "other"
              }
              completed={reducedMotion || index < activeIndex}
              finalStage={index === STAGES.length - 1}
              setNode={(node) => {
                stageNodes.current[index] = node;
              }}
              reducedMotion={reducedMotion}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
