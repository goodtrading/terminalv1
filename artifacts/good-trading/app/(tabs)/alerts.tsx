import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>ALERTAS</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {activeCount} ACTIVAS · {alerts.length} TOTAL
          </Text>
        </View>
      </View>

      <View style={[styles.filterRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["all", "active", "executed"] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterBtn,
              filter === f && { backgroundColor: colors.primary },
            ]}
            onPress={() => setFilter(f)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {f === "all" ? "TODAS" : f === "active" ? "ACTIVAS" : "EJECUTADAS"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Sin alertas</Text>
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
    paddingVertical: 7,
    borderRadius: 2,
    alignItems: "center",
  },
  filterText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  empty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
