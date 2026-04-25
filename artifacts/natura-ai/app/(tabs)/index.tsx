import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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
import { useWellness } from "@/contexts/WellnessContext";
import { WellnessTipCard, RemedyCard } from "@/components/Cards";
import { ChecklistItem } from "@/components/ChecklistItem";
import { REMEDIES, ROUTINE_TASKS, getTodayTip, getQuickWin } from "@/lib/data";

const MORNING_TASKS = ROUTINE_TASKS.filter((t) => t.category === "morning").slice(0, 3);
const AFTERNOON_TASKS = ROUTINE_TASKS.filter((t) => t.category === "afternoon").slice(0, 2);
const EVENING_TASKS = ROUTINE_TASKS.filter((t) => t.category === "evening").slice(0, 2);
const ALL_HOME_TASKS = [...MORNING_TASKS, ...AFTERNOON_TASKS, ...EVENING_TASKS];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useUser();
  const { toggleTask, isTaskDone, streak, saveItem, isSaved } = useWellness();
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [checkIn, setCheckIn] = useState({ energy: 3, stress: 3, sleep: 3 });

  const tip = getTodayTip();
  const quickWin = getQuickWin();
  const completedCount = ALL_HOME_TASKS.filter((t) => isTaskDone(t.id)).length;
  const progressPct = ALL_HOME_TASKS.length > 0 ? completedCount / ALL_HOME_TASKS.length : 0;

  const firstName = profile.name.split(" ")[0] || "Friend";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
        paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {greeting},
          </Text>
          <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {firstName}
          </Text>
        </View>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.headerLogo}
          contentFit="contain"
        />
      </View>

      {streak > 0 && (
        <View
          style={[
            styles.streakBanner,
            { backgroundColor: colors.accent + "20", borderColor: colors.accent + "40", borderRadius: colors.radius - 4 },
          ]}
        >
          <Feather name="zap" size={16} color={colors.accent} />
          <Text style={[styles.streakText, { color: colors.accent, fontFamily: "Inter_600SemiBold" }]}>
            {streak}-day streak! Keep going!
          </Text>
        </View>
      )}

      <WellnessTipCard tip={tip} quickWin={quickWin} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Today's Routine
          </Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {completedCount}/{ALL_HOME_TASKS.length} done
          </Text>
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progressPct * 100}%` }]} />
        </View>
        <View style={styles.taskList}>
          {ALL_HOME_TASKS.map((task) => (
            <ChecklistItem
              key={task.id}
              label={task.label}
              time={task.time}
              checked={isTaskDone(task.id)}
              onToggle={() => toggleTask(task.id)}
              category={task.category}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Wellness Remedies
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/plans")}>
            <Text style={[styles.seeAll, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              See all
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
          {REMEDIES.map((remedy) => (
            <RemedyCard
              key={remedy.id}
              remedy={remedy}
              onPress={() => router.push(`/remedy/${remedy.id}`)}
              isSaved={isSaved(remedy.id)}
              onSave={() => {
                if (isSaved(remedy.id)) return;
                saveItem({ id: remedy.id, type: "remedy", title: remedy.title, savedAt: new Date().toISOString() });
              }}
            />
          ))}
          <View style={{ width: 16 }} />
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 14 }]}>
          Quick Actions
        </Text>
        <View style={styles.quickActions}>
          {[
            { icon: "message-circle" as const, label: "Ask AI", route: "/(tabs)/chat" },
            { icon: "list" as const, label: "My Plans", route: "/(tabs)/plans" },
            { icon: "book-open" as const, label: "Recipes", route: "/(tabs)/recipes" },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as any)}
              style={[
                styles.quickAction,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 },
              ]}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
                <Feather name={action.icon} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.quickActionLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: { fontSize: 14 },
  name: { fontSize: 26 },
  headerLogo: { width: 44, height: 44 },
  streakBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  streakText: { fontSize: 14 },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18 },
  sectionMeta: { fontSize: 13 },
  seeAll: { fontSize: 14 },
  progressBar: {
    marginHorizontal: 20,
    height: 6,
    borderRadius: 3,
    marginBottom: 14,
  },
  progressFill: { height: 6, borderRadius: 3 },
  taskList: { paddingHorizontal: 20 },
  horizontalScroll: { paddingLeft: 16 },
  quickActions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderWidth: 1,
    gap: 8,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: { fontSize: 13, textAlign: "center" },
});
