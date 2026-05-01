import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { useWellness } from "../../contexts/WellnessContext";
import { PLANS, REMEDIES } from "../../data/wellness";
import { fontSizes, radii, spacing } from "../../constants/theme";

type Tab = "Plans" | "Remedies" | "Saved";

const PLAN_IMAGES: Record<string, any> = {
  "plan-stress-3day": require("../../assets/images/natura-plan-week-1.webp"),
  "plan-sleep-7day":  require("../../assets/images/natura-plan-week-2.webp"),
  "plan-energy-5day": require("../../assets/images/natura-plan-week-3.webp"),
};

const GOAL_COLORS: Record<string, string> = {
  stress:    "#F5A623",
  sleep:     "#8B7FD4",
  energy:    "#9FE870",
  immunity:  "#4CAF7D",
  digestion: "#45B7AA",
};

export default function PlansScreen() {
  const { colors } = useTheme();
  const { isPremium, openPaywall } = useSubscription();
  const { saveItem, removeItem, isSaved, savedItems } = useWellness();
  const [activeTab, setActiveTab] = useState<Tab>("Plans");

  const savedPlans   = savedItems.filter((s) => s.type === "plan");
  const savedRemedies = savedItems.filter((s) => s.type === "remedy");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Wellness Plans</Text>
        <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(["Plans", "Remedies", "Saved"] as Tab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && { backgroundColor: colors.primary + "22" }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textMuted }]}>
                {tab}{tab === "Saved" && savedItems.length > 0 ? ` (${savedItems.length})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>

        {/* ── PLANS ── */}
        {activeTab === "Plans" && (
          <>
            {!isPremium ? (
              <View style={[styles.paywall, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.paywallIcon, { backgroundColor: colors.primary + "22" }]}>
                  <Feather name="award" size={30} color={colors.primary} />
                </View>
                <Text style={[styles.paywallTitle, { color: colors.text }]}>Premium Plans Only</Text>
                <Text style={[styles.paywallSub, { color: colors.textDim }]}>
                  Unlock guided wellness programs tailored to your goals — stress relief, sleep resets, energy boosts, and more.
                </Text>
                <TouchableOpacity
                  style={[styles.paywallBtn, { backgroundColor: colors.primary }]}
                  onPress={openPaywall}
                  activeOpacity={0.85}
                >
                  <Text style={styles.paywallBtnText}>Unlock Plans</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Curated wellness programs for your goals</Text>
                {PLANS.map((plan) => {
                  const saved = isSaved(plan.id);
                  const goalColor = GOAL_COLORS[plan.goal] ?? colors.primary;
                  const img = PLAN_IMAGES[plan.id];
                  return (
                    <View key={plan.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {img && <Image source={img} style={styles.cardImg} />}
                      <View style={styles.cardBody}>
                        <View style={styles.cardRow1}>
                          <View style={[styles.goalBadge, { backgroundColor: goalColor + "22" }]}>
                            <Text style={[styles.goalBadgeText, { color: goalColor }]}>{plan.goal}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => saved ? removeItem(plan.id) : saveItem({ id: plan.id, type: "plan", title: plan.title, savedAt: new Date().toISOString() })}
                          >
                            <Feather name="bookmark" size={18} color={saved ? colors.primary : colors.textDim} />
                          </TouchableOpacity>
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{plan.title}</Text>
                        <Text style={[styles.cardSub, { color: colors.textDim }]}>{plan.subtitle}</Text>
                        <View style={styles.cardMeta}>
                          <Feather name="calendar" size={12} color={colors.textMuted} />
                          <Text style={[styles.cardMetaText, { color: colors.textMuted }]}>{plan.duration}</Text>
                          <Feather name="clock" size={12} color={colors.textMuted} />
                          <Text style={[styles.cardMetaText, { color: colors.textMuted }]}>{plan.days.length} day{plan.days.length > 1 ? "s" : ""} included</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ── REMEDIES ── */}
        {activeTab === "Remedies" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Natural remedy guides with step-by-step instructions</Text>
            {REMEDIES.map((remedy) => {
              const saved = isSaved(remedy.id);
              return (
                <View key={remedy.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.cardImgFallback, { backgroundColor: colors.primary + "22" }]}>
                    <Feather name="droplet" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardRow1}>
                      <View style={[styles.goalBadge, { backgroundColor: colors.primary + "22" }]}>
                        <Text style={[styles.goalBadgeText, { color: colors.primary }]}>{remedy.category}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => saved ? removeItem(remedy.id) : saveItem({ id: remedy.id, type: "remedy", title: remedy.title, savedAt: new Date().toISOString() })}
                      >
                        <Feather name="bookmark" size={18} color={saved ? colors.primary : colors.textDim} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{remedy.title}</Text>
                    <Text style={[styles.cardSub, { color: colors.textDim }]}>{remedy.description}</Text>
                    <View style={styles.cardMeta}>
                      <Feather name="clock" size={12} color={colors.textMuted} />
                      <Text style={[styles.cardMetaText, { color: colors.textMuted }]}>{remedy.prepTime}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── SAVED ── */}
        {activeTab === "Saved" && (
          <>
            {savedItems.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="bookmark" size={40} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing saved yet</Text>
                <Text style={[styles.emptySub, { color: colors.textDim }]}>Bookmark remedies and plans to find them here quickly.</Text>
              </View>
            ) : (
              <>
                {savedPlans.length > 0 && (
                  <>
                    <Text style={[styles.savedGroupLabel, { color: colors.textMuted }]}>Plans</Text>
                    {savedPlans.map((s) => {
                      const plan = PLANS.find((p) => p.id === s.id);
                      if (!plan) return null;
                      const goalColor = GOAL_COLORS[plan.goal] ?? colors.primary;
                      return (
                        <View key={plan.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={styles.cardBody}>
                            <View style={[styles.goalBadge, { backgroundColor: goalColor + "22" }]}>
                              <Text style={[styles.goalBadgeText, { color: goalColor }]}>{plan.goal}</Text>
                            </View>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{plan.title}</Text>
                            <Text style={[styles.cardSub, { color: colors.textDim }]}>{plan.subtitle}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
                {savedRemedies.length > 0 && (
                  <>
                    <Text style={[styles.savedGroupLabel, { color: colors.textMuted }]}>Remedies</Text>
                    {savedRemedies.map((s) => {
                      const remedy = REMEDIES.find((r) => r.id === s.id);
                      if (!remedy) return null;
                      return (
                        <View key={remedy.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={styles.cardBody}>
                            <View style={[styles.goalBadge, { backgroundColor: colors.primary + "22" }]}>
                              <Text style={[styles.goalBadgeText, { color: colors.primary }]}>{remedy.category}</Text>
                            </View>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{remedy.title}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  scroll:          { flex: 1 },
  header:          { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  pageTitle:       { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold", marginBottom: spacing.sm },
  tabs:            { flexDirection: "row", borderRadius: radii.md, borderWidth: 1, overflow: "hidden" },
  tab:             { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
  tabText:         { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  sectionLabel:    { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginBottom: spacing.md, textTransform: "uppercase", letterSpacing: 1 },
  paywall:         { alignItems: "center", padding: spacing.xl, borderRadius: radii.lg, borderWidth: 1 },
  paywallIcon:     { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  paywallTitle:    { fontSize: fontSizes.xl, fontFamily: "Inter_700Bold", marginBottom: spacing.sm, textAlign: "center" },
  paywallSub:      { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: spacing.lg, lineHeight: 20 },
  paywallBtn:      { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radii.full },
  paywallBtnText:  { color: "#0D1F16", fontSize: fontSizes.md, fontFamily: "Inter_700Bold" },
  card:            { borderRadius: radii.lg, borderWidth: 1, overflow: "hidden", marginBottom: spacing.md },
  cardImg:         { width: "100%", height: 140, resizeMode: "cover" },
  cardImgFallback: { height: 80, alignItems: "center", justifyContent: "center" },
  cardBody:        { padding: spacing.md },
  cardRow1:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  goalBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  goalBadgeText:   { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  cardTitle:       { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  cardSub:         { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", marginBottom: spacing.sm, lineHeight: 18 },
  cardMeta:        { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText:    { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginRight: 8 },
  empty:           { alignItems: "center", paddingVertical: spacing.xxl },
  emptyTitle:      { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginTop: spacing.md, marginBottom: 4 },
  emptySub:        { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", textAlign: "center" },
  savedGroupLabel: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 1, marginBottom: spacing.sm },
});
