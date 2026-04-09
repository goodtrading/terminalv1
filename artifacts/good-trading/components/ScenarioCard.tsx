import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ScenarioCardProps {
  title: string;
  description: string;
  probability: number;
  outlook: string;
  timeframe: string;
  tags: string[];
}

export function ScenarioCard({
  title,
  description,
  probability,
  outlook,
  timeframe,
  tags,
}: ScenarioCardProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ESCENARIO ACTIVO</Text>
        <View style={[styles.probBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.probText}>{probability}%</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: colors.primary }]}>{title}</Text>

      <Text style={[styles.description, { color: colors.secondaryForeground }]}>{description}</Text>

      <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>OUTLOOK</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>{outlook}</Text>
        </View>
        <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>TIMEFRAME</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>{timeframe}</Text>
        </View>
      </View>

      <View style={styles.tagsRow}>
        {tags.map((tag) => (
          <View
            key={tag}
            style={[styles.tag, { borderColor: colors.primary }]}
          >
            <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
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
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 10,
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 12,
    marginBottom: 12,
  },
  metaItem: {
    flex: 1,
  },
  metaDivider: {
    width: 1,
    marginHorizontal: 12,
  },
  metaLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  tagText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
});
