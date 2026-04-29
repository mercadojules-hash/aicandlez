import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { useUser } from "../../contexts/UserContext";

const { width } = Dimensions.get("window");
const LOGO_URL = "https://apexdigital.design/wp-content/uploads/2026/04/natura-logo-clean.png";

// ─── Mood data ────────────────────────────────────────────────────────────────

interface SessionStep {
  label: string;
  icon: string;
  detail: string;
  route: string;
  color: string;
}

interface MoodRec {
  immediateResponse: string;
  summary: string;
  session: SessionStep[];
  firstStep: string;
}

const MOODS = [
  { id: "stressed",   label: "Feeling stressed", icon: "alert-circle", color: "#E57373" },
  { id: "low_energy", label: "Low energy",        icon: "battery",      color: "#FFB74D" },
  { id: "need_focus", label: "Need focus",         icon: "target",       color: "#4FC3F7" },
  { id: "exploring",  label: "Just exploring",     icon: "compass",      color: colors.primary },
] as const;

type MoodId = typeof MOODS[number]["id"];

const RECS: Record<MoodId, MoodRec> = {
  stressed: {
    immediateResponse: "Got it. Let's slow things down.",
    summary:
      "Start with a short breathing reset to calm your nervous system, then ease into a gentle yoga flow to dissolve physical tension.",
    session: [
      { label: "3 min breathing reset", icon: "wind",     detail: "3 min",  route: "/breathwork/box-breathing", color: "#4FC3F7" },
      { label: "Light yoga flow",        icon: "activity", detail: "15 min", route: "/flow/stress-relief",       color: colors.primary },
      { label: "Calm focus session",     icon: "circle",   detail: "Focus",  route: "/(tabs)/chakras",           color: "#9C27B0" },
    ],
    firstStep: "/breathwork/box-breathing",
  },
  low_energy: {
    immediateResponse: "I hear you. Let's build your energy up gently.",
    summary:
      "We'll wake you up with a centering breath, then move into a gentle morning flow that builds momentum without draining you.",
    session: [
      { label: "Energising breath",      icon: "wind",     detail: "5 min",  route: "/breathwork/calm-breathing", color: "#4FC3F7" },
      { label: "Morning energy flow",    icon: "activity", detail: "20 min", route: "/flow/morning-energy",       color: colors.primary },
      { label: "Solar Plexus focus",     icon: "sun",      detail: "Focus",  route: "/(tabs)/chakras",            color: "#FFB74D" },
    ],
    firstStep: "/breathwork/calm-breathing",
  },
  need_focus: {
    immediateResponse: "Perfect. Let's sharpen that clarity.",
    summary:
      "You're in a great state to deepen your practice. We'll synchronise your breath, then channel that clarity into dynamic movement.",
    session: [
      { label: "Box breathing",          icon: "wind",     detail: "4 min",  route: "/breathwork/box-breathing",  color: "#4FC3F7" },
      { label: "Morning energy flow",    icon: "activity", detail: "20 min", route: "/flow/morning-energy",       color: colors.primary },
      { label: "Third Eye session",      icon: "eye",      detail: "Focus",  route: "/(tabs)/chakras",            color: "#CE93D8" },
    ],
    firstStep: "/breathwork/box-breathing",
  },
  exploring: {
    immediateResponse: "Great. Let's explore what resonates with you.",
    summary:
      "Curiosity is the best starting point. Here's a balanced intro to movement, breath, and energy — follow what feels right.",
    session: [
      { label: "Calm breathing",         icon: "wind",     detail: "5 min",  route: "/breathwork/calm-breathing", color: "#4FC3F7" },
      { label: "Morning energy flow",    icon: "activity", detail: "20 min", route: "/flow/morning-energy",       color: colors.primary },
      { label: "Heart Chakra",           icon: "heart",    detail: "Focus",  route: "/(tabs)/chakras",            color: "#E57373" },
    ],
    firstStep: "/breathwork/calm-breathing",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIScreen() {
  const { profile } = useUser();
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);

  const moodOpacity  = useRef(new Animated.Value(1)).current;
  const moodScale    = useRef(new Animated.Value(1)).current;
  const recOpacity   = useRef(new Animated.Value(0)).current;
  const recSlide     = useRef(new Animated.Value(24)).current;

  const selectMood = (id: MoodId) => {
    Animated.sequence([
      Animated.timing(moodScale, { toValue: 0.97, duration: 90, useNativeDriver: true }),
      Animated.timing(moodScale, { toValue: 1,    duration: 110, useNativeDriver: true }),
    ]).start(() => {
      setSelectedMood(id);
      Animated.parallel([
        Animated.timing(moodOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(recOpacity,  { toValue: 1, duration: 480, useNativeDriver: true, delay: 180 }),
        Animated.timing(recSlide,    { toValue: 0, duration: 440, useNativeDriver: true, delay: 180 }),
      ]).start();
    });
  };

  const reset = () => {
    setSelectedMood(null);
    Animated.parallel([
      Animated.timing(moodOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(recOpacity,  { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    recSlide.setValue(24);
  };

  const rec  = selectedMood ? RECS[selectedMood] : null;
  const mood = selectedMood ? MOODS.find((m) => m.id === selectedMood) : null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <LinearGradient
            colors={[colors.primary + "28", colors.primary + "08"]}
            style={styles.headerBg}
          />
          <Image source={{ uri: LOGO_URL }} style={styles.headerLogo} resizeMode="contain" />
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{greeting}{profile.name ? `, ${profile.name}` : ""}</Text>
            <Text style={styles.headerTitle}>AI Wellness Coach</Text>
            <Text style={styles.headerSub}>Your AI wellness guide</Text>
            <Text style={styles.headerSub2}>
              Based on your energy, I'll guide your next session.
            </Text>
          </View>
        </View>

        {/* ── Mood Picker (Stage 1) ──────────────────────────────────── */}
        <Animated.View
          style={[styles.section, { opacity: moodOpacity, transform: [{ scale: moodScale }] }]}
          pointerEvents={selectedMood ? "none" : "auto"}
        >
          <Text style={styles.question}>How are you feeling today?</Text>
          <Text style={styles.questionSub}>I'll build a personalised session just for you.</Text>

          <View style={styles.moodGrid}>
            {MOODS.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => selectMood(m.id)}
                activeOpacity={0.78}
                style={[styles.moodBtn, { borderColor: m.color + "50" }]}
              >
                <LinearGradient
                  colors={[m.color + "20", m.color + "08"]}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                />
                <View style={[styles.moodIcon, { backgroundColor: m.color + "22" }]}>
                  <Feather name={m.icon as any} size={20} color={m.color} />
                </View>
                <Text style={[styles.moodLabel, { color: colors.text }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ── Recommendation (Stage 2) ───────────────────────────────── */}
        {selectedMood && rec && mood && (
          <Animated.View
            style={[
              styles.section,
              { opacity: recOpacity, transform: [{ translateY: recSlide }] },
            ]}
          >
            {/* Mood pill + change button */}
            <View style={styles.moodTagRow}>
              <View style={[styles.moodTag, { backgroundColor: mood.color + "20", borderColor: mood.color + "50" }]}>
                <Feather name={mood.icon as any} size={13} color={mood.color} />
                <Text style={[styles.moodTagText, { color: mood.color }]}>{mood.label}</Text>
              </View>
              <TouchableOpacity onPress={reset} style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* Immediate AI response */}
            <View style={[styles.immediateCard, { borderColor: colors.border }]}>
              <LinearGradient
                colors={[colors.primary + "20", colors.primary + "08"]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.immediateHeader}>
                <Image source={{ uri: LOGO_URL }} style={styles.recLogo} resizeMode="contain" />
                <View style={styles.immediateTextBlock}>
                  <Text style={styles.immediateResponse}>{rec.immediateResponse}</Text>
                  <Text style={styles.recText}>{rec.summary}</Text>
                </View>
              </View>
            </View>

            {/* Session plan */}
            <Text style={styles.sessionHeading}>Recommended session</Text>
            <View style={styles.sessionSteps}>
              {rec.session.map((step, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => router.push(step.route as any)}
                  activeOpacity={0.82}
                  style={[styles.stepCard, { borderColor: step.color + "40" }]}
                >
                  <LinearGradient
                    colors={[step.color + "18", step.color + "06"]}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={[styles.stepNum, { backgroundColor: step.color + "28" }]}>
                    <Text style={[styles.stepNumText, { color: step.color }]}>{i + 1}</Text>
                  </View>
                  <View style={[styles.stepIcon, { backgroundColor: step.color + "22" }]}>
                    <Feather name={step.icon as any} size={18} color={step.color} />
                  </View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepLabel}>{step.label}</Text>
                    <Text style={[styles.stepDetail, { color: step.color }]}>{step.detail}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.textDim} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Primary CTA */}
            <TouchableOpacity
              onPress={() => router.push(rec.firstStep as any)}
              activeOpacity={0.88}
              style={styles.ctaWrapper}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.ctaBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Feather name="play" size={18} color="#fff" />
                <Text style={styles.ctaText}>Start Session</Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.ctaHint}>Tap any step above to jump directly to it</Text>
          </Animated.View>
        )}

        {/* ── Explore section ────────────────────────────────────────── */}
        <View style={styles.exploreSection}>
          <Text style={styles.exploreTitle}>Explore on your own</Text>
          <View style={styles.exploreGrid}>
            {[
              { label: "Yoga Flows", icon: "activity", route: "/(tabs)/yoga",    color: colors.primary },
              { label: "Breathwork", icon: "wind",      route: "/(tabs)/breathe", color: "#4FC3F7" },
              { label: "Chakras",    icon: "circle",    route: "/(tabs)/chakras", color: "#CE93D8" },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => router.push(item.route as any)}
                style={[styles.exploreBtn, { borderColor: item.color + "40" }]}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[item.color + "18", item.color + "06"]}
                  style={StyleSheet.absoluteFillObject}
                />
                <Feather name={item.icon as any} size={20} color={item.color} />
                <Text style={styles.exploreBtnText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: "hidden",
  },
  headerBg: { ...StyleSheet.absoluteFillObject },
  headerLogo: { width: 52, height: 52, marginTop: 4 },
  headerText: { flex: 1 },
  greeting: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.primaryLight,
    marginBottom: 2,
  },
  headerSub2: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 18,
  },

  section: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },

  question: {
    fontSize: fontSizes.xl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 6,
  },
  questionSub: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  moodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  moodBtn: {
    width: (width - spacing.md * 2 - 10) / 2,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 16,
    overflow: "hidden",
    flexDirection: "column",
    gap: 10,
  },
  moodIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  moodLabel: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
  },

  moodTagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  moodTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  moodTagText: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  changeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  changeBtnText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.primary,
  },

  immediateCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  immediateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  recLogo: { width: 32, height: 32, marginTop: 2 },
  immediateTextBlock: { flex: 1 },
  immediateResponse: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: 8,
  },
  recText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
  },

  sessionHeading: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: 10,
  },
  sessionSteps: { gap: 10, marginBottom: spacing.lg },
  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 14,
    overflow: "hidden",
  },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  stepNumText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  stepIcon: {
    width: 38, height: 38, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  stepInfo: { flex: 1 },
  stepLabel: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: 2,
  },
  stepDetail: { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },

  ctaWrapper: { borderRadius: radius.xl, overflow: "hidden", marginBottom: 10 },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: radius.xl,
  },
  ctaText: { fontSize: fontSizes.lg, fontFamily: "Inter_600SemiBold", color: "#fff" },
  ctaHint: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    textAlign: "center",
    marginBottom: spacing.lg,
  },

  exploreSection: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  exploreTitle: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    color: colors.textMuted,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  exploreGrid: { flexDirection: "row", gap: 10 },
  exploreBtn: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  exploreBtnText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
    textAlign: "center",
  },
});
