import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Remedy, WellnessPlan, Recipe, DailyTip } from "@/lib/data";

function CardImage({ imageUrl, height = 150 }: { imageUrl: string; height?: number }) {
  return (
    <Image
      source={{ uri: imageUrl }}
      style={[styles.cardImage, { height }]}
      contentFit="cover"
      transition={300}
      placeholder={{ color: "#DDE5DD" }}
    />
  );
}

function cardShadow(isDark: boolean) {
  if (Platform.OS === "web") {
    return isDark
      ? { boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }
      : { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" };
  }
  return isDark
    ? { elevation: 3 }
    : {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
      };
}

export function WellnessTipCard({ tip, quickWin }: { tip: DailyTip; quickWin: string }) {
  const colors = useColors();
  return (
    <View style={[styles.tipCard, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
      <View style={styles.tipTop}>
        <Text style={[styles.tipLabel, { color: colors.primaryForeground + "CC", fontFamily: "Inter_500Medium" }]}>
          TODAY'S TIP
        </Text>
        <Feather name="sun" size={18} color={colors.primaryForeground + "CC"} />
      </View>
      <Text style={[styles.tipTitle, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
        {tip.title}
      </Text>
      <Text style={[styles.tipBody, { color: colors.primaryForeground + "DD", fontFamily: "Inter_400Regular" }]}>
        {tip.body}
      </Text>
      <View style={[styles.quickWinBox, { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: colors.radius - 6 }]}>
        <Feather name="zap" size={14} color={colors.primaryForeground} />
        <Text style={[styles.quickWinText, { color: colors.primaryForeground, fontFamily: "Inter_500Medium" }]}>
          Quick Win: {quickWin}
        </Text>
      </View>
    </View>
  );
}

interface RemedyCardProps {
  remedy: Remedy;
  onPress: () => void;
  isSaved?: boolean;
  onSave?: () => void;
}

export function RemedyCard({ remedy, onPress, isSaved, onSave }: RemedyCardProps) {
  const colors = useColors();
  const shadow = cardShadow(false);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.remedyCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        shadow,
      ]}
    >
      <View style={styles.remedyImageContainer}>
        <CardImage imageUrl={remedy.imageUrl} height={130} />
        <View style={[styles.categoryBadge, { backgroundColor: colors.primary + "EE", borderRadius: 20 }]}>
          <Text style={[styles.categoryText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
            {remedy.category}
          </Text>
        </View>
        {onSave && (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }}
            style={[styles.saveButton, { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 20 }]}
          >
            <Feather name="bookmark" size={15} color={isSaved ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.remedyContent}>
        <Text numberOfLines={2} style={[styles.remedyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {remedy.title}
        </Text>
        <Text numberOfLines={2} style={[styles.remedyDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {remedy.description}
        </Text>
        {remedy.bestTime && (
          <View style={[styles.bestTimeRow, { backgroundColor: colors.muted, borderRadius: 6 }]}>
            <Feather name="clock" size={11} color={colors.primary} />
            <Text numberOfLines={1} style={[styles.bestTimeText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {remedy.bestTime}
            </Text>
          </View>
        )}
        <View style={styles.remedyMeta}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {remedy.prepTime}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="list" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {remedy.steps.length} steps
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface PlanCardProps {
  plan: WellnessPlan;
  onPress: () => void;
  isSaved?: boolean;
  onSave?: () => void;
}

export function PlanCard({ plan, onPress, isSaved, onSave }: PlanCardProps) {
  const colors = useColors();
  const shadow = cardShadow(false);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.planCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        shadow,
      ]}
    >
      <View style={{ position: "relative" }}>
        <CardImage imageUrl={plan.imageUrl} height={180} />
        <View style={[styles.planGradient, { borderTopLeftRadius: colors.radius, borderTopRightRadius: colors.radius }]} />
        <View style={styles.planOverlay}>
          <View style={[styles.durationBadge, { backgroundColor: colors.primary + "EE", borderRadius: 20 }]}>
            <Text style={[styles.durationText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              {plan.duration}
            </Text>
          </View>
          {onSave && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }}
              style={[styles.saveButton, { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 20 }]}
            >
              <Feather name="bookmark" size={15} color={isSaved ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.planContent}>
        <Text numberOfLines={2} style={[styles.planTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {plan.title}
        </Text>
        <Text numberOfLines={2} style={[styles.planSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {plan.subtitle}
        </Text>
        <TouchableOpacity
          onPress={onPress}
          style={[styles.startButton, { backgroundColor: colors.primary, borderRadius: colors.radius - 6 }]}
        >
          <Text style={[styles.startButtonText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            View Plan
          </Text>
          <Feather name="arrow-right" size={14} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
  onAddToGrocery?: () => void;
  isSaved?: boolean;
  onSave?: () => void;
}

export function RecipeCard({ recipe, onPress, onAddToGrocery, isSaved, onSave }: RecipeCardProps) {
  const colors = useColors();
  const shadow = cardShadow(false);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.recipeCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        shadow,
      ]}
    >
      <View style={{ position: "relative" }}>
        <CardImage imageUrl={recipe.imageUrl} height={170} />
        <View style={[styles.recipeGoalBadge, { backgroundColor: colors.accent + "EE", borderRadius: 20 }]}>
          <Text style={[styles.categoryText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
            {recipe.goal}
          </Text>
        </View>
      </View>
      <View style={styles.recipeContent}>
        <View style={styles.recipeHeader}>
          <Text numberOfLines={2} style={[styles.remedyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", flex: 1 }]}>
            {recipe.title}
          </Text>
          <View style={styles.recipeActions}>
            {onSave && (
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }} style={styles.actionIcon}>
                <Feather name="bookmark" size={17} color={isSaved ? colors.primary : colors.mutedForeground} />
              </TouchableOpacity>
            )}
            {onAddToGrocery && (
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAddToGrocery(); }} style={styles.actionIcon}>
                <Feather name="shopping-cart" size={17} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text numberOfLines={2} style={[styles.remedyDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {recipe.description}
        </Text>
        {recipe.whyItHelps && (
          <View style={[styles.whyBox, { backgroundColor: colors.muted, borderRadius: 8 }]}>
            <Text numberOfLines={2} style={[styles.whyText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>Why it helps: </Text>
              {recipe.whyItHelps}
            </Text>
          </View>
        )}
        <View style={styles.remedyMeta}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {recipe.prepTime}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="tag" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {recipe.category}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardImage: { width: "100%", borderRadius: 0 },
  tipCard: { padding: 20, marginHorizontal: 16, marginBottom: 20 },
  tipTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  tipLabel: { fontSize: 11, letterSpacing: 1 },
  tipTitle: { fontSize: 20, marginBottom: 8 },
  tipBody: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  quickWinBox: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 8 },
  quickWinText: { fontSize: 13, lineHeight: 19, flex: 1 },

  remedyCard: { width: 230, borderWidth: 1, marginRight: 12, overflow: "hidden" },
  remedyImageContainer: { position: "relative" },
  categoryBadge: { position: "absolute", top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 4 },
  categoryText: { fontSize: 11, letterSpacing: 0.3 },
  saveButton: { position: "absolute", top: 10, right: 10, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  remedyContent: { padding: 14 },
  remedyTitle: { fontSize: 14, marginBottom: 5, lineHeight: 20 },
  remedyDesc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  bestTimeRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 10 },
  bestTimeText: { fontSize: 11, flex: 1 },
  remedyMeta: { flexDirection: "row", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11 },

  planCard: { borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  planGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },
  planOverlay: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" },
  durationBadge: { paddingHorizontal: 10, paddingVertical: 4 },
  durationText: { fontSize: 11, letterSpacing: 0.3 },
  planContent: { padding: 16 },
  planTitle: { fontSize: 18, marginBottom: 6 },
  planSubtitle: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  startButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, gap: 6 },
  startButtonText: { fontSize: 14 },

  recipeCard: { borderWidth: 1, marginBottom: 16, overflow: "hidden" },
  recipeGoalBadge: { position: "absolute", top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 4 },
  recipeContent: { padding: 16 },
  recipeHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  recipeActions: { flexDirection: "row", gap: 6, marginLeft: 8, paddingTop: 2 },
  actionIcon: { padding: 4 },
  whyBox: { padding: 10, marginBottom: 10 },
  whyText: { fontSize: 12, lineHeight: 18 },
});
