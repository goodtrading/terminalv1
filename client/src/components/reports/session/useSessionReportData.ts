import { apiUrl } from "../../../lib/apiBase";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTerminalState } from "@/hooks/useTerminalState";
import { fetchMarketCandles } from "@/lib/btcMarketBaseFetch";
import { buildSessionReportFromTerminalState } from "./buildSessionReportFromTerminalState";
import { resolveSessionNarrativeSource } from "./resolveSessionNarrativeSource";
import type {
  SessionNarrativeApiResponse,
  SessionExecutionNarrative,
} from "../execution/executionReportTypes";
import type { SessionReportResult, SessionTerminalInput } from "./sessionReportTypes";

const SESSION_CANDLE_INTERVAL = "15m";
const SESSION_CANDLE_LIMIT = 96;

export function useSessionReportData() {
  const {
    data: terminal,
    isLoading: terminalLoading,
    isError: terminalError,
    error: terminalErr,
  } = useTerminalState();

  const candlesQuery = useQuery({
    queryKey: ["reports-session-candles", "BTCUSDT", SESSION_CANDLE_INTERVAL, SESSION_CANDLE_LIMIT],
    queryFn: () => fetchMarketCandles("BTCUSDT", SESSION_CANDLE_INTERVAL, SESSION_CANDLE_LIMIT),
    enabled: !!terminal?.market,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const narrativeSource = resolveSessionNarrativeSource();

  const narrativeQuery = useQuery({
    queryKey: ["/api/reports/session-narrative", narrativeSource],
    queryFn: async (): Promise<SessionExecutionNarrative | null> => {
      const params = new URLSearchParams({ source: narrativeSource });
      const res = await fetch(apiUrl(`/api/reports/session-narrative?${params}`));
      if (!res.ok) return null;
      const body = (await res.json()) as SessionNarrativeApiResponse;
      return body.narrative ?? null;
    },
    staleTime: 12_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const report: SessionReportResult = useMemo(() => {
    const base = buildSessionReportFromTerminalState({
      terminal: terminal as SessionTerminalInput | undefined,
      candles: candlesQuery.data,
    });
    return {
      ...base,
      executionNarrative: narrativeQuery.data ?? null,
    };
  }, [terminal, candlesQuery.data, narrativeQuery.data]);

  const isLoading =
    terminalLoading ||
    (terminal != null && candlesQuery.isLoading) ||
    narrativeQuery.isLoading;

  return {
    report,
    isLoading,
    isError: terminalError,
    error: terminalErr,
    terminal,
    refetch: candlesQuery.refetch,
  };
}
