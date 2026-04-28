import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { meditationSessions } from "../../data/meditation";

export default function MeditationSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = meditationSessions.find((s) => s.id === id);

  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [completed, setCompleted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const step = session?.steps[stepIdx];

  useEffect(() => {
    if (!started || !step) return;
    setTimeLeft(step.duration);

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          advance();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [stepIdx, started]);

  const advance = () => {
    if (!session) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      if (stepIdx < session.steps.length - 1) {
        setStepIdx((i) => i + 1);
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      } else {
        setCompleted(true);
      }
    });
  };

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.text }}>Session not found</Text>
      </View>
    );
  }

  if (completed) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
        <LinearGradient colors={[session.color + "30", colors.background]} style={StyleSheet.absoluteFillObject} />
        <Feather name="check-circle" size={72} color={session.color} />
        <Text style={styles.doneTitle}>Session Complete</Text>
        <Text style={styles.doneSub}>{session.title}</Text>
        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: session.color }]} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Return</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!started) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <LinearGradient colors={[session.color + "25", "transparent"]} style={styles.hero}>
          <View style={[styles.iconCircle, { backgroundColor: session.color + "30" }]}>
            <Feather name={session.icon as any} size={36} color={session.color} />
          </View>
          <Text style={styles.heroTitle}>{session.title}</Text>
          <Text style={styles.heroSub}>{session.subtitle}</Text>
          <Text style={styles.heroDur}>
            <Feather name="clock" size={13} color={colors.textDim} /> {Math.round(session.duration / 60)} minutes
          </Text>
        </LinearGradient>
        <Text style={styles.desc}>{session.description}</Text>
        <View style={styles.startWrapper}>
          <TouchableOpacity onPress={() => setStarted(true)} activeOpacity={0.88}>
            <LinearGradient colors={[session.color, session.color + "bb"]} style={styles.startBtn}>
              <Text style={styles.startBtnText}>Begin Meditation</Text>
              <Feather name="play" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progress = stepIdx / session.steps.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.sessionHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.sessionTitle}>{session.title}</Text>
        <Text style={styles.stepLabel}>{stepIdx + 1}/{session.steps.length}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: session.color }]} />
      </View>

      <View style={styles.body}>
        <Animated.View style={[styles.textCard, { opacity: fadeAnim }]}>
          <LinearGradient colors={[session.color + "15", "transparent"]} style={styles.textCardGrad}>
            <Text style={styles.guidanceText}>{step?.text}</Text>
            <View style={styles.timerRow}>
              <Text style={[styles.timerNum, { color: session.color }]}>{timeLeft}</Text>
              <Text style={styles.timerSec}>s</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.skipBtn} onPress={advance}>
          <Text style={styles.skipText}>Next</Text>
          <Feather name="chevron-right" size={16} color={colors.textDim} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  backBtn: {
    margin: spacing.md,
    width: 40, height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  hero: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  heroTitle: { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 6, textAlign: "center" },
  heroSub: { fontSize: fontSizes.md, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", marginBottom: 8 },
  heroDur: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textDim },
  desc: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 22, paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  startWrapper: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18, borderRadius: radius.xl },
  startBtnText: { fontSize: fontSizes.lg, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sessionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  sessionTitle: { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold", color: colors.text },
  stepLabel: { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium", color: colors.textDim },
  progressTrack: { height: 3, backgroundColor: colors.cardAlt },
  progressFill: { height: "100%" },
  body: { flex: 1, paddingHorizontal: spacing.md, justifyContent: "center" },
  textCard: { borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  textCardGrad: { padding: spacing.xl, alignItems: "center" },
  guidanceText: { fontSize: fontSizes.lg, fontFamily: "Inter_400Regular", color: colors.text, textAlign: "center", lineHeight: 30, marginBottom: spacing.xl },
  timerRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  timerNum: { fontSize: 48, fontFamily: "Inter_700Bold" },
  timerSec: { fontSize: fontSizes.md, fontFamily: "Inter_400Regular", color: colors.textDim },
  controls: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  skipBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  skipText: { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold", color: colors.textMuted },
  doneTitle: { fontSize: fontSizes.xxxl, fontFamily: "Inter_700Bold", color: colors.text, marginTop: 24, marginBottom: 12 },
  doneSub: { fontSize: fontSizes.lg, fontFamily: "Inter_400Regular", color: colors.textMuted, marginBottom: 40 },
  doneBtn: { paddingHorizontal: 40, paddingVertical: 18, borderRadius: radius.xl },
  doneBtnText: { fontSize: fontSizes.lg, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
