import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { chakras, Chakra } from "../../data/chakras";
import { useChecklist } from "../../hooks/useChecklist";

const { width } = Dimensions.get("window");

// ─── Detail Modal ────────────────────────────────────────────────────────────

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

function ChakraDetail({ chakra, onClose }: { chakra: Chakra; onClose: () => void }) {
  const glowColor = chakra.color + "30";

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[detail.container, { backgroundColor: colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <LinearGradient
            colors={[chakra.color + "60", chakra.color + "25", colors.background]}
            style={detail.hero}
          >
            {/* Close */}
            <TouchableOpacity style={detail.closeBtn} onPress={onClose}>
              <Feather name="x" size={18} color={colors.text} />
            </TouchableOpacity>

            {/* Number badge */}
            <View style={[detail.badge, { backgroundColor: chakra.color + "30", borderColor: chakra.color + "60" }]}>
              <Text style={[detail.badgeText, { color: chakra.color }]}>
                {chakra.number} of 7
              </Text>
            </View>

            {/* Chakra image */}
            <View style={[detail.imageWrap, { shadowColor: chakra.color }]}>
              <Image
                source={{ uri: chakra.image }}
                style={detail.heroImage}
                resizeMode="cover"
              />
              <View style={[detail.imageGlow, { backgroundColor: glowColor }]} />
            </View>

            {/* Name + subtitle */}
            <Text style={detail.heroName}>{chakra.name}</Text>
            <Text style={detail.heroSanskrit}>{chakra.sanskrit}</Text>

            {/* Affirmation word pill */}
            <View style={[detail.subtitlePill, { backgroundColor: chakra.color + "20", borderColor: chakra.color + "40" }]}>
              <Text style={[detail.subtitlePillText, { color: chakra.color }]}>
                ✦  "{chakra.subtitle}"
              </Text>
            </View>

            {/* Location + element pills */}
            <View style={detail.pillRow}>
              <View style={detail.pill}>
                <Feather name="map-pin" size={11} color={colors.textDim} />
                <Text style={detail.pillText}>{chakra.location}</Text>
              </View>
              <View style={detail.pill}>
                <Feather name="wind" size={11} color={colors.textDim} />
                <Text style={detail.pillText}>{chakra.element}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* ── Mantra box ─────────────────────────────────────────────────── */}
          <View style={detail.body}>
            <View style={[detail.mantraBox, { borderColor: chakra.color + "50" }]}>
              <Text style={[detail.mantraLabel, { color: chakra.color }]}>Seed Mantra</Text>
              <Text style={[detail.mantraText, { color: chakra.color }]}>{chakra.mantra}</Text>
            </View>

            {/* ── Description ───────────────────────────────────────────── */}
            <Text style={detail.sectionHead}>About This Chakra</Text>
            <Text style={detail.bodyText}>{chakra.description}</Text>

            {/* ── Benefits ──────────────────────────────────────────────── */}
            <Text style={detail.sectionHead}>Benefits When Balanced</Text>
            <View style={detail.sectionCard}>
              {chakra.benefits.map((b) => (
                <BulletRow key={b} text={b} color={chakra.color} icon="check-circle" />
              ))}
            </View>

            {/* ── Imbalances ────────────────────────────────────────────── */}
            <Text style={detail.sectionHead}>Signs of Imbalance</Text>
            <View style={detail.sectionCard}>
              {chakra.imbalances.map((i) => (
                <BulletRow key={i} text={i} color="#e67e22" icon="alert-circle" />
              ))}
            </View>

            {/* ── Affirmation card ──────────────────────────────────────── */}
            <View style={[detail.affirmCard, { backgroundColor: chakra.color + "15", borderColor: chakra.color + "40" }]}>
              <Text style={[detail.affirmLabel, { color: chakra.color }]}>✦  Daily Affirmation</Text>
              <Text style={detail.affirmText}>"{chakra.affirmation}"</Text>
            </View>

            {/* ── Related Poses ─────────────────────────────────────────── */}
            <Text style={detail.sectionHead}>Related Yoga Poses</Text>
            <View style={detail.poseGrid}>
              {chakra.poses.map((p) => (
                <View key={p} style={[detail.poseChip, { borderColor: chakra.color + "40" }]}>
                  <Feather name="activity" size={11} color={chakra.color} />
                  <Text style={[detail.poseChipText, { color: chakra.color }]}>{p}</Text>
                </View>
              ))}
            </View>

            {/* ── Healing Foods ─────────────────────────────────────────── */}
            <Text style={detail.sectionHead}>Healing Foods</Text>
            <View style={detail.poseGrid}>
              {chakra.foods.map((f) => (
                <View key={f} style={[detail.foodChip, { borderColor: colors.border }]}>
                  <Text style={detail.foodChipText}>{f}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 48 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── List Screen ─────────────────────────────────────────────────────────────

function ChakraCard({ chakra, onPress }: { chakra: Chakra; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={[chakra.color + "35", chakra.color + "10", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardGrad}
      >
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: chakra.color }]} />

        {/* Text content */}
        <View style={styles.cardLeft}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.cardNum, { color: chakra.color + "90" }]}>
              {String(chakra.number).padStart(2, "0")}
            </Text>
            <View style={[styles.subtitlePill, { backgroundColor: chakra.color + "20" }]}>
              <Text style={[styles.subtitleText, { color: chakra.color }]}>{chakra.subtitle}</Text>
            </View>
          </View>
          <Text style={styles.cardName}>{chakra.name}</Text>
          <Text style={styles.cardSanskrit}>{chakra.sanskrit}</Text>
          <Text style={styles.cardSnippet} numberOfLines={2}>
            {chakra.description.slice(0, 72)}…
          </Text>
        </View>

        {/* Right: image */}
        <View style={[styles.imageWrap, { borderColor: chakra.color + "50" }]}>
          <Image
            source={{ uri: chakra.image }}
            style={styles.cardImage}
            resizeMode="cover"
          />
          <View style={[styles.imageOverlay, { backgroundColor: chakra.color + "20" }]} />
        </View>

        {/* Chevron */}
        <View style={styles.chevronWrap}>
          <Feather name="chevron-right" size={16} color={chakra.color + "80"} />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function ChakrasScreen() {
  const [selected, setSelected] = useState<Chakra | null>(null);
  const { markComplete } = useChecklist();

  const handleOpen = (c: Chakra) => {
    markComplete("chakra");
    setSelected(c);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Chakra System</Text>
          <Text style={styles.subtitle}>Your body's energy centers</Text>
        </View>

        {/* Spectrum bar */}
        <View style={styles.spectrumRow}>
          {chakras.map((c) => (
            <View key={c.id} style={[styles.spectrumDot, { backgroundColor: c.color }]} />
          ))}
        </View>

        {/* Card list */}
        <View style={styles.list}>
          {chakras.map((chakra) => (
            <ChakraCard key={chakra.id} chakra={chakra} onPress={() => handleOpen(chakra)} />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  spectrumRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: 6,
    marginBottom: spacing.md,
  },
  spectrumDot: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
    opacity: 0.8,
  },
  list: {
    paddingHorizontal: spacing.md,
    gap: 10,
  },
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
    padding: spacing.md,
    gap: 12,
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
  cardLeft: {
    flex: 1,
    paddingLeft: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  cardNum: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  subtitlePill: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  subtitleText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  cardName: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 2,
  },
  cardSanskrit: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_500Medium",
    color: colors.accent,
    marginBottom: 6,
  },
  cardSnippet: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 16,
  },
  imageWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
  },
  cardImage: { width: "100%", height: "100%" },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  chevronWrap: { paddingLeft: 4 },
});

const detail = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingTop: 56,
    paddingBottom: 32,
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
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  imageWrap: {
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: "hidden",
    marginBottom: 18,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 10,
  },
  heroImage: { width: "100%", height: "100%" },
  imageGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 65,
  },
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
    marginBottom: 16,
  },
  subtitlePillText: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  mantraBox: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  mantraLabel: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    marginBottom: 6,
  },
  mantraText: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: 8,
  },
  sectionHead: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
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
  poseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  poseChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  poseChipText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_500Medium",
  },
  foodChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  foodChipText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
});
