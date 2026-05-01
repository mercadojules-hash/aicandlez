import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../contexts/ThemeContext";
import { useUser } from "../../contexts/UserContext";
import { useWellness } from "../../contexts/WellnessContext";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { ROUTINE_TASKS, getTodayTip } from "../../data/wellness";
import { fontSizes, radii, spacing } from "../../constants/theme";

const MORNING   = ROUTINE_TASKS.filter((t) => t.category === "morning").slice(0, 3);
const AFTERNOON = ROUTINE_TASKS.filter((t) => t.category === "afternoon").slice(0, 2);
const EVENING   = ROUTINE_TASKS.filter((t) => t.category === "evening").slice(0, 2);
const ALL_TASKS = [...MORNING, ...AFTERNOON, ...EVENING];

const TASK_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  "rt-1": "droplet",
  "rt-2": "wind",
  "rt-3": "activity",
  "rt-4": "coffee",
  "rt-5": "map-pin",
  "rt-6": "sunset",
  "rt-7": "moon",
};

export default function HomeScreen() {
  const { colors } = useTheme();
  const { profile } = useUser();
  const { toggleTask, isTaskDone, streak } = useWellness();
  const { isPremium } = useSubscription();
  const router = useRouter();

  const tip = getTodayTip();
  const completedCount = ALL_TASKS.filter((t) => isTaskDone(t.id)).length;
  const progressPct = ALL_TASKS.length > 0 ? completedCount / ALL_TASKS.length : 0;
  const firstName = profile.name ? profile.name.split(" ")[0] : "Jules";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayStreak = streak > 0 ? streak : 5;
  const wellnessScore = Math.min(95, 60 + Math.round(progressPct * 20) + Math.min(displayStreak * 2, 15));

  const STATS = [
    { icon: "zap" as const,       value: `${displayStreak}`, label: "day streak" },
    { icon: "clock" as const,     value: "32",                label: "min today"  },
    { icon: "check-circle" as const, value: `${completedCount}`, label: "sessions" },
    { icon: "star" as const,      value: `${wellnessScore}`,  label: "score"      },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.brandName, { color: colors.primary }]}>NATURA AI</Text>
            <Text style={[styles.brandSub, { color: colors.textMuted }]}>AI Wellness Coach</Text>
          </View>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}>
            <Text style={[styles.avatarLetter, { color: colors.primary }]}>{firstName[0].toUpperCase()}</Text>
          </View>
        </View>

        {/* ── HERO ── */}
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.heroBadge, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={[styles.heroBadgeText, { color: colors.primary }]}>Energy: Good</Text>
          </View>
          <Text style={[styles.heroGreeting, { color: colors.textMuted }]}>{greeting}, {firstName}</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Today's Plan for You</Text>
          <Text style={[styles.heroSub, { color: colors.textDim }]}>Personalized steps for your mind, body and energy</Text>
        </View>

        {/* ── STATS BAR ── */}
        <View style={[styles.statsBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {STATS.map(({ icon, value, label }, i) => (
            <View key={i} style={styles.statItem}>
              <Feather name={icon} size={16} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── TODAY'S PLAN ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Plan</Text>
            <Text style={[styles.sectionMeta, { color: colors.textMuted }]}>{completedCount}/{ALL_TASKS.length} done</Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any, backgroundColor: colors.primary }]} />
          </View>
          {ALL_TASKS.map((task) => {
            const done = isTaskDone(task.id);
            return (
              <View key={task.id} style={styles.tlItem}>
                <View style={styles.tlLeft}>
                  {task.time && <Text style={[styles.tlTime, { color: colors.textMuted }]}>{task.time}</Text>}
                  <View style={[styles.tlDot, { backgroundColor: done ? colors.primary : colors.border }]} />
                </View>
                <TouchableOpacity
                  style={[styles.tlCard, { backgroundColor: done ? colors.primary + "18" : colors.card, borderColor: done ? colors.primary + "44" : colors.border }]}
                  onPress={() => toggleTask(task.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.tlIcon, { backgroundColor: done ? colors.primary + "33" : colors.border + "80" }]}>
                    <Feather name={done ? "check" : (TASK_ICONS[task.id] ?? "circle")} size={14} color={done ? colors.primary : colors.textDim} />
                  </View>
                  <View style={styles.tlInfo}>
                    <Text style={[styles.tlLabel, { color: done ? colors.primary : colors.text }]}>{task.label}</Text>
                    <Text style={[styles.tlSub, { color: colors.textMuted }]}>{task.category}{task.time ? ` · ${task.time}` : ""}</Text>
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.textDim} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* ── WELLNESS SCORE ── */}
        <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.scoreBadge, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.scoreNum, { color: colors.primary }]}>{wellnessScore}</Text>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Wellness Score</Text>
          </View>
          <View style={styles.scoreInfo}>
            <Text style={[styles.scoreHeadline, { color: colors.text }]}>You're doing great!</Text>
            <Text style={[styles.scoreSub, { color: colors.textDim }]}>Keep going — small steps create big changes.</Text>
            <View style={[styles.tipRow, { backgroundColor: colors.primary + "11" }]}>
              <Feather name="sun" size={12} color={colors.primary} />
              <Text style={[styles.tipText, { color: colors.textDim }]}>{tip.title}</Text>
            </View>
          </View>
        </View>

        {/* ── CTA ── */}
        <TouchableOpacity
          style={[styles.ctaCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push(isPremium ? "/(tabs)/ask-ai" : "/(tabs)/ask-ai")}
          activeOpacity={0.8}
        >
          <Text style={[styles.ctaLabel, { color: colors.textMuted }]}>Need guidance?</Text>
          <View style={[styles.ctaBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
            <Feather name="message-circle" size={14} color={colors.primary} />
            <Text style={[styles.ctaBtnText, { color: colors.primary }]}>Ask AI anything</Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </View>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { flex: 1 },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  brandName:    { fontSize: fontSizes.xs, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  brandSub:     { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: fontSizes.md, fontFamily: "Inter_700Bold" },
  hero:         { marginHorizontal: spacing.md, borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  heroBadge:    { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginBottom: spacing.sm },
  heroBadgeText:{ fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  heroGreeting: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", marginBottom: 2 },
  heroTitle:    { fontSize: fontSizes.xl, fontFamily: "Inter_700Bold", marginBottom: 4 },
  heroSub:      { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  statsBar:     { marginHorizontal: spacing.md, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, flexDirection: "row", justifyContent: "space-around", marginBottom: spacing.md },
  statItem:     { alignItems: "center", gap: 3 },
  statValue:    { fontSize: fontSizes.lg, fontFamily: "Inter_700Bold" },
  statLabel:    { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  section:      { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  sectionHeader:{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold" },
  sectionMeta:  { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  progressBar:  { height: 4, borderRadius: 2, marginBottom: spacing.md, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  tlItem:       { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  tlLeft:       { alignItems: "center", width: 52, paddingTop: 14 },
  tlTime:       { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 4 },
  tlDot:        { width: 8, height: 8, borderRadius: 4 },
  tlCard:       { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: radii.md, borderWidth: 1, padding: spacing.sm, gap: spacing.sm },
  tlIcon:       { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tlInfo:       { flex: 1 },
  tlLabel:      { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold" },
  tlSub:        { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginTop: 1, textTransform: "capitalize" },
  scoreCard:    { marginHorizontal: spacing.md, borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  scoreBadge:   { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  scoreNum:     { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold" },
  scoreLabel:   { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  scoreInfo:    { flex: 1, justifyContent: "center" },
  scoreHeadline:{ fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  scoreSub:     { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginBottom: spacing.sm },
  tipRow:       { flexDirection: "row", alignItems: "center", gap: 5, padding: 6, borderRadius: 8 },
  tipText:      { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", flex: 1 },
  ctaCard:      { marginHorizontal: spacing.md, borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  ctaLabel:     { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginBottom: spacing.sm },
  ctaBtn:       { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ctaBtnText:   { flex: 1, fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold" },
});
