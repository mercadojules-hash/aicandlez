import { router } from "expo-router";
import React from "react";
import {
  ImageBackground,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground
      source={require("@/assets/images/natura-splash-bg.png")}
      style={styles.bg}
      resizeMode="cover"
    >
      <View
        style={[
          styles.footer,
          { paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 28 },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.push("/onboarding/goals")}
          style={styles.button}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>🌿  Begin Your Journey  →</Text>
        </TouchableOpacity>
        <Text style={styles.fine}>Natural wellness, backed by AI</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingTop: 20,
    alignItems: "center",
  },
  button: {
    width: "100%",
    backgroundColor: "#66BB6A",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 14,
  },
  buttonText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  fine: {
    fontSize: 12,
    color: "rgba(245,247,244,0.6)",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
