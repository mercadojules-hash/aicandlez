import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useFadeIn, usePressScale } from "@/hooks/useFadeIn";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";
import type { DailyCheckIn } from "@/contexts/WellnessContext";
import { DisclaimerModal } from "@/components/DisclaimerModal";
import { DailyCheckIn as DailyCheckInComponent } from "@/components/DailyCheckIn";
import { RemedyCard } from "@/components/Cards";
import { RoutineSection } from "@/components/RoutineSection";
import { REMEDIES, RECIPES } from "@/lib/data";

function deriveMood(checkIn: DailyCheckIn | null): "stressed" | "low-energy" | "positive" | null {
  if (!checkIn) return null;
  if (checkIn.stress >= 4) return "stressed";
  if (checkIn.energy <= 2) return "low-energy";
  return "positive";
}

function AICoachBanner({
  checkIn,
  streak,
}: {
  checkIn: DailyCheckIn | null;
  streak: number;
}) {
  const colors = useColors();
  const mood = deriveMood(checkIn);

  const headline =
    mood === "stressed"
      ? "You're feeling stressed."
      : mood === "low-energy"
      ? "Energy is low today."
      : mood === "positive"
      ? streak >= 3
        ? `You're on a ${streak}-day streak 🔥`
        : "You're doing well today."
      : "Ready to start your day?";

  const body =
    mood === "stressed"
      ? "Let's slow things down and find your calm."
      : mood === "low-energy"
      ? "Here's a quick boost plan to get you going."
      : mood === "positive"
      ? streak >= 3
        ? "Keep that momentum — consistency is everything."
        : "Here's what I recommend to keep you feeling great."
      : "Check in above to get your personalized plan.";

  return (
    <View
      style={[
        styles.coachCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.coachHeader}>
        <Text style={[styles.coachIcon]}>🧠</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.coachLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
          >
            AI WELLNESS COACH
          </Text>
          <Text style={[styles.coachHeadline, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {headline}
          </Text>
        </View>
      </View>
      <Text style={[styles.coachBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {body}
      </Text>
      <View style={styles.coachBtns}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/(tabs)/plans");
          }}
          activeOpacity={0.82}
          style={[styles.coachBtnPrimary, { backgroundColor: colors.primary, borderRadius: colors.radius - 6 }]}
        >
          <Feather name="calendar" size={14} color="#fff" />
          <Text style={[styles.coachBtnPrimaryText, { fontFamily: "Inter_600SemiBold" }]}>
            Get Today's Plan
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(tabs)/chat");
          }}
          activeOpacity={0.82}
          style={[
            styles.coachBtnSecondary,
            { backgroundColor: colors.secondary, borderColor: colors.primary + "44", borderRadius: colors.radius - 6 },
          ]}
        >
          <Feather name="message-circle" size={14} color={colors.primary} />
          <Text style={[styles.coachBtnSecondaryText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Ask AI Coach
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuickActionBtn({
  icon,
  label,
  route,
  delay,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  route: string;
  delay: number;
}) {
  const colors = useColors();
  const { scale, onPressIn, onPressOut } = usePressScale();
  const { opacity, translateY } = useFadeIn(320, delay);

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }, { scale }] }}>
      <TouchableOpacity
        onPress={() => router.push(route as any)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        style={[
          styles.qaBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius - 4,
          },
        ]}
      >
        <View style={[styles.qaIcon, { backgroundColor: colors.secondary, borderRadius: 22 }]}>
          <Feather name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.qaLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

type Goal = "stress" | "sleep" | "energy" | "immunity";

const GOAL_PLAN: Record<Goal, { remedyId: string; recipeId: string; action: string }> = {
  stress: { remedyId: "remedy-lavender-calm", recipeId: "recipe-antistress-salad", action: "5-min breathing exercise" },
  sleep: { remedyId: "remedy-chamomile-sleep", recipeId: "recipe-sleep-smoothie", action: "Digital sunset 1hr before bed" },
  energy: { remedyId: "remedy-energy-smoothie", recipeId: "recipe-overnight-oats", action: "10-min walk after lunch" },
  immunity: { remedyId: "remedy-immunity-shot", recipeId: "recipe-golden-milk", action: "Take elderberry syrup" },
};

function TodaysPlan({ goals }: { goals: string[] }) {
  const colors = useColors();
  const primaryGoal = (goals[0]?.toLowerCase() ?? "") as Goal;
  const plan = GOAL_PLAN[primaryGoal];

  if (!plan) return null;

  const remedy = REMEDIES.find((r) => r.id === plan.remedyId);
  const recipe = RECIPES.find((r) => r.id === plan.recipeId);

  if (!remedy && !recipe) return null;

  const goalLabel = primaryGoal.charAt(0).toUpperCase() + primaryGoal.slice(1);

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitleInRow, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Today's Plan for You
        </Text>
        <View style={[styles.goalBadge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
          <Text style={[styles.goalBadgeText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {goalLabel}
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {remedy && (
          <TouchableOpacity
            style={[styles.planItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 }]}
            onPress={() => router.push(`/remedy/${remedy.id}`)}
            activeOpacity={0.88}
          >
            <View style={[styles.planItemIcon, { backgroundColor: colors.secondary }]}>
              <Text style={{ fontSize: 18 }}>🌿</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planItemLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Remedy</Text>
              <Text style={[styles.planItemTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                {remedy.title}
              </Text>
              <Text style={[styles.planItemSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {remedy.prepTime} · {remedy.category}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {recipe && (
          <TouchableOpacity
            style={[styles.planItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 }]}
            onPress={() => router.push(`/remedy/${recipe.id}`)}
            activeOpacity={0.88}
          >
            <View style={[styles.planItemIcon, { backgroundColor: colors.secondary }]}>
              <Text style={{ fontSize: 18 }}>🥗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planItemLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Recipe</Text>
              <Text style={[styles.planItemTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                {recipe.title}
              </Text>
              <Text style={[styles.planItemSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {recipe.prepTime} · {recipe.category}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        <View style={[styles.planItem, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
          <View style={[styles.planItemIcon, { backgroundColor: colors.primary + "18" }]}>
            <Text style={{ fontSize: 18 }}>⚡</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.planItemLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Today's Action</Text>
            <Text style={[styles.planItemTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {plan.action}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function StreakPill({ streak, colors }: { streak: number; colors: ReturnType<typeof useColors> }) {
  if (streak <= 0) return null;
  const label =
    streak === 1
      ? "1 Day Streak — Great start!"
      : streak < 7
      ? `${streak} Day Streak — Keep going`
      : streak < 30
      ? `${streak} Day Streak — You're on fire`
      : `${streak} Day Streak — Incredible`;

  return (
    <View
      style={[
        styles.streakPill,
        {
          backgroundColor: colors.primary + "18",
          borderColor: colors.primary + "40",
          borderRadius: 20,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
        },
      ]}
    >
      <Text style={styles.streakFire}>🔥</Text>
      <Text style={[styles.streakText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
        {label}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { streak, saveItem, isSaved, lastCheckIn } = useWellness();

  const firstName = profile.name ? profile.name.split(" ")[0] : null;
  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Good night"
      : hour < 12
      ? "Good morning"
      : hour < 17
      ? "Good afternoon"
      : "Good evening";

  const { opacity: hOpacity, translateY: hY } = useFadeIn(280, 0);

  return (
    <>
      <DisclaimerModal />
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
          paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ① Greeting */}
        <Animated.View
          style={[styles.headerRow, { opacity: hOpacity, transform: [{ translateY: hY }] }]}
        >
          <View>
            <Text
              style={[
                styles.greetingText,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {greeting}
              {firstName ? `, ${firstName}` : ""} 👋
            </Text>
            <Text
              style={[styles.subGreeting, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
            >
              Your wellness coach
            </Text>
          </View>
          <View style={[styles.logoCircle, { backgroundColor: colors.secondary }]}>
            <Image
              source={require("@/assets/images/logo.png")}
              style={styles.logoImg}
              contentFit="contain"
            />
          </View>
        </Animated.View>

        {/* ② Mood check-in */}
        <DailyCheckInComponent />

        {/* ③ Streak pill — below check-in */}
        <View style={styles.streakWrap}>
          <StreakPill streak={streak} colors={colors} />
        </View>

        {/* ④ AI Wellness Coach */}
        <View style={styles.section}>
          <AICoachBanner checkIn={lastCheckIn} streak={streak} />
        </View>

        {/* ⑤ Today's Plan */}
        <TodaysPlan goals={profile.goals} />

        {/* ⑥ Today's Routine */}
        <RoutineSection />

        {/* ⑥ Quick Actions */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
          >
            Quick Actions
          </Text>
          <View style={styles.qaRow}>
            <QuickActionBtn icon="message-circle" label="Ask AI" route="/(tabs)/chat" delay={0} />
            <QuickActionBtn icon="list" label="My Plans" route="/(tabs)/plans" delay={70} />
            <QuickActionBtn
              icon="book-open"
              label="Recipes"
              route="/(tabs)/recipes"
              delay={140}
            />
          </View>
        </View>

        {/* ⑥ Remedy Shelf */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text
              style={[
                styles.sectionTitleInRow,
                { color: colors.foreground, fontFamily: "Inter_700Bold" },
              ]}
            >
              Wellness Remedies
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/plans")}>
              <Text style={[styles.seeAll, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                See all
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.shelf}
          >
            {REMEDIES.map((r) => (
              <RemedyCard
                key={r.id}
                remedy={r}
                image={r.imageUrl}
                onPress={() => router.push(`/remedy/${r.id}`)}
                isSaved={isSaved(r.id)}
                onSave={() => {
                  if (!isSaved(r.id))
                    saveItem({
                      id: r.id,
                      type: "remedy",
                      title: r.title,
                      savedAt: new Date().toISOString(),
                    });
                }}
              />
            ))}
            <View style={{ width: 16 }} />
          </ScrollView>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  greetingText: { fontSize: 15, marginBottom: 4 },
  subGreeting: { fontSize: 22, maxWidth: 230 },
  logoCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: { width: 38, height: 38 },

  streakWrap: {
    paddingHorizontal: 16,
    marginBottom: 20,
    marginTop: -8,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 7,
  },
  streakFire: { fontSize: 16 },
  streakText: { fontSize: 13 },

  section: { marginBottom: 28 },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, paddingHorizontal: 20, marginBottom: 14 },
  sectionTitleInRow: { fontSize: 18, flexShrink: 1 },
  seeAll: { fontSize: 14, flexShrink: 0, marginLeft: 8 },
  qaRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10 },
  qaBtn: { alignItems: "center", paddingVertical: 16, borderWidth: 1, gap: 8 },
  qaIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  qaLabel: { fontSize: 13, textAlign: "center" },
  shelf: { paddingLeft: 16 },

  coachCard: {
    marginHorizontal: 16,
    borderWidth: 1,
    padding: 18,
  },
  coachHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  coachIcon: { fontSize: 28, marginTop: 2 },
  coachLabel: { fontSize: 11, letterSpacing: 0.9, marginBottom: 4 },
  coachHeadline: { fontSize: 18, lineHeight: 24 },
  coachBody: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  coachBtns: { flexDirection: "row", gap: 10 },
  coachBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    gap: 7,
  },
  coachBtnPrimaryText: { color: "#fff", fontSize: 14 },
  coachBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderWidth: 1,
    gap: 7,
  },
  coachBtnSecondaryText: { fontSize: 14 },
  goalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  goalBadgeText: { fontSize: 12 },
  planItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderWidth: 1,
    gap: 12,
  },
  planItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  planItemLabel: { fontSize: 11, letterSpacing: 0.5, marginBottom: 2 },
  planItemTitle: { fontSize: 14, lineHeight: 19 },
  planItemSub: { fontSize: 12, marginTop: 2 },
});
