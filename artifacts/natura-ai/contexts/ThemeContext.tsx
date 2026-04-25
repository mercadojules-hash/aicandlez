import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

type ThemeOverride = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: "light" | "dark";
  override: ThemeOverride;
  setOverride: (o: ThemeOverride) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  override: "system",
  setOverride: () => {},
  isDark: false,
});

const THEME_KEY = "natura_theme_override";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [override, setOverrideState] = useState<ThemeOverride>("system");

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
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : override;

  return (
    <ThemeContext.Provider
      value={{
        theme: resolvedTheme,
        override,
        setOverride,
        isDark: resolvedTheme === "dark",
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
