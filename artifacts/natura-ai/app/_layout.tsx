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
import { Animated, View, StyleSheet, Image } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { UserProvider } from "../contexts/UserContext";

// ─── Keep native splash visible until we're ready ────────────────────────────
SplashScreen.preventAutoHideAsync();

const MIN_SPLASH_MS = 2000;
const LOGO_URL = "https://apexdigital.design/wp-content/uploads/2026/04/natura-logo-clean.png";

// Preload branded logo so it shows instantly with no flicker
Image.prefetch(LOGO_URL).catch(() => {});

// ─── In-app splash overlay ────────────────────────────────────────────────────
// Shown after the native OS splash hides — provides a seamless handoff.
// Fades out once fonts + min delay are done.

function AppSplash({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale   = useRef(new Animated.Value(0.90)).current;
  const [mounted, setMounted] = useState(true);

  // Subtle entrance spring
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 18,
      stiffness: 140,
      useNativeDriver: true,
    }).start();
  }, []);

  // Smooth fade-out once ready
  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity }]}>
      <View style={styles.splashBg} />
      <Animated.View style={{ alignItems: "center", transform: [{ scale }] }}>
        <Image
          source={{ uri: LOGO_URL }}
          style={styles.logoImg}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Navigation stack ─────────────────────────────────────────────────────────

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

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [minDelayDone, setMinDelayDone] = useState(false);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  // Minimum time the splash must stay visible (premium feel)
  useEffect(() => {
    const t = setTimeout(() => setMinDelayDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // Only hide native splash when BOTH fonts AND min delay are ready.
  // This prevents a flash where the app appears before it's styled.
  useEffect(() => {
    if (fontsLoaded && minDelayDone && !nativeSplashHidden) {
      SplashScreen.hideAsync()
        .then(() => setNativeSplashHidden(true))
        .catch(() => setNativeSplashHidden(true));
    }
  }, [fontsLoaded, minDelayDone, nativeSplashHidden]);

  // In-app splash stays visible until native splash has been hidden
  const showInAppSplash = !nativeSplashHidden;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <UserProvider>
          {/* Render the app early so it's ready when splash hides */}
          {fontsLoaded ? <RootStack /> : null}
          {/* Seamless branded overlay — fades out after native splash hides */}
          <AppSplash visible={showInAppSplash} />
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
    backgroundColor: "#0B2E1F",
  },
  logoImg: {
    width: 180,
    height: 180,
  },
});
