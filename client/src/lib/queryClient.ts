import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken, clearAuthStorage } from "./authToken";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

export async function apiRequest(
  url: string,
  options: RequestInit & { skipAuth?: boolean; assertOk?: boolean } = {},
): Promise<Response> {
  const { skipAuth = false, assertOk = true, headers: initHeaders, ...fetchInit } = options;
  const headers = new Headers(initHeaders as HeadersInit | undefined);
  if (!skipAuth) {
    for (const [k, v] of Object.entries(authHeaders())) {
      if (v) headers.set(k, v);
    }
  }
  const res = await fetch(url, {
    credentials: "include",
    ...fetchInit,
    headers,
  });
  if (assertOk) await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: { ...authHeaders() },
    });

    if (res.status === 401) {
      clearAuthStorage();
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
