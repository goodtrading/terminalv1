import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface GammaCardProps {
  state: string;
  level: number;
  netGamma: string;
  flipPoint: string;
  description: string;
  dominantExpiry: string;
}

export function GammaCard({
  state,
  level,
  netGamma,
  flipPoint,
  description,
  dominantExpiry,
}: GammaCardProps) {
  const colors = useColors();
  const isShort = state === "SHORT";
  const stateColor = isShort ? colors.primary : colors.success;
  const absLevel = Math.abs(level);
  const barWidth = `${absLevel}%` as const;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GAMMA EXPOSURE</Text>
        <View style={[styles.stateBadge, { borderColor: stateColor }]}>
          <Text style={[styles.stateText, { color: stateColor }]}>GAMMA {state}</Text>
        </View>
      </View>

      <View style={styles.barContainer}>
        <View style={[styles.barTrack, { backgroundColor: colors.secondary }]}>
          <View
            style={[
              styles.barFill,
              {
                width: barWidth,
                backgroundColor: stateColor,
                alignSelf: isShort ? "flex-start" : "flex-end",
              },
            ]}
          />
        </View>
        <View style={styles.barLabels}>
          <Text style={[styles.barLabel, { color: colors.success }]}>LONG</Text>
          <Text style={[styles.barLevel, { color: stateColor }]}>{level}</Text>
          <Text style={[styles.barLabel, { color: colors.primary }]}>SHORT</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>GAMMA NETA</Text>
          <Text style={[styles.statValue, { color: stateColor }]}>{netGamma}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>FLIP POINT</Text>
          <Text style={[styles.statValue, { color: colors.gold }]}>${flipPoint}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>EXP. DOMINANTE</Text>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{dominantExpiry}</Text>
        </View>
      </View>

      <Text style={[styles.description, { color: colors.secondaryForeground, borderTopColor: colors.border }]}>
        {description}
      </Text>
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
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  stateBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  stateText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  barContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  barLevel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
  },
  statLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: "center",
  },
  statValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    padding: 16,
    borderTopWidth: 1,
    color: "#888888",
  },
});
