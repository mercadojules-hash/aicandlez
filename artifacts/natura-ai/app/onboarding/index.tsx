import { router } from "expo-router";
import { Image } from "expo-image";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "web" ? 67 : insets.top,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
        },
      ]}
    >
      <View style={styles.logoSection}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text
          style={[
            styles.tagline,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          Natural wellness, guided by AI
        </Text>
      </View>

      <View style={styles.featureList}>
        {[
          { icon: "🌿", text: "Personalized herbal remedies & teas" },
          { icon: "🧠", text: "AI-powered wellness guidance" },
          { icon: "📋", text: "Custom wellness plans & recipes" },
          { icon: "✅", text: "Daily routines & habit tracking" },
        ].map((f, i) => (
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
            <Text
              style={[
                styles.featureText,
                { color: colors.foreground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {f.text}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.disclaimer,
          {
            backgroundColor: colors.muted,
            borderRadius: colors.radius - 4,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.disclaimerText,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          Natura AI provides educational wellness suggestions only. Nothing in this app constitutes medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.push("/onboarding/disclaimer")}
        style={[
          styles.button,
          { backgroundColor: colors.primary, borderRadius: colors.radius },
        ]}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.buttonText,
            { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          Get Started
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  logoSection: {
    alignItems: "center",
    paddingTop: 24,
  },
  logo: {
    width: 160,
    height: 160,
  },
  tagline: {
    fontSize: 16,
    marginTop: 8,
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
  featureIcon: {
    fontSize: 20,
  },
  featureText: {
    fontSize: 15,
    flex: 1,
  },
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
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 16,
  },
});
