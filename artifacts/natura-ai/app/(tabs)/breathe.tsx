import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { breathPatterns } from "../../data/breathwork";

export default function BreatheScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Breathwork</Text>
          <Text style={styles.subtitle}>Regulate your nervous system with breath</Text>
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Feather name="info" size={16} color={colors.accent} style={{ marginRight: 10 }} />
          <Text style={styles.infoText}>
            Even 2–3 minutes of conscious breathing lowers cortisol and activates your rest response.
          </Text>
        </View>

        <View style={styles.list}>
          {breathPatterns.map((bp) => (
            <TouchableOpacity
              key={bp.id}
              style={styles.card}
              onPress={() => router.push(`/breathwork/${bp.id}` as any)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[bp.color + "22", bp.color + "08"]}
                style={styles.cardGrad}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconCircle, { backgroundColor: bp.color + "28" }]}>
                    <Feather name={bp.icon as any} size={26} color={bp.color} />
                  </View>
                  <View style={styles.cycleBadge}>
                    <Text style={[styles.cycleText, { color: bp.color }]}>
                      {bp.totalCycles} cycles
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardTitle}>{bp.title}</Text>
                <Text style={styles.cardSubtitle}>{bp.subtitle}</Text>
                <Text style={styles.cardDesc} numberOfLines={2}>{bp.description}</Text>

                {/* Pattern preview */}
                <View style={styles.phaseRow}>
                  {bp.phases.map((p, i) => (
                    <View key={i} style={styles.phaseChip}>
                      <Text style={[styles.phaseLabel, { color: bp.color }]}>{p.label}</Text>
                      <Text style={styles.phaseDur}>{p.duration}s</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.benefitsRow}>
                  {bp.benefits.slice(0, 3).map((b) => (
                    <View key={b} style={styles.benefitChip}>
                      <Text style={styles.benefitText}>{b}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.startBtn, { backgroundColor: bp.color + "22" }]}>
                  <Text style={[styles.startText, { color: bp.color }]}>Begin Session</Text>
                  <Feather name="play" size={14} color={bp.color} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
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
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.accent + "15",
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent + "30",
  },
  infoText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 20,
  },
  list: { paddingHorizontal: spacing.md, gap: 14 },
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardGrad: { padding: spacing.md },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cycleBadge: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cycleText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
  },
  cardTitle: {
    fontSize: fontSizes.xl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  phaseRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.sm,
  },
  phaseChip: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  phaseLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  phaseDur: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
  benefitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: spacing.md,
  },
  benefitChip: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  benefitText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  startText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
  },
});
