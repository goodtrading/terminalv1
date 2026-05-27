import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

type DriverImpact = "high" | "medium" | "low";

type Driver = {
  label: string;
  impact: DriverImpact;
};

type Props = {
  drivers: Driver[];
};

const impactColor = {
  high: "#ff3333",
  medium: "#ffaa00",
  low: "#00ff88",
};

export function DriversCard({ drivers }: Props) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.mutedForeground }]}>DRIVERS</Text>

      {drivers.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>NO ACTIVE DRIVERS</Text>
      ) : (
        <View style={styles.chipsWrap}>
          {drivers.map((driver) => (
            <Text
              key={driver.label}
              style={[
                styles.chip,
                {
                  color: impactColor[driver.impact],
                  borderColor: impactColor[driver.impact],
                },
              ]}
            >
              {driver.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 20,
    marginBottom: 12,
    flex: 1,
    height: "100%",
  },
  title: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  empty: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 2,
  },
});
