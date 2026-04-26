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
import { getItemImage, DEFAULT_FALLBACK_URL } from "@/lib/data";
import type { Remedy, WellnessPlan, Recipe, DailyTip } from "@/lib/data";

const useND = Platform.OS !== "web";

interface CardImageProps {
  item: { id?: string; imageUrl?: string; category?: string; goal?: string; title?: string; ingredients?: string[] };
  height?: number;
  withGradient?: boolean;
  gradientIntensity?: "soft" | "strong";
}

function CardImage({
  item,
  height = 160,
  withGradient = false,
  gradientIntensity = "soft",
}: CardImageProps) {
  const resolvedUrl = getItemImage(item);
  const [imgSrc, setImgSrc] = useState<string>(resolvedUrl);
  const [loaded, setLoaded] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const handleLoad = () => {
    setLoaded(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 380,
      useNativeDriver: useND,
    }).start();
  };

  const handleError = () => {
    setImgSrc(DEFAULT_FALLBACK_URL);
    if (!loaded) {
      setLoaded(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: useND,
      }).start();
    }
  };

  const gradientColors =
    gradientIntensity === "strong"
      ? (["transparent", "rgba(0,0,0,0.65)"] as const)
      : (["transparent", "rgba(0,0,0,0.42)"] as const);

  return (
    <View style={[styles.imageContainer, { height, backgroundColor: "#1E2A24" }]}>
      {/* Skeleton base — always behind image */}
      <View style={[StyleSheet.absoluteFillObject, styles.imageSkeleton]} />

      {/* Fading image */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>
        <Image
          source={{ uri: imgSrc }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          onLoad={handleLoad}
          onError={handleError}
        />
      </Animated.View>

      {/* Gradient overlay — always on top */}
      {withGradient && (
        <LinearGradient
          colors={gradientColors}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

function cardShadow() {
  if (Platform.OS === "web") {
    return { boxShadow: "0 2px 16px rgba(0,0,0,0.10)" } as object;
  }
  return {
    shadowColor: "#2A3E2A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  };
}

export function WellnessTipCard({ tip, quickWin }: { tip: DailyTip; quickWin: string }) {
  const colors = useColors();
  return (
    <View style={[styles.tipCard, { backgroundColor: colors.primary, borderRadius: 20 }, cardShadow()]}>
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
      style={[styles.remedyCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow()]}
    >
      {/* Image — always rendered, fixed height */}
      <View style={styles.imageWrapper}>
        <CardImage item={remedy} height={160} withGradient gradientIntensity="soft" />
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.primary + "F0" }]}>
            <Text style={[styles.badgeText, { fontFamily: "Inter_600SemiBold" }]}>{remedy.category}</Text>
          </View>
          {onSave && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }}
              style={styles.saveBtn}
            >
              <Feather name="bookmark" size={15} color={isSaved ? colors.primary : "#444"} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Text content */}
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {remedy.title}
        </Text>
        <Text numberOfLines={2} style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {remedy.description}
        </Text>
        {remedy.bestTime ? (
          <View style={[styles.timeRow, { backgroundColor: colors.muted }]}>
            <Feather name="clock" size={10} color={colors.primary} />
            <Text numberOfLines={1} style={[styles.timeText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
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
      style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow()]}
    >
      <View style={styles.imageWrapper}>
        <CardImage item={{ imageUrl: plan.imageUrl, category: plan.goal, title: plan.title }} height={160} withGradient gradientIntensity="strong" />
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.primary + "F0" }]}>
            <Text style={[styles.badgeText, { fontFamily: "Inter_600SemiBold" }]}>{plan.duration}</Text>
          </View>
          {onSave && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }}
              style={styles.saveBtn}
            >
              <Feather name="bookmark" size={15} color={isSaved ? colors.primary : "#444"} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={[styles.planTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {plan.title}
        </Text>
        <Text numberOfLines={2} style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {plan.subtitle}
        </Text>
        <TouchableOpacity
          onPress={onPress}
          style={[styles.viewBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.viewBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>View Plan</Text>
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
      style={[styles.recipeCard, { backgroundColor: colors.card, borderColor: colors.border }, cardShadow()]}
    >
      <View style={styles.imageWrapper}>
        <CardImage item={{ imageUrl: recipe.imageUrl, category: recipe.goal, title: recipe.title, ingredients: recipe.ingredients }} height={160} withGradient gradientIntensity="soft" />
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.accent + "F0" }]}>
            <Text style={[styles.badgeText, { fontFamily: "Inter_600SemiBold" }]}>{recipe.goal}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.recipeHeader}>
          <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", flex: 1 }]}>
            {recipe.title}
          </Text>
          <View style={styles.actionRow}>
            {onSave && (
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSave(); }} style={styles.actionBtn}>
                <Feather name="bookmark" size={17} color={isSaved ? colors.primary : colors.mutedForeground} />
              </TouchableOpacity>
            )}
            {onAddToGrocery && (
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAddToGrocery(); }} style={styles.actionBtn}>
                <Feather name="shopping-cart" size={17} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text numberOfLines={2} style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {recipe.description}
        </Text>

        {recipe.whyItHelps ? (
          <View style={[styles.whyBox, { backgroundColor: colors.muted }]}>
            <Text numberOfLines={2} style={[styles.whyText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>Why: </Text>
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
  imageContainer: {
    borderRadius: 16,
    overflow: "hidden",
  },
  imageSkeleton: {
    backgroundColor: "#263530",
  },
  imageWrapper: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  badgeRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    color: "#fff",
    letterSpacing: 0.3,
  },
  saveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.93)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 5,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 10,
  },
  timeText: {
    fontSize: 11,
    flex: 1,
  },
  metaRow: {
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
  tipLabel: { fontSize: 11, letterSpacing: 1 },
  tipTitle: { fontSize: 20, marginBottom: 8 },
  tipBody: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  quickWinBox: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 8 },
  quickWinText: { fontSize: 13, lineHeight: 19, flex: 1 },

  remedyCard: {
    width: 230,
    borderWidth: 1,
    borderRadius: 16,
    marginRight: 12,
    overflow: "hidden",
  },
  planCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  recipeCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
  },

  planTitle: { fontSize: 18, marginBottom: 6 },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  viewBtnText: { fontSize: 14 },

  recipeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 8,
    paddingTop: 2,
  },
  actionBtn: { padding: 4 },
  whyBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  whyText: { fontSize: 12, lineHeight: 18 },
});
