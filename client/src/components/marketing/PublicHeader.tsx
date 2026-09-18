import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { openDesktopDownload } from "@/lib/downloadDesktop";

const NAV_ITEMS = [
  { label: "Productos", href: "/products", type: "link" as const },
  { label: "Academy", href: "/academy", type: "link" as const },
  { label: "Terminal Web", type: "terminal" as const },
  { label: "Descargar App Desktop", type: "download" as const },
];

const navLinkClass =
  "group relative text-[15px] font-medium text-[#a7afb9] transition-colors duration-200 motion-reduce:transition-none hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff303c]/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#030303] whitespace-nowrap";

export function PublicHeader() {
  const [location, setLocation] = useLocation();
  const { authReady, isAuthenticated, hasActiveSubscription, terminalRedirect } = usePlatformAccess();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const nextScrolled = window.scrollY > 24;
      setScrolled((current) => (current === nextScrolled ? current : nextScrolled));
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  const isActiveLink = (href?: string) => Boolean(href && (location === href || location.startsWith(`${href}/`)));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-200 motion-reduce:transition-none",
        scrolled
          ? "border-white/[0.08] bg-[#030303]/88 backdrop-blur-[10px]"
          : "border-white/[0.04] bg-[#030303]/75 backdrop-blur-[4px]",
      )}
    >
      <div className="mx-auto flex h-[76px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8">
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

        <nav className="hidden flex-1 items-center justify-center gap-7 xl:gap-9 lg:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = item.type === "link" && isActiveLink(item.href);
            const content = <>
              {item.label}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -bottom-2 left-0 h-px bg-[#ff303c] transition-[width] duration-200 ease-out motion-reduce:transition-none",
                  isActive ? "w-full" : "w-0 group-hover:w-full",
                )}
              />
            </>;

            return item.type === "link" ? (
              <Link key={item.label} href={item.href} className={navLinkClass}>
                {content}
              </Link>
            ) : (
              <button key={item.label} type="button" onClick={() => handleNav(item)} className={navLinkClass}>
                {content}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
          {!authReady ? (
            <span className="text-sm text-[#6b7280]">…</span>
          ) : isAuthenticated ? (
            <>
              {!hasActiveSubscription && (
                <button
                  type="button"
                  onClick={() => setLocation("/pricing")}
                  className="hidden rounded-full border border-[#ff303c]/30 bg-[#ff303c]/[0.08] px-3 py-1.5 text-xs font-medium text-[#ff6b73] md:inline-flex"
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
              "hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:inline-flex sm:px-5",
              hasActiveSubscription && isAuthenticated
                ? "bg-gradient-to-r from-[#b81523] via-[#ff303c] to-[#b81523] text-white shadow-[0_0_24px_rgba(255,48,60,0.18)] hover:opacity-90"
                : "border border-white/20 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/10",
            )}
          >
            Terminal Web
          </button>

          <button
            type="button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white transition-colors hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff303c]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030303] lg:hidden"
          >
            <span className="text-lg leading-none">{mobileOpen ? "×" : "☰"}</span>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="marketing-mobile-menu"
          className="border-t border-white/[0.06] bg-[#050505]/98 px-4 py-4 lg:hidden"
        >
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => item.type === "link" ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-white/[0.04] hover:text-white",
                  isActiveLink(item.href) ? "bg-white/[0.06] text-white" : "text-[#d1d5db]",
                )}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNav(item)}
                className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#d1d5db] hover:bg-white/[0.04] hover:text-white"
              >
                {item.label}
              </button>
            ))}
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
