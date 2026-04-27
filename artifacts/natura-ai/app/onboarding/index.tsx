import { router } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BG = "#0E1B14";
const PRIMARY = "#66BB6A";
const SOFT_GREEN = "#B8E6C1";
const TEXT = "#F5F7F4";
const MUTED = "rgba(245,247,244,0.55)";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Background glow behind logo */}
      <View style={styles.glowOuter} />
      <View style={styles.glowInner} />

      {/* Hero — logo, title, tagline */}
      <View
        style={[
          styles.hero,
          { paddingTop: Platform.OS === "web" ? 90 : insets.top + 64 },
        ]}
      >
        <View style={styles.logoRing}>
          <Image
            source={require("@/assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.appName}>Natura AI</Text>
        <Text style={styles.tagline}>Your personal AI wellness coach</Text>

        <View style={styles.divider} />

        <Text style={styles.subtitle}>
          Natural remedies · Wellness plans · AI guidance
        </Text>
      </View>

      {/* Mountain / landscape silhouette */}
      <View style={styles.landscape}>
        <View style={[styles.hill, styles.hillFar]} />
        <View style={[styles.hill, styles.hillMid]} />
        <View style={[styles.hill, styles.hillNear]} />
      </View>

      {/* CTA button */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 28 },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.push("/onboarding/goals")}
          style={styles.button}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Begin Your Journey</Text>
        </TouchableOpacity>
        <Text style={styles.fine}>
          Natural wellness, backed by AI
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },

  /* Glow effect behind logo */
  glowOuter: {
    position: "absolute",
    top: -40,
    alignSelf: "center",
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: "#1A3A26",
    opacity: 0.5,
  },
  glowInner: {
    position: "absolute",
    top: 20,
    alignSelf: "center",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#2E6B42",
    opacity: 0.25,
  },

  /* Hero section */
  hero: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 36,
    zIndex: 1,
  },
  logoRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(102,187,106,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(102,187,106,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  logo: {
    width: 96,
    height: 96,
  },
  appName: {
    fontSize: 40,
    color: TEXT,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 16,
    color: SOFT_GREEN,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 24,
    opacity: 0.9,
  },
  divider: {
    marginTop: 24,
    marginBottom: 16,
    width: 36,
    height: 2,
    borderRadius: 1,
    backgroundColor: PRIMARY,
    opacity: 0.7,
  },
  subtitle: {
    fontSize: 13,
    color: MUTED,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    letterSpacing: 0.3,
  },

  /* Landscape silhouette */
  landscape: {
    height: 160,
    position: "relative",
    overflow: "hidden",
  },
  hill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  hillFar: {
    height: 110,
    backgroundColor: "#142B1E",
    borderTopLeftRadius: 260,
    borderTopRightRadius: 180,
    left: -40,
    right: -20,
  },
  hillMid: {
    height: 90,
    backgroundColor: "#1A3325",
    borderTopLeftRadius: 120,
    borderTopRightRadius: 340,
    left: 20,
    right: -50,
  },
  hillNear: {
    height: 65,
    backgroundColor: "#1E3D2B",
    borderTopLeftRadius: 320,
    borderTopRightRadius: 140,
    left: -20,
    right: 10,
  },

  /* Footer */
  footer: {
    paddingHorizontal: 28,
    paddingTop: 4,
    backgroundColor: "#1E3D2B",
    alignItems: "center",
    zIndex: 1,
  },
  button: {
    width: "100%",
    backgroundColor: PRIMARY,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 14,
  },
  buttonText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  fine: {
    fontSize: 12,
    color: MUTED,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
