import { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts, Inter_400Regular, Inter_500Medium,
  Inter_600SemiBold, Inter_700Bold,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { Animated, View, Text, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TradingProvider } from "@/contexts/TradingContext";
import { C } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
});

// ── Brand Splash ───────────────────────────────────────────────────────────────

function BrandSplash({ visible }: { visible: boolean }) {
  const opacity   = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale,   { toValue: 1, damping: 16, stiffness: 120, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [logoScale, logoOpacity]);

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, { toValue: 0, duration: 600, delay: 200, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible, opacity]);

  if (!mounted) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity, pointerEvents: "none" }]}>
      <View style={StyleSheet.absoluteFill} />
      {/* Glow rings */}
      <View style={styles.glowOuter} />
      <View style={styles.glowInner} />
      <Animated.View style={{ alignItems: "center", transform: [{ scale: logoScale }], opacity: logoOpacity }}>
        <Text style={styles.splashLogo}>AC</Text>
        <Text style={styles.splashSub}>AI TRADER</Text>
        <View style={styles.splashDivider} />
        <Text style={styles.splashTag}>INSTITUTIONAL CRYPTO INTELLIGENCE</Text>
      </Animated.View>
    </Animated.View>
  );
}

// ── Root Layout ───────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);

  useEffect(() => {
    if ((fontsLoaded || fontError) && !nativeSplashHidden) {
      SplashScreen.hideAsync()
        .then(() => setNativeSplashHidden(true))
        .catch(() => setNativeSplashHidden(true));
    }
  }, [fontsLoaded, fontError, nativeSplashHidden]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <TradingProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: "fade" }}>
              <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
            </Stack>
            <BrandSplash visible={!nativeSplashHidden} />
          </TradingProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    backgroundColor: "#000000",
    alignItems: "center", justifyContent: "center",
    zIndex: 9999,
  },
  glowOuter: {
    position: "absolute", width: 300, height: 300,
    borderRadius: 150, backgroundColor: "#00aaff08",
  },
  glowInner: {
    position: "absolute", width: 180, height: 180,
    borderRadius: 90, backgroundColor: "#00aaff10",
  },
  splashLogo: {
    fontSize: 52, fontFamily: "Inter_700Bold",
    color: "#00aaff", letterSpacing: 18,
    textShadow: "0 0 24px #00aaff",
  },
  splashSub: {
    fontSize: 14, fontFamily: "Inter_600SemiBold",
    color: "#EAF2FF", letterSpacing: 12, marginTop: 4,
  },
  splashDivider: {
    width: 80, height: 1, backgroundColor: "#00aaff40", marginVertical: 16,
  },
  splashTag: {
    fontSize: 8, fontFamily: "Inter_500Medium",
    color: "#4a6a80", letterSpacing: 2.5,
  },
});
