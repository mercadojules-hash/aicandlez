import React, { useRef, useEffect, useState } from "react";
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
import { TradingModeToggle } from "@/components/TradingModeToggle";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ── Ambient Background ─────────────────────────────────────────────────────────

function AmbientBackground() {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (anim: Animated.Value, dur: number, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: dur, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: dur, useNativeDriver: true }),
      ]));
    make(a1, 6000, 0).start();
    make(a2, 8000, 2000).start();
    make(a3, 7000, 4000).start();
  }, []);

  const op1 = a1.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.12] });
  const op2 = a2.interpolate({ inputRange: [0, 1], outputRange: [0.03, 0.08] });
  const op3 = a3.interpolate({ inputRange: [0, 1], outputRange: [0.02, 0.07] });

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[amb.blob, { top: -80, right: -60,  width: 300, height: 300, backgroundColor: C.cyan,   borderRadius: 150, opacity: op1 }]} />
      <Animated.View style={[amb.blob, { top: 400, left: -80,   width: 260, height: 260, backgroundColor: C.purple, borderRadius: 130, opacity: op2 }]} />
      <Animated.View style={[amb.blob, { top: 200, right: -100, width: 220, height: 220, backgroundColor: C.green,  borderRadius: 110, opacity: op3 }]} />
    </View>
  );
}
const amb = StyleSheet.create({ blob: { position: "absolute" } });

// ── Sentiment Banner ───────────────────────────────────────────────────────────

const SENTIMENTS = [
  { label: "BULLISH MOMENTUM",       color: C.green,  icon: "trending-up" },
  { label: "BREAKOUT CONDITIONS",    color: C.cyan,   icon: "activity" },
  { label: "RISK-OFF ENVIRONMENT",   color: C.orange, icon: "alert-triangle" },
  { label: "HIGH VOLATILITY ALERT",  color: C.red,    icon: "zap" },
];

function SentimentBanner() {
  const [idx, setIdx]   = useState(0);
  const fadeAnim        = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const tick = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        setIdx(i => (i + 1) % SENTIMENTS.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
      });
    }, 8000);
    return () => clearInterval(tick);
  }, []);

  const cur = SENTIMENTS[idx];

  return (
    <Animated.View style={[sb.wrap, { borderColor: `${cur.color}30`, backgroundColor: `${cur.color}08`, opacity: fadeAnim }]}>
      <View style={[sb.dot, { backgroundColor: cur.color }]} />
      <Feather name={cur.icon as any} size={10} color={cur.color} />
      <Text style={[sb.label, { color: cur.color }]}>{cur.label}</Text>
      <Text style={sb.tag}>MARKET REGIME</Text>
    </Animated.View>
  );
}
const sb = StyleSheet.create({
  wrap:  { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  dot:   { width: 5, height: 5, borderRadius: 3 },
  label: { flex: 1, fontSize: 10, fontFamily: FONTS.monoBold, letterSpacing: 1.2 },
  tag:   { fontSize: 8, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8 },
});

// ── AI Insight Rotator ─────────────────────────────────────────────────────────

const AI_INSIGHTS = [
  "Momentum increasing on high-volume assets",
  "Strong trend continuation probability detected",
  "Risk conditions stable · AI operating normally",
  "Elevated volatility across major pairs",
  "BTC correlation strengthening across altcoins",
  "AI detecting EMA breakout formation on L1s",
];

function AIInsight() {
  const [idx, setIdx] = useState(0);
  const fade          = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setIdx(i => (i + 1) % AI_INSIGHTS.length);
        Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <Animated.Text style={[ins.text, { opacity: fade }]}>
      ✦ {AI_INSIGHTS[idx]}
    </Animated.Text>
  );
}
const ins = StyleSheet.create({
  text: { fontSize: 9, fontFamily: FONTS.mono, color: `${C.purple}90`, letterSpacing: 0.5, marginTop: 5, fontStyle: "italic" },
});

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
  row:      { flexDirection: "row", backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  item:     { flex: 1, alignItems: "center", paddingVertical: 13 },
  sep:      { borderRightWidth: 1, borderRightColor: C.border },
  sym:      { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.2, marginBottom: 3 },
  price:    { fontSize: 14, fontFamily: FONTS.monoBold, color: C.textPrimary, marginBottom: 5 },
  sigBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  sig:      { fontSize: 8, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
});

// ── Stat Tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, color = C.textPrimary, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={[st.tile, { shadowColor: color, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 }]}>
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

// ── AI Deployment Status ───────────────────────────────────────────────────────

function AIDeploymentStatus({ mode, engine }: { mode: "paper" | "live"; engine: any }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ])).start();
  }, []);

  const dotOp = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  const stats = [
    { label: "PAPER AI",   value: mode === "paper" && engine?.running ? "ACTIVE" : "STANDBY", color: mode === "paper" && engine?.running ? C.green : C.textDim },
    { label: "LIVE AI",    value: mode === "live" ? "ACTIVE" : "DISABLED",                    color: mode === "live" ? C.orange : C.textDim },
    { label: "MARKETS",    value: "3 Monitored",                                               color: C.cyan    },
    { label: "ASSETS",     value: "1,240+ Scanned",                                            color: C.textPrimary },
    { label: "EXCHANGES",  value: "4 Connected",                                               color: C.purple  },
    { label: "CONFIDENCE", value: `${engine?.confidence ?? 62}%`,                             color: C.cyan    },
  ];

  return (
    <View style={ds.card}>
      <View style={ds.topLine} />
      <View style={ds.header}>
        <Animated.View style={[ds.dot, { opacity: dotOp }]} />
        <Text style={ds.title}>AI DEPLOYMENT STATUS</Text>
      </View>
      <View style={ds.grid}>
        {stats.map(item => (
          <View key={item.label} style={ds.item}>
            <Text style={ds.itemLabel}>{item.label}</Text>
            <Text style={[ds.itemValue, { color: item.color }]}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const ds = StyleSheet.create({
  card:      { backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: `${C.cyan}18`, marginBottom: 18, overflow: "hidden", shadowColor: C.cyan, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  topLine:   { height: 1.5, backgroundColor: C.cyan, opacity: 0.22 },
  header:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.cyan },
  title:     { fontSize: 9, fontFamily: FONTS.monoBold, color: `${C.cyan}80`, letterSpacing: 2 },
  grid:      { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingVertical: 10 },
  item:      { width: "33.33%", paddingHorizontal: 4, paddingVertical: 7 },
  itemLabel: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 1, marginBottom: 3 },
  itemValue: { fontSize: 11, fontFamily: FONTS.monoBold },
});

// ── Home Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { engine, account, positions, trades, isLoading, refresh, alpacaAccount } = useTrading();
  const insets  = useSafeAreaInsets();
  const breathe = useRef(new Animated.Value(0)).current;
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 67 : insets.top + 10;

  const [tradingMode, setTradingMode] = useState<"paper" | "live">("paper");

  const pnlColor = account.unrealizedPnL >= 0 ? C.green : C.red;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 3600, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 3600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const engineBorderOp = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.55] });

  const recentSignals = engine?.recentSignalLog?.slice(0, 5) ?? [
    { id:"s1", symbol:"BTCUSD", action:"BUY"  as const, confidence:74, timestamp: new Date(Date.now()-180000).toISOString(), reason:"EMA cross + volume surge" },
    { id:"s2", symbol:"ETHUSD", action:"HOLD" as const, confidence:52, timestamp: new Date(Date.now()-720000).toISOString(), reason:"Sideways market — spread <0.15%" },
    { id:"s3", symbol:"SOLUSD", action:"SELL" as const, confidence:61, timestamp: new Date(Date.now()-1800000).toISOString(), reason:"RSI overbought + EMA bear cross" },
  ];

  return (
    <View style={s.root}>
      <AmbientBackground />

      <ScrollView
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
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <TradingModeToggle mode={tradingMode} onChange={setTradingMode} />
            <Text style={s.notifHint}>
              <Feather name="activity" size={9} color={C.textDim} /> {trades.length} trades
            </Text>
          </View>
        </View>

        {/* ── Sentiment Banner ── */}
        <SentimentBanner />

        {/* ── Balance Card ── */}
        <View style={s.balanceCard}>
          <View style={s.balanceGlow} />
          <View style={[s.balanceGlow2, { backgroundColor: `${C.cyan}04` }]} />
          <Text style={s.balLabel}>PORTFOLIO EQUITY</Text>
          <Text style={s.balAmount}>{fmt$(account.equity, 2)}</Text>
          <Text style={[s.balPnl, { color: pnlColor }]}>
            {account.unrealizedPnL >= 0 ? "+" : ""}{fmt$(account.unrealizedPnL)} unrealized · {fmtPct(account.unrealizedPnL / account.equity * 100)}
          </Text>
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
              <Text style={s.balItemLabel}>BUY POWER</Text>
              <Text style={[s.balItemValue, { color: C.cyan }]}>
                {alpacaAccount ? fmt$(alpacaAccount.buyingPower, 0) : "—"}
              </Text>
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

        {/* ── AI Deployment Status ── */}
        <AIDeploymentStatus mode={tradingMode} engine={engine} />

        {/* ── AI Engine Status ── */}
        <Section label="AI ENGINE STATUS" accent={C.purple} />
        <View style={s.engineCard}>
          <Animated.View style={[s.engineBreath, { opacity: engineBorderOp }]} />
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
            <AIInsight />
          </View>
          <View style={{ alignItems: "flex-end", gap: 5 }}>
            <Text style={s.engineExch}>{engine?.exchange ?? "ALPACA"}</Text>
            {engine?.volumeFilter && <Text style={s.filterTag}>VOL FILTER</Text>}
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
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },

  header:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
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
  balanceGlow:  { position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: `${C.cyan}05` },
  balanceGlow2: { position: "absolute", bottom: -40, left: -40, width: 140, height: 140, borderRadius: 70 },
  balLabel:     { fontSize: 8, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.8, marginBottom: 5 },
  balAmount:    { fontSize: 42, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: -0.5, marginBottom: 5 },
  balPnl:       { fontSize: 12, fontFamily: FONTS.monoMedium, marginBottom: 16, opacity: 0.9 },
  balRow:       { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, marginTop: 2 },
  balItem:      { flex: 1, alignItems: "center" },
  balItemLabel: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 1.2, marginBottom: 3 },
  balItemValue: { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary },

  engineCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: `${C.purple}22`, padding: 16, marginBottom: 18,
    shadowColor: C.purple, shadowOpacity: 0.1, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 4, overflow: "hidden",
  },
  engineBreath: { position: "absolute", inset: 0, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.purple, pointerEvents: "none" } as any,
  engineStatus: { fontSize: 14, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  engineDetail: { fontSize: 9, fontFamily: FONTS.mono, color: C.textMuted, marginTop: 3 },
  engineExch:   { fontSize: 11, fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1.2 },
  filterTag: { fontSize: 7, fontFamily: FONTS.monoBold, color: C.orange, borderWidth: 1, borderColor: `${C.orange}30`, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },

  card: { backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, marginBottom: 18 },
});
