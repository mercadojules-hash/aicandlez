import { useEffect, useRef } from "react";
import { Animated, Platform } from "react-native";

const useND = Platform.OS !== "web";

export function useFadeIn(duration = 400, delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: useND,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        useNativeDriver: useND,
        tension: 80,
        friction: 12,
      }),
    ]).start();
  }, []);

  return { opacity, translateY };
}

export function usePressScale(toScale = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: toScale, useNativeDriver: useND, tension: 200, friction: 10 }).start();

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: useND, tension: 200, friction: 10 }).start();

  return { scale, onPressIn, onPressOut };
}
