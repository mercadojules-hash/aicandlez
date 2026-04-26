import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useWellness } from "@/contexts/WellnessContext";
import { ROUTINE_TASKS } from "@/lib/data";

const CATEGORY_LABEL: Record<string, string> = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
};

const CATEGORY_EMOJI: Record<string, string> = {
  morning:   "🌅",
  afternoon: "☀️",
  evening:   "🌙",
};

function getCurrentCategory(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function shadowStyle() {
  if (Platform.OS === "web") return { boxShadow: "0 1px 8px rgba(0,0,0,0.07)" } as object;
  return {
    shadowColor: "#2A3E2A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  };
}

export function RoutineSection() {
  const colors = useColors();
  const { toggleTask, isTaskDone } = useWellness();
  const currentCat = getCurrentCategory();

  const completedCount = ROUTINE_TASKS.filter((t) => isTaskDone(t.id)).length;
  const totalCount = ROUTINE_TASKS.length;

  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const grouped = useMemo(() => {
    const order: Array<"morning" | "afternoon" | "evening"> = ["morning", "afternoon", "evening"];
    return order
      .map((cat) => ({
        cat,
        tasks: ROUTINE_TASKS.filter((t) => t.category === cat),
      }))
      .filter((g) => g.tasks.length > 0);
  }, []);

  const handleToggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTask(id);
  };

  return (
    <View style={styles.wrapper}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Today's Routine
        </Text>
        <Text style={[styles.progress, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          {completedCount}/{totalCount} done
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.primary,
              width: `${progressPct}%` as any,
            },
          ]}
        />
      </View>

      {/* Task groups */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
          shadowStyle(),
        ]}
      >
        {grouped.map((group, gi) => {
          const isActive = group.cat === currentCat;
          return (
            <View key={group.cat}>
              {/* Category label */}
              <View
                style={[
                  styles.catRow,
                  gi > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}
              >
                <Text style={styles.catEmoji}>{CATEGORY_EMOJI[group.cat]}</Text>
                <Text
                  style={[
                    styles.catLabel,
                    {
                      color: isActive ? colors.primary : colors.mutedForeground,
                      fontFamily: isActive ? "Inter_700Bold" : "Inter_500Medium",
                    },
                  ]}
                >
                  {CATEGORY_LABEL[group.cat]}
                </Text>
                {isActive && (
                  <View style={[styles.nowBadge, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[styles.nowText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                      Now
                    </Text>
                  </View>
                )}
              </View>

              {/* Tasks in this group */}
              {group.tasks.map((task, ti) => {
                const done = isTaskDone(task.id);
                return (
                  <TouchableOpacity
                    key={task.id}
                    onPress={() => handleToggle(task.id)}
                    activeOpacity={0.75}
                    style={[
                      styles.taskRow,
                      ti < group.tasks.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border + "80",
                      },
                    ]}
                  >
                    {/* Checkbox */}
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: done ? colors.primary : colors.border,
                          backgroundColor: done ? colors.primary : "transparent",
                        },
                      ]}
                    >
                      {done && <Feather name="check" size={11} color="#fff" />}
                    </View>

                    {/* Label */}
                    <Text
                      style={[
                        styles.taskLabel,
                        {
                          color: done ? colors.mutedForeground : colors.foreground,
                          fontFamily: "Inter_400Regular",
                          textDecorationLine: done ? "line-through" : "none",
                          flex: 1,
                        },
                      ]}
                    >
                      {task.label}
                    </Text>

                    {/* Time badge */}
                    <View
                      style={[
                        styles.timeBadge,
                        {
                          backgroundColor: isActive
                            ? colors.primary + "18"
                            : colors.muted,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timeText,
                          {
                            color: isActive ? colors.primary : colors.mutedForeground,
                            fontFamily: "Inter_500Medium",
                          },
                        ]}
                      >
                        {task.time}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  heading: { fontSize: 18 },
  progress: { fontSize: 13 },
  progressTrack: {
    marginHorizontal: 20,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  catEmoji: { fontSize: 15 },
  catLabel: { fontSize: 12, letterSpacing: 0.4 },
  nowBadge: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  nowText: { fontSize: 10, letterSpacing: 0.3 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  taskLabel: { fontSize: 14, lineHeight: 19 },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  timeText: { fontSize: 11 },
});
