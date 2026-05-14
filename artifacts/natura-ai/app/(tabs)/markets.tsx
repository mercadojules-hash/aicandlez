import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTrading } from "@/contexts/TradingContext";
import { SignalBadge, ConfidenceBar } from "@/components/SignalBadge";
import { LiveDot } from "@/components/LiveDot";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

type Filter = "ALL" | "BUY" | "SELL" | "HIGH";

const MOCK_ASSETS = [
  { symbol: "BTCUSD",  signal: "BUY"  as const, confidence: 74, price: 68_120,  change: 2.34,  volume: true,  mktCap: "1.32T" },
  { symbol: "ETHUSD",  signal: "BUY"  as const, confidence: 68, price:  3_512,  change: 1.87,  volume: true,  mktCap: "421B"  },
  { symbol: "SOLUSD",  signal: "HOLD" as const, confidence: 52, price:    188,  change:-0.42,  volume: false, mktCap: "84B"   },
  { symbol: "BNBUSD",  signal: "SELL" as const, confidence: 63, price:    594,  change:-1.23,  volume: true,  mktCap: "86B"   },
  { symbol: "XRPUSD",  signal: "BUY"  as const, confidence: 71, price:   0.624, change: 3.12,  volume: true,  mktCap: "35B"   },
  { symbol: "DOGEUSD", signal: "HOLD" as const, confidence: 44, price:  0.162,  change: 0.88,  volume: false, mktCap: "23B"   },
];

// ── Asset Card ────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: typeof MOCK_ASSETS[number] }) {
  const priceStr = asset.price >= 1000
    ? `$${(asset.price/1000).toFixed(1)}K`
    : asset.price >= 1
    ? `$${asset.price.toFixed(2)}`
    : `$${asset.price.toFixed(4)}`;

  const accent = asset.signal === "BUY" ? C.green : asset.signal === "SELL" ? C.red : C.cyan;
  const changeColor = asset.change >= 0 ? C.green : C.red;

  return (
    <View style={[ac.card, { borderColor: `${accent}25` }]}>
      <View style={[ac.accent, { backgroundColor: accent }]} />
      <View style={ac.top}>
        <View style={ac.left}>
          <Text style={ac.symbol}>{asset.symbol.replace("USD", "")}</Text>
          <Text style={ac.mcap}>{asset.mktCap}</Text>
        </View>
        <View style={ac.center}>
          <Text style={ac.price}>{priceStr}</Text>
          <Text style={[ac.change, { color: changeColor }]}>
            {asset.change >= 0 ? "+" : ""}{asset.change.toFixed(2)}%
          </Text>
        </View>
        <View style={ac.right}>
          <SignalBadge signal={asset.signal} />
          <Text style={ac.conf}>{asset.confidence}%</Text>
        </View>
      </View>
      <View style={ac.bottom}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <Text style={ac.confLabel}>AI CONFIDENCE</Text>
            <Text style={[ac.confLabel, { color: asset.volume ? C.green : C.textDim }]}>
              {asset.volume ? "VOL ✓" : "VOL —"}
            </Text>
          </View>
          <ConfidenceBar value={asset.confidence} color={accent} />
        </View>
      </View>
    </View>
  );
}

const ac = StyleSheet.create({
  card:     { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  accent:   { height: 2 },
  top:      { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  left:     { width: 56 },
  symbol:   { fontSize: 14, fontFamily: FONTS.monoBold, color: C.textPrimary },
  mcap:     { fontSize: 8,  fontFamily: FONTS.mono, color: C.textDim, marginTop: 2 },
  center:   { flex: 1 },
  price:    { fontSize: 16, fontFamily: FONTS.monoBold, color: C.textPrimary },
  change:   { fontSize: 10, fontFamily: FONTS.monoMedium, marginTop: 2 },
  right:    { alignItems: "flex-end", gap: 4 },
  conf:     { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted },
  bottom:   { paddingHorizontal: 14, paddingBottom: 12 },
  confLabel:{ fontSize: 7,  fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 0.8 },
});

// ── Markets Screen ────────────────────────────────────────────────────────────

export default function MarketsScreen() {
  const { engine, isLoading, refresh } = useTrading();
  const insets = useSafeAreaInsets();
  const isWeb  = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top + 10;
  const [filter, setFilter] = useState<Filter>("ALL");

  const breakdown = engine?.symbolBreakdowns;
  const assets    = (breakdown?.length ? breakdown.map(b => ({
    symbol:     b.symbol,
    signal:     b.signal,
    confidence: b.confidence,
    price:      b.price ?? 0,
    change:     0,
    volume:     b.volumeConfirmed ?? true,
    mktCap:     "—",
  })) : MOCK_ASSETS);

  const filtered = assets.filter(a => {
    if (filter === "BUY")  return a.signal === "BUY";
    if (filter === "SELL") return a.signal === "SELL";
    if (filter === "HIGH") return a.confidence >= 65;
    return true;
  });

  const buyCount  = assets.filter(a => a.signal === "BUY").length;
  const sellCount = assets.filter(a => a.signal === "SELL").length;
  const bullish   = buyCount > sellCount ? "BULLISH" : buyCount < sellCount ? "BEARISH" : "SIDEWAYS";
  const regimeColor = bullish === "BULLISH" ? C.green : bullish === "BEARISH" ? C.red : C.cyan;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "ALL",  label: `ALL (${assets.length})` },
    { key: "BUY",  label: `BUY (${buyCount})` },
    { key: "SELL", label: `SELL (${sellCount})` },
    { key: "HIGH", label: "HIGH CONF" },
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
          <Text style={s.title}>AI SCANNER</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <LiveDot color={C.cyan} size={6} />
            <Text style={s.sub}>LIVE SIGNAL ANALYSIS</Text>
          </View>
        </View>
        <View style={[s.regimeBadge, { borderColor: `${regimeColor}35`, backgroundColor: `${regimeColor}10` }]}>
          <Text style={[s.regimeText, { color: regimeColor }]}>{bullish}</Text>
        </View>
      </View>

      {/* ── Market regime bar ── */}
      <View style={s.regimeBar}>
        <View style={s.regimeSeg}>
          <Text style={[s.regimeNum, { color: C.green }]}>{buyCount}</Text>
          <Text style={s.regimeLabel}>BUY</Text>
        </View>
        <View style={[s.regimeSeg, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border }]}>
          <Text style={[s.regimeNum, { color: C.cyan }]}>{assets.filter(a => a.signal === "HOLD").length}</Text>
          <Text style={s.regimeLabel}>HOLD</Text>
        </View>
        <View style={s.regimeSeg}>
          <Text style={[s.regimeNum, { color: C.red }]}>{sellCount}</Text>
          <Text style={s.regimeLabel}>SELL</Text>
        </View>
      </View>

      {/* ── Filters ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[s.filterBtn, filter === f.key && s.filterActive]}
            >
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ── Assets ── */}
      {filtered.length === 0 ? (
        <View style={s.empty}>
          <Feather name="bar-chart-2" size={28} color={C.textDim} />
          <Text style={s.emptyText}>No assets match this filter</Text>
        </View>
      ) : (
        filtered.map((a, i) => <AssetCard key={a.symbol + i} asset={a as any} />)
      )}

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  title:  { fontSize: 20, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 1.5 },
  sub:    { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 0.8 },
  regimeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.md, borderWidth: 1 },
  regimeText:  { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  regimeBar: { flexDirection: "row", backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  regimeSeg: { flex: 1, alignItems: "center", paddingVertical: 10 },
  regimeNum: { fontSize: 18, fontFamily: FONTS.monoBold },
  regimeLabel: { fontSize: 8, fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1, marginTop: 2 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterActive: { borderColor: `${C.cyan}50`, backgroundColor: C.cyanDim },
  filterText: { fontSize: 9, fontFamily: FONTS.monoMedium, color: C.textMuted, letterSpacing: 0.5 },
  filterTextActive: { color: C.cyan },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 12, fontFamily: FONTS.monoMedium, color: C.textMuted },
});
