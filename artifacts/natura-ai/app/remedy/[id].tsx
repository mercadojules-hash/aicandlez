import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWellness } from "@/contexts/WellnessContext";
import { REMEDIES, RECIPES } from "@/lib/data";


export default function RemedyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { saveItem, removeItem, isSaved, addToGrocery } = useWellness();
  const [guideMode, setGuideMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const item = REMEDIES.find((r) => r.id === id) ?? RECIPES.find((r) => r.id === id);

  if (!item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[{ color: colors.foreground, fontFamily: "Inter_400Regular" }]}>Not found</Text>
      </View>
    );
  }

  const saved = isSaved(item.id);
  const ingredients = item.ingredients;
  const steps = item.steps;
  const groceryList = "groceryList" in item ? item.groceryList : item.ingredients;

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (saved) {
      removeItem(item.id);
    } else {
      saveItem({ id: item.id, type: "remedy", title: item.title, savedAt: new Date().toISOString() });
    }
  };

  if (guideMode) {
    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom }]}>
        <View style={[styles.guideHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => { setGuideMode(false); setCurrentStep(0); }}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.guideHeaderTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Step {currentStep + 1} of {steps.length}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={[styles.progressBar, { backgroundColor: colors.border, marginHorizontal: 24, marginTop: 16 }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${((currentStep + 1) / steps.length) * 100}%` }]} />
        </View>

        <View style={styles.guideContent}>
          <View style={[styles.stepNumberCircle, { backgroundColor: colors.primary }]}>
            <Text style={[styles.stepNumberText, { color: "#fff", fontFamily: "Inter_700Bold" }]}>
              {step.stepNumber}
            </Text>
          </View>
          <Text style={[styles.guideInstruction, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            {step.instruction}
          </Text>
          {step.duration && (
            <View style={[styles.durationBadge, { backgroundColor: colors.secondary, borderRadius: colors.radius - 4 }]}>
              <Feather name="clock" size={16} color={colors.primary} />
              <Text style={[styles.durationText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {step.duration}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.guideFooter, { borderTopColor: colors.border }]}>
          {currentStep > 0 && (
            <TouchableOpacity
              onPress={() => setCurrentStep((p) => p - 1)}
              style={[styles.guideBack, { borderColor: colors.border, borderRadius: colors.radius - 4 }]}
            >
              <Feather name="arrow-left" size={18} color={colors.foreground} />
              <Text style={[{ color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              if (isLast) { setGuideMode(false); setCurrentStep(0); }
              else setCurrentStep((p) => p + 1);
            }}
            style={[styles.guideNext, { backgroundColor: colors.primary, borderRadius: colors.radius - 4, flex: currentStep === 0 ? 1 : undefined }]}
          >
            <Text style={[styles.guideNextText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              {isLast ? "Done" : "Next Step"}
            </Text>
            <Feather name={isLast ? "check" : "arrow-right"} size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.imageContainer}>
        {Platform.OS === "web" ? (
          // @ts-ignore
          <img
            src={item.image}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Image
            source={{ uri: item.image }}
            style={styles.heroImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 22 }]}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
        >
          <Feather name="arrow-left" size={20} color="#1C2B1C" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 22 }]}
        >
          <Feather name="bookmark" size={20} color={saved ? colors.primary : "#7A7060"} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={[styles.itemTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {item.title}
        </Text>
        <Text style={[styles.itemDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {item.description}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.metaBadge, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
            <Feather name="clock" size={13} color={colors.primary} />
            <Text style={[styles.metaBadgeText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {item.prepTime}
            </Text>
          </View>
          <View style={[styles.metaBadge, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
            <Feather name="list" size={13} color={colors.primary} />
            <Text style={[styles.metaBadgeText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {steps.length} steps
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setGuideMode(true); setCurrentStep(0); }}
          style={[styles.startGuideButton, { backgroundColor: colors.primary, borderRadius: colors.radius - 4 }]}
        >
          <Feather name="play" size={18} color="#fff" />
          <Text style={[styles.startGuideText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
            Start Step-by-Step Guide
          </Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Ingredients
        </Text>
        {ingredients.map((ing, idx) => (
          <View key={idx} style={[styles.ingredientRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.ingredientDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.ingredientText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              {ing}
            </Text>
          </View>
        ))}

        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); addToGrocery(groceryList); }}
          style={[styles.groceryButton, { borderColor: colors.primary, borderRadius: colors.radius - 4 }]}
        >
          <Feather name="shopping-cart" size={16} color={colors.primary} />
          <Text style={[styles.groceryButtonText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            Add to Grocery List
          </Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 20 }]}>
          Steps
        </Text>
        {steps.map((step) => (
          <View
            key={step.stepNumber}
            style={[
              styles.stepCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 },
            ]}
          >
            <View style={[styles.stepNum, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.stepNumText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                {step.stepNumber}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepInstruction, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {step.instruction}
              </Text>
              {step.duration && (
                <Text style={[styles.stepDuration, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                  {step.duration}
                </Text>
              )}
            </View>
          </View>
        ))}

        <View style={[styles.safetyBox, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
          <Feather name="alert-circle" size={16} color={colors.warning} />
          <Text style={[styles.safetyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {item.safetyNote}
          </Text>
        </View>

        {"whenToUse" in item && item.whenToUse && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
            <View style={styles.infoCardHeader}>
              <Feather name="sun" size={15} color={colors.primary} />
              <Text style={[styles.infoCardLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>When to use</Text>
            </View>
            <Text style={[styles.infoCardText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{item.whenToUse}</Text>
          </View>
        )}

        {"whoFor" in item && item.whoFor && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
            <View style={styles.infoCardHeader}>
              <Feather name="user-check" size={15} color={colors.primary} />
              <Text style={[styles.infoCardLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Good for</Text>
            </View>
            <Text style={[styles.infoCardText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{item.whoFor}</Text>
          </View>
        )}

        {"avoidIf" in item && item.avoidIf && (
          <View style={[styles.infoCard, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
            <View style={styles.infoCardHeader}>
              <Feather name="shield" size={15} color={colors.warning} />
              <Text style={[styles.infoCardLabel, { color: colors.warning, fontFamily: "Inter_600SemiBold" }]}>Avoid if</Text>
            </View>
            <Text style={[styles.infoCardText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{item.avoidIf}</Text>
          </View>
        )}

        {"whyItHelps" in item && item.whyItHelps && (
          <View style={[styles.infoCard, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius - 4 }]}>
            <View style={styles.infoCardHeader}>
              <Feather name="zap" size={15} color={colors.primary} />
              <Text style={[styles.infoCardLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Why it works</Text>
            </View>
            <Text style={[styles.infoCardText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{item.whyItHelps}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  imageContainer: { position: "relative" },
  heroImage: { width: "100%", height: 280 },
  backButton: {
    position: "absolute",
    top: 52,
    left: 16,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    position: "absolute",
    top: 52,
    right: 16,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 20 },
  itemTitle: { fontSize: 24, marginBottom: 8 },
  itemDesc: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  metaRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  metaBadgeText: { fontSize: 13 },
  startGuideButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
    marginBottom: 24,
  },
  startGuideText: { fontSize: 16 },
  sectionLabel: { fontSize: 16, marginBottom: 12 },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  ingredientDot: { width: 6, height: 6, borderRadius: 3 },
  ingredientText: { fontSize: 15, flex: 1 },
  groceryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1.5,
    gap: 8,
    marginTop: 12,
    marginBottom: 20,
  },
  groceryButtonText: { fontSize: 14 },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNumText: { fontSize: 14 },
  stepInstruction: { fontSize: 14, lineHeight: 21 },
  stepDuration: { fontSize: 12, marginTop: 4 },
  safetyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderWidth: 1,
    marginTop: 16,
    gap: 10,
  },
  safetyText: { fontSize: 13, lineHeight: 19, flex: 1 },
  infoCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  infoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  infoCardLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  infoCardText: {
    fontSize: 13,
    lineHeight: 20,
  },
  guideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  guideHeaderTitle: { fontSize: 16 },
  progressBar: { height: 4, borderRadius: 2, marginBottom: 0 },
  progressFill: { height: 4, borderRadius: 2 },
  guideContent: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
  },
  stepNumberCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { fontSize: 28 },
  guideInstruction: { fontSize: 22, lineHeight: 33, textAlign: "center" },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  durationText: { fontSize: 16 },
  guideFooter: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  guideBack: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 8,
  },
  guideNext: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  guideNextText: { fontSize: 16 },
});
