import React from "react";
import { ScrollView, View, Text, StyleSheet, Image, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { MarketStatusCard } from "@/components/MarketStatusCard";
import { ScenarioCard } from "@/components/ScenarioCard";
import { KeyZonesCard } from "@/components/KeyZonesCard";
import { GammaCard } from "@/components/GammaCard";
import { marketStatus, scenarioDetail, keyZones, gammaStatus } from "@/data/mockData";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View>
          <Text style={[styles.appName, { color: colors.foreground }]}>GOOD<Text style={{ color: colors.primary }}>TRADING</Text></Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>MARKET INTELLIGENCE</Text>
        </View>
        <View style={[styles.liveBadge, { borderColor: colors.primary }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.liveText, { color: colors.primary }]}>LIVE</Text>
        </View>
      </View>

      <MarketStatusCard
        bias={marketStatus.bias}
        gamma={marketStatus.gamma}
        zone={marketStatus.zone}
        scenario={marketStatus.scenario}
        lastUpdate={marketStatus.lastUpdate}
        biasStrength={marketStatus.biasStrength}
      />

      <ScenarioCard
        title={scenarioDetail.title}
        description={scenarioDetail.description}
        probability={scenarioDetail.probability}
        outlook={scenarioDetail.outlook}
        timeframe={scenarioDetail.timeframe}
        tags={scenarioDetail.tags}
      />

      <KeyZonesCard zones={keyZones} />

      <GammaCard
        state={gammaStatus.state}
        level={gammaStatus.level}
        netGamma={gammaStatus.netGamma}
        flipPoint={gammaStatus.flipPoint}
        description={gammaStatus.description}
        dominantExpiry={gammaStatus.dominantExpiry}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 4,
  },
  appName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 2,
    marginTop: 1,
  },
  liveBadge: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
});
