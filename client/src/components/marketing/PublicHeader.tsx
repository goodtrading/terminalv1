import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { openDesktopDownload } from "@/lib/downloadDesktop";

const NAV_ITEMS = [
  { label: "Productos", href: "/products", type: "link" as const },
  { label: "Terminal Web", type: "terminal" as const },
  { label: "Descargar App Desktop", type: "download" as const },
  { label: "App Móvil · Próximamente", type: "disabled" as const },
];

const navLinkClass =
  "text-[15px] font-medium text-[#b0b8c4] hover:text-white transition-colors whitespace-nowrap";

export function PublicHeader() {
  const [location, setLocation] = useLocation();
  const { authReady, isAuthenticated, hasActiveSubscription, terminalRedirect } = usePlatformAccess();
  const [mobileOpen, setMobileOpen] = useState(false);

  const goTerminal = () => {
    setMobileOpen(false);
    setLocation(terminalRedirect);
  };

  const handleNav = (item: (typeof NAV_ITEMS)[number]) => {
    setMobileOpen(false);
    if (item.type === "link" && item.href) setLocation(item.href);
    if (item.type === "terminal") goTerminal();
    if (item.type === "download") openDesktopDownload("header_nav");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#030303]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8">
        {/* Left — logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <img
            src="/logo.png"
            alt="GoodTrading"
            width={51}
            height={34}
            className="h-7 w-auto shrink-0 translate-y-px object-contain md:h-[34px]"
          />
          <span className="text-base font-semibold leading-none tracking-wide text-white">GoodTrading</span>
        </Link>

        {/* Center — desktop nav */}
        <nav className="hidden flex-1 items-center justify-center gap-7 xl:gap-9 lg:flex">
          {NAV_ITEMS.map((item) =>
            item.type === "disabled" ? (
              <span key={item.label} className="cursor-default text-[15px] text-[#6b7280]">
                {item.label}
              </span>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNav(item)}
                className={navLinkClass}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>

        {/* Right — auth + CTA */}
        <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
          {!authReady ? (
            <span className="text-sm text-[#6b7280]">…</span>
          ) : isAuthenticated ? (
            <>
              {!hasActiveSubscription && (
                <button
                  type="button"
                  onClick={() => setLocation("/pricing")}
                  className="hidden rounded-full border border-[#ff3b3b]/40 bg-[#ff3b3b]/10 px-3 py-1.5 text-xs font-medium text-[#ff8a8a] md:inline-flex"
                >
                  Activar acceso
                </button>
              )}
              <Link
                href="/account"
                className={cn(
                  "rounded-xl px-3.5 py-2 text-sm font-medium transition-colors sm:px-4",
                  location === "/account"
                    ? "bg-white/10 text-white"
                    : "text-[#c4cad4] hover:bg-white/[0.05] hover:text-white",
                )}
              >
                Mi cuenta
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-xl px-3.5 py-2 text-sm font-medium text-[#c4cad4] hover:text-white sm:px-4"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className="hidden rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10 sm:inline sm:px-4"
              >
                Crear cuenta
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={goTerminal}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:px-5",
              hasActiveSubscription && isAuthenticated
                ? "bg-gradient-to-r from-[#ff3b3b] via-red-600 to-violet-700 text-white shadow-[0_0_28px_rgba(255,59,59,0.22)] hover:opacity-90"
                : "border border-white/20 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/10",
            )}
          >
            Terminal Web
          </button>

          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white lg:hidden"
          >
            <span className="text-lg leading-none">{mobileOpen ? "×" : "☰"}</span>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t border-white/[0.06] bg-[#050505]/98 px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) =>
              item.type === "disabled" ? (
                <span key={item.label} className="px-3 py-2.5 text-sm text-[#6b7280]">
                  {item.label}
                </span>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleNav(item)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d1d5db] hover:bg-white/[0.04] hover:text-white"
                >
                  {item.label}
                </button>
              ),
            )}
            {!isAuthenticated ? (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#d1d5db] hover:bg-white/[0.04]"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#d1d5db] hover:bg-white/[0.04]"
                >
                  Crear cuenta
                </Link>
              </>
            ) : (
              <Link
                href="/account"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#d1d5db] hover:bg-white/[0.04]"
              >
                Mi cuenta
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
