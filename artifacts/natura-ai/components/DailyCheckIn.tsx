import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useFadeIn, usePressScale } from "@/hooks/useFadeIn";
import { askAI, type AIResponse } from "@/lib/ai";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";
import { REMEDIES } from "@/lib/data";

interface Mood {
  id: string;
  emoji: string;
  label: string;
  query: string;
  color: string;
  coachIntro: (name: string, streak: number) => string;
  encouragement: string[];
}

const MOODS: Mood[] = [
  {
    id: "low-energy",
    emoji: "😴",
    label: "Low Energy",
    query: "I feel tired and have low energy",
    color: "#8B87C5",
    coachIntro: (n, s) =>
      `${n ? n + ", your" : "Your"} body's asking for a reset today${s > 2 ? ` — and that's okay, even on a ${s}-day streak` : ""}. Let's work with that.`,
    encouragement: [
      "Rest is part of the process. These suggestions work best when you listen to your body.",
      "Low energy days are normal. Small actions can make a real difference.",
      "Gentle care today means more energy tomorrow.",
    ],
  },
  {
    id: "stressed",
    emoji: "😰",
    label: "Stressed",
    query: "I'm feeling stressed and anxious",
    color: "#E07A2F",
    coachIntro: (n, s) =>
      `${n ? n + ", I hear you" : "Heard"}. Stress is real${s > 4 ? `, and your ${s}-day streak shows real resilience` : ""}. Here's what your body may need right now.`,
    encouragement: [
      "You showed up today — that takes courage when you're stressed.",
      "Small consistent actions reduce stress more than big gestures.",
      "You're building real resilience by checking in like this.",
    ],
  },
  {
    id: "unwell",
    emoji: "🤒",
    label: "Not Well",
    query: "I'm not feeling well and need immune support",
    color: "#E05A7A",
    coachIntro: (n, _s) =>
      `${n ? n + ", let's" : "Let's"} be gentle today. Your body is working hard — let's support it, not fight it.`,
    encouragement: [
      "Checking in when you're unwell shows real self-awareness.",
      "Rest, hydration, and these suggestions can make a meaningful difference.",
      "Being kind to yourself is the best medicine today.",
    ],
  },
  {
    id: "good",
    emoji: "😌",
    label: "Feeling Good",
    query: "I feel good and want to maintain my energy and immunity",
    color: "#5C7F5F",
    coachIntro: (n, s) =>
      `${n ? "Love to hear it, " + n + "! " : "Love to hear it! "}${s > 0 ? `That ${s}-day streak is showing. ` : ""}Let's keep that momentum going.`,
    encouragement: [
      "This is the momentum. Consistency on good days builds strength for harder ones.",
      "You're creating a powerful daily habit — keep going.",
      "Feeling good is a result of the work you've been putting in.",
    ],
  },
];

const STREAK_MESSAGES: Record<number, string> = {
  1: "Great start — let's build something real.",
  2: "Two days in. You're building momentum.",
  3: "Three days straight. Consistency is where change happens.",
  5: "Five days — that's a proper streak.",
  7: "One full week. That's real progress.",
  10: "Ten days strong. You're creating a habit now.",
  14: "Two weeks. You're not just trying — you're doing.",
  21: "21 days — that's where habits become automatic.",
  30: "A full month. You've built something that will last.",
};

function getStreakMessage(streak: number): string {
  const keys = Object.keys(STREAK_MESSAGES)
    .map(Number)
    .sort((a, b) => b - a);
  for (const k of keys) {
    if (streak >= k) return STREAK_MESSAGES[k];
  }
  return "";
}

interface CheckInResult {
  mood: Mood;
  response: AIResponse;
  encouragement: string;
}

function MoodChip({ mood, onSelect }: { mood: Mood; onSelect: () => void }) {
  const colors = useColors();
  const { scale, onPressIn, onPressOut } = usePressScale(0.95);

  return (
    <Animated.View style={[styles.chipWrap, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={onSelect}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        style={[
          styles.chip,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 },
        ]}
      >
        <Text style={styles.chipEmoji}>{mood.emoji}</Text>
        <Text style={[styles.chipLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {mood.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ResultView({
  result,
  firstName,
  streak,
  onReset,
}: {
  result: CheckInResult;
  firstName: string;
  streak: number;
  onReset: () => void;
}) {
  const colors = useColors();
  const { opacity, translateY } = useFadeIn(350, 0);
  const { addToGrocery } = useWellness();
  const [groceryAdded, setGroceryAdded] = useState(false);

  const res = result.response;
  const mood = result.mood;
  const streakMsg = getStreakMessage(streak);

  const sections = [
    { icon: "🌿", label: "Herbs", items: res.herbs },
    { icon: "🍵", label: "Teas", items: res.teas },
    { icon: "🥗", label: "Foods", items: res.foods },
    { icon: "💊", label: "Supplements", items: res.supplements },
  ].filter((s) => s.items.length > 0);

  const allIngredients = [
    ...res.herbs.map((h) => h.name),
    ...res.teas.map((t) => t.name),
    ...res.foods.map((f) => f.name),
  ];

  const matchedRemedy =
    REMEDIES.find((r) =>
      mood.id === "stressed" ? r.category === "stress" :
      mood.id === "low-energy" ? r.category === "energy" :
      mood.id === "unwell" ? r.category === "immunity" :
      r.category === "energy"
    ) ?? REMEDIES[0];

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {/* Mood pill + reset */}
      <View style={styles.resultHeaderRow}>
        <View style={[styles.moodPill, { backgroundColor: mood.color + "22", borderRadius: 20 }]}>
          <Text style={styles.moodPillEmoji}>{mood.emoji}</Text>
          <Text style={[styles.moodPillLabel, { color: mood.color, fontFamily: "Inter_600SemiBold" }]}>
            {mood.label}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onReset}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={[styles.resetBtn, { backgroundColor: colors.muted, borderRadius: 16 }]}
        >
          <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
          <Text style={[styles.resetLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Check in again
          </Text>
        </TouchableOpacity>
      </View>

      {/* Coach intro */}
      <Text style={[styles.coachIntro, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        {mood.coachIntro(firstName, streak)}
      </Text>

      {/* Encouragement */}
      <View style={[styles.encourageBox, { backgroundColor: colors.primary + "14", borderRadius: 12, borderColor: colors.primary + "30" }]}>
        <Feather name="heart" size={13} color={colors.primary} />
        <Text style={[styles.encourageText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          {result.encouragement}
        </Text>
      </View>

      {/* Streak message */}
      {streak > 0 && streakMsg && (
        <View style={[styles.streakBox, { backgroundColor: colors.muted, borderRadius: 10 }]}>
          <Text style={[styles.streakBoxText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            🔥 {streakMsg}
          </Text>
        </View>
      )}

      {/* Suggestions */}
      {sections.map((sec, si) => (
        <View key={si} style={styles.suggSection}>
          <Text style={[styles.suggSectionHeader, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {sec.icon} {sec.label}
          </Text>
          {sec.items.slice(0, 2).map((item, idx) => (
            <View
              key={idx}
              style={[styles.suggCard, { backgroundColor: colors.secondary, borderRadius: colors.radius - 8 }]}
            >
              <Text style={[styles.suggName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {item.name}
              </Text>
              <Text style={[styles.suggExp, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {item.explanation}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {/* Why it helps */}
      <View style={[styles.whyBox, { backgroundColor: colors.muted, borderRadius: colors.radius - 8, borderColor: colors.border }]}>
        <Feather name="info" size={13} color={colors.primary} />
        <Text style={[styles.whyText, { color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1 }]}>
          <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>Why it may help: </Text>
          {res.whyItHelps}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push(`/remedy/${matchedRemedy.id}`);
          }}
          activeOpacity={0.8}
          style={[styles.actionBtnPrimary, { backgroundColor: colors.primary, borderRadius: colors.radius - 6 }]}
        >
          <Feather name="play" size={14} color="#fff" />
          <Text style={[styles.actionBtnPrimaryText, { fontFamily: "Inter_600SemiBold" }]}>Start Guide</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (groceryAdded) return;
            addToGrocery(allIngredients);
            setGroceryAdded(true);
          }}
          activeOpacity={0.8}
          style={[styles.actionBtnSecondary, { backgroundColor: colors.secondary, borderRadius: colors.radius - 6 }]}
        >
          <Feather name="shopping-cart" size={14} color={colors.primary} />
          <Text style={[styles.actionBtnSecondaryText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {groceryAdded ? "Added ✓" : "Grocery"}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export function DailyCheckIn() {
  const colors = useColors();
  const { profile } = useUser();
  const { submitCheckIn, streak } = useWellness();
  const [selected, setSelected] = useState<Mood | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const { opacity, translateY } = useFadeIn(300, 80);

  const firstName = profile.name ? profile.name.split(" ")[0] : "";

  const handleSelect = async (mood: Mood) => {
    if (loading || selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(mood);
    setLoading(true);

    submitCheckIn({
      energy: mood.id === "good" ? 4 : mood.id === "low-energy" ? 2 : 3,
      stress: mood.id === "stressed" ? 4 : 2,
      sleep: mood.id === "low-energy" ? 2 : 3,
    });

    try {
      const response = await askAI(mood.query);
      const encList = mood.encouragement;
      const encouragement = encList[Math.floor(Math.random() * encList.length)];
      setResult({ mood, response, encouragement });
    } catch {
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelected(null);
    setResult(null);
  };

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View style={styles.badge}>
          <View style={[styles.badgeDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.badgeLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            DAILY CHECK-IN
          </Text>
        </View>

        {!result ? (
          loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                Analyzing your wellness...
              </Text>
              <Text style={[styles.loadingSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Preparing your personalized guidance
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                How are you feeling today?
              </Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Tap to get instant, personalized coaching
              </Text>
              <View style={styles.moodGrid}>
                {MOODS.map((m) => (
                  <MoodChip key={m.id} mood={m} onSelect={() => handleSelect(m)} />
                ))}
              </View>
            </>
          )
        ) : (
          <ResultView result={result} firstName={firstName} streak={streak} onReset={handleReset} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 28 },
  card: { borderWidth: 1, padding: 18 },
  badge: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 14 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeLabel: { fontSize: 11, letterSpacing: 0.9 },
  cardTitle: { fontSize: 22, marginBottom: 6 },
  cardSub: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chipWrap: { width: "47.5%" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    gap: 10,
  },
  chipEmoji: { fontSize: 24 },
  chipLabel: { fontSize: 15, flexShrink: 1 },
  loadingState: { paddingVertical: 28, alignItems: "center", gap: 14 },
  loadingTitle: { fontSize: 18, textAlign: "center" },
  loadingSub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  resultHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  moodPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  moodPillEmoji: { fontSize: 16 },
  moodPillLabel: { fontSize: 13 },
  resetBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, gap: 5 },
  resetLabel: { fontSize: 12 },
  coachIntro: { fontSize: 15, lineHeight: 23, marginBottom: 12 },
  encourageBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, marginBottom: 10, borderWidth: 1 },
  encourageText: { fontSize: 13, lineHeight: 19, flex: 1 },
  streakBox: { padding: 10, marginBottom: 14 },
  streakBoxText: { fontSize: 12, textAlign: "center" },
  suggSection: { marginBottom: 12 },
  suggSectionHeader: { fontSize: 12, letterSpacing: 0.5, marginBottom: 8 },
  suggCard: { padding: 12, marginBottom: 6 },
  suggName: { fontSize: 14, marginBottom: 3 },
  suggExp: { fontSize: 12, lineHeight: 18 },
  whyBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, marginBottom: 16, borderWidth: 1 },
  whyText: { fontSize: 13, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 7,
  },
  actionBtnPrimaryText: { color: "#fff", fontSize: 14 },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 7,
  },
  actionBtnSecondaryText: { fontSize: 14 },
});
