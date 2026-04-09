import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { AlertItem } from "@/components/AlertItem";
import { alerts } from "@/data/mockData";

type FilterType = "all" | "active" | "executed";

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterType>("all");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const filtered = alerts.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>ALERTAS</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            <Text style={{ color: colors.primary }}>{activeCount} ACTIVAS</Text>
            {" · "}{alerts.length} TOTAL
          </Text>
        </View>
        {activeCount > 0 && (
          <View
            style={[
              styles.urgencyPill,
              { backgroundColor: "#1a0005", borderColor: colors.primary },
            ]}
          >
            <Feather name="alert-circle" size={11} color={colors.primary} />
            <Text style={[styles.urgencyText, { color: colors.primary }]}>REQUIEREN ATENCIÓN</Text>
          </View>
        )}
      </View>

      <View style={[styles.filterRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["all", "active", "executed"] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterBtn,
              filter === f && { backgroundColor: colors.primary },
              filter !== f && { borderColor: "transparent" },
            ]}
            onPress={() => setFilter(f)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? "#ffffff" : colors.mutedForeground },
              ]}
            >
              {f === "all" ? "TODAS" : f === "active" ? `ACTIVAS (${activeCount})` : "EJECUTADAS"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="bell-off" size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Sin alertas en esta categoría</Text>
        </View>
      ) : (
        filtered.map((alert) => (
          <AlertItem
            key={alert.id}
            text={alert.text}
            timestamp={alert.timestamp}
            status={alert.status as "active" | "executed"}
            type={alert.type}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
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
  urgencyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 2,
  },
  urgencyText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  filterRow: {
    flexDirection: "row",
    borderRadius: 4,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 2,
    alignItems: "center",
  },
  filterText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  empty: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
