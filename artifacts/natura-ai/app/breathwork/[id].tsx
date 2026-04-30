import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  Image,
} from "react-native";
import { Audio } from "expo-av";
import { useLocalSearchParams, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { breathPatterns } from "../../data/breathwork";
import { useStreak } from "../../hooks/useStreak";
import { useChecklist } from "../../hooks/useChecklist";
import { useSoundPreference } from "../../hooks/useSoundPreference";

const { width } = Dimensions.get("window");

// ─── Per-pattern images ───────────────────────────────────────────────────────

const BREATH_IMAGES: Record<string, { source: number; caption: string }> = {
  "box-breathing": {
    source: require("../../assets/images/natura-breath-box.webp"),
    caption: "Find calm through rhythm",
  },
  "478-breathing": {
    source: require("../../assets/images/natura-breath-478.webp"),
    caption: "Relax deeply and restore balance",
  },
  "calm-breathing": {
    source: require("../../assets/images/natura-breath-calm.webp"),
    caption: "Slow down. Breathe. Reset.",
  },
};
const CIRCLE = width * 0.55;

// ─── expo-av breathing audio ──────────────────────────────────────────────────

function useBreathAudio(enabled: boolean) {
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  // Stop sound when user turns off audio mid-session
  useEffect(() => {
    if (!enabled && soundRef.current) {
      soundRef.current.stopAsync()
        .then(() => soundRef.current?.unloadAsync())
        .catch(() => {})
        .finally(() => { soundRef.current = null; });
    }
  }, [enabled]);

  const playPhase = useCallback(async (_label: string, _duration: number) => {
    if (!enabled) return;
    // Ambient loop already running — no restart needed between phases
    if (soundRef.current) return;
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../../assets/sounds/breath-ambient.wav"),
        { shouldPlay: true, isLooping: true, volume: 0.55 },
      );
      soundRef.current = sound;
    } catch (error) {
      console.log("Breath audio error:", error);
    }
  }, [enabled]);

  const stopAll = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {}
  }, []);

  return { playPhase, stopAll };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BreathworkSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pattern = breathPatterns.find((b) => b.id === id);

  const [started, setStarted] = useState(false);
  const [cycleNum, setCycleNum] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [completed, setCompleted] = useState(false);

  const { soundEnabled, setSoundEnabled } = useSoundPreference();
  const audio = useBreathAudio(soundEnabled);

  const circleScale   = useRef(new Animated.Value(0.6)).current;
  const circleOpacity = useRef(new Animated.Value(0.5)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef  = useRef<Animated.CompositeAnimation | null>(null);

  const { recordActivity } = useStreak();
  const { markComplete } = useChecklist();

  const phase = pattern?.phases[phaseIdx];

  const animatePhase = useCallback(
    (label: string, duration: number) => {
      animRef.current?.stop();
      const isInhale = label === "Inhale";
      const isHold = label.includes("Hold") || label === "Retention";
      const toScale = isInhale ? 1 : isHold ? (circleScale as any)._value : 0.6;
      const toOpacity = isInhale ? 1 : isHold ? (circleOpacity as any)._value : 0.5;

      animRef.current = Animated.parallel([
        Animated.timing(circleScale, {
          toValue: toScale,
          duration: duration * 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(circleOpacity, {
          toValue: toOpacity,
          duration: duration * 1000,
          useNativeDriver: true,
        }),
      ]);
      animRef.current.start();
    },
    [circleScale, circleOpacity]
  );

  useEffect(() => {
    if (!started || !pattern || !phase) return;
    setTimeLeft(phase.duration);
    animatePhase(phase.label, phase.duration);
    audio.playPhase(phase.label, phase.duration);

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          nextPhase();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [phaseIdx, cycleNum, started]);

  const nextPhase = () => {
    if (!pattern) return;
    const nextIdx = phaseIdx + 1;
    if (nextIdx >= pattern.phases.length) {
      const nextCycle = cycleNum + 1;
      if (nextCycle >= pattern.totalCycles) {
        audio.stopAll();
        setCompleted(true);
        recordActivity();
        markComplete("breathwork");
      } else {
        setCycleNum(nextCycle);
        setPhaseIdx(0);
      }
    } else {
      setPhaseIdx(nextIdx);
    }
  };

  if (!pattern) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.text }}>Pattern not found</Text>
      </View>
    );
  }

  if (completed) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
        <LinearGradient
          colors={[pattern.color + "30", colors.background]}
          style={StyleSheet.absoluteFillObject}
        />
        <Feather name="check-circle" size={72} color={pattern.color} />
        <Text style={styles.completeTitle}>Session Complete!</Text>
        <Text style={styles.completeSub}>
          {pattern.totalCycles} cycles of{"\n"}{pattern.title}
        </Text>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: pattern.color }]}
          onPress={() => router.back()}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!started) {
    const breathImg = BREATH_IMAGES[id ?? ""];

    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>

        <LinearGradient
          colors={[pattern.color + "25", "transparent"]}
          style={styles.previewHero}
        >
          <View style={[styles.iconCircle, { backgroundColor: pattern.color + "30" }]}>
            <Feather name={pattern.icon as any} size={36} color={pattern.color} />
          </View>
          <Text style={styles.previewTitle}>{pattern.title}</Text>
          <Text style={styles.previewSub}>{pattern.subtitle}</Text>
        </LinearGradient>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={styles.previewBody}>
            <Text style={styles.previewDesc}>{pattern.description}</Text>

            <Text style={styles.sectionHead}>Pattern</Text>
            <View style={styles.phaseGrid}>
              {pattern.phases.map((p, i) => (
                <View key={i} style={[styles.phaseCard, { borderColor: pattern.color + "40" }]}>
                  <Text style={[styles.phaseCardLabel, { color: pattern.color }]}>{p.label}</Text>
                  <Text style={styles.phaseCardDur}>{p.duration}s</Text>
                </View>
              ))}
            </View>

            {/* Sound toggle on start screen */}
            <TouchableOpacity
              onPress={() => setSoundEnabled(!soundEnabled)}
              style={[styles.soundToggleRow, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Feather name={soundEnabled ? "volume-2" : "volume-x"} size={16} color={soundEnabled ? pattern.color : colors.textDim} />
              <Text style={[styles.soundToggleLabel, { color: soundEnabled ? colors.text : colors.textDim }]}>
                Breathing audio {soundEnabled ? "on" : "off"}
              </Text>
              <View style={[styles.toggle, { backgroundColor: soundEnabled ? pattern.color : colors.cardAlt, borderColor: soundEnabled ? pattern.color : colors.border }]}>
                <View style={[styles.toggleThumb, { transform: [{ translateX: soundEnabled ? 20 : 2 }] }]} />
              </View>
            </TouchableOpacity>

            <View style={styles.cyclesInfo}>
              <Feather name="repeat" size={16} color={colors.accent} />
              <Text style={styles.cyclesText}>{pattern.totalCycles} cycles total</Text>
            </View>
          </View>

          {/* ── Per-pattern image card ──────────────────────────── */}
          {breathImg && (
            <View style={styles.breathImgCard}>
              <Image
                source={breathImg.source}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["transparent", "rgba(4,14,8,0.65)"]}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.breathImgCaption}>{breathImg.caption}</Text>
            </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>

        <View style={styles.startBtnWrapper}>
          <TouchableOpacity onPress={() => setStarted(true)} activeOpacity={0.88}>
            <LinearGradient
              colors={[pattern.color, pattern.color + "bb"]}
              style={styles.startBtn}
            >
              <Text style={styles.startBtnText}>Begin Session</Text>
              <Feather name="play" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const phaseLabel = phase?.label ?? "";
  const phaseInstruction = phase?.instruction ?? "";
  const progress = cycleNum / pattern.totalCycles;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.sessionHeader}>
        <TouchableOpacity onPress={() => { audio.stopAll(); router.back(); }} style={styles.closeBtn}>
          <Feather name="x" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.sessionTitle}>{pattern.title}</Text>
        <View style={styles.sessionHeaderRight}>
          <TouchableOpacity
            onPress={() => setSoundEnabled(!soundEnabled)}
            style={[styles.soundBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather
              name={soundEnabled ? "volume-2" : "volume-x"}
              size={16}
              color={soundEnabled ? pattern.color : colors.textDim}
            />
          </TouchableOpacity>
          <Text style={styles.cycleLabel}>Cycle {cycleNum + 1}/{pattern.totalCycles}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: pattern.color }]}
        />
      </View>

      <View style={styles.circleArea}>
        <Animated.View
          style={[
            styles.outerRing,
            {
              transform: [{ scale: circleScale }],
              opacity: circleOpacity,
              borderColor: pattern.color + "60",
            },
          ]}
        />
        <Animated.View
          style={[
            styles.mainCircle,
            {
              transform: [{ scale: circleScale }],
              backgroundColor: pattern.color + "28",
              borderColor: pattern.color,
            },
          ]}
        >
          <Text style={[styles.phaseText, { color: pattern.color }]}>{phaseLabel}</Text>
          <Text style={[styles.timerNum, { color: colors.text }]}>{timeLeft}</Text>
          <Text style={styles.timerSec}>sec</Text>
        </Animated.View>
      </View>

      <Text style={styles.instruction}>{phaseInstruction}</Text>

      <View style={styles.phaseRow}>
        {pattern.phases.map((p, i) => (
          <View
            key={i}
            style={[
              styles.phaseIndicator,
              {
                backgroundColor: i === phaseIdx ? pattern.color : colors.card,
                borderColor: i === phaseIdx ? pattern.color : colors.border,
                flex: p.duration,
              },
            ]}
          >
            <Text
              style={[
                styles.phaseIndicatorLabel,
                { color: i === phaseIdx ? "#fff" : colors.textDim },
              ]}
            >
              {p.label}
            </Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  backBtn: {
    margin: spacing.md,
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  previewHero: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  previewTitle: { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 6, textAlign: "center" },
  previewSub: { fontSize: fontSizes.md, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center" },
  previewBody: { paddingHorizontal: spacing.md },
  breathImgCard: {
    height: 190,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    justifyContent: "flex-end",
  },
  breathImgCaption: {
    color: "#fff",
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    letterSpacing: 0.3,
  },
  previewDesc: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 22, marginBottom: spacing.md },
  sectionHead: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: spacing.sm },
  phaseGrid: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  phaseCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", borderWidth: 1 },
  phaseCardLabel: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  phaseCardDur: { fontSize: fontSizes.lg, fontFamily: "Inter_700Bold", color: colors.text },
  soundToggleRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm,
  },
  soundToggleLabel: { flex: 1, fontSize: fontSizes.sm, fontFamily: "Inter_500Medium" },
  toggle: { width: 46, height: 26, borderRadius: 13, borderWidth: 1.5, justifyContent: "center" },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  cyclesInfo: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cyclesText: { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium", color: colors.textMuted },
  startBtnWrapper: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18, borderRadius: radius.xl },
  startBtnText: { fontSize: fontSizes.lg, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sessionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  sessionTitle: { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold", color: colors.text },
  sessionHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  soundBtn: { width: 34, height: 34, borderRadius: radius.full, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cycleLabel: { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium", color: colors.textDim },
  progressTrack: { height: 3, backgroundColor: colors.cardAlt },
  progressFill: { height: "100%" },
  circleArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  outerRing: { position: "absolute", width: CIRCLE + 60, height: CIRCLE + 60, borderRadius: (CIRCLE + 60) / 2, borderWidth: 1 },
  mainCircle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  phaseText: { fontSize: fontSizes.lg, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  timerNum: { fontSize: 56, fontFamily: "Inter_700Bold", lineHeight: 64 },
  timerSec: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textDim },
  instruction: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  phaseRow: { flexDirection: "row", paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: 6 },
  phaseIndicator: { borderRadius: radius.sm, paddingVertical: 8, alignItems: "center", borderWidth: 1, minWidth: 20 },
  phaseIndicatorLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  completeTitle: { fontSize: fontSizes.xxxl, fontFamily: "Inter_700Bold", color: colors.text, marginTop: 24, marginBottom: 12 },
  completeSub: { fontSize: fontSizes.lg, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 28, marginBottom: 40 },
  doneBtn: { paddingHorizontal: 40, paddingVertical: 18, borderRadius: radius.xl },
  doneBtnText: { fontSize: fontSizes.lg, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
