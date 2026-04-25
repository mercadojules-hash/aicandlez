import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
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
import { useWellness } from "@/contexts/WellnessContext";

const SCALE_LABELS = ["Very low", "Low", "Moderate", "Good", "Excellent"];

function ScaleSelector({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.scaleLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        {label}: <Text style={{ color: colors.primary }}>{SCALE_LABELS[value - 1]}</Text>
      </Text>
      <View style={styles.scaleRow}>
        {[1, 2, 3, 4, 5].map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            style={[
              styles.scaleDot,
              {
                backgroundColor: value >= v ? colors.primary : colors.muted,
                borderColor: value >= v ? colors.primary : colors.border,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, resetOnboarding } = useUser();
  const { streak, savedItems, completedTasks, submitCheckIn, lastCheckIn } = useWellness();
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(3);
  const [sleep, setSleep] = useState(3);
  const [checkInDone, setCheckInDone] = useState(!!lastCheckIn);

  const handleCheckIn = async () => {
    await submitCheckIn({ energy, stress, sleep });
    setCheckInDone(true);
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Profile",
      "This will clear all your data and restart the onboarding. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => resetOnboarding(),
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
        paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84,
        paddingHorizontal: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        Profile
      </Text>

      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.avatarLetter, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
            {profile.name.charAt(0).toUpperCase() || "N"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.profileName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {profile.name || "Wellness Seeker"}
          </Text>
          {profile.goals.length > 0 && (
            <Text style={[styles.profileGoals, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Goals: {profile.goals.slice(0, 3).join(", ")}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        {[
          { value: streak, label: "Day Streak", icon: "zap" as const },
          { value: savedItems.length, label: "Saved", icon: "bookmark" as const },
          { value: completedTasks.length, label: "Today", icon: "check-circle" as const },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[
              styles.statBox,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 },
            ]}
          >
            <Feather name={stat.icon} size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {stat.value}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Daily Check-In
        </Text>
        {checkInDone ? (
          <View style={styles.checkInDone}>
            <Feather name="check-circle" size={24} color={colors.success} />
            <Text style={[styles.checkInDoneText, { color: colors.success, fontFamily: "Inter_500Medium" }]}>
              Check-in complete for today!
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.checkInSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              How are you feeling today?
            </Text>
            <ScaleSelector label="Energy" value={energy} onChange={setEnergy} colors={colors} />
            <ScaleSelector label="Stress" value={stress} onChange={setSleep} colors={colors} />
            <ScaleSelector label="Sleep quality" value={sleep} onChange={setSleep} colors={colors} />
            <TouchableOpacity
              onPress={handleCheckIn}
              style={[styles.checkInButton, { backgroundColor: colors.primary, borderRadius: colors.radius - 4 }]}
            >
              <Text style={[styles.checkInButtonText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Submit Check-In
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {profile.dietaryPreferences.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Dietary Preferences
          </Text>
          <View style={styles.tagRow}>
            {profile.dietaryPreferences.map((d) => (
              <View key={d} style={[styles.tag, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
                <Text style={[styles.tagText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                  {d}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {profile.allergies.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Allergies & Sensitivities
          </Text>
          <View style={styles.tagRow}>
            {profile.allergies.map((a) => (
              <View key={a} style={[styles.tag, { backgroundColor: colors.destructive + "15", borderRadius: 20 }]}>
                <Text style={[styles.tagText, { color: colors.destructive, fontFamily: "Inter_500Medium" }]}>
                  {a}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.section, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Medical Disclaimer
        </Text>
        <Text style={[styles.disclaimerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Natura AI provides educational wellness information only. Nothing in this app constitutes medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider for any health concerns.
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleReset}
        style={[styles.resetButton, { borderColor: colors.border, borderRadius: colors.radius - 4 }]}
      >
        <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
        <Text style={[styles.resetText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Reset profile & onboarding
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  title: {
    fontSize: 28,
    marginBottom: 20,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 24 },
  profileName: { fontSize: 18, marginBottom: 4 },
  profileGoals: { fontSize: 13, lineHeight: 18 },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderWidth: 1,
    gap: 6,
  },
  statValue: { fontSize: 22 },
  statLabel: { fontSize: 11 },
  section: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, marginBottom: 12 },
  checkInSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  scaleLabel: { fontSize: 14, marginBottom: 8 },
  scaleRow: {
    flexDirection: "row",
    gap: 10,
  },
  scaleDot: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  checkInButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  checkInButtonText: { fontSize: 15 },
  checkInDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  checkInDoneText: { fontSize: 15 },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: { fontSize: 13 },
  disclaimerText: { fontSize: 13, lineHeight: 20 },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 4,
  },
  resetText: { fontSize: 14 },
});
