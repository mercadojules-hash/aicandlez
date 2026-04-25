import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Remedy, WellnessPlan, Recipe, DailyTip } from "@/lib/data";

const IMAGE_MAP = {
  herbs: require("@/assets/images/herbs-hero.png"),
  tea: require("@/assets/images/tea-recipe.png"),
  bowl: require("@/assets/images/recipe-bowl.png"),
};

function SafeImage({ imageKey }: { imageKey: "herbs" | "tea" | "bowl" }) {
  try {
    return (
      <Image
        source={IMAGE_MAP[imageKey]}
        style={styles.cardImage}
        contentFit="cover"
      />
    );
  } catch {
    return <View style={[styles.cardImage, { backgroundColor: "#E6EEE6" }]} />;
  }
}

export function WellnessTipCard({ tip, quickWin }: { tip: DailyTip; quickWin: string }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.tipCard,
        { backgroundColor: colors.primary, borderRadius: colors.radius },
      ]}
    >
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
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.remedyCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={styles.remedyImageContainer}>
        <SafeImage imageKey={remedy.imageKey} />
        <View style={[styles.categoryBadge, { backgroundColor: colors.primary + "EE", borderRadius: 20 }]}>
          <Text style={[styles.categoryText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
            {remedy.category}
          </Text>
        </View>
        {onSave && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSave();
            }}
            style={[styles.saveButton, { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20 }]}
          >
            <Feather
              name={isSaved ? "bookmark" : "bookmark"}
              size={16}
              color={isSaved ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.remedyContent}>
        <Text style={[styles.remedyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {remedy.title}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.remedyDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
        >
          {remedy.description}
        </Text>
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
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.planCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <SafeImage imageKey={plan.imageKey} />
      <View style={styles.planOverlay}>
        <View style={[styles.durationBadge, { backgroundColor: colors.primary + "EE", borderRadius: 20 }]}>
          <Text style={[styles.durationText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
            {plan.duration}
          </Text>
        </View>
        {onSave && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSave();
            }}
            style={[styles.saveButton, { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20 }]}
          >
            <Feather
              name="bookmark"
              size={16}
              color={isSaved ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.planContent}>
        <Text style={[styles.planTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {plan.title}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.planSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
        >
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
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.recipeCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={styles.recipeImageBox}>
        <SafeImage imageKey={recipe.imageKey} />
        <View style={[styles.recipeGoalBadge, { backgroundColor: colors.accent + "EE", borderRadius: 20 }]}>
          <Text style={[styles.categoryText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
            {recipe.goal}
          </Text>
        </View>
      </View>
      <View style={styles.recipeContent}>
        <View style={styles.recipeHeader}>
          <Text style={[styles.remedyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", flex: 1 }]}>
            {recipe.title}
          </Text>
          <View style={styles.recipeActions}>
            {onSave && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSave();
                }}
                style={styles.actionIcon}
              >
                <Feather name="bookmark" size={16} color={isSaved ? colors.primary : colors.mutedForeground} />
              </TouchableOpacity>
            )}
            {onAddToGrocery && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onAddToGrocery();
                }}
                style={styles.actionIcon}
              >
                <Feather name="shopping-cart" size={16} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text
          numberOfLines={2}
          style={[styles.remedyDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
        >
          {recipe.description}
        </Text>
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
  tipCard: {
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  tipTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tipLabel: {
    fontSize: 11,
    letterSpacing: 1,
  },
  tipTitle: {
    fontSize: 20,
    marginBottom: 8,
  },
  tipBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  quickWinBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    gap: 8,
  },
  quickWinText: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  remedyCard: {
    width: 220,
    borderWidth: 1,
    marginRight: 12,
    overflow: "hidden",
  },
  remedyImageContainer: {
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: 130,
  },
  categoryBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  saveButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  remedyContent: {
    padding: 12,
  },
  remedyTitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  remedyDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  remedyMeta: {
    flexDirection: "row",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
  },
  planCard: {
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  planOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  durationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  durationText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  planContent: {
    padding: 16,
  },
  planTitle: {
    fontSize: 18,
    marginBottom: 6,
  },
  planSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 6,
  },
  startButtonText: {
    fontSize: 14,
  },
  recipeCard: {
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  recipeImageBox: {
    position: "relative",
  },
  recipeGoalBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recipeContent: {
    padding: 14,
  },
  recipeHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  recipeActions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 8,
  },
  actionIcon: {
    padding: 4,
  },
});
