import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { getAuthToken } from "@/lib/authToken";
import type { AccessSnapshot } from "@/contexts/TerminalAuthContext";

interface AdminUserRow {
  id: number;
  email: string;
  role: string;
  isActive: boolean;
  onboardingStatus?: string;
  createdAt: string | null;
  access: AccessSnapshot;
  latestSubscription?: {
    status: string;
    startsAt: string;
    endsAt: string;
    planName: string;
    planId: number;
  } | null;
}

type FilterMode = "all" | "active" | "pending" | "no_sub" | "expired";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function nameFromEmail(email: string): string {
  const base = (email || "").split("@")[0] || "Member";
  return base
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function roleBadge(role: string) {
  if (role === "admin") {
    return "bg-red-500/15 text-red-400 border border-red-500/40";
  }
  return "bg-white/5 text-white/70 border border-white/20";
}

function userState(row: AdminUserRow): "ACTIVE" | "PENDING" | "INACTIVE" {
  if (!row.isActive) return "INACTIVE";
  return "ACTIVE";
}

function userStateBadge(state: ReturnType<typeof userState>) {
  if (state === "ACTIVE") return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40";
  if (state === "PENDING") return "bg-amber-500/15 text-amber-400 border border-amber-500/40";
  return "bg-white/5 text-white/60 border border-white/20";
}

function subscriptionState(row: AdminUserRow): string {
  if (!row.isActive) return "INACTIVE USER";
  if (row.access?.allowed) return "ACTIVE";
  if (row.latestSubscription?.status === "expired") return "EXPIRED";
  const reason = row.access?.reason || "";
  if (reason === "no_subscription") return "NO SUBSCRIPTION";
  if (reason === "expired") return "EXPIRED";
  return "NO SUBSCRIPTION";
}

function subscriptionBadge(label: string) {
  if (label === "ACTIVE") return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40";
  if (label === "NO SUBSCRIPTION" || label === "EXPIRED") return "bg-red-500/15 text-red-400 border border-red-500/40";
  if (label === "INACTIVE USER") return "bg-white/5 text-white/60 border border-white/20";
  return "bg-white/5 text-white/70 border border-white/20";
}

function metricCard(label: string, value: number) {
  return (
    <div className="border border-terminal-border bg-terminal-panel rounded-sm px-3 py-2 min-w-[120px]">
      <div className="text-[10px] uppercase tracking-wider text-terminal-muted">{label}</div>
      <div className="text-lg font-bold text-white leading-tight">{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const { user, authReady } = useTerminalAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [plans, setPlans] = useState<{ id: number; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [grantPlanId, setGrantPlanId] = useState<number>(1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  const load = useCallback(async () => {
    setErr(null);
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const headers: HeadersInit = { Authorization: `Bearer ${token}` };
      const [uRes, pRes] = await Promise.all([
        fetch("/api/admin/users", { credentials: "include", headers }),
        fetch("/api/plans", { credentials: "include" }),
      ]);
      if (!uRes.ok) {
        setErr(uRes.status === 403 ? "No autorizado para panel admin" : `Error users: ${uRes.status}`);
        setRows([]);
        return;
      }
      const uData = await uRes.json();
      setRows((uData.users as AdminUserRow[]) ?? []);
      const pData = await pRes.json().catch(() => ({}));
      const plist = (pData.plans as { id: number; name: string }[]) ?? [];
      setPlans(plist);
      if (plist.length) {
        setGrantPlanId((prev) => (plist.some((p) => p.id === prev) ? prev : plist[0]!.id));
      }
    } catch {
      setErr("No se pudo cargar usuarios/planes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    void load();
  }, [authReady, load]);

  const patchUser = async (
    id: number,
    body: {
      role?: "user" | "admin";
      isActive?: boolean;
      onboardingStatus?: string;
    },
  ) => {
    const token = getAuthToken();
    if (!token) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr("No se pudo actualizar usuario");
      return;
    }
    await load();
  };

  const activateSubscription = async (userId: number) => {
    const token = getAuthToken();
    if (!token) return;
    const res = await fetch(`/api/admin/users/${userId}/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({ planId: grantPlanId }),
    });
    if (!res.ok) {
      setErr("No se pudo activar suscripción");
      return;
    }
    await load();
  };

  const deactivateSubscription = async (userId: number) => {
    const token = getAuthToken();
    if (!token) return;
    const res = await fetch(`/api/admin/users/${userId}/subscription/deactivate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setErr("No se pudo desactivar suscripción");
      return;
    }
    await load();
  };

  const normalized = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const uState = userState(r);
      const sState = subscriptionState(r);

      if (filter === "active" && !(uState === "ACTIVE" && sState === "ACTIVE")) return false;
      if (
        filter === "pending" &&
        !(uState === "PENDING" || sState === "NO SUBSCRIPTION" || sState === "EXPIRED")
      )
        return false;
      if (filter === "no_sub" && sState !== "NO SUBSCRIPTION") return false;
      if (filter === "expired" && sState !== "EXPIRED") return false;

      if (!normalized) return true;
      const hay = `${r.email} ${nameFromEmail(r.email)} ${r.role} ${uState} ${sState}`.toLowerCase();
      return hay.includes(normalized);
    });
  }, [rows, filter, normalized]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const activeUsers = rows.filter((r) => userState(r) === "ACTIVE" && subscriptionState(r) === "ACTIVE").length;
    const noSubscription = rows.filter((r) => {
      const s = subscriptionState(r);
      return s === "NO SUBSCRIPTION";
    }).length;
    const expiredSubs = rows.filter((r) => subscriptionState(r) === "EXPIRED").length;
    const pendingReview = rows.filter((r) => {
      const s = subscriptionState(r);
      return !r.isActive || s === "NO SUBSCRIPTION" || s === "EXPIRED";
    }).length;
    const admins = rows.filter((r) => r.role === "admin").length;
    return { total, activeUsers, noSubscription, expiredSubs, pendingReview, admins };
  }, [rows]);

  if (!authReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-terminal-bg text-terminal-muted text-sm font-mono">
        Cargando panel admin…
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-terminal-bg text-terminal-text gap-4 px-4">
        <p className="text-sm font-mono text-terminal-muted">Admin access required.</p>
        <Link href="/" className="text-xs font-mono text-terminal-accent underline">
          Back to terminal
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-terminal-bg text-terminal-text px-4 py-6 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs font-mono">
            <Link href="/" className="text-terminal-accent hover:underline">
              ← Terminal
            </Link>
            <span className="text-terminal-muted">/</span>
            <span className="text-white tracking-wider">Admin Panel</span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] font-mono border border-terminal-border px-2 py-1 rounded-sm text-terminal-muted hover:text-white"
          >
            Refrescar
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {metricCard("Total users", metrics.total)}
          {metricCard("Active users", metrics.activeUsers)}
          {metricCard("No subscription", metrics.noSubscription)}
          {metricCard("Expired", metrics.expiredSubs)}
          {metricCard("Pending review", metrics.pendingReview)}
          {metricCard("Admins", metrics.admins)}
        </div>

        <div className="border border-terminal-border bg-terminal-panel rounded-sm p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-terminal-muted">Plan para activar:</span>
              <select
                className="bg-terminal-bg border border-terminal-border px-2 py-1 rounded-sm text-white"
                value={grantPlanId}
                onChange={(e) => setGrantPlanId(Number(e.target.value))}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (#{p.id})
                  </option>
                ))}
              </select>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por email"
              className="bg-terminal-bg border border-terminal-border px-2 py-1 rounded-sm text-[12px] font-mono text-white min-w-[220px]"
            />
            <div className="flex items-center gap-1 text-xs font-mono">
              {[
                { id: "all", label: "Todos" },
                { id: "active", label: "Activos" },
                { id: "pending", label: "Pendientes" },
                { id: "no_sub", label: "Sin suscripción" },
                { id: "expired", label: "Expiradas" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id as FilterMode)}
                  className={`px-2 py-1 border rounded-sm ${
                    filter === f.id
                      ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                      : "border-terminal-border text-terminal-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {err && (
            <div className="text-xs text-red-400 font-mono border border-red-500/40 bg-red-500/10 px-2 py-1 rounded-sm">
              {err}
            </div>
          )}

          <div className="border border-terminal-border rounded-sm overflow-x-auto">
            <table className="w-full text-left text-[12px] font-mono">
              <thead className="bg-terminal-bg border-b border-terminal-border text-terminal-muted">
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Rol</th>
                  <th className="p-2">Estado usuario</th>
                  <th className="p-2">Suscripción</th>
                  <th className="p-2">Inicio</th>
                  <th className="p-2">Vencimiento</th>
                  <th className="p-2">Creación</th>
                  <th className="p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const uState = userState(r);
                  const sState = subscriptionState(r);
                  const hasActiveSub = Boolean(r.access?.allowed);
                  const isExpired = sState === "EXPIRED";
                  return (
                    <tr key={r.id} className="border-b border-terminal-border/60 align-top">
                      <td className="p-2 text-terminal-muted">{r.id}</td>
                      <td className="p-2 text-white max-w-[260px] truncate" title={r.email}>
                        {r.email}
                      </td>
                      <td className="p-2 text-white/85">{nameFromEmail(r.email)}</td>
                      <td className="p-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider ${roleBadge(r.role)}`}>
                          {r.role === "admin" ? "admin" : "member"}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider ${userStateBadge(uState)}`}>
                          {uState}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider ${subscriptionBadge(sState)}`}>
                          {sState}
                        </span>
                      </td>
                      <td className="p-2 text-terminal-muted">{formatDateTime(r.latestSubscription?.startsAt)}</td>
                      <td className="p-2 text-terminal-muted">{formatDateTime(r.latestSubscription?.endsAt)}</td>
                      <td className="p-2 text-terminal-muted">{formatDate(r.createdAt)}</td>
                      <td className="p-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={`px-2 py-1 rounded-sm border text-[10px] tracking-wider uppercase ${
                              r.isActive
                                ? "border-white/25 text-white/80 hover:text-white"
                                : "border-amber-500/60 text-amber-300 hover:bg-amber-500/10"
                            }`}
                            onClick={() =>
                              void patchUser(r.id, {
                                isActive: !r.isActive,
                                onboardingStatus: !r.isActive ? "approved_to_pay" : "inactive",
                              })
                            }
                          >
                            {r.isActive ? "Desactivar usuario" : "Activar usuario"}
                          </button>

                          {!hasActiveSub ? (
                            <button
                              type="button"
                              disabled={!r.isActive}
                              className={`px-2 py-1 rounded-sm border text-[10px] tracking-wider uppercase ${
                                r.isActive
                                  ? "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                                  : "border-emerald-500/20 text-emerald-300/40 bg-emerald-500/5 cursor-not-allowed"
                              }`}
                              onClick={() => void activateSubscription(r.id)}
                            >
                              {isExpired ? "Renovar suscripción" : "Activar suscripción"}
                            </button>
                          ) : (
                            <span className="inline-flex px-2 py-1 rounded-sm text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/40">
                              Suscripción activa
                            </span>
                          )}

                          {hasActiveSub && (
                            <button
                              type="button"
                              className="px-2 py-1 rounded-sm border text-[10px] tracking-wider uppercase border-red-500/50 text-red-400 hover:bg-red-500/10"
                              onClick={() => void deactivateSubscription(r.id)}
                            >
                              Desactivar suscripción
                            </button>
                          )}
                          <button
                            type="button"
                            className="px-2 py-1 rounded-sm border border-terminal-border text-terminal-muted hover:text-white text-[10px] uppercase tracking-wider"
                            onClick={() => void patchUser(r.id, { role: r.role === "admin" ? "user" : "admin" })}
                          >
                            {r.role === "admin" ? "Hacer user" : "Hacer admin"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-terminal-muted">
                      No hay usuarios para el filtro actual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
