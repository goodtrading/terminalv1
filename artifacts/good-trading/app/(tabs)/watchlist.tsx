import React from "react";
import { ScrollView, View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { WatchlistItem } from "@/components/WatchlistItem";
import { watchlist, marketStatus } from "@/data/mockData";

export default function WatchlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const sellersCount = watchlist.filter((w) => w.pressure === "VENDEDORES").length;
  const buyersCount = watchlist.filter((w) => w.pressure === "COMPRADORES").length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>WATCHLIST</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {watchlist.length} ACTIVOS · BIAS{" "}
            <Text style={{ color: colors.primary }}>{marketStatus.bias}</Text>
          </Text>
        </View>
      </View>

      <View style={[styles.pressureSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.pressureCol}>
          <Text style={[styles.pressureNum, { color: colors.primary }]}>{sellersCount}</Text>
          <Text style={[styles.pressureColLabel, { color: colors.mutedForeground }]}>DOMINAN VENDEDORES</Text>
        </View>
        <View style={[styles.pressureSep, { backgroundColor: colors.border }]} />
        <View style={styles.pressureCol}>
          <Text style={[styles.pressureNum, { color: colors.success }]}>{buyersCount}</Text>
          <Text style={[styles.pressureColLabel, { color: colors.mutedForeground }]}>DOMINAN COMPRADORES</Text>
        </View>
        <View style={[styles.pressureSep, { backgroundColor: colors.border }]} />
        <View style={[styles.pressureSignal, { flex: 1.6, paddingLeft: 12 }]}>
          <Text style={[styles.signalLabel, { color: colors.mutedForeground }]}>SEÑAL GLOBAL</Text>
          <View style={styles.signalRow}>
            <Feather name="trending-down" size={12} color={colors.primary} />
            <Text style={[styles.signalText, { color: colors.primary }]}>RISK OFF</Text>
          </View>
        </View>
      </View>

      {watchlist.map((item) => (
        <WatchlistItem
          key={item.id}
          symbol={item.symbol}
          name={item.name}
          price={item.price}
          change={item.change}
          changeDirection={item.changeDirection as "up" | "down"}
          nearestLevel={item.nearestLevel}
          levelType={item.levelType as "support" | "resistance"}
          levelDistance={item.levelDistance}
          pressure={item.pressure as "COMPRADORES" | "VENDEDORES" | "NEUTRO"}
          pressureStrength={item.pressureStrength}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1,
    marginTop: 3,
  },
  pressureSummary: {
    flexDirection: "row",
    borderRadius: 4,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    alignItems: "center",
  },
  pressureCol: {
    flex: 1,
    alignItems: "center",
  },
  pressureNum: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  pressureColLabel: {
    fontSize: 7,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textAlign: "center",
    marginTop: 3,
  },
  pressureSep: {
    width: 1,
    height: 36,
    marginHorizontal: 8,
  },
  pressureSignal: {
    justifyContent: "center",
  },
  signalLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 4,
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  signalText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
});
