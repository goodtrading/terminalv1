import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Zone {
  label: string;
  price: string;
  type: "resistance" | "support" | "current" | "neutral";
  distance: string;
}

interface KeyZonesCardProps {
  zones: Zone[];
}

export function KeyZonesCard({ zones }: KeyZonesCardProps) {
  const colors = useColors();

  const getZoneColor = (type: Zone["type"]) => {
    if (type === "resistance") return colors.primary;
    if (type === "support") return colors.success;
    if (type === "neutral") return "transparent";
    return colors.gold;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ZONAS CLAVE</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>BTC/USD</Text>
      </View>

      {zones.map((zone, index) => (
        <View
          key={zone.label}
          style={[
            styles.row,
            { borderBottomColor: colors.border },
            zone.type === "current" && { backgroundColor: "#1a1000" },
            index === zones.length - 1 && { borderBottomWidth: 0 },
          ]}
        >
          <View style={[styles.typeBar, { backgroundColor: getZoneColor(zone.type) }]} />

          <View style={styles.rowContent}>
            <Text style={[styles.zoneLabel, { color: colors.mutedForeground }]}>{zone.label}</Text>
            <View style={styles.rightSide}>
              <Text style={[styles.price, { color: zone.type === "current" ? colors.gold : colors.foreground }]}>
                {zone.price}
              </Text>
              <Text
                style={[
                  styles.distance,
                  {
                    color:
                      zone.type === "current"
                        ? colors.mutedForeground
                        : zone.distance.startsWith("+")
                        ? colors.success
                        : colors.primary,
                  },
                ]}
              >
                {zone.distance && zone.distance !== "—" && zone.distance !== "-"
                  ? zone.distance
                  : null}
              </Text>
            </View>
          </View>
        </View>
      ))}
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
  headerSub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  typeBar: {
    width: 3,
    height: "100%",
    minHeight: 44,
  },
  rowContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  zoneLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    flex: 1,
  },
  rightSide: {
    alignItems: "flex-end",
  },
  price: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  distance: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
