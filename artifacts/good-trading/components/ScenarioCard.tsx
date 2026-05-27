import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ScenarioCardProps {
  title: string;
  label?: string;
  description: string;
  probability: number;
}

export function ScenarioCard({
  title,
  label,
  description,
  probability,
}: ScenarioCardProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ESCENARIO PROBABLE</Text>
      </View>

      {label && <Text style={[styles.label, { color: colors.primary }]}>{label}</Text>}
      <Text style={[styles.title, { color: colors.primary }]}>{title}</Text>

      <Text style={[styles.description, { color: colors.secondaryForeground }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 20,
    marginBottom: 12,
    flex: 1,
    height: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  probBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  probText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  label: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 14,
    lineHeight: 24,
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 14,
  },
});
