import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

interface NaturaLogoProps {
  size?: number;
  showText?: boolean;
}

export function NaturaLogo({ size = 56, showText = false }: NaturaLogoProps) {
  const iconSize = Math.round(size * 0.42);
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View
        style={[
          styles.outerRing,
          {
            width: size + 4,
            height: size + 4,
            borderRadius: (size + 4) / 2,
          },
        ]}
      >
        <LinearGradient
          colors={["#2d6e50", "#4ead7c", "#74d4a8"]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[styles.grad, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <Feather name="feather" size={iconSize} color="#fff" />
        </LinearGradient>
      </View>
      {showText && (
        <>
          <Text style={styles.name}>Natura Yoga AI</Text>
          <Text style={styles.tagline}>Find your balance through movement and breath</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(78,173,124,0.4)",
  },
  grad: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4ead7c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  name: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#f0ebe3",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  tagline: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#9ab5a4",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
});
