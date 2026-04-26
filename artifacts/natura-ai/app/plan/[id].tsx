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
import { ChecklistItem } from "@/components/ChecklistItem";
import { PLANS, getItemImage, DEFAULT_FALLBACK_URL } from "@/lib/data";


export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { saveItem, removeItem, isSaved, addToGrocery, toggleTask, isTaskDone } = useWellness();
  const [activeDay, setActiveDay] = useState(0);

  const plan = PLANS.find((p) => p.id === id);

  if (!plan) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Plan not found</Text>
      </View>
    );
  }

  const saved = isSaved(plan.id);
  const day = plan.days[activeDay];

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
            src={getItemImage(plan)}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e: any) => { e.currentTarget.src = DEFAULT_FALLBACK_URL; }}
          />
        ) : (
          <Image
            source={{ uri: getItemImage(plan) }}
            style={styles.heroImage}
            contentFit="cover"
            cachePolicy="none"
          />
        )}
        <View style={[styles.heroOverlay]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.circleButton, { backgroundColor: "rgba(255,255,255,0.9)" }]}
          >
            <Feather name="arrow-left" size={20} color="#1C2B1C" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (saved) removeItem(plan.id);
              else saveItem({ id: plan.id, type: "plan", title: plan.title, savedAt: new Date().toISOString() });
            }}
            style={[styles.circleButton, { backgroundColor: "rgba(255,255,255,0.9)" }]}
          >
            <Feather name="bookmark" size={20} color={saved ? colors.primary : "#7A7060"} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <View style={[styles.durationTag, { backgroundColor: colors.primary + "20", borderRadius: 20 }]}>
          <Text style={[styles.durationTagText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {plan.duration}
          </Text>
        </View>
        <Text style={[styles.planTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {plan.title}
        </Text>
        <Text style={[styles.planSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {plan.subtitle}
        </Text>

        {plan.days.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 20 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {plan.days.map((d, idx) => (
              <TouchableOpacity
                key={d.day}
                onPress={() => setActiveDay(idx)}
                style={[
                  styles.dayTab,
                  {
                    backgroundColor: activeDay === idx ? colors.primary : colors.card,
                    borderColor: activeDay === idx ? colors.primary : colors.border,
                    borderRadius: colors.radius - 4,
                  },
                ]}
              >
                <Text style={[styles.dayTabLabel, { color: activeDay === idx ? "#fff" : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Day {d.day}
                </Text>
                <Text style={[styles.dayTabName, { color: activeDay === idx ? "#fff" : colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {day && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Activities
            </Text>
            {day.activities.map((activity) => (
              <ChecklistItem
                key={activity.id}
                label={activity.title}
                time={activity.time}
                checked={isTaskDone(activity.id)}
                onToggle={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleTask(activity.id); }}
                category={activity.category}
              />
            ))}

            <View style={styles.dayDetails}>
              {[
                { label: "Recommended Foods", items: day.foods, icon: "shopping-bag" as const, color: "#E07A2F" },
                { label: "Herbal Teas", items: day.teas, icon: "coffee" as const, color: "#C8956C" },
                { label: "Supplement Guidance", items: day.supplements, icon: "plus-circle" as const, color: "#8B87C5" },
              ].map((section) => (
                <View
                  key={section.label}
                  style={[
                    styles.daySection,
                    { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 },
                  ]}
                >
                  <View style={styles.daySectionHeader}>
                    <Feather name={section.icon} size={15} color={section.color} />
                    <Text style={[styles.daySectionLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                      {section.label}
                    </Text>
                  </View>
                  {section.items.map((item, i) => (
                    <Text key={i} style={[styles.daySectionItem, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                      • {item}
                    </Text>
                  ))}
                  {section.label === "Supplement Guidance" && (
                    <Text style={[styles.suppDisclaimer, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Educational only — consult your healthcare provider
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); addToGrocery(plan.groceryList); }}
          style={[styles.groceryButton, { borderColor: colors.primary, borderRadius: colors.radius - 4 }]}
        >
          <Feather name="shopping-cart" size={16} color={colors.primary} />
          <Text style={[styles.groceryText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            Add full grocery list to cart
          </Text>
        </TouchableOpacity>

        <View style={[styles.disclaimerBox, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            This plan provides educational wellness suggestions only. Always consult a healthcare provider before starting any new wellness program.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  imageContainer: { position: "relative" },
  heroImage: { width: "100%", height: 260 },
  heroOverlay: {
    position: "absolute",
    top: 52,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 20 },
  durationTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },
  durationTagText: { fontSize: 13 },
  planTitle: { fontSize: 24, marginBottom: 8 },
  planSubtitle: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: "center",
    minWidth: 90,
  },
  dayTabLabel: { fontSize: 11 },
  dayTabName: { fontSize: 14 },
  sectionLabel: { fontSize: 16, marginBottom: 12 },
  dayDetails: { marginTop: 20, gap: 10 },
  daySection: {
    padding: 14,
    borderWidth: 1,
  },
  daySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  daySectionLabel: { fontSize: 14 },
  daySectionItem: { fontSize: 14, lineHeight: 22 },
  suppDisclaimer: { fontSize: 11, marginTop: 8, fontStyle: "italic" },
  groceryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1.5,
    gap: 8,
    marginTop: 20,
    marginBottom: 12,
  },
  groceryText: { fontSize: 14 },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
  },
  disclaimerText: { fontSize: 12, lineHeight: 18, flex: 1 },
});
