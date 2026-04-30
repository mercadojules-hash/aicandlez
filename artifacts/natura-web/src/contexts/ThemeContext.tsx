import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "auto";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolvedTheme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  setMode: () => {},
  resolvedTheme: "dark",
});

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem("natura_theme") as ThemeMode) || "dark";
    } catch {
      return "dark";
    }
  });

  const resolvedTheme: "dark" | "light" =
    mode === "auto" ? (systemPrefersDark() ? "dark" : "light") : mode;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem("natura_theme", m);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
