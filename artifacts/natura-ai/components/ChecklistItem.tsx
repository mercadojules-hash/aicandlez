import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ChecklistItemProps {
  label: string;
  time?: string;
  checked: boolean;
  onToggle: () => void;
  category?: "morning" | "afternoon" | "evening";
}

const CATEGORY_COLORS = {
  morning: "#F4A261",
  afternoon: "#6BAA4A",
  evening: "#8B87C5",
};

export function ChecklistItem({
  label,
  time,
  checked,
  onToggle,
  category,
}: ChecklistItemProps) {
  const colors = useColors();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: checked ? colors.primary + "40" : colors.border,
          borderRadius: colors.radius - 4,
          opacity: checked ? 0.7 : 1,
        },
      ]}
    >
      <TouchableOpacity
        onPress={handlePress}
        style={[
          styles.checkbox,
          {
            backgroundColor: checked ? colors.primary : "transparent",
            borderColor: checked ? colors.primary : colors.border,
            borderRadius: 8,
          },
        ]}
      >
        {checked && <Feather name="check" size={14} color="#fff" />}
      </TouchableOpacity>
      <View style={styles.content}>
        <Text
          style={[
            styles.label,
            {
              color: checked ? colors.mutedForeground : colors.foreground,
              fontFamily: "Inter_500Medium",
              textDecorationLine: checked ? "line-through" : "none",
            },
          ]}
        >
          {label}
        </Text>
        {time && (
          <Text
            style={[
              styles.time,
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {time}
          </Text>
        )}
      </View>
      {category && (
        <View
          style={[
            styles.categoryDot,
            { backgroundColor: CATEGORY_COLORS[category] },
          ]}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 15,
  },
  time: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
});
