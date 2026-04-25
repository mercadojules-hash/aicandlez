import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { getImageUrl } from "@/lib/data";
import type { Remedy, WellnessPlan, Recipe, DailyTip } from "@/lib/data";

const useND = Platform.OS !== "web";

interface CardImageProps {
  imageUrl: string;
  category?: string;
  height?: number;
  borderRadius?: number;
  withGradient?: boolean;
  gradientIntensity?: "soft" | "strong";
}

function CardImage({
  imageUrl,
  category = "",
  height = 160,
  borderRadius = 0,
  withGradient = false,
  gradientIntensity = "soft",
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const resolvedUrl = getImageUrl(category, imageUrl);

  const handleLoad = () => {
    setLoaded(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: useND,
    }).start();
  };

  const gradientColors =
    gradientIntensity === "strong"
      ? (["transparent", "rgba(0,0,0,0.70)"] as const)
      : (["transparent", "rgba(0,0,0,0.45)"] as const);

  return (
    <View
      style={{
        height,
        borderRadius,
        overflow: "hidden",
        backgroundColor: "#D0DCCF",
      }}
    >
      {/* Skeleton shimmer base */}
      {!loaded && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "#D0DCCF" },
          ]}
        />
      )}

      {/* The actual image fades in */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { opacity: loaded ? 1 : fadeAnim }]}
      >
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          onLoad={handleLoad}
          onError={() => {
            setLoaded(true);
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: useND,
            }).start();
          }}
        />
      </Animated.View>

      {/* Gradient overlay */}
      {withGradient && (
        <LinearGradient
          colors={gradientColors}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      )}
    </View>
  );
}

function cardShadow() {
  if (Platform.OS === "web") {
    return { boxShadow: "0 2px 14px rgba(0,0,0,0.09)" };
  }
  return {
    shadowColor: "#2A3E2A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  };
}

export function WellnessTipCard({ tip, quickWin }: { tip: DailyTip; quickWin: string }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.tipCard,
        { backgroundColor: colors.primary, borderRadius: 20 },
        cardShadow(),
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
      <View style={[styles.quickWinBox, { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12 }]}>
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
      activeOpacity={0.88}
      style={[
        styles.remedyCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16 },
        cardShadow(),
      ]}
    >
      {/* Image block — always rendered, fixed height */}
      <View style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" }}>
        <CardImage
          imageUrl={remedy.imageUrl}
          category={remedy.category}
          height={140}
          withGradient
          gradientIntensity="soft"
        />
        {/* Overlaid badges */}
        <View style={styles.imageOverlay}>
          <View style={[styles.categoryBadge, { backgroundColor: colors.primary + "F0" }]}>
            <Text style={[styles.badgeText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              {remedy.category}
            </Text>
          </View>
          {onSave && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }}
              style={styles.saveBtn}
            >
              <Feather name="bookmark" size={15} color={isSaved ? colors.primary : "#555"} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {remedy.title}
        </Text>
        <Text numberOfLines={2} style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {remedy.description}
        </Text>
        {remedy.bestTime ? (
          <View style={[styles.bestTimeRow, { backgroundColor: colors.muted, borderRadius: 6 }]}>
            <Feather name="clock" size={10} color={colors.primary} />
            <Text numberOfLines={1} style={[styles.bestTimeText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {remedy.bestTime}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={11} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {remedy.prepTime}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="list" size={11} color={colors.mutedForeground} />
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
      activeOpacity={0.88}
      style={[
        styles.planCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16 },
        cardShadow(),
      ]}
    >
      {/* Hero image — tall, strong gradient */}
      <View style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" }}>
        <CardImage
          imageUrl={plan.imageUrl}
          category={plan.goal}
          height={185}
          withGradient
          gradientIntensity="strong"
        />
        <View style={styles.planImageOverlay}>
          <View style={[styles.durationBadge, { backgroundColor: colors.primary + "F0" }]}>
            <Text style={[styles.badgeText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              {plan.duration}
            </Text>
          </View>
          {onSave && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }}
              style={styles.saveBtn}
            >
              <Feather name="bookmark" size={15} color={isSaved ? colors.primary : "#555"} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <Text numberOfLines={2} style={[styles.planTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {plan.title}
        </Text>
        <Text numberOfLines={2} style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {plan.subtitle}
        </Text>
        <TouchableOpacity
          onPress={onPress}
          style={[styles.viewPlanBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
        >
          <Text style={[styles.viewPlanText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
            View Plan
          </Text>
          <Feather name="arrow-right" size={14} color="#fff" />
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
      activeOpacity={0.88}
      style={[
        styles.recipeCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16 },
        cardShadow(),
      ]}
    >
      {/* Image with gradient */}
      <View style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" }}>
        <CardImage
          imageUrl={recipe.imageUrl}
          category={recipe.goal}
          height={175}
          withGradient
          gradientIntensity="soft"
        />
        <View style={styles.imageOverlay}>
          <View style={[styles.goalBadge, { backgroundColor: colors.accent + "F0" }]}>
            <Text style={[styles.badgeText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              {recipe.goal}
            </Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.recipeHeader}>
          <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", flex: 1 }]}>
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

        <Text numberOfLines={2} style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {recipe.description}
        </Text>

        {recipe.whyItHelps ? (
          <View style={[styles.whyBox, { backgroundColor: colors.muted, borderRadius: 8 }]}>
            <Text numberOfLines={2} style={[styles.whyText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>Why it helps: </Text>
              {recipe.whyItHelps}
            </Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={11} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {recipe.prepTime}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="tag" size={11} color={colors.mutedForeground} />
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
  tipCard: { padding: 20, marginHorizontal: 16, marginBottom: 20 },
  tipTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  tipLabel: { fontSize: 11, letterSpacing: 1 },
  tipTitle: { fontSize: 20, marginBottom: 8 },
  tipBody: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  quickWinBox: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 8 },
  quickWinText: { fontSize: 13, lineHeight: 19, flex: 1 },

  remedyCard: {
    width: 230,
    borderWidth: 1,
    marginRight: 12,
    overflow: "hidden",
  },
  planCard: {
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  recipeCard: {
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },

  imageOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planImageOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  goalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  durationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, letterSpacing: 0.3 },
  saveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },

  cardContent: { padding: 14 },
  cardTitle: { fontSize: 14, lineHeight: 20, marginBottom: 5 },
  cardDesc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  bestTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
  },
  bestTimeText: { fontSize: 11, flex: 1 },

  planTitle: { fontSize: 18, marginBottom: 6 },
  viewPlanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  viewPlanText: { fontSize: 14 },

  recipeHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  recipeActions: { flexDirection: "row", gap: 6, marginLeft: 8, paddingTop: 2 },
  actionIcon: { padding: 4 },
  whyBox: { padding: 10, marginBottom: 10 },
  whyText: { fontSize: 12, lineHeight: 18 },

  metaRow: { flexDirection: "row", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11 },
});
