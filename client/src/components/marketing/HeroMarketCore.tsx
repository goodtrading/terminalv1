import { cn } from "@/lib/utils";

type HeroMarketCoreProps = {
  className?: string;
};

export function HeroMarketCore({ className }: HeroMarketCoreProps) {
  return (
    <div aria-hidden="true" className={cn("hero-market-core-position pointer-events-none", className)}>
      <div className="hero-market-core">
      <style>{`
        .hero-market-core-position {
          width: auto;
          aspect-ratio: 572 / 1389;
        }

        .hero-market-core {
          position: relative;
          width: 100%;
          height: 100%;
          user-select: none;
          animation: hero-final-core-drift 15s ease-in-out 900ms infinite;
          will-change: transform;
        }

        .hero-market-core__float,
        .hero-market-core__entry {
          position: absolute;
          inset: 0;
        }

        .hero-market-core__float {
          animation: hero-final-core-float 8.5s ease-in-out 900ms infinite;
          will-change: transform;
        }

        .hero-market-core__entry {
          opacity: 0;
          transform: translate3d(18px, 10px, 0) scale(0.98) rotateZ(0.5deg);
          animation: hero-final-core-entry 900ms cubic-bezier(0.22, 0.75, 0.25, 1) both;
        }

        .hero-market-core__image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          user-select: none;
        }

        @keyframes hero-final-core-entry {
          from {
            opacity: 0;
            transform: translate3d(18px, 10px, 0) scale(0.98) rotateZ(0.5deg);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1) rotateZ(0deg);
          }
        }

        @keyframes hero-final-core-float {
          0%, 100% { transform: translateY(0); }
          45% { transform: translateY(-4px); }
          70% { transform: translateY(-2px); }
        }

        @keyframes hero-final-core-drift {
          0%, 100% { transform: translateX(0) rotateZ(0deg) scale(1); }
          35% { transform: translateX(2px) rotateZ(0.3deg) scale(1.003); }
          70% { transform: translateX(-1px) rotateZ(-0.18deg) scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-market-core,
          .hero-market-core__float,
          .hero-market-core__entry {
            animation: none;
            will-change: auto;
          }

          .hero-market-core__entry {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      <div className="hero-market-core__float">
        <div className="hero-market-core__entry">
          <img
            className="hero-market-core__image"
            src="/brand/goodtrading-hero-core-vertical.webp"
            alt=""
            width={572}
            height={1389}
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
