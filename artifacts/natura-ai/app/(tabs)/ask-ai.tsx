import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { askAI, type AIResponse } from "../../lib/aiWellness";
import { fontSizes, radii, spacing } from "../../constants/theme";

interface Message {
  id: string;
  role: "user" | "ai";
  text?: string;
  response?: AIResponse;
}

const SUGGESTIONS = [
  { text: "How can I sleep better naturally?",    icon: "moon" as const,        color: "#8B7FD4" },
  { text: "Natural ways to reduce stress",         icon: "feather" as const,     color: "#F5A623" },
  { text: "How to boost energy without caffeine",  icon: "zap" as const,         color: "#9FE870" },
  { text: "Herbs for immunity support",            icon: "shield" as const,      color: "#4CAF7D" },
  { text: "Help with digestive discomfort",        icon: "droplet" as const,     color: "#45B7AA" },
];

const AI_FEATURES = [
  "Ask health & wellness questions",
  "Get personalized recommendations",
  "Smart daily guidance",
];

function AIMessage({ response }: { response: AIResponse }) {
  const { colors } = useTheme();
  const sections = [
    { label: "Herbs",        emoji: "🌿", items: response.herbs },
    { label: "Teas",         emoji: "🍵", items: response.teas },
    { label: "Foods",        emoji: "🥗", items: response.foods },
    { label: "Supplements",  emoji: "💊", items: response.supplements },
  ];
  return (
    <View style={[styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.aiBubbleHeader}>
        <View style={[styles.aiAvatar, { backgroundColor: colors.primary + "22" }]}>
          <Feather name="activity" size={12} color={colors.primary} />
        </View>
        <Text style={[styles.aiLabel, { color: colors.primary }]}>Natura AI</Text>
      </View>
      <Text style={[styles.aiWhy, { color: colors.text }]}>{response.whyItHelps}</Text>
      {sections.map(({ label, emoji, items }) =>
        items.length > 0 ? (
          <View key={label} style={[styles.aiSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.aiSectionTitle, { color: colors.textMuted }]}>{emoji} {label}</Text>
            {items.map((item) => (
              <View key={item.name} style={[styles.aiItem, { backgroundColor: colors.primary + "08" }]}>
                <Text style={[styles.aiItemName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.aiItemExp, { color: colors.textDim }]}>{item.explanation}</Text>
                <Text style={[styles.aiItemSafety, { color: colors.textMuted }]}>⚠️ {item.safetyNote}</Text>
              </View>
            ))}
          </View>
        ) : null
      )}
      <Text style={[styles.aiDisclaimer, { color: colors.textMuted }]}>Educational suggestions only — not medical advice</Text>
    </View>
  );
}

export default function AskAIScreen() {
  const { colors } = useTheme();
  const { isPremium, openPaywall } = useSubscription();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now() + "u", role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const response = await askAI(text.trim());
      setMessages((prev) => [...prev, { id: Date.now() + "a", role: "ai", response }]);
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + "e", role: "ai", text: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isPremium) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
        <View style={styles.paywall}>
          <View style={[styles.paywallAvatar, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
            <Feather name="activity" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.paywallTitle, { color: colors.text }]}>🌿 Natura AI Premium</Text>
          <Text style={[styles.paywallSub, { color: colors.textDim }]}>Personalized wellness guidance powered by AI</Text>
          <View style={[styles.paywallFeatures, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {AI_FEATURES.map((f) => (
              <View key={f} style={styles.paywallFeatureRow}>
                <View style={[styles.paywallCheck, { backgroundColor: colors.primary }]}>
                  <Feather name="check" size={10} color="#fff" />
                </View>
                <Text style={[styles.paywallFeatureText, { color: colors.text }]}>{f}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.paywallBtn, { backgroundColor: colors.primary }]}
            onPress={openPaywall}
            activeOpacity={0.85}
          >
            <Text style={styles.paywallBtnText}>Unlock AI</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        <View style={[styles.chatHeader, { borderBottomColor: colors.border }]}>
          <View style={[styles.chatAvatar, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="activity" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.chatCoach, { color: colors.textMuted }]}>AI Wellness Coach</Text>
            <Text style={[styles.chatTitle, { color: colors.text }]}>Natura AI</Text>
          </View>
        </View>

        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: spacing.md, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
          {messages.length === 0 && (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>What would you like support with?</Text>
              <Text style={[styles.emptySub, { color: colors.textDim }]}>Choose a topic or type your own question.</Text>
              {SUGGESTIONS.map(({ text, icon, color }) => (
                <TouchableOpacity
                  key={text}
                  style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => send(text)}
                  activeOpacity={0.75}
                >
                  <Feather name={icon} size={16} color={color} />
                  <Text style={[styles.suggestionText, { color: colors.text }]}>{text}</Text>
                  <Feather name="chevron-right" size={14} color={colors.textDim} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {messages.map((msg) => (
            <View key={msg.id} style={msg.role === "user" ? styles.userMsgWrap : undefined}>
              {msg.role === "user" ? (
                <View style={[styles.userBubble, { backgroundColor: colors.primary }]}>
                  <Text style={styles.userBubbleText}>{msg.text}</Text>
                </View>
              ) : msg.response ? (
                <AIMessage response={msg.response} />
              ) : (
                <View style={[styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.aiWhy, { color: colors.text }]}>{msg.text}</Text>
                </View>
              )}
            </View>
          ))}
          {loading && (
            <View style={[styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about herbs, sleep, stress..."
            placeholderTextColor={colors.textMuted}
            multiline
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: input.trim() && !loading ? colors.primary : colors.border }]}
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
          >
            <Feather name="arrow-up" size={16} color={input.trim() && !loading ? "#0D1F16" : colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Educational suggestions only — not medical advice</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1 },
  paywall:           { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  paywallAvatar:     { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: spacing.lg },
  paywallTitle:      { fontSize: fontSizes.xl, fontFamily: "Inter_700Bold", marginBottom: spacing.sm, textAlign: "center" },
  paywallSub:        { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: spacing.lg },
  paywallFeatures:   { width: "100%", borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.lg },
  paywallFeatureRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  paywallCheck:      { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  paywallFeatureText:{ fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  paywallBtn:        { width: "100%", padding: spacing.md, borderRadius: radii.md, alignItems: "center" },
  paywallBtnText:    { color: "#0D1F16", fontSize: fontSizes.md, fontFamily: "Inter_700Bold" },
  chatHeader:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1 },
  chatAvatar:        { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  chatCoach:         { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  chatTitle:         { fontSize: fontSizes.md, fontFamily: "Inter_700Bold" },
  messages:          { flex: 1 },
  empty:             { alignItems: "center", paddingBottom: spacing.md },
  emptyTitle:        { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginBottom: spacing.sm, textAlign: "center" },
  emptySub:          { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", marginBottom: spacing.lg, textAlign: "center" },
  suggestion:        { width: "100%", flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm },
  suggestionText:    { flex: 1, fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  userMsgWrap:       { alignItems: "flex-end", marginBottom: spacing.sm },
  userBubble:        { maxWidth: "80%", borderRadius: radii.lg, padding: spacing.sm + 4 },
  userBubbleText:    { color: "#0D1F16", fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  aiBubble:          { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  aiBubbleHeader:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  aiAvatar:          { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  aiLabel:           { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  aiWhy:             { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: spacing.sm },
  aiSection:         { borderTopWidth: 1, paddingTop: spacing.sm, marginTop: spacing.sm },
  aiSectionTitle:    { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", marginBottom: spacing.sm },
  aiItem:            { borderRadius: radii.sm, padding: spacing.sm, marginBottom: spacing.sm },
  aiItemName:        { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  aiItemExp:         { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", marginBottom: 2 },
  aiItemSafety:      { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  aiDisclaimer:      { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: spacing.sm, textAlign: "center" },
  inputBar:          { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1 },
  input:             { flex: 1, borderRadius: radii.md, borderWidth: 1, padding: spacing.sm, fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn:           { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  disclaimer:        { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingBottom: Platform.OS === "ios" ? 8 : 12 },
});
