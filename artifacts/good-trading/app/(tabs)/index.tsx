import React from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMarketState } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { CommandBlock } from "@/components/CommandBlock";
import { ScenarioCard } from "@/components/ScenarioCard";
import { KeyZonesCard } from "@/components/KeyZonesCard";
import { GammaCard } from "@/components/GammaCard";
import { MarketStateBadge } from "@/components/MarketStateBadge";
import { CorePositioningGrid } from "@/components/CorePositioningGrid";

// NO mock imports. Every value shown comes from the API or shows explicit
// "awaiting data" state. If you see real-looking numbers here, the terminal pushed them.

// Helper functions for formatting
const formatUsdPrice = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
};

const normalizeGammaLabel = (value: unknown) => {
  const text = String(value ?? "").toUpperCase();

  // If the value already contains "GAMMA", return it as-is
  if (text.includes("GAMMA")) {
    return text;
  }

  // Otherwise, normalize and add GAMMA suffix
  if (text.includes("SHORT")) return "SHORT GAMMA";
  if (text.includes("LONG")) return "LONG GAMMA";
  if (text.includes("TRANSITION")) return "TRANSITION GAMMA";

  return "UNKNOWN GAMMA";
};

const formatCompactUsd = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;

  return `${sign}$${abs.toFixed(0)}`;
};

const formatPercent = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
};

// Institutional market state derivation functions
const deriveVolatilityState = (gamma: string, gammaLevel: number) => {
  const gammaUpper = gamma.toUpperCase();
  const absGammaLevel = Math.abs(gammaLevel);

  // SHORT GAMMA + high gamma magnitude → HIGH VOLATILITY
  if (gammaUpper.includes("SHORT") && absGammaLevel > 50) {
    return "HIGH VOLATILITY";
  }

  // LONG GAMMA + compressed positioning → LOW VOLATILITY
  if (gammaUpper.includes("LONG") && absGammaLevel < 30) {
    return "LOW VOLATILITY";
  }

  // TRANSITION GAMMA → TRANSITIONAL VOLATILITY
  if (gammaUpper.includes("TRANSITION")) {
    return "TRANSITIONAL VOLATILITY";
  }

  // Default based on gamma level
  if (absGammaLevel > 50) return "HIGH VOLATILITY";
  if (absGammaLevel < 30) return "LOW VOLATILITY";

  return "MODERATE VOLATILITY";
};

const deriveDealerStructure = (gamma: string, probability: number, bias: string) => {
  const gammaUpper = gamma.toUpperCase();
  const biasUpper = bias.toUpperCase();

  // SHORT GAMMA OR low confidence OR transition regime → FRAGILE STRUCTURE
  if (
    gammaUpper.includes("SHORT") ||
    gammaUpper.includes("TRANSITION") ||
    probability < 50 ||
    biasUpper.includes("FRAGILE")
  ) {
    return "FRAGILE STRUCTURE";
  }

  // LONG GAMMA + stable positioning → STABLE STRUCTURE
  if (gammaUpper.includes("LONG") && probability >= 50) {
    return "STABLE STRUCTURE";
  }

  return "NEUTRAL STRUCTURE";
};

const deriveMarketModeNarrative = (
  gamma: string,
  probability: number,
  bias: string,
  tags: string[],
  outlook: string | undefined
) => {
  const gammaUpper = gamma.toUpperCase();
  const biasUpper = bias.toUpperCase();

  // Derive title based on gamma and bias combination
  let title = "NEUTRAL POSITIONING";

  if (gammaUpper.includes("SHORT") && biasUpper.includes("FRAGILE")) {
    title = "FRAGILE TRANSITION";
  } else if (gammaUpper.includes("SHORT")) {
    title = "VOLATILITY EXPANSION";
  } else if (gammaUpper.includes("LONG") && biasUpper.includes("STABLE")) {
    title = "CONTROLLED POSITIONING";
  } else if (gammaUpper.includes("LONG")) {
    title = "POSITIONING COMPRESSION";
  } else if (gammaUpper.includes("TRANSITION")) {
    title = "STRUCTURAL INSTABILITY";
  }

  // Derive subtitle based on outlook and gamma
  let subtitle = "Market positioning neutral";

  if (gammaUpper.includes("SHORT")) {
    subtitle = "Unstable regime with expanding volatility";
  } else if (gammaUpper.includes("LONG")) {
    subtitle = "Stable regime with compressed positioning";
  } else if (gammaUpper.includes("TRANSITION")) {
    subtitle = "Regime transition in progress";
  }

  // Derive drivers from tags and outlook
  const drivers: string[] = [];

  if (gammaUpper.includes("TRANSITION")) {
    drivers.push("Between gamma regimes");
  }

  if (biasUpper.includes("FRAGILE") || probability < 50) {
    drivers.push("Institutional bias fragile");
  }

  if (tags.length > 0) {
    drivers.push(...tags.slice(0, 2)); // Use first 2 tags as drivers
  }

  if (drivers.length === 0) {
    drivers.push("Trade state: monitoring");
  }

  return {
    title,
    subtitle,
    drivers,
    confidence: probability,
  };
};

const deriveFlipStates = (gammaFlip: unknown, dealerPivot: unknown) => {
  const globalFlip = gammaFlip ? formatUsdPrice(gammaFlip) : "—";
  const localFlip = dealerPivot ? formatUsdPrice(dealerPivot) : "—";

  return {
    globalFlip,
    localFlip,
  };
};

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: market, isLoading, isError } = useGetMarketState({
    query: {
      queryKey: ["market-state"],
      refetchInterval: 7_000,
      staleTime: 5_000,
    },
  });

  // Map real API response structure to UI fields
  const raw = market as any; // this is now the unwrapped data.data object
  const btcPrice = raw?.market?.spot;
  const biasRaw = raw?.bias?.type ?? "NEUTRAL";
  const bias = biasRaw.replace(/_/g, " "); // Replace underscores with spaces
  const gammaRaw = raw?.market?.gammaRegime ?? "NEUTRAL";
  const gamma = normalizeGammaLabel(gammaRaw);
  const dealerPivot = raw?.levels?.dealerPivot;
  const scenario = raw?.scenarios?.[0]?.thesis ?? "—";
  const outlook = raw?.bias?.horizon ?? "—";
  const timeframe = raw?.bias?.horizon ?? "—";
  const tags = raw?.bias?.drivers ?? [];
  const probabilityRaw = raw?.bias?.confidence ?? 0;
  const probability = formatPercent(probabilityRaw);
  const gammaLevel = raw?.market?.gammaLevel ?? 0;
  const netGammaRaw = raw?.market?.totalGex ?? "—";
  const netGamma = formatCompactUsd(netGammaRaw);
  const flipPointRaw = raw?.market?.gammaFlip ?? "—";
  const flipPoint = formatUsdPrice(flipPointRaw);
  const dominantExpiry = raw?.market?.dominantExpiry ?? "—";
  const lastUpdate = raw?.market?.lastUpdate ?? new Date().toISOString();

  // Dev logs for scenario source
  if (__DEV__) {
    console.log("[GoodTrading Mobile] scenario source:", {
      scenarioFromScenarios: raw?.scenarios?.[0]?.thesis,
      scenarioDirect: raw?.scenario,
      scenarios: raw?.scenarios,
    });
  }

  // Derive institutional market states
  const volatilityState = deriveVolatilityState(gamma, gammaLevel);
  const dealerStructure = deriveDealerStructure(gamma, probabilityRaw, bias);
  const marketModeNarrative = deriveMarketModeNarrative(gamma, probabilityRaw, bias, tags, outlook);
  const flipStates = deriveFlipStates(flipPointRaw, dealerPivot);

  // Color mapping for derived states
  const getGammaColor = () => {
    const gammaUpper = gamma.toUpperCase();
    if (gammaUpper.includes("SHORT")) return colors.primary; // red
    if (gammaUpper.includes("LONG")) return colors.success; // green
    if (gammaUpper.includes("TRANSITION")) return colors.gold; // amber
    return colors.mutedForeground;
  };

  const getVolatilityColor = () => {
    const volUpper = volatilityState.toUpperCase();
    if (volUpper.includes("HIGH")) return colors.primary; // red
    if (volUpper.includes("LOW")) return colors.success; // green
    if (volUpper.includes("TRANSITIONAL")) return colors.gold; // amber
    return colors.mutedForeground;
  };

  const getStructureColor = () => {
    const structUpper = dealerStructure.toUpperCase();
    if (structUpper.includes("FRAGILE")) return colors.primary; // red
    if (structUpper.includes("STABLE")) return colors.success; // green
    return colors.mutedForeground;
  };

  // Dev logs for derived institutional states
  if (__DEV__) {
    console.log("[GoodTrading Mobile] Institutional Market States:", {
      inputs: {
        gamma,
        gammaLevel,
        probability: probabilityRaw,
        bias,
        tags,
        outlook,
        flipPoint: flipPointRaw,
        dealerPivot,
      },
      derived: {
        volatilityState,
        dealerStructure,
        marketModeNarrative,
        flipStates,
      },
    });
  }

  // Build zones array from levels with formatted prices
  const zones = [
    ...(raw?.levels?.callWall ? [{ label: "CALL WALL", price: formatUsdPrice(raw.levels.callWall), type: "resistance" as const, distance: "—" }] : []),
    ...(raw?.levels?.putWall ? [{ label: "PUT WALL", price: formatUsdPrice(raw.levels.putWall), type: "support" as const, distance: "—" }] : []),
  ];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  // True while waiting for the very first response
  const isPending = isLoading && !market;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 14,
        paddingBottom: bottomPad,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View>
          <Text style={[styles.appName, { color: colors.foreground }]}>
            GOOD<Text style={{ color: colors.primary }}>TRADING</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            INSTITUTIONAL INTEL
          </Text>
        </View>
        {isPending && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        )}
        {isError && (
          <View style={[styles.offlinePill, { borderColor: colors.primary }]}>
            <Text style={[styles.offlineText, { color: colors.primary }]}>SIN SEÑAL</Text>
          </View>
        )}
      </View>

      {/* ── Market State Bar ───────────────────────────────────── */}
      {market && (
        <View style={[styles.marketStateBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.spotPrice, { color: colors.foreground }]}>
            BTC {formatUsdPrice(btcPrice)}
          </Text>
          <MarketStateBadge label={gamma} color={getGammaColor()} />
          <MarketStateBadge label={volatilityState} color={getVolatilityColor()} />
          <MarketStateBadge label={dealerStructure} color={getStructureColor()} />
        </View>
      )}

      {/* ── Loading skeleton ───────────────────────────────────── */}
      {isPending && (
        <View style={[styles.skeleton, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.skeletonText, { color: colors.mutedForeground }]}>
            CONECTANDO CON TERMINAL…
          </Text>
        </View>
      )}

      {/* ── Data layer — only renders when market has arrived ──── */}
      {market && (
        <>
          {/* CommandBlock: asset · bias · gamma · zone · setup · probability · lastUpdate */}
          <CommandBlock
            asset={formatUsdPrice(btcPrice) ?? "BTC"}
            bias={bias}
            gamma={gamma}
            zone={formatUsdPrice(dealerPivot) ?? "—"}
            setup=""
            probability={probabilityRaw}
            lastUpdate={new Date(lastUpdate).toLocaleString("es-ES", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).toUpperCase() + " UTC"}
          />

          {/* ScenarioCard: scenario · probability · outlook · timeframe · tags */}
          <ScenarioCard
            title={scenario}
            description=""
            probability={probabilityRaw}
            outlook={outlook ?? "—"}
            timeframe={timeframe ?? "—"}
            tags={tags}
          />

          {/* KeyZonesCard: zones from terminal push — empty if terminal hasn't sent them */}
          {zones.length > 0 ? (
            <KeyZonesCard zones={zones} />
          ) : (
            <View style={[styles.emptyZones, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyZonesText, { color: colors.mutedForeground }]}>
                ZONAS CLAVE — SIN DATOS DEL TERMINAL
              </Text>
              <Text style={[styles.emptyZonesHint, { color: colors.mutedForeground }]}>
                Incluí el campo `zones[]` en tu próximo push
              </Text>
            </View>
          )}

          {/* CorePositioningGrid: global flip · local flip · dealer pivot · current zone */}
          <CorePositioningGrid
            globalFlip={flipStates.globalFlip}
            localFlip={flipStates.localFlip}
            dealerPivot={formatUsdPrice(dealerPivot) ?? "—"}
            currentZone={formatUsdPrice(btcPrice) ?? "—"}
          />

          {/* GammaCard: gamma · gammaLevel · netGamma · flipPoint · dominantExpiry */}
          <GammaCard
            state={gamma}
            level={gammaLevel}
            netGamma={netGamma}
            flipPoint={flipPoint}
            description=""
            dominantExpiry={dominantExpiry}
          />
        </>
      )}

      {/* ── Error state (no market + error) ───────────────────── */}
      {isError && !isPending && (
        <View style={[styles.errorBlock, { backgroundColor: "#0d0000", borderColor: colors.primary }]}>
          <Text style={[styles.errorTitle, { color: colors.primary }]}>SIN CONEXIÓN</Text>
          <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>
            No se pudo contactar al backend. La app reintenta cada 7 segundos.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  appName: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    letterSpacing: 2.5,
    marginTop: 1,
  },
  loader: {
    marginLeft: "auto",
  },
  offlinePill: {
    marginLeft: "auto",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  offlineText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  marketStateBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  spotPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  skeleton: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 24,
    marginBottom: 12,
    alignItems: "center",
  },
  skeletonText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  emptyZones: {
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    gap: 6,
  },
  emptyZonesText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  emptyZonesHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  errorBlock: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  errorTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  errorBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
});
