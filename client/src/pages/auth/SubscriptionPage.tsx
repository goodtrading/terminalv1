import { useEffect, useState, type FormEvent } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { getAuthToken } from "@/lib/authToken";
import { cn } from "@/lib/utils";

interface PlanRow {
  id: number;
  slug: string;
  name: string;
  priceUsd: number;
  durationDays: number;
  paypalLink: string | null;
  usdtAddress: string | null;
  sortOrder: number;
}

export function SubscriptionPage() {
  const { user, logout, refreshSession } = useTerminalAuth();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amountUsd, setAmountUsd] = useState("");
  const [method, setMethod] = useState<"usdt" | "paypal" | "other">("usdt");
  const [externalRef, setExternalRef] = useState("");
  const [notes, setNotes] = useState("");
  const [reportErr, setReportErr] = useState<string | null>(null);
  const [reportOk, setReportOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plans", { credentials: "include" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.plans) setPlans(data.plans as PlanRow[]);
      } catch {
        if (!cancelled) setPlans([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitPaymentReport = async (e: FormEvent) => {
    e.preventDefault();
    setReportErr(null);
    setReportOk(false);
    const amt = Number(amountUsd);
    if (!Number.isFinite(amt) || amt <= 0) {
      setReportErr("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/payments/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          amountUsd: amt,
          method,
          externalRef: externalRef || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReportErr((data as { error?: string }).error || "Failed to submit");
        return;
      }
      setReportOk(true);
      setAmountUsd("");
      setExternalRef("");
      setNotes("");
      await refreshSession();
    } catch {
      setReportErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-terminal-bg text-terminal-text px-4 py-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-terminal-border pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-widest text-white">SUBSCRIPTION REQUIRED</h1>
            <p className="text-xs text-terminal-muted font-mono mt-1">
              Signed in as <span className="text-terminal-accent">{user?.email}</span>. Purchase a plan below,
              then report your payment. An administrator will activate your access after verification.
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="shrink-0 text-xs font-mono border border-terminal-border px-3 py-1 rounded-sm text-terminal-muted hover:text-white"
          >
            LOG OUT
          </button>
        </div>

        <section className="border border-terminal-border bg-terminal-panel p-4 rounded-sm">
          <h2 className="text-sm font-bold tracking-wider text-white mb-3">PLANS</h2>
          {loading ? (
            <p className="text-xs text-terminal-muted font-mono">Loading plans…</p>
          ) : plans.length === 0 ? (
            <p className="text-xs text-terminal-muted font-mono">No plans configured yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className="border border-terminal-border bg-terminal-bg p-3 rounded-sm flex flex-col gap-2"
                >
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-white">{p.name}</span>
                    <span className="text-xs font-mono text-terminal-accent">${p.priceUsd}</span>
                  </div>
                  <div className="text-[10px] text-terminal-muted font-mono">
                    {p.durationDays} days · {p.slug}
                  </div>
                  {p.paypalLink ? (
                    <a
                      href={p.paypalLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono text-terminal-accent underline hover:opacity-80"
                    >
                      Pay with PayPal
                    </a>
                  ) : (
                    <span className="text-[10px] text-terminal-muted font-mono">PayPal link not set</span>
                  )}
                  {p.usdtAddress ? (
                    <div className="text-[10px] font-mono text-terminal-muted break-all">
                      USDT (TRC20): <span className="text-white">{p.usdtAddress}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border border-terminal-border bg-terminal-panel p-4 rounded-sm space-y-3">
          <h2 className="text-sm font-bold tracking-wider text-white">PAYMENT INSTRUCTIONS</h2>
          <ol className="list-decimal list-inside text-xs text-terminal-muted font-mono space-y-1">
            <li>Choose a plan above and complete payment via PayPal or USDT as listed.</li>
            <li>Keep your transaction ID or hash.</li>
            <li>Submit the report form below so the team can match your payment.</li>
            <li>Access is enabled after manual verification (usually within 24h).</li>
          </ol>
        </section>

        <section className="border border-terminal-border bg-terminal-panel p-4 rounded-sm">
          <h2 className="text-sm font-bold tracking-wider text-white mb-3">REPORT PAYMENT</h2>
          <form className="space-y-3 max-w-md" onSubmit={submitPaymentReport}>
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">AMOUNT (USD)</label>
              <input
                className="w-full bg-terminal-bg border border-terminal-border px-2 py-2 text-sm font-mono text-white rounded-sm"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="49"
              />
            </div>
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">METHOD</label>
              <div className="flex gap-2">
                {(["usdt", "paypal", "other"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(
                      "flex-1 py-1.5 text-[10px] font-mono border rounded-sm uppercase",
                      method === m
                        ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                        : "border-terminal-border text-terminal-muted",
                    )}
                    onClick={() => setMethod(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">
                TX ID / REF (optional)
              </label>
              <input
                className="w-full bg-terminal-bg border border-terminal-border px-2 py-2 text-sm font-mono text-white rounded-sm"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] text-terminal-muted mb-1 font-mono">NOTES (optional)</label>
              <textarea
                className="w-full bg-terminal-bg border border-terminal-border px-2 py-2 text-sm font-mono text-white rounded-sm min-h-[72px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {reportErr && (
              <div className="text-xs text-red-400 font-mono border border-red-500/40 bg-red-500/10 px-2 py-1 rounded-sm">
                {reportErr}
              </div>
            )}
            {reportOk && (
              <div className="text-xs text-terminal-positive font-mono border border-terminal-positive/40 bg-terminal-positive/10 px-2 py-1 rounded-sm">
                Report received. Thank you.
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 text-xs font-bold tracking-widest bg-terminal-accent text-black rounded-sm hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "SUBMITTING…" : "SUBMIT REPORT"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
