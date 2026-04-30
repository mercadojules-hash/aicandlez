import { useEffect, useRef } from "react";
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

const { height } = Dimensions.get("window");

const LOGO       = require("../assets/images/natura-logo-clean.png");
const SPLASH_URL = require("../assets/images/natura-splash-page-2.png");


export default function OnboardingScreen() {
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.78)).current;
  const logoExitOp   = useRef(new Animated.Value(1)).current;
  const logoExitSc   = useRef(new Animated.Value(1)).current;
  const contentOp    = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(22)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, damping: 14, stiffness: 120, useNativeDriver: true }),
      ]),
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(logoExitOp,   { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(logoExitSc,   { toValue: 0.88, duration: 380, useNativeDriver: true }),
        Animated.timing(contentOp,    { toValue: 1, duration: 600, useNativeDriver: true, delay: 180 }),
        Animated.timing(contentSlide, { toValue: 0, duration: 580, useNativeDriver: true, delay: 180 }),
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
      {/* Dark green base — shows while splash image loads */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#0B2E1F" }]} />

      {/* Splash background — full cover, no dark overlay */}
      <Image
        source={SPLASH_URL}
        style={[StyleSheet.absoluteFillObject, styles.splashImg]}
        resizeMode="cover"
      />

      {/* Subtle gradient only at bottom for text legibility */}
      <LinearGradient
        colors={["transparent", "rgba(8,20,14,0.72)"]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* Stage 1: logo fades in centered, then exits */}
      <Animated.View style={[styles.logoStage, logoAnimStyle]} pointerEvents="none">
        <View style={styles.logoGlow} />
        <Image source={LOGO} style={styles.logoStageImg} resizeMode="contain" />
      </Animated.View>

      {/* Stage 2: main content */}
      <Animated.View
        style={[styles.content, { opacity: contentOp, transform: [{ translateY: contentSlide }] }]}
      >
        {/* Center block — logo + title + subtitle */}
        <View style={styles.centerBlock}>
          <View style={styles.logoGlowLarge} />
          <Image source={LOGO} style={styles.contentLogo} resizeMode="contain" />
          <Text style={styles.appName}>Natura Yoga AI</Text>
          <Text style={styles.appSubtitle}>
            Find your balance through movement and breath
          </Text>
        </View>

        {/* Bottom block — pills + CTA */}
        <View style={styles.bottomBlock}>
          <View style={styles.pillsRow}>
            {[
              { icon: "activity" as const, label: "Yoga" },
              { icon: "wind"     as const, label: "Breathwork" },
              { icon: "circle"   as const, label: "Chakras" },
              { icon: "moon"     as const, label: "Meditation" },
            ].map(({ icon, label }) => (
              <View key={label} style={styles.pill}>
                <Feather name={icon} size={13} color="#A8D5BA" />
                <Text style={styles.pillText}>{label}</Text>
              </View>
            ))}
          </View>

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
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  splashImg: { width: "100%", height: "100%" },

  bottomScrim: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: height * 0.52,
  },

  logoStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlow: {
    position: "absolute",
    width: 200, height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(78,173,124,0.14)",
  },
  logoStageImg: { width: 150, height: 150 },

  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 50,
  },

  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 30,
  },
  logoGlowLarge: {
    position: "absolute",
    width: 230, height: 230,
    borderRadius: 115,
    backgroundColor: "rgba(78,173,124,0.10)",
  },
  contentLogo: {
    width: 150, height: 150,
    marginBottom: 16,
  },
  appName: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    marginBottom: 6,
    textAlign: "center",
  },
  appSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.70)",
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },

  bottomBlock: {
    paddingHorizontal: spacing.lg,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(78,173,124,0.18)",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(78,173,124,0.35)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: "#A8D5BA",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: radius.xl,
  },
  btnText: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
