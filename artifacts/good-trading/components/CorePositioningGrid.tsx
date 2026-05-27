import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface CorePositioningGridProps {
  globalFlip: string;
  localFlip: string;
  dealerPivot: string;
  currentZone: string;
}

export function CorePositioningGrid({
  globalFlip,
  localFlip,
  dealerPivot,
  currentZone,
}: CorePositioningGridProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.cell, { borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>GLOBAL FLIP</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{globalFlip}</Text>
        </View>
        <View style={[styles.cell, { borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>LOCAL FLIP</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{localFlip}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <View style={[styles.cell, { borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>DEALER PIVOT</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{dealerPivot}</Text>
        </View>
        <View style={[styles.cell, { borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>CURRENT ZONE</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{currentZone}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  cell: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
  },
  label: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
