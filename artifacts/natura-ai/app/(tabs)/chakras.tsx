import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { chakras, Chakra } from "../../data/chakras";
import { useChecklist } from "../../hooks/useChecklist";

const { width } = Dimensions.get("window");

function ChakraDetail({ chakra, onClose }: { chakra: Chakra; onClose: () => void }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[detail.container, { backgroundColor: colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Top */}
          <LinearGradient
            colors={[chakra.color + "40", chakra.color + "10", colors.background]}
            style={detail.heroGrad}
          >
            <TouchableOpacity style={detail.closeBtn} onPress={onClose}>
              <Feather name="x" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={[detail.circle, { backgroundColor: chakra.color }]}>
              <Text style={detail.circleNum}>{chakra.number}</Text>
            </View>
            <Text style={detail.heroName}>{chakra.name}</Text>
            <Text style={detail.heroSanskrit}>{chakra.sanskrit}</Text>
            <View style={detail.heroRow}>
              <View style={detail.heroPill}>
                <Text style={detail.heroPillText}>📍 {chakra.location}</Text>
              </View>
              <View style={detail.heroPill}>
                <Text style={detail.heroPillText}>🌊 {chakra.element}</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={detail.body}>
            {/* Mantra */}
            <View style={[detail.mantraBox, { borderColor: chakra.color + "50" }]}>
              <Text style={[detail.mantraLabel, { color: chakra.color }]}>Seed Mantra</Text>
              <Text style={[detail.mantraText, { color: chakra.color }]}>{chakra.mantra}</Text>
            </View>

            {/* Meaning */}
            <Text style={detail.sectionHead}>About This Chakra</Text>
            <Text style={detail.body_text}>{chakra.meaning}</Text>

            {/* Emotional */}
            <Text style={detail.sectionHead}>Emotional Association</Text>
            <Text style={detail.body_text}>{chakra.emotionalAssociation}</Text>

            {/* Affirmation */}
            <View style={[detail.affirmBox, { backgroundColor: chakra.color + "18" }]}>
              <Text style={[detail.affirmLabel, { color: chakra.color }]}>✦ Affirmation</Text>
              <Text style={detail.affirmText}>"{chakra.affirmation}"</Text>
            </View>

            {/* Blocking signs */}
            <Text style={detail.sectionHead}>Signs of Imbalance</Text>
            {chakra.blockingSigns.map((s) => (
              <View key={s} style={detail.listRow}>
                <View style={[detail.dot, { backgroundColor: chakra.color }]} />
                <Text style={detail.listText}>{s}</Text>
              </View>
            ))}

            {/* Foods */}
            <Text style={detail.sectionHead}>Healing Foods</Text>
            <View style={detail.chipGrid}>
              {chakra.foods.map((f) => (
                <View key={f} style={[detail.chip, { borderColor: chakra.color + "40" }]}>
                  <Text style={[detail.chipText, { color: chakra.color }]}>{f}</Text>
                </View>
              ))}
            </View>

            {/* Poses */}
            <Text style={detail.sectionHead}>Balancing Yoga Poses</Text>
            {chakra.poses.map((p) => (
              <View key={p} style={detail.listRow}>
                <Feather name="check-circle" size={14} color={chakra.color} style={{ marginTop: 2 }} />
                <Text style={detail.listText}>{p}</Text>
              </View>
            ))}

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
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
        <View style={styles.header}>
          <Text style={styles.title}>The 7 Chakras</Text>
          <Text style={styles.subtitle}>Your body's energy centres</Text>
        </View>

        {/* Spine indicator */}
        <View style={styles.spineRow}>
          {chakras.map((c) => (
            <View key={c.id} style={[styles.spineDot, { backgroundColor: c.color }]} />
          ))}
        </View>

        <View style={styles.list}>
          {chakras.map((chakra) => (
            <TouchableOpacity
              key={chakra.id}
              style={styles.card}
              onPress={() => handleOpen(chakra)}
              activeOpacity={0.85}
            >
              <View style={[styles.colorBar, { backgroundColor: chakra.color }]} />
              <View style={styles.cardContent}>
                <View style={[styles.numCircle, { backgroundColor: chakra.color + "25" }]}>
                  <Text style={[styles.numText, { color: chakra.color }]}>{chakra.number}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.chakraName}>{chakra.name}</Text>
                  <Text style={styles.chakraSanskrit}>{chakra.sanskrit}</Text>
                  <Text style={styles.chakraLoc}>
                    <Feather name="map-pin" size={11} color={colors.textDim} /> {chakra.location}
                  </Text>
                  <Text style={styles.chakraSnippet} numberOfLines={2}>
                    {chakra.emotionalAssociation}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textDim} />
              </View>
            </TouchableOpacity>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  spineRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  spineDot: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
    opacity: 0.7,
  },
  list: { paddingHorizontal: spacing.md, gap: 10 },
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorBar: { width: 5 },
  cardContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: 12,
  },
  numCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: {
    fontSize: fontSizes.lg,
    fontFamily: "Inter_700Bold",
  },
  cardText: { flex: 1 },
  chakraName: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginBottom: 2,
  },
  chakraSanskrit: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_500Medium",
    color: colors.accent,
    marginBottom: 3,
  },
  chakraLoc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    marginBottom: 4,
  },
  chakraSnippet: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 16,
  },
});

const detail = StyleSheet.create({
  container: { flex: 1 },
  heroGrad: { paddingTop: 60, paddingBottom: 32, alignItems: "center", paddingHorizontal: spacing.md },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  circle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  circleNum: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  heroName: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 4,
  },
  heroSanskrit: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
    marginBottom: 12,
  },
  heroRow: { flexDirection: "row", gap: 8 },
  heroPill: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroPillText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  mantraBox: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  mantraLabel: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  mantraText: {
    fontSize: fontSizes.xxxl,
    fontFamily: "Inter_700Bold",
    letterSpacing: 6,
  },
  sectionHead: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  body_text: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
  },
  affirmBox: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: "center",
  },
  affirmLabel: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 8,
  },
  affirmText: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_400Regular",
    color: colors.text,
    textAlign: "center",
    lineHeight: 24,
    fontStyle: "italic",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  listText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 20,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_500Medium",
  },
});
