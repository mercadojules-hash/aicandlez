import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const CONTENT: Record<string, { title: string; body: string[] }> = {
  disclaimer: {
    title: "Medical Disclaimer",
    body: [
      "Last updated: April 2026",
      "Natura AI is designed for informational and wellness purposes only. It does not provide medical advice, diagnosis, or treatment.",
      "Always consult a qualified healthcare provider before making decisions about your health, medications, or treatments.",
      "Never disregard professional medical advice or delay seeking care because of information provided by this app.",
      "If you are experiencing a medical emergency, call 911 or your local emergency number immediately.",
      "By using this app, you acknowledge and agree that Natura AI is not a licensed medical provider and is not responsible for any outcomes related to the use of the information provided.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "Last updated: April 2026",
      "Natura AI respects your privacy and is committed to protecting your personal information.",
      "INFORMATION WE COLLECT\nWe collect information you provide when using the app, including wellness check-in data, preferences, and usage patterns. All data is stored locally on your device.",
      "HOW WE USE YOUR INFORMATION\nYour data is used solely to personalize your wellness experience within the app. We do not sell, share, or transmit your personal data to third parties.",
      "DATA STORAGE\nAll personal wellness data is stored locally on your device using AsyncStorage. We do not maintain external servers that store your personal information.",
      "HEALTH INFORMATION\nNatura AI collects wellness preference data (mood, energy levels) to provide personalized suggestions. This is not medical data and is not shared with healthcare providers.",
      "ANALYTICS\nWe may collect anonymized, aggregated usage statistics to improve the app. This data cannot be used to identify individual users.",
      "CHILDREN'S PRIVACY\nNatura AI is intended for users 13 years of age and older. We do not knowingly collect personal information from children under 13.",
      "CHANGES TO THIS POLICY\nWe may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy in the app.",
      "CONTACT\nFor privacy inquiries, please contact us through the App Store listing.",
    ],
  },
  terms: {
    title: "Terms of Service",
    body: [
      "Last updated: April 2026",
      "By using Natura AI, you agree to these Terms of Service. Please read them carefully.",
      "1. EDUCATIONAL PURPOSE ONLY\nNatura AI provides educational wellness information based on traditional natural remedies and general wellness knowledge. Nothing in this app constitutes medical advice, diagnosis, or treatment.",
      "2. NOT A MEDICAL SERVICE\nNatura AI is not a healthcare provider, medical service, or substitute for professional medical care. Always consult a qualified healthcare professional for medical concerns.",
      "3. ACCURACY OF INFORMATION\nWhile we strive to provide accurate wellness information, we make no guarantees about the completeness or accuracy of suggestions provided. Individual results may vary.",
      "4. USER RESPONSIBILITIES\nYou are responsible for your wellness decisions. Do not use Natura AI to replace professional medical advice, and always consult a doctor before beginning any wellness regimen.",
      "5. SUBSCRIPTION TERMS\nPremium subscriptions are billed monthly. Free trials automatically convert to paid subscriptions unless cancelled before the trial period ends. Refunds are handled according to App Store policies.",
      "6. INTELLECTUAL PROPERTY\nAll content, design, and features of Natura AI are proprietary and protected by applicable intellectual property laws.",
      "7. LIMITATION OF LIABILITY\nNatura AI and its creators are not liable for any health outcomes, decisions, or actions taken based on app content.",
      "8. CHANGES TO TERMS\nWe reserve the right to update these Terms of Service. Continued use of the app after changes constitutes acceptance of the new terms.",
      "9. GOVERNING LAW\nThese terms are governed by applicable law. Any disputes shall be resolved through appropriate legal channels.",
    ],
  },
};

export default function LegalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type: "privacy" | "terms" | "disclaimer" }>();
  const content = CONTENT[type ?? "privacy"];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {content.title}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {content.body.map((paragraph, i) => {
          const isHeading = /^[A-Z0-9\. ]+$/.test(paragraph.split("\n")[0]) && i > 0;
          const parts = paragraph.split("\n");
          return (
            <View key={i} style={styles.paragraph}>
              {parts.map((part, j) => (
                <Text
                  key={j}
                  style={[
                    j === 0 && isHeading
                      ? [styles.sectionHead, { color: colors.foreground, fontFamily: "Inter_700Bold" }]
                      : i === 0
                      ? [styles.dateText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]
                      : [styles.bodyText, { color: colors.foreground, fontFamily: "Inter_400Regular" }],
                  ]}
                >
                  {part}
                </Text>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 17 },
  content: { paddingHorizontal: 24, paddingTop: 24 },
  paragraph: { marginBottom: 20 },
  dateText: { fontSize: 13, fontStyle: "italic", marginBottom: 4 },
  sectionHead: { fontSize: 13, letterSpacing: 0.3, marginBottom: 6 },
  bodyText: { fontSize: 14, lineHeight: 22 },
});
