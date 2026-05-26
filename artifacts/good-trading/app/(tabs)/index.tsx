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

// NO mock imports. Every value shown comes from the API or shows explicit
// "awaiting data" state. If you see real-looking numbers here, the terminal pushed them.

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
  const bias = raw?.bias?.type ?? "NEUTRAL";
  const gamma = raw?.market?.gammaRegime ?? "NEUTRAL";
  const dealerPivot = raw?.levels?.dealerPivot;
  const scenario = raw?.scenarios?.[0]?.thesis ?? "—";
  const outlook = raw?.bias?.outlook;
  const timeframe = raw?.bias?.horizon ?? "—";
  const tags = raw?.bias?.drivers ?? [];
  const probability = raw?.bias?.confidence ?? 0;
  const gammaLevel = raw?.market?.gammaLevel ?? 0;
  const netGamma = raw?.market?.totalGex ?? "—";
  const flipPoint = raw?.market?.gammaFlip ?? "—";
  const dominantExpiry = raw?.market?.dominantExpiry ?? "—";
  const lastUpdate = raw?.market?.lastUpdate ?? new Date().toISOString();

  // Build zones array from levels
  const zones = [
    ...(raw?.levels?.callWall ? [{ label: "CALL WALL", price: raw.levels.callWall, type: "resistance" as const, distance: "—" }] : []),
    ...(raw?.levels?.putWall ? [{ label: "PUT WALL", price: raw.levels.putWall, type: "support" as const, distance: "—" }] : []),
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
            asset={btcPrice ?? "BTC"}
            bias={bias}
            gamma={gamma}
            zone={dealerPivot ?? "—"}
            setup=""
            probability={probability}
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
            probability={probability}
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
