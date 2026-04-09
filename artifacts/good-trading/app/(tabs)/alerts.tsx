import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useGetAlerts, getGetAlertsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { AlertItem } from "@/components/AlertItem";

type FilterType = "all" | "active" | "executed";

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("all");
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const params = filter !== "all" ? { status: filter as "active" | "executed" } : {};

  const { data, isLoading, isError } = useGetAlerts(params, {
    query: {
      refetchInterval: 7_000,
      staleTime: 5_000,
      queryKey: getGetAlertsQueryKey(params),
    },
  });

  const alerts = data?.alerts ?? [];
  const activeCount = data?.activeCount ?? 0;
  const total = data?.total ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey(params) });
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>ALERTAS</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            <Text style={{ color: colors.primary }}>{activeCount} ACTIVAS</Text>
            {" · "}{total} TOTAL
          </Text>
        </View>
        {activeCount > 0 && (
          <View style={[styles.urgencyPill, { backgroundColor: "#1a0005", borderColor: colors.primary }]}>
            <Feather name="alert-circle" size={11} color={colors.primary} />
            <Text style={[styles.urgencyText, { color: colors.primary }]}>REQUIEREN ATENCIÓN</Text>
          </View>
        )}
      </View>

      <View style={[styles.filterRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["all", "active", "executed"] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]}
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

      {isLoading && alerts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError && alerts.length === 0 ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Sin conexión al servidor
          </Text>
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bell-off" size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Sin alertas en esta categoría
          </Text>
        </View>
      ) : (
        alerts.map((alert) => (
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
  container: { flex: 1 },
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
  center: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
