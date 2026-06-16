import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { StatusBadge } from "@/components/marketing/StatusBadge";
import { ChangePasswordModal } from "@/components/marketing/ChangePasswordModal";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { usePlatformAccess } from "@/hooks/usePlatformAccess";
import { openDesktopDownload } from "@/lib/downloadDesktop";
import { cn } from "@/lib/utils";

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[20px] border border-white/[0.08] bg-[#050505]/75 p-6 sm:p-7",
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-sm text-[#9ca3af]">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[#6b7280]">{label}</span>
      <span className="font-medium text-[#e5e7eb]">{value}</span>
    </div>
  );
}

function PlaceholderButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title="Próximamente — conectar con auth real"
      className="cursor-not-allowed rounded-xl border border-white/10 px-4 py-2.5 text-sm text-[#6b7280]"
    >
      {children}
    </button>
  );
}

export default function AccountPage() {
  const [, setLocation] = useLocation();
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const { terminalRedirect } = usePlatformAccess();
  const {
    authReady,
    status,
    statusLabel,
    profile,
    subscription,
    logout,
    isAuthenticated,
    hasActiveSubscription,
  } = useAccountProfile();

  if (!authReady) {
    return (
      <MarketingLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#9ca3af]">
          Cargando…
        </div>
      </MarketingLayout>
    );
  }

  const accountBadgeVariant =
    status === "active" ? "available" : status === "no_plan" ? "soon" : "soon";

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff3b3b]/80">
              GoodTrading
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Mi cuenta</h1>
            <p className="mt-3 max-w-xl text-base text-[#9ca3af]">
              Gestioná tu acceso, suscripción y datos de seguridad de GoodTrading.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/[0.06]"
          >
            ← Volver al inicio
          </Link>
        </div>

        <div className="space-y-5">
          {/* A — Estado de la cuenta */}
          <SectionCard title="Estado de la cuenta">
            <Row label="Nombre" value={profile.name} />
            <Row label="Email" value={profile.email} />
            <Row
              label="Estado"
              value={
                <StatusBadge variant={accountBadgeVariant} className="normal-case tracking-normal">
                  {statusLabel}
                </StatusBadge>
              }
            />
            {status === "visitor" && (
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/login"
                  className="rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]"
                >
                  Crear cuenta
                </Link>
              </div>
            )}
          </SectionCard>

          {/* B — Suscripción */}
          <SectionCard title="Suscripción">
            <Row label="Plan actual" value={subscription.plan} />
            <Row
              label="Estado"
              value={subscription.active ? "Activa" : "Inactiva / pendiente"}
            />
            {subscription.active && (
              <>
                <Row label="Días restantes" value={`${subscription.daysRemaining} días`} />
                <Row label="Renovación / vencimiento" value={subscription.renewsAt ?? "—"} />
              </>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              {subscription.active ? (
                <PlaceholderButton>Gestionar suscripción</PlaceholderButton>
              ) : (
                <button
                  type="button"
                  onClick={() => setLocation("/pricing")}
                  className="rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Ver planes
                </button>
              )}
              {!subscription.active && isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setLocation("/pricing")}
                  className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]"
                >
                  Activar acceso
                </button>
              )}
            </div>
          </SectionCard>

          {/* C — Accesos */}
          <SectionCard title="Accesos">
            <Row
              label="Terminal Web"
              value={
                hasActiveSubscription ? (
                  <span className="text-emerald-400">Disponible</span>
                ) : (
                  <span className="text-amber-400">Requiere plan</span>
                )
              }
            />
            <Row label="App Desktop" value="Disponible para descargar" />
            <Row label="App Móvil" value="Próximamente" />
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLocation(terminalRedirect)}
                className="rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Abrir Terminal Web
              </button>
              <button
                type="button"
                onClick={() => openDesktopDownload("account_page")}
                className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]"
              >
                Descargar App Desktop
              </button>
            </div>
            <p className="text-xs text-[#6b7280]">
              Web: terminal liviana. Desktop: Bookmap avanzado, heatmap completo y DOM institucional.
            </p>
          </SectionCard>

          {/* D — Seguridad */}
          <SectionCard title="Seguridad">
            <div className="flex flex-wrap gap-3">
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(true)}
                  className="rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Cambiar contraseña
                </button>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setLocation("/");
                  }}
                  className="rounded-xl border border-[#ff3b3b]/40 px-5 py-2.5 text-sm font-medium text-[#ff8a8a] hover:bg-[#ff3b3b]/10"
                >
                  Cerrar sesión
                </button>
              )}
            </div>
          </SectionCard>

          <ChangePasswordModal open={passwordModalOpen} onOpenChange={setPasswordModalOpen} />

          {/* E — Datos personales */}
          <SectionCard title="Datos personales">
            <Row label="Nombre" value={profile.name} />
            <Row
              label="Email"
              value={
                <span className="text-[#e5e7eb]">
                  {profile.email}
                  {profile.email !== "—" && (
                    <span className="ml-2 text-xs font-normal text-[#6b7280]">(solo lectura)</span>
                  )}
                </span>
              }
            />
            <Row label="País" value={profile.country} />
            <PlaceholderButton>Editar datos</PlaceholderButton>
          </SectionCard>
        </div>
      </div>
    </MarketingLayout>
  );
}
