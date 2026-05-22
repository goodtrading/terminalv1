import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  LiveOrderSubmitApiResponse,
  LiveOrderSubmitRequest,
  LiveOrderSubmitResult,
} from "./liveOrderSubmitTypes";

const NON_JSON_HINT =
  "Live submit endpoint unavailable or misrouted. Check POST /api/live/order-submit on the API server.";

async function parseLiveOrderSubmitResponse(
  res: Response,
): Promise<LiveOrderSubmitApiResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    const snippet = text.trimStart().startsWith("<!")
      ? NON_JSON_HINT
      : text.slice(0, 120);
    throw new Error(
      `Live order submit returned non-JSON response (${res.status}). ${snippet}`,
    );
  }
  return (await res.json()) as LiveOrderSubmitApiResponse;
}

export function useLiveOrderSubmit() {
  return useMutation({
    mutationKey: ["/api/live/order-submit"],
    mutationFn: async (
      request: LiveOrderSubmitRequest,
    ): Promise<LiveOrderSubmitResult> => {
      const res = await apiRequest("/api/live/order-submit", {
        method: "POST",
        body: JSON.stringify(request),
        assertOk: false,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      const json = await parseLiveOrderSubmitResponse(res);

      if (json.result) {
        return json.result;
      }

      if (!res.ok || !json.success) {
        throw new Error(
          json.message ?? `Live order submit failed (${res.status})`,
        );
      }

      throw new Error("Invalid submit response from server.");
    },
  });
}
