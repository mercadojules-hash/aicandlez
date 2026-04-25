import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { usePressScale } from "@/hooks/useFadeIn";
import { useWellness } from "@/contexts/WellnessContext";
import type { AIIngredient, AIResponse } from "@/lib/ai";
import { REMEDIES } from "@/lib/data";

export interface Message {
  id: string;
  role: "user" | "ai";
  text?: string;
  response?: AIResponse;
  timestamp: Date;
}

function ActionButton({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const colors = useColors();
  const { scale, onPressIn, onPressOut } = usePressScale(0.95);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        style={[
          styles.actionBtn,
          {
            backgroundColor: primary ? colors.primary : colors.secondary,
            borderRadius: colors.radius - 6,
          },
        ]}
      >
        <Feather name={icon} size={13} color={primary ? "#fff" : colors.primary} />
        <Text
          style={[
            styles.actionBtnText,
            { color: primary ? "#fff" : colors.primary, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function IngredientSection({
  title,
  icon,
  items,
  iconColor,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  items: AIIngredient[];
  iconColor: string;
}) {
  const colors = useColors();
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon} size={14} color={iconColor} />
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {title}
        </Text>
      </View>
      {items.map((item, idx) => (
        <View
          key={idx}
          style={[
            styles.ingredientCard,
            { backgroundColor: colors.secondary, borderRadius: colors.radius - 8 },
          ]}
        >
          <Text style={[styles.ingredientName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {item.name}
          </Text>
          <Text style={[styles.ingredientExplanation, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            {item.explanation}
          </Text>
          <Text style={[styles.safetyNote, { color: colors.warning, fontFamily: "Inter_400Regular" }]}>
            {item.safetyNote}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ChatBubble({ message }: { message: Message }) {
  const colors = useColors();
  const { saveItem, isSaved, addToGrocery } = useWellness();
  const [saved, setSaved] = useState(false);
  const [addedToGrocery, setAddedToGrocery] = useState(false);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <View style={styles.userBubbleRow}>
        <View style={[styles.userBubble, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
          <Text style={[styles.userText, { color: colors.primaryForeground, fontFamily: "Inter_400Regular" }]}>
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  const res = message.response;
  if (!res) {
    return (
      <View style={styles.aiBubbleContainer}>
        <View style={[styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 }]}>{message.text}</Text>
        </View>
      </View>
    );
  }

  const allIngredients = [
    ...res.herbs.map((h) => h.name),
    ...res.teas.map((t) => t.name),
    ...res.foods.map((f) => f.name),
  ];

  const matchedRemedy = REMEDIES.find((r) =>
    r.category.toLowerCase().includes(res.query?.toLowerCase() ?? "") ||
    res.query?.toLowerCase().includes(r.category.toLowerCase())
  ) ?? REMEDIES[0];

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!saved) {
      saveItem({
        id: message.id + "-ai",
        type: "remedy",
        title: `AI Suggestions for: ${res.query || "wellness"}`,
        savedAt: new Date().toISOString(),
      });
      setSaved(true);
    }
  };

  const handleAddToGrocery = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addToGrocery(allIngredients);
    setAddedToGrocery(true);
  };

  const handleStartGuide = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/remedy/${matchedRemedy.id}`);
  };

  return (
    <View style={styles.aiBubbleContainer}>
      <View
        style={[
          styles.aiBubble,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <View style={styles.aiHeader}>
          <View style={[styles.aiAvatar, { backgroundColor: colors.secondary }]}>
            <Feather name="activity" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.aiLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              Natura AI
            </Text>
            <Text style={[styles.aiSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Natural Wellness Guidance
            </Text>
          </View>
        </View>

        {res.query && (
          <View style={[styles.personalizedBox, { backgroundColor: colors.muted, borderRadius: colors.radius - 8 }]}>
            <Text style={[styles.personalizedText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Based on your concern about <Text style={{ color: colors.primary }}>"{res.query}"</Text>, here's what may help:
            </Text>
          </View>
        )}

        <View style={[styles.disclaimer, { backgroundColor: colors.muted, borderRadius: colors.radius - 8 }]}>
          <Feather name="info" size={12} color={colors.mutedForeground} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Educational suggestions only. Not medical advice.
          </Text>
        </View>

        <IngredientSection title="Herbs" icon="feather" items={res.herbs} iconColor="#6BAA4A" />
        <IngredientSection title="Teas" icon="coffee" items={res.teas} iconColor="#C8956C" />
        <IngredientSection title="Foods" icon="shopping-bag" items={res.foods} iconColor="#E07A2F" />
        <IngredientSection title="Supplements" icon="plus-circle" items={res.supplements} iconColor="#8B87C5" />

        <View style={[styles.whySection, { backgroundColor: colors.secondary, borderRadius: colors.radius - 8 }]}>
          <Text style={[styles.whyTitle, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Why it may help
          </Text>
          <Text style={[styles.whyText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            {res.whyItHelps}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <ActionButton
            icon="play"
            label="Start Guide"
            onPress={handleStartGuide}
            primary
          />
          <ActionButton
            icon={saved ? "bookmark" : "bookmark"}
            label={saved ? "Saved ✓" : "Save"}
            onPress={handleSave}
          />
          <ActionButton
            icon="shopping-cart"
            label={addedToGrocery ? "Added ✓" : "Grocery"}
            onPress={handleAddToGrocery}
          />
        </View>
      </View>
    </View>
  );
}

export function TypingIndicator() {
  const colors = useColors();
  return (
    <View style={styles.aiBubbleContainer}>
      <View
        style={[
          styles.typingBubble,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <Feather name="activity" size={14} color={colors.primary} />
        <Text style={[styles.typingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Natura AI is thinking...
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userBubbleRow: { alignItems: "flex-end", marginBottom: 12, paddingHorizontal: 16 },
  userBubble: { maxWidth: "80%", paddingHorizontal: 16, paddingVertical: 12 },
  userText: { fontSize: 15, lineHeight: 22 },
  aiBubbleContainer: { marginBottom: 16, paddingHorizontal: 16 },
  aiBubble: { borderWidth: 1, padding: 16 },
  aiHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  aiLabel: { fontSize: 14 },
  aiSub: { fontSize: 11, marginTop: 1 },
  personalizedBox: { padding: 12, marginBottom: 10 },
  personalizedText: { fontSize: 13, lineHeight: 19 },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", padding: 10, marginBottom: 14, gap: 6 },
  disclaimerText: { fontSize: 11, flex: 1, lineHeight: 16 },
  section: { marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  sectionTitle: { fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 },
  ingredientCard: { padding: 12, marginBottom: 6 },
  ingredientName: { fontSize: 14, marginBottom: 4 },
  ingredientExplanation: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  safetyNote: { fontSize: 11, lineHeight: 16, fontStyle: "italic" },
  whySection: { padding: 14, marginBottom: 14 },
  whyTitle: { fontSize: 13, marginBottom: 6 },
  whyText: { fontSize: 14, lineHeight: 21 },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 5,
  },
  actionBtnText: { fontSize: 12 },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 8,
  },
  typingText: { fontSize: 14 },
});
