const TERMS = [
  "ORDER FLOW",
  "GAMMA",
  "OPTIONS",
  "LIQUIDITY",
  "OPEN INTEREST",
  "KEY LEVELS",
  "VOLATILITY",
  "FLOWS",
  "ALERTS",
  "REPORTS",
  "PAPER TRADING",
  "BITCOIN",
] as const;

function TermGroup({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div
      className={`technical-marquee__group${duplicate ? " technical-marquee__group--duplicate" : ""}`}
      aria-hidden={duplicate}
    >
      {TERMS.map((term) => (
        <span key={`${duplicate ? "duplicate-" : ""}${term}`} className="technical-marquee__item">
          <span>{term}</span>
          <span className="technical-marquee__separator" aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}

export function TechnicalMarquee() {
  return (
    <section className="technical-marquee" aria-label="GoodTrading technical vocabulary">
      <style>{`
        .technical-marquee {
          min-height: 64px;
          width: 100%;
          overflow: hidden;
          border-top: 1px solid rgba(255,255,255,0.08);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(3,3,3,0.58);
          -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
          mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
        }

        .technical-marquee__track {
          display: flex;
          width: max-content;
          min-height: 64px;
          align-items: center;
          animation: goodtrading-technical-marquee 34s linear infinite;
          will-change: transform;
        }

        .technical-marquee__group {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          gap: 2.25rem;
          padding-right: 2.25rem;
        }

        .technical-marquee__item {
          display: inline-flex;
          flex-shrink: 0;
          align-items: center;
          gap: 2.25rem;
          color: #a7afb9;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.14em;
          line-height: 1;
          white-space: nowrap;
        }

        .technical-marquee__separator {
          display: inline-block;
          width: 4px;
          height: 4px;
          flex: 0 0 auto;
          background: #ff303c;
        }

        @keyframes goodtrading-technical-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }

        @media (max-width: 640px) {
          .technical-marquee,
          .technical-marquee__track {
            min-height: 56px;
          }

          .technical-marquee__group {
            gap: 1.25rem;
            padding-right: 1.25rem;
          }

          .technical-marquee__item {
            gap: 1.25rem;
            font-size: 11px;
            letter-spacing: 0.12em;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .technical-marquee {
            overflow: visible;
            -webkit-mask-image: none;
            mask-image: none;
          }

          .technical-marquee__track {
            width: 100%;
            min-height: 56px;
            animation: none;
            flex-wrap: wrap;
            justify-content: center;
            padding: 0.85rem 1rem;
          }

          .technical-marquee__group {
            width: 100%;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.75rem 1.25rem;
            padding-right: 0;
          }

          .technical-marquee__group--duplicate {
            display: none;
          }

          .technical-marquee__item {
            gap: 0.75rem;
          }
        }
      `}</style>
      <div className="technical-marquee__track">
        <TermGroup />
        <TermGroup duplicate />
      </div>
    </section>
  );
}
