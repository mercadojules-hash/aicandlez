import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useFadeIn, usePressScale } from "@/hooks/useFadeIn";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";
import { DisclaimerModal } from "@/components/DisclaimerModal";
import { DailyCheckIn } from "@/components/DailyCheckIn";
import { RemedyCard } from "@/components/Cards";
import { REMEDIES } from "@/lib/data";

function QuickActionBtn({
  icon,
  label,
  route,
  delay,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  route: string;
  delay: number;
}) {
  const colors = useColors();
  const { scale, onPressIn, onPressOut } = usePressScale();
  const { opacity, translateY } = useFadeIn(320, delay);

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }, { scale }] }}>
      <TouchableOpacity
        onPress={() => router.push(route as any)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        style={[
          styles.qaBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius - 4,
          },
        ]}
      >
        <View style={[styles.qaIcon, { backgroundColor: colors.secondary, borderRadius: 22 }]}>
          <Feather name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.qaLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { streak, saveItem, isSaved } = useWellness();

  const firstName = profile.name ? profile.name.split(" ")[0] : null;
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const { opacity: hOpacity, translateY: hY } = useFadeIn(280, 0);

  return (
    <>
      <DisclaimerModal />
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
          paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[styles.headerRow, { opacity: hOpacity, transform: [{ translateY: hY }] }]}>
          <View>
            <Text style={[styles.greetingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {greeting}{firstName ? `, ${firstName}` : ""} 👋
            </Text>
            <Text style={[styles.subGreeting, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              How are you feeling today?
            </Text>
          </View>
          <View style={[styles.logoCircle, { backgroundColor: colors.secondary }]}>
            <Image source={require("@/assets/images/logo.png")} style={styles.logoImg} contentFit="contain" />
          </View>
        </Animated.View>

        {/* Streak pill */}
        {streak > 0 && (
          <View
            style={[
              styles.streakPill,
              { backgroundColor: colors.accent + "22", borderColor: colors.accent + "44", borderRadius: 20 },
            ]}
          >
            <Feather name="zap" size={14} color={colors.accent} />
            <Text style={[styles.streakText, { color: colors.accent, fontFamily: "Inter_600SemiBold" }]}>
              {streak}-day streak — keep going!
            </Text>
          </View>
        )}

        {/* ★ DAILY CHECK-IN — PRIMARY FEATURE ★ */}
        <DailyCheckIn />

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Quick Actions
          </Text>
          <View style={styles.qaRow}>
            <QuickActionBtn icon="message-circle" label="Ask AI" route="/(tabs)/chat" delay={0} />
            <QuickActionBtn icon="list" label="My Plans" route="/(tabs)/plans" delay={70} />
            <QuickActionBtn icon="book-open" label="Recipes" route="/(tabs)/recipes" delay={140} />
          </View>
        </View>

        {/* Remedy Shelf */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Wellness Remedies
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/plans")}>
              <Text style={[styles.seeAll, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelf}>
            {REMEDIES.map((r) => (
              <RemedyCard
                key={r.id}
                remedy={r}
                onPress={() => router.push(`/remedy/${r.id}`)}
                isSaved={isSaved(r.id)}
                onSave={() => {
                  if (!isSaved(r.id))
                    saveItem({ id: r.id, type: "remedy", title: r.title, savedAt: new Date().toISOString() });
                }}
              />
            ))}
            <View style={{ width: 16 }} />
          </ScrollView>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  greetingText: { fontSize: 15, marginBottom: 4 },
  subGreeting: { fontSize: 22, maxWidth: 230 },
  logoCircle: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  logoImg: { width: 38, height: 38 },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 6,
  },
  streakText: { fontSize: 13 },
  section: { marginBottom: 28 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 18, paddingHorizontal: 20, marginBottom: 14 },
  seeAll: { fontSize: 14 },
  qaRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10 },
  qaBtn: { alignItems: "center", paddingVertical: 16, borderWidth: 1, gap: 8 },
  qaIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  qaLabel: { fontSize: 13, textAlign: "center" },
  shelf: { paddingLeft: 16 },
});
