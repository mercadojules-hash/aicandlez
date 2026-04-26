import { Feather } from "@expo/vector-icons";
import React, { useRef } from "react";
import {
  Animated,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/contexts/SubscriptionContext";

const BENEFITS = [
  { icon: "zap" as const, title: "Unlimited AI Coaching", desc: "Ask anything, anytime — no daily limits" },
  { icon: "list" as const, title: "Personalized Wellness Plans", desc: "Plans built around your goals and moods" },
  { icon: "trending-up" as const, title: "Progress Tracking", desc: "See your streak, mood patterns, and growth" },
  { icon: "shopping-cart" as const, title: "Grocery List Saving", desc: "Save and manage your remedy shopping lists" },
  { icon: "star" as const, title: "Advanced Recommendations", desc: "Deeper AI insights based on your history" },
  { icon: "award" as const, title: "Streak Insights", desc: "Detailed habit analytics and milestones" },
];

export function PaywallModal() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { showPaywall, closePaywall, upgradeToPremium } = useSubscription();
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const useND = Platform.OS !== "web";

  React.useEffect(() => {
    if (showPaywall) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 12, useNativeDriver: useND }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: useND }),
      ]).start();
    } else {
      scaleAnim.setValue(0.95);
      opacityAnim.setValue(0);
    }
  }, [showPaywall]);

  const handleUpgrade = async () => {
    await upgradeToPremium();
  };

  return (
    <Modal transparent animationType="fade" visible={showPaywall} statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderRadius: 28,
              paddingBottom: Platform.OS === "web" ? 32 : insets.bottom + 24,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <TouchableOpacity onPress={closePaywall} style={styles.closeBtn}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Header */}
          <View style={[styles.headerBg, { backgroundColor: colors.primary }]}>
            <Image
              source={require("@/assets/images/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.headerTitle, { color: "#fff", fontFamily: "Inter_700Bold" }]}>
              Natura AI Coach
            </Text>
            <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.8)", fontFamily: "Inter_400Regular" }]}>
              Your personal wellness companion — elevated
            </Text>
          </View>

          <ScrollView
            style={{ maxHeight: 420 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20 }}
          >
            <Text style={[styles.benefitsTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Everything in Premium
            </Text>

            {BENEFITS.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={[styles.benefitIcon, { backgroundColor: colors.secondary, borderRadius: 12 }]}>
                  <Feather name={b.icon} size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.benefitTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {b.title}
                  </Text>
                  <Text style={[styles.benefitDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {b.desc}
                  </Text>
                </View>
              </View>
            ))}

            <View style={[styles.pricingBox, { backgroundColor: colors.muted, borderRadius: 16, borderColor: colors.border }]}>
              <Text style={[styles.pricingLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                PREMIUM PLAN
              </Text>
              <View style={styles.priceRow}>
                <Text style={[styles.price, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  $9.99
                </Text>
                <Text style={[styles.pricePer, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  / month
                </Text>
              </View>
              <Text style={[styles.trialNote, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                7-day free trial — cancel anytime
              </Text>
            </View>
          </ScrollView>

          <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
            <TouchableOpacity
              onPress={handleUpgrade}
              activeOpacity={0.85}
              style={[styles.ctaBtn, { backgroundColor: colors.primary, borderRadius: 16 }]}
            >
              <Feather name="star" size={16} color="#fff" />
              <Text style={[styles.ctaText, { fontFamily: "Inter_700Bold" }]}>
                Start Free Trial
              </Text>
            </TouchableOpacity>
            <Text style={[styles.fine, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No charge during trial. Cancel before it ends to avoid billing.
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: { overflow: "hidden" },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 6,
  },
  headerBg: {
    paddingTop: 36,
    paddingBottom: 28,
    alignItems: "center",
    gap: 8,
  },
  logo: { width: 60, height: 60 },
  headerTitle: { fontSize: 24 },
  headerSub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  benefitsTitle: { fontSize: 16, marginBottom: 16 },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 16,
  },
  benefitIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  benefitTitle: { fontSize: 14, marginBottom: 2 },
  benefitDesc: { fontSize: 12, lineHeight: 18 },
  pricingBox: {
    padding: 18,
    borderWidth: 1,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  pricingLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  price: { fontSize: 38 },
  pricePer: { fontSize: 16, paddingBottom: 6 },
  trialNote: { fontSize: 13, marginTop: 6 },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 10,
    marginBottom: 12,
  },
  ctaText: { color: "#fff", fontSize: 17 },
  fine: { fontSize: 11, textAlign: "center" },
});
