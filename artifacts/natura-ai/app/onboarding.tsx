import { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ImageBackground,
  Image,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { colors, radius, fontSizes, spacing } from "../constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NaturaLogo } from "../components/NaturaLogo";

const { width, height } = Dimensions.get("window");
const BG_IMAGE = "https://apexdigital.design/wp-content/uploads/2026/04/natura-splash-page-2.png";

// Preload image on module load
Image.prefetch(BG_IMAGE).catch(() => {});

export default function OnboardingScreen() {
  // Phase 1: logo fade-in
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale  = useRef(new Animated.Value(0.82)).current;

  // Phase 2: logo fade-out
  const logoExitOpacity = useRef(new Animated.Value(1)).current;
  const logoExitScale   = useRef(new Animated.Value(1)).current;

  // Phase 3: content fade-in
  const contentOpacity  = useRef(new Animated.Value(0)).current;
  const contentSlide    = useRef(new Animated.Value(24)).current;

  // Overlay: starts dark → lightens as content reveals
  const overlayOpacity  = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    Animated.sequence([
      // Phase 1: logo appears (0–600ms)
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, damping: 14, stiffness: 130, useNativeDriver: true }),
      ]),
      // Hold 200ms
      Animated.delay(200),
      // Phase 2 + 3: logo fades out, content + bg reveal (800ms+)
      Animated.parallel([
        Animated.timing(logoExitOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(logoExitScale,   { toValue: 0.94, duration: 450, useNativeDriver: true }),
        Animated.timing(overlayOpacity,  { toValue: 0.52, duration: 700, useNativeDriver: true }),
        Animated.timing(contentOpacity,  { toValue: 1,    duration: 650, useNativeDriver: true }),
        Animated.timing(contentSlide,    { toValue: 0,    duration: 650, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleBegin = async () => {
    await AsyncStorage.setItem("@natura_onboarded", "true");
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.root}>
      {/* Background image */}
      <ImageBackground
        source={{ uri: BG_IMAGE }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Dark gradient overlay — animated opacity */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayOpacity }]}>
        <LinearGradient
          colors={["rgba(10,24,16,0.85)", "rgba(8,20,13,0.92)"]}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Bottom gradient for text readability */}
      <LinearGradient
        colors={["transparent", "rgba(8,18,12,0.96)"]}
        style={styles.bottomGrad}
        pointerEvents="none"
      />

      {/* Phase 1: Logo only (centered) */}
      <Animated.View
        style={[
          styles.logoPhase,
          {
            opacity: Animated.multiply(logoOpacity, logoExitOpacity),
            transform: [
              { scale: Animated.multiply(logoScale, logoExitScale) as any },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <NaturaLogo size={100} />
      </Animated.View>

      {/* Phase 2: Full UI content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentSlide }],
          },
        ]}
      >
        {/* Logo + wordmark */}
        <View style={styles.brandRow}>
          <NaturaLogo size={48} />
          <View style={styles.brandText}>
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
  root: { flex: 1, backgroundColor: "#0a1810" },
  bottomGrad: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: height * 0.65,
  },
  logoPhase: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
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
    gap: 14,
    marginBottom: 28,
  },
  brandText: { flex: 1 },
  appName: {
    fontSize: fontSizes.xl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 3,
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
    marginBottom: 28,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 36,
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
    shadowOpacity: 0.5,
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
