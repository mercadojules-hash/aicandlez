import React, { useRef, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrading, fmtAge } from "@/contexts/TradingContext";
import { LiveDot } from "@/components/LiveDot";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ── Telemetry Bar ─────────────────────────────────────────────────────────────

function TelemetryBar({ engine }: { engine: ReturnType<typeof useTrading>["engine"] }) {
  const stats = [
    { label: "SIGNALS",  value: String(engine?.signalCount ?? 0),  color: C.cyan   },
    { label: "EXCHANGE", value: engine?.exchange ?? "KRAKEN",       color: C.orange },
    { label: "SYMBOL",   value: engine?.activeSymbol ?? "BTCUSD",  color: C.purple },
    { label: "CONF",     value: `${engine?.confidence ?? 0}%`,     color: C.green  },
  ];
  return (
    <View style={tb.row}>
      {stats.map((s, i) => (
        <View key={s.label} style={[tb.item, i < stats.length - 1 && tb.sep]}>
          <Text style={tb.label}>{s.label}</Text>
          <Text style={[tb.value, { color: s.color }]}>{s.value}</Text>
        </View>
      ))}
    </View>
  );
}
const tb = StyleSheet.create({
  row:   { flexDirection: "row", backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  item:  { flex: 1, alignItems: "center", paddingVertical: 10 },
  sep:   { borderRightWidth: 1, borderRightColor: C.border },
  label: { fontSize: 7,  fontFamily: FONTS.monoBold, color: C.textDim, letterSpacing: 1 },
  value: { fontSize: 11, fontFamily: FONTS.monoBold, marginTop: 2 },
});

// ── Terminal Line ─────────────────────────────────────────────────────────────

const LINE_COLORS: Record<string, string> = {
  BUY:  C.green,
  SELL: C.red,
  HOLD: C.cyan,
  INFO: C.textMuted,
  WARN: C.orange,
  ERR:  C.red,
};

function TerminalLine({ sig }: { sig: { id: string; timestamp: string; symbol: string; action: string; confidence: number; reason?: string } }) {
  const color  = LINE_COLORS[sig.action] ?? C.textMuted;
  const ts     = new Date(sig.timestamp);
  const timeStr = `${ts.getHours().toString().padStart(2,"0")}:${ts.getMinutes().toString().padStart(2,"0")}:${ts.getSeconds().toString().padStart(2,"0")}`;

  return (
    <View style={tl.row}>
      <Text style={tl.ts}>{timeStr}</Text>
      <Text style={[tl.sym, { color }]}>{sig.symbol.padEnd(8)}</Text>
      <Text style={[tl.action, { color }]}>{sig.action.padEnd(5)}</Text>
      <Text style={tl.conf}>{sig.confidence}%</Text>
      <Text style={tl.reason} numberOfLines={1}>{sig.reason ?? "EMA+RSI confluence signal"}</Text>
    </View>
  );
}
const tl = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#050e18", gap: 8 },
  ts:     { fontSize: 8, fontFamily: FONTS.mono, color: "#2a4050", width: 56 },
  sym:    { fontSize: 8, fontFamily: FONTS.monoBold, width: 60, letterSpacing: 0.5 },
  action: { fontSize: 8, fontFamily: FONTS.monoBold, width: 36, letterSpacing: 0.5 },
  conf:   { fontSize: 8, fontFamily: FONTS.mono, color: C.textMuted, width: 30 },
  reason: { fontSize: 8, fontFamily: FONTS.mono, color: "#3a5a70", flex: 1 },
});

// ── Operator Stats (admin only placeholder) ────────────────────────────────────

function OperatorPanel() {
  const stats = [
    { label: "ACTIVE USERS", value: "1,248", color: C.cyan    },
    { label: "LIVE BOTS",    value: "412",   color: C.green   },
    { label: "24H VOLUME",   value: "$2.4M", color: C.orange  },
    { label: "FEES 24H",     value: "$4.8K", color: C.purple  },
    { label: "TOTAL TRADES", value: "18,294",color: C.textPrimary },
    { label: "UPTIME",       value: "99.97%",color: C.green   },
  ];
  return (
    <View style={op.card}>
      <View style={op.header}>
        <Text style={op.title}>OPERATOR TELEMETRY</Text>
        <Text style={op.badge}>ADMIN</Text>
      </View>
      <View style={op.grid}>
        {stats.map(s => (
          <View key={s.label} style={op.item}>
            <Text style={[op.value, { color: s.color }]}>{s.value}</Text>
            <Text style={op.label}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const op = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${C.purple}30`, marginBottom: 14, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.purple, letterSpacing: 1.5 },
  badge: { fontSize: 7, fontFamily: FONTS.monoBold, color: C.purple, borderWidth: 1, borderColor: `${C.purple}35`, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingVertical: 6 },
  item: { width: "33.33%", alignItems: "center", paddingVertical: 10 },
  value: { fontSize: 14, fontFamily: FONTS.monoBold },
  label: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8, marginTop: 2 },
});

// ── Terminal Screen ───────────────────────────────────────────────────────────

const MOCK_LOG = [
  { id:"l1", timestamp: new Date(Date.now()-30000).toISOString(),  symbol:"BTCUSD", action:"BUY",  confidence:74, reason:"EMA9 crossed EMA21 upward + volume surge" },
  { id:"l2", timestamp: new Date(Date.now()-90000).toISOString(),  symbol:"ETHUSD", action:"HOLD", confidence:52, reason:"EMA spread < 0.15% — sideways filter blocked" },
  { id:"l3", timestamp: new Date(Date.now()-210000).toISOString(), symbol:"SOLUSD", action:"SELL", confidence:61, reason:"RSI 72 overbought + bearish divergence" },
  { id:"l4", timestamp: new Date(Date.now()-540000).toISOString(), symbol:"BTCUSD", action:"BUY",  confidence:79, reason:"Strong 1H trend alignment + volume confirm" },
  { id:"l5", timestamp: new Date(Date.now()-720000).toISOString(), symbol:"ETHUSD", action:"BUY",  confidence:66, reason:"EMA cross + RSI 46 neutral zone entry" },
  { id:"l6", timestamp: new Date(Date.now()-1200000).toISOString(),symbol:"SOLUSD", action:"HOLD", confidence:44, reason:"Mixed signals — confidence below threshold" },
  { id:"l7", timestamp: new Date(Date.now()-1800000).toISOString(),symbol:"BTCUSD", action:"SELL", confidence:58, reason:"RSI 68 + EMA bearish — moderate confidence" },
  { id:"l8", timestamp: new Date(Date.now()-2400000).toISOString(),symbol:"ETHUSD", action:"BUY",  confidence:82, reason:"High confidence EMA+RSI+Volume alignment" },
];

export default function TerminalScreen() {
  const { engine, isLoading, refresh } = useTrading();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 67 : insets.top + 10;
  const scrollRef = useRef<ScrollView>(null);

  const log = engine?.recentSignalLog?.length ? engine.recentSignalLog : MOCK_LOG;

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 400);
    return () => clearTimeout(t);
  }, [log.length]);

  return (
    <ScrollView
      ref={scrollRef}
      style={s.root}
      contentContainerStyle={[s.scroll, { paddingTop: topPad, paddingBottom: TAB_BAR_H + 16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.cyan} />}
    >
      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>SIGNAL TERMINAL</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <LiveDot color={C.teal} size={6} />
            <Text style={s.sub}>LIVE AI OUTPUT FEED</Text>
          </View>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countText}>{log.length} SIGNALS</Text>
        </View>
      </View>

      {/* ── Telemetry ── */}
      <TelemetryBar engine={engine} />

      {/* ── Operator panel ── */}
      <OperatorPanel />

      {/* ── Feed header ── */}
      <View style={s.feedHeader}>
        <Text style={s.colTs}>TIME</Text>
        <Text style={s.colSym}>SYMBOL</Text>
        <Text style={s.colAct}>ACT</Text>
        <Text style={s.colConf}>CONF</Text>
        <Text style={s.colReason}>REASON</Text>
      </View>

      {/* ── Signal feed ── */}
      <View style={s.feed}>
        {log.map(sig => <TerminalLine key={sig.id} sig={sig} />)}
        {log.length === 0 && (
          <Text style={{ textAlign: "center", color: C.textDim, fontSize: 10, fontFamily: FONTS.mono, paddingVertical: 16 }}>
            Waiting for signals…
          </Text>
        )}
      </View>

      {/* ── Cursor blink ── */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
        <Text style={s.cursor}>▮</Text>
        <Text style={s.cursorText}>AICANDLEZ ENGINE RUNNING · POLLING 5s</Text>
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#000000" },
  scroll: { paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  title:  { fontSize: 20, fontFamily: FONTS.monoBold, color: C.teal, letterSpacing: 1.5 },
  sub:    { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 0.8 },
  countBadge: { backgroundColor: `${C.teal}10`, borderRadius: RADIUS.md, borderWidth: 1, borderColor: `${C.teal}30`, paddingHorizontal: 10, paddingVertical: 5 },
  countText:  { fontSize: 8, fontFamily: FONTS.monoBold, color: C.teal, letterSpacing: 1 },
  feedHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 2 },
  colTs:     { fontSize: 7, fontFamily: FONTS.monoBold, color: C.textDim, width: 56, letterSpacing: 0.5 },
  colSym:    { fontSize: 7, fontFamily: FONTS.monoBold, color: C.textDim, width: 60, letterSpacing: 0.5 },
  colAct:    { fontSize: 7, fontFamily: FONTS.monoBold, color: C.textDim, width: 36, letterSpacing: 0.5 },
  colConf:   { fontSize: 7, fontFamily: FONTS.monoBold, color: C.textDim, width: 30, letterSpacing: 0.5 },
  colReason: { fontSize: 7, fontFamily: FONTS.monoBold, color: C.textDim, flex: 1, letterSpacing: 0.5 },
  feed:      { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingBottom: 8, marginBottom: 8 },
  cursor:    { fontSize: 12, fontFamily: FONTS.mono, color: C.cyan },
  cursorText:{ fontSize: 8,  fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8 },
});
