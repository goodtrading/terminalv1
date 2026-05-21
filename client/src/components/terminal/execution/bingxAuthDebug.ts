/** Safe client-side BingX auth debug logs (no PII, keys, or secrets). */

export type BingXAuthSessionStatus = "loading" | "authenticated" | "unauthenticated";

export function bingXAuthSessionStatus(
  authReady: boolean,
  authenticated: boolean,
  user: { id?: number | string } | null | undefined,
): BingXAuthSessionStatus {
  if (!authReady) return "loading";
  if (authenticated) return "authenticated";
  const id = user?.id;
  if (id != null && id !== "" && Number.isFinite(Number(id))) return "authenticated";
  return "unauthenticated";
}

export function logBingXAuthDebug(
  status: BingXAuthSessionStatus,
  userIdPresent: boolean,
): void {
  if (import.meta.env.PROD) return;
  console.log(`[BingX Auth] session status: ${status}`);
  console.log(`[BingX Auth] userId present: ${userIdPresent}`);
}
