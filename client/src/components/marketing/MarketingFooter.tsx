import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { openDesktopDownload } from "@/lib/downloadDesktop";

const SUPPORT_EMAIL = "GoodTradingpay@gmail.com";

function FooterLink({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const cls =
    "marketing-focus-ring marketing-motion-colors text-sm text-[#a7afb9] hover:text-white";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`text-left ${cls}`}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href ?? "/"} className={cls}>
      {children}
    </Link>
  );
}

export function MarketingFooter() {
  const [, setLocation] = useLocation();
  const { terminalRedirect } = usePlatformAccess();

  return (
    <footer className="relative z-10 mt-8 border-t border-white/[0.07] bg-[#020202]/90">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-md" aria-hidden />
              <span className="font-semibold text-white">GoodTrading</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#a7afb9]">
              Leé el mercado como una mesa institucional.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#737b85]">
              Navegación
            </p>
            <nav className="mt-4 flex flex-col gap-2.5">
              <FooterLink href="/">Inicio</FooterLink>
              <FooterLink href="/about">Qué es GoodTrading</FooterLink>
              <FooterLink href="/methodology/data-sources">Fuentes de datos</FooterLink>
              <FooterLink href="/methodology/classification">Clasificación pública</FooterLink>
              <FooterLink href="/methodology/gamma-options">Gamma y opciones</FooterLink>
              <FooterLink href="/methodology/limitations">Limitaciones y riesgo de modelo</FooterLink>
              <FooterLink href="/products">Productos</FooterLink>
              <FooterLink onClick={() => setLocation(terminalRedirect)}>Terminal Web</FooterLink>
              <FooterLink onClick={() => openDesktopDownload("footer")}>
                Descargar Desktop
              </FooterLink>
              <FooterLink href="/account">Mi cuenta</FooterLink>
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#737b85]">
              Aprender
            </p>
            <nav className="mt-4 flex flex-col gap-2.5">
              <FooterLink href="/terminal-trading-cripto">Terminal de trading cripto</FooterLink>
              <FooterLink href="/order-flow-bitcoin">Order Flow en Bitcoin</FooterLink>
              <FooterLink href="/gamma-exposure-bitcoin">Gamma Exposure de Bitcoin</FooterLink>
              <FooterLink href="/heatmap-liquidez-bitcoin">Heatmap de liquidez</FooterLink>
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#737b85]">
              Legal / Soporte
            </p>
            <nav className="mt-4 flex flex-col gap-2.5">
              <FooterLink href="/terms">Términos</FooterLink>
              <FooterLink href="/privacy">Privacidad</FooterLink>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="marketing-focus-ring marketing-motion-colors text-sm text-[#a7afb9] hover:text-white"
              >
                Soporte
              </a>
            </nav>
          </div>
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-8 text-center text-xs text-[#737b85]">
          © 2026 GoodTrading. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
