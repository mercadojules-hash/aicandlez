import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { GoalChip } from "@/components/GoalChip";

const DIETARY = [
  { id: "vegan", label: "Vegan" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "gluten-free", label: "Gluten-Free" },
  { id: "dairy-free", label: "Dairy-Free" },
  { id: "paleo", label: "Paleo" },
  { id: "keto", label: "Keto" },
  { id: "none", label: "No restrictions" },
];

const COMMON_ALLERGIES = ["Nuts", "Soy", "Shellfish", "Eggs", "Wheat", "Dairy", "Pollen", "Ragweed"];

export default function PreferencesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { updateProfile, completeOnboarding } = useUser();
  const [name, setName] = useState("");
  const [selectedDiet, setSelectedDiet] = useState<string[]>([]);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);

  const toggleDiet = (id: string) => {
    setSelectedDiet((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const toggleAllergy = (item: string) => {
    setSelectedAllergies((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  const handleFinish = async () => {
    await updateProfile({
      name: name.trim() || "Friend",
      dietaryPreferences: selectedDiet,
      allergies: selectedAllergies,
    });
    await completeOnboarding();
    router.replace("/(tabs)");
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
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: "100%" }]} />
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Almost there
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Help us personalize your experience.
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Your name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="What should we call you?"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.nameInput,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
              borderRadius: colors.radius - 4,
              fontFamily: "Inter_400Regular",
            },
          ]}
        />

        <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Dietary preferences
        </Text>
        <View style={styles.chipGrid}>
          {DIETARY.map((d) => (
            <TouchableOpacity
              key={d.id}
              onPress={() => toggleDiet(d.id)}
              style={[
                styles.dietChip,
                {
                  backgroundColor: selectedDiet.includes(d.id) ? colors.primary : colors.card,
                  borderColor: selectedDiet.includes(d.id) ? colors.primary : colors.border,
                  borderRadius: 20,
                },
              ]}
            >
              <Text
                style={[
                  styles.dietChipText,
                  {
                    color: selectedDiet.includes(d.id) ? "#fff" : colors.foreground,
                    fontFamily: "Inter_500Medium",
                  },
                ]}
              >
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Known allergies or sensitivities
        </Text>
        <View style={styles.chipGrid}>
          {COMMON_ALLERGIES.map((a) => (
            <TouchableOpacity
              key={a}
              onPress={() => toggleAllergy(a)}
              style={[
                styles.dietChip,
                {
                  backgroundColor: selectedAllergies.includes(a) ? colors.destructive : colors.card,
                  borderColor: selectedAllergies.includes(a) ? colors.destructive : colors.border,
                  borderRadius: 20,
                },
              ]}
            >
              <Text
                style={[
                  styles.dietChipText,
                  {
                    color: selectedAllergies.includes(a) ? "#fff" : colors.foreground,
                    fontFamily: "Inter_500Medium",
                  },
                ]}
              >
                {a}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleFinish}
          style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Start My Wellness Journey
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
  backBtn: { padding: 4 },
  progress: { flex: 1 },
  progressBar: { height: 4, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },
  title: {
    fontSize: 24,
    marginBottom: 8,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 15,
    marginBottom: 12,
  },
  scroll: { flex: 1 },
  nameInput: {
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 24,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  dietChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  dietChipText: {
    fontSize: 14,
  },
  footer: { paddingTop: 12 },
  button: {
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 8,
  },
  buttonText: { fontSize: 16 },
});
