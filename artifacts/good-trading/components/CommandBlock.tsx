import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { useColors } from "@/hooks/useColors";

interface CommandBlockProps {
  asset: string;
  gamma: string;
  setup: string;
  probability: number;
  lastUpdate: string;
  marketMode?: string;
  confidence?: number | null;
}

export function CommandBlock({
  asset,
  gamma,
  setup,
  probability,
  lastUpdate,
  marketMode,
  confidence,
}: CommandBlockProps) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);


  return (
    <View style={[styles.container, { borderColor: colors.primary }]}>
      <View style={[styles.topBar, { borderBottomColor: "#1a0005" }]}>
        <View style={styles.liveRow}>
          <Animated.View
            style={[styles.livePulse, { backgroundColor: colors.primary, opacity: pulse }]}
          />
          <Text style={[styles.liveText, { color: colors.primary }]}>LIVE</Text>
        </View>
        <Text style={[styles.updateText, { color: colors.mutedForeground }]}>{lastUpdate}</Text>
      </View>

      <View style={styles.assetRow}>
        <Text style={[styles.assetSymbol, { color: colors.foreground }]}>{asset}</Text>
        <View style={[styles.arrow, { backgroundColor: "#1a0005" }]}>
          <Text style={[styles.arrowText, { color: colors.primary }]}>→</Text>
        </View>
        <Text style={[styles.gammaLabel, { color: colors.primary }]}>{gamma}</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: "#1a0005" }]} />

      <View style={styles.dataRow}>
        <View style={[styles.dataCell, { flex: 2 }]}>
          <Text style={[styles.dataCellLabel, { color: colors.mutedForeground }]}>MARKET MODE</Text>
          <Text style={[styles.dataCellValue, { color: colors.foreground }]}>{marketMode ?? "—"}</Text>
        </View>
        <View style={[styles.dataCellDivider, { backgroundColor: "#1a0005" }]} />
        <View style={styles.dataCell}>
          <Text style={[styles.dataCellLabel, { color: colors.mutedForeground }]}>CONFIDENCE</Text>
          <Text style={[styles.dataCellValue, { color: colors.gold }]}>{confidence !== null ? `${confidence}%` : "—"}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: "#1a0005" }]} />

      <View style={styles.dataRow}>
        <View style={styles.dataCell}>
          <Text style={[styles.dataCellLabel, { color: colors.mutedForeground }]}>SETUP ACTIVO</Text>
          <Text style={[styles.setupValue, { color: colors.foreground }]}>{setup}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    borderWidth: 1,
    borderLeftWidth: 3,
    backgroundColor: "#0d0000",
    marginBottom: 12,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#e01e2e",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
        }
      : {}),
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  livePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  updateText: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    flex: 1,
    letterSpacing: 0.3,
  },
  probPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  probText: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  assetSymbol: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  arrow: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  arrowText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  gammaLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    flex: 1,
  },
  divider: {
    height: 1,
    marginHorizontal: 0,
  },
  dataRow: {
    flexDirection: "row",
    paddingVertical: 14,
  },
  dataCell: {
    flex: 1,
    paddingHorizontal: 16,
  },
  dataCellDivider: {
    width: 1,
  },
  dataCellLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  dataCellValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  setupValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    lineHeight: 19,
  },
  tagsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tagPill: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  tagText: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
});
