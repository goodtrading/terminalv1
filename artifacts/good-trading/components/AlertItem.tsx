import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface AlertItemProps {
  text: string;
  timestamp: string;
  status: "active" | "executed";
  type: string;
}

const TYPE_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  price: { icon: "trending-down", label: "PRECIO" },
  gamma: { icon: "zap", label: "GAMMA" },
  zone: { icon: "crosshair", label: "ZONA" },
  absorption: { icon: "layers", label: "ABSORCIÓN" },
  scenario: { icon: "alert-octagon", label: "ESCENARIO" },
};

export function AlertItem({ text, timestamp, status, type }: AlertItemProps) {
  const colors = useColors();
  const isActive = status === "active";
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  const config = TYPE_CONFIG[type] || { icon: "bell" as const, label: "ALERTA" };

  useEffect(() => {
    if (!isActive) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isActive, glowAnim]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isActive ? "#0d0000" : colors.card,
          borderColor: isActive ? colors.primary : colors.border,
          borderLeftColor: isActive ? colors.primary : colors.border,
          ...(Platform.OS === "ios" && isActive
            ? {
                shadowColor: "#e01e2e",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              }
            : {}),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.iconBox,
          {
            backgroundColor: isActive ? "#1a0005" : colors.secondary,
            opacity: isActive ? glowAnim : 1,
          },
        ]}
      >
        <Feather
          name={config.icon}
          size={15}
          color={isActive ? colors.primary : colors.mutedForeground}
        />
      </Animated.View>

      <View style={styles.content}>
        <View style={styles.typeRow}>
          <Text style={[styles.typeLabel, { color: isActive ? colors.primary : colors.mutedForeground }]}>
            {config.label}
          </Text>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isActive ? colors.primary : "transparent",
                borderColor: isActive ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: isActive ? "#ffffff" : colors.mutedForeground },
              ]}
            >
              {isActive ? "● ACTIVO" : "EJECUTADO"}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.text,
            { color: isActive ? colors.foreground : colors.secondaryForeground },
          ]}
        >
          {text}
        </Text>

        <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{timestamp}</Text>
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
    alignItems: "flex-start",
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
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
  text: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  timestamp: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
});
