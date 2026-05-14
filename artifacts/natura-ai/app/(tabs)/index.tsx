import React, { useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Animated, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTrading, fmt$, fmtPct, fmtAge } from "@/contexts/TradingContext";
import { SignalBadge, ConfidenceBar } from "@/components/SignalBadge";
import { LiveDot } from "@/components/LiveDot";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ── Ticker ────────────────────────────────────────────────────────────────────

function MarketTicker({ breakdowns }: { breakdowns?: { symbol: string; price?: number; signal: string; confidence: number }[] }) {
  const items = breakdowns?.length ? breakdowns : [
    { symbol: "BTCUSD", price: 68_120, signal: "BUY",  confidence: 74 },
    { symbol: "ETHUSD", price: 3_512,  signal: "BUY",  confidence: 68 },
    { symbol: "SOLUSD", price: 188.4,  signal: "HOLD", confidence: 52 },
  ];
  return (
    <View style={tk.row}>
      {items.map((b, i) => (
        <View key={b.symbol} style={[tk.item, i < items.length - 1 && tk.sep]}>
          <Text style={tk.sym}>{b.symbol.replace("USD", "")}</Text>
          <Text style={tk.price}>{b.price ? `$${b.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}</Text>
          <Text style={[tk.sig, { color: b.signal === "BUY" ? C.green : b.signal === "SELL" ? C.red : C.cyan }]}>
            {b.signal}
          </Text>
        </View>
      ))}
    </View>
  );
}
const tk = StyleSheet.create({
  row:   { flexDirection: "row", backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  item:  { flex: 1, alignItems: "center", paddingVertical: 10 },
  sep:   { borderRightWidth: 1, borderRightColor: C.border },
  sym:   { fontSize: 9,  fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 0.8 },
  price: { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary, marginTop: 2 },
  sig:   { fontSize: 8,  fontFamily: FONTS.monoBold, letterSpacing: 0.5, marginTop: 2 },
});

// ── Stat Tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, color = C.textPrimary, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={st.tile}>
      <Text style={[st.value, { color }]}>{value}</Text>
      {sub && <Text style={[st.sub, { color }]}>{sub}</Text>}
      <Text style={st.label}>{label}</Text>
    </View>
  );
}
const st = StyleSheet.create({
  tile:  { flex: 1, alignItems: "center", paddingVertical: 12, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border },
  value: { fontSize: 20, fontFamily: FONTS.monoBold, letterSpacing: 0.5 },
  sub:   { fontSize: 9,  fontFamily: FONTS.mono, marginTop: 1 },
  label: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 0.8, marginTop: 3 },
});

// ── Signal Row ────────────────────────────────────────────────────────────────

function SignalRow({ sig }: { sig: { id: string; symbol: string; action: "BUY"|"SELL"|"HOLD"; confidence: number; timestamp: string; reason?: string } }) {
  return (
    <View style={sr.row}>
      <View style={sr.left}>
        <Text style={sr.sym}>{sig.symbol}</Text>
        <Text style={sr.time}>{fmtAge(sig.timestamp)}</Text>
      </View>
      <View style={sr.mid}>
        <Text style={sr.reason} numberOfLines={1}>{sig.reason ?? "EMA+RSI confluence"}</Text>
        <ConfidenceBar value={sig.confidence} color={sig.action === "BUY" ? C.green : sig.action === "SELL" ? C.red : C.cyan} />
      </View>
      <View style={sr.right}>
        <SignalBadge signal={sig.action} small />
        <Text style={sr.conf}>{sig.confidence}%</Text>
      </View>
    </View>
  );
}
const sr = StyleSheet.create({
  row:   { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  left:  { width: 72 },
  sym:   { fontSize: 11, fontFamily: FONTS.monoBold, color: C.textPrimary },
  time:  { fontSize: 8,  fontFamily: FONTS.mono, color: C.textDim, marginTop: 2 },
  mid:   { flex: 1 },
  reason:{ fontSize: 9,  fontFamily: FONTS.mono, color: C.textSecondary },
  right: { alignItems: "flex-end", gap: 3 },
  conf:  { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted },
});

// ── Section Header ────────────────────────────────────────────────────────────

function Section({ label, accent = C.cyan, right }: { label: string; accent?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: 4 }}>
      <View style={{ width: 2, height: 12, backgroundColor: accent, borderRadius: 1, marginRight: 8 }} />
      <Text style={{ fontSize: 9, fontFamily: FONTS.monoBold, color: `${accent}90`, letterSpacing: 1.8 }}>{label}</Text>
      {right && <View style={{ flex: 1, alignItems: "flex-end" }}>{right}</View>}
    </View>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { engine, account, positions, trades, isLoading, refresh } = useTrading();
  const insets  = useSafeAreaInsets();
  const pnlAnim = useRef(new Animated.Value(0)).current;
  const isWeb   = Platform.OS === "web";

  const pnlColor = account.unrealizedPnL >= 0 ? C.green : C.red;
  const topPad   = isWeb ? 67 : insets.top + 10;

  // Subtle PnL pulse on change
  useEffect(() => {
    Animated.sequence([
      Animated.timing(pnlAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(pnlAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [account.unrealizedPnL]);

  const recentSignals = engine?.recentSignalLog?.slice(0, 5) ?? [
    { id:"s1", symbol:"BTCUSD", action:"BUY"  as const, confidence:74, timestamp: new Date(Date.now()-180000).toISOString(), reason:"EMA cross + volume surge" },
    { id:"s2", symbol:"ETHUSD", action:"HOLD" as const, confidence:52, timestamp: new Date(Date.now()-720000).toISOString(), reason:"Sideways market — spread <0.15%" },
    { id:"s3", symbol:"SOLUSD", action:"SELL" as const, confidence:61, timestamp: new Date(Date.now()-1800000).toISOString(), reason:"RSI overbought + EMA bear cross" },
  ];

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.scroll, { paddingTop: topPad, paddingBottom: TAB_BAR_H + 16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.cyan} />}
    >

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.logoText}>APEX <Text style={{ color: C.cyan }}>TRADER</Text></Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
            <LiveDot color={engine?.running ? C.green : C.textDim} size={6} />
            <Text style={s.headerSub}>
              {engine?.running ? `AI ENGINE ACTIVE · ${engine.exchange ?? "SIM"}` : "AI ENGINE IDLE"}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={s.modeBadge}>
            <Text style={s.modeText}>{engine?.mode ?? "SIMULATION"}</Text>
          </View>
          <Text style={s.notifHint}>
            <Feather name="bell" size={10} color={C.textDim} /> {trades.length} trades
          </Text>
        </View>
      </View>

      {/* ── Balance Card ── */}
      <View style={s.balanceCard}>
        <View style={s.balanceGlow} />
        <Text style={s.balLabel}>PORTFOLIO EQUITY</Text>
        <Text style={s.balAmount}>{fmt$(account.equity, 2)}</Text>
        <Animated.View style={{ opacity: pnlAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }}>
          <Text style={[s.balPnl, { color: pnlColor }]}>
            {account.unrealizedPnL >= 0 ? "+" : ""}{fmt$(account.unrealizedPnL)} unrealized  ·  {fmtPct(account.unrealizedPnL / account.equity * 100)}
          </Text>
        </Animated.View>
        <View style={s.balRow}>
          <View style={s.balItem}>
            <Text style={s.balItemLabel}>CASH</Text>
            <Text style={s.balItemValue}>{fmt$(account.cashBalance, 0)}</Text>
          </View>
          <View style={[s.balItem, { borderLeftWidth: 1, borderLeftColor: C.border, borderRightWidth: 1, borderRightColor: C.border }]}>
            <Text style={s.balItemLabel}>REALIZED</Text>
            <Text style={[s.balItemValue, { color: account.realizedPnL >= 0 ? C.green : C.red }]}>
              {account.realizedPnL >= 0 ? "+" : ""}{fmt$(account.realizedPnL)}
            </Text>
          </View>
          <View style={s.balItem}>
            <Text style={s.balItemLabel}>FEES PAID</Text>
            <Text style={[s.balItemValue, { color: C.orange }]}>{fmt$(account.totalFeesPaid)}</Text>
          </View>
        </View>
      </View>

      {/* ── Quick Stats ── */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <StatTile label="WIN RATE"    value={`${account.winRate.toFixed(0)}%`}    color={account.winRate >= 55 ? C.green : C.orange} />
        <StatTile label="POSITIONS"   value={String(positions.length)}            color={positions.length > 0 ? C.cyan : C.textMuted} />
        <StatTile label="TOTAL TRADES" value={String(account.totalTrades)}        color={C.textPrimary} />
      </View>

      {/* ── Engine Status ── */}
      <Section label="AI ENGINE STATUS" accent={C.purple} />
      <View style={s.engineCard}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <LiveDot color={engine?.running ? C.green : "#2a4050"} size={7} />
            <Text style={[s.engineStatus, { color: engine?.running ? C.green : C.textDim }]}>
              {engine?.running ? "RUNNING" : "STOPPED"}
            </Text>
          </View>
          <Text style={s.engineDetail}>
            {engine?.activeSymbol ?? "BTCUSD"} · conf {engine?.confidence ?? 0}%
          </Text>
          <Text style={s.engineDetail}>
            {engine?.signalCount ?? 0} signals generated
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={s.engineExch}>{engine?.exchange ?? "KRAKEN"}</Text>
          {engine?.volumeFilter && (
            <Text style={s.filterTag}>VOL FILTER</Text>
          )}
        </View>
      </View>

      {/* ── Market Ticker ── */}
      <Section label="LIVE MARKETS" accent={C.teal} />
      <MarketTicker breakdowns={engine?.symbolBreakdowns} />

      {/* ── Recent Signals ── */}
      <Section
        label="RECENT AI SIGNALS"
        accent={C.cyan}
        right={<Text style={{ fontSize: 8, fontFamily: FONTS.mono, color: C.textDim }}>{recentSignals.length} recent</Text>}
      />
      <View style={s.card}>
        {recentSignals.map(sig => <SignalRow key={sig.id} sig={sig} />)}
        {recentSignals.length === 0 && (
          <Text style={{ textAlign: "center", color: C.textDim, fontSize: 10, fontFamily: FONTS.mono, paddingVertical: 16 }}>
            No signals yet — engine warming up
          </Text>
        )}
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },

  // Header
  header:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logoText:  { fontSize: 22, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 2 },
  headerSub: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1 },
  modeBadge: { backgroundColor: C.cyanDim, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${C.cyan}35` },
  modeText:  { fontSize: 8,  fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 0.8 },
  notifHint: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textDim, marginTop: 4 },

  // Balance card
  balanceCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: `${C.cyan}30`, padding: 18, marginBottom: 14, overflow: "hidden",
    shadowColor: C.cyan, shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  balanceGlow: {
    position: "absolute", top: -40, right: -40, width: 160, height: 160,
    borderRadius: 80, backgroundColor: `${C.cyan}06`,
  },
  balLabel:  { fontSize: 8, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.5, marginBottom: 4 },
  balAmount: { fontSize: 36, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 0.5, marginBottom: 4 },
  balPnl:    { fontSize: 12, fontFamily: FONTS.monoMedium, marginBottom: 14 },
  balRow:    { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 2 },
  balItem:   { flex: 1, alignItems: "center" },
  balItemLabel: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 1, marginBottom: 2 },
  balItemValue: { fontSize: 12, fontFamily: FONTS.monoBold, color: C.textPrimary },

  // Engine
  engineCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: `${C.purple}25`, padding: 14, marginBottom: 16,
  },
  engineStatus: { fontSize: 13, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  engineDetail: { fontSize: 9,  fontFamily: FONTS.mono, color: C.textMuted, marginTop: 2 },
  engineExch:   { fontSize: 10, fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1 },
  filterTag: {
    fontSize: 7, fontFamily: FONTS.monoBold, color: C.orange,
    borderWidth: 1, borderColor: `${C.orange}30`, borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 2,
  },

  // Generic card
  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6, marginBottom: 16,
  },
});
