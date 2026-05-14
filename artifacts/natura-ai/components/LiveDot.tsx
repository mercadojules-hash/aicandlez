import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

export function LiveDot({ color = C.green, size = 8 }: { color?: string; size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1.4, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, scale]);

  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[styles.ring, {
        width: size + 4, height: size + 4, borderRadius: (size + 4) / 2,
        borderColor: color, opacity, transform: [{ scale }],
      }]} />
      <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", borderWidth: 1 },
  dot:  { position: "absolute" },
});
