import React from "react";
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Image, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const PREMIUM_FEATURES = [
  { icon: "zap" as const, text: "Alertas en tiempo real con push notifications" },
  { icon: "activity" as const, text: "Gamma exposure actualizado cada 15 minutos" },
  { icon: "target" as const, text: "Zonas de liquidez institucional avanzadas" },
  { icon: "bar-chart-2" as const, text: "Análisis de flujos de opciones diario" },
  { icon: "users" as const, text: "Acceso a comunidad privada de traders" },
  { icon: "book" as const, text: "Biblioteca completa de estrategias" },
];

export default function ProfileScreen() {
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
      <View style={styles.profileSection}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={[styles.avatar, { borderColor: colors.primary }]}
          resizeMode="cover"
        />
        <View>
          <Text style={[styles.userName, { color: colors.foreground }]}>TRADER</Text>
          <Text style={[styles.plan, { color: colors.mutedForeground }]}>PLAN FREE · ACCESO BÁSICO</Text>
        </View>
        <View style={[styles.freeTag, { borderColor: colors.border }]}>
          <Text style={[styles.freeTagText, { color: colors.mutedForeground }]}>FREE</Text>
        </View>
      </View>

      <View style={[styles.premiumCard, { backgroundColor: "#0d0000", borderColor: colors.primary }]}>
        <View style={styles.premiumHeader}>
          <View>
            <Text style={[styles.premiumLabel, { color: colors.primary }]}>GOODTRADING PRO</Text>
            <Text style={[styles.premiumSub, { color: colors.mutedForeground }]}>
              ACCESO INSTITUCIONAL COMPLETO
            </Text>
          </View>
          <Image
            source={require("@/assets/images/icon.png")}
            style={styles.premiumLogo}
            resizeMode="contain"
          />
        </View>

        <View style={[styles.pricingRow, { borderTopColor: "#330000", borderBottomColor: "#330000" }]}>
          <View style={styles.pricingOption}>
            <Text style={[styles.pricingAmount, { color: colors.foreground }]}>$29</Text>
            <Text style={[styles.pricingPeriod, { color: colors.mutedForeground }]}>/ MES</Text>
          </View>
          <View style={[styles.pricingDivider, { backgroundColor: "#330000" }]} />
          <View style={styles.pricingOption}>
            <View style={styles.yearlyRow}>
              <Text style={[styles.pricingAmount, { color: colors.foreground }]}>$199</Text>
              <View style={[styles.saveBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.saveText}>-43%</Text>
              </View>
            </View>
            <Text style={[styles.pricingPeriod, { color: colors.mutedForeground }]}>/ AÑO</Text>
          </View>
        </View>

        <View style={styles.featuresList}>
          {PREMIUM_FEATURES.map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <Feather name={f.icon} size={13} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.secondaryForeground }]}>{f.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={styles.upgradeBtnText}>UPGRADE A PRO</Text>
          <Feather name="arrow-right" size={14} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.communityHeader}>
          <Feather name="message-circle" size={18} color={colors.primary} />
          <View style={styles.communityText}>
            <Text style={[styles.communityTitle, { color: colors.foreground }]}>COMUNIDAD PRIVADA</Text>
            <Text style={[styles.communitySub, { color: colors.mutedForeground }]}>
              DISCORD · 1,200+ TRADERS ACTIVOS
            </Text>
          </View>
        </View>
        <Text style={[styles.communityDesc, { color: colors.secondaryForeground }]}>
          Únete a nuestra comunidad de traders institucionales. Análisis diario, sesiones en vivo y soporte directo.
        </Text>
        <TouchableOpacity
          style={[styles.communityBtn, { borderColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.communityBtnText, { color: colors.primary }]}>UNIRSE A LA COMUNIDAD</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.infoItem}>
          <Text style={[styles.infoItemText, { color: colors.mutedForeground }]}>Términos</Text>
        </TouchableOpacity>
        <View style={[styles.infoDot, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={styles.infoItem}>
          <Text style={[styles.infoItemText, { color: colors.mutedForeground }]}>Privacidad</Text>
        </TouchableOpacity>
        <View style={[styles.infoDot, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={styles.infoItem}>
          <Text style={[styles.infoItemText, { color: colors.mutedForeground }]}>Contacto</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>v1.0.0 · GOODTRADING</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 4,
    borderWidth: 2,
  },
  userName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  plan: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  freeTag: {
    marginLeft: "auto",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  freeTagText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  premiumCard: {
    borderRadius: 4,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  premiumHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  premiumLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  premiumSub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1,
    marginTop: 3,
  },
  premiumLogo: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  pricingRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  pricingOption: {
    flex: 1,
    alignItems: "center",
  },
  pricingDivider: {
    width: 1,
  },
  yearlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pricingAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  pricingPeriod: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1,
    marginTop: 3,
  },
  saveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  saveText: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  featuresList: {
    padding: 16,
    gap: 10,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  upgradeBtn: {
    margin: 16,
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 2,
  },
  upgradeBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  communityCard: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  communityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  communityText: {},
  communityTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  communitySub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
    marginTop: 2,
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
    alignItems: "center",
  },
  communityBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    marginBottom: 10,
    gap: 8,
  },
  infoItem: {
    paddingHorizontal: 4,
  },
  infoItemText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  infoDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  version: {
    textAlign: "center",
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1,
    marginBottom: 8,
  },
});
