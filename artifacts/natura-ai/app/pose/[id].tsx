import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Modal,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { yogaPoses } from "../../data/poses";

const { width, height } = Dimensions.get("window");
const HERO_H = height * 0.42;

const diffColor: Record<string, string> = {
  Beginner: colors.primary,
  Intermediate: colors.accent,
};

function HoldTimer({
  visible,
  duration,
  poseName,
  onClose,
}: {
  visible: boolean;
  duration: number;
  poseName: string;
  onClose: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      setTimeLeft(duration);
      setRunning(false);
      setDone(false);
      progressAnim.setValue(1);
    }
  }, [visible]);

  const start = () => {
    setRunning(true);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: timeLeft * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setRunning(false);
          setDone(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const reset = () => {
    clearInterval(timerRef.current!);
    setTimeLeft(duration);
    setRunning(false);
    setDone(false);
    progressAnim.setValue(1);
  };

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const display = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={timer.overlay}>
        <View style={timer.card}>
          <Text style={timer.label}>Hold Timer</Text>
          <Text style={timer.poseName}>{poseName}</Text>

          <View style={timer.clockArea}>
            <View style={timer.clockRing}>
              <Text style={[timer.clockNum, done && { color: colors.primary }]}>{display}</Text>
              <Text style={timer.clockSec}>{done ? "complete" : "seconds"}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={timer.progressTrack}>
            <Animated.View style={[timer.progressFill, { width: barWidth }]} />
          </View>

          <View style={timer.btnRow}>
            {!running && !done ? (
              <TouchableOpacity style={timer.primaryBtn} onPress={start}>
                <Feather name="play" size={20} color="#fff" />
                <Text style={timer.primaryBtnText}>Start Holding</Text>
              </TouchableOpacity>
            ) : done ? (
              <>
                <TouchableOpacity style={timer.secondaryBtn} onPress={reset}>
                  <Text style={timer.secondaryBtnText}>Hold Again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={timer.primaryBtn} onPress={onClose}>
                  <Text style={timer.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={timer.secondaryBtn} onPress={reset}>
                <Feather name="refresh-ccw" size={16} color={colors.textMuted} />
                <Text style={timer.secondaryBtnText}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={timer.closeBtn} onPress={onClose}>
            <Feather name="x" size={18} color={colors.textDim} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function PoseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pose = yogaPoses.find((p) => p.id === id);
  const [timerVisible, setTimerVisible] = useState(false);

  if (!pose) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.text }}>Pose not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        <View style={styles.hero}>
          <Image source={{ uri: pose.image }} style={styles.heroImage} resizeMode="cover" />
          <LinearGradient
            colors={["transparent", "rgba(13,31,22,0.6)", colors.background]}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView style={styles.heroOverlay} edges={["top"]}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>

          <View style={styles.heroMeta}>
            <View style={[styles.diffBadge, { backgroundColor: diffColor[pose.difficulty] + "30", borderColor: diffColor[pose.difficulty] + "60" }]}>
              <Text style={[styles.diffText, { color: diffColor[pose.difficulty] }]}>{pose.difficulty}</Text>
            </View>
            <View style={styles.catBadge}>
              <Text style={styles.catText}>{pose.category}</Text>
            </View>
          </View>
        </View>

        {/* Content */}
        <View style={styles.body}>
          <Text style={styles.poseName}>{pose.name}</Text>
          <Text style={styles.shortDesc}>{pose.shortDesc}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Feather name="clock" size={14} color={colors.textDim} />
              <Text style={styles.metaText}>{pose.duration}</Text>
            </View>
            {pose.holdDuration > 0 && (
              <View style={styles.metaItem}>
                <Feather name="timer" size={14} color={colors.textDim} />
                <Text style={styles.metaText}>{pose.holdDuration}s hold</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* Step-by-step instructions */}
          <Text style={styles.sectionHead}>Step-by-Step Instructions</Text>
          {pose.instructions.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}

          {/* Breathing */}
          <View style={styles.breathCard}>
            <View style={styles.breathHeader}>
              <Feather name="wind" size={16} color={colors.accent} />
              <Text style={styles.breathTitle}>{pose.breathingPattern}</Text>
            </View>
            <Text style={styles.breathDetail}>{pose.breathingDetail}</Text>
          </View>

          {/* Benefits */}
          <Text style={styles.sectionHead}>Benefits</Text>
          {pose.benefits.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <Feather name="check-circle" size={14} color={colors.primary} style={{ marginTop: 2 }} />
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}

          {/* Common mistakes */}
          <Text style={styles.sectionHead}>Common Mistakes</Text>
          {pose.commonMistakes.map((m, i) => (
            <View key={i} style={styles.bulletRow}>
              <Feather name="alert-circle" size={14} color={colors.accent} style={{ marginTop: 2 }} />
              <Text style={styles.bulletText}>{m}</Text>
            </View>
          ))}

          {/* Related poses */}
          <Text style={styles.sectionHead}>More Poses</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.relatedScroll}>
            {yogaPoses
              .filter((p) => p.id !== pose.id)
              .slice(0, 4)
              .map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.relatedCard}
                  onPress={() => router.replace(`/pose/${p.id}` as any)}
                >
                  <Image source={{ uri: p.image }} style={styles.relatedImg} resizeMode="cover" />
                  <View style={styles.relatedOverlay} />
                  <Text style={styles.relatedName}>{p.name}</Text>
                </TouchableOpacity>
              ))}
          </ScrollView>

          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      {/* Fixed bottom timer button */}
      {pose.holdDuration > 0 && (
        <View style={styles.timerBtnWrapper}>
          <TouchableOpacity
            style={styles.timerBtn}
            onPress={() => setTimerVisible(true)}
            activeOpacity={0.88}
          >
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.timerBtnGrad}>
              <Feather name="timer" size={20} color="#fff" />
              <Text style={styles.timerBtnText}>Start Hold Timer ({pose.holdDuration}s)</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <HoldTimer
        visible={timerVisible}
        duration={pose.holdDuration}
        poseName={pose.name}
        onClose={() => setTimerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { height: HERO_H, position: "relative" },
  heroImage: { width: "100%", height: "100%" },
  heroOverlay: { position: "absolute", top: 0, left: 0, right: 0 },
  backBtn: {
    margin: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: "rgba(13,31,22,0.7)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  heroMeta: {
    position: "absolute",
    bottom: 20,
    left: spacing.md,
    flexDirection: "row",
    gap: 8,
  },
  diffBadge: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  diffText: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  catBadge: {
    backgroundColor: "rgba(13,31,22,0.7)",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  catText: { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium", color: colors.textMuted },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  poseName: {
    fontSize: fontSizes.xxxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 8,
    lineHeight: 40,
  },
  shortDesc: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  metaRow: { flexDirection: "row", gap: 16, marginBottom: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textDim },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.lg },
  sectionHead: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_700Bold",
    color: colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
  },
  breathCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent + "30",
  },
  breathHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  breathTitle: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    color: colors.accent,
  },
  breathDetail: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 20,
  },
  relatedScroll: { marginTop: spacing.sm },
  relatedCard: {
    width: 120,
    height: 90,
    borderRadius: radius.md,
    overflow: "hidden",
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  relatedImg: { width: "100%", height: "100%" },
  relatedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,25,16,0.5)" },
  relatedName: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  timerBtnWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: 28,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timerBtn: { borderRadius: radius.xl, overflow: "hidden" },
  timerBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  timerBtnText: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});

const timer = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,20,14,0.85)",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  card: {
    width: "100%",
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  label: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    color: colors.textDim,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  poseName: {
    fontSize: fontSizes.xl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: spacing.xl,
    textAlign: "center",
  },
  clockArea: {
    marginBottom: spacing.xl,
  },
  clockRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: colors.primary + "50",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary + "10",
  },
  clockNum: {
    fontSize: 52,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    lineHeight: 60,
  },
  clockSec: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    overflow: "hidden",
    marginBottom: spacing.xl,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: 16,
  },
  primaryBtnText: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.xl,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.textMuted,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 8,
  },
});
