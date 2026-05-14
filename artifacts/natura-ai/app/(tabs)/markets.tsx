import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Platform, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTrading } from "@/contexts/TradingContext";
import { SignalBadge, ConfidenceBar } from "@/components/SignalBadge";
import { LiveDot } from "@/components/LiveDot";
import { MiniSparkline, genSparkData } from "@/components/MiniSparkline";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ── Asset Database ─────────────────────────────────────────────────────────────

type Signal = "BUY" | "SELL" | "HOLD";
type Cat    = "ALL"|"TRENDING"|"AI"|"MEME"|"DEFI"|"L1"|"GAMING"|"RWA"|"GAINERS"|"VOLATILE"|"STOCKS"|"ETF";

interface Asset {
  symbol: string; name: string; cats: Cat[];
  signal: Signal; conf: number; price: number;
  change: number; vol: boolean; mcap: string;
}

const ALL_ASSETS: Asset[] = [
  { symbol:"BTCUSD",  name:"Bitcoin",        cats:["ALL","TRENDING","L1","GAINERS"],       signal:"BUY",  conf:74, price:68_120,  change: 2.34,  vol:true,  mcap:"1.32T" },
  { symbol:"ETHUSD",  name:"Ethereum",       cats:["ALL","TRENDING","L1","GAINERS"],       signal:"BUY",  conf:68, price:3_512,   change: 1.87,  vol:true,  mcap:"421B"  },
  { symbol:"SOLUSD",  name:"Solana",         cats:["ALL","L1","TRENDING"],                 signal:"HOLD", conf:52, price:188,     change:-0.42,  vol:false, mcap:"84B"   },
  { symbol:"BNBUSD",  name:"BNB",            cats:["ALL","L1"],                            signal:"SELL", conf:63, price:594,     change:-1.23,  vol:true,  mcap:"86B"   },
  { symbol:"XRPUSD",  name:"Ripple",         cats:["ALL","L1","GAINERS"],                  signal:"BUY",  conf:71, price:0.624,   change: 3.12,  vol:true,  mcap:"35B"   },
  { symbol:"AVAXUSD", name:"Avalanche",      cats:["ALL","L1","TRENDING","GAINERS"],       signal:"BUY",  conf:67, price:42.8,    change: 4.21,  vol:true,  mcap:"18B"   },
  { symbol:"ADAUSD",  name:"Cardano",        cats:["ALL","L1"],                            signal:"HOLD", conf:44, price:0.508,   change:-0.88,  vol:false, mcap:"18B"   },
  { symbol:"NEARUSD", name:"NEAR Protocol",  cats:["ALL","L1","GAINERS"],                  signal:"BUY",  conf:61, price:8.42,    change: 5.11,  vol:true,  mcap:"9.2B"  },
  { symbol:"FETUSD",  name:"Fetch.ai",       cats:["ALL","AI","GAINERS","VOLATILE"],       signal:"BUY",  conf:79, price:2.18,    change: 8.44,  vol:true,  mcap:"1.8B"  },
  { symbol:"AGIXUSD", name:"SingularityNET", cats:["ALL","AI","VOLATILE"],                 signal:"BUY",  conf:72, price:1.04,    change: 6.21,  vol:true,  mcap:"1.3B"  },
  { symbol:"TAOUSD",  name:"Bittensor",      cats:["ALL","AI","GAINERS"],                  signal:"BUY",  conf:65, price:418,     change: 5.77,  vol:false, mcap:"3.1B"  },
  { symbol:"RNDRUSD", name:"Render",         cats:["ALL","AI","TRENDING","VOLATILE"],      signal:"HOLD", conf:58, price:10.4,    change:-1.32,  vol:true,  mcap:"4.1B"  },
  { symbol:"NMRUSD",  name:"Numeraire",      cats:["ALL","AI"],                            signal:"HOLD", conf:49, price:22.8,    change: 0.44,  vol:false, mcap:"0.4B"  },
  { symbol:"DOGEUSD", name:"Dogecoin",       cats:["ALL","MEME","VOLATILE"],               signal:"HOLD", conf:44, price:0.162,   change: 0.88,  vol:false, mcap:"23B"   },
  { symbol:"PEPEUSD", name:"Pepe",           cats:["ALL","MEME","VOLATILE","GAINERS"],     signal:"BUY",  conf:55, price:0.0000142,change:12.3,  vol:true,  mcap:"6.1B"  },
  { symbol:"WIFUSD",  name:"dogwifhat",      cats:["ALL","MEME","VOLATILE"],               signal:"SELL", conf:62, price:2.84,    change:-3.21,  vol:false, mcap:"2.8B"  },
  { symbol:"BONKUSD", name:"Bonk",           cats:["ALL","MEME","VOLATILE"],               signal:"HOLD", conf:38, price:0.0000308,change: 1.44, vol:false, mcap:"2.1B"  },
  { symbol:"AAVEUSD", name:"Aave",           cats:["ALL","DEFI","GAINERS"],                signal:"BUY",  conf:66, price:192,     change: 2.11,  vol:true,  mcap:"2.9B"  },
  { symbol:"UNIUSD",  name:"Uniswap",        cats:["ALL","DEFI","GAINERS"],                signal:"BUY",  conf:64, price:11.2,    change: 3.44,  vol:true,  mcap:"6.7B"  },
  { symbol:"MKRUSD",  name:"Maker",          cats:["ALL","DEFI","RWA"],                    signal:"HOLD", conf:49, price:2_840,   change:-0.88,  vol:false, mcap:"2.6B"  },
  { symbol:"IMXUSD",  name:"Immutable X",    cats:["ALL","GAMING","TRENDING","GAINERS"],   signal:"BUY",  conf:61, price:2.41,    change: 4.88,  vol:true,  mcap:"3.4B"  },
  { symbol:"AXSUSD",  name:"Axie Infinity",  cats:["ALL","GAMING"],                        signal:"HOLD", conf:42, price:7.2,     change:-1.44,  vol:false, mcap:"1.1B"  },
  { symbol:"GALUSD",  name:"Gala",           cats:["ALL","GAMING","VOLATILE"],             signal:"BUY",  conf:57, price:0.044,   change: 6.22,  vol:true,  mcap:"1.6B"  },
  { symbol:"ONDOUSD", name:"Ondo",           cats:["ALL","RWA","GAINERS","TRENDING"],      signal:"BUY",  conf:68, price:1.04,    change: 5.22,  vol:true,  mcap:"1.4B"  },
  { symbol:"PAXGUSD", name:"PAX Gold",        cats:["ALL","RWA"],                              signal:"HOLD", conf:45, price:2_340,  change: 0.32,  vol:false, mcap:"0.5B"  },
  // Equities & ETFs
  { symbol:"AAPL",    name:"Apple Inc.",      cats:["ALL","STOCKS","AI","GAINERS"],            signal:"BUY",  conf:71, price:189.4,  change: 1.22,  vol:true,  mcap:"2.94T" },
  { symbol:"NVDA",    name:"NVIDIA Corp.",    cats:["ALL","STOCKS","AI","GAINERS","TRENDING"], signal:"BUY",  conf:82, price:875.4,  change: 3.84,  vol:true,  mcap:"2.16T" },
  { symbol:"TSLA",    name:"Tesla Inc.",      cats:["ALL","STOCKS","VOLATILE"],                signal:"HOLD", conf:51, price:182.2,  change:-1.12,  vol:false, mcap:"580B"  },
  { symbol:"SPY",     name:"S&P 500 ETF",     cats:["ALL","STOCKS","ETF"],                     signal:"BUY",  conf:64, price:524.8,  change: 0.88,  vol:true,  mcap:"—"     },
  { symbol:"QQQ",     name:"Nasdaq 100 ETF",  cats:["ALL","STOCKS","ETF","GAINERS"],           signal:"BUY",  conf:68, price:448.2,  change: 1.44,  vol:true,  mcap:"—"     },
];

// ── Categories ─────────────────────────────────────────────────────────────────

interface CatDef { key: Cat; label: string; icon: string; accent: string }

const CATEGORIES: CatDef[] = [
  { key:"ALL",      label:"ALL",          icon:"grid",          accent: C.cyan   },
  { key:"TRENDING", label:"TRENDING",     icon:"trending-up",   accent: C.green  },
  { key:"AI",       label:"AI TOKENS",    icon:"cpu",           accent: C.purple },
  { key:"MEME",     label:"MEME",         icon:"smile",         accent: C.orange },
  { key:"DEFI",     label:"DEFI",         icon:"layers",        accent: C.teal   },
  { key:"L1",       label:"LAYER 1",      icon:"box",           accent: C.cyan   },
  { key:"GAMING",   label:"GAMING",       icon:"triangle",      accent: C.purple },
  { key:"RWA",      label:"RWA",          icon:"dollar-sign",   accent: C.green  },
  { key:"GAINERS",  label:"TOP GAINERS",  icon:"arrow-up-right",accent: C.green  },
  { key:"VOLATILE", label:"HIGH VOL",     icon:"activity",      accent: C.red    },
  { key:"STOCKS",   label:"STOCKS",       icon:"briefcase",     accent: C.teal   },
  { key:"ETF",      label:"ETFs",         icon:"bar-chart-2",   accent: C.green  },
];

// ── AI Scanning Pulse ──────────────────────────────────────────────────────────

const SCAN_MSGS = [
  "Scanning 1,240+ assets across crypto and equities…",
  "Detecting momentum signals on AI tokens and tech stocks…",
  "Analyzing cross-exchange volume anomalies…",
  "Running EMA breakout detection across L1s and ETFs…",
  "Evaluating NVDA, AAPL technical formations…",
  "Cross-correlating crypto and equities volatility…",
];

function ScanIndicator() {
  const [idx, setIdx] = useState(0);
  const fade          = useRef(new Animated.Value(1)).current;
  const dot           = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setIdx(i => (i + 1) % SCAN_MSGS.length);
        Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
      });
    }, 4000);
    Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();
    return () => clearInterval(t);
  }, []);

  const dotOp = dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <View style={scan.row}>
      <Animated.View style={[scan.dot, { opacity: dotOp }]} />
      <Animated.Text style={[scan.text, { opacity: fade }]}>{SCAN_MSGS[idx]}</Animated.Text>
    </View>
  );
}
const scan = StyleSheet.create({
  row:  { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 },
  dot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: C.cyan },
  text: { fontSize: 9, fontFamily: FONTS.mono, color: C.textSecondary, flex: 1 },
});

// ── Asset Card ────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: Asset }) {
  const priceStr = asset.price >= 1000
    ? `$${(asset.price / 1000).toFixed(1)}K`
    : asset.price >= 1 ? `$${asset.price.toFixed(2)}`
    : asset.price >= 0.01 ? `$${asset.price.toFixed(4)}`
    : `$${asset.price.toFixed(7)}`;

  const accent      = asset.signal === "BUY" ? C.green : asset.signal === "SELL" ? C.red : C.cyan;
  const changeColor = asset.change >= 0 ? C.green : C.red;
  const sparkDir    = asset.signal === "BUY" ? "up" : asset.signal === "SELL" ? "down" : "flat";
  const sparkData   = genSparkData(asset.symbol, sparkDir as "up" | "down" | "flat");

  return (
    <View style={[ac.card, {
      borderColor: `${accent}28`,
      shadowColor: accent, shadowOpacity: 0.10,
      shadowRadius: 14, shadowOffset: { width: 0, height: 3 }, elevation: 4,
    }]}>
      <View style={[ac.accent, { backgroundColor: accent }]} />
      <View style={ac.top}>
        <View style={ac.left}>
          <Text style={ac.symbol}>{asset.symbol.replace("USD", "")}</Text>
          <Text style={ac.name} numberOfLines={1}>{asset.name}</Text>
          <Text style={ac.mcap}>{asset.mcap}</Text>
        </View>
        <View style={ac.center}>
          <Text style={ac.price}>{priceStr}</Text>
          <Text style={[ac.change, { color: changeColor }]}>
            {asset.change >= 0 ? "+" : ""}{asset.change.toFixed(2)}%
          </Text>
        </View>
        <View style={ac.sparkWrap}>
          <MiniSparkline data={sparkData} color={accent} width={70} height={34} showFill strokeWidth={1.8} />
        </View>
        <View style={ac.right}>
          <SignalBadge signal={asset.signal} />
          <Text style={ac.conf}>{asset.conf}%</Text>
        </View>
      </View>
      <View style={ac.bottom}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            <Text style={ac.confLabel}>AI CONFIDENCE</Text>
            <View style={[ac.volChip, { borderColor: asset.vol ? `${C.green}35` : `${C.textDim}20` }]}>
              <Text style={[ac.volText, { color: asset.vol ? C.green : C.textDim }]}>
                {asset.vol ? "VOL ✓" : "VOL —"}
              </Text>
            </View>
          </View>
          <ConfidenceBar value={asset.conf} color={accent} />
        </View>
      </View>
    </View>
  );
}
const ac = StyleSheet.create({
  card:     { backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  accent:   { height: 1.5 },
  top:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  sparkWrap:{ justifyContent: "center" },
  left:     { width: 58 },
  symbol:   { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 0.3 },
  name:     { fontSize: 8, fontFamily: FONTS.mono, color: C.textMuted, marginTop: 1 },
  mcap:     { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, marginTop: 2 },
  center:   { flex: 1 },
  price:    { fontSize: 15, fontFamily: FONTS.monoBold, color: C.textPrimary },
  change:   { fontSize: 10, fontFamily: FONTS.monoMedium, marginTop: 3 },
  right:    { alignItems: "flex-end", gap: 5 },
  conf:     { fontSize: 8, fontFamily: FONTS.mono, color: C.textMuted },
  bottom:   { paddingHorizontal: 14, paddingBottom: 13 },
  confLabel:{ fontSize: 8, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1 },
  volChip:  { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  volText:  { fontSize: 7, fontFamily: FONTS.monoBold, letterSpacing: 0.6 },
});

// ── Markets Screen ────────────────────────────────────────────────────────────

export default function MarketsScreen() {
  const { engine, isLoading, refresh } = useTrading();
  const insets = useSafeAreaInsets();
  const isWeb  = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top + 10;
  const [activeCat, setActiveCat] = useState<Cat>("ALL");

  const filtered  = ALL_ASSETS.filter(a => a.cats.includes(activeCat));
  const catDef    = CATEGORIES.find(c => c.key === activeCat)!;

  const buyCount  = filtered.filter(a => a.signal === "BUY").length;
  const sellCount = filtered.filter(a => a.signal === "SELL").length;
  const bullish   = buyCount > sellCount ? "BULLISH" : buyCount < sellCount ? "BEARISH" : "SIDEWAYS";
  const regimeColor = bullish === "BULLISH" ? C.green : bullish === "BEARISH" ? C.red : C.cyan;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.scroll, { paddingTop: topPad, paddingBottom: TAB_BAR_H + 16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.cyan} />}
    >

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>AI SCANNER</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <LiveDot color={C.cyan} size={6} />
            <Text style={s.sub}>1,240+ ASSETS MONITORED</Text>
          </View>
        </View>
        <View style={[s.regimeBadge, {
          borderColor: `${regimeColor}40`, backgroundColor: `${regimeColor}10`,
          shadowColor: regimeColor, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4,
        }]}>
          <Text style={[s.regimeText, { color: regimeColor }]}>{bullish}</Text>
        </View>
      </View>

      {/* ── Scan Indicator ── */}
      <ScanIndicator />

      {/* ── Regime Summary ── */}
      <View style={s.regimeBar}>
        <View style={s.regimeSeg}>
          <Text style={[s.regimeNum, { color: C.green }]}>{buyCount}</Text>
          <Text style={s.regimeLabel}>BUY</Text>
        </View>
        <View style={[s.regimeSeg, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border }]}>
          <Text style={[s.regimeNum, { color: C.cyan }]}>{filtered.filter(a => a.signal === "HOLD").length}</Text>
          <Text style={s.regimeLabel}>HOLD</Text>
        </View>
        <View style={s.regimeSeg}>
          <Text style={[s.regimeNum, { color: C.red }]}>{sellCount}</Text>
          <Text style={s.regimeLabel}>SELL</Text>
        </View>
      </View>

      {/* ── Category Filter ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: "row", gap: 7, paddingRight: 8 }}>
          {CATEGORIES.map(cat => {
            const active = activeCat === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                onPress={() => setActiveCat(cat.key)}
                style={[
                  s.catBtn,
                  active && { borderColor: `${cat.accent}55`, backgroundColor: `${cat.accent}12`,
                    shadowColor: cat.accent, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
                ]}
                activeOpacity={0.75}
              >
                <Feather name={cat.icon as any} size={10} color={active ? cat.accent : C.textDim} />
                <Text style={[s.catText, active && { color: cat.accent }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Asset Count ── */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <View style={{ width: 3, height: 14, backgroundColor: catDef.accent, borderRadius: 2, marginRight: 10, opacity: 0.85 }} />
        <Text style={{ fontSize: 9, fontFamily: FONTS.monoBold, color: `${catDef.accent}88`, letterSpacing: 2, flex: 1 }}>
          {catDef.label}
        </Text>
        <Text style={{ fontSize: 9, fontFamily: FONTS.mono, color: C.textDim }}>
          {filtered.length} assets
        </Text>
      </View>

      {/* ── Assets ── */}
      {filtered.map((a, i) => <AssetCard key={a.symbol + i} asset={a} />)}

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  title:  { fontSize: 22, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 1.5 },
  sub:    { fontSize: 8, fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1 },

  regimeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.md, borderWidth: 1 },
  regimeText:  { fontSize: 10, fontFamily: FONTS.monoBold, letterSpacing: 1.2 },

  regimeBar: {
    flexDirection: "row", backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.border, marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  regimeSeg:   { flex: 1, alignItems: "center", paddingVertical: 12 },
  regimeNum:   { fontSize: 20, fontFamily: FONTS.monoBold },
  regimeLabel: { fontSize: 8, fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1.2, marginTop: 2 },

  catBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  catText: { fontSize: 9, fontFamily: FONTS.monoMedium, color: C.textDim, letterSpacing: 0.5 },
});
