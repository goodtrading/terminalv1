import React from "react";
import { ScrollView, View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { WatchlistItem } from "@/components/WatchlistItem";
import { watchlist, marketStatus } from "@/data/mockData";

export default function WatchlistScreen() {
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
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>WATCHLIST</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {watchlist.length} ACTIVOS · BIAS {marketStatus.bias}
          </Text>
        </View>
      </View>

      <View style={[styles.contextBanner, { backgroundColor: "#1a0005", borderColor: colors.primary }]}>
        <Text style={[styles.bannerLabel, { color: colors.mutedForeground }]}>CONTEXTO GLOBAL</Text>
        <Text style={[styles.bannerText, { color: colors.primary }]}>
          Mercado en fase RISK OFF · Reducir exposición · Soporte clave: BTC $80,500
        </Text>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.colHeader, { color: colors.mutedForeground, flex: 1.2 }]}>ACTIVO</Text>
        <Text style={[styles.colHeader, { color: colors.mutedForeground, flex: 1.2, textAlign: "right" }]}>
          PRECIO · CAMBIO
        </Text>
        <Text style={[styles.colHeader, { color: colors.mutedForeground, flex: 1.2, textAlign: "right" }]}>
          NIVEL CERCANO
        </Text>
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
  contextBanner: {
    borderRadius: 4,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 16,
  },
  bannerLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
  },
  colHeader: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
});
