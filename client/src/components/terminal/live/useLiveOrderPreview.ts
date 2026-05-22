import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  LiveOrderPreviewApiResponse,
  LiveOrderPreviewRequest,
  LiveOrderPreviewResult,
} from "./liveOrderPreviewTypes";

const NON_JSON_HINT =
  "Dry-run endpoint unavailable or misrouted. Check POST /api/live/order-preview on the API server.";

async function parseLiveOrderPreviewResponse(
  res: Response,
): Promise<LiveOrderPreviewApiResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    const snippet = text.trimStart().startsWith("<!")
      ? NON_JSON_HINT
      : text.slice(0, 120);
    throw new Error(
      `Live order preview returned non-JSON response (${res.status}). ${snippet}`,
    );
  }
  return (await res.json()) as LiveOrderPreviewApiResponse;
}

export function useLiveOrderPreview() {
  return useMutation({
    mutationKey: ["/api/live/order-preview"],
    mutationFn: async (
      request: LiveOrderPreviewRequest,
    ): Promise<LiveOrderPreviewResult> => {
      const res = await apiRequest("/api/live/order-preview", {
        method: "POST",
        body: JSON.stringify(request),
        assertOk: false,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      const json = await parseLiveOrderPreviewResponse(res);

      if (json.preview) {
        return json.preview;
      }

      if (!res.ok || !json.success) {
        throw new Error(
          json.message ??
            `Live order preview failed (${res.status})`,
        );
      }

      throw new Error("Invalid preview response from server.");
    },
  });
}

export function formatLivePreviewFetchError(err: unknown): {
  blockers: string[];
  readinessStatus: string;
} {
  const raw = err instanceof Error ? err.message : "Preview request failed";
  if (
    raw.includes("non-JSON") ||
    raw.includes("<!DOCTYPE") ||
    raw.toLowerCase().includes("<!doctype")
  ) {
    return {
      blockers: [NON_JSON_HINT],
      readinessStatus: "unavailable",
    };
  }
  return {
    blockers: [raw.slice(0, 200)],
    readinessStatus: "unavailable",
  };
}
