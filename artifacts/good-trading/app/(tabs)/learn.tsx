import React from "react";
import { ScrollView, View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { LearnCard } from "@/components/LearnCard";
import { learnCards } from "@/data/mockData";

export default function LearnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>LEARN</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          CONCEPTOS INSTITUCIONALES · {learnCards.length} MÓDULOS
        </Text>
      </View>

      <View style={[styles.infoBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>TOCA PARA EXPANDIR</Text>
        <Text style={[styles.infoText, { color: colors.secondaryForeground }]}>
          Cada tarjeta contiene conceptos utilizados en el análisis institucional. Toca para ver la explicación completa y puntos clave.
        </Text>
      </View>

      <View style={[styles.levelRow, { borderBottomColor: colors.border }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>BÁSICO</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>INTERMEDIO</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>AVANZADO</Text>
        </View>
      </View>

      {learnCards.map((card) => (
        <LearnCard
          key={card.id}
          title={card.title}
          shortDef={card.shortDef}
          content={card.content}
          keyPoints={card.keyPoints}
          category={card.category}
          level={card.level}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1,
    marginTop: 3,
  },
  infoBanner: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  levelRow: {
    flexDirection: "row",
    gap: 16,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
  },
});
