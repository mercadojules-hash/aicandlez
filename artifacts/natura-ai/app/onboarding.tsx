import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { colors, radius, fontSizes, spacing } from "../constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

const LOGO_URL   = "https://apexdigital.design/wp-content/uploads/2026/04/natura-logo-clean.png";
const SPLASH_URL = "https://apexdigital.design/wp-content/uploads/2026/04/natura-splash-page-2.png";

// Preload both images immediately
Image.prefetch(LOGO_URL).catch(() => {});
Image.prefetch(SPLASH_URL).catch(() => {});

export default function OnboardingScreen() {
  // Stage 1: logo fades in
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.78)).current;
  // Stage 1 exit: logo fades out
  const logoExitOp   = useRef(new Animated.Value(1)).current;
  const logoExitSc   = useRef(new Animated.Value(1)).current;
  // Stage 2: splash bg fades in
  const splashOpacity = useRef(new Animated.Value(0)).current;
  // Stage 2: dark overlay lightens slightly
  const overlayOp    = useRef(new Animated.Value(0.85)).current;
  // Stage 2: content fades in
  const contentOp    = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.sequence([
      // Stage 1 — logo appears (0–700ms)
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, damping: 14, stiffness: 120, useNativeDriver: true }),
      ]),
      // Hold 400ms
      Animated.delay(400),
      // Stage 2 — logo out, splash + content in (1100ms–2600ms)
      Animated.parallel([
        Animated.timing(logoExitOp,    { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(logoExitSc,    { toValue: 0.92, duration: 500, useNativeDriver: true }),
        Animated.timing(splashOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(overlayOp,     { toValue: 0.55, duration: 900, useNativeDriver: true }),
        Animated.timing(contentOp,     { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(contentSlide,  { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleBegin = async () => {
    await AsyncStorage.setItem("@natura_onboarded", "true");
    router.replace("/(tabs)");
  };

  const logoAnimStyle = {
    opacity: Animated.multiply(logoOpacity, logoExitOp),
    transform: [{ scale: Animated.multiply(logoScale, logoExitSc) as any }],
  };

  return (
    <View style={styles.root}>
      {/* Always-visible dark green base */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#0B2E1F" }]} />

      {/* Stage 2: full splash image fades in */}
      <Animated.Image
        source={{ uri: SPLASH_URL }}
        style={[StyleSheet.absoluteFillObject, styles.splashImg, { opacity: splashOpacity }]}
        resizeMode="cover"
      />

      {/* Dark overlay for readability */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: overlayOp }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={["rgba(11,46,31,0.9)", "rgba(8,20,14,0.95)"]}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Bottom gradient for text area */}
      <LinearGradient
        colors={["transparent", "rgba(8,18,12,0.97)"]}
        style={styles.bottomGrad}
        pointerEvents="none"
      />

      {/* Stage 1: logo only, centered */}
      <Animated.View style={[styles.logoStage, logoAnimStyle]} pointerEvents="none">
        <Image
          source={{ uri: LOGO_URL }}
          style={styles.logoImg}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Stage 2: full UI content */}
      <Animated.View
        style={[
          styles.content,
          { opacity: contentOp, transform: [{ translateY: contentSlide }] },
        ]}
      >
        {/* Wordmark row */}
        <View style={styles.brandRow}>
          <Image source={{ uri: LOGO_URL }} style={styles.brandLogo} resizeMode="contain" />
          <View>
            <Text style={styles.appName}>Natura Yoga AI</Text>
            <Text style={styles.appTagline}>Wellness for mind, body & soul</Text>
          </View>
        </View>

        <Text style={styles.headline}>
          Find your balance{"\n"}through movement{"\n"}and breath
        </Text>

        {/* Feature chips */}
        <View style={styles.pillsRow}>
          {["🧘 Yoga", "🌬 Breathwork", "✨ Chakras", "🤖 AI Coach"].map((label) => (
            <View key={label} style={styles.pill}>
              <Text style={styles.pillText}>{label}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity onPress={handleBegin} activeOpacity={0.88}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.btn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.btnText}>Begin Your Journey</Text>
            <Feather name="arrow-right" size={20} color="#fff" style={{ marginLeft: 8 }} />
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.subNote}>No experience needed · Free forever</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splashImg: { width: "100%", height: "100%" },
  bottomGrad: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: height * 0.68,
  },
  logoStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: {
    width: 180,
    height: 180,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: 52,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  brandLogo: { width: 44, height: 44 },
  appName: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 2,
  },
  appTagline: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  headline: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    lineHeight: 42,
    letterSpacing: 0.3,
    marginBottom: 24,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 32,
  },
  pill: {
    backgroundColor: "rgba(78,173,124,0.18)",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(78,173,124,0.35)",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.primaryLight,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: radius.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  btnText: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  subNote: {
    marginTop: 14,
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    textAlign: "center",
  },
});
