import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { colors } from "../constants/theme";

export default function Index() {
  useEffect(() => {
    router.replace("/(tabs)");
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
