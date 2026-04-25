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
import { useUser } from "@/contexts/UserContext";
import { GoalChip } from "@/components/GoalChip";

const GOALS = [
  { id: "sleep", label: "Better Sleep", icon: "moon" as const },
  { id: "stress", label: "Stress Relief", icon: "wind" as const },
  { id: "digestion", label: "Digestive Health", icon: "activity" as const },
  { id: "energy", label: "More Energy", icon: "zap" as const },
  { id: "immunity", label: "Immune Support", icon: "shield" as const },
  { id: "focus", label: "Mental Clarity & Focus", icon: "eye" as const },
  { id: "weight", label: "Healthy Weight", icon: "trending-down" as const },
  { id: "skin", label: "Skin Health", icon: "sun" as const },
  { id: "hormones", label: "Hormonal Balance", icon: "rotate-cw" as const },
  { id: "detox", label: "Gentle Detox Support", icon: "droplet" as const },
];

export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { updateProfile } = useUser();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleNext = async () => {
    await updateProfile({ goals: selected });
    router.push("/onboarding/preferences");
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "web" ? 67 : insets.top,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: "50%" }]} />
          </View>
        </View>
      </View>

      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        What are your wellness goals?
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Select all that apply. You can change these any time.
      </Text>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {GOALS.map((goal) => (
          <GoalChip
            key={goal.id}
            label={goal.label}
            icon={goal.icon}
            selected={selected.includes(goal.id)}
            onPress={() => toggle(goal.id)}
          />
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleNext}
          style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            {selected.length === 0 ? "Skip for now" : `Continue (${selected.length} selected)`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 16,
  },
  backBtn: {
    padding: 4,
  },
  progress: {
    flex: 1,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontSize: 24,
    marginBottom: 8,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  footer: {
    paddingTop: 12,
  },
  button: {
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 16,
  },
});
