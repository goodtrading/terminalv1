import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const DIFFERENTIALS = [
  {
    icon: "zap" as const,
    title: "ALERTAS INSTITUCIONALES",
    text: "Notificaciones push en tiempo real cuando cambia el gamma o rompe una zona clave.",
  },
  {
    icon: "activity" as const,
    title: "GAMMA EN VIVO",
    text: "Exposición gamma actualizada cada 15 min. Sabes qué harán los dealers antes de que lo hagan.",
  },
  {
    icon: "crosshair" as const,
    title: "ZONAS DE LIQUIDEZ",
    text: "Mapas de liquidez institucional. Exactamente dónde están los stops y dónde va el precio.",
  },
  {
    icon: "bar-chart-2" as const,
    title: "FLUJOS DE OPCIONES",
    text: "Análisis diario del dark pool y opciones inusuales. Lo que el smart money mueve hoy.",
  },
  {
    icon: "users" as const,
    title: "COMUNIDAD PRIVADA",
    text: "1,200+ traders activos. Análisis en vivo, sesiones de mercado y acceso directo.",
  },
];

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroHeader}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={[styles.logo, { borderColor: colors.primary }]}
          resizeMode="contain"
        />
        <View style={styles.heroText}>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            GOOD<Text style={{ color: colors.primary }}>TRADING</Text> PRO
          </Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            INTEL QUE EL MERCADO NO REGALA
          </Text>
        </View>
      </View>

      <View style={[styles.urgencyBanner, { backgroundColor: "#1a0000", borderColor: colors.primary }]}>
        <Feather name="clock" size={12} color={colors.primary} />
        <Text style={[styles.urgencyText, { color: colors.primary }]}>
          OFERTA FUNDADORES · PRECIO SUBE EN 7 DÍAS
        </Text>
      </View>

      <View style={[styles.planSelector, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.planOption,
            selectedPlan === "monthly" && {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setSelectedPlan("monthly")}
          activeOpacity={0.8}
        >
          <Text style={[styles.planAmount, { color: selectedPlan === "monthly" ? colors.foreground : colors.mutedForeground }]}>
            $29
          </Text>
          <Text style={[styles.planPeriod, { color: colors.mutedForeground }]}>/ MES</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.planOption,
            selectedPlan === "yearly" && {
              backgroundColor: "#1a0005",
              borderColor: colors.primary,
            },
          ]}
          onPress={() => setSelectedPlan("yearly")}
          activeOpacity={0.8}
        >
          <View style={styles.planTopRow}>
            <Text style={[styles.planAmount, { color: selectedPlan === "yearly" ? colors.foreground : colors.mutedForeground }]}>
              $199
            </Text>
            <View style={[styles.saveBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.saveText}>AHORRA 43%</Text>
            </View>
          </View>
          <Text style={[styles.planPeriod, { color: colors.mutedForeground }]}>/ AÑO · $16.5/mes</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[
          styles.ctaButton,
          { backgroundColor: colors.primary },
        ]}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>
          {selectedPlan === "yearly" ? "ACTIVAR PRO — $199/AÑO" : "ACTIVAR PRO — $29/MES"}
        </Text>
        <Feather name="arrow-right" size={16} color="#ffffff" />
      </TouchableOpacity>

      <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>
        Sin contratos. Cancela cuando quieras.
      </Text>

      <View style={[styles.sectionDivider, { borderTopColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>QUÉ INCLUYE PRO</Text>
      </View>

      {DIFFERENTIALS.map((d) => (
        <View
          key={d.title}
          style={[styles.diffRow, { borderBottomColor: colors.border }]}
        >
          <View style={[styles.diffIcon, { backgroundColor: "#1a0005" }]}>
            <Feather name={d.icon} size={14} color={colors.primary} />
          </View>
          <View style={styles.diffContent}>
            <Text style={[styles.diffTitle, { color: colors.foreground }]}>{d.title}</Text>
            <Text style={[styles.diffText, { color: colors.secondaryForeground }]}>{d.text}</Text>
          </View>
        </View>
      ))}

      <View style={[styles.communityCard, { backgroundColor: "#080808", borderColor: colors.border }]}>
        <View style={styles.communityTop}>
          <Feather name="message-circle" size={16} color={colors.primary} />
          <Text style={[styles.communityTitle, { color: colors.foreground }]}>COMUNIDAD PRIVADA</Text>
          <View style={[styles.livePill, { borderColor: colors.success }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.livePillText, { color: colors.success }]}>1.2K ACTIVOS</Text>
          </View>
        </View>
        <Text style={[styles.communityDesc, { color: colors.secondaryForeground }]}>
          Traders que operan con contexto real. No teoría — setups activos, análisis en vivo y cuando el mercado se mueve, alguien ya lo vio venir.
        </Text>
        <TouchableOpacity
          style={[styles.communityBtn, { borderColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.communityBtnText, { color: colors.primary }]}>VER COMUNIDAD</Text>
          <Feather name="external-link" size={12} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity>
          <Text style={[styles.footerLink, { color: colors.mutedForeground }]}>Términos</Text>
        </TouchableOpacity>
        <Text style={[styles.footerDot, { color: colors.border }]}>·</Text>
        <TouchableOpacity>
          <Text style={[styles.footerLink, { color: colors.mutedForeground }]}>Privacidad</Text>
        </TouchableOpacity>
        <Text style={[styles.footerDot, { color: colors.border }]}>·</Text>
        <TouchableOpacity>
          <Text style={[styles.footerLink, { color: colors.mutedForeground }]}>Soporte</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>v1.0.0 · GOODTRADING</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 4,
    borderWidth: 2,
  },
  heroText: {},
  heroTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  heroSub: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.5,
    marginTop: 3,
  },
  urgencyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 4,
    marginBottom: 14,
  },
  urgencyText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  planSelector: {
    flexDirection: "row",
    borderRadius: 4,
    borderWidth: 1,
    padding: 6,
    gap: 6,
    marginBottom: 12,
  },
  planOption: {
    flex: 1,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "transparent",
    padding: 14,
  },
  planTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  planAmount: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  planPeriod: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  saveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
  },
  saveText: {
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  ctaButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 2,
    marginBottom: 8,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#e01e2e",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        }
      : {}),
  },
  ctaText: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  ctaNote: {
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
    letterSpacing: 0.3,
  },
  sectionDivider: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  diffRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  diffIcon: {
    width: 34,
    height: 34,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  diffContent: {
    flex: 1,
  },
  diffTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  diffText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  communityCard: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  communityTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  communityTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    flex: 1,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  livePillText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  communityDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 14,
  },
  communityBtn: {
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  communityBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    marginBottom: 10,
    gap: 8,
  },
  footerLink: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  footerDot: {
    fontSize: 12,
  },
  version: {
    textAlign: "center",
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1,
    marginBottom: 4,
  },
});
