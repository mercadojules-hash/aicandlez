import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTrading, fmt$, fmtPct } from "@/contexts/TradingContext";
import { NeonCard } from "@/components/NeonCard";
import { LiveDot } from "@/components/LiveDot";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ initials, size = 64 }: { initials: string; size?: number }) {
  return (
    <View style={[av.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]}>
      <View style={[av.inner, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[av.text, { fontSize: size * 0.36 }]}>{initials}</Text>
      </View>
      <View style={av.dot}>
        <LiveDot color={C.green} size={8} />
      </View>
    </View>
  );
}
const av = StyleSheet.create({
  ring:  { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: `${C.cyan}50`, shadowColor: C.cyan, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  inner: { alignItems: "center", justifyContent: "center", backgroundColor: `${C.cyan}18` },
  text:  { fontFamily: FONTS.monoBold, color: C.cyan },
  dot:   { position: "absolute", bottom: 0, right: 0 },
});

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = C.textPrimary }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={sc.card}>
      <Text style={[sc.value, { color }]}>{value}</Text>
      {sub && <Text style={[sc.sub, { color }]}>{sub}</Text>}
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { flex: 1, alignItems: "center", paddingVertical: 14, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border },
  value: { fontSize: 18, fontFamily: FONTS.monoBold, letterSpacing: 0.5 },
  sub:   { fontSize: 8,  fontFamily: FONTS.mono, marginTop: 1 },
  label: { fontSize: 7,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 0.8, marginTop: 3 },
});

// ── Setting Row ───────────────────────────────────────────────────────────────

function SettingRow({ icon, label, value, onPress, danger = false, right }: {
  icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean; right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={sr.row} activeOpacity={0.7}>
      <View style={[sr.icon, { backgroundColor: `${danger ? C.red : C.cyan}12` }]}>
        <Feather name={icon as any} size={14} color={danger ? C.red : C.cyan} />
      </View>
      <Text style={[sr.label, { color: danger ? C.red : C.textPrimary }]}>{label}</Text>
      {right ? right : (
        <>
          {value && <Text style={sr.value}>{value}</Text>}
          <Feather name="chevron-right" size={14} color={C.textDim} />
        </>
      )}
    </TouchableOpacity>
  );
}
const sr = StyleSheet.create({
  row:   { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  icon:  { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 13, fontFamily: FONTS.monoMedium },
  value: { fontSize: 11, fontFamily: FONTS.mono, color: C.textMuted, marginRight: 6 },
});

// ── Exchange Badge ────────────────────────────────────────────────────────────

const EX_COLORS: Record<string, string> = {
  kraken: "#5741d9", binance: "#f0b90b", coinbase: "#2775ca",
  bybit:  "#f7a600", okx:     "#b0b0b0", kucoin:   "#24ae8f",
};
function ExchangeBadge({ name, isDefault = false }: { name: string; isDefault?: boolean }) {
  const color = EX_COLORS[name.toLowerCase()] ?? C.cyan;
  return (
    <View style={[eb.badge, { borderColor: `${color}35`, backgroundColor: `${color}10` }]}>
      <View style={[eb.dot, { backgroundColor: color }]} />
      <Text style={[eb.name, { color }]}>{name.toUpperCase()}</Text>
      {isDefault && <Text style={eb.def}>DEFAULT</Text>}
    </View>
  );
}
const eb = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.md, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  name:  { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
  def:   { fontSize: 7, fontFamily: FONTS.monoBold, color: C.green, marginLeft: 4, borderWidth: 1, borderColor: `${C.green}30`, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
});

// ── Operator Admin Panel ──────────────────────────────────────────────────────

function AdminPanel() {
  const [expanded, setExpanded] = useState(false);
  const metrics = [
    { label: "ACTIVE USERS",  value: "1,248",  color: C.cyan   },
    { label: "LIVE USERS",    value: "312",    color: C.green  },
    { label: "FEES 24H",      value: "$4,820", color: C.orange },
    { label: "TOTAL VOLUME",  value: "$2.4M",  color: C.purple },
    { label: "PLATFORM TRADES",value:"18,294", color: C.textPrimary },
    { label: "AVG WIN RATE",  value: "61.4%",  color: C.green  },
    { label: "CONNECTED EXS", value: "3,821",  color: C.cyan   },
    { label: "AI UPTIME",     value: "99.97%", color: C.green  },
  ];
  return (
    <View style={ad.card}>
      <TouchableOpacity style={ad.header} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="shield" size={14} color={C.purple} />
          <Text style={ad.title}>OPERATOR CONSOLE</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={ad.badge}><Text style={ad.badgeText}>ADMIN</Text></View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.textMuted} />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={ad.grid}>
          {metrics.map(m => (
            <View key={m.label} style={ad.item}>
              <Text style={[ad.val, { color: m.color }]}>{m.value}</Text>
              <Text style={ad.lbl}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
const ad = StyleSheet.create({
  card:  { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${C.purple}30`, marginBottom: 14, overflow: "hidden" },
  header:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  title: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.purple, letterSpacing: 1.5 },
  badge: { backgroundColor: `${C.purple}15`, borderRadius: 4, borderWidth: 1, borderColor: `${C.purple}35`, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 7, fontFamily: FONTS.monoBold, color: C.purple, letterSpacing: 0.8 },
  grid:  { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderTopColor: C.border, padding: 8 },
  item:  { width: "50%", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  val:   { fontSize: 16, fontFamily: FONTS.monoBold },
  lbl:   { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8, marginTop: 2 },
});

// ── Profile Screen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { account, trades, engine } = useTrading();
  const insets = useSafeAreaInsets();
  const isWeb  = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top + 10;

  const closed     = trades.filter(t => t.pnl != null);
  const wins       = closed.filter(t => t.pnl > 0);
  const winRate    = closed.length ? (wins.length / closed.length) * 100 : account.winRate;
  const totalPnL   = closed.reduce((s, t) => s + t.pnl, 0);

  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Sign Out", "You'll need to sign in again to access your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => {} },
    ]);
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.scroll, { paddingTop: topPad, paddingBottom: TAB_BAR_H + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile Header ── */}
      <View style={s.profileHeader}>
        <Avatar initials="AT" size={64} />
        <View style={s.profileInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.name}>Apex Trader</Text>
            <View style={s.proBadge}><Text style={s.proText}>PRO</Text></View>
          </View>
          <Text style={s.email}>trader@apexai.com</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
            <Text style={s.since}>Member since Jan 2025</Text>
          </View>
        </View>
      </View>

      {/* ── Stats ── */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
        <StatCard label="EQUITY"   value={fmt$(account.equity, 0)}                                     color={C.textPrimary} />
        <StatCard label="REALIZED" value={totalPnL >= 0 ? `+${fmt$(totalPnL)}` : fmt$(totalPnL)}      color={totalPnL >= 0 ? C.green : C.red} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
        <StatCard label="WIN RATE" value={`${winRate.toFixed(1)}%`} sub={`${wins.length}W / ${closed.length - wins.length}L`} color={winRate >= 55 ? C.green : C.orange} />
        <StatCard label="FEES PAID" value={fmt$(account.totalFeesPaid)}                               color={C.orange} />
      </View>

      {/* ── AI Configuration ── */}
      <View style={s.sectionLabel}>
        <View style={{ width: 2, height: 12, backgroundColor: C.purple, borderRadius: 1, marginRight: 8 }} />
        <Text style={s.sectionText}>AI CONFIGURATION</Text>
      </View>
      <NeonCard accent={C.purple} style={{ marginBottom: 14 }}>
        <SettingRow icon="cpu"         label="AI Personality"   value="Balanced" />
        <SettingRow icon="shield"      label="Risk Profile"      value="Moderate" />
        <SettingRow icon="sliders"     label="Min Confidence"    value="60%" />
        <SettingRow icon="toggle-right" label="Auto Mode"        value={engine?.running ? "ON" : "OFF"} />
        <SettingRow icon="percent"     label="Position Size"     value="0.01%" />
        <SettingRow icon="trending-down" label="Stop Loss"       value="2%" />
        <SettingRow icon="trending-up" label="Take Profit"       value="4%" />
      </NeonCard>

      {/* ── Exchange Connections ── */}
      <View style={s.sectionLabel}>
        <View style={{ width: 2, height: 12, backgroundColor: C.cyan, borderRadius: 1, marginRight: 8 }} />
        <Text style={s.sectionText}>EXCHANGE CONNECTIONS</Text>
      </View>
      <View style={[s.card, { marginBottom: 14 }]}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", paddingVertical: 6 }}>
          <ExchangeBadge name="Kraken"   isDefault />
          <ExchangeBadge name="Binance" />
          <ExchangeBadge name="Coinbase" />
        </View>
        <TouchableOpacity style={s.connectBtn} activeOpacity={0.8}>
          <Feather name="plus" size={12} color={C.cyan} />
          <Text style={s.connectText}>Add Exchange</Text>
        </TouchableOpacity>
      </View>

      {/* ── Operator Console ── */}
      <View style={s.sectionLabel}>
        <View style={{ width: 2, height: 12, backgroundColor: C.purple, borderRadius: 1, marginRight: 8 }} />
        <Text style={s.sectionText}>PLATFORM ADMINISTRATION</Text>
      </View>
      <AdminPanel />

      {/* ── Account Settings ── */}
      <View style={s.sectionLabel}>
        <View style={{ width: 2, height: 12, backgroundColor: C.orange, borderRadius: 1, marginRight: 8 }} />
        <Text style={s.sectionText}>ACCOUNT</Text>
      </View>
      <NeonCard accent={C.orange} style={{ marginBottom: 14 }}>
        <SettingRow icon="bell"       label="Notifications"     value="All" />
        <SettingRow icon="clock"      label="Timezone"          value="UTC-5" />
        <SettingRow icon="dollar-sign" label="Display Currency" value="USD" />
        <SettingRow icon="lock"       label="Security"          value="2FA On" />
        <SettingRow icon="download"   label="Export Data" />
        <SettingRow icon="log-out"    label="Sign Out"          onPress={handleSignOut} danger />
      </NeonCard>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20, padding: 16, backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: `${C.cyan}20` },
  profileInfo: { flex: 1 },
  name:   { fontSize: 18, fontFamily: FONTS.monoBold, color: C.textPrimary },
  email:  { fontSize: 10, fontFamily: FONTS.mono, color: C.textMuted, marginTop: 2 },
  since:  { fontSize: 8,  fontFamily: FONTS.mono, color: C.textDim },
  proBadge: { backgroundColor: `${C.cyan}15`, borderRadius: 4, borderWidth: 1, borderColor: `${C.cyan}35`, paddingHorizontal: 7, paddingVertical: 2 },
  proText:  { fontSize: 7, fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1 },
  sectionLabel: { flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: 4 },
  sectionText:  { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.8 },
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14 },
  connectBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  connectText: { fontSize: 11, fontFamily: FONTS.monoMedium, color: C.cyan },
});
