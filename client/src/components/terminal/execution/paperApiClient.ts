import { getAuthToken } from "@/lib/authToken";
import { getPaperExecutionBackend } from "@/lib/paperExecutionBackendState";
import { apiRequest } from "@/lib/queryClient";

/** Safety guard: legacy Paper commands are forbidden in Nautilus mode. */
function nautilusPaperWriteGuard(
  path: string,
  init: RequestInit,
): void {
  if (getPaperExecutionBackend() !== "nautilus" || !path.startsWith("/api/paper/")) return;

  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET") return;

  throw new Error(
    `LEGACY_PAPER_REQUEST_FORBIDDEN_IN_NAUTILUS ${method} ${path}`,
  );
}

/** Authenticated paper API — same transport as BingX (cookie + Bearer). */
export async function paperApiFetch(
  path: string,
  init: RequestInit & { assertOk?: boolean } = {},
): Promise<Response> {
  if (import.meta.env?.DEV) {
    console.debug("[Paper Auth Client]", {
      path,
      hasToken: Boolean(getAuthToken()),
      credentials: "include",
    });
  }
  const { assertOk = true, headers: initHeaders, ...rest } = init;
  nautilusPaperWriteGuard(path, rest);
  return apiRequest(path, {
    credentials: "include",
    assertOk,
    ...rest,
    headers: {
      ...(rest.body != null ? { "Content-Type": "application/json" } : {}),
      ...(initHeaders as Record<string, string> | undefined),
    },
  });
}

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") || ct.includes("+json");
}

/** Parse paper API JSON; avoids Vite index.html parse errors on 404. */
export async function paperApiJson<T>(
  path: string,
  init: RequestInit & { assertOk?: boolean } = {},
): Promise<{ res: Response; data: T }> {
  const res = await paperApiFetch(path, { ...init, assertOk: false });
  if (!isJsonResponse(res)) {
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ");
    throw new Error(
      res.ok
        ? `Paper API returned non-JSON (${path})`
        : `Paper API error ${res.status} (${path}): ${snippet}`,
    );
  }
  const data = (await res.json()) as T;
  return { res, data };
}
