import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface WatchlistItemProps {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changeDirection: "up" | "down";
  nearestLevel: string;
  levelType: "support" | "resistance";
  levelDistance: string;
}

export function WatchlistItem({
  symbol,
  name,
  price,
  change,
  changeDirection,
  nearestLevel,
  levelType,
  levelDistance,
}: WatchlistItemProps) {
  const colors = useColors();
  const isUp = changeDirection === "up";
  const changeColor = isUp ? colors.success : colors.primary;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.symbolSection}>
        <Text style={[styles.symbol, { color: colors.foreground }]}>{symbol}</Text>
        <Text style={[styles.name, { color: colors.mutedForeground }]}>{name}</Text>
      </View>

      <View style={styles.priceSection}>
        <Text style={[styles.price, { color: colors.foreground }]}>${price}</Text>
        <View style={styles.changeRow}>
          <Feather
            name={isUp ? "trending-up" : "trending-down"}
            size={10}
            color={changeColor}
          />
          <Text style={[styles.change, { color: changeColor }]}>{change}</Text>
        </View>
      </View>

      <View style={[styles.levelSection, { borderLeftColor: colors.border }]}>
        <Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>
          {levelType === "support" ? "SOPORTE" : "RESIST."} CERCANO
        </Text>
        <Text
          style={[
            styles.levelPrice,
            { color: levelType === "support" ? colors.success : colors.primary },
          ]}
        >
          ${nearestLevel}
        </Text>
        <Text style={[styles.levelDistance, { color: colors.mutedForeground }]}>{levelDistance}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 4,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    alignItems: "center",
  },
  symbolSection: {
    flex: 1.2,
  },
  symbol: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  priceSection: {
    flex: 1.2,
    alignItems: "flex-end",
  },
  price: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  change: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  levelSection: {
    flex: 1.2,
    alignItems: "flex-end",
    borderLeftWidth: 1,
    paddingLeft: 12,
    marginLeft: 8,
  },
  levelLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  levelPrice: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  levelDistance: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
