export function PremiumBorder() {
  return (
    <>
      <style>{`
        .premium-border__beam {
          position: absolute;
          z-index: 10;
          inset: 0;
          pointer-events: none;
          border-radius: 18px;
          padding: 1px;
          background: conic-gradient(
            from -20deg,
            transparent 0deg 296deg,
            rgba(243,244,246,0.18) 309deg,
            rgba(255,48,60,0.22) 318deg,
            transparent 332deg 360deg
          );
          animation: goodtrading-premium-border 10s linear infinite;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }

        @keyframes goodtrading-premium-border {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 640px), (pointer: coarse), (prefers-reduced-motion: reduce) {
          .premium-border__beam {
            animation: none;
            background: linear-gradient(
              135deg,
              transparent 0 70%,
              rgba(243,244,246,0.10) 84%,
              rgba(255,48,60,0.12) 92%,
              transparent 100%
            );
          }
        }
      `}</style>
      <span className="premium-border__beam" aria-hidden="true" />
    </>
  );
}
