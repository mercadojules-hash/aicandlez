import React, { useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { C, FONTS, RADIUS } from "@/constants/theme";

const SEG_W = 82;
const SEG_H = 34;

interface Props {
  mode:     "paper" | "live";
  onChange: (m: "paper" | "live") => void;
  compact?: boolean;
}

export function TradingModeToggle({ mode, onChange, compact = false }: Props) {
  const slide = useRef(new Animated.Value(mode === "paper" ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: mode === "paper" ? 0 : 1,
      useNativeDriver: true,
      damping: 22, stiffness: 220,
    }).start();
  }, [mode]);

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [2, SEG_W + 2] });
  const isPaper    = mode === "paper";
  const h          = compact ? 28 : SEG_H;
  const sw         = compact ? 68 : SEG_W;

  return (
    <View style={[s.container, { height: h, width: sw * 2 + 4 }]}>
      {/* Sliding thumb */}
      <Animated.View style={[
        s.thumb,
        {
          width: sw, height: h - 4,
          transform: [{ translateX }],
          backgroundColor: isPaper ? `${C.cyan}18` : `${C.orange}15`,
          borderColor:     isPaper ? `${C.cyan}55` : `${C.orange}45`,
          shadowColor:     isPaper ? C.cyan : C.orange,
        },
      ]} />

      {(["paper", "live"] as const).map(m => (
        <TouchableOpacity
          key={m}
          style={[s.seg, { width: sw + 2 }]}
          onPress={() => onChange(m)}
          activeOpacity={0.8}
        >
          <Text style={[
            s.label,
            { fontSize: compact ? 7 : 8 },
            { color: mode === m ? (m === "paper" ? C.cyan : C.orange) : C.textDim },
            mode === m && { fontFamily: FONTS.monoBold },
          ]}>
            {m === "paper" ? "PAPER AI" : "LIVE AI"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#04111e",
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: "#0f2035",
    overflow: "hidden",
    shadowColor: C.cyan, shadowOpacity: 0.06,
    shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  thumb: {
    position: "absolute", top: 2, borderRadius: RADIUS.sm,
    borderWidth: 1,
    shadowOpacity: 0.18, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  seg:   { alignItems: "center", justifyContent: "center" },
  label: { letterSpacing: 0.8, fontFamily: FONTS.mono },
});
