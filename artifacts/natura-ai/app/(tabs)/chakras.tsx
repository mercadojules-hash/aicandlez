import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { chakras, Chakra } from "../../data/chakras";
import { useChecklist } from "../../hooks/useChecklist";

const { width } = Dimensions.get("window");

// ─── Sound Healing Widget ─────────────────────────────────────────────────────

function SoundHealingSection({ chakra }: { chakra: Chakra }) {
  const [playing, setPlaying] = useState(false);
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    ring1.setValue(1);
    ring2.setValue(1);
    ring3.setValue(1);
    ringAnim.current = Animated.loop(
      Animated.stagger(300, [
        Animated.sequence([
          Animated.timing(ring1, { toValue: 1.7, duration: 900, useNativeDriver: true }),
          Animated.timing(ring1, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ring2, { toValue: 1.5, duration: 900, useNativeDriver: true }),
          Animated.timing(ring2, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ring3, { toValue: 1.3, duration: 900, useNativeDriver: true }),
          Animated.timing(ring3, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    ringAnim.current.start();
  }, [ring1, ring2, ring3]);

  const stopPulse = useCallback(() => {
    ringAnim.current?.stop();
    ring1.setValue(1);
    ring2.setValue(1);
    ring3.setValue(1);
  }, [ring1, ring2, ring3]);

  useEffect(() => {
    if (playing) startPulse();
    else stopPulse();
    return () => stopPulse();
  }, [playing, startPulse, stopPulse]);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlaying((p) => !p);
  };

  const ringOpacity = (scale: Animated.Value) =>
    scale.interpolate({ inputRange: [1, 1.7], outputRange: [0.35, 0] });

  return (
    <View style={[sound.container, { borderColor: chakra.color + "30" }]}>
      <Text style={sound.title}>Sound Healing</Text>
      <Text style={sound.freq}>{chakra.soundFrequency}</Text>
      <Text style={[sound.label, { color: chakra.color }]}>{chakra.soundLabel}</Text>

      <View style={sound.orb}>
        {/* Animated rings */}
        {[ring1, ring2, ring3].map((r, i) => (
          <Animated.View
            key={i}
            style={[
              sound.ring,
              {
                backgroundColor: chakra.color,
                opacity: ringOpacity(r),
                transform: [{ scale: r }],
              },
            ]}
          />
        ))}
        {/* Core button */}
        <TouchableOpacity
          style={[sound.orbCore, { backgroundColor: playing ? chakra.color : chakra.color + "25", borderColor: chakra.color + "80" }]}
          onPress={toggle}
          activeOpacity={0.8}
        >
          <Feather name={playing ? "pause" : "play"} size={22} color={playing ? "#fff" : chakra.color} />
        </TouchableOpacity>
      </View>

      <Text style={sound.hint}>
        {playing ? "Playing · tap to pause" : "Tap to begin chakra frequency meditation"}
      </Text>
    </View>
  );
}

// ─── Chakra Detail Modal ──────────────────────────────────────────────────────

function BulletRow({ text, color, icon }: { text: string; color: string; icon: string }) {
  return (
    <View style={detail.bulletRow}>
      <View style={[detail.bulletIcon, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={12} color={color} />
      </View>
      <Text style={detail.bulletText}>{text}</Text>
    </View>
  );
}

function ChakraDetail({
  chakra,
  onClose,
}: {
  chakra: Chakra;
  onClose: () => void;
}) {
  const handlePosePress = () => {
    onClose();
    setTimeout(() => router.push(`/pose/${chakra.yogaPoseId}` as any), 300);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[detail.container, { backgroundColor: colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── SECTION 1: HERO ────────────────────────────────────────── */}
          <LinearGradient
            colors={[chakra.color + "70", chakra.color + "28", colors.background]}
            style={detail.hero}
          >
            <TouchableOpacity style={detail.closeBtn} onPress={onClose}>
              <Feather name="x" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={[detail.badge, { backgroundColor: chakra.color + "25", borderColor: chakra.color + "50" }]}>
              <Text style={[detail.badgeText, { color: chakra.color }]}>
                {chakra.number} of 7  ·  {chakra.mantra}
              </Text>
            </View>

            {/* Symbol circle with glow */}
            <View style={detail.symbolOuter}>
              <View style={[detail.symbolGlow, { backgroundColor: chakra.color + "30" }]} />
              <View style={[detail.symbolRing, { borderColor: chakra.color + "60" }]}>
                <Image
                  source={{ uri: chakra.symbol }}
                  style={detail.symbolImg}
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text style={detail.heroName}>{chakra.name}</Text>
            <Text style={detail.heroSanskrit}>{chakra.sanskrit}</Text>

            <View style={[detail.subtitlePill, { backgroundColor: chakra.color + "20", borderColor: chakra.color + "40" }]}>
              <Text style={[detail.subtitlePillText, { color: chakra.color }]}>✦  "{chakra.subtitle}"</Text>
            </View>
          </LinearGradient>

          {/* ── SECTION 2: CORE INFO ───────────────────────────────────── */}
          <View style={detail.body}>
            <View style={detail.infoRow}>
              <View style={[detail.infoPill, { borderColor: chakra.color + "40" }]}>
                <Feather name="wind" size={12} color={chakra.color} />
                <Text style={[detail.infoPillText, { color: chakra.color }]}>{chakra.element}</Text>
              </View>
              <View style={[detail.infoPill, { borderColor: chakra.color + "40" }]}>
                <Feather name="map-pin" size={12} color={chakra.color} />
                <Text style={[detail.infoPillText, { color: chakra.color }]}>{chakra.location}</Text>
              </View>
            </View>

            {/* Mantra box */}
            <View style={[detail.mantraBox, { borderColor: chakra.color + "40" }]}>
              <Text style={[detail.mantraLabel, { color: chakra.color }]}>Seed Mantra</Text>
              <Text style={[detail.mantraText, { color: chakra.color }]}>{chakra.mantra}</Text>
            </View>

            {/* About */}
            <Text style={detail.sectionHead}>About</Text>
            <Text style={detail.bodyText}>{chakra.description}</Text>

            {/* ── SECTION 3: CRYSTAL ─────────────────────────────────── */}
            <Text style={detail.sectionHead}>Crystal</Text>
            <View style={[detail.crystalCard, { borderColor: chakra.color + "30" }]}>
              <View style={[detail.crystalImgWrap, { borderColor: chakra.color + "40" }]}>
                <Image source={{ uri: chakra.crystalImage }} style={detail.crystalImg} resizeMode="cover" />
                <View style={[detail.crystalOverlay, { backgroundColor: chakra.color + "15" }]} />
              </View>
              <View style={detail.crystalText}>
                <Text style={detail.crystalName}>{chakra.crystalName}</Text>
                <Text style={detail.crystalBenefit}>{chakra.crystalBenefit}</Text>
              </View>
            </View>

            {/* ── SECTION 4: YOGA POSE ───────────────────────────────── */}
            <Text style={detail.sectionHead}>Recommended Pose</Text>
            <TouchableOpacity
              style={[detail.poseCard, { borderColor: chakra.color + "30" }]}
              onPress={handlePosePress}
              activeOpacity={0.85}
            >
              <View style={detail.poseImgWrap}>
                <Image source={{ uri: chakra.yogaPoseImage }} style={detail.poseImg} resizeMode="cover" />
                <LinearGradient
                  colors={["transparent", "rgba(10,25,16,0.8)"]}
                  style={detail.poseImgGrad}
                />
              </View>
              <View style={detail.poseContent}>
                <View style={detail.poseTop}>
                  <Text style={detail.poseName}>{chakra.yogaPoseName}</Text>
                  <View style={[detail.poseNavBtn, { backgroundColor: chakra.color + "20", borderColor: chakra.color + "50" }]}>
                    <Feather name="arrow-right" size={13} color={chakra.color} />
                  </View>
                </View>
                <Text style={detail.poseDesc}>{chakra.yogaPoseDescription}</Text>
              </View>
            </TouchableOpacity>

            {/* ── SECTION 5: SOUND HEALING ────────────────────────────── */}
            <Text style={detail.sectionHead}>Sound Healing</Text>
            <SoundHealingSection chakra={chakra} />

            {/* ── Benefits ──────────────────────────────────────────── */}
            <Text style={detail.sectionHead}>Benefits When Balanced</Text>
            <View style={detail.sectionCard}>
              {chakra.benefits.map((b) => (
                <BulletRow key={b} text={b} color={chakra.color} icon="check-circle" />
              ))}
            </View>

            {/* ── Imbalances ────────────────────────────────────────── */}
            <Text style={detail.sectionHead}>Signs of Imbalance</Text>
            <View style={detail.sectionCard}>
              {chakra.imbalances.map((i) => (
                <BulletRow key={i} text={i} color="#e67e22" icon="alert-circle" />
              ))}
            </View>

            {/* ── Affirmation ───────────────────────────────────────── */}
            <View style={[detail.affirmCard, { backgroundColor: chakra.color + "12", borderColor: chakra.color + "35" }]}>
              <Text style={[detail.affirmLabel, { color: chakra.color }]}>✦  Daily Affirmation</Text>
              <Text style={detail.affirmText}>"{chakra.affirmation}"</Text>
            </View>

            {/* ── Healing Foods ─────────────────────────────────────── */}
            <Text style={detail.sectionHead}>Healing Foods</Text>
            <View style={detail.chipWrap}>
              {chakra.foods.map((f) => (
                <View key={f} style={[detail.chip, { borderColor: colors.border }]}>
                  <Text style={detail.chipText}>{f}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 56 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Chakra Card (list) ──────────────────────────────────────────────────────

function ChakraCard({ chakra, onPress }: { chakra: Chakra; onPress: () => void }) {
  return (
    <TouchableOpacity style={list.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={[chakra.color + "30", chakra.color + "0A", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={list.cardGrad}
      >
        <View style={[list.accentBar, { backgroundColor: chakra.color }]} />

        {/* Text */}
        <View style={list.cardLeft}>
          <View style={list.topRow}>
            <Text style={[list.num, { color: chakra.color + "80" }]}>
              {String(chakra.number).padStart(2, "0")}
            </Text>
            <View style={[list.subtitlePill, { backgroundColor: chakra.color + "20" }]}>
              <Text style={[list.subtitleText, { color: chakra.color }]}>{chakra.subtitle}</Text>
            </View>
          </View>
          <Text style={list.name}>{chakra.name}</Text>
          <Text style={list.sanskrit}>{chakra.sanskrit}</Text>
          <Text style={list.snippet} numberOfLines={2}>
            {chakra.description.slice(0, 68)}…
          </Text>
        </View>

        {/* Symbol image */}
        <View style={[list.symbolWrap, { borderColor: chakra.color + "40", backgroundColor: chakra.color + "10" }]}>
          <Image
            source={{ uri: chakra.symbol }}
            style={list.symbolImg}
            resizeMode="contain"
          />
        </View>

        <Feather name="chevron-right" size={15} color={chakra.color + "70"} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ChakrasScreen() {
  const [selected, setSelected] = useState<Chakra | null>(null);
  const { markComplete } = useChecklist();

  const handleOpen = (c: Chakra) => {
    markComplete("chakra");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(c);
  };

  return (
    <SafeAreaView style={screen.safe} edges={["top"]}>
      <ScrollView style={screen.scroll} showsVerticalScrollIndicator={false}>
        <View style={screen.header}>
          <Text style={screen.title}>Chakra System</Text>
          <Text style={screen.subtitle}>Your body's energy centers</Text>
        </View>

        {/* Spectrum bar */}
        <View style={screen.spectrum}>
          {chakras.map((c) => (
            <View key={c.id} style={[screen.specDot, { backgroundColor: c.color }]} />
          ))}
        </View>

        <View style={screen.listWrap}>
          {chakras.map((c) => (
            <ChakraCard key={c.id} chakra={c} onPress={() => handleOpen(c)} />
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {selected && (
        <ChakraDetail chakra={selected} onClose={() => setSelected(null)} />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const screen = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textMuted },
  spectrum: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 6, marginBottom: spacing.md },
  specDot: { flex: 1, height: 4, borderRadius: radius.full, opacity: 0.8 },
  listWrap: { paddingHorizontal: spacing.md, gap: 10 },
});

const list = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    gap: 10,
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  cardLeft: { flex: 1, paddingLeft: spacing.md + 4 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  num: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  subtitlePill: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  subtitleText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  name: { fontSize: fontSizes.md, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 2 },
  sanskrit: { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium", color: colors.accent, marginBottom: 5 },
  snippet: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 16 },
  symbolWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  symbolImg: { width: 52, height: 52 },
});

const detail = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingTop: 54,
    paddingBottom: 28,
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 18,
  },
  badgeText: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  symbolOuter: { alignItems: "center", justifyContent: "center", marginBottom: 16 },
  symbolGlow: { position: "absolute", width: 160, height: 160, borderRadius: 80 },
  symbolRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(13,31,22,0.6)",
    overflow: "hidden",
  },
  symbolImg: { width: 100, height: 100 },
  heroName: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 4,
    textAlign: "center",
  },
  heroSanskrit: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
    marginBottom: 14,
  },
  subtitlePill: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  subtitlePillText: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  infoRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  infoPillText: { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  mantraBox: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginBottom: spacing.sm,
  },
  mantraLabel: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 6 },
  mantraText: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: 10 },
  sectionHead: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  bodyText: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 22 },
  crystalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  crystalImgWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
  },
  crystalImg: { width: "100%", height: "100%" },
  crystalOverlay: { ...StyleSheet.absoluteFillObject },
  crystalText: { flex: 1 },
  crystalName: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 6 },
  crystalBenefit: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 18 },
  poseCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  poseImgWrap: { width: "100%", height: 140 },
  poseImg: { width: "100%", height: "100%" },
  poseImgGrad: { ...StyleSheet.absoluteFillObject },
  poseContent: { padding: spacing.md },
  poseTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  poseName: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", color: colors.text },
  poseNavBtn: {
    borderRadius: radius.full,
    borderWidth: 1,
    padding: 6,
  },
  poseDesc: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 18 },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10,
  },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 20,
  },
  affirmCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.lg,
    alignItems: "center",
  },
  affirmLabel: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  affirmText: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_400Regular",
    color: colors.text,
    textAlign: "center",
    lineHeight: 26,
    fontStyle: "italic",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipText: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", color: colors.textMuted },
});

const sound = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  title: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 1.5 },
  freq: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.text, marginVertical: 2 },
  label: { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium", marginBottom: 16 },
  orb: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  ring: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  orbCore: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
});
