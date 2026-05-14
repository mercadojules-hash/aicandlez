import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { C, RADIUS } from "@/constants/theme";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: string;
  glow?: boolean;
  padding?: number;
}

export function NeonCard({ children, style, accent = C.cyan, glow = false, padding = 14 }: Props) {
  return (
    <View
      style={[
        styles.card,
        { padding, borderColor: glow ? `${accent}50` : C.border },
        glow && {
          shadowColor:   accent,
          shadowOpacity: 0.25,
          shadowRadius:  12,
          shadowOffset:  { width: 0, height: 0 },
          elevation:     6,
        },
        style,
      ]}
    >
      {glow && (
        <View style={[StyleSheet.absoluteFill, styles.glowBg, { backgroundColor: `${accent}06` }]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    overflow:        "hidden",
  },
  glowBg: {
    borderRadius: RADIUS.lg,
  },
});
