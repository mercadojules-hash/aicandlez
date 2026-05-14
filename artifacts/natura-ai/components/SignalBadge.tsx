import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C, FONTS, RADIUS } from "@/constants/theme";

type Signal = "BUY" | "SELL" | "HOLD";

const SIGNAL_COLORS: Record<Signal, { bg: string; color: string; border: string }> = {
  BUY:  { bg: "#00ff8a12", color: C.green,  border: "#00ff8a35" },
  SELL: { bg: "#ff335512", color: C.red,    border: "#ff335535" },
  HOLD: { bg: "#00aaff10", color: C.cyan,   border: "#00aaff30" },
};

export function SignalBadge({ signal, small = false }: { signal: Signal; small?: boolean }) {
  const s = SIGNAL_COLORS[signal] ?? SIGNAL_COLORS.HOLD;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border },
      small && styles.badgeSmall]}>
      <Text style={[styles.text, { color: s.color }, small && styles.textSmall]}>
        {signal}
      </Text>
    </View>
  );
}

export function ConfidenceBar({ value, color = C.cyan }: { value: number; color?: string }) {
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFill, { width: `${Math.min(100, value)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.sm, borderWidth: 1,
  },
  badgeSmall: { paddingHorizontal: 5, paddingVertical: 2 },
  text: { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
  textSmall: { fontSize: 8 },
  barBg: {
    height: 3, backgroundColor: "#0d1e2e", borderRadius: 2, overflow: "hidden",
    marginTop: 4,
  },
  barFill: { height: "100%", borderRadius: 2 },
});
