import { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { colors, radius, fontSizes, spacing } from "../constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

export default function OnboardingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoScale, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(btnOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleBegin = async () => {
    await AsyncStorage.setItem("@natura_onboarded", "true");
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0a1810", "#0d1f16", "#112518"]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Background circles */}
      <View style={[styles.bgCircle, styles.bgCircle1]} />
      <View style={[styles.bgCircle, styles.bgCircle2]} />
      <View style={[styles.bgCircle, styles.bgCircle3]} />

      {/* Logo area */}
      <Animated.View
        style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark, "#2a6a45"]}
          style={styles.logoCircle}
        >
          <Feather name="wind" size={44} color="#fff" />
        </LinearGradient>

        <View style={styles.logoLeafs}>
          <View style={[styles.leaf, { transform: [{ rotate: "-30deg" }] }]} />
          <View style={[styles.leaf, { transform: [{ rotate: "30deg" }] }]} />
        </View>
      </Animated.View>

      {/* Text block */}
      <Animated.View
        style={[
          styles.textBlock,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Text style={styles.title}>Natura Yoga AI</Text>
        <Text style={styles.subtitle}>
          Find your balance through{"\n"}movement and breath
        </Text>
      </Animated.View>

      {/* Feature pills */}
      <Animated.View style={[styles.pillsRow, { opacity: btnOpacity }]}>
        {["Yoga", "Breathwork", "Chakras", "Meditation"].map((label) => (
          <View key={label} style={styles.pill}>
            <Text style={styles.pillText}>{label}</Text>
          </View>
        ))}
      </Animated.View>

      {/* CTA Button */}
      <Animated.View style={[styles.btnWrapper, { opacity: btnOpacity }]}>
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
        <Text style={styles.tagline}>No experience needed · Free forever</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  bgCircle: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.06,
    backgroundColor: colors.primary,
  },
  bgCircle1: { width: 320, height: 320, top: -80, right: -60 },
  bgCircle2: { width: 240, height: 240, bottom: 80, left: -80 },
  bgCircle3: { width: 160, height: 160, top: height / 2 - 80, right: -40, opacity: 0.04 },
  logoContainer: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoLeafs: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  leaf: {
    width: 10,
    height: 18,
    borderRadius: 999,
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  textBlock: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 26,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: spacing.xl,
  },
  pill: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
  },
  btnWrapper: {
    width: "100%",
    alignItems: "center",
  },
  btn: {
    width: width - 64,
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
  tagline: {
    marginTop: 14,
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
});
