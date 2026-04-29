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
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useJourney } from "../../hooks/useJourney";

const { width } = Dimensions.get("window");
const logo = require("../../assets/images/logo.png");

// ─── AsyncStorage keys ────────────────────────────────────────────────────────
// AsyncStorage is already installed in this app.
// If unavailable, every read/write is wrapped in try/catch with safe fallbacks.
const STORAGE_LAST_MOOD    = "@natura_ai_last_mood";
const STORAGE_LAST_SESSION = "@natura_ai_last_session";
const STORAGE_LAST_DATE    = "@natura_ai_last_date";
const STORAGE_STREAK       = "@natura_ai_streak";

// ─── Rotating check-in prompts ────────────────────────────────────────────────
const PROMPTS = [
  "How are you showing up today?",
  "What do you need most right now?",
  "How's your energy feeling?",
  "What's been weighing on you today?",
];

// ─── Data types ───────────────────────────────────────────────────────────────

interface SessionPlan {
  title: string;
  duration: string;
  steps: string[];
  route: string;
}

interface MoodData {
  id: string;
  label: string;
  icon: string;
  color: string;
  aiResponse: string;
  quick: SessionPlan;
  deep: SessionPlan;
}

type AppStage = "mood" | "thinking" | "response" | "session" | "reflection" | "followup";
type SessionType = "quick" | "deep";
type ReflectionChoice = "better" | "same" | "tense";

// ─── Mood definitions ─────────────────────────────────────────────────────────

const MOODS: MoodData[] = [
  {
    id: "stressed",
    label: "Feeling stressed",
    icon: "alert-circle",
    color: "#E57373",
    aiResponse:
      "It sounds like things feel a bit overwhelming right now. Sometimes when your mind is carrying too much, your body feels it too. Let's slow that down together.",
    quick: {
      title: "2-Minute Grounding Reset",
      duration: "2 min",
      steps: [
        "Find a comfortable position and gently close your eyes",
        "Follow a slow 4–4–4 breathing pattern — breathe in, hold, release",
        "Softly scan your body from head to toe and let go of tension",
      ],
      route: "/breathwork/box-breathing",
    },
    deep: {
      title: "Calm Body, Calm Mind Flow",
      duration: "5–8 min",
      steps: [
        "Begin with 3 minutes of deep belly breathing",
        "Move through gentle neck and shoulder release stretches",
        "Settle into child's pose and let each exhale carry a little more weight away",
      ],
      route: "/flow/stress-relief",
    },
  },
  {
    id: "low_energy",
    label: "Low energy",
    icon: "battery",
    color: "#FFB74D",
    aiResponse:
      "Your energy feels like it may need a softer start today. We'll keep this gentle and restorative so you can reconnect without forcing anything.",
    quick: {
      title: "Gentle Energy Wake-Up",
      duration: "2 min",
      steps: [
        "Sit upright and take three slow, full breaths",
        "Roll your shoulders back gently — five times, no rush",
        "Take one final deep breath and open your eyes with intention",
      ],
      route: "/breathwork/calm-breathing",
    },
    deep: {
      title: "Restorative Morning Flow",
      duration: "5–8 min",
      steps: [
        "Start with 2 minutes of gentle seated breathing to arrive fully",
        "Flow slowly through a simple sun salutation at your own pace",
        "Rest in savasana — let your body absorb the energy you've created",
      ],
      route: "/flow/morning-energy",
    },
  },
  {
    id: "need_focus",
    label: "Need focus",
    icon: "target",
    color: "#4FC3F7",
    aiResponse:
      "It sounds like your mind wants more clarity. Let's create a little space so your attention can settle.",
    quick: {
      title: "Clarity Breath Reset",
      duration: "2 min",
      steps: [
        "Sit still and fix your gaze softly on one point ahead of you",
        "Breathe in for 4, hold for 4, breathe out for 4 — repeat",
        "With each exhale, release a little more of the mental noise",
      ],
      route: "/breathwork/box-breathing",
    },
    deep: {
      title: "Focused Mind Yoga Flow",
      duration: "5–8 min",
      steps: [
        "Begin with 3 minutes of alternate nostril breathing",
        "Move through steady balancing yoga poses to anchor your attention",
        "Close with a seated concentration breath — arrive in the present",
      ],
      route: "/flow/morning-energy",
    },
  },
  {
    id: "exploring",
    label: "Just exploring",
    icon: "compass",
    color: colors.primary,
    aiResponse:
      "That's a great place to begin. I'll guide you into something simple, balanced, and easy to follow.",
    quick: {
      title: "Simple Breath Awareness",
      duration: "2 min",
      steps: [
        "Close your eyes and notice your natural breath — just observe",
        "Follow the inhale… and the exhale… without trying to change anything",
        "Rest in that simple rhythm for two minutes",
      ],
      route: "/breathwork/calm-breathing",
    },
    deep: {
      title: "Balanced Wellness Flow",
      duration: "5–8 min",
      steps: [
        "Begin with a gentle full-body breath scan to ground yourself",
        "Move through a light yoga sequence — let intuition lead",
        "Rest in stillness and notice how you feel without judgment",
      ],
      route: "/flow/morning-energy",
    },
  },
];

const REFLECTION_RESPONSES: Record<ReflectionChoice, string> = {
  better: "That shift matters. Even a small reset can change the tone of your day.",
  same:   "That's okay. Some days need a little more patience and support.",
  tense:  "Thank you for noticing that. Let's try something slower and more grounding.",
};

// ─── Typing dots animation ────────────────────────────────────────────────────

function TypingDots() {
  const dots = [
    useRef(new Animated.Value(0.25)).current,
    useRef(new Animated.Value(0.25)).current,
    useRef(new Animated.Value(0.25)).current,
  ];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.25, duration: 320, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { opacity: dot, backgroundColor: colors.primaryLight }]}
        />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AIScreen() {
  const { currentDay, currentWeek } = useJourney();

  const [stage, setStage] = useState<AppStage>("mood");
  const [selectedMood, setSelectedMood] = useState<MoodData | null>(null);
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [reflectionChoice, setReflectionChoice] = useState<ReflectionChoice | null>(null);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [memory, setMemory] = useState<{
    lastMood?: string;
    lastSession?: string;
    lastDate?: string;
    streak: number;
  }>({ streak: 0 });

  // Animated values
  const moodFade    = useRef(new Animated.Value(1)).current;
  const moodScale   = useRef(new Animated.Value(1)).current;
  const respFade    = useRef(new Animated.Value(0)).current;
  const respSlide   = useRef(new Animated.Value(20)).current;
  const sessFade    = useRef(new Animated.Value(0)).current;
  const sessSlide   = useRef(new Animated.Value(20)).current;
  const reflFade    = useRef(new Animated.Value(0)).current;
  const followFade  = useRef(new Animated.Value(0)).current;

  // Load local memory on mount
  useEffect(() => {
    (async () => {
      try {
        const vals = await AsyncStorage.multiGet([
          STORAGE_LAST_MOOD,
          STORAGE_LAST_SESSION,
          STORAGE_LAST_DATE,
          STORAGE_STREAK,
        ]);
        const map = Object.fromEntries(vals.map(([k, v]) => [k, v]));
        setMemory({
          lastMood:    map[STORAGE_LAST_MOOD]    ?? undefined,
          lastSession: map[STORAGE_LAST_SESSION] ?? undefined,
          lastDate:    map[STORAGE_LAST_DATE]    ?? undefined,
          streak:      map[STORAGE_STREAK]       ? parseInt(map[STORAGE_STREAK]!, 10) : 0,
        });
      } catch {
        /* AsyncStorage unavailable — default state used */
      }
    })();
  }, []);

  const persistMemory = async (moodId: string, sType: string) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const newStreak = memory.lastDate === today ? memory.streak : memory.streak + 1;
      await AsyncStorage.multiSet([
        [STORAGE_LAST_MOOD,    moodId],
        [STORAGE_LAST_SESSION, sType],
        [STORAGE_LAST_DATE,    today],
        [STORAGE_STREAK,       String(newStreak)],
      ]);
      setMemory((p) => ({ ...p, lastMood: moodId, lastSession: sType, lastDate: today, streak: newStreak }));
    } catch { /* safe fallback */ }
  };

  // Compute a contextual personalization line
  const personalizationLine = (() => {
    if (!memory.lastDate) return null;
    const today = new Date().toISOString().split("T")[0];
    if (memory.lastDate === today)
      return "You checked in recently. Let's keep that rhythm going.";
    if (memory.lastSession === "quick")
      return "Last time you chose a quick reset. Want something simple again?";
    if (memory.lastMood)
      return "Welcome back — let's continue gently today.";
    return null;
  })();

  // Helpers
  const fadeIn = (
    fade: Animated.Value,
    slide?: Animated.Value,
    delay = 0
  ) => {
    const anims: Animated.CompositeAnimation[] = [
      Animated.timing(fade, { toValue: 1, duration: 480, useNativeDriver: true, delay }),
    ];
    if (slide)
      anims.push(Animated.timing(slide, { toValue: 0, duration: 440, useNativeDriver: true, delay }));
    Animated.parallel(anims).start();
  };

  const selectMood = (mood: MoodData) => {
    Animated.sequence([
      Animated.timing(moodScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(moodScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(moodFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setSelectedMood(mood);
        setStage("thinking");
        setTimeout(() => {
          setStage("response");
          respFade.setValue(0);
          respSlide.setValue(20);
          fadeIn(respFade, respSlide);
        }, 1500);
      });
    });
  };

  const chooseSession = (type: SessionType) => {
    setSessionType(type);
    if (selectedMood) persistMemory(selectedMood.id, type);
    setStage("session");
    sessFade.setValue(0);
    sessSlide.setValue(20);
    fadeIn(sessFade, sessSlide);
  };

  const startSession = () => {
    setStage("reflection");
    reflFade.setValue(0);
    fadeIn(reflFade, undefined, 0);
  };

  const chooseReflection = (choice: ReflectionChoice) => {
    setReflectionChoice(choice);
    setStage("followup");
    followFade.setValue(0);
    fadeIn(followFade);
  };

  const reset = () => {
    setSelectedMood(null);
    setSessionType(null);
    setReflectionChoice(null);
    setStage("mood");
    moodFade.setValue(0);
    respFade.setValue(0);
    sessFade.setValue(0);
    reflFade.setValue(0);
    followFade.setValue(0);
    fadeIn(moodFade);
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const sessionData = selectedMood && sessionType ? selectedMood[sessionType] : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <LinearGradient
            colors={[colors.primary + "28", colors.primary + "08"]}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Logo + title row — sits above greeting */}
          <View style={styles.headerLogoRow}>
            <Image source={logo} style={styles.headerLogoSmall} resizeMode="contain" />
            <Text style={styles.headerTitle}>AI Wellness Coach</Text>
          </View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.headerSub}>Your AI wellness guide</Text>
          <Text style={styles.headerSub2}>
            Based on your energy, I'll guide your next session.
          </Text>
        </View>

        {/* ── Journey context line ─────────────────────────────────────────── */}
        {stage === "mood" && (
          <View style={[styles.journeyRow, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
            <Feather name="map" size={12} color={colors.primary} />
            <Text style={[styles.journeyRowText, { color: colors.primary }]}>
              Day {currentDay} of your 30-Day Journey — Week {currentWeek}
            </Text>
          </View>
        )}

        {/* ── Memory: personalization line ────────────────────────────────── */}
        {personalizationLine !== null && stage === "mood" && (
          <View style={styles.memoryRow}>
            <Feather name="clock" size={12} color={colors.primary} />
            <Text style={styles.memoryText}>{personalizationLine}</Text>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE: Mood picker                                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "mood" && (
          <Animated.View
            style={[styles.section, { opacity: moodFade, transform: [{ scale: moodScale }] }]}
          >
            <Text style={styles.question}>{prompt}</Text>
            <Text style={styles.questionSub}>
              I'll personalise a session just for you.
            </Text>

            <View style={styles.moodGrid}>
              {MOODS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => selectMood(m)}
                  activeOpacity={0.78}
                  style={[styles.moodBtn, { borderColor: m.color + "50" }]}
                >
                  <LinearGradient
                    colors={[m.color + "20", m.color + "08"]}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={[styles.moodIcon, { backgroundColor: m.color + "22" }]}>
                    <Feather name={m.icon as any} size={20} color={m.color} />
                  </View>
                  <Text style={[styles.moodLabel, { color: colors.text }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE: AI thinking                                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "thinking" && (
          <View style={styles.section}>
            <View style={[styles.thinkingCard, { borderColor: colors.border }]}>
              <LinearGradient
                colors={[colors.primary + "18", colors.primary + "06"]}
                style={StyleSheet.absoluteFillObject}
              />
              <Image source={logo} style={styles.recLogo} resizeMode="contain" />
              <View style={styles.thinkingContent}>
                <Text style={styles.thinkingText}>Understanding your energy…</Text>
                <TypingDots />
              </View>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGES: response / session / reflection / followup               */}
        {/* (AI message bubble + mood tag always visible after mood pick)    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {selectedMood !== null &&
          (stage === "response" ||
            stage === "session" ||
            stage === "reflection" ||
            stage === "followup") && (
            <Animated.View
              style={[
                styles.section,
                { opacity: respFade, transform: [{ translateY: respSlide }] },
              ]}
            >
              {/* Mood tag + change button */}
              <View style={styles.moodTagRow}>
                <View
                  style={[
                    styles.moodTag,
                    {
                      backgroundColor: selectedMood.color + "20",
                      borderColor: selectedMood.color + "50",
                    },
                  ]}
                >
                  <Feather name={selectedMood.icon as any} size={13} color={selectedMood.color} />
                  <Text style={[styles.moodTagText, { color: selectedMood.color }]}>
                    {selectedMood.label}
                  </Text>
                </View>
                <TouchableOpacity onPress={reset} style={styles.changeBtn}>
                  <Text style={styles.changeBtnText}>Choose another mood</Text>
                </TouchableOpacity>
              </View>

              {/* AI message bubble */}
              <View style={[styles.aiCard, { borderColor: colors.border }]}>
                <LinearGradient
                  colors={[colors.primary + "1C", colors.primary + "07"]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.aiCardHeader}>
                  <Image source={logo} style={styles.recLogo} resizeMode="contain" />
                  <Text style={styles.aiCardLabel}>Natura AI</Text>
                </View>
                <Text style={styles.aiResponseText}>{selectedMood.aiResponse}</Text>
              </View>

              {/* ── Session choice buttons (response stage only) ─────────── */}
              {stage === "response" && (
                <View style={styles.sessionChoiceBtns}>
                  <TouchableOpacity
                    onPress={() => chooseSession("quick")}
                    activeOpacity={0.82}
                    style={[styles.choiceBtn, { borderColor: colors.primary + "55" }]}
                  >
                    <LinearGradient
                      colors={[colors.primary + "20", colors.primary + "08"]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={[styles.choiceBtnIcon, { backgroundColor: colors.primary + "22" }]}>
                      <Feather name="zap" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.choiceBtnText}>
                      <Text style={[styles.choiceBtnTitle, { color: colors.text }]}>Quick Reset</Text>
                      <Text style={[styles.choiceBtnDur, { color: colors.primary }]}>2 min</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textDim} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => chooseSession("deep")}
                    activeOpacity={0.82}
                    style={[styles.choiceBtn, { borderColor: "#4FC3F755" }]}
                  >
                    <LinearGradient colors={["#4FC3F720", "#4FC3F708"]} style={StyleSheet.absoluteFillObject} />
                    <View style={[styles.choiceBtnIcon, { backgroundColor: "#4FC3F722" }]}>
                      <Feather name="layers" size={18} color="#4FC3F7" />
                    </View>
                    <View style={styles.choiceBtnText}>
                      <Text style={[styles.choiceBtnTitle, { color: colors.text }]}>Deeper Session</Text>
                      <Text style={[styles.choiceBtnDur, { color: "#4FC3F7" }]}>5–8 min</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE: Session panel                                              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {sessionData !== null &&
          (stage === "session" || stage === "reflection" || stage === "followup") && (
            <Animated.View
              style={[
                styles.section,
                { opacity: sessFade, transform: [{ translateY: sessSlide }] },
              ]}
            >
              <View style={[styles.sessionPanel, { borderColor: colors.border }]}>
                <LinearGradient
                  colors={[colors.cardHover, colors.card]}
                  style={StyleSheet.absoluteFillObject}
                />
                {/* Title + duration */}
                <View style={styles.sessionPanelHeader}>
                  <Text style={styles.sessionTitle}>{sessionData.title}</Text>
                  <View
                    style={[
                      styles.durationBadge,
                      { backgroundColor: colors.primary + "1E", borderColor: colors.primary + "40" },
                    ]}
                  >
                    <Feather name="clock" size={11} color={colors.primary} />
                    <Text style={[styles.durationText, { color: colors.primary }]}>
                      {sessionData.duration}
                    </Text>
                  </View>
                </View>

                {/* Guided steps */}
                {sessionData.steps.map((step, i) => (
                  <View key={i} style={styles.guidanceStep}>
                    <View style={[styles.stepDot, { backgroundColor: colors.primary + "2C" }]}>
                      <Text style={[styles.stepDotNum, { color: colors.primary }]}>{i + 1}</Text>
                    </View>
                    <Text style={styles.guidanceText}>{step}</Text>
                  </View>
                ))}
              </View>

              {/* Start Session CTA — only when session stage */}
              {stage === "session" && (
                <TouchableOpacity
                  onPress={startSession}
                  activeOpacity={0.88}
                  style={styles.ctaWrapper}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    style={styles.ctaBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Feather name="play" size={18} color="#fff" />
                    <Text style={styles.ctaText}>Start Session</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE: Post-session reflection                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {(stage === "reflection" || stage === "followup") && (
          <Animated.View style={[styles.section, { opacity: reflFade }]}>
            <Text style={styles.reflectionQ}>How do you feel now?</Text>

            {stage === "reflection" && (
              <View style={styles.reflectionBtns}>
                {(
                  [
                    { id: "better" as const, label: "Better",       icon: "sun",          color: colors.primary },
                    { id: "same"   as const, label: "Same",          icon: "minus-circle", color: "#FFB74D"       },
                    { id: "tense"  as const, label: "Still tense",   icon: "cloud",        color: "#E57373"       },
                  ] as const
                ).map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => chooseReflection(r.id)}
                    activeOpacity={0.78}
                    style={[styles.reflBtn, { borderColor: r.color + "50" }]}
                  >
                    <LinearGradient
                      colors={[r.color + "1C", r.color + "08"]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Feather name={r.icon as any} size={16} color={r.color} />
                    <Text style={[styles.reflBtnText, { color: colors.text }]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE: Follow-up AI message                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "followup" && reflectionChoice !== null && (
          <Animated.View style={[styles.section, { opacity: followFade }]}>
            <View style={[styles.followCard, { borderColor: colors.border }]}>
              <LinearGradient
                colors={[colors.primary + "18", colors.primary + "06"]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.followHeader}>
                <Image source={logo} style={styles.recLogo} resizeMode="contain" />
                <Text style={styles.aiCardLabel}>Natura AI</Text>
              </View>
              <Text style={styles.followText}>{REFLECTION_RESPONSES[reflectionChoice]}</Text>
            </View>

            <TouchableOpacity onPress={reset} activeOpacity={0.75} style={styles.newCheckInBtn}>
              <Feather name="refresh-cw" size={14} color={colors.primary} />
              <Text style={styles.newCheckInText}>Start a new check-in</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── AI COACH IMAGE CARD ─────────────────────────────── */}
        <View style={styles.coachImgWrap}>
          <Image
            source={{ uri: "https://apexdigital.design/wp-content/uploads/2026/04/natura-ai-coach.webp" }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(4,14,8,0.72)"]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.coachImgOverlay}>
            <Text style={styles.coachImgText}>Personalized guidance for your journey</Text>
          </View>
        </View>

        <View style={{ height: 52 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 24 },

  // Header
  header: {
    flexDirection: "column",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: "hidden",
  },
  headerLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  headerLogoSmall: { width: 32, height: 32, borderRadius: 8 },
  greeting: {
    fontSize: fontSizes.xs, fontFamily: "Inter_400Regular",
    color: colors.textDim, marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22, fontFamily: "Inter_700Bold",
    color: colors.text,
  },
  headerSub: {
    fontSize: fontSizes.sm, fontFamily: "Inter_500Medium",
    color: colors.primaryLight, marginBottom: 2,
  },
  headerSub2: {
    fontSize: fontSizes.xs, fontFamily: "Inter_400Regular",
    color: colors.textMuted, lineHeight: 18,
  },

  // Memory personalization
  memoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary + "12",
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  memoryText: {
    fontSize: fontSizes.xs, fontFamily: "Inter_400Regular",
    color: colors.primaryLight, flex: 1,
  },

  section: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },

  // Mood picker
  question: {
    fontSize: fontSizes.xl, fontFamily: "Inter_700Bold",
    color: colors.text, marginBottom: 6,
  },
  questionSub: {
    fontSize: fontSizes.sm, fontFamily: "Inter_400Regular",
    color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 22,
  },
  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moodBtn: {
    width: (width - spacing.md * 2 - 10) / 2,
    borderRadius: radius.lg, borderWidth: 1.5,
    padding: 16, overflow: "hidden",
    flexDirection: "column", gap: 10,
  },
  moodIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  moodLabel: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold" },

  // Thinking card
  thinkingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    overflow: "hidden",
  },
  thinkingContent: { flex: 1, gap: 10 },
  thinkingText: {
    fontSize: fontSizes.sm, fontFamily: "Inter_500Medium",
    color: colors.textMuted,
  },
  dotsRow: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: 4 },

  // Mood tag row
  moodTagRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: spacing.md,
  },
  moodTag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  moodTagText: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  changeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  changeBtnText: {
    fontSize: fontSizes.xs, fontFamily: "Inter_500Medium",
    color: colors.primary,
  },

  // AI message card
  recLogo: { width: 32, height: 32 },
  aiCard: {
    borderRadius: radius.lg, borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.md,
    overflow: "hidden",
  },
  aiCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  aiCardLabel: {
    fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold",
    color: colors.primaryLight,
  },
  aiResponseText: {
    fontSize: fontSizes.sm, fontFamily: "Inter_400Regular",
    color: colors.textMuted, lineHeight: 23,
  },

  // Session choice buttons
  sessionChoiceBtns: { gap: 10 },
  choiceBtn: {
    flexDirection: "row", alignItems: "center",
    gap: 14, borderRadius: radius.lg,
    borderWidth: 1.5, padding: 16,
    overflow: "hidden",
  },
  choiceBtnIcon: {
    width: 42, height: 42, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  choiceBtnText: { flex: 1 },
  choiceBtnTitle: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  choiceBtnDur:   { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },

  // Session panel
  sessionPanel: {
    borderRadius: radius.lg, borderWidth: 1,
    padding: spacing.md, overflow: "hidden",
    marginBottom: spacing.md,
  },
  sessionPanelHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: spacing.md,
  },
  sessionTitle: {
    fontSize: fontSizes.md, fontFamily: "Inter_700Bold",
    color: colors.text, flex: 1, marginRight: 8,
  },
  durationBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: radius.full, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  durationText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  guidanceStep: {
    flexDirection: "row", alignItems: "flex-start",
    gap: 12, marginBottom: 14,
  },
  stepDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    marginTop: 1, flexShrink: 0,
  },
  stepDotNum: { fontSize: 11, fontFamily: "Inter_700Bold" },
  guidanceText: {
    flex: 1, fontSize: fontSizes.sm, fontFamily: "Inter_400Regular",
    color: colors.textMuted, lineHeight: 22,
  },

  // Start session CTA
  ctaWrapper: { borderRadius: radius.xl, overflow: "hidden" },
  ctaBtn: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10,
    paddingVertical: 18, borderRadius: radius.xl,
  },
  ctaText: { fontSize: fontSizes.lg, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Reflection
  reflectionQ: {
    fontSize: fontSizes.xl, fontFamily: "Inter_700Bold",
    color: colors.text, marginBottom: spacing.md,
  },
  reflectionBtns: { flexDirection: "row", gap: 10 },
  reflBtn: {
    flex: 1, borderRadius: radius.lg, borderWidth: 1.5,
    paddingVertical: 18, alignItems: "center",
    gap: 8, overflow: "hidden",
  },
  reflBtnText: {
    fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },

  // Follow-up
  followCard: {
    borderRadius: radius.lg, borderWidth: 1,
    padding: spacing.md, overflow: "hidden",
    marginBottom: spacing.lg,
  },
  followHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  followText: {
    fontSize: fontSizes.sm, fontFamily: "Inter_400Regular",
    color: colors.textMuted, lineHeight: 23,
  },
  newCheckInBtn: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + "40",
    backgroundColor: colors.primary + "10",
  },
  newCheckInText: {
    fontSize: fontSizes.sm, fontFamily: "Inter_500Medium",
    color: colors.primary,
  },

  // Journey row
  journeyRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
  },
  journeyRowText: {
    fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", flex: 1,
  },

  // Coach image card
  coachImgWrap: {
    height: 200,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  coachImgOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
  },
  coachImgText: {
    color: "#fff",
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
