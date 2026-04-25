import { Feather } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useFadeIn } from "@/hooks/useFadeIn";
import { askAI, type AIResponse } from "@/lib/ai";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";

interface Mood {
  id: string;
  emoji: string;
  label: string;
  query: string;
  personalizedIntro: (name: string) => string;
}

const MOODS: Mood[] = [
  {
    id: "low-energy",
    emoji: "😴",
    label: "Low Energy",
    query: "I feel tired and low energy",
    personalizedIntro: (name) =>
      `${name ? name + ", " : ""}here's what may help restore your natural energy levels today.`,
  },
  {
    id: "stressed",
    emoji: "😰",
    label: "Stressed",
    query: "I'm feeling stressed and anxious",
    personalizedIntro: (name) =>
      `${name ? name + ", " : ""}these natural supports may help calm your nervous system today.`,
  },
  {
    id: "unwell",
    emoji: "🤒",
    label: "Not Well",
    query: "I'm not feeling well and need immune support",
    personalizedIntro: (name) =>
      `${name ? name + ", " : ""}let's support your body's natural defenses with these gentle options.`,
  },
  {
    id: "good",
    emoji: "😌",
    label: "Feeling Good",
    query: "I feel good and want to maintain my energy and immunity",
    personalizedIntro: (name) =>
      `${name ? name + ", " : ""}great! Here's how to keep that positive momentum going.`,
  },
];

interface CheckInResponse {
  mood: Mood;
  response: AIResponse;
}

export function DailyCheckIn() {
  const colors = useColors();
  const { profile } = useUser();
  const { submitCheckIn, lastCheckIn } = useWellness();
  const [selected, setSelected] = useState<Mood | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const { opacity, translateY } = useFadeIn(350, 100);

  const firstName = profile.name ? profile.name.split(" ")[0] : "";

  const handleMoodSelect = async (mood: Mood) => {
    if (loading || selected) return;
    setSelected(mood);
    setLoading(true);

    const energyScore = mood.id === "good" ? 4 : mood.id === "low-energy" ? 2 : 3;
    const stressScore = mood.id === "stressed" ? 4 : 3;
    const sleepScore = mood.id === "low-energy" ? 2 : 3;
    submitCheckIn({ energy: energyScore, stress: stressScore, sleep: sleepScore });

    try {
      const response = await askAI(mood.query);
      setResult({ mood, response });
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
    <Animated.View style={[{ opacity, transform: [{ translateY }] }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        {!result ? (
          <>
            <View style={styles.header}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.headerLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                DAILY CHECK-IN
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              How are you feeling today?
            </Text>
            <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Get personalized wellness suggestions based on your mood.
            </Text>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Preparing your personalized suggestions...
                </Text>
              </View>
            ) : (
              <View style={styles.moodGrid}>
                {MOODS.map((mood) => (
                  <TouchableOpacity
                    key={mood.id}
                    onPress={() => handleMoodSelect(mood)}
                    activeOpacity={0.75}
                    style={[
                      styles.moodChip,
                      {
                        backgroundColor: selected?.id === mood.id ? colors.primary : colors.muted,
                        borderColor: selected?.id === mood.id ? colors.primary : colors.border,
                        borderRadius: colors.radius - 4,
                      },
                    ]}
                  >
                    <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                    <Text
                      style={[
                        styles.moodLabel,
                        {
                          color: selected?.id === mood.id ? "#fff" : colors.foreground,
                          fontFamily: "Inter_500Medium",
                        },
                      ]}
                    >
                      {mood.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : (
          <CheckInResult result={result} firstName={firstName} onReset={handleReset} />
        )}
      </View>
    </Animated.View>
  );
}

function CheckInResult({
  result,
  firstName,
  onReset,
}: {
  result: CheckInResponse;
  firstName: string;
  onReset: () => void;
}) {
  const colors = useColors();
  const { opacity } = useFadeIn(300);
  const res = result.response;

  const topItems = [
    ...(res.herbs.slice(0, 1).map((h) => ({ ...h, type: "🌿 Herb" }))),
    ...(res.teas.slice(0, 1).map((t) => ({ ...t, type: "🍵 Tea" }))),
    ...(res.foods.slice(0, 1).map((f) => ({ ...f, type: "🥗 Food" }))),
  ];

  return (
    <Animated.View style={{ opacity }}>
      <View style={styles.resultHeader}>
        <View style={styles.moodTag}>
          <Text style={styles.moodTagEmoji}>{result.mood.emoji}</Text>
          <Text style={[styles.moodTagLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {result.mood.label}
          </Text>
        </View>
        <TouchableOpacity onPress={onReset} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.resultIntro, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        {result.mood.personalizedIntro(firstName)}
      </Text>

      {topItems.map((item, i) => (
        <View
          key={i}
          style={[
            styles.suggestionRow,
            { backgroundColor: colors.secondary, borderRadius: colors.radius - 8 },
          ]}
        >
          <Text style={[styles.suggestionType, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            {item.type}
          </Text>
          <Text style={[styles.suggestionName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {item.name}
          </Text>
          <Text style={[styles.suggestionExp, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {item.explanation}
          </Text>
        </View>
      ))}

      <View style={[styles.whyBox, { backgroundColor: colors.muted, borderRadius: colors.radius - 8 }]}>
        <Feather name="info" size={13} color={colors.primary} />
        <Text style={[styles.whyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {res.whyItHelps.split(".")[0]}.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headerLabel: { fontSize: 11, letterSpacing: 0.8 },
  title: { fontSize: 20, marginBottom: 6 },
  sub: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  loadingWrap: { alignItems: "center", gap: 12, paddingVertical: 20 },
  loadingText: { fontSize: 13, textAlign: "center" },
  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moodChip: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    gap: 10,
  },
  moodEmoji: { fontSize: 22 },
  moodLabel: { fontSize: 14 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  moodTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  moodTagEmoji: { fontSize: 18 },
  moodTagLabel: { fontSize: 14 },
  resultIntro: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  suggestionRow: { padding: 12, marginBottom: 8 },
  suggestionType: { fontSize: 11, letterSpacing: 0.4, marginBottom: 3 },
  suggestionName: { fontSize: 14, marginBottom: 3 },
  suggestionExp: { fontSize: 12, lineHeight: 18 },
  whyBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, marginTop: 4 },
  whyText: { fontSize: 12, lineHeight: 18, flex: 1 },
});
