import { useEffect, useRef, useState } from "react";
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
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { spacing, radius, fontSizes } from "../../constants/theme";
import { useStreak } from "../../hooks/useStreak";
import { useChecklist } from "../../hooks/useChecklist";
import { useJourney } from "../../hooks/useJourney";
import { useTheme, ThemeOverride } from "../../contexts/ThemeContext";
import { useUser } from "../../contexts/UserContext";
import { JOURNEY_WEEKS } from "../../data/journey";

const { width } = Dimensions.get("window");

const LOGO = require("../../assets/images/natura-logo-clean.png");

// ─── Slider images ────────────────────────────────────────────────────────────

const SLIDER_W = width - spacing.md * 2;

const SLIDES: { id: string; source: number }[] = [
  { id: "1", source: require("../../assets/images/natura-home-slide-1.webp") },
  { id: "2", source: require("../../assets/images/natura-home-slide-2.webp") },
  { id: "3", source: require("../../assets/images/natura-home-slide-3.webp") },
];

function HomeSlider() {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const idxRef    = useRef(0);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = (idxRef.current + 1) % SLIDES.length;
      idxRef.current = next;
      setActiveIdx(next);
      scrollRef.current?.scrollTo({ x: next * SLIDER_W, animated: true });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[sliderStyles.wrap, { marginHorizontal: spacing.md, marginBottom: 8 }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ width: SLIDER_W, borderRadius: radius.lg, overflow: "hidden" }}
      >
        {SLIDES.map((slide) => (
          <View key={slide.id} style={sliderStyles.slide}>
            <Image source={slide.source as any} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            <LinearGradient
              colors={["transparent", "rgba(4,14,8,0.65)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={sliderStyles.caption}>Breathe. Move. Transform.</Text>
          </View>
        ))}
      </ScrollView>
      <View style={sliderStyles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              sliderStyles.dot,
              { backgroundColor: i === activeIdx ? colors.primary : colors.border, width: i === activeIdx ? 18 : 6 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  slide: {
    width: SLIDER_W,
    height: 180,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  caption: {
    color: "#fff",
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16,
    paddingBottom: 16,
    letterSpacing: 0.4,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  dot: {
    height: 6,
    borderRadius: radius.full,
    opacity: 0.9,
  },
});

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AvatarButton() {
  const { profile } = useUser();
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={() => router.push("/profile" as any)}
      activeOpacity={0.8}
      style={[styles.avatarWrap, { borderColor: colors.primary + "60" }]}
    >
      {profile.image ? (
        <Image source={{ uri: profile.image }} style={styles.avatarImg} />
      ) : (
        <Image source={LOGO} style={styles.avatarImg} resizeMode="contain" />
      )}
    </TouchableOpacity>
  );
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

const THEME_CYCLE: ThemeOverride[] = ["dark", "light", "system"];
const THEME_ICONS: Record<ThemeOverride, string> = { dark: "moon", light: "sun", system: "monitor" };
const THEME_LABELS: Record<ThemeOverride, string> = { dark: "Dark", light: "Light", system: "Auto" };

function ThemeToggle() {
  const { override, setOverride, colors } = useTheme();
  const next = () => {
    const i = THEME_CYCLE.indexOf(override);
    setOverride(THEME_CYCLE[(i + 1) % THEME_CYCLE.length]);
  };
  return (
    <TouchableOpacity
      onPress={next}
      activeOpacity={0.75}
      style={[styles.themeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Feather name={THEME_ICONS[override] as any} size={14} color={colors.primary} />
      <Text style={[styles.themeBtnText, { color: colors.textMuted }]}>{THEME_LABELS[override]}</Text>
    </TouchableOpacity>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 900, useNativeDriver: false }).start();
  }, [value]);
  const w = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const { colors } = useTheme();
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.cardAlt }]}>
      <Animated.View style={[styles.progressFill, { width: w, backgroundColor: color }]} />
    </View>
  );
}

// ─── Check Item ───────────────────────────────────────────────────────────────

function CheckItem({
  label,
  done,
  onPress,
}: {
  label: string;
  done: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.checkRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.checkbox,
          { borderColor: done ? colors.primary : colors.borderLight },
          done && { backgroundColor: colors.primary },
        ]}
      >
        {done && <Feather name="check" size={13} color="#fff" />}
      </View>
      <Text style={[styles.checkLabel, { color: done ? colors.textDim : colors.text }, done && styles.checkLabelDone]}>
        {label}
      </Text>
      {!done && <Feather name="chevron-right" size={14} color={colors.textDim} style={{ marginLeft: "auto" }} />}
    </TouchableOpacity>
  );
}

// ─── Quick Action Card ────────────────────────────────────────────────────────

function QuickCard({ label, icon, route, color }: { label: string; icon: string; route: string; color: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.quickCard, { borderColor: colors.border }]}
      onPress={() => router.push(route as any)}
      activeOpacity={0.8}
    >
      <LinearGradient colors={[color + "33", color + "0C"]} style={styles.quickCardGrad}>
        <View style={[styles.quickIcon, { backgroundColor: color + "28" }]}>
          <Feather name={icon as any} size={22} color={color} />
        </View>
        <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── 30-Day Journey Section ───────────────────────────────────────────────────

function JourneySection({
  currentDay,
  completedDays,
}: {
  currentDay: number;
  completedDays: number[];
}) {
  const { colors } = useTheme();
  const activeWeekIdx = Math.max(0, Math.ceil(currentDay / 7) - 1);
  const [selectedWeek, setSelectedWeek] = useState(activeWeekIdx);
  const week = JOURNEY_WEEKS[selectedWeek];
  const weekStartDay = selectedWeek * 7 + 1;

  return (
    <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.md }}>
      {/* Header */}
      <View style={jStyles.sectionHeader}>
        <Text style={[jStyles.sectionTitle, { color: colors.text }]}>30-Day Yoga Journey</Text>
        <View style={[jStyles.dayPill, { backgroundColor: colors.primary + "1A", borderColor: colors.primary + "40" }]}>
          <Feather name="calendar" size={11} color={colors.primary} />
          <Text style={[jStyles.dayPillText, { color: colors.primary }]}>Day {currentDay} / 28</Text>
        </View>
      </View>

      {/* Week Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
      >
        {JOURNEY_WEEKS.map((w, i) => {
          const isActive   = i === selectedWeek;
          const isDoneWeek = currentDay > (i + 1) * 7;
          return (
            <TouchableOpacity
              key={w.week}
              onPress={() => setSelectedWeek(i)}
              style={[
                jStyles.weekTab,
                { borderColor: isActive ? colors.primary : colors.border },
                isActive && { backgroundColor: colors.primary + "1A" },
              ]}
              activeOpacity={0.75}
            >
              {isDoneWeek && <Feather name="check" size={11} color={colors.primary} />}
              <Text style={[jStyles.weekTabText, { color: isActive ? colors.primary : colors.textDim }]}>
                Week {w.week}
              </Text>
              <Text style={[jStyles.weekTabSub, { color: isActive ? colors.primary + "aa" : colors.border }]}>
                {w.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Hero Card */}
      <View style={jStyles.heroCard}>
        <Image source={week.image as any} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <LinearGradient colors={["transparent", "rgba(4,14,8,0.8)"]} style={StyleSheet.absoluteFillObject} />
        <View style={jStyles.heroOverlay}>
          <Text style={jStyles.heroWeekLabel}>WEEK {week.week}</Text>
          <Text style={jStyles.heroTitle}>{week.title}</Text>
        </View>
      </View>

      {/* Day List */}
      <View style={[jStyles.dayList, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {week.days.map((dayName, i) => {
          const dayNum   = weekStartDay + i;
          const isDone   = completedDays.includes(dayNum);
          const isCurrent = dayNum === currentDay;
          const isFuture  = dayNum > currentDay;

          return (
            <TouchableOpacity
              key={i}
              style={[
                jStyles.dayRow,
                { borderBottomColor: i < week.days.length - 1 ? colors.border : "transparent" },
                isCurrent && { backgroundColor: colors.primary + "0E" },
              ]}
              onPress={() => router.push("/(tabs)/ai")}
              activeOpacity={isFuture ? 0.45 : 0.75}
            >
              <View
                style={[
                  jStyles.dayCircle,
                  { borderColor: isDone ? colors.primary : isCurrent ? colors.primary : colors.borderLight },
                  isDone && { backgroundColor: colors.primary },
                ]}
              >
                {isDone ? (
                  <Feather name="check" size={11} color="#fff" />
                ) : (
                  <Text style={[jStyles.dayCircleNum, { color: isCurrent ? colors.primary : colors.textDim }]}>
                    {dayNum}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    jStyles.dayName,
                    { color: isFuture ? colors.textDim : isDone ? colors.textDim : colors.text },
                    isDone && { textDecorationLine: "line-through" },
                  ]}
                >
                  {dayName}
                </Text>
                {isCurrent && (
                  <Text style={[jStyles.todayLabel, { color: colors.primary }]}>TODAY</Text>
                )}
              </View>

              {isCurrent && <Feather name="chevron-right" size={16} color={colors.primary} />}
              {isFuture && <View style={[jStyles.futureDot, { backgroundColor: colors.borderLight }]} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const jStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSizes.md, fontFamily: "Inter_700Bold" },
  dayPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: radius.full, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  dayPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  weekTab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: radius.full, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  weekTabText: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  weekTabSub: { fontSize: 10, fontFamily: "Inter_400Regular" },
  heroCard: {
    height: 170, borderRadius: radius.lg, overflow: "hidden",
    marginBottom: spacing.sm, justifyContent: "flex-end",
  },
  heroOverlay: { padding: spacing.md },
  heroWeekLabel: {
    fontSize: 10, fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.65)", letterSpacing: 1.2, marginBottom: 4,
  },
  heroTitle: { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold", color: "#fff" },
  dayList: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  dayRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: 13,
    gap: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayCircle: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  dayCircleNum: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dayName: { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium" },
  todayLabel: { fontSize: 10, fontFamily: "Inter_700Bold", marginTop: 2, letterSpacing: 0.6 },
  futureDot: { width: 6, height: 6, borderRadius: 3 },
});

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { streak } = useStreak();
  const { getProgress } = useChecklist();
  const { currentDay, completedDays } = useJourney();
  const { colors } = useTheme();

  const progress = getProgress();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const quickActions = [
    { label: "Yoga Poses", icon: "activity", route: "/(tabs)/yoga",    color: colors.accent },
    { label: "Breathe",    icon: "wind",     route: "/(tabs)/breathe", color: colors.primary },
    { label: "Chakras",    icon: "circle",   route: "/(tabs)/chakras", color: "#7c6ead" },
    { label: "AI Coach",   icon: "message-circle", route: "/(tabs)/ai", color: "#6ea8ed" },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AvatarButton />
            <View>
              <Text style={[styles.greeting, { color: colors.textMuted }]}>{greeting}</Text>
              <Text style={[styles.name, { color: colors.text }]}>Natura AI</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <ThemeToggle />
            {streak > 0 && (
              <View style={[styles.streakBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="zap" size={14} color="#FFB74D" />
                <Text style={[styles.streakNum, { color: colors.text }]}>{streak}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── DAILY PROGRESS ──────────────────────────────────────────── */}
        <View style={[styles.section, { paddingHorizontal: spacing.md }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Progress</Text>
            <Text style={[styles.progressPct, { color: colors.primary }]}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
          <ProgressBar value={progress} color={colors.primary} />
          <Text style={[styles.progressHint, { color: colors.textDim }]}>
            {progress === 0
              ? "Start your first practice today"
              : progress < 1
              ? "Keep going — you're almost there!"
              : "Amazing! You completed today's goals"}
          </Text>
        </View>

        {/* ── QUICK ACTIONS ───────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { paddingHorizontal: spacing.md, marginBottom: spacing.sm, color: colors.text }]}>
          Start Practicing
        </Text>
        <View style={styles.quickGrid}>
          {quickActions.map((a) => (
            <QuickCard key={a.label} {...a} />
          ))}
        </View>

        {/* ── 30-DAY YOGA JOURNEY ─────────────────────────────────────── */}
        <JourneySection currentDay={currentDay} completedDays={completedDays} />

        {/* ── AI BANNER ───────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.aiBanner, { borderColor: colors.border, marginHorizontal: spacing.md }]}
          onPress={() => router.push("/(tabs)/ai")}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={[colors.cardHover, colors.card]}
            style={styles.aiBannerGrad}
          >
            <View style={styles.aiBannerLeft}>
              <View style={[styles.aiIcon, { backgroundColor: colors.primary + "20" }]}>
                <Feather name="message-circle" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.aiBannerTitle, { color: colors.text }]}>AI Wellness Coach</Text>
                <Text style={[styles.aiBannerSub, { color: colors.textMuted }]}>
                  Get a personalised recommendation
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textDim} />
          </LinearGradient>
        </TouchableOpacity>

        {/* ── INSPIRE SLIDER ──────────────────────────────────────── */}
        <HomeSlider />

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatarWrap: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, overflow: "hidden",
    backgroundColor: "#0B2E1F",
  },
  avatarImg: { width: "100%", height: "100%" },
  greeting: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginBottom: 2 },
  name: { fontSize: fontSizes.md, fontFamily: "Inter_700Bold" },
  themeBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: radius.full, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  themeBtnText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  streakBadge: {
    flexDirection: "row", alignItems: "center",
    borderRadius: radius.full, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 6, gap: 4,
  },
  streakNum: { fontSize: fontSizes.md, fontFamily: "Inter_700Bold" },
  section: { marginBottom: spacing.md },
  card: {
    borderRadius: radius.lg, borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginBottom: 4,
  },
  progressHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: spacing.sm,
  },
  progressPct: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold" },
  progressTrack: { height: 8, borderRadius: radius.full, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radius.full },
  progressHint: {
    marginTop: 8, fontSize: fontSizes.xs, fontFamily: "Inter_400Regular",
  },
  quickGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: spacing.md, gap: 10,
    marginBottom: spacing.md,
  },
  quickCard: {
    width: (width - spacing.md * 2 - 10) / 2,
    borderRadius: radius.lg, overflow: "hidden", borderWidth: 1,
  },
  quickCardGrad: { padding: spacing.md, alignItems: "flex-start", gap: 10 },
  quickIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold" },
  checklistHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checklistMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checklistCount: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
  },
  checkRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  checkLabel: { fontSize: fontSizes.md, fontFamily: "Inter_400Regular", flex: 1 },
  checkLabelDone: { textDecorationLine: "line-through" },
  aiBanner: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1 },
  aiBannerGrad: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: spacing.md,
  },
  aiBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  aiIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  aiBannerTitle: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold" },
  aiBannerSub: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", marginTop: 2 },
});
