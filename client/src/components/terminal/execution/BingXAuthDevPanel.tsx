import { useEffect, useState } from "react";
import { getAuthToken } from "@/lib/authToken";
import { fetchMe } from "@/contexts/TerminalAuthContext";

type MeProbe = {
  status: number | null;
  authenticated: boolean | null;
};

type BingXAuthDevPanelProps = {
  open: boolean;
  authReady: boolean;
  contextAuthenticated: boolean;
  userExists: boolean;
  userIdExists: boolean;
  tokenExists: boolean;
  submitBlockReason?: string | null;
  apiErrorStaleAuth?: boolean;
};

/** Dev-only auth diagnostics for BingX Secure API (no secrets). */
export function BingXAuthDevPanel({
  open,
  authReady,
  contextAuthenticated,
  userExists,
  userIdExists,
  tokenExists,
  submitBlockReason = null,
  apiErrorStaleAuth = false,
}: BingXAuthDevPanelProps) {
  const [meProbe, setMeProbe] = useState<MeProbe>({ status: null, authenticated: null });

  useEffect(() => {
    if (!open || !import.meta.env.DEV) return;
    let cancelled = false;
    void fetchMe()
      .then((me) => {
        if (!cancelled) {
          setMeProbe({
            status: 200,
            authenticated: me.authenticated === true || Boolean(me.user?.id),
          });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        if (msg === "me:401") {
          setMeProbe({ status: 401, authenticated: false });
          return;
        }
        const m = msg.match(/^me:(\d+)$/);
        setMeProbe({
          status: m ? Number(m[1]) : null,
          authenticated: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, authReady, contextAuthenticated, userExists, tokenExists]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="rounded border border-dashed border-slate-600/60 bg-slate-900/50 px-2 py-1.5 text-[8px] text-slate-400 font-mono space-y-0.5">
      <p className="text-[7px] uppercase tracking-wider text-slate-500">Auth debug (dev)</p>
      <p>authReady: {String(authReady)}</p>
      <p>context authenticated: {String(contextAuthenticated)}</p>
      <p>user exists: {String(userExists)}</p>
      <p>userId exists: {String(userIdExists)}</p>
      <p>token exists: {String(tokenExists || Boolean(getAuthToken()))}</p>
      <p>
        /api/auth/me status: {meProbe.status == null ? "…" : String(meProbe.status)}
      </p>
      <p>
        /api/auth/me authenticated:{" "}
        {meProbe.authenticated == null ? "…" : String(meProbe.authenticated)}
      </p>
      <p>submitBlockReason: {submitBlockReason ?? "null"}</p>
      <p>apiError stale auth: {String(apiErrorStaleAuth)}</p>
    </div>
  );
}
