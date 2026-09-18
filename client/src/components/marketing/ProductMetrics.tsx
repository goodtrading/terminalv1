import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ProductMetric = {
  value: number;
  label: string;
  description: string;
};

const METRICS: ProductMetric[] = [
  {
    value: 4,
    label: "Temporalidades web",
    description: "15s · 1m · 5m · 15m",
  },
  {
    value: 6,
    label: "Módulos de Terminal",
    description: "Terminal · Options · Flows · Volatility · Reports · Alerts",
  },
  {
    value: 2,
    label: "Superficies disponibles",
    description: "Terminal Web + App Desktop",
  },
];

const COUNTER_DURATION_MS = 900;
const COUNTER_STAGGER_MS = 80;

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function AnimatedMetric({ metric, index, animate }: { metric: ProductMetric; index: number; animate: boolean }) {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(() => (reducedMotion ? metric.value : 0));
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) return;

    if (reducedMotion) {
      setDisplayValue(metric.value);
      return;
    }

    const delay = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / COUNTER_DURATION_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(Math.round(metric.value * eased));

        if (progress < 1) {
          animationFrame.current = window.requestAnimationFrame(tick);
        } else {
          animationFrame.current = null;
        }
      };

      animationFrame.current = window.requestAnimationFrame(tick);
    }, index * COUNTER_STAGGER_MS);

    return () => {
      window.clearTimeout(delay);
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
    };
  }, [animate, index, metric.value, reducedMotion]);

  useEffect(() => {
    return () => {
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
      }
    };
  }, []);

  return (
    <article className="min-w-0 px-5 py-2 first:pl-0 last:pr-0 sm:px-7 lg:px-9">
      <p className="sr-only">
        {metric.value} {metric.label}. {metric.description}
      </p>
      <div aria-hidden="true">
        <p className="font-mono text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {displayValue}
        </p>
        <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a7afb9]">
          {metric.label}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-[#737b85]">{metric.description}</p>
      </div>
    </article>
  );
}

export function ProductMetrics() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setAnimate(true);
        observer.disconnect();
      },
      { root: null, rootMargin: "-12% 0px -12% 0px", threshold: 0.25 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
      aria-labelledby="product-metrics-title"
    >
      <div className="border-y border-white/[0.10] py-7 sm:py-8">
        <h2 id="product-metrics-title" className="sr-only">
          Datos técnicos del producto GoodTrading
        </h2>
        <div className={cn("grid gap-0 sm:grid-cols-3", "divide-y divide-white/[0.10] sm:divide-x sm:divide-y-0")}>
          {METRICS.map((metric, index) => (
            <AnimatedMetric key={metric.label} metric={metric} index={index} animate={animate} />
          ))}
        </div>
      </div>
    </section>
  );
}
