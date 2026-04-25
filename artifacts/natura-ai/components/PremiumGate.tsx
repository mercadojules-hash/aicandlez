import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
  compact?: boolean;
}

export function PremiumGate({ children, feature, compact = false }: PremiumGateProps) {
  const colors = useColors();
  const { isPremium, openPaywall } = useSubscription();

  if (isPremium) return <>{children}</>;

  if (compact) {
    return (
      <TouchableOpacity
        onPress={openPaywall}
        activeOpacity={0.85}
        style={[
          styles.compactLock,
          { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius - 4 },
        ]}
      >
        <Feather name="lock" size={14} color={colors.primary} />
        <Text style={[styles.compactText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          {feature ?? "Premium"}
        </Text>
        <Feather name="arrow-right" size={13} color={colors.primary} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.blurredContent} pointerEvents="none">
        {children}
      </View>
      <View style={[styles.overlay, { borderRadius: colors.radius - 4 }]}>
        <View style={[styles.overlayCard, { backgroundColor: colors.card, borderRadius: colors.radius - 4, borderColor: colors.border }]}>
          <View style={[styles.lockCircle, { backgroundColor: colors.secondary, borderRadius: 30 }]}>
            <Feather name="lock" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.overlayTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Premium Feature
          </Text>
          {feature && (
            <Text style={[styles.overlayFeature, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {feature} is available on Natura AI Coach.
            </Text>
          )}
          <TouchableOpacity
            onPress={openPaywall}
            activeOpacity={0.85}
            style={[styles.unlockBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
          >
            <Feather name="star" size={14} color="#fff" />
            <Text style={[styles.unlockText, { fontFamily: "Inter_600SemiBold" }]}>
              Unlock Premium
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative" },
  blurredContent: { opacity: 0.18 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  overlayCard: {
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    gap: 10,
    width: "100%",
  },
  lockCircle: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  overlayTitle: { fontSize: 16 },
  overlayFeature: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 7,
    marginTop: 4,
  },
  unlockText: { color: "#fff", fontSize: 14 },
  compactLock: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 7,
    alignSelf: "flex-start",
  },
  compactText: { fontSize: 13 },
});
