import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface MarketStatusCardProps {
  bias: string;
  gamma: string;
  zone: string;
  scenario: string;
  lastUpdate: string;
  biasStrength: number;
}

export function MarketStatusCard({
  bias,
  gamma,
  zone,
  scenario,
  lastUpdate,
  biasStrength,
}: MarketStatusCardProps) {
  const colors = useColors();

  const isBearish = bias === "BEARISH";
  const biasColor = isBearish ? colors.primary : colors.success;

  const gammaColor = gamma === "SHORT" ? colors.primary : colors.success;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>ESTADO DEL MERCADO</Text>
        <Text style={[styles.update, { color: colors.mutedForeground }]}>{lastUpdate}</Text>
      </View>

      <View style={styles.grid}>
        <View style={[styles.cell, { borderColor: colors.border }]}>
          <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>BIAS</Text>
          <Text style={[styles.cellValue, { color: biasColor }]}>{bias}</Text>
          <Text style={[styles.cellSub, { color: colors.mutedForeground }]}>{biasStrength}%</Text>
        </View>

        <View style={[styles.cell, { borderColor: colors.border }]}>
          <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>GAMMA</Text>
          <Text style={[styles.cellValue, { color: gammaColor }]}>{gamma}</Text>
          <Text style={[styles.cellSub, { color: colors.mutedForeground }]}>NETA</Text>
        </View>

        <View style={[styles.cell, { borderColor: colors.border }]}>
          <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>ZONA</Text>
          <Text style={[styles.cellValue, { color: colors.warning, fontSize: 11 }]}>{zone}</Text>
          <Text style={[styles.cellSub, { color: colors.mutedForeground }]}>FASE</Text>
        </View>

        <View style={[styles.cell, { borderColor: colors.border, borderRightWidth: 0 }]}>
          <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>ESCENARIO</Text>
          <Text style={[styles.cellValue, { color: colors.primary, fontSize: 10 }]}>{scenario}</Text>
          <Text style={[styles.cellSub, { color: colors.mutedForeground }]}>ACTUAL</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  update: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: "center",
    borderRightWidth: 1,
  },
  cellLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 6,
  },
  cellValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  cellSub: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
    marginTop: 4,
  },
});
