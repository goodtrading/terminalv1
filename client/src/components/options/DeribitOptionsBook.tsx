import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { DeribitOptionsBookResponse, DeribitOptionBookRow, DeribitOptionSide } from "@shared/types/deribit-options";
import {
  buildOptionsZoneContext,
  getOptionZoneTags,
  getZoneRowClassName,
  getZoneTagBadgeKind,
  getZoneTagLabel,
  getZoneBadgeClassName,
  sortZoneTagsForDisplay,
  formatStrikeCompact,
  formatStrikeList,
  type OptionZoneTag,
  type OptionsZoneSummaryInput,
} from "./optionsZoneUtils";

type OptionsViewMode = "PRO" | "GT" | "BASIC";

// Debug flags
const OPTIONS_DERIVED_DEBUG = false;
const OPTIONS_INTEL_DEBUG = false;

// Local type for derived metrics per strike
type OptionsDerivedRow = DeribitOptionBookRow & {
  derived: {
    callOi: number;
    putOi: number;
    totalOi: number;
    callVolume: number;
    putVolume: number;
    totalVolume: number;
    callNotionalUsd: number;
    putNotionalUsd: number;
    totalNotionalUsd: number;
    distanceToSpotPct: number | null;
    dominance: "CALL_DOMINANT" | "PUT_DOMINANT" | "BALANCED";
    dominanceRatio: number | null;
    liquidityScore: number;
    hasActiveMarket: boolean;
  };
};

// Local type for options intelligence
type OptionsIntel = {
  totalCallOi: number;
  totalPutOi: number;
  totalOi: number;
  callPutRatio: number | null;
  regime: "CALL HEAVY" | "PUT HEAVY" | "BALANCED" | "NO DATA";
  structuralBias: "RESISTANCE ABOVE" | "SUPPORT BELOW" | "PINNING / MAGNET" | "MIXED / TRANSITION" | "NO DATA";
  keySupport: number | null;
  keyResistance: number | null;
  transitionZone: string;
};

// Badge types for structural indicators
type Badge = {
  label: string;
  kind:
    | "atm"
    | "callWall"
    | "putWall"
    | "maxVol"
    | "maxOi"
    | "magnet"
    | "flip"
    | "transition"
    | "callDom"
    | "putDom"
    | "highOi"
    | "support"
    | "resistance"
    | "active";
  value?: string;
  priority: number; // 1 = highest priority
};

type RowBadges = {
  center: Badge[];
  call: Badge[];
  put: Badge[];
};

const CACHE_TTL_MS = 15000; // 15 seconds cache

// BadgePill component for structural indicators
const BadgePill = ({ badge }: { badge: Badge }) => {
  const getBadgeStyles = () => {
    switch (badge.kind) {
      case "atm":
        return "bg-blue-500/20 text-blue-300 border border-blue-500/30";
      case "callWall":
        return "bg-green-500/20 text-green-300 border border-green-500/30";
      case "putWall":
        return "bg-red-500/20 text-red-300 border border-red-500/30";
      case "maxVol":
      case "maxOi":
        return "bg-violet-500/20 text-violet-300 border border-violet-500/30";
      case "magnet":
        return "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30";
      case "flip":
      case "transition":
        return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
      case "callDom":
        return "bg-green-600/20 text-green-400 border border-green-600/30";
      case "putDom":
        return "bg-red-600/20 text-red-400 border border-red-600/30";
      case "highOi":
        return "bg-purple-500/20 text-purple-300 border border-purple-500/30";
      case "support":
        return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      case "resistance":
        return "bg-orange-500/20 text-orange-300 border border-orange-500/30";
      case "active":
        return "bg-gray-500/20 text-gray-300 border border-gray-500/30";
      default:
        return "bg-terminal-panel/50 text-terminal-muted border border-terminal-border/30";
    }
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap",
      getBadgeStyles()
    )}>
      <span>{badge.label}</span>
      {badge.value && (
        <>
          <span className="text-current/60">·</span>
          <span>{badge.value}</span>
        </>
      )}
    </span>
  );
};

const ZoneTagPill = ({ tag }: { tag: OptionZoneTag }) => {
  const kind = getZoneTagBadgeKind(tag);
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap leading-none",
        getZoneBadgeClassName(kind)
      )}
    >
      {getZoneTagLabel(tag)}
    </span>
  );
};

const ZoneTagsCell = ({ tags }: { tags: OptionZoneTag[] }) => {
  const sorted = sortZoneTagsForDisplay(tags);
  if (!sorted.length) {
    return <span className="text-terminal-muted/50 text-[10px]">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-0.5 justify-center max-w-[140px] mx-auto">
      {sorted.map((tag) => (
        <ZoneTagPill key={tag} tag={tag} />
      ))}
    </div>
  );
};


// Normalized view models for consistent data structure
type OptionSideViewModel = {
  instrumentName: string | null
  oi: number | null
  delta: number | null
  bidIv: number | null
  askIv: number | null
  bid: number | null
  ask: number | null
  bidSize: number | null
  askSize: number | null
  tags: string[]
}

type OptionRowViewModel = {
  strike: number
  strikeLabel: string
  distancePct: number | null
  isATM: boolean
  isCallWall: boolean
  isPutWall: boolean
  isMaxVolume: boolean
  zoneTags: OptionZoneTag[]
  call: OptionSideViewModel | null
  put: OptionSideViewModel | null
}

// Unified column definition for all modes
type ColumnDef = {
  id: string
  header: string
  width: number
  align?: 'left' | 'center' | 'right'
  visible: boolean
  renderCell: (row: OptionRowViewModel) => React.ReactNode
}


export default function DeribitOptionsBook() {
  const [currency, setCurrency] = useState<"BTC" | "ETH">("BTC");
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [filter, setFilter] = useState<"ALL" | "ATM" | "RANGE" | "MOVEMENT" | "DISTANCE">("ATM");
  // Fixed to PRO mode - view toggle removed
const viewMode: OptionsViewMode = "PRO";

  // Main data fetching
  const { data: bookData, isLoading, error } = useQuery<DeribitOptionsBookResponse>({
    queryKey: ["deribit-options-book", currency, selectedExpiry],
    queryFn: async () => {
      const params = new URLSearchParams({ currency });
      if (selectedExpiry) params.append("expiry", selectedExpiry);
      
      const response = await fetch(`/api/options/deribit/book?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch options book");
      }
      const data = await response.json();
      console.log("[OPTIONS_UI_RESPONSE_RAW]", data);
      console.log("[OPTIONS_UI_UNDERLYING]", data?.underlyingPrice, typeof data?.underlyingPrice);
      return data;
    },
    refetchInterval: CACHE_TTL_MS,
    staleTime: CACHE_TTL_MS,
  });

  // Get visible instrument names for enrichment (will be added after derivedRows is defined)

  // Auto-select first expiry when data loads and reset on currency change
  useEffect(() => {
    if (bookData?.expiries.length) {
      if (!selectedExpiry || !bookData.expiries.includes(selectedExpiry)) {
        setSelectedExpiry(bookData.expiries[0]);
      }
    }
  }, [bookData, selectedExpiry]);

  // Reset selected expiry when currency changes
  useEffect(() => {
    setSelectedExpiry("");
  }, [currency]);

  const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "";
    if (value === 0) return "";
    return value.toFixed(decimals);
  };

  const formatPrice = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "";
    if (value === 0) return "";
    if (value >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(value < 1 ? 4 : 2);
  };

  const formatPercent = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "";
    return (value * 100).toFixed(decimals) + "%";
  };

  const formatNotional = (value: number | null | undefined): string => {
    if (!value || value === 0) return "—";
    
    const absValue = Math.abs(value);
    
    if (absValue >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(1)}B`;
    } else if (absValue >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    } else if (absValue >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    } else {
      return `$${Math.round(value)}`;
    }
  };

  const formatDistance = (value: number | null | undefined): string => {
    if (!value || value === 0) return "0.00%";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  // Safe IV formatting helper
  const formatIv = (value: number | null | undefined): string => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";

    // Deribit puede entregar IV ya en porcentaje.
    // Si n > 10, asumir que ya está en porcentaje.
    // Si n <= 10, asumir decimal y multiplicar.
    const iv = n > 10 ? n : n * 100;

    return `${iv.toFixed(1)}%`;
  };

  // Helper to extract strike from different data formats
  const extractStrike = (value: any): number | null => {
    if (value == null) return null;

    if (typeof value === "number" || typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    const candidates = [
      value.strike,
      value.row?.strike,
      value.option?.strike,
    ];

    for (const candidate of candidates) {
      const n = Number(candidate);
      if (Number.isFinite(n)) return n;
    }

    return null;
  };

  // Basic signal helper for GT mode
  const getBasicSignal = (row: any, institutionalData: any): string | null => {
    const strike = Number(row?.strike);
    if (!Number.isFinite(strike)) return null;

    const atm = extractStrike(institutionalData?.atmStrike);
    const callWall = extractStrike(institutionalData?.callWall);
    const putWall = extractStrike(institutionalData?.putWall);
    const maxVolume = extractStrike(institutionalData?.maxVolumeStrike);

    // Debug log para fila 80k
    if (strike === 80000) {
      console.log("[GT_SIGNAL_80K_DEBUG]", {
        strike,
        rawCallWall: institutionalData?.callWall,
        extractedCallWall: callWall,
        signal: (() => {
          if (atm != null && strike === atm) return "ATM";
          if (callWall != null && strike === callWall) return "CALL WALL";
          if (putWall != null && strike === putWall) return "PUT WALL";
          if (maxVolume != null && strike === maxVolume) return "MAX VOL";
          return null;
        })()
      });
    }

    // Prioridad: 1. ATM, 2. CALL WALL, 3. PUT WALL, 4. MAX VOL
    if (atm != null && strike === atm) return "ATM";
    if (callWall != null && strike === callWall) return "CALL WALL";
    if (putWall != null && strike === putWall) return "PUT WALL";
    if (maxVolume != null && strike === maxVolume) return "MAX VOL";

    return null;
  };

  const formatBidAsk = (bid: number | null | undefined, ask: number | null | undefined): string => {
    const bidStr = bid !== null && bid !== undefined ? formatPrice(bid) : "-";
    const askStr = ask !== null && ask !== undefined ? formatPrice(ask) : "-";
    return `${bidStr} / ${askStr}`;
  };

  
  const formatExpiryDisplay = (expiry: string): string => {
    // Convert "28APR26" to "28 APR 26" for display
    if (!expiry || expiry.length !== 7) return expiry;
    const day = expiry.slice(0, 2);
    const month = expiry.slice(2, 5);
    const year = expiry.slice(5, 7);
    return `${day} ${month} ${year}`;
  };

  // Institutional calculations with useMemo
  const institutionalData = useMemo(() => {
    if (!bookData?.rows.length) {
      console.log("[INSTITUTIONAL_DEBUG] No rows available");
      return {
        atmStrike: null,
        callWall: null,
        putWall: null,
        maxVolumeStrike: null,
        callWallOI: 0,
        putWallOI: 0,
        maxVolume: 0
      };
    }

    console.log("[INSTITUTIONAL_DEBUG] Data available", {
      rowsLength: bookData.rows.length,
      underlyingPrice: bookData.underlyingPrice,
      sampleRow: bookData.rows[0]
    });

    const underlyingPrice = bookData.underlyingPrice;
    
    // Find ATM strike (closest to underlying) - only if we have underlying price
    let atmStrike = null;
    if (underlyingPrice && Number.isFinite(underlyingPrice)) {
      const atmRow = bookData.rows.reduce((closest, row) => {
        const currentDistance = Math.abs(row.strike - underlyingPrice);
        const closestDistance = Math.abs(closest.strike - underlyingPrice);
        return currentDistance < closestDistance ? row : closest;
      });
      atmStrike = atmRow.strike;
      console.log("[INSTITUTIONAL_DEBUG] ATM calculated", { underlyingPrice, atmStrike });
    } else {
      console.log("[INSTITUTIONAL_DEBUG] No valid underlyingPrice for ATM calculation");
    }

    // Find call wall (highest call OI)
    let callWall = null;
    let callWallOI = 0;
    const callWallRow = bookData.rows.reduce((wall, row) => {
      const currentOI = row.call?.openInterest || 0;
      const wallOI = wall.call?.openInterest || 0;
      if (currentOI > wallOI) {
        callWall = row.strike;
        callWallOI = currentOI;
      }
      return currentOI > wallOI ? row : wall;
    });

    // Find put wall (highest put OI)
    let putWall = null;
    let putWallOI = 0;
    const putWallRow = bookData.rows.reduce((wall, row) => {
      const currentOI = row.put?.openInterest || 0;
      const wallOI = wall.put?.openInterest || 0;
      if (currentOI > wallOI) {
        putWall = row.strike;
        putWallOI = currentOI;
      }
      return currentOI > wallOI ? row : wall;
    });

    // Find max volume strike
    let maxVolumeStrike: any = null;
    let maxVolume = 0;
    bookData.rows.forEach(row => {
      const currentVolume = (row.call?.volume24h || 0) + (row.put?.volume24h || 0);
      if (currentVolume > maxVolume) {
        maxVolumeStrike = row;
        maxVolume = currentVolume;
      }
    });

    const result = {
      atmStrike,
      callWall,
      putWall,
      maxVolumeStrike: maxVolumeStrike?.strike || null,
      callWallOI,
      putWallOI,
      maxVolume
    };

    console.log("[INSTITUTIONAL_DEBUG] Calculated data", result);
    return result;
  }, [bookData]);

  const isAtmStrike = (strike: number): boolean => {
    return institutionalData.atmStrike === strike;
  };

  const isCallWall = (strike: number): boolean => {
    return institutionalData.callWall === strike;
  };

  const isPutWall = (strike: number): boolean => {
    return institutionalData.putWall === strike;
  };

  // Calculate derived metrics for each row
  const derivedRows = useMemo(() => {
    if (!bookData?.rows.length) return [];

    // First pass: calculate all derived metrics
    const rowsWithDerived = bookData.rows.map(row => {
      // Basic OI calculations
      const callOi = Number(row.call?.openInterest) || 0;
      const putOi = Number(row.put?.openInterest) || 0;
      const totalOi = callOi + putOi;

      // Volume calculations
      const callVolume = Number(row.call?.volume24h) || 0;
      const putVolume = Number(row.put?.volume24h) || 0;
      const totalVolume = callVolume + putVolume;

      // Notional USD calculations
      const callNotionalUsd = callOi * row.strike;
      const putNotionalUsd = putOi * row.strike;
      const totalNotionalUsd = callNotionalUsd + putNotionalUsd;

      // Distance to spot percentage
      let distanceToSpotPct: number | null = null;
      if (bookData.underlyingPrice && Number.isFinite(bookData.underlyingPrice)) {
        distanceToSpotPct = ((row.strike - bookData.underlyingPrice) / bookData.underlyingPrice) * 100;
      }

      // Dominance calculation
      let dominance: "CALL_DOMINANT" | "PUT_DOMINANT" | "BALANCED" = "BALANCED";
      if (callOi > putOi * 1.25) {
        dominance = "CALL_DOMINANT";
      } else if (putOi > callOi * 1.25) {
        dominance = "PUT_DOMINANT";
      }

      // Dominance ratio
      let dominanceRatio: number | null = null;
      const minOi = Math.min(callOi, putOi);
      const maxOi = Math.max(callOi, putOi);
      if (minOi > 0) {
        dominanceRatio = maxOi / minOi;
      } else if (minOi === 0 && maxOi > 0) {
        dominanceRatio = Infinity;
      }

      // Active market check
      const hasActiveMarket = (
        (row.call?.bidPrice && Number.isFinite(row.call.bidPrice) && row.call.bidPrice > 0) ||
        (row.call?.askPrice && Number.isFinite(row.call.askPrice) && row.call.askPrice > 0) ||
        (row.put?.bidPrice && Number.isFinite(row.put.bidPrice) && row.put.bidPrice > 0) ||
        (row.put?.askPrice && Number.isFinite(row.put.askPrice) && row.put.askPrice > 0)
      );

      // Liquidity score (0-100)
      let liquidityScore = 0;
      
      // Find max values for normalization
      const maxTotalOi = Math.max(...bookData.rows.map(r => 
        (Number(r.call?.openInterest) || 0) + (Number(r.put?.openInterest) || 0)
      ));
      const maxTotalVolume = Math.max(...bookData.rows.map(r => 
        (Number(r.call?.volume24h) || 0) + (Number(r.put?.volume24h) || 0)
      ));

      // Base score from OI (0-40 points)
      if (maxTotalOi > 0) {
        liquidityScore += (totalOi / maxTotalOi) * 40;
      }

      // Base score from Volume (0-40 points)
      if (maxTotalVolume > 0) {
        liquidityScore += (totalVolume / maxTotalVolume) * 40;
      }

      // Active market bonus (0-20 points)
      if (hasActiveMarket) {
        liquidityScore += 20;
      }

      // Clamp to 0-100
      liquidityScore = Math.min(100, Math.max(0, liquidityScore));

      return {
        ...row,
        derived: {
          callOi,
          putOi,
          totalOi,
          callVolume,
          putVolume,
          totalVolume,
          callNotionalUsd,
          putNotionalUsd,
          totalNotionalUsd,
          distanceToSpotPct,
          dominance,
          dominanceRatio,
          liquidityScore,
          hasActiveMarket
        }
      } as OptionsDerivedRow;
    });

    if (OPTIONS_DERIVED_DEBUG) {
      console.log("[OPTIONS_DERIVED_DEBUG]", {
        underlyingPrice: bookData.underlyingPrice,
        rows: rowsWithDerived.length,
        sample: rowsWithDerived.slice(0, 3).map(r => ({
          strike: r.strike,
          derived: r.derived
        }))
      });
    }

    return rowsWithDerived;
  }, [bookData]);

  const zoneSummaryInput = useMemo((): OptionsZoneSummaryInput | undefined => {
    const raw = bookData as DeribitOptionsBookResponse & OptionsZoneSummaryInput;
    if (!raw) return undefined;
    const hasExternal =
      raw.gammaFlip != null ||
      raw.flipZone != null ||
      raw.transitionZoneStart != null ||
      raw.transitionZoneEnd != null;
    if (!hasExternal) return undefined;
    return {
      gammaFlip: raw.gammaFlip,
      flipZone: raw.flipZone,
      transitionZoneStart: raw.transitionZoneStart,
      transitionZoneEnd: raw.transitionZoneEnd,
    };
  }, [bookData]);

  const zoneContext = useMemo(() => {
    const zoneRows = derivedRows.map((row) => ({
      strike: row.strike,
      callOi: row.derived.callOi,
      putOi: row.derived.putOi,
      totalOi: row.derived.totalOi,
      totalVolume: row.derived.totalVolume,
    }));
    return buildOptionsZoneContext(
      zoneRows,
      bookData?.underlyingPrice ?? null,
      zoneSummaryInput
    );
  }, [derivedRows, bookData?.underlyingPrice, zoneSummaryInput]);

  // Get visible instrument names for enrichment
  const visibleInstrumentNames = useMemo(() => {
    if (!derivedRows.length) return [];
    
    const instruments = new Set<string>();
    
    derivedRows.forEach(row => {
      if (row.call?.instrumentName) {
        instruments.add(row.call.instrumentName);
      }
      if (row.put?.instrumentName) {
        instruments.add(row.put.instrumentName);
      }
    });
    
    return Array.from(instruments).slice(0, 60); // Safety limit
  }, [derivedRows]);

  // Ticker enrichment query
  const { data: tickersData, isLoading: isEnriching } = useQuery<{
    generatedAt: number;
    tickers: Record<string, any>;
    errors: string[];
  }>({
    queryKey: ["deribit-option-tickers", visibleInstrumentNames.join("|")],
    queryFn: async () => {
      if (visibleInstrumentNames.length === 0) {
        return { generatedAt: Date.now(), tickers: {}, errors: [] };
      }
      
      const response = await fetch("/api/options/deribit/tickers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instrumentNames: visibleInstrumentNames
        }),
      });
      
      if (!response.ok) {
        console.warn("Ticker enrichment failed, using base data");
        return { generatedAt: Date.now(), tickers: {}, errors: ["Failed to fetch tickers"] };
      }
      
      return response.json();
    },
    enabled: visibleInstrumentNames.length > 0,
    refetchInterval: 20000,
    staleTime: 15000,
  });

  // Helper function to enrich side data with ticker data
  const enrichSide = (side: any, tickerMap: Record<string, any>) => {
    if (!side) return null;
    const ticker = tickerMap[side.instrumentName];

    return {
      ...side,
      delta: side.delta ?? ticker?.delta ?? null,
      bidIv: side.bidIv ?? ticker?.bidIv ?? null,
      askIv: side.askIv ?? ticker?.askIv ?? null,
      markIv: side.markIv ?? ticker?.markIv ?? null,
      bidSize: side.bidSize ?? ticker?.bidSize ?? null,
      askSize: side.askSize ?? ticker?.askSize ?? null,
      markPrice: side.markPrice ?? ticker?.markPrice ?? null
    };
  };

  // Create enriched rows with ticker data
  const enrichedRows = useMemo(() => {
    if (!tickersData?.tickers || Object.keys(tickersData.tickers).length === 0) {
      console.log("[OPTIONS_DEBUG_ENRICH] No ticker data, using derivedRows", { 
        tickersData: tickersData?.tickers ? Object.keys(tickersData.tickers).length : 0,
        derivedRowsCount: derivedRows.length 
      });
      return derivedRows;
    }

    const enriched = derivedRows.map(row => {
      const enrichedRow = {
        ...row,
        call: enrichSide(row.call, tickersData.tickers),
        put: enrichSide(row.put, tickersData.tickers)
      };

      // Debug log for first row with data
      if (row.strike === 77000) {
        console.log("[OPTIONS_DEBUG_ROW_BEFORE]", {
          strike: row.strike,
          call: {
            instrumentName: row.call?.instrumentName,
            delta: row.call?.delta,
            bidIv: row.call?.bidIv,
            askIv: row.call?.askIv,
            bidSize: row.call?.bidSize,
            askSize: row.call?.askSize
          },
          put: {
            instrumentName: row.put?.instrumentName,
            delta: row.put?.delta,
            bidIv: row.put?.bidIv,
            askIv: row.put?.askIv,
            bidSize: row.put?.bidSize,
            askSize: row.put?.askSize
          }
        });

        console.log("[OPTIONS_DEBUG_ROW_AFTER]", {
          strike: enrichedRow.strike,
          call: {
            instrumentName: enrichedRow.call?.instrumentName,
            delta: enrichedRow.call?.delta,
            bidIv: enrichedRow.call?.bidIv,
            askIv: enrichedRow.call?.askIv,
            bidSize: enrichedRow.call?.bidSize,
            askSize: enrichedRow.call?.askSize
          },
          put: {
            instrumentName: enrichedRow.put?.instrumentName,
            delta: enrichedRow.put?.delta,
            bidIv: enrichedRow.put?.bidIv,
            askIv: enrichedRow.put?.askIv,
            bidSize: enrichedRow.put?.bidSize,
            askSize: enrichedRow.put?.askSize
          }
        });
      }

      return enrichedRow;
    });

    console.log("[OPTIONS_DEBUG_ENRICH] Enrichment completed", {
      enrichedRowsCount: enriched.length,
      tickersAvailable: Object.keys(tickersData.tickers).length,
      sampleTicker: Object.values(tickersData.tickers)[0]
    });

    return enriched;
  }, [derivedRows, tickersData]);

  // Calculate column visibility based on enriched data
  const columnVisibility = useMemo(() => {
    const hasDelta = enrichedRows.some(row => 
      (row.call?.delta != null && row.call?.delta !== 0) || 
      (row.put?.delta != null && row.put?.delta !== 0)
    );
    
    const hasIv = enrichedRows.some(row => 
      (row.call?.bidIv != null || row.call?.askIv != null || row.call?.markIv != null) ||
      (row.put?.bidIv != null || row.put?.askIv != null || row.put?.markIv != null)
    );
    
    const hasSize = enrichedRows.some(row => 
      (row.call?.bidSize != null || row.call?.askSize != null) ||
      (row.put?.bidSize != null || row.put?.askSize != null)
    );

    return { hasDelta, hasIv, hasSize };
  }, [enrichedRows]);

  // Create normalized view rows for consistent UI rendering
  const viewRows = useMemo((): OptionRowViewModel[] => {
    return enrichedRows.map(row => {
      // Badges mínimos y seguros para evitar TDZ
      const safeBadges = {
        call: [],
        center: [],
        put: []
      };
      
      // Convert call side
      const call: OptionSideViewModel | null = row.call ? {
        instrumentName: row.call.instrumentName || null,
        oi: row.call.openInterest || null,
        delta: row.call.delta || null,
        bidIv: row.call.bidIv || null,
        askIv: row.call.askIv || null,
        bid: row.call.bidPrice || null,
        ask: row.call.askPrice || null,
        bidSize: row.call.bidSize || null,
        askSize: row.call.askSize || null,
        tags: []
      } : null;

      // Convert put side
      const put: OptionSideViewModel | null = row.put ? {
        instrumentName: row.put.instrumentName || null,
        oi: row.put.openInterest || null,
        delta: row.put.delta || null,
        bidIv: row.put.bidIv || null,
        askIv: row.put.askIv || null,
        bid: row.put.bidPrice || null,
        ask: row.put.askPrice || null,
        bidSize: row.put.bidSize || null,
        askSize: row.put.askSize || null,
        tags: []
      } : null;

      // Create view model row
      const viewRow: OptionRowViewModel = {
        strike: row.strike,
        strikeLabel: formatPrice(row.strike),
        distancePct: row.derived.distanceToSpotPct || null,
        isATM: isAtmStrike(row.strike),
        isCallWall: row.strike === institutionalData.callWall,
        isPutWall: row.strike === institutionalData.putWall,
        isMaxVolume: row.strike === institutionalData.maxVolumeStrike && row.strike !== institutionalData.atmStrike,
        zoneTags: getOptionZoneTags(row.strike, zoneContext),
        call,
        put
      };

      // Debug log for ATM strike
      if (viewRow.isATM) {
        console.log("[OPTIONS_DEBUG_VIEW_ROW]", {
          strike: viewRow.strike,
          call: viewRow.call ? {
            oi: viewRow.call.oi,
            delta: viewRow.call.delta,
            bidIv: viewRow.call.bidIv,
            askIv: viewRow.call.askIv,
            bidSize: viewRow.call.bidSize,
            askSize: viewRow.call.askSize,
            tags: viewRow.call.tags
          } : null,
          put: viewRow.put ? {
            oi: viewRow.put.oi,
            delta: viewRow.put.delta,
            bidIv: viewRow.put.bidIv,
            askIv: viewRow.put.askIv,
            bidSize: viewRow.put.bidSize,
            askSize: viewRow.put.askSize,
            tags: viewRow.put.tags
          } : null
        });
      }

      return viewRow;
    });
  }, [enrichedRows, institutionalData, isAtmStrike, zoneContext]);

  // Column definitions for each mode
  const getSimpleColumns = (): ColumnDef[] => {
    return [
      {
        id: 'call-oi',
        header: 'OI',
        width: 80,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-2 text-xs font-mono">
            <div className="flex flex-col gap-1 items-end">
              <span className="text-green-300 font-medium text-sm">
                {row.call?.oi ? formatNumber(row.call.oi) : "—"}
              </span>
              <div className="flex flex-wrap gap-1 justify-end">
                {row.call?.tags.map((tag, idx) => (
                  <BadgePill key={idx} badge={{ label: tag, kind: tag.toLowerCase() as any, priority: 1 }} />
                ))}
              </div>
            </div>
          </div>
        )
      },
      {
        id: 'call-bid-ask',
        header: 'Bid/Ask',
        width: 100,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-2 text-xs font-mono text-green-400">
            <div className="text-xs">
              {row.call?.bid && row.call?.ask ? `${formatPrice(row.call.bid)}/${formatPrice(row.call.ask)}` : "—"}
            </div>
          </div>
        )
      },
      {
        id: 'strike',
        header: 'Strike',
        width: 120,
        align: 'center',
        visible: true,
        renderCell: (row) => (
          <div className={cn(
            "px-2 py-2 text-center relative",
            row.isATM && "bg-blue-500/10 border-l-2 border-r-2 border-blue-400/40"
          )}>
            <div className={cn(
              "text-base font-bold font-mono",
              row.isATM ? "text-blue-400" : "text-white"
            )}>
              {row.strikeLabel}
            </div>
            <div className="text-xs text-blue-200">
              {row.distancePct ? formatDistance(row.distancePct) : "—"}
            </div>
            <div className="flex flex-wrap gap-1 justify-center">
              {row.isATM && <BadgePill badge={{ label: "ATM", kind: "atm", priority: 1 }} />}
              {row.isCallWall && <BadgePill badge={{ label: "CALL WALL", kind: "callWall", priority: 2 }} />}
              {row.isPutWall && <BadgePill badge={{ label: "PUT WALL", kind: "putWall", priority: 2 }} />}
              {row.isMaxVolume && <BadgePill badge={{ label: "MAX VOL", kind: "maxVol", priority: 3 }} />}
            </div>
          </div>
        )
      },
      {
        id: 'put-bid-ask',
        header: 'Bid/Ask',
        width: 100,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-2 text-xs font-mono text-red-400">
            <div className="text-xs">
              {row.put?.bid && row.put?.ask ? `${formatPrice(row.put.bid)}/${formatPrice(row.put.ask)}` : "—"}
            </div>
          </div>
        )
      },
      {
        id: 'put-oi',
        header: 'OI',
        width: 80,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-2 text-xs font-mono">
            <div className="flex flex-col gap-1 items-start">
              <span className="text-red-300 font-medium text-sm">
                {row.put?.oi ? formatNumber(row.put.oi) : "—"}
              </span>
              <div className="flex flex-wrap gap-1 justify-start">
                {row.put?.tags.map((tag, idx) => (
                  <BadgePill key={idx} badge={{ label: tag, kind: tag.toLowerCase() as any, priority: 1 }} />
                ))}
              </div>
            </div>
          </div>
        )
      }
    ];
  };

  const getProColumns = (): ColumnDef[] => {
    const hasDelta = columnVisibility.hasDelta;
    const hasIv = columnVisibility.hasIv;
    const hasSize = columnVisibility.hasSize;

    const columns: ColumnDef[] = [
      {
        id: 'call-oi',
        header: 'OI',
        width: 80,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono border-r border-terminal-border/20">
            <div className="flex flex-col gap-1 items-end">
              <span className="text-green-300">
                {row.call?.oi ? formatNumber(row.call.oi) : "—"}
              </span>
              <div className="flex flex-wrap gap-1 justify-end">
                {row.call?.tags.map((tag, idx) => (
                  <BadgePill key={idx} badge={{ label: tag, kind: tag.toLowerCase() as any, priority: 1 }} />
                ))}
              </div>
            </div>
          </div>
        )
      }
    ];

    if (hasDelta) {
      columns.push({
        id: 'call-delta',
        header: 'Δ',
        width: 60,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono text-green-400/60 border-r border-terminal-border/20">
            {row.call?.delta ? formatNumber(row.call.delta, 3) : "—"}
          </div>
        )
      });
    }

    if (hasIv) {
      columns.push({
        id: 'call-bid-iv',
        header: 'IV Bid',
        width: 80,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono text-green-400/60 border-r border-terminal-border/20">
            {formatIv(row.call?.bidIv)}
          </div>
        )
      });
    }

    columns.push({
      id: 'call-bid',
      header: 'Bid',
      width: 80,
      align: 'right',
      visible: true,
      renderCell: (row) => (
        <div className="text-right px-3 py-1.5 text-xs font-mono text-green-400 font-medium border-r border-terminal-border/20">
          {row.call?.bid ? formatPrice(row.call.bid) : "—"}
        </div>
      )
    });

    columns.push({
      id: 'call-ask',
      header: 'Ask',
      width: 80,
      align: 'right',
      visible: true,
      renderCell: (row) => (
        <div className="text-right px-3 py-1.5 text-xs font-mono text-green-400 font-medium border-r border-terminal-border/20">
          {row.call?.ask ? formatPrice(row.call.ask) : "—"}
        </div>
      )
    });

    if (hasIv) {
      columns.push({
        id: 'call-ask-iv',
        header: 'IV Ask',
        width: 80,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono text-green-400/60 border-r border-terminal-border/20">
            {formatIv(row.call?.askIv)}
          </div>
        )
      });
    }

    if (hasSize) {
      columns.push({
        id: 'call-size',
        header: 'Size',
        width: 80,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono text-green-400/70 border-r border-terminal-border/20">
            {row.call?.bidSize ? formatNumber(row.call.bidSize) : "—"}
          </div>
        )
      });
    }

    // Strike column
    columns.push({
      id: 'strike',
      header: 'Ejecución',
      width: 100,
      align: 'center',
      visible: true,
      renderCell: (row) => (
        <div className="px-2 py-1.5 text-center border-r border-terminal-border/20">
          <div className={cn(
            "text-sm font-bold font-mono",
            row.zoneTags.includes("ATM") ? "text-blue-400" : "text-white/90"
          )}>
            {row.strikeLabel}
          </div>
          {row.distancePct != null && (
            <div className="text-[9px] text-terminal-muted/80 font-mono mt-0.5">
              {formatDistance(row.distancePct)}
            </div>
          )}
        </div>
      )
    });

    columns.push({
      id: 'zones',
      header: 'Zones',
      width: 130,
      align: 'center',
      visible: true,
      renderCell: (row) => (
        <div className="px-1.5 py-1.5 text-center border-r border-terminal-border/20">
          <ZoneTagsCell tags={row.zoneTags} />
        </div>
      )
    });

    // Put columns
    if (hasSize) {
      columns.push({
        id: 'put-size',
        header: 'Size',
        width: 80,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-1.5 text-xs font-mono text-red-400/70 border-r border-terminal-border/20">
            {row.put?.askSize ? formatNumber(row.put.askSize) : "—"}
          </div>
        )
      });
    }

    if (hasIv) {
      columns.push({
        id: 'put-bid-iv',
        header: 'IV Bid',
        width: 80,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-1.5 text-xs font-mono text-red-400/60 border-r border-terminal-border/20">
            {formatIv(row.put?.bidIv)}
          </div>
        )
      });
    }

    columns.push({
      id: 'put-bid',
      header: 'Bid',
      width: 80,
      align: 'left',
      visible: true,
      renderCell: (row) => (
        <div className="text-left px-3 py-1.5 text-xs font-mono text-red-400 font-medium border-r border-terminal-border/20">
          {row.put?.bid ? formatPrice(row.put.bid) : "—"}
        </div>
      )
    });

    columns.push({
      id: 'put-ask',
      header: 'Ask',
      width: 80,
      align: 'left',
      visible: true,
      renderCell: (row) => (
        <div className="text-left px-3 py-1.5 text-xs font-mono text-red-400 font-medium border-r border-terminal-border/20">
          {row.put?.ask ? formatPrice(row.put.ask) : "—"}
        </div>
      )
    });

    if (hasIv) {
      columns.push({
        id: 'put-ask-iv',
        header: 'IV Ask',
        width: 80,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-1.5 text-xs font-mono text-red-400/60 border-r border-terminal-border/20">
            {formatIv(row.put?.askIv)}
          </div>
        )
      });
    }

    if (hasDelta) {
      columns.push({
        id: 'put-delta',
        header: 'Δ',
        width: 60,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-1.5 text-xs font-mono text-red-400/60 border-r border-terminal-border/20">
            {row.put?.delta ? formatNumber(row.put.delta, 3) : "—"}
          </div>
        )
      });
    }

    columns.push({
      id: 'put-oi',
      header: 'OI',
      width: 80,
      align: 'left',
      visible: true,
      renderCell: (row) => (
        <div className="text-left px-3 py-1.5 text-xs font-mono">
          <div className="flex flex-col gap-1 items-start">
            <span className="text-red-300">
              {row.put?.oi ? formatNumber(row.put.oi) : "—"}
            </span>
            <div className="flex flex-wrap gap-1 justify-start">
              {row.put?.tags.map((tag, idx) => (
                <BadgePill key={idx} badge={{ label: tag, kind: tag.toLowerCase() as any, priority: 1 }} />
              ))}
            </div>
          </div>
        </div>
      )
    });

    return columns;
  };

  const getGtColumns = (): ColumnDef[] => {
    return [
      {
        id: 'call-oi',
        header: 'OI',
        width: 80,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono border-r border-terminal-border/20">
            <span className="text-green-300 font-medium">
              {row.call?.oi ? formatNumber(row.call.oi) : "—"}
            </span>
          </div>
        )
      },
      {
        id: 'call-notional',
        header: 'Notional',
        width: 100,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono text-green-200 border-r border-terminal-border/20">
            {formatNotional(row.call?.oi ? row.call.oi * row.strike : 0)}
          </div>
        )
      },
      {
        id: 'call-bid-ask',
        header: 'Bid/Ask',
        width: 100,
        align: 'right',
        visible: true,
        renderCell: (row) => (
          <div className="text-right px-3 py-1.5 text-xs font-mono text-green-400 border-r border-terminal-border/20">
            <div className="text-xs">
              {row.call?.bid && row.call?.ask ? `${formatPrice(row.call.bid)}/${formatPrice(row.call.ask)}` : "—"}
            </div>
          </div>
        )
      },
      {
        id: 'strike',
        header: 'Strike',
        width: 80,
        align: 'center',
        visible: true,
        renderCell: (row) => (
          <div className={cn(
            "px-2 py-1.5 text-center border-r border-terminal-border/20 relative",
            row.isATM && "bg-blue-500/10 border-l-2 border-r-2 border-blue-400/40"
          )}>
            <div className={cn(
              "text-sm font-bold font-mono",
              row.isATM ? "text-blue-400" : "text-white"
            )}>
              {row.strikeLabel}
            </div>
          </div>
        )
      },
      {
        id: 'distance',
        header: 'Dist %',
        width: 80,
        align: 'center',
        visible: true,
        renderCell: (row) => (
          <div className="px-2 py-1.5 text-center border-r border-terminal-border/20">
            <div className="text-xs text-blue-200">
              {row.distancePct ? formatDistance(row.distancePct) : "—"}
            </div>
          </div>
        )
      },
      {
        id: 'signal',
        header: 'Signal',
        width: 100,
        align: 'center',
        visible: true,
        renderCell: (row) => (
          <div className="px-2 py-1.5 text-center border-r border-terminal-border/20">
            {(() => {
              const signal = getBasicSignal(row, institutionalData);
              return signal ? (
                <span className={cn(
                  "text-xs font-bold px-2 py-1 rounded",
                  signal === "ATM" && "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
                  signal === "CALL WALL" && "bg-green-500/20 text-green-300 border border-green-500/30",
                  signal === "PUT WALL" && "bg-red-500/20 text-red-300 border border-red-500/30",
                  signal === "MAX VOL" && "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                )}>
                  {signal}
                </span>
              ) : (
                <span className="text-gray-500 text-xs">—</span>
              );
            })()}
          </div>
        )
      },
      {
        id: 'put-bid-ask',
        header: 'Bid/Ask',
        width: 100,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-1.5 text-xs font-mono text-red-400 border-r border-terminal-border/20">
            <div className="text-xs">
              {row.put?.bid && row.put?.ask ? `${formatPrice(row.put.bid)}/${formatPrice(row.put.ask)}` : "—"}
            </div>
          </div>
        )
      },
      {
        id: 'put-notional',
        header: 'Notional',
        width: 100,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-1.5 text-xs font-mono text-red-200 border-r border-terminal-border/20">
            {formatNotional(row.put?.oi ? row.put.oi * row.strike : 0)}
          </div>
        )
      },
      {
        id: 'put-oi',
        header: 'OI',
        width: 80,
        align: 'left',
        visible: true,
        renderCell: (row) => (
          <div className="text-left px-3 py-1.5 text-xs font-mono">
            <span className="text-red-300 font-medium">
              {row.put?.oi ? formatNumber(row.put.oi) : "—"}
            </span>
          </div>
        )
      }
    ];
  };

  // Get current columns - fixed to PRO mode
  const currentColumns = useMemo(() => {
    return getProColumns();
  }, [columnVisibility]);

  // Calculate options intelligence based on derived rows
  const optionsIntel = useMemo((): OptionsIntel => {
    // Default values
    const defaultResult: OptionsIntel = {
      totalCallOi: 0,
      totalPutOi: 0,
      totalOi: 0,
      callPutRatio: null,
      regime: "NO DATA",
      structuralBias: "NO DATA",
      keySupport: null,
      keyResistance: null,
      transitionZone: "NO DATA"
    };

    if (!derivedRows.length) {
      return defaultResult;
    }

    // Calculate total OI
    const totalCallOi = derivedRows.reduce((sum, row) => sum + row.derived.callOi, 0);
    const totalPutOi = derivedRows.reduce((sum, row) => sum + row.derived.putOi, 0);
    const totalOi = totalCallOi + totalPutOi;

    // Calculate call/put ratio
    let callPutRatio: number | null = null;
    if (totalPutOi > 0) {
      callPutRatio = totalCallOi / totalPutOi;
    }

    // Determine regime
    let regime: "CALL HEAVY" | "PUT HEAVY" | "BALANCED" | "NO DATA" = "NO DATA";
    if (totalOi === 0) {
      regime = "NO DATA";
    } else if (totalCallOi > totalPutOi * 1.2) {
      regime = "CALL HEAVY";
    } else if (totalPutOi > totalCallOi * 1.2) {
      regime = "PUT HEAVY";
    } else {
      regime = "BALANCED";
    }

    // Find key support (highest put OI below spot)
    let keySupport: number | null = null;
    if (bookData?.underlyingPrice && Number.isFinite(bookData.underlyingPrice)) {
      const strikesBelow = derivedRows.filter(row => row.strike < bookData.underlyingPrice!);
      if (strikesBelow.length > 0) {
        const maxPutStrike = strikesBelow.reduce((max, row) => 
          row.derived.putOi > max.derived.putOi ? row : max
        );
        keySupport = maxPutStrike.strike;
      }
    }

    // Find key resistance (highest call OI above spot)
    let keyResistance: number | null = null;
    if (bookData?.underlyingPrice && Number.isFinite(bookData.underlyingPrice)) {
      const strikesAbove = derivedRows.filter(row => row.strike > bookData.underlyingPrice!);
      if (strikesAbove.length > 0) {
        const maxCallStrike = strikesAbove.reduce((max, row) => 
          row.derived.callOi > max.derived.callOi ? row : max
        );
        keyResistance = maxCallStrike.strike;
      }
    }

    // Calculate transition zone
    let transitionZone = "NO DATA";
    if (institutionalData.atmStrike) {
      const atmIndex = derivedRows.findIndex(row => row.strike === institutionalData.atmStrike);
      if (atmIndex !== -1) {
        const prevStrike = atmIndex > 0 ? derivedRows[atmIndex - 1].strike : null;
        const nextStrike = atmIndex < derivedRows.length - 1 ? derivedRows[atmIndex + 1].strike : null;
        
        if (prevStrike && nextStrike) {
          const formatStrike = (strike: number) => {
            if (strike >= 1000) return `${(strike / 1000).toFixed(1)}k`;
            return strike.toString();
          };
          transitionZone = `${formatStrike(prevStrike)} – ${formatStrike(nextStrike)}`;
        }
      }
    }

    // Calculate structural bias
    let structuralBias: "RESISTANCE ABOVE" | "SUPPORT BELOW" | "PINNING / MAGNET" | "MIXED / TRANSITION" | "NO DATA" = "NO DATA";
    
    if (!bookData?.underlyingPrice || !Number.isFinite(bookData.underlyingPrice)) {
      structuralBias = "NO DATA";
    } else if (keySupport && keyResistance) {
      const spot = bookData.underlyingPrice;
      const supportDistance = Math.abs(spot - keySupport) / spot;
      const resistanceDistance = Math.abs(keyResistance - spot) / spot;
      
      // Check if spot is pinned between support and resistance
      if (spot > keySupport && spot < keyResistance) {
        structuralBias = "PINNING / MAGNET";
      }
      // Check for close resistance above
      else if (resistanceDistance < 0.02) { // < 2%
        structuralBias = "RESISTANCE ABOVE";
      }
      // Check for close support below
      else if (supportDistance < 0.02) { // < 2%
        structuralBias = "SUPPORT BELOW";
      }
      // Check regime-based bias
      else if (regime === "CALL HEAVY" && institutionalData.callWall && institutionalData.callWall > spot) {
        structuralBias = "RESISTANCE ABOVE";
      }
      else if (regime === "PUT HEAVY" && institutionalData.putWall && institutionalData.putWall < spot) {
        structuralBias = "SUPPORT BELOW";
      }
      else {
        structuralBias = "MIXED / TRANSITION";
      }
    } else {
      structuralBias = "MIXED / TRANSITION";
    }

    const result: OptionsIntel = {
      totalCallOi,
      totalPutOi,
      totalOi,
      callPutRatio,
      regime,
      structuralBias,
      keySupport,
      keyResistance,
      transitionZone
    };

    if (OPTIONS_INTEL_DEBUG) {
      console.log("[OPTIONS_INTEL_DEBUG]", result);
    }

    return result;
  }, [derivedRows, bookData, institutionalData]);

  // Calculate HIGH OI threshold (90th percentile)
  const highOiThreshold = useMemo(() => {
    if (!derivedRows.length) return 0;
    
    const sortedByOi = [...derivedRows].sort((a, b) => b.derived.totalOi - a.derived.totalOi);
    const percentile90Index = Math.floor(sortedByOi.length * 0.9);
    return sortedByOi[percentile90Index]?.derived.totalOi || 0;
  }, [derivedRows]);

  // Calculate thresholds for selective badges (stricter)
  const dominanceThreshold = useMemo(() => {
    if (!derivedRows.length) return 0;
    const sortedByOi = [...derivedRows].sort((a, b) => b.derived.totalOi - a.derived.totalOi);
    const percentile20Index = Math.floor(sortedByOi.length * 0.2);
    return sortedByOi[percentile20Index]?.derived.totalOi || 0;
  }, [derivedRows]);

  const top10PercentThreshold = useMemo(() => {
    if (!derivedRows.length) return 0;
    const sortedByOi = [...derivedRows].sort((a, b) => b.derived.totalOi - a.derived.totalOi);
    const percentile10Index = Math.floor(sortedByOi.length * 0.1);
    return sortedByOi[percentile10Index]?.derived.totalOi || 0;
  }, [derivedRows]);

  
  
  const filteredRows = useMemo(() => {
    if (!derivedRows.length) return [];
    
    if (filter === "ALL") return derivedRows;
    
    if (filter === "ATM") {
      // Show centered subset around ATM: 8 strikes below, 8 above
      const atmStrike = institutionalData.atmStrike;
      if (!atmStrike) return [];
      
      const atmIndex = derivedRows.findIndex(row => row.strike === atmStrike);
      if (atmIndex === -1) return [];
      
      // Strict ATM range: 8 below, 8 above (total 17 rows max)
      const rangeSize = 8;
      const startIndex = Math.max(0, atmIndex - rangeSize);
      const endIndex = Math.min(derivedRows.length, atmIndex + rangeSize + 1);
      
      const subset = derivedRows.slice(startIndex, endIndex);
      
      // Filter out completely empty rows in ATM mode (no call or put data)
      return subset.filter(row => {
        const hasCallData = row.call && (
          row.call.openInterest || 
          row.call.bidPrice || 
          row.call.askPrice ||
          row.call.bidSize ||
          row.call.askSize
        );
        const hasPutData = row.put && (
          row.put.openInterest || 
          row.put.bidPrice || 
          row.put.askPrice ||
          row.put.bidSize ||
          row.put.askSize
        );
        // Always include ATM row even if empty, and rows with any data
        return row.strike === atmStrike || hasCallData || hasPutData;
      });
    }
    
    if (filter === "RANGE") {
      if (!bookData?.underlyingPrice) return [];
      return derivedRows.filter(row => {
        const distance = Math.abs(row.strike - bookData.underlyingPrice) / bookData.underlyingPrice;
        return distance <= 0.15; // Within 15% of spot
      });
    }
    
    return derivedRows;
  }, [derivedRows, bookData, filter, institutionalData.atmStrike]);

  const visibleViewRows = useMemo(() => {
    if (!filteredRows.length) return [];
    const visibleStrikes = new Set(filteredRows.map((r) => r.strike));
    return viewRows.filter((r) => visibleStrikes.has(r.strike));
  }, [viewRows, filteredRows]);

  const transitionZoneSummary = useMemo(() => {
    if (zoneContext.transitionStrikes.length >= 2) {
      const sorted = [...zoneContext.transitionStrikes].sort((a, b) => a - b);
      return `${formatPrice(sorted[0])} – ${formatPrice(sorted[sorted.length - 1])}`;
    }
    if (zoneContext.flipStrikes.length > 0) {
      return formatStrikeList(zoneContext.flipStrikes, formatPrice, 2);
    }
    if (optionsIntel.transitionZone !== "NO DATA") {
      return optionsIntel.transitionZone;
    }
    return null;
  }, [zoneContext, optionsIntel.transitionZone]);

  // Auto-scroll to ATM when filter is ATM and data loads
  useEffect(() => {
    if (filter === "ATM" && derivedRows.length && institutionalData.atmStrike) {
      // Find the ATM row element and scroll it into view
      const atmRowElement = document.querySelector(`[data-strike="${institutionalData.atmStrike}"]`);
      if (atmRowElement) {
        atmRowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [filter, derivedRows, institutionalData.atmStrike]);

  // Final verification logs
  useEffect(() => {
    if (bookData) {
      console.log("[OPTIONS_BOOK_VERIFY]", {
        underlyingPrice: bookData.underlyingPrice,
        atmStrike: institutionalData.atmStrike,
        selectedFilter: filter,
        visibleRows: filteredRows.length,
        totalRows: bookData.rows.length,
        firstStrike: bookData.rows[0]?.strike,
        lastStrike: bookData.rows[bookData.rows.length - 1]?.strike,
        callWall: institutionalData.callWall,
        putWall: institutionalData.putWall,
        expiriesAvailable: bookData.expiries.length,
        selectedExpiry: selectedExpiry
      });
    }
  }, [bookData, institutionalData, filter, filteredRows.length, selectedExpiry]);

  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-400 text-sm mb-2">Failed to load options data</div>
        <button 
          onClick={() => refetch()}
          className="px-3 py-1 border border-terminal-border bg-terminal-panel text-xs text-white hover:border-terminal-accent transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-terminal-bg text-terminal-text">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-terminal-border shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white">Opciones ({currency})</h1>
          {bookData?.underlyingPrice && (
            <div className="text-sm text-terminal-muted">
              Spot: {formatPrice(bookData.underlyingPrice)}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-xs">
          <button className="px-2 py-1 border border-terminal-border bg-terminal-panel text-white hover:border-terminal-accent transition-colors">
            CSV
          </button>
        </div>
      </div>

      {/* Institutional Summary Cards */}
      {bookData && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 p-3 border-b border-terminal-border shrink-0">
          <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
            <div className="text-[9px] text-terminal-muted uppercase tracking-wider">Underlying</div>
            <div className="text-sm font-mono font-bold text-white">
              {bookData.underlyingPrice && Number.isFinite(bookData.underlyingPrice) 
                ? bookData.underlyingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "NO DATA"
              }
            </div>
          </div>
          
          <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
            <div className="text-[9px] text-terminal-muted uppercase tracking-wider">Expiry</div>
            <div className="text-sm font-mono font-bold text-white">
              {formatExpiryDisplay(selectedExpiry || "-")}
            </div>
          </div>
          
          <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
            <div className="text-[9px] text-terminal-muted uppercase tracking-wider">Rows</div>
            <div className="text-sm font-mono font-bold text-white">
              {filteredRows.length}
            </div>
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
            <div className="text-[9px] text-blue-400 uppercase tracking-wider">ATM</div>
            <div className="text-sm font-mono font-bold text-blue-400">
              {institutionalData.atmStrike ? formatPrice(institutionalData.atmStrike) : "-"}
            </div>
          </div>
          
          <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
            <div className="text-[9px] text-green-400 uppercase tracking-wider">Call Wall</div>
            <div className="text-xs font-mono font-bold text-green-400">
              <div>{formatPrice(institutionalData.callWall)}</div>
              {institutionalData.callWallOI > 0 && (
                <div className="text-[10px] text-green-400/70">OI {institutionalData.callWallOI}</div>
              )}
            </div>
          </div>
          
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
            <div className="text-[9px] text-red-400 uppercase tracking-wider">Put Wall</div>
            <div className="text-xs font-mono font-bold text-red-400">
              <div>{formatPrice(institutionalData.putWall)}</div>
              {institutionalData.putWallOI > 0 && (
                <div className="text-[10px] text-red-400/70">OI {institutionalData.putWallOI}</div>
              )}
            </div>
          </div>
          
          <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
            <div className="text-[9px] text-terminal-muted uppercase tracking-wider">Max Volume</div>
            <div className="text-xs font-mono font-bold text-white">
              <div>{formatPrice(institutionalData.maxVolumeStrike)}</div>
              {institutionalData.maxVolume > 0 && (
                <div className="text-[10px] text-terminal-muted/70">Vol {institutionalData.maxVolume}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {bookData && (
        <div className="px-3 py-1.5 border-b border-terminal-border/60 shrink-0 bg-terminal-panel/20">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono">
            <span className="text-terminal-muted uppercase tracking-wider text-[9px]">Relevant Zones</span>
            <span className="text-blue-300/90">
              ATM <span className="text-white/80">{formatStrikeCompact(zoneContext.atmStrike, formatPrice)}</span>
            </span>
            <span className="text-green-300/90">
              Call Wall <span className="text-white/80">{formatStrikeCompact(zoneContext.callWallStrike, formatPrice)}</span>
            </span>
            <span className="text-red-300/90">
              Put Wall <span className="text-white/80">{formatStrikeCompact(zoneContext.putWallStrike, formatPrice)}</span>
            </span>
            <span className="text-violet-300/90">
              Max OI <span className="text-white/80">{formatStrikeCompact(zoneContext.maxOiStrike, formatPrice)}</span>
            </span>
            <span className="text-violet-300/80">
              Max Vol <span className="text-white/80">{formatStrikeCompact(zoneContext.maxVolumeStrike, formatPrice)}</span>
            </span>
            <span className="text-cyan-300/80">
              Support <span className="text-white/70">{formatStrikeList(zoneContext.supportStrikes, formatPrice)}</span>
            </span>
            <span className="text-orange-300/80">
              Resistance <span className="text-white/70">{formatStrikeList(zoneContext.resistanceStrikes, formatPrice)}</span>
            </span>
            {transitionZoneSummary && (
              <span className="text-amber-300/80">
                Transition <span className="text-white/70">{transitionZoneSummary}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* GOODTRADING OPTIONS READ */}
      {bookData && (
        <div className="bg-terminal-panel/10 border-b border-terminal-border shrink-0">
          <div className="px-3 py-2">
            <div className="text-xs font-bold text-terminal-accent uppercase tracking-wider mb-2">
              GOODTRADING OPTIONS READ
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* REGIME */}
              <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
                <div className="text-[8px] text-terminal-muted uppercase tracking-wider">Regime</div>
                <div className="text-sm font-mono font-bold">
                  <span className={cn(
                    optionsIntel.regime === "CALL HEAVY" && "text-green-400",
                    optionsIntel.regime === "PUT HEAVY" && "text-red-400",
                    optionsIntel.regime === "BALANCED" && "text-blue-400",
                    optionsIntel.regime === "NO DATA" && "text-gray-500"
                  )}>
                    {optionsIntel.regime}
                  </span>
                </div>
              </div>

              {/* STRUCTURAL BIAS */}
              <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
                <div className="text-[8px] text-terminal-muted uppercase tracking-wider">Structural Bias</div>
                <div className="text-xs font-mono font-bold">
                  <span className={cn(
                    optionsIntel.structuralBias === "RESISTANCE ABOVE" && "text-red-400",
                    optionsIntel.structuralBias === "SUPPORT BELOW" && "text-green-400",
                    optionsIntel.structuralBias === "PINNING / MAGNET" && "text-blue-400",
                    optionsIntel.structuralBias === "MIXED / TRANSITION" && "text-yellow-400",
                    optionsIntel.structuralBias === "NO DATA" && "text-gray-500"
                  )}>
                    {optionsIntel.structuralBias}
                  </span>
                </div>
              </div>

              {/* KEY SUPPORT */}
              <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
                <div className="text-[8px] text-terminal-muted uppercase tracking-wider">Key Support</div>
                <div className="text-sm font-mono font-bold text-green-400">
                  {optionsIntel.keySupport ? formatPrice(optionsIntel.keySupport) : "NO DATA"}
                </div>
              </div>

              {/* KEY RESISTANCE */}
              <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
                <div className="text-[8px] text-terminal-muted uppercase tracking-wider">Key Resistance</div>
                <div className="text-sm font-mono font-bold text-red-400">
                  {optionsIntel.keyResistance ? formatPrice(optionsIntel.keyResistance) : "NO DATA"}
                </div>
              </div>

              {/* TRANSITION ZONE */}
              <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
                <div className="text-[8px] text-terminal-muted uppercase tracking-wider">Transition Zone</div>
                <div className="text-xs font-mono font-bold text-blue-300">
                  {optionsIntel.transitionZone}
                </div>
              </div>

              {/* C/P RATIO */}
              <div className="bg-terminal-panel/50 border border-terminal-border/30 rounded p-2">
                <div className="text-[8px] text-terminal-muted uppercase tracking-wider">C/P Ratio</div>
                <div className="text-sm font-mono font-bold text-white">
                  {optionsIntel.regime === "BALANCED" ? (
                    "BALANCED"
                  ) : optionsIntel.callPutRatio ? (
                    optionsIntel.callPutRatio > 1 ? 
                      `C/P ${optionsIntel.callPutRatio.toFixed(2)}x` : 
                      `P/C ${(1 / optionsIntel.callPutRatio).toFixed(2)}x`
                  ) : (
                    "NO DATA"
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-terminal-border shrink-0">
        {/* Currency Selector */}
        <div className="flex gap-1">
          {(["BTC", "ETH"] as const).map(curr => (
            <button
              key={curr}
              onClick={() => setCurrency(curr)}
              className={cn(
                "px-3 py-1 text-xs font-medium border transition-colors",
                currency === curr
                  ? "border-terminal-accent bg-terminal-accent/20 text-terminal-accent"
                  : "border-terminal-border bg-terminal-panel text-terminal-muted hover:text-white"
              )}
            >
              {curr}
            </button>
          ))}
        </div>

        {/* Expiry Selector */}
        {bookData?.expiries && (
          <div className="flex gap-1 max-w-md overflow-x-auto">
            {bookData.expiries.map(expiry => (
              <button
                key={expiry}
                onClick={() => setSelectedExpiry(expiry)}
                className={cn(
                  "px-2 py-1 text-xs font-medium border whitespace-nowrap transition-colors",
                  selectedExpiry === expiry
                    ? "border-terminal-accent bg-terminal-accent/20 text-terminal-accent"
                    : "border-terminal-border bg-terminal-panel text-terminal-muted hover:text-white"
                )}
              >
                {formatExpiryDisplay(expiry)}
              </button>
            ))}
          </div>
        )}

        {/* Filter Buttons */}
        <div className="flex gap-1 ml-auto">
          {(["ALL", "ATM", "RANGE", "MOVEMENT", "DIST"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={cn(
                "px-2 py-1 text-xs font-medium border transition-colors",
                filter === f
                  ? "border-terminal-accent bg-terminal-accent/20 text-terminal-accent"
                  : "border-terminal-border bg-terminal-panel text-terminal-muted hover:text-white"
              )}
            >
              {f === "DIST" ? "DIST" : f}
            </button>
          ))}
        </div>

              </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-terminal-muted text-sm">Loading options data...</div>
        </div>
      )}

      {/* Options Table */}
      {!isLoading && bookData && (
        <div className="flex-1 overflow-auto">
          <div className="min-w-[1400px]">
            <table className="w-full border-collapse">
              {/* Table Header */}
              <thead className="border-b border-terminal-border">
                <tr className="sticky top-0 bg-terminal-bg z-30">
                  {currentColumns.map((column) => (
                    <th
                      key={column.id}
                      className={cn(
                        "px-3 py-2 h-6 text-[10px] font-medium text-terminal-muted border-r border-terminal-border/50",
                        column.align === 'center' && "text-center",
                        column.align === 'left' && "text-left",
                        column.align === 'right' && "text-right"
                      )}
                      style={{ width: column.width }}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-terminal-border/20">
                {visibleViewRows.map((row, index) => (
                  <tr
                    key={row.strike}
                    data-strike={row.strike}
                    className={cn(
                      "hover:bg-terminal-panel/10 transition-colors group",
                      index % 2 === 0 ? "bg-terminal-bg" : "bg-terminal-panel/5",
                      getZoneRowClassName(row.zoneTags)
                    )}
                  >
                    {/* Render cells using ColumnDef */}
                    {currentColumns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "border-r border-terminal-border/20",
                          column.align === 'center' && "text-center",
                          column.align === 'left' && "text-left",
                          column.align === 'right' && "text-right"
                        )}
                      >
                        {column.renderCell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {bookData && (
        <div className="p-2 border-t border-terminal-border text-xs text-terminal-muted shrink-0">
          Last updated: {new Date(bookData.generatedAt).toLocaleTimeString()} | 
          Rows: {filteredRows.length} / {bookData.rows.length} ({filter})
        </div>
      )}
    </div>
  );
}

// Helper function to get badges for a row (cleaned up - max 1 per side)
// Moved to end to avoid temporal dead zone with optionsIntel
function getRowBadges(
  row: OptionsDerivedRow, 
  context: {
    institutionalData: any;
    bookData: any;
    optionsIntel: any;
    top10PercentThreshold: number;
    highOiThreshold: number;
    dominanceThreshold: number;
    formatNumber: (value: number | null | undefined, decimals?: number) => string;
  }
): RowBadges {
  const { institutionalData, bookData, optionsIntel, top10PercentThreshold, highOiThreshold, dominanceThreshold, formatNumber } = context;
  
  const badges: RowBadges = {
    center: [],
    call: [],
    put: []
  };

  // ATM badge (highest priority, center)
  if (row.strike === institutionalData.atmStrike) {
    badges.center.push({
      label: "ATM",
      kind: "atm",
      priority: 1
    });
  }

  // CALL WALL badge (call side)
  if (row.strike === institutionalData.callWall) {
    badges.call.push({
      label: "CALL WALL",
      kind: "callWall",
      value: formatNumber(row.call?.openInterest),
      priority: 2
    });
  }

  // PUT WALL badge (put side)
  if (row.strike === institutionalData.putWall) {
    badges.put.push({
      label: "PUT WALL",
      kind: "putWall",
      value: formatNumber(row.put?.openInterest),
      priority: 2
    });
  }

  // MAX VOL badge (center, but avoid ATM conflict)
  if (row.strike === institutionalData.maxVolumeStrike && row.strike !== institutionalData.atmStrike) {
    badges.center.push({
      label: "MAX VOL",
      kind: "maxVol",
      value: formatNumber(institutionalData.maxVolume),
      priority: 3
    });
  }

  // SUPPORT badge (put side, only key support or top 10% put OI)
  if (bookData?.underlyingPrice && row.strike < bookData.underlyingPrice) {
    const isKeySupport = row.strike === optionsIntel.keySupport;
    const isTop10PutOi = row.derived.putOi >= top10PercentThreshold && top10PercentThreshold > 0;
    
    if (isKeySupport || isTop10PutOi) {
      badges.put.push({
        label: "SUPPORT",
        kind: "support",
        priority: 4
      });
    }
  }

  // RESISTANCE badge (call side, only key resistance or top 10% call OI)
  if (bookData?.underlyingPrice && row.strike > bookData.underlyingPrice) {
    const isKeyResistance = row.strike === optionsIntel.keyResistance;
    const isTop10CallOi = row.derived.callOi >= top10PercentThreshold && top10PercentThreshold > 0;
    
    if (isKeyResistance || isTop10CallOi) {
      badges.call.push({
        label: "RESISTANCE",
        kind: "resistance",
        priority: 4
      });
    }
  }

  // HIGH OI badge (center, but avoid conflicts)
  if (row.derived.totalOi >= highOiThreshold && highOiThreshold > 0) {
    const hasCenterConflict = badges.center.some(b => b.priority <= 3);
    if (!hasCenterConflict) {
      badges.center.push({
        label: "HIGH OI",
        kind: "highOi",
        value: formatNumber(row.derived.totalOi),
        priority: 5
      });
    }
  }

  // DOMINANCE badges (very selective - only for significant dominance, no conflicts)
  if (row.derived.totalOi > 0 && row.derived.liquidityScore > 20) {
    const meetsDominanceRatio = row.derived.dominanceRatio !== null && row.derived.dominanceRatio >= 2.5;
    const meetsOiThreshold = row.derived.totalOi >= dominanceThreshold;
    
    // Don't show DOM if WALL already exists on same side
    const hasCallWall = badges.call.some(b => b.kind === "callWall");
    const hasPutWall = badges.put.some(b => b.kind === "putWall");
    const hasSupport = badges.put.some(b => b.kind === "support");
    const hasResistance = badges.call.some(b => b.kind === "resistance");
    
    if (row.derived.dominance === "CALL_DOMINANT" && (meetsDominanceRatio || meetsOiThreshold) && !hasCallWall && !hasResistance) {
      badges.call.push({
        label: "CALL DOM",
        kind: "callDom",
        priority: 6
      });
    } else if (row.derived.dominance === "PUT_DOMINANT" && (meetsDominanceRatio || meetsOiThreshold) && !hasPutWall && !hasSupport) {
      badges.put.push({
        label: "PUT DOM",
        kind: "putDom",
        priority: 6
      });
    }
  }

  // Sort badges by priority and limit to 1 per side (clean UI)
  const sortAndLimit = (badgeList: Badge[]) => {
    return badgeList
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 1); // Maximum 1 badge per side
  };

  return {
    center: badges.center.slice(0, 1), // Maximum 1 center badge
    call: sortAndLimit(badges.call),
    put: sortAndLimit(badges.put)
  };
}

// Helper function to get main signal for GT mode (1 signal per row)
// Moved to end to avoid temporal dead zone with optionsIntel
function getMainSignal(
  row: OptionsDerivedRow, 
  context: {
    institutionalData: any;
    bookData: any;
    optionsIntel: any;
    top10PercentThreshold: number;
    highOiThreshold: number;
    dominanceThreshold: number;
    formatNumber: (value: number | null | undefined, decimals?: number) => string;
  }
): Badge | null {
  const { institutionalData, bookData, optionsIntel, top10PercentThreshold, highOiThreshold, dominanceThreshold, formatNumber } = context;
  
  const allBadges: Badge[] = [];
  
  // Collect all possible badges
  if (row.strike === institutionalData.atmStrike) {
    allBadges.push({ label: "ATM", kind: "atm", priority: 1 });
  }
  if (row.strike === institutionalData.callWall) {
    allBadges.push({ 
      label: "CALL WALL", 
      kind: "callWall", 
      value: formatNumber(row.call?.openInterest),
      priority: 2 
    });
  }
  if (row.strike === institutionalData.putWall) {
    allBadges.push({ 
      label: "PUT WALL", 
      kind: "putWall", 
      value: formatNumber(row.put?.openInterest),
      priority: 2 
    });
  }
  if (row.strike === institutionalData.maxVolumeStrike && row.strike !== institutionalData.atmStrike) {
    allBadges.push({ 
      label: "MAX VOL", 
      kind: "maxVol", 
      value: formatNumber(institutionalData.maxVolume),
      priority: 3 
    });
  }
  
  // SUPPORT (key support or top 10% put OI)
  if (bookData?.underlyingPrice && row.strike < bookData.underlyingPrice) {
    const isKeySupport = row.strike === optionsIntel.keySupport;
    const isTop10PutOi = row.derived.putOi >= top10PercentThreshold && top10PercentThreshold > 0;
    
    if (isKeySupport || isTop10PutOi) {
      allBadges.push({ label: "SUPPORT", kind: "support", priority: 4 });
    }
  }
  
  // RESISTANCE (key resistance or top 10% call OI)
  if (bookData?.underlyingPrice && row.strike > bookData.underlyingPrice) {
    const isKeyResistance = row.strike === optionsIntel.keyResistance;
    const isTop10CallOi = row.derived.callOi >= top10PercentThreshold && top10PercentThreshold > 0;
    
    if (isKeyResistance || isTop10CallOi) {
      allBadges.push({ label: "RESISTANCE", kind: "resistance", priority: 4 });
    }
  }
  
  // HIGH OI
  if (row.derived.totalOi >= highOiThreshold && highOiThreshold > 0) {
    allBadges.push({ 
      label: "HIGH OI", 
      kind: "highOi", 
      value: formatNumber(row.derived.totalOi),
      priority: 5 
    });
  }
  
  // DOMINANCE (very selective)
  if (row.derived.totalOi > 0 && row.derived.liquidityScore > 20) {
    const meetsDominanceRatio = row.derived.dominanceRatio !== null && row.derived.dominanceRatio >= 2.5;
    const meetsOiThreshold = row.derived.totalOi >= dominanceThreshold;
    
    // Don't show DOM if WALL already exists
    const hasCallWall = row.strike === institutionalData.callWall;
    const hasPutWall = row.strike === institutionalData.putWall;
    const hasSupport = row.strike === optionsIntel.keySupport || (row.derived.putOi >= top10PercentThreshold && top10PercentThreshold > 0);
    const hasResistance = row.strike === optionsIntel.keyResistance || (row.derived.callOi >= top10PercentThreshold && top10PercentThreshold > 0);
    
    if (row.derived.dominance === "CALL_DOMINANT" && (meetsDominanceRatio || meetsOiThreshold) && !hasCallWall && !hasResistance) {
      allBadges.push({ label: "CALL DOM", kind: "callDom", priority: 6 });
    } else if (row.derived.dominance === "PUT_DOMINANT" && (meetsDominanceRatio || meetsOiThreshold) && !hasPutWall && !hasSupport) {
      allBadges.push({ label: "PUT DOM", kind: "putDom", priority: 6 });
    }
  }
  
  // Return highest priority signal
  if (allBadges.length === 0) return null;
  
  return allBadges.sort((a, b) => a.priority - b.priority)[0];
}
