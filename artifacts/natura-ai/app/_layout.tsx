import { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { Animated, View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { UserProvider } from "../contexts/UserContext";
import { NaturaLogo } from "../components/NaturaLogo";

SplashScreen.preventAutoHideAsync();

const MIN_SPLASH_MS = 1800;

function AppSplash({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 14, stiffness: 120, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible && opacity._value === 0) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity }]}>
      <View style={styles.splashBg} />
      <Animated.View style={{ alignItems: "center", transform: [{ scale }] }}>
        <NaturaLogo size={88} showText />
      </Animated.View>
    </Animated.View>
  );
}

function RootStack() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="flow/[id]" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
        <Stack.Screen name="pose/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="breathwork/[id]" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
        <Stack.Screen name="meditation/[id]" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
        <Stack.Screen name="profile" options={{ animation: "slide_from_right" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [minDelayDone, setMinDelayDone] = useState(false);
  const showSplash = !fontsLoaded || !minDelayDone;

  useEffect(() => {
    const t = setTimeout(() => setMinDelayDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <UserProvider>
          {fontsLoaded ? <RootStack /> : null}
          <AppSplash visible={showSplash} />
        </UserProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    pointerEvents: "none",
  },
  splashBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0d1f16",
  },
});
