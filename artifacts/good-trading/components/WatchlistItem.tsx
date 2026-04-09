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
  pressure: "COMPRADORES" | "VENDEDORES" | "NEUTRO";
  pressureStrength: number;
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
  pressure,
  pressureStrength,
}: WatchlistItemProps) {
  const colors = useColors();
  const isUp = changeDirection === "up";
  const changeColor = isUp ? colors.success : colors.primary;

  const pressureColor =
    pressure === "COMPRADORES"
      ? colors.success
      : pressure === "VENDEDORES"
      ? colors.primary
      : colors.warning;

  const pressureBarColor =
    pressure === "COMPRADORES" ? colors.success : pressure === "VENDEDORES" ? colors.primary : colors.warning;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.symbolSection}>
          <Text style={[styles.symbol, { color: colors.foreground }]}>{symbol}</Text>
          <Text style={[styles.name, { color: colors.mutedForeground }]}>{name}</Text>
        </View>

        <View style={styles.priceSection}>
          <Text style={[styles.price, { color: colors.foreground }]}>${price}</Text>
          <View style={styles.changeRow}>
            <Feather name={isUp ? "arrow-up-right" : "arrow-down-right"} size={11} color={changeColor} />
            <Text style={[styles.change, { color: changeColor }]}>{change}</Text>
          </View>
        </View>

        <View style={[styles.levelSection, { borderLeftColor: colors.border }]}>
          <Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>
            {levelType === "support" ? "SOPTE." : "RESST."}
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

      <View style={[styles.pressureRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.pressureLabel, { color: colors.mutedForeground }]}>PRESIÓN</Text>

        <View style={[styles.pressureBar, { backgroundColor: colors.secondary }]}>
          <View
            style={[
              styles.pressureFill,
              {
                width: `${pressureStrength}%`,
                backgroundColor: pressureBarColor,
              },
            ]}
          />
        </View>

        <Text style={[styles.pressureValue, { color: pressureColor }]}>
          {pressure}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  symbolSection: {
    flex: 1.1,
  },
  symbol: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    letterSpacing: 0.2,
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
    gap: 2,
    marginTop: 3,
  },
  change: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  levelSection: {
    flex: 1,
    alignItems: "flex-end",
    borderLeftWidth: 1,
    paddingLeft: 12,
    marginLeft: 10,
  },
  levelLabel: {
    fontSize: 7,
    fontFamily: "Inter_700Bold",
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
    marginTop: 1,
  },
  pressureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 10,
  },
  pressureLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    width: 50,
  },
  pressureBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  pressureFill: {
    height: 4,
    borderRadius: 2,
  },
  pressureValue: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    width: 80,
    textAlign: "right",
  },
});
