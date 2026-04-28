import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { yogaFlows } from "../../data/flows";
import { useStreak } from "../../hooks/useStreak";
import { useChecklist } from "../../hooks/useChecklist";

const { width } = Dimensions.get("window");

export default function FlowSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flow = yogaFlows.find((f) => f.id === id);

  const [started, setStarted] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const { recordActivity } = useStreak();
  const { markComplete } = useChecklist();

  const pose = flow?.poses[poseIndex];

  useEffect(() => {
    if (!started || paused || !pose) return;
    setTimeLeft(pose.duration);
    progressAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: pose.duration * 1000,
      useNativeDriver: false,
    }).start();

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
  }, [poseIndex, started, paused]);

  const advance = () => {
    if (!flow) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      if (poseIndex < flow.poses.length - 1) {
        setPoseIndex((i) => i + 1);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      } else {
        setCompleted(true);
        recordActivity();
        markComplete("yoga");
      }
    });
  };

  const togglePause = () => {
    if (paused) {
      setPaused(false);
    } else {
      clearInterval(timerRef.current!);
      setPaused(true);
    }
  };

  if (!flow) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.text }}>Flow not found</Text>
      </View>
    );
  }

  // Overview screen
  if (!started) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={[flow.color + "30", flow.color + "08", colors.background]}
            style={styles.overviewHero}
          >
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Feather name="arrow-left" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={[styles.flowIconLarge, { backgroundColor: flow.color + "30" }]}>
              <Feather name={flow.icon as any} size={36} color={flow.color} />
            </View>
            <Text style={styles.overviewTitle}>{flow.title}</Text>
            <Text style={styles.overviewSubtitle}>{flow.subtitle}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Feather name="clock" size={12} color={colors.textDim} />
                <Text style={styles.metaText}>{flow.duration}</Text>
              </View>
              <View style={styles.metaPill}>
                <Feather name="layers" size={12} color={colors.textDim} />
                <Text style={styles.metaText}>{flow.poses.length} poses</Text>
              </View>
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>{flow.level}</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.overviewBody}>
            <Text style={styles.overviewDesc}>{flow.description}</Text>

            <Text style={styles.sectionHead}>Benefits</Text>
            {flow.benefits.map((b) => (
              <View key={b} style={styles.listRow}>
                <Feather name="check-circle" size={14} color={flow.color} />
                <Text style={styles.listText}>{b}</Text>
              </View>
            ))}

            <Text style={styles.sectionHead}>Poses in This Flow</Text>
            {flow.poses.map((p, i) => (
              <View key={i} style={styles.posePreviewRow}>
                <Text style={[styles.poseNum, { color: flow.color }]}>{i + 1}</Text>
                <View>
                  <Text style={styles.poseName}>{p.name}</Text>
                  <Text style={styles.poseDur}>{p.duration}s</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.startBtnWrapper}>
          <TouchableOpacity onPress={() => setStarted(true)} activeOpacity={0.88}>
            <LinearGradient
              colors={[flow.color, flow.color + "cc"]}
              style={styles.startFlowBtn}
            >
              <Text style={styles.startFlowText}>Begin Flow</Text>
              <Feather name="play" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Completion screen
  if (completed) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
        <LinearGradient
          colors={[flow.color + "30", colors.background]}
          style={StyleSheet.absoluteFillObject}
        />
        <Feather name="check-circle" size={72} color={flow.color} />
        <Text style={styles.completeTitle}>Flow Complete!</Text>
        <Text style={styles.completeSub}>
          You just completed{"\n"}{flow.title}
        </Text>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: flow.color }]}
          onPress={() => router.back()}
        >
          <Text style={styles.doneBtnText}>Return to Flows</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Active session
  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.sessionHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.sessionBackBtn}>
          <Feather name="x" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.sessionFlowName}>{flow.title}</Text>
        <Text style={styles.poseCounter}>
          {poseIndex + 1} / {flow.poses.length}
        </Text>
      </View>

      {/* Overall progress */}
      <View style={styles.overallProgress}>
        <View
          style={[
            styles.overallFill,
            {
              width: `${((poseIndex) / flow.poses.length) * 100}%`,
              backgroundColor: flow.color,
            },
          ]}
        />
      </View>

      {/* Pose content */}
      <Animated.View style={[styles.poseContent, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={[flow.color + "18", "transparent"]}
          style={styles.poseCard}
        >
          <Text style={[styles.poseCurrent, { color: flow.color }]}>Pose {poseIndex + 1}</Text>
          <Text style={styles.poseNameLarge}>{pose?.name}</Text>

          <View style={styles.timerCircle}>
            <Text style={[styles.timerNum, { color: flow.color }]}>{timeLeft}</Text>
            <Text style={styles.timerLabel}>seconds</Text>
          </View>

          {/* Pose timer bar */}
          <View style={styles.poseProgressTrack}>
            <Animated.View
              style={[styles.poseProgressFill, { width: barWidth, backgroundColor: flow.color }]}
            />
          </View>

          <View style={styles.breathBox}>
            <Feather name="wind" size={14} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.breathText}>{pose?.breathInstruction}</Text>
          </View>

          <Text style={styles.poseInstruction}>{pose?.instruction}</Text>

          {pose?.holdCue && (
            <Text style={styles.holdCue}>✦ {pose.holdCue}</Text>
          )}
        </LinearGradient>
      </Animated.View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={() => setPoseIndex((i) => Math.max(0, i - 1))}>
          <Feather name="skip-back" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.playPauseBtn, { backgroundColor: flow.color }]}
          onPress={togglePause}
        >
          <Feather name={paused ? "play" : "pause"} size={26} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={advance}>
          <Feather name="skip-forward" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  // Overview
  overviewHero: { paddingTop: 60, paddingBottom: 32, alignItems: "center", paddingHorizontal: spacing.md },
  backBtn: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flowIconLarge: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  overviewTitle: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 6,
    textAlign: "center",
  },
  overviewSubtitle: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    marginBottom: 16,
    textAlign: "center",
  },
  metaRow: { flexDirection: "row", gap: 8 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
  },
  overviewBody: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 100 },
  overviewDesc: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  sectionHead: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  listText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  posePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poseNum: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_700Bold",
    width: 28,
    textAlign: "center",
  },
  poseName: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
  poseDur: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    marginTop: 2,
  },
  startBtnWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startFlowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: radius.xl,
  },
  startFlowText: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  // Session
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionBackBtn: {
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionFlowName: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
  poseCounter: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.textDim,
  },
  overallProgress: {
    height: 3,
    backgroundColor: colors.cardAlt,
  },
  overallFill: {
    height: "100%",
  },
  poseContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  poseCard: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  poseCurrent: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  poseNameLarge: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  timerCircle: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  timerNum: {
    fontSize: 64,
    fontFamily: "Inter_700Bold",
    lineHeight: 72,
  },
  timerLabel: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
  poseProgressTrack: {
    height: 4,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.full,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  poseProgressFill: {
    height: "100%",
    borderRadius: radius.full,
  },
  breathBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  breathText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.accent,
  },
  poseInstruction: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  holdCue: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.textDim,
    fontStyle: "italic",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  controlBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  playPauseBtn: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  // Completion
  completeTitle: {
    fontSize: fontSizes.xxxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  completeSub: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 40,
  },
  doneBtn: {
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: radius.xl,
  },
  doneBtnText: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
