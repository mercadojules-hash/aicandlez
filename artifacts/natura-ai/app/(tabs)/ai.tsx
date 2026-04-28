import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  suggestions?: { label: string; route: string }[];
}

interface AIResponse {
  text: string;
  suggestions?: { label: string; route: string }[];
}

function getAIResponse(input: string): AIResponse {
  const lower = input.toLowerCase();

  if (lower.match(/stress|stressed|overwhelm|tense|pressure|anxious about work/)) {
    return {
      text:
        "I hear you — stress has a way of accumulating in the body, especially in the shoulders, hips, and jaw. I have two recommendations for you right now:\n\n1. **Stress Relief Flow** — a 20-minute yoga sequence designed specifically to dissolve physical tension and calm your nervous system.\n\n2. **Box Breathing** — used by Navy SEALs to instantly lower stress. Just 4 minutes can shift your nervous system from fight-or-flight to rest-and-digest.\n\nWould you like to start with movement or breath?",
      suggestions: [
        { label: "Stress Relief Flow", route: "/flow/stress-relief" },
        { label: "Box Breathing", route: "/breathwork/box-breathing" },
      ],
    };
  }

  if (lower.match(/tired|exhaust|fatigue|no energy|drained|sluggish/)) {
    return {
      text:
        "Tiredness can be physical, mental, or energetic — and yoga addresses all three. I suggest the **Morning Energy Flow**, which gently awakens your spine and body without depleting you further.\n\nIf it's deeper rest you need, your **Sleep Wind Down** flow and **4-7-8 Breathing** will help you recover through quality rest tonight.\n\nWhat kind of tired are you feeling — is this mental or physical?",
      suggestions: [
        { label: "Morning Energy Flow", route: "/flow/morning-energy" },
        { label: "Sleep Wind Down", route: "/flow/sleep-wind-down" },
        { label: "4-7-8 Breathing", route: "/breathwork/478-breathing" },
      ],
    };
  }

  if (lower.match(/anxious|anxiety|worry|panic|overthink|nervous/)) {
    return {
      text:
        "Anxiety lives in the body as much as the mind. The fastest way to interrupt it is through the breath — I recommend starting with **Calm Breathing** (just 3–4 minutes), which activates your vagus nerve and signals safety to your nervous system.\n\nFor the heart-centred energy that anxiety disrupts, opening your **Heart Chakra** through gentle backbends and the Heart Chakra practices can also be deeply soothing.\n\nYou are safe. This feeling will pass.",
      suggestions: [
        { label: "Calm Breathing", route: "/breathwork/calm-breathing" },
        { label: "Heart Chakra", route: "/(tabs)/chakras" },
        { label: "Stress Relief Flow", route: "/flow/stress-relief" },
      ],
    };
  }

  if (lower.match(/sleep|insomnia|can't sleep|restless|wake up|lying awake/)) {
    return {
      text:
        "Sleep struggles are often the body's way of saying it hasn't fully transitioned out of 'doing' mode. Here is your pre-sleep protocol:\n\n1. **Sleep Wind Down** yoga flow — 12 minutes of deeply restorative poses\n2. **4-7-8 Breathing** — clinically shown to induce sleep within minutes\n3. **Sleep Journey Meditation** — guided visualisation to quiet the mind\n\nDim your lights, put your phone down after this, and trust the process.",
      suggestions: [
        { label: "Sleep Wind Down", route: "/flow/sleep-wind-down" },
        { label: "4-7-8 Breathing", route: "/breathwork/478-breathing" },
      ],
    };
  }

  if (lower.match(/sad|depress|low mood|unmotivated|down|hopeless|grief/)) {
    return {
      text:
        "Thank you for sharing that with me. Low moods often coincide with a closed or blocked Heart Chakra, and movement has been shown to meaningfully shift emotional states.\n\nI gently recommend the **Morning Energy Flow** — not because mornings are magical, but because movement creates momentum. Even 10 minutes can begin to lift the heaviness.\n\nBe patient with yourself. You don't need to feel better immediately — you just need to move a little.",
      suggestions: [
        { label: "Morning Energy Flow", route: "/flow/morning-energy" },
        { label: "Heart Chakra", route: "/(tabs)/chakras" },
        { label: "Stress Release Meditation", route: "/(tabs)/breathe" },
      ],
    };
  }

  if (lower.match(/back pain|back ache|lower back|spine|posture/)) {
    return {
      text:
        "Back pain is extremely common and yoga is one of the most evidence-backed approaches for relief. The root cause is usually a combination of tight hip flexors, weak core, and poor spinal mobility — all of which yoga addresses.\n\nYour best starting point is the **Stress Relief Flow**, which includes deep hip openers and spinal release poses. Pair it with Cat-Cow movements from the **Morning Energy Flow**.\n\nAlso explore your **Root Chakra** — it governs the base of the spine and physical stability.",
      suggestions: [
        { label: "Stress Relief Flow", route: "/flow/stress-relief" },
        { label: "Morning Energy Flow", route: "/flow/morning-energy" },
      ],
    };
  }

  if (lower.match(/focus|concentrate|distract|clarity|brain fog|productive/)) {
    return {
      text:
        "Mental clarity is deeply connected to breath and your Third Eye Chakra. When the mind feels scattered, the fastest reset is **Box Breathing** — it synchronises the two hemispheres of the brain and sharpens concentration within 3–5 cycles.\n\nFor deeper and longer-lasting focus, the **Morning Energy Flow** sets a grounded, intentional tone that carries through the day.",
      suggestions: [
        { label: "Box Breathing", route: "/breathwork/box-breathing" },
        { label: "Morning Energy Flow", route: "/flow/morning-energy" },
        { label: "Third Eye Chakra", route: "/(tabs)/chakras" },
      ],
    };
  }

  if (lower.match(/good|great|amazing|wonderful|happy|energised|excited/)) {
    return {
      text:
        "That's wonderful to hear! When you're in a high-energy, positive state, it's a perfect time to deepen your practice rather than just maintain it.\n\nI'd suggest channelling that energy into the **Morning Energy Flow** to build strength and presence, or exploring your **Crown Chakra** for spiritual expansion. You're in the ideal state for meditation today.",
      suggestions: [
        { label: "Morning Energy Flow", route: "/flow/morning-energy" },
        { label: "Crown Chakra", route: "/(tabs)/chakras" },
      ],
    };
  }

  return {
    text:
      "Thank you for sharing. To give you the most helpful guidance, I'd love to know a little more about how you're feeling. Try describing what's going on in your body or mind — for example, \"I feel stressed\", \"I'm tired\", \"I can't sleep\", or \"I need focus.\"\n\nOr if you'd prefer, you can browse the practices below and trust your intuition to guide you to what you need.",
    suggestions: [
      { label: "Yoga Flows", route: "/(tabs)/flows" },
      { label: "Breathwork", route: "/(tabs)/breathe" },
      { label: "Chakras", route: "/(tabs)/chakras" },
    ],
  };
}

const quickPrompts = [
  "I feel stressed",
  "I can't sleep",
  "I feel anxious",
  "I need more energy",
  "I need focus",
];

export default function AIScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "ai",
      text: "Welcome. I'm your Natura Yoga AI coach.\n\nHow are you feeling today? Describe what's going on in your body or mind and I'll guide you to exactly the right practice.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", text: msg };
    const aiResp = getAIResponse(msg);
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "ai",
      text: aiResp.text,
      suggestions: aiResp.suggestions,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderText = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <Text key={i} style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>
          {part}
        </Text>
      ) : (
        <Text key={i}>{part}</Text>
      )
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.aiAvatar}>
          <Feather name="message-circle" size={20} color={colors.primary} />
        </View>
        <View>
          <Text style={styles.headerTitle}>AI Wellness Coach</Text>
          <Text style={styles.headerSub}>Powered by Natura AI</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {messages.map((m) => (
            <View key={m.id} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}>
              {m.role === "ai" && (
                <Text style={styles.aiText}>{renderText(m.text)}</Text>
              )}
              {m.role === "user" && (
                <Text style={styles.userText}>{m.text}</Text>
              )}
              {m.role === "ai" && m.suggestions && (
                <View style={styles.suggestions}>
                  {m.suggestions.map((s) => (
                    <TouchableOpacity
                      key={s.label}
                      style={styles.suggChip}
                      onPress={() => router.push(s.route as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.suggText}>{s.label}</Text>
                      <Feather name="arrow-right" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Quick prompts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {quickPrompts.map((p) => (
            <TouchableOpacity key={p} style={styles.quickChip} onPress={() => sendMessage(p)}>
              <Text style={styles.quickChipText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="How are you feeling?"
            placeholderTextColor={colors.textDim}
            multiline
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim()}
          >
            <Feather name="send" size={18} color={input.trim() ? "#fff" : colors.textDim} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  aiAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  headerTitle: {
    fontSize: fontSizes.md,
    fontFamily: "Inter_600SemiBold",
    color: colors.text,
  },
  headerSub: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
    marginTop: 2,
  },
  messages: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  bubble: {
    maxWidth: "90%",
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  aiBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  userBubble: {
    backgroundColor: colors.primary + "25",
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  aiText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
    lineHeight: 22,
  },
  userText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_500Medium",
    color: colors.text,
    lineHeight: 20,
  },
  suggestions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.primary + "40",
  },
  suggText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    color: colors.primary,
  },
  quickRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 8,
  },
  quickChip: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_500Medium",
    color: colors.textMuted,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 100,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
