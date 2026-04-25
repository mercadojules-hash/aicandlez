import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";

const DISCLAIMER_POINTS = [
  {
    title: "Educational Purposes Only",
    body: "All information provided by Natura AI is for educational purposes only. It is not intended to diagnose, treat, cure, or prevent any disease or health condition.",
  },
  {
    title: "Not a Substitute for Medical Advice",
    body: "Always seek the advice of your qualified healthcare provider with any questions you may have regarding a medical condition or health concern.",
  },
  {
    title: "Safe Wording",
    body: "Phrases like 'may support', 'traditionally used for', and 'may help' indicate traditional or anecdotal use, not proven medical outcomes.",
  },
  {
    title: "Supplement & Herb Safety",
    body: "Natural supplements and herbs can interact with medications or have contraindications. Consult your doctor before adding any new supplement.",
  },
  {
    title: "Pregnancy & Medical Conditions",
    body: "If you are pregnant, nursing, or have a pre-existing medical condition, consult your healthcare provider before following any suggestions in this app.",
  },
  {
    title: "Emergency Situations",
    body: "In case of a medical emergency, contact emergency services immediately. Do not rely on this app for emergency situations.",
  },
];

export default function DisclaimerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { updateProfile } = useUser();
  const [accepted, setAccepted] = useState(false);

  const handleAccept = async () => {
    if (!accepted) return;
    await updateProfile({ disclaimerAccepted: true });
    router.push("/onboarding/goals");
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "web" ? 67 : insets.top,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Important Notice
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Please read and accept before continuing
      </Text>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {DISCLAIMER_POINTS.map((point, idx) => (
          <View
            key={idx}
            style={[
              styles.point,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4 },
            ]}
          >
            <Text style={[styles.pointTitle, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {point.title}
            </Text>
            <Text style={[styles.pointBody, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              {point.body}
            </Text>
          </View>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => setAccepted(!accepted)}
          style={styles.checkRow}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: accepted ? colors.primary : "transparent",
                borderColor: accepted ? colors.primary : colors.border,
                borderRadius: 6,
              },
            ]}
          >
            {accepted && <Feather name="check" size={14} color="#fff" />}
          </View>
          <Text style={[styles.checkLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            I have read and agree to the terms above. I understand this app provides educational wellness guidance only.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleAccept}
          style={[
            styles.button,
            {
              backgroundColor: accepted ? colors.primary : colors.muted,
              borderRadius: colors.radius,
            },
          ]}
          activeOpacity={accepted ? 0.85 : 1}
        >
          <Text
            style={[
              styles.buttonText,
              {
                color: accepted ? colors.primaryForeground : colors.mutedForeground,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
          >
            Accept & Continue
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 30,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  scroll: {
    flex: 1,
  },
  point: {
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  pointTitle: {
    fontSize: 14,
    marginBottom: 6,
  },
  pointBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingTop: 12,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkLabel: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  button: {
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 16,
  },
});
