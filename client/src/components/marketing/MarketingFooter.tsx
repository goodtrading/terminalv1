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
    "text-sm text-[#9ca3af] transition-colors hover:text-white";

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
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#9ca3af]">
              Leé el mercado como una mesa institucional.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
              Navegación
            </p>
            <nav className="mt-4 flex flex-col gap-2.5">
              <FooterLink href="/">Inicio</FooterLink>
              <FooterLink href="/products">Productos</FooterLink>
              <FooterLink onClick={() => setLocation(terminalRedirect)}>Terminal Web</FooterLink>
              <FooterLink onClick={() => openDesktopDownload("footer")}>
                Descargar Desktop
              </FooterLink>
              <FooterLink href="/account">Mi cuenta</FooterLink>
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
              Productos
            </p>
            <nav className="mt-4 flex flex-col gap-2.5">
              <FooterLink href="/products">Terminal Web</FooterLink>
              <FooterLink onClick={() => openDesktopDownload("footer_products")}>
                App Desktop
              </FooterLink>
              <span className="text-sm text-[#6b7280]">App Móvil · Próximamente</span>
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
              Legal / Soporte
            </p>
            <nav className="mt-4 flex flex-col gap-2.5">
              <FooterLink href="/terms">Términos</FooterLink>
              <FooterLink href="/privacy">Privacidad</FooterLink>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-sm text-[#9ca3af] transition-colors hover:text-white"
              >
                Soporte
              </a>
            </nav>
          </div>
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-8 text-center text-xs text-[#6b7280]">
          © 2026 GoodTrading. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
