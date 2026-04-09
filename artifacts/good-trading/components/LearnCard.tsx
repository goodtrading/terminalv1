import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface LearnCardProps {
  title: string;
  shortDef: string;
  content: string;
  keyPoints: string[];
  category: string;
  level: string;
}

export function LearnCard({ title, shortDef, content, keyPoints, category, level }: LearnCardProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const levelColor =
    level === "BÁSICO"
      ? colors.success
      : level === "INTERMEDIO"
      ? colors.warning
      : colors.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.header}>
        <View style={styles.badges}>
          <View style={[styles.categoryBadge, { borderColor: colors.border }]}>
            <Text style={[styles.categoryText, { color: colors.mutedForeground }]}>{category}</Text>
          </View>
          <View style={[styles.levelBadge, { borderColor: levelColor }]}>
            <Text style={[styles.levelText, { color: levelColor }]}>{level}</Text>
          </View>
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.mutedForeground}
        />
      </View>

      <Text style={[styles.title, { color: colors.primary }]}>{title}</Text>
      <Text style={[styles.shortDef, { color: colors.secondaryForeground }]}>{shortDef}</Text>

      {expanded && (
        <View style={[styles.expandedContent, { borderTopColor: colors.border }]}>
          <Text style={[styles.content, { color: colors.secondaryForeground }]}>{content}</Text>
          <View style={styles.keyPoints}>
            <Text style={[styles.keyPointsLabel, { color: colors.mutedForeground }]}>PUNTOS CLAVE</Text>
            {keyPoints.map((point, i) => (
              <View key={i} style={styles.pointRow}>
                <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
                <Text style={[styles.pointText, { color: colors.foreground }]}>{point}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  badges: {
    flexDirection: "row",
    gap: 6,
  },
  categoryBadge: {
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 2,
  },
  categoryText: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  levelBadge: {
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 2,
  },
  levelText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 4,
  },
  shortDef: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  expandedContent: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  content: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  keyPoints: {
    gap: 8,
  },
  keyPointsLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 7,
  },
  pointText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
