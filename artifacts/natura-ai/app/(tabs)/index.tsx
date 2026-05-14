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
import { PortfolioChart } from "@/components/PortfolioChart";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ── Market Ticker ──────────────────────────────────────────────────────────────

function MarketTicker({ breakdowns }: { breakdowns?: { symbol: string; price?: number; signal: string; confidence: number }[] }) {
  const items = breakdowns?.length ? breakdowns : [
    { symbol: "BTCUSD", price: 68_120, signal: "BUY",  confidence: 74 },
    { symbol: "ETHUSD", price: 3_512,  signal: "BUY",  confidence: 68 },
    { symbol: "SOLUSD", price: 188.4,  signal: "HOLD", confidence: 52 },
  ];
  return (
    <View style={tk.row}>
      {items.map((b, i) => {
        const sigColor = b.signal === "BUY" ? C.green : b.signal === "SELL" ? C.red : C.cyan;
        return (
          <View key={b.symbol} style={[tk.item, i < items.length - 1 && tk.sep]}>
            <Text style={tk.sym}>{b.symbol.replace("USD", "")}</Text>
            <Text style={tk.price}>
              {b.price ? `$${b.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
            </Text>
            <View style={[tk.sigBadge, { backgroundColor: `${sigColor}10`, borderColor: `${sigColor}28` }]}>
              <Text style={[tk.sig, { color: sigColor }]}>{b.signal}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
const tk = StyleSheet.create({
  row:     { flexDirection: "row", backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  item:    { flex: 1, alignItems: "center", paddingVertical: 13 },
  sep:     { borderRightWidth: 1, borderRightColor: C.border },
  sym:     { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.2, marginBottom: 3 },
  price:   { fontSize: 14, fontFamily: FONTS.monoBold, color: C.textPrimary, marginBottom: 5 },
  sigBadge:{ borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  sig:     { fontSize: 8, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
});

// ── Stat Tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, color = C.textPrimary, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={[st.tile, {
      shadowColor: color, shadowOpacity: 0.12,
      shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    }]}>
      <Text style={[st.value, { color }]}>{value}</Text>
      {sub && <Text style={[st.sub, { color: `${color}80` }]}>{sub}</Text>}
      <Text style={st.label}>{label}</Text>
    </View>
  );
}
const st = StyleSheet.create({
  tile:  { flex: 1, alignItems: "center", paddingVertical: 14, backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border },
  value: { fontSize: 22, fontFamily: FONTS.monoBold, letterSpacing: 0.3 },
  sub:   { fontSize: 9,  fontFamily: FONTS.mono, marginTop: 1 },
  label: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1, marginTop: 4 },
});

// ── Signal Row ────────────────────────────────────────────────────────────────

function SignalRow({ sig }: { sig: { id: string; symbol: string; action: "BUY"|"SELL"|"HOLD"; confidence: number; timestamp: string; reason?: string } }) {
  const accent = sig.action === "BUY" ? C.green : sig.action === "SELL" ? C.red : C.cyan;
  return (
    <View style={sr.row}>
      <View style={[sr.bar, { backgroundColor: accent }]} />
      <View style={sr.left}>
        <Text style={sr.sym}>{sig.symbol.replace("USD", "")}</Text>
        <Text style={sr.time}>{fmtAge(sig.timestamp)}</Text>
      </View>
      <View style={sr.mid}>
        <Text style={sr.reason} numberOfLines={1}>{sig.reason ?? "EMA+RSI confluence"}</Text>
        <ConfidenceBar value={sig.confidence} color={accent} />
      </View>
      <View style={sr.right}>
        <SignalBadge signal={sig.action} small />
        <Text style={sr.conf}>{sig.confidence}%</Text>
      </View>
    </View>
  );
}
const sr = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  bar:    { width: 2.5, height: 32, borderRadius: 2 },
  left:   { width: 64 },
  sym:    { fontSize: 12, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 0.3 },
  time:   { fontSize: 8,  fontFamily: FONTS.mono, color: C.textDim, marginTop: 2 },
  mid:    { flex: 1 },
  reason: { fontSize: 9,  fontFamily: FONTS.mono, color: C.textSecondary, marginBottom: 5 },
  right:  { alignItems: "flex-end", gap: 4 },
  conf:   { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted },
});

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, accent = C.cyan, right }: { label: string; accent?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: 6 }}>
      <View style={{ width: 3, height: 14, backgroundColor: accent, borderRadius: 2, marginRight: 10, opacity: 0.85 }} />
      <Text style={{ fontSize: 9, fontFamily: FONTS.monoBold, color: `${accent}88`, letterSpacing: 2 }}>{label}</Text>
      {right && <View style={{ flex: 1, alignItems: "flex-end" }}>{right}</View>}
    </View>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { engine, account, positions, trades, isLoading, refresh } = useTrading();
  const insets  = useSafeAreaInsets();
  const pnlAnim = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 67 : insets.top + 10;

  const pnlColor = account.unrealizedPnL >= 0 ? C.green : C.red;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(pnlAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(pnlAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [account.unrealizedPnL]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 3600, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 3600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const engineBorderOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.55] });

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <LiveDot color={engine?.running ? C.green : C.textDim} size={6} />
            <Text style={s.headerSub}>
              {engine?.running ? `AI ENGINE ACTIVE · ${engine.exchange ?? "SIM"}` : "AI ENGINE IDLE"}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={s.modeBadge}>
            <Text style={s.modeText}>{engine?.mode ?? "SIMULATION"}</Text>
          </View>
          <Text style={s.notifHint}>
            <Feather name="activity" size={9} color={C.textDim} /> {trades.length} trades
          </Text>
        </View>
      </View>

      {/* ── Balance Card ── */}
      <View style={s.balanceCard}>
        {/* Ambient corner glow */}
        <View style={s.balanceGlow} />
        <View style={[s.balanceGlow2, { backgroundColor: `${C.cyan}04` }]} />

        <Text style={s.balLabel}>PORTFOLIO EQUITY</Text>
        <Text style={s.balAmount}>{fmt$(account.equity, 2)}</Text>

        <Animated.View style={{ opacity: pnlAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }}>
          <Text style={[s.balPnl, { color: pnlColor }]}>
            {account.unrealizedPnL >= 0 ? "+" : ""}{fmt$(account.unrealizedPnL)} unrealized · {fmtPct(account.unrealizedPnL / account.equity * 100)}
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

      {/* ── Portfolio Chart ── */}
      <PortfolioChart equity={account.equity} />

      {/* ── Quick Stats ── */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
        <StatTile label="WIN RATE"     value={`${account.winRate.toFixed(0)}%`}  color={account.winRate >= 55 ? C.green : C.orange} />
        <StatTile label="POSITIONS"    value={String(positions.length)}           color={positions.length > 0 ? C.cyan : C.textMuted} />
        <StatTile label="TOTAL TRADES" value={String(account.totalTrades)}        color={C.textPrimary} />
      </View>

      {/* ── Engine Status ── */}
      <Section label="AI ENGINE STATUS" accent={C.purple} />
      <View style={s.engineCard}>
        <Animated.View style={[s.engineBreath, { opacity: engineBorderOpacity }]} />
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
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <Text style={s.engineExch}>{engine?.exchange ?? "KRAKEN"}</Text>
          {engine?.volumeFilter && (
            <Text style={s.filterTag}>VOL FILTER</Text>
          )}
        </View>
      </View>

      {/* ── Live Markets ── */}
      <Section label="LIVE MARKETS" accent={C.teal} />
      <MarketTicker breakdowns={engine?.symbolBreakdowns} />

      {/* ── Recent AI Signals ── */}
      <Section
        label="RECENT AI SIGNALS"
        accent={C.cyan}
        right={<Text style={{ fontSize: 8, fontFamily: FONTS.mono, color: C.textDim }}>{recentSignals.length} recent</Text>}
      />
      <View style={s.card}>
        {recentSignals.map(sig => <SignalRow key={sig.id} sig={sig} />)}
        {recentSignals.length === 0 && (
          <Text style={{ textAlign: "center", color: C.textDim, fontSize: 10, fontFamily: FONTS.mono, paddingVertical: 18 }}>
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

  header:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  logoText:  { fontSize: 24, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 2.5 },
  headerSub: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1.2 },
  modeBadge: { backgroundColor: C.cyanDim, borderRadius: RADIUS.sm, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: `${C.cyan}35` },
  modeText:  { fontSize: 8,  fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1 },
  notifHint: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textDim },

  balanceCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: `${C.cyan}32`, padding: 20, marginBottom: 16, overflow: "hidden",
    shadowColor: C.cyan, shadowOpacity: 0.22, shadowRadius: 28,
    shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  balanceGlow: {
    position: "absolute", top: -60, right: -60, width: 200, height: 200,
    borderRadius: 100, backgroundColor: `${C.cyan}05`,
  },
  balanceGlow2: {
    position: "absolute", bottom: -40, left: -40, width: 140, height: 140,
    borderRadius: 70,
  },
  balLabel:     { fontSize: 8, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.8, marginBottom: 5 },
  balAmount:    { fontSize: 42, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: -0.5, marginBottom: 5 },
  balPnl:       { fontSize: 12, fontFamily: FONTS.monoMedium, marginBottom: 16, opacity: 0.9 },
  balRow:       { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, marginTop: 2 },
  balItem:      { flex: 1, alignItems: "center" },
  balItemLabel: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 1.2, marginBottom: 3 },
  balItemValue: { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary },

  engineCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: `${C.purple}22`, padding: 16, marginBottom: 18,
    shadowColor: C.purple, shadowOpacity: 0.1, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
    overflow: "hidden",
  },
  engineBreath: {
    position: "absolute", inset: 0, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.purple,
    pointerEvents: "none",
  } as any,
  engineStatus: { fontSize: 14, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  engineDetail: { fontSize: 9,  fontFamily: FONTS.mono, color: C.textMuted, marginTop: 3 },
  engineExch:   { fontSize: 11, fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1.2 },
  filterTag: {
    fontSize: 7, fontFamily: FONTS.monoBold, color: C.orange,
    borderWidth: 1, borderColor: `${C.orange}30`, borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 2,
  },

  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, marginBottom: 18,
  },
});
