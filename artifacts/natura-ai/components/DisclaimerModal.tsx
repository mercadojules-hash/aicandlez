import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const useND = Platform.OS !== "web";

const DISCLAIMER_KEY = "natura_disclaimer_v2";

export function DisclaimerModal() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [agreed, setAgreed] = useState(false);
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
    if (!agreed) return;
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
              paddingBottom: Platform.OS === "web" ? 28 : insets.bottom + 20,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.logoRow}>
            <Image source={require("@/assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Important Health Disclaimer
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Please read before continuing
          </Text>

          <ScrollView
            style={styles.scrollBox}
            showsVerticalScrollIndicator
            persistentScrollbar
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <View style={[styles.card, { backgroundColor: colors.muted, borderRadius: 14, borderColor: colors.border }]}>
              <View style={styles.point}>
                <Feather name="info" size={16} color={colors.primary} />
                <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  Natura AI provides <Text style={{ fontFamily: "Inter_600SemiBold" }}>educational wellness information only</Text> based on natural remedies and traditional practices.
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.point}>
                <Feather name="alert-triangle" size={16} color={colors.warning} />
                <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  This app is <Text style={{ fontFamily: "Inter_600SemiBold" }}>not intended to diagnose, treat, cure, or prevent any disease.</Text> It is not a substitute for professional medical advice.
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.point}>
                <Feather name="user" size={16} color={colors.primary} />
                <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  Always consult a qualified healthcare provider before making changes to your health, diet, or treatment plan.
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.point}>
                <Feather name="phone" size={16} color={colors.destructive} />
                <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>In a medical emergency, call 911 immediately.</Text> Do not rely on this app for emergencies.
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.point}>
                <Feather name="heart" size={16} color="#E05A7A" />
                <Text style={[styles.pointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  Individual results vary. If you have a medical condition, speak with your doctor before using any wellness suggestions.
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Checkbox */}
          <TouchableOpacity
            onPress={() => setAgreed(!agreed)}
            activeOpacity={0.75}
            style={styles.checkboxRow}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: agreed ? colors.primary : colors.border,
                  backgroundColor: agreed ? colors.primary : "transparent",
                  borderRadius: 6,
                },
              ]}
            >
              {agreed && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={[styles.checkboxLabel, { color: colors.foreground, fontFamily: "Inter_500Medium", flex: 1 }]}>
              I understand and agree to these terms
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAccept}
            activeOpacity={agreed ? 0.85 : 1}
            style={[
              styles.button,
              {
                backgroundColor: agreed ? colors.primary : colors.muted,
                borderRadius: 16,
                opacity: agreed ? 1 : 0.6,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: agreed ? "#fff" : colors.mutedForeground, fontFamily: "Inter_700Bold" }]}>
              {agreed ? "Continue →" : "Please agree to continue"}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.fine, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Shown once. You can review the full disclaimer in your Profile settings.
          </Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { paddingTop: 24, paddingHorizontal: 20 },
  logoRow: { alignItems: "center", marginBottom: 14 },
  logo: { width: 60, height: 60 },
  title: { fontSize: 22, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "center", marginBottom: 16 },
  scrollBox: { maxHeight: 280 },
  card: { padding: 14, borderWidth: 1, gap: 12 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pointText: { fontSize: 13, lineHeight: 20, flex: 1 },
  divider: { height: 1 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 },
  checkbox: { width: 22, height: 22, borderWidth: 2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkboxLabel: { fontSize: 14, lineHeight: 20 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, marginBottom: 12 },
  buttonText: { fontSize: 16 },
  fine: { fontSize: 11, textAlign: "center", paddingBottom: 4 },
});
