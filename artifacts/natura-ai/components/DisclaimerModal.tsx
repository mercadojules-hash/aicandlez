import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const useND = Platform.OS !== "web";

const DISCLAIMER_KEY = "natura_disclaimer_v1";

export function DisclaimerModal() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(60)).current;

  useEffect(() => {
    AsyncStorage.getItem(DISCLAIMER_KEY).then((val) => {
      if (val !== "accepted") {
        setVisible(true);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: useND }),
          Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: useND }),
        ]).start();
      }
    });
  }, []);

  const handleAccept = async () => {
    await AsyncStorage.setItem(DISCLAIMER_KEY, "accepted");
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: useND }).start(() =>
      setVisible(false)
    );
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderRadius: 24,
              paddingBottom: Platform.OS === "web" ? 32 : insets.bottom + 24,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.logoRow}>
            <Image
              source={require("@/assets/images/logo.png")}
              style={styles.logo}
              contentFit="contain"
            />
          </View>

          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Welcome to Natura AI
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Your personal wellness companion
          </Text>

          <View style={[styles.card, { backgroundColor: colors.muted, borderRadius: 16, borderColor: colors.border }]}>
            <View style={styles.point}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Natura AI provides <Text style={{ fontFamily: "Inter_600SemiBold" }}>educational wellness suggestions</Text> based on natural remedies and traditional practices.
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.point}>
              <Feather name="alert-triangle" size={16} color={colors.warning} />
              <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                This is <Text style={{ fontFamily: "Inter_600SemiBold" }}>not medical advice</Text>. Always consult a qualified healthcare professional before making health decisions.
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.point}>
              <Feather name="heart" size={16} color="#E05A7A" />
              <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Individual results vary. If you have a medical condition, speak with your doctor first.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleAccept}
            activeOpacity={0.85}
            style={[styles.button, { backgroundColor: colors.primary, borderRadius: 16 }]}
          >
            <Text style={[styles.buttonText, { color: "#fff", fontFamily: "Inter_700Bold" }]}>
              I Understand — Let's Begin
            </Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>

          <Text style={[styles.fine, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            You won't see this again. Shown once for your wellbeing.
          </Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  logoRow: {
    alignItems: "center",
    marginBottom: 16,
  },
  logo: { width: 72, height: 72 },
  title: { fontSize: 24, textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 15, textAlign: "center", marginBottom: 20 },
  card: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
  },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pointText: { fontSize: 14, lineHeight: 21, flex: 1 },
  divider: { height: 1 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 10,
    marginBottom: 14,
  },
  buttonText: { fontSize: 16 },
  fine: { fontSize: 11, textAlign: "center" },
});
