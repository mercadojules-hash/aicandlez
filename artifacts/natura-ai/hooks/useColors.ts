import colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

export function useColors() {
  const { isDark } = useTheme();
  const palette = isDark ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
