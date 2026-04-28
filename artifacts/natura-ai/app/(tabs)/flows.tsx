import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { yogaFlows } from "../../data/flows";

const levelColors: Record<string, string> = {
  Beginner: colors.primary,
  "All Levels": colors.accent,
  Gentle: "#7c6ead",
};

export default function FlowsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Yoga Flows</Text>
          <Text style={styles.subtitle}>Choose a practice that fits how you feel</Text>
        </View>

        {/* Flow cards */}
        <View style={styles.list}>
          {yogaFlows.map((flow) => (
            <TouchableOpacity
              key={flow.id}
              style={styles.card}
              onPress={() => router.push(`/flow/${flow.id}` as any)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[flow.color + "22", flow.color + "08"]}
                style={styles.cardGrad}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconCircle, { backgroundColor: flow.color + "30" }]}>
                    <Feather name={flow.icon as any} size={26} color={flow.color} />
                  </View>
                  <View style={styles.cardMeta}>
                    <View style={[styles.levelPill, { backgroundColor: (levelColors[flow.level] ?? colors.primary) + "25" }]}>
                      <Text style={[styles.levelText, { color: levelColors[flow.level] ?? colors.primary }]}>
                        {flow.level}
                      </Text>
                    </View>
                    <Text style={styles.duration}>
                      <Feather name="clock" size={12} color={colors.textDim} /> {flow.duration}
                    </Text>
                  </View>
                </View>

                <Text style={styles.flowTitle}>{flow.title}</Text>
                <Text style={styles.flowSubtitle}>{flow.subtitle}</Text>
                <Text style={styles.flowDesc} numberOfLines={2}>{flow.description}</Text>

                <View style={styles.benefitsRow}>
                  {flow.benefits.slice(0, 3).map((b) => (
                    <View key={b} style={styles.benefitChip}>
                      <Text style={styles.benefitText}>{b}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.poseCount}>{flow.poses.length} poses</Text>
                  <View style={styles.startBtn}>
                    <Text style={[styles.startBtnText, { color: flow.color }]}>Start Flow</Text>
                    <Feather name="arrow-right" size={14} color={flow.color} />
                  </View>
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
    paddingBottom: spacing.lg,
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
  list: {
    paddingHorizontal: spacing.md,
    gap: 14,
  },
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardGrad: {
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMeta: {
    alignItems: "flex-end",
    gap: 6,
  },
  levelPill: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  levelText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
  },
  duration: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
  flowTitle: {
    fontSize: fontSizes.xl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 4,
  },
  flowSubtitle: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
    marginBottom: 8,
  },
  flowDesc: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    lineHeight: 20,
    marginBottom: spacing.sm,
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
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  poseCount: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  startBtnText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_600SemiBold",
  },
});
