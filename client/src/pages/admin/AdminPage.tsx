import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { getAuthToken } from "@/lib/authToken";
import type { AccessSnapshot } from "@/contexts/TerminalAuthContext";

interface AdminUserRow {
  id: number;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string | null;
  access: AccessSnapshot;
}

export default function AdminPage() {
  const { user, authReady } = useTerminalAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [plans, setPlans] = useState<{ id: number; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [grantPlanId, setGrantPlanId] = useState<number>(1);

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
        setErr(uRes.status === 403 ? "FORBIDDEN" : `users:${uRes.status}`);
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
      setErr("LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    void load();
  }, [authReady, load]);

  const patchUser = async (id: number, body: { role?: "user" | "admin"; isActive?: boolean }) => {
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
      setErr("PATCH_FAILED");
      return;
    }
    await load();
  };

  const grantSub = async (userId: number) => {
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
      setErr("GRANT_FAILED");
      return;
    }
    await load();
  };

  if (!authReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-terminal-bg text-terminal-muted text-sm font-mono">
        Loading…
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
    <div className="min-h-screen w-full bg-terminal-bg text-terminal-text p-6 overflow-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold tracking-widest text-white">ADMIN</h1>
          <Link href="/" className="text-xs font-mono text-terminal-accent underline">
            Terminal
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span className="text-terminal-muted">Grant plan:</span>
          <select
            className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white"
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

        {err && (
          <div className="text-xs text-red-400 font-mono border border-red-500/40 bg-red-500/10 px-2 py-1 rounded-sm">
            {err}
          </div>
        )}

        <div className="border border-terminal-border rounded-sm overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-terminal-panel border-b border-terminal-border text-terminal-muted">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Email</th>
                <th className="p-2">Role</th>
                <th className="p-2">Active</th>
                <th className="p-2">Access</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-terminal-border/60">
                  <td className="p-2 text-terminal-muted">{r.id}</td>
                  <td className="p-2 text-white">{r.email}</td>
                  <td className="p-2">{r.role}</td>
                  <td className="p-2">{r.isActive ? "yes" : "no"}</td>
                  <td className="p-2 text-terminal-muted max-w-[200px] truncate">
                    {r.access?.allowed ? "allowed" : r.access?.reason ?? "—"}
                  </td>
                  <td className="p-2 space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="border border-terminal-accent text-terminal-accent px-2 py-0.5 rounded-sm"
                      onClick={() => patchUser(r.id, { role: r.role === "admin" ? "user" : "admin" })}
                    >
                      Toggle role
                    </button>
                    <button
                      type="button"
                      className="border border-terminal-border px-2 py-0.5 rounded-sm text-terminal-muted"
                      onClick={() => patchUser(r.id, { isActive: !r.isActive })}
                    >
                      Toggle active
                    </button>
                    <button
                      type="button"
                      className="border border-terminal-positive text-terminal-positive px-2 py-0.5 rounded-sm"
                      onClick={() => grantSub(r.id)}
                    >
                      Grant sub
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
