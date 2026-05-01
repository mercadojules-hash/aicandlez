import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageBackground,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// ─── Assets ───────────────────────────────────────────────────────────────────
const BG          = require("../../assets/images/natura-bg-main-v1.webp");
const LOGO        = require("../../assets/images/natura-logo-icon.png");
const AVATAR      = require("../../assets/images/avatar-default.webp");
const IC_FLAME    = require("../../assets/images/icon-flame.webp");
const IC_CLOCK    = require("../../assets/images/icon-clock.webp");
const IC_CHECK    = require("../../assets/images/icon-check.webp");
const IC_STAR     = require("../../assets/images/icon-star.webp");
const IC_LEAF     = require("../../assets/images/icon-leaf.webp");
const IC_LOTUS    = require("../../assets/images/icon-lotus.webp");
const IC_LIGHTNING= require("../../assets/images/icon-lightning.webp");
const IC_BOWL     = require("../../assets/images/icon-bowl.webp");
const IC_CHEVRON  = require("../../assets/images/icon-chevron.webp");

// ─── Constants ────────────────────────────────────────────────────────────────
const W = Dimensions.get("window").width;

const NEON   = "#a8e063";
const WHITE  = "#ffffff";
const DIM    = "rgba(255,255,255,0.5)";
const CARD   = "rgba(8,22,13,0.82)";
const BORDER = "rgba(100,200,80,0.22)";

// ─── Task data ────────────────────────────────────────────────────────────────
const TASKS = [
  { id: "t1", time: "7:00 AM",  label: "Warm lemon water",    subtitle: "Morning · 7:00 AM",   icon: IC_LEAF      },
  { id: "t2", time: "7:15 AM",  label: "5-minute breathing",  subtitle: "Morning · 7:15 AM",   icon: IC_LOTUS     },
  { id: "t3", time: "7:30 AM",  label: "Morning stretch",     subtitle: "Morning · 7:30 AM",   icon: IC_LIGHTNING },
  { id: "t4", time: "3:00 PM",  label: "Herbal tea break",    subtitle: "Afternoon · 3:00 PM", icon: IC_BOWL      },
  { id: "t5", time: "4:00 PM",  label: "Mindful walk",        subtitle: "Afternoon · 4:00 PM", icon: IC_LIGHTNING },
  { id: "t6", time: "9:00 PM",  label: "Digital sunset",      subtitle: "Evening · 9:00 PM",   icon: IC_LOTUS     },
  { id: "t7", time: "9:30 PM",  label: "Evening wind-down tea", subtitle: "Evening · 9:30 PM", icon: IC_LEAF      },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
interface StatItemProps { icon: ReturnType<typeof require>; value: string; label: string; }
function StatItem({ icon, value, label }: StatItemProps) {
  return (
    <View style={s.statItem}>
      <Image source={icon} style={s.statIcon} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

interface TaskRowProps {
  time: string;
  label: string;
  subtitle: string;
  icon: ReturnType<typeof require>;
  isLast: boolean;
}
function TaskRow({ time, label, subtitle, icon, isLast }: TaskRowProps) {
  return (
    <View style={s.tlRow}>
      {/* Left: time + dot + line */}
      <View style={s.tlLeft}>
        <Text style={s.tlTime}>{time}</Text>
        <View style={s.tlDot} />
        {!isLast && <View style={s.tlLine} />}
      </View>

      {/* Right: card */}
      <TouchableOpacity style={s.tlCard} activeOpacity={0.75}>
        <Image source={icon} style={s.tlIcon} />
        <View style={s.tlInfo}>
          <Text style={s.tlLabel}>{label}</Text>
          <Text style={s.tlSub}>{subtitle}</Text>
        </View>
        <Image source={IC_CHEVRON} style={s.tlChevron} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const total    = TASKS.length;

  return (
    <ImageBackground source={BG} style={s.bg} resizeMode="cover">
      {/* Overlay to darken the top for legibility */}
      <View style={s.overlay} pointerEvents="none" />

      <SafeAreaView style={s.safe} edges={["top"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
        >

          {/* ── HEADER ── */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Image source={LOGO} style={s.logo} />
              <View>
                <Text style={s.brandName}>NATURA AI</Text>
                <Text style={s.brandSub}>AI Wellness Coach</Text>
              </View>
            </View>
            <Image source={AVATAR} style={s.avatar} />
          </View>

          {/* ── HERO ── */}
          <View style={s.hero}>
            <Text style={s.greeting}>{greeting}, Jules</Text>
            <Text style={s.heroTitle}>Today's Plan for You</Text>
            <Text style={s.heroSub}>Personalized steps for your{"\n"}mind, body and energy</Text>
            <View style={s.energyBadge}>
              <Image source={IC_LEAF} style={s.energyIcon} />
              <Text style={s.energyText}>Energy: Good</Text>
            </View>
          </View>

          {/* ── STATS CARD ── */}
          <View style={s.statsCard}>
            <StatItem icon={IC_FLAME} value="5" label="day streak"  />
            <StatItem icon={IC_CLOCK} value="32"                 label="min today"   />
            <StatItem icon={IC_CHECK} value="0"                  label="sessions"    />
            <StatItem icon={IC_STAR}  value="60"                 label="score"       />
          </View>

          {/* ── TODAY'S PLAN ── */}
          <View style={s.planSection}>
            <View style={s.planHeader}>
              <Text style={s.planTitle}>Today's Plan</Text>
              <Text style={s.planMeta}>0/{total} done</Text>
            </View>
            {/* Divider */}
            <View style={s.divider} />

            {/* Timeline */}
            {TASKS.map((task, idx) => (
              <TaskRow
                key={task.id}
                time={task.time}
                label={task.label}
                subtitle={task.subtitle}
                icon={task.icon}
                isLast={idx === TASKS.length - 1}
              />
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Root
  bg:           { flex: 1, backgroundColor: "#04100a" },
  overlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,8,4,0.38)" },
  safe:         { flex: 1 },
  scroll:       { paddingHorizontal: 20, paddingTop: 8 },

  // Header
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  headerLeft:   { flexDirection: "row", alignItems: "center", gap: 10 },
  logo:         { width: 36, height: 36, borderRadius: 18 },
  brandName:    { color: WHITE, fontSize: 13, fontWeight: "700", letterSpacing: 1.5 },
  brandSub:     { color: DIM,   fontSize: 11, fontWeight: "400" },
  avatar:       { width: 48, height: 48, borderRadius: 24 },

  // Hero
  hero:         { marginBottom: 22 },
  greeting:     { color: NEON,  fontSize: 15, fontWeight: "600", marginBottom: 4 },
  heroTitle:    { color: WHITE, fontSize: 30, fontWeight: "800", lineHeight: 36, marginBottom: 6 },
  heroSub:      { color: DIM,   fontSize: 14, fontWeight: "400", lineHeight: 20, marginBottom: 16 },
  energyBadge:  { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1.5, borderColor: NEON, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  energyIcon:   { width: 16, height: 16 },
  energyText:   { color: NEON, fontSize: 13, fontWeight: "600" },

  // Stats card
  statsCard:    { flexDirection: "row", justifyContent: "space-around", alignItems: "center", backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER, paddingVertical: 18, paddingHorizontal: 10, marginBottom: 28, ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10 }, android: { elevation: 8 } }) },
  statItem:     { alignItems: "center", gap: 5 },
  statIcon:     { width: 44, height: 44 },
  statValue:    { color: WHITE, fontSize: 22, fontWeight: "800" },
  statLabel:    { color: DIM,   fontSize: 11, fontWeight: "400" },

  // Plan section
  planSection:  { },
  planHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  planTitle:    { color: WHITE, fontSize: 20, fontWeight: "700" },
  planMeta:     { color: NEON,  fontSize: 13, fontWeight: "600" },
  divider:      { height: 1.5, backgroundColor: NEON, opacity: 0.45, marginBottom: 16 },

  // Timeline
  tlRow:        { flexDirection: "row", alignItems: "flex-start", marginBottom: 0 },
  tlLeft:       { width: 62, alignItems: "center", paddingTop: 17 },
  tlTime:       { color: DIM, fontSize: 10, fontWeight: "500", marginBottom: 5, textAlign: "center", width: 54 },
  tlDot:        { width: 9, height: 9, borderRadius: 5, backgroundColor: NEON, shadowColor: NEON, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 5, elevation: 4 },
  tlLine:       { width: 1.5, flex: 1, minHeight: 56, backgroundColor: "rgba(130,200,80,0.3)", marginTop: 3 },

  tlCard:       { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingVertical: 10, paddingHorizontal: 12, gap: 10, marginBottom: 8, marginLeft: 6 },
  tlIcon:       { width: 40, height: 40, borderRadius: 20 },
  tlInfo:       { flex: 1 },
  tlLabel:      { color: WHITE, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  tlSub:        { color: DIM,   fontSize: 11, fontWeight: "400" },
  tlChevron:    { width: 18, height: 18, opacity: 0.75 },
});
