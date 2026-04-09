import React from "react";
import { ScrollView, View, Text, StyleSheet, Image, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { CommandBlock } from "@/components/CommandBlock";
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
      </View>

      <CommandBlock
        asset="BTC"
        gamma={marketStatus.gamma}
        zone={marketStatus.zone}
        setup={scenarioDetail.setup}
        bias={marketStatus.bias}
        probability={scenarioDetail.probability}
        lastUpdate={marketStatus.lastUpdate}
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
});
