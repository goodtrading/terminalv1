import { getAuthToken } from "@/lib/authToken";
import { apiRequest } from "@/lib/queryClient";

/** Authenticated BingX API calls (cookie + Bearer). Never sends or stores API secrets. */
export async function bingxApiFetch(
  path: string,
  init: RequestInit & { assertOk?: boolean } = {},
): Promise<Response> {
  if (import.meta.env.DEV) {
    console.debug("[BingX Auth Client]", {
      path,
      hasToken: Boolean(getAuthToken()),
      credentials: "include",
    });
  }
  const { assertOk = true, headers: initHeaders, ...rest } = init;
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
