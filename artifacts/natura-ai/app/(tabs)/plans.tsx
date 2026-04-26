import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { PlanCard, RemedyCard } from "@/components/Cards";
import { PLANS, REMEDIES } from "@/lib/data";

const TABS = ["Plans", "Remedies", "Saved"] as const;
type Tab = (typeof TABS)[number];

export default function PlansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("Plans");
  const { saveItem, removeItem, isSaved, savedItems } = useWellness();

  const savedPlans = savedItems.filter((s) => s.type === "plan");
  const savedRemedies = savedItems.filter((s) => s.type === "remedy");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Wellness Plans
        </Text>
        <View style={[styles.tabs, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tab,
                activeTab === tab && { backgroundColor: colors.card, borderRadius: colors.radius - 6 },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: activeTab === tab ? colors.primary : colors.mutedForeground,
                    fontFamily: activeTab === tab ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {tab}
                {tab === "Saved" && savedItems.length > 0 ? ` (${savedItems.length})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "Plans" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Curated wellness programs to support your goals
            </Text>
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                image={plan.image}
                onPress={() => router.push(`/plan/${plan.id}`)}
                isSaved={isSaved(plan.id)}
                onSave={() => {
                  if (isSaved(plan.id)) {
                    removeItem(plan.id);
                  } else {
                    saveItem({ id: plan.id, type: "plan", title: plan.title, savedAt: new Date().toISOString() });
                  }
                }}
              />
            ))}
          </>
        )}

        {activeTab === "Remedies" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Natural remedy guides with step-by-step instructions
            </Text>
            {REMEDIES.map((remedy) => (
              <View key={remedy.id} style={{ marginBottom: 16 }}>
                <RemedyCard
                  remedy={remedy}
                  image={remedy.image}
                  onPress={() => router.push(`/remedy/${remedy.id}`)}
                  isSaved={isSaved(remedy.id)}
                  onSave={() => {
                    if (isSaved(remedy.id)) {
                      removeItem(remedy.id);
                    } else {
                      saveItem({ id: remedy.id, type: "remedy", title: remedy.title, savedAt: new Date().toISOString() });
                    }
                  }}
                />
              </View>
            ))}
          </>
        )}

        {activeTab === "Saved" && (
          <>
            {savedItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="bookmark" size={40} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  Nothing saved yet
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Bookmark remedies and plans to find them here quickly.
                </Text>
              </View>
            ) : (
              <>
                {savedPlans.length > 0 && (
                  <>
                    <Text style={[styles.savedGroupLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                      Plans
                    </Text>
                    {savedPlans.map((s) => {
                      const plan = PLANS.find((p) => p.id === s.id);
                      if (!plan) return null;
                      return (
                        <PlanCard
                          key={plan.id}
                          plan={plan}
                          image={plan.image}
                          onPress={() => router.push(`/plan/${plan.id}`)}
                          isSaved
                          onSave={() => removeItem(plan.id)}
                        />
                      );
                    })}
                  </>
                )}
                {savedRemedies.length > 0 && (
                  <>
                    <Text style={[styles.savedGroupLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                      Remedies
                    </Text>
                    {savedRemedies.map((s) => {
                      const remedy = REMEDIES.find((r) => r.id === s.id);
                      if (!remedy) return null;
                      return (
                        <View key={remedy.id} style={{ marginBottom: 16 }}>
                          <RemedyCard
                            remedy={remedy}
                            image={remedy.image}
                            onPress={() => router.push(`/remedy/${remedy.id}`)}
                            isSaved
                            onSave={() => removeItem(remedy.id)}
                          />
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    marginBottom: 14,
  },
  tabs: {
    flexDirection: "row",
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabText: { fontSize: 14 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: { fontSize: 18 },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 280,
  },
  savedGroupLabel: {
    fontSize: 16,
    marginBottom: 12,
    marginTop: 8,
  },
});
