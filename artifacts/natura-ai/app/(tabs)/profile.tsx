import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";

const SCALE_LABELS = ["Very low", "Low", "Moderate", "Good", "Excellent"];

function SettingRow({
  icon,
  label,
  onPress,
  right,
  danger,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.settingRow, { borderBottomColor: colors.border }]}
    >
      <Feather name={icon} size={18} color={danger ? colors.destructive : colors.primary} />
      <Text
        style={[
          styles.settingLabel,
          { color: danger ? colors.destructive : colors.foreground, fontFamily: "Inter_400Regular" },
        ]}
      >
        {label}
      </Text>
      <View style={styles.settingRight}>
        {right ?? <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
      </View>
    </TouchableOpacity>
  );
}

function ThemeToggle() {
  const colors = useColors();
  const { override, setOverride } = useTheme();
  const options: Array<{ value: "system" | "light" | "dark"; label: string; icon: keyof typeof Feather.glyphMap }> = [
    { value: "light", label: "Day", icon: "sun" },
    { value: "system", label: "Auto", icon: "smartphone" },
    { value: "dark", label: "Night", icon: "moon" },
  ];

  return (
    <View style={[styles.themeToggleRow, { backgroundColor: colors.muted, borderRadius: 12 }]}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => setOverride(opt.value)}
          style={[
            styles.themeOption,
            override === opt.value && { backgroundColor: colors.card, borderRadius: 10 },
          ]}
        >
          <Feather
            name={opt.icon}
            size={15}
            color={override === opt.value ? colors.primary : colors.mutedForeground}
          />
          <Text
            style={[
              styles.themeOptionLabel,
              {
                color: override === opt.value ? colors.primary : colors.mutedForeground,
                fontFamily: override === opt.value ? "Inter_600SemiBold" : "Inter_400Regular",
              },
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, resetOnboarding } = useUser();
  const { streak, savedItems, completedTasks, lastCheckIn } = useWellness();
  const { tier, isPremium, openPaywall } = useSubscription();

  const streakEmoji = streak >= 14 ? "🏆" : streak >= 7 ? "🌿" : "🔥";

  const handleReset = () => {
    Alert.alert(
      "Reset Profile",
      "This will clear all your data and restart the app. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => resetOnboarding() },
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

      {/* Profile Card */}
      <View
        style={[
          styles.profileCard,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.avatarLetter, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
            {(profile.name?.charAt(0) ?? "N").toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.profileName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {profile.name || "Wellness Seeker"}
          </Text>
          <View style={styles.tierBadge}>
            <View
              style={[
                styles.tierPill,
                { backgroundColor: isPremium ? colors.primary + "22" : colors.muted, borderRadius: 12 },
              ]}
            >
              <Feather
                name={isPremium ? "star" : "user"}
                size={11}
                color={isPremium ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.tierLabel,
                  {
                    color: isPremium ? colors.primary : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {isPremium ? "Premium Coach" : "Free Plan"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { value: streak > 0 ? `${streakEmoji} ${streak}` : "—", label: "Day Streak", icon: "zap" as const },
          { value: String(savedItems.length), label: "Saved", icon: "bookmark" as const },
          { value: String(completedTasks.length), label: "Completed", icon: "check-circle" as const },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[
              styles.statBox,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 },
            ]}
          >
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {stat.value}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Premium upgrade (if free) */}
      {!isPremium && (
        <TouchableOpacity
          onPress={openPaywall}
          activeOpacity={0.85}
          style={[styles.upgradeCard, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        >
          <View>
            <Text style={[styles.upgradeTitle, { fontFamily: "Inter_700Bold" }]}>
              Upgrade to Natura AI Coach
            </Text>
            <Text style={[styles.upgradeSub, { fontFamily: "Inter_400Regular" }]}>
              Unlimited AI guidance · Personalized plans · Full history
            </Text>
          </View>
          <View style={[styles.upgradeArrow, { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20 }]}>
            <Feather name="arrow-right" size={18} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Wellness Mode */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Wellness Mode
          </Text>
          <Feather name="moon" size={16} color={colors.primary} />
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Choose Day, Night, or follow your device automatically
        </Text>
        <ThemeToggle />
      </View>

      {/* Settings */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 4 }]}>
          Legal & Privacy
        </Text>
        <SettingRow
          icon="shield"
          label="Privacy Policy"
          onPress={() => router.push({ pathname: "/legal", params: { type: "privacy" } })}
        />
        <SettingRow
          icon="file-text"
          label="Terms of Service"
          onPress={() => router.push({ pathname: "/legal", params: { type: "terms" } })}
        />
        <SettingRow
          icon="info"
          label="Medical Disclaimer"
          right={<View />}
          onPress={() =>
            Alert.alert(
              "Medical Disclaimer",
              "Natura AI provides educational wellness information only. Nothing in this app constitutes medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional."
            )
          }
        />
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 4 }]}>
          Account
        </Text>
        {isPremium && (
          <SettingRow
            icon="star"
            label="Manage Subscription"
            onPress={() =>
              Alert.alert("Manage Subscription", "Subscription management is handled through the App Store.", [
                { text: "OK" },
              ])
            }
          />
        )}
        <SettingRow
          icon="refresh-cw"
          label="Reset App Data"
          onPress={handleReset}
          danger
          right={<Feather name="chevron-right" size={16} color={colors.destructive} />}
        />
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Natura AI v1.0 · Made with 🌿
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  title: { fontSize: 28, marginBottom: 20 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 24 },
  profileName: { fontSize: 18, marginBottom: 6 },
  tierBadge: { flexDirection: "row" },
  tierPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, gap: 5 },
  tierLabel: { fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 14, borderWidth: 1, gap: 4 },
  statValue: { fontSize: 18 },
  statLabel: { fontSize: 10, textAlign: "center" },
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    marginBottom: 16,
  },
  upgradeTitle: { color: "#fff", fontSize: 15, marginBottom: 4 },
  upgradeSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 17 },
  upgradeArrow: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  section: { padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sectionTitle: { fontSize: 15 },
  sectionSubtitle: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  themeToggleRow: { flexDirection: "row", padding: 4, gap: 2 },
  themeOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 6 },
  themeOptionLabel: { fontSize: 13 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLabel: { flex: 1, fontSize: 14 },
  settingRight: { marginLeft: "auto" },
  version: { fontSize: 12, textAlign: "center", marginTop: 8 },
});
