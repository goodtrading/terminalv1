import React from "react";
import { ScrollView, View, Text, StyleSheet, Image, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMarketState } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { CommandBlock } from "@/components/CommandBlock";
import { ScenarioCard } from "@/components/ScenarioCard";
import { KeyZonesCard } from "@/components/KeyZonesCard";
import { GammaCard } from "@/components/GammaCard";
import { keyZones, gammaStatus } from "@/data/mockData";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: market, isLoading, isError } = useGetMarketState({
    query: {
      refetchInterval: 7_000,
      staleTime: 5_000,
    },
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 14, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
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
        {isLoading && !market && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        )}
      </View>

      {isError && !market && (
        <View style={[styles.errorBanner, { backgroundColor: "#1a0000", borderColor: colors.border }]}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Sin conexión al servidor — mostrando último estado conocido
          </Text>
        </View>
      )}

      <CommandBlock
        asset="BTC"
        gamma={market?.gamma ?? "SHORT"}
        zone={market?.zone ?? "$82K"}
        setup={market?.setup ?? "RECHAZO → CONTINUACIÓN"}
        bias={market?.bias ?? "BEARISH"}
        probability={market?.probability ?? 78}
        lastUpdate={
          market?.lastUpdate
            ? new Date(market.lastUpdate).toLocaleString("es-ES", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).toUpperCase() + " UTC"
            : "—"
        }
      />

      <ScenarioCard
        title={market?.scenario ?? "DISTRIBUCIÓN ACTIVA"}
        description={
          market
            ? `Escenario activo: ${market.scenario}. Outlook: ${market.outlook ?? "—"}. Timeframe: ${market.timeframe ?? "—"}.`
            : "El mercado se encuentra en fase de distribución institucional. La gamma corta amplifica los movimientos a la baja."
        }
        probability={market?.probability ?? 78}
        outlook={market?.outlook ?? "NEUTRAL → BEARISH"}
        timeframe={market?.timeframe ?? "4H – 1D"}
        tags={market?.tags ?? ["DISTRIBUCIÓN", "GAMMA SHORT", "RIESGO ALTO"]}
      />

      <KeyZonesCard zones={keyZones} />

      <GammaCard
        state={market?.gamma ?? gammaStatus.state}
        level={market?.gammaLevel ?? gammaStatus.level}
        netGamma={market?.netGamma ?? gammaStatus.netGamma}
        flipPoint={market?.flipPoint ?? gammaStatus.flipPoint}
        description="Gamma neta negativa. Los market makers amplifican los movimientos. Alta volatilidad esperada en zonas de liquidez."
        dominantExpiry={market?.dominantExpiry ?? gammaStatus.dominantExpiry}
      />
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
  errorBanner: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
