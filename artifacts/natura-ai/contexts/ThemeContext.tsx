import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

export type ThemeOverride = "system" | "light" | "dark";

export const darkColors = {
  background: "#0d1f16",
  card: "#132a1d",
  cardAlt: "#1a3325",
  cardHover: "#1f3d2c",
  border: "#2a4a38",
  borderLight: "#3a5f4a",
  primary: "#4ead7c",
  primaryDark: "#3a8a60",
  primaryLight: "#6ec99a",
  accent: "#c8a96e",
  accentLight: "#e8c98e",
  accentDark: "#a88a50",
  text: "#f0ebe3",
  textMuted: "#9ab5a4",
  textDim: "#6a8f7a",
  white: "#ffffff",
  success: "#4ead7c",
  error: "#e07070",
  warning: "#e8b96e",
  overlay: "rgba(13,31,22,0.85)",
  root: "#e53935",
  sacral: "#ff7043",
  solarPlexus: "#ffd600",
  heart: "#43a047",
  throat: "#1e88e5",
  thirdEye: "#5e35b1",
  crown: "#8e24aa",
};

export const lightColors = {
  background: "#f0f7f2",
  card: "#ffffff",
  cardAlt: "#e8f2ec",
  cardHover: "#ddeee4",
  border: "#c5ddd0",
  borderLight: "#a8ccb8",
  primary: "#3a9268",
  primaryDark: "#2d7553",
  primaryLight: "#5cb882",
  accent: "#a07840",
  accentLight: "#c09860",
  accentDark: "#806030",
  text: "#0f2219",
  textMuted: "#3a6050",
  textDim: "#6a9080",
  white: "#ffffff",
  success: "#3a9268",
  error: "#c55060",
  warning: "#c09040",
  overlay: "rgba(240,247,242,0.9)",
  root: "#e53935",
  sacral: "#ff7043",
  solarPlexus: "#d4a800",
  heart: "#43a047",
  throat: "#1e88e5",
  thirdEye: "#5e35b1",
  crown: "#8e24aa",
};

export type ColorSet = typeof darkColors;

interface ThemeContextValue {
  theme: "light" | "dark";
  override: ThemeOverride;
  setOverride: (o: ThemeOverride) => void;
  isDark: boolean;
  colors: ColorSet;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  override: "dark",
  setOverride: () => {},
  isDark: true,
  colors: darkColors,
});

const THEME_KEY = "natura_theme_override";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [override, setOverrideState] = useState<ThemeOverride>("dark");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === "light" || val === "dark" || val === "system") {
        setOverrideState(val);
      }
    });
  }, []);

  const setOverride = useCallback(async (o: ThemeOverride) => {
    setOverrideState(o);
    await AsyncStorage.setItem(THEME_KEY, o);
  }, []);

  const resolvedTheme: "light" | "dark" =
    override === "system"
      ? systemScheme === "light"
        ? "light"
        : "dark"
      : override;

  const colors = resolvedTheme === "light" ? lightColors : darkColors;

  return (
    <ThemeContext.Provider
      value={{
        theme: resolvedTheme,
        override,
        setOverride,
        isDark: resolvedTheme === "dark",
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
