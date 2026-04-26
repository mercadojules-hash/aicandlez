import { router } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const FEATURES = [
  { icon: "🌿", text: "Personalized herbal remedies & teas" },
  { icon: "🧠", text: "AI-powered wellness guidance" },
  { icon: "📋", text: "Custom wellness plans & recipes" },
  { icon: "✅", text: "Daily routines & habit tracking" },
];

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 20,
          paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 20,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.logoSection}>
        <View style={[styles.logoWrap, { backgroundColor: colors.secondary }]}>
          <Image
            source={require("@/assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.appName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Natura AI
        </Text>
        <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Your personal AI wellness coach
        </Text>
      </View>

      <View style={styles.featureList}>
        {FEATURES.map((f, i) => (
          <View
            key={i}
            style={[
              styles.featureRow,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius - 4,
              },
            ]}
          >
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <Text style={[styles.featureText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              {f.text}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.disclaimer,
          { backgroundColor: colors.muted, borderRadius: colors.radius - 4, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.disclaimerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Natura AI provides educational wellness suggestions only. Nothing in this app constitutes medical advice. Always consult a qualified healthcare provider.
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.push("/onboarding/goals")}
        style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        activeOpacity={0.85}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          Begin Your Journey
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 28,
  },
  logoSection: {
    alignItems: "center",
    paddingTop: 8,
    gap: 12,
  },
  logoWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  logo: {
    width: 108,
    height: 108,
  },
  appName: {
    fontSize: 32,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    textAlign: "center",
  },
  featureList: {
    gap: 10,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  featureIcon: { fontSize: 20 },
  featureText: { fontSize: 15, flex: 1 },
  disclaimer: {
    padding: 14,
    borderWidth: 1,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  button: {
    paddingVertical: 18,
    alignItems: "center",
  },
  buttonText: { fontSize: 16 },
});
