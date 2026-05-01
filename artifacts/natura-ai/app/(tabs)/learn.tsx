import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { fontSizes, radii, spacing } from "../../constants/theme";

interface Article {
  id: string;
  title: string;
  category: string;
  readTime: string;
  summary: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  body: string[];
  keyTakeaways: string[];
}

const ARTICLES: Article[] = [
  {
    id: "breathwork",
    title: "5 Natural Ways to Reduce Stress",
    category: "Stress", readTime: "3 min",
    summary: "How conscious breathing and adaptogens shift your body from fight-or-flight to calm.",
    icon: "zap", color: "#F5A623",
    body: [
      "Breathing is the only autonomic function you can consciously control — making it a unique bridge between your voluntary and involuntary nervous systems.",
      "The 4-7-8 technique (inhale 4, hold 7, exhale 8) and box breathing activate the parasympathetic nervous system — your body's 'rest and digest' mode.",
      "Adaptogens like ashwagandha, rhodiola, and holy basil have centuries of traditional use for supporting the HPA axis — the system that regulates your cortisol response.",
    ],
    keyTakeaways: [
      "Extended exhales activate the vagal brake — exhale 2× longer than inhale",
      "Ashwagandha shows significant cortisol reduction in clinical trials",
      "Even 5 minutes of box breathing creates measurable HRV improvement",
    ],
  },
  {
    id: "sleep-hygiene",
    title: "Why Your Sleep Is Broken",
    category: "Sleep", readTime: "4 min",
    summary: "Practical, evidence-informed strategies to improve your sleep quality tonight.",
    icon: "moon", color: "#8B7FD4",
    body: [
      "Sleep hygiene refers to behavioural and environmental practices that promote consistent, high-quality sleep.",
      "Your body has a natural circadian rhythm — a roughly 24-hour internal clock. Disrupting this through inconsistent sleep times or blue light can significantly impair sleep quality.",
      "Research shows that lowering your bedroom temperature to 18°C (65°F) and keeping a consistent wake time are among the highest-impact changes.",
    ],
    keyTakeaways: [
      "Consistent wake times matter more than consistent bedtimes",
      "Blue light from screens delays melatonin production by up to 3 hours",
      "Avoid caffeine after 2 PM for most people",
    ],
  },
  {
    id: "energy-morning",
    title: "Morning Habits for Energy",
    category: "Energy", readTime: "3 min",
    summary: "The first 60 minutes of your day have an outsized effect on your energy all day long.",
    icon: "sun", color: "#9FE870",
    body: [
      "Morning sunlight exposure within 30 minutes of waking triggers cortisol at its natural peak — improving wakefulness.",
      "Delaying caffeine by 90–120 minutes after waking allows adenosine to clear naturally, giving you more sustained energy.",
      "A protein-rich breakfast combined with complex carbohydrates stabilises blood sugar through the morning.",
    ],
    keyTakeaways: [
      "Sunlight within 30 min of waking anchors your circadian rhythm",
      "Delay caffeine 90–120 min after waking for longer-lasting effect",
      "10 min of movement in the morning increases BDNF by up to 200%",
    ],
  },
  {
    id: "gut-health",
    title: "Foods That Help Digestion",
    category: "Digestion", readTime: "4 min",
    summary: "Understanding the gut-brain axis and why your microbiome matters for mood and energy.",
    icon: "heart", color: "#E87D6B",
    body: [
      "The enteric nervous system — the 'second brain' — contains over 100 million nerve cells communicating bidirectionally with your brain via the vagus nerve.",
      "Your gut microbiome produces approximately 90% of your body's serotonin.",
      "Ginger is one of the most well-studied digestive aids — it accelerates gastric emptying and has direct anti-inflammatory effects.",
    ],
    keyTakeaways: [
      "Aim for 30+ different plant foods per week for microbiome diversity",
      "Chronic stress directly damages gut lining integrity",
      "Fermented foods improve microbiome diversity more than supplements",
    ],
  },
  {
    id: "anti-inflammatory",
    title: "How to Strengthen Your Immune System",
    category: "Immunity", readTime: "3 min",
    summary: "Foods and habits that science links to reduced inflammation and stronger immunity.",
    icon: "shield", color: "#4CAF7D",
    body: [
      "Chronic low-grade inflammation is associated with conditions ranging from cardiovascular disease to depression.",
      "The Mediterranean diet consistently shows the strongest anti-inflammatory evidence in large population studies.",
      "Turmeric's curcumin bioavailability increases 2000% when combined with black pepper (piperine).",
    ],
    keyTakeaways: [
      "Ultra-processed foods are among the most pro-inflammatory",
      "Turmeric bioavailability increases 2000% with black pepper",
      "Vitamin D deficiency is linked to impaired immune response",
    ],
  },
  {
    id: "adaptogens",
    title: "What Are Adaptogens?",
    category: "Herbs", readTime: "3 min",
    summary: "How adaptogenic herbs help your body handle stress and build long-term resilience.",
    icon: "feather", color: "#4ead7c",
    body: [
      "Adaptogens are herbs and mushrooms defined by their ability to help the body 'adapt' to physical, chemical, and biological stressors.",
      "Unlike stimulants, adaptogens work in a non-specific way — supporting your body's overall resilience.",
      "Research suggests adaptogens may support the HPA axis by modulating cortisol and other stress hormones.",
    ],
    keyTakeaways: [
      "Adaptogens work best when taken consistently over 4–8 weeks",
      "Not all adaptogens are the same — each has a distinct profile",
      "Consult a healthcare provider before starting any new supplement",
    ],
  },
  {
    id: "mind-body",
    title: "Mind-Body Connection Explained",
    category: "Mindfulness", readTime: "3 min",
    summary: "The science behind how thoughts, emotions, and beliefs physically alter your body.",
    icon: "activity", color: "#9B59B6",
    body: [
      "Psychoneuroimmunology studies the interaction between psychological processes and the nervous and immune systems.",
      "Chronic negative thought patterns activate the sympathetic nervous system, elevating cortisol and suppressing immune function.",
      "Mindfulness meditation and journaling produce epigenetic changes — altering which genes are expressed.",
    ],
    keyTakeaways: [
      "8 weeks of mindfulness training measurably changes brain structure",
      "Social connection is as protective as exercise for longevity",
      "The placebo effect is real and measurable — belief matters",
    ],
  },
];

const CATEGORIES = ["All", "Stress", "Sleep", "Energy", "Digestion", "Immunity", "Herbs", "Mindfulness"];
const QUICK_TIPS = [
  { emoji: "🍋", text: "Drink warm lemon water" },
  { emoji: "☀️", text: "Step outside for sunlight" },
  { emoji: "🌬️", text: "Take 3 deep breaths" },
  { emoji: "🚶", text: "Walk for 10 minutes" },
  { emoji: "💧", text: "Hydrate before coffee" },
];

function ArticleDetail({ article, onClose }: { article: Article; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back button */}
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onClose}>
          <Feather name="arrow-left" size={16} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>Learn & Improve</Text>
        </TouchableOpacity>
        {/* Category header */}
        <View style={[styles.detailHero, { backgroundColor: article.color + "22" }]}>
          <Feather name={article.icon} size={40} color={article.color} />
          <View style={[styles.detailCatPill, { backgroundColor: article.color + "22" }]}>
            <Text style={[styles.detailCat, { color: article.color }]}>{article.category}</Text>
          </View>
          <Text style={[styles.detailTitle, { color: colors.text }]}>{article.title}</Text>
        </View>
        {/* Content */}
        <View style={styles.detailContent}>
          <View style={styles.detailMetaRow}>
            <Feather name="clock" size={12} color={colors.textMuted} />
            <Text style={[styles.detailMetaText, { color: colors.textMuted }]}>{article.readTime} read</Text>
          </View>
          <Text style={[styles.detailSummary, { color: colors.text }]}>{article.summary}</Text>
          {article.body.map((para, i) => (
            <Text key={i} style={[styles.detailPara, { color: colors.textDim }]}>{para}</Text>
          ))}
          <View style={[styles.takeaways, { backgroundColor: article.color + "11", borderColor: article.color + "33" }]}>
            <Text style={[styles.takeawaysTitle, { color: article.color }]}>Key Takeaways</Text>
            {article.keyTakeaways.map((t, i) => (
              <View key={i} style={styles.takeawayRow}>
                <Feather name="check-circle" size={13} color={article.color} />
                <Text style={[styles.takeawayText, { color: colors.textDim }]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function LearnScreen() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Article | null>(null);

  const filtered = filter === "All" ? ARTICLES : ARTICLES.filter((a) => a.category === filter);
  const featured = filtered[0];
  const rest = filtered.slice(1);

  if (selected) return <ArticleDetail article={selected} onClose={() => setSelected(null)} />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Learn & Improve</Text>
          <Text style={[styles.pageSub, { color: colors.textDim }]}>Simple wellness insights for your daily life</Text>
        </View>

        {/* Quick Tips */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Quick Tips Today</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tipsScroll} contentContainerStyle={{ paddingHorizontal: spacing.md }}>
          {QUICK_TIPS.map((tip, i) => (
            <View key={i} style={[styles.tipCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={styles.tipEmoji}>{tip.emoji}</Text>
              <Text style={[styles.tipText, { color: colors.text }]}>{tip.text}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 10 }}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, { backgroundColor: filter === cat ? colors.primary : colors.card, borderColor: filter === cat ? colors.primary : colors.border }]}
              onPress={() => setFilter(cat)}
            >
              <Text style={[styles.filterText, { color: filter === cat ? "#0D1F16" : colors.textMuted }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Articles</Text>

        {/* Featured */}
        {featured && (
          <TouchableOpacity
            style={[styles.featuredCard, { backgroundColor: featured.color + "22", borderColor: featured.color + "44" }]}
            onPress={() => setSelected(featured)}
            activeOpacity={0.85}
          >
            <View style={styles.featuredMeta}>
              <View style={[styles.catPill, { backgroundColor: featured.color + "22" }]}>
                <Text style={[styles.catPillText, { color: featured.color }]}>{featured.category}</Text>
              </View>
              <View style={styles.readTimePill}>
                <Feather name="clock" size={11} color={colors.textMuted} />
                <Text style={[styles.readTimeText, { color: colors.textMuted }]}>{featured.readTime}</Text>
              </View>
            </View>
            <View style={[styles.featuredIcon, { backgroundColor: featured.color + "33" }]}>
              <Feather name={featured.icon} size={32} color={featured.color} />
            </View>
            <Text style={[styles.featuredTitle, { color: colors.text }]}>{featured.title}</Text>
            <Text style={[styles.featuredSummary, { color: colors.textDim }]}>{featured.summary}</Text>
          </TouchableOpacity>
        )}

        {/* Rest */}
        <View style={{ paddingHorizontal: spacing.md }}>
          {rest.map((article) => (
            <TouchableOpacity
              key={article.id}
              style={[styles.articleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setSelected(article)}
              activeOpacity={0.85}
            >
              <View style={[styles.articleIcon, { backgroundColor: article.color + "22" }]}>
                <Feather name={article.icon} size={20} color={article.color} />
              </View>
              <View style={styles.articleBody}>
                <View style={styles.articleMeta}>
                  <View style={[styles.catPill, { backgroundColor: article.color + "22" }]}>
                    <Text style={[styles.catPillText, { color: article.color }]}>{article.category}</Text>
                  </View>
                  <Feather name="clock" size={10} color={colors.textMuted} />
                  <Text style={[styles.readTimeText, { color: colors.textMuted }]}>{article.readTime}</Text>
                </View>
                <Text style={[styles.articleTitle, { color: colors.text }]}>{article.title}</Text>
                <Text style={[styles.articleSummary, { color: colors.textDim }]}>{article.summary}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  scroll:          { flex: 1 },
  header:          { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  pageTitle:       { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold" },
  pageSub:         { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  sectionLabel:    { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 6 },
  tipsScroll:      { flexGrow: 0, marginBottom: spacing.sm },
  tipCard:         { width: 130, borderRadius: radii.md, borderWidth: 1, padding: spacing.sm, marginRight: 10, alignItems: "center", gap: 4 },
  tipEmoji:        { fontSize: 20 },
  tipText:         { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", textAlign: "center" },
  filterScroll:    { flexGrow: 0, marginBottom: spacing.sm },
  filterChip:      { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radii.full, borderWidth: 1, marginRight: 8 },
  filterText:      { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  featuredCard:    { marginHorizontal: spacing.md, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  featuredMeta:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  featuredIcon:    { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: spacing.sm },
  featuredTitle:   { fontSize: fontSizes.lg, fontFamily: "Inter_700Bold", marginBottom: 4, textAlign: "center" },
  featuredSummary: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", lineHeight: 18, textAlign: "center" },
  catPill:         { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  catPillText:     { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  readTimePill:    { flexDirection: "row", alignItems: "center", gap: 3 },
  readTimeText:    { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  articleCard:     { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  articleIcon:     { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  articleBody:     { flex: 1 },
  articleMeta:     { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  articleTitle:    { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  articleSummary:  { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", lineHeight: 16 },
  backBtn:         { flexDirection: "row", alignItems: "center", gap: 6, margin: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, alignSelf: "flex-start" },
  backText:        { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium" },
  detailHero:      { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  detailCatPill:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  detailCat:       { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold" },
  detailTitle:     { fontSize: fontSizes.xl, fontFamily: "Inter_700Bold", textAlign: "center" },
  detailContent:   { padding: spacing.md },
  detailMetaRow:   { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.sm },
  detailMetaText:  { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  detailSummary:   { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", lineHeight: 22, marginBottom: spacing.md },
  detailPara:      { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: spacing.md },
  takeaways:       { borderRadius: radii.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.sm },
  takeawaysTitle:  { fontSize: fontSizes.sm, fontFamily: "Inter_700Bold", marginBottom: spacing.sm },
  takeawayRow:     { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 6 },
  takeawayText:    { flex: 1, fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", lineHeight: 16 },
});
