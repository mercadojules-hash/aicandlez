import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme, type ThemeOverride } from "../../contexts/ThemeContext";
import { useUser } from "../../contexts/UserContext";
import { useWellness } from "../../contexts/WellnessContext";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { fontSizes, radii, spacing } from "../../constants/theme";

const SCALE_LABELS = ["Very low", "Low", "Moderate", "Good", "Excellent"];

const THEME_OPTIONS: { mode: ThemeOverride; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { mode: "dark",   label: "Dark",  icon: "moon" },
  { mode: "light",  label: "Light", icon: "sun" },
  { mode: "system", label: "Auto",  icon: "smartphone" },
];

function ScaleSelector({ label, value, onChange, colors }: { label: string; value: number; onChange: (v: number) => void; colors: any }) {
  const labelStr = SCALE_LABELS[value - 1];
  return (
    <View style={styles.scaleWrap}>
      <View style={styles.scaleLabelRow}>
        <Text style={[styles.scaleLabel, { color: colors.text }]}>{label}:</Text>
        <Text style={[styles.scaleLabelVal, { color: colors.primary }]}>{labelStr}</Text>
      </View>
      <View style={styles.scaleDots}>
        {[1, 2, 3, 4, 5].map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.scaleDot, {
              backgroundColor: value >= v ? colors.primary : "transparent",
              borderColor: value >= v ? colors.primary : colors.border,
              flex: 1,
            }]}
            onPress={() => onChange(v)}
          />
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { colors, override: mode, setOverride: setMode } = useTheme();
  const { profile, resetOnboarding } = useUser();
  const { streak, savedItems, completedTasks, submitCheckIn, lastCheckIn } = useWellness();
  const { isPremium, openPaywall } = useSubscription();

  const [energy, setEnergy]       = useState(3);
  const [stress, setStress]       = useState(3);
  const [sleep, setSleep]         = useState(3);
  const [checkInDone, setCheckInDone] = useState(!!lastCheckIn);

  const firstName   = profile.name ? profile.name.split(" ")[0] : "Jules";
  const initial     = (profile.name?.charAt(0) || "J").toUpperCase();
  const focusArea   = profile.goals[0] ?? "General";
  const savedCount  = savedItems.length;
  const sessionCount = completedTasks.length;

  const handleCheckIn = async () => {
    await submitCheckIn({ energy, stress, sleep });
    setCheckInDone(true);
  };

  const handleReset = () => {
    Alert.alert(
      "Reset & Sign Out",
      "This will clear all your data and restart the onboarding. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => resetOnboarding() },
      ]
    );
  };

  const STATS = [
    { icon: "zap" as const,          value: `${streak}`,       label: "Day Streak",  color: "#F5C842" },
    { icon: "check-circle" as const,  value: `${sessionCount}`, label: "Sessions",    color: colors.primary },
    { icon: "target" as const,        value: focusArea,          label: "Focus",       color: "#A78BFA" },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Avatar Hero ── */}
        <View style={styles.hero}>
          <View style={[styles.avatarRing, { borderColor: colors.primary + "44" }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
            </View>
          </View>
          <Text style={[styles.heroName, { color: colors.text }]}>{firstName}</Text>
          <Text style={[styles.heroSub, { color: colors.textMuted }]}>Your wellness journey</Text>
        </View>

        {/* ── Stats ── */}
        <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {STATS.map(({ icon, value, label, color }) => (
            <View key={label} style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
                <Feather name={icon} size={16} color={color} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Premium Banner (free users) ── */}
        {!isPremium && (
          <TouchableOpacity
            style={[styles.premiumBanner, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "33" }]}
            onPress={openPaywall}
            activeOpacity={0.85}
          >
            <Feather name="star" size={20} color={colors.primary} />
            <View style={styles.premiumInfo}>
              <Text style={[styles.premiumTitle, { color: colors.primary }]}>Natura Premium</Text>
              <Text style={[styles.premiumSub, { color: colors.textDim }]}>Unlock full access to recipes, AI guidance, and wellness plans</Text>
            </View>
            <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: colors.primary }]} onPress={openPaywall}>
              <Text style={styles.upgradeBtnText}>Upgrade</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* ── Daily Check-In ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Check-In</Text>
          <Text style={[styles.sectionSub, { color: colors.textDim }]}>How are you feeling today?</Text>
          {checkInDone ? (
            <View style={[styles.checkInDone, { backgroundColor: colors.primary + "11" }]}>
              <Feather name="check-circle" size={20} color={colors.primary} />
              <Text style={[styles.checkInDoneText, { color: colors.primary }]}>Check-in complete for today</Text>
            </View>
          ) : (
            <>
              <ScaleSelector label="Energy"        value={energy} onChange={setEnergy} colors={colors} />
              <ScaleSelector label="Stress"         value={stress} onChange={setStress} colors={colors} />
              <ScaleSelector label="Sleep quality"  value={sleep}  onChange={setSleep}  colors={colors} />
              <TouchableOpacity
                style={[styles.checkInBtn, { backgroundColor: colors.card, borderColor: colors.primary + "55" }]}
                onPress={handleCheckIn}
                activeOpacity={0.85}
              >
                <Text style={[styles.checkInBtnText, { color: colors.primary }]}>Submit Check-In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Appearance ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map(({ mode: m, label, icon }) => (
              <TouchableOpacity
                key={m}
                style={[styles.themeBtn, {
                  backgroundColor: mode === m ? colors.primary + "22" : "transparent",
                  borderColor: mode === m ? colors.primary + "88" : colors.border,
                }]}
                onPress={() => setMode(m)}
              >
                <Feather name={icon} size={16} color={mode === m ? colors.primary : colors.textMuted} />
                <Text style={[styles.themeBtnText, { color: mode === m ? colors.primary : colors.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Settings ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
          {[
            { icon: "bell" as const,  label: "Notifications",  sub: "Daily reminders & tips", action: () => {} },
            { icon: "lock" as const,  label: "Privacy",         sub: "Data & permissions",     action: () => {} },
          ].map(({ icon, label, sub, action }) => (
            <TouchableOpacity key={label} style={[styles.settingRow, { borderBottomColor: colors.border }]} onPress={action} activeOpacity={0.7}>
              <View style={[styles.settingIcon, { backgroundColor: colors.border + "80" }]}>
                <Feather name={icon} size={16} color={colors.textDim} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted }]}>{sub}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.textDim} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.settingRow, { borderBottomColor: "transparent" }]} onPress={handleReset} activeOpacity={0.7}>
            <View style={[styles.settingIcon, { backgroundColor: "#E53E3E22" }]}>
              <Feather name="log-out" size={16} color="#E53E3E" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: "#E53E3E" }]}>Reset & Sign Out</Text>
              <Text style={[styles.settingSub, { color: colors.textMuted }]}>Clear all data and restart</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#E53E3E44" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1 },
  scroll:           { flex: 1 },
  hero:             { alignItems: "center", paddingVertical: spacing.xl },
  avatarRing:       { width: 88, height: 88, borderRadius: 44, borderWidth: 2, padding: 4, marginBottom: spacing.sm },
  avatar:           { width: "100%", height: "100%", borderRadius: 40, alignItems: "center", justifyContent: "center" },
  avatarInitial:    { fontSize: 32, fontFamily: "Inter_700Bold" },
  heroName:         { fontSize: fontSizes.xl, fontFamily: "Inter_700Bold", marginBottom: 4 },
  heroSub:          { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  statsRow:         { flexDirection: "row", marginHorizontal: spacing.md, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  statItem:         { flex: 1, alignItems: "center", gap: 4 },
  statIcon:         { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statValue:        { fontSize: fontSizes.sm, fontFamily: "Inter_700Bold" },
  statLabel:        { fontSize: 10, fontFamily: "Inter_400Regular" },
  premiumBanner:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.md, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  premiumInfo:      { flex: 1 },
  premiumTitle:     { fontSize: fontSizes.sm, fontFamily: "Inter_700Bold" },
  premiumSub:       { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", lineHeight: 16 },
  upgradeBtn:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full },
  upgradeBtnText:   { color: "#0D1F16", fontSize: fontSizes.xs, fontFamily: "Inter_700Bold" },
  section:          { marginHorizontal: spacing.md, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  sectionTitle:     { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  sectionSub:       { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginBottom: spacing.md },
  scaleWrap:        { marginBottom: spacing.md },
  scaleLabelRow:    { flexDirection: "row", gap: 4, marginBottom: 6 },
  scaleLabel:       { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  scaleLabelVal:    { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold" },
  scaleDots:        { flexDirection: "row", gap: 6 },
  scaleDot:         { height: 10, borderRadius: 5, borderWidth: 1.5 },
  checkInDone:      { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radii.md },
  checkInDoneText:  { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium" },
  checkInBtn:       { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  checkInBtnText:   { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold" },
  themeRow:         { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  themeBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: spacing.sm, borderRadius: radii.md, borderWidth: 1 },
  themeBtnText:     { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  settingRow:       { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  settingIcon:      { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  settingInfo:      { flex: 1 },
  settingLabel:     { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium" },
  settingSub:       { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
});
