import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface GoalChipProps {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  selected: boolean;
  onPress: () => void;
}

export function GoalChip({ label, icon, selected, onPress }: GoalChipProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {icon && (
        <Feather
          name={icon}
          size={16}
          color={selected ? colors.primaryForeground : colors.mutedForeground}
          style={styles.icon}
        />
      )}
      <Text
        style={[
          styles.label,
          {
            color: selected ? colors.primaryForeground : colors.foreground,
            fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular",
          },
        ]}
      >
        {label}
      </Text>
      {selected && (
        <View style={styles.check}>
          <Feather name="check" size={14} color={colors.primaryForeground} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  icon: {
    marginRight: 10,
  },
  label: {
    fontSize: 15,
    flex: 1,
  },
  check: {
    marginLeft: 8,
  },
});
