import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface AlertItemProps {
  text: string;
  timestamp: string;
  status: "active" | "executed";
  type: string;
}

const typeIcons: Record<string, keyof typeof Feather.glyphMap> = {
  price: "trending-down",
  gamma: "activity",
  zone: "map-pin",
  absorption: "layers",
  scenario: "alert-circle",
};

export function AlertItem({ text, timestamp, status, type }: AlertItemProps) {
  const colors = useColors();
  const isActive = status === "active";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: isActive ? colors.primary : colors.border,
          borderLeftColor: isActive ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={styles.iconWrapper}>
        <Feather
          name={typeIcons[type] || "bell"}
          size={14}
          color={isActive ? colors.primary : colors.mutedForeground}
        />
      </View>
      <View style={styles.content}>
        <Text style={[styles.text, { color: isActive ? colors.foreground : colors.secondaryForeground }]}>
          {text}
        </Text>
        <View style={styles.footer}>
          <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{timestamp}</Text>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isActive ? colors.primary : "transparent",
                borderColor: isActive ? colors.primary : colors.mutedForeground,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: isActive ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {isActive ? "ACTIVO" : "EJECUTADO"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 4,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  iconWrapper: {
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timestamp: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  badgeText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
});
