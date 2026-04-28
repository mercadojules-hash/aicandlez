import { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { useStreak } from "../../hooks/useStreak";
import { useChecklist } from "../../hooks/useChecklist";

const { width } = Dimensions.get("window");

function ProgressBar({ value }: { value: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 800, useNativeDriver: false }).start();
  }, [value]);
  const w = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width: w }]} />
    </View>
  );
}

function CheckItem({ label, done, onPress }: { label: string; done: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.checkbox, done && styles.checkboxDone]}>
        {done && <Feather name="check" size={14} color="#fff" />}
      </View>
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]}>{label}</Text>
    </TouchableOpacity>
  );
}

const quickActions = [
  { label: "Yoga Poses", icon: "activity", route: "/(tabs)/yoga", color: colors.accent },
  { label: "Breathe", icon: "wind", route: "/(tabs)/breathe", color: colors.primary },
  { label: "Chakras", icon: "circle", route: "/(tabs)/chakras", color: "#7c6ead" },
  { label: "AI Coach", icon: "message-circle", route: "/(tabs)/ai", color: "#6ea8ed" },
];

export default function HomeScreen() {
  const { streak } = useStreak();
  const { checklist, markComplete, getProgress } = useChecklist();
  const progress = getProgress();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.name}>Welcome back 🌿</Text>
          </View>
          <View style={styles.streakBadge}>
            <Text style={styles.streakFire}>🔥</Text>
            <Text style={styles.streakNum}>{streak}</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.section}>
          <View style={styles.progressHeader}>
            <Text style={styles.sectionTitle}>Daily Progress</Text>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
          </View>
          <ProgressBar value={progress} />
          <Text style={styles.progressHint}>
            {progress === 0
              ? "Start your first practice today"
              : progress < 1
              ? "Keep going — you're almost there!"
              : "Amazing! You completed today's goals 🎉"}
          </Text>
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { paddingHorizontal: spacing.md, marginBottom: spacing.sm }]}>
          Start Practicing
        </Text>
        <View style={styles.quickGrid}>
          {quickActions.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={styles.quickCard}
              onPress={() => router.push(a.route as any)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[a.color + "33", a.color + "11"]}
                style={styles.quickCardGrad}
              >
                <View style={[styles.quickIcon, { backgroundColor: a.color + "28" }]}>
                  <Feather name={a.icon as any} size={22} color={a.color} />
                </View>
                <Text style={styles.quickLabel}>{a.label}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {/* Daily Checklist */}
        <View style={[styles.section, styles.card]}>
          <Text style={styles.sectionTitle}>Today's Checklist</Text>
          <View style={{ marginTop: spacing.sm }}>
            <CheckItem
              label="Complete a yoga flow"
              done={checklist.yoga}
              onPress={() => { if (!checklist.yoga) { markComplete("yoga"); router.push("/(tabs)/flows"); } }}
            />
            <CheckItem
              label="Do a breathing session"
              done={checklist.breathwork}
              onPress={() => { if (!checklist.breathwork) { markComplete("breathwork"); router.push("/(tabs)/breathe"); } }}
            />
            <CheckItem
              label="Review a chakra"
              done={checklist.chakra}
              onPress={() => { if (!checklist.chakra) { markComplete("chakra"); router.push("/(tabs)/chakras"); } }}
            />
          </View>
        </View>

        {/* AI Banner */}
        <TouchableOpacity
          style={styles.aiBanner}
          onPress={() => router.push("/(tabs)/ai")}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={["#1a3a2e", "#0d2a20"]}
            style={styles.aiBannerGrad}
          >
            <View style={styles.aiBannerLeft}>
              <View style={styles.aiIcon}>
                <Feather name="message-circle" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.aiBannerTitle}>AI Wellness Coach</Text>
                <Text style={styles.aiBannerSub}>Get a personalised recommendation</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textDim} />
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    marginBottom: 4,
  },
  name: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  streakFire: { fontSize: 18 },
  streakNum: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_700Bold",
    color: colors.text,
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: 4,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  progressPct: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.primary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  progressHint: {
    marginTop: 8,
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
    gap: 10,
    marginBottom: spacing.md,
  },
  quickCard: {
    width: (width - spacing.md * 2 - 10) / 2,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickCardGrad: {
    padding: spacing.md,
    alignItems: "flex-start",
    gap: 10,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkLabel: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_400Regular",
    color: colors.text,
  },
  checkLabelDone: {
    color: colors.textDim,
    textDecorationLine: "line-through",
  },
  aiBanner: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiBannerGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  aiBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  aiBannerTitle: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
  aiBannerSub: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    marginTop: 2,
  },
});
