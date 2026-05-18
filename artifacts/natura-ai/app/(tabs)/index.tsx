import React, { useRef, useEffect, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Animated, Platform,
} from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTrading, fmt$ } from "@/contexts/TradingContext";
import { useUser } from "@/contexts/UserContext";
import { C, FONTS, SPACE, SHADOWS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ─────────────────────────────────────────────────────────────────────────────
// AICandlez Mobile Home — premium neon-green fintech UI
// Matches concept: Greeting + Portfolio hero card + Quick Actions +
// AI Market Insight + Top Gainers + Active Trades
// ─────────────────────────────────────────────────────────────────────────────

// ── Utility: deterministic chart points ─────────────────────────────────────
function genPts(seed: string, trend: "up"|"down"|"flat", count = 36): number[] {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s<<5)+s) ^ seed.charCodeAt(i)) >>> 0;
  const rand = () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return (s>>>0)/0x100000000; };
  const dir = trend === "up" ? 1.4 : trend === "down" ? -1.4 : 0.05;
  const pts: number[] = []; let v = 50;
  for (let i = 0; i < count; i++) {
    v = Math.max(8, Math.min(92, v + (rand()-0.5)*7 + dir));
    pts.push(v);
  }
  return pts;
}
function smoothPath(pts: {x:number;y:number}[]): string {
  const t = 0.33;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length-1; i++) {
    const p0 = pts[Math.max(0,i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1,i+2)];
    const cp1x = p1.x + (p2.x-p0.x)*t, cp1y = p1.y + (p2.y-p0.y)*t;
    const cp2x = p2.x - (p3.x-p1.x)*t, cp2y = p2.y - (p3.y-p1.y)*t;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
function fmtPx(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

const SYM_LABEL: Record<string, string> = { BTCUSD: "Bitcoin", ETHUSD: "Ethereum", SOLUSD: "Solana", ADAUSD: "Cardano" };
const SYM_SHORT: Record<string, string> = { BTCUSD: "BTC", ETHUSD: "ETH", SOLUSD: "SOL", ADAUSD: "ADA" };
const SYM_ACCENT: Record<string, string> = {
  BTCUSD: "#F7931A", ETHUSD: "#627EEA", SOLUSD: "#14F195", ADAUSD: "#0033AD",
};

// ── Ambient Background ─────────────────────────────────────────────────────
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
    make(a1, 7000, 0).start();
    make(a2, 9000, 2000).start();
    make(a3, 8000, 4000).start();
  }, []);

  const op1 = a1.interpolate({ inputRange: [0,1], outputRange: [0.05, 0.18] });
  const op2 = a2.interpolate({ inputRange: [0,1], outputRange: [0.04, 0.13] });
  const op3 = a3.interpolate({ inputRange: [0,1], outputRange: [0.03, 0.10] });

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[amb.blob, { top: -100, right: -80,  width: 340, height: 340, backgroundColor: C.brand,     borderRadius: 170, opacity: op1 }]} />
      <Animated.View style={[amb.blob, { top: 360, left: -100,   width: 300, height: 300, backgroundColor: C.brandDeep, borderRadius: 150, opacity: op2 }]} />
      <Animated.View style={[amb.blob, { top: 660, right: -120,  width: 280, height: 280, backgroundColor: C.brandBright, borderRadius: 140, opacity: op3 }]} />
    </View>
  );
}
const amb = StyleSheet.create({ blob: { position: "absolute" } });

// ── Mini sparkline ─────────────────────────────────────────────────────────
function Sparkline({ seed, trend, w = 72, h = 30, color = C.brand }: {
  seed: string; trend: "up"|"down"|"flat"; w?: number; h?: number; color?: string;
}) {
  const raw = genPts(seed, trend, 24);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn || 1;
  const pts = raw.map((p, i) => ({ x: (i/(raw.length-1))*w, y: h-3-((p-mn)/rng)*(h-6) }));
  const d = smoothPath(pts);
  const last = pts[pts.length-1];
  const gid = `sg-${seed.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <Stop offset="100%" stopColor={color} stopOpacity="0"    />
        </LinearGradient>
      </Defs>
      <Path d={`${d} L ${last.x},${h} L 0,${h} Z`} fill={`url(#${gid})`} />
      <Path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Circle cx={last.x} cy={last.y} r={2.2} fill={color}/>
    </Svg>
  );
}

// ── Hero chart (large) ─────────────────────────────────────────────────────
function HeroChart({ seed, isUp, width }: { seed: string; isUp: boolean; width: number }) {
  const h = 92;
  const color = isUp ? C.brand : C.negative;
  const raw = genPts(seed, isUp ? "up" : "down", 44);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn || 1;
  const pts = raw.map((p, i) => ({ x: (i/(raw.length-1))*width, y: h-4-((p-mn)/rng)*(h-8) }));
  const d = smoothPath(pts);
  const last = pts[pts.length-1];
  return (
    <Svg width={width} height={h}>
      <Defs>
        <LinearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={color} stopOpacity="0.4"  />
          <Stop offset="60%"  stopColor={color} stopOpacity="0.08" />
          <Stop offset="100%" stopColor={color} stopOpacity="0"    />
        </LinearGradient>
        <LinearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%"   stopColor={C.brandDeep} />
          <Stop offset="50%"  stopColor={color}/>
          <Stop offset="100%" stopColor={C.brandBright}/>
        </LinearGradient>
      </Defs>
      <Path d={`${d} L ${last.x},${h} L 0,${h} Z`} fill="url(#hero-area)"/>
      <Path d={d} fill="none" stroke="url(#hero-line)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/>
      <Circle cx={last.x} cy={last.y} r={3} fill={color}/>
    </Svg>
  );
}

// ── Confidence bar ─────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: Math.min(100, Math.max(0, value)), duration: 900, useNativeDriver: false }).start();
  }, [value]);
  const widthInterp = w.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
  return (
    <View style={cb.track}>
      <Animated.View style={[cb.fill, { width: widthInterp }]} />
    </View>
  );
}
const cb = StyleSheet.create({
  track: { height: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" },
  fill:  { height: "100%", borderRadius: 999, backgroundColor: C.brand, ...SHADOWS.bloomSm },
});

// ── Asset icon ─────────────────────────────────────────────────────────────
function AssetIcon({ sym, size = 36 }: { sym: string; size?: number }) {
  const short = sym.replace("USD", "").replace("USDT", "").slice(0, 3);
  const accent = SYM_ACCENT[sym] ?? C.brandDeep;
  return (
    <View style={[ai.wrap, {
      width: size, height: size, borderRadius: size/2,
      backgroundColor: `${accent}22`,
      borderColor: `${accent}55`,
      shadowColor: accent, shadowOpacity: 0.25, shadowRadius: 10,
    }]}>
      <Text style={[ai.letter, { color: accent, fontSize: size*0.36 }]}>{short[0]}</Text>
    </View>
  );
}
const ai = StyleSheet.create({
  wrap: { borderWidth: 1, alignItems: "center", justifyContent: "center", shadowOffset: { width: 0, height: 0 } },
  letter: { fontFamily: FONTS.monoBold, letterSpacing: -0.3 },
});

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ label, onMore, right }: { label: string; onMore?: () => void; right?: string }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.left}>
        <View style={sh.bar} />
        <Text style={sh.label}>{label}</Text>
        {right && <Text style={sh.right}> · {right}</Text>}
      </View>
      {onMore && (
        <TouchableOpacity onPress={onMore} hitSlop={8}>
          <Text style={sh.more}>View All →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingTop: SPACE.xxl, paddingBottom: 10 },
  left:  { flexDirection: "row", alignItems: "center", gap: 9 },
  bar:   { width: 3, height: 14, borderRadius: 2, backgroundColor: C.brand, ...SHADOWS.bloomSm },
  label: { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: -0.1 },
  right: { fontSize: 10, fontFamily: FONTS.mono, color: C.textDim },
  more:  { fontSize: 11, fontFamily: FONTS.monoSemi, color: C.brand },
});

// ── Quick Action tile ──────────────────────────────────────────────────────
function QuickAction({ icon, label, onPress, accent = C.brand }: {
  icon: string; label: string; onPress: () => void; accent?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={qa.wrap}>
      <View style={[qa.iconWrap, {
        backgroundColor: `${accent}1F`, borderColor: `${accent}40`,
        shadowColor: accent, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4,
      }]}>
        <Feather name={icon as any} size={18} color={accent} />
      </View>
      <Text style={qa.label}>{label}</Text>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  wrap:     { flex: 1, alignItems: "center", paddingVertical: 14, paddingHorizontal: 4, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: C.border, gap: 8 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  label:    { fontSize: 11, fontFamily: FONTS.monoSemi, color: C.textSecondary, letterSpacing: 0.1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Home Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { engine, account, positions, isLoading, refresh, alpacaAccount } = useTrading();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useUser();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 24 : insets.top + 6;

  const firstName = (profile?.name?.trim().split(/\s+/)[0]) || "Trader";
  const initial = firstName[0]?.toUpperCase() ?? "T";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const equity = account.equity;
  // SimAccount uses `unrealizedPnL` if present, otherwise fall back to dailyPnL/0
  const upnl: number =
    (account as any).unrealizedPnL
    ?? (account as any).dailyPnL
    ?? positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const upnlPct = equity > 0 ? (upnl / equity) * 100 : 0;
  const isUp = upnl >= 0;

  // ── AI top insight from engine signals ────────────────────────────────────
  const topInsight = useMemo(() => {
    const breakdowns = (engine?.symbolBreakdowns as any[]) ?? [];
    const candidates = breakdowns
      .filter(b => b.signal && b.signal !== "HOLD")
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const pick = candidates[0];
    return {
      symbol:     pick?.symbol ?? "BTCUSD",
      action:     (pick?.signal ?? "BUY") as string,
      confidence: pick?.confidence ?? 87,
      price:      pick?.price ?? 67_842.63,
      pct:        pick?.changePct ?? 2.35,
    };
  }, [engine?.symbolBreakdowns]);

  // ── Top gainers fallback ──────────────────────────────────────────────────
  const topGainers = useMemo(() => {
    const breakdowns = (engine?.symbolBreakdowns as any[]) ?? [];
    const list = breakdowns
      .filter(b => (b.changePct ?? 0) > 0)
      .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
      .slice(0, 3);
    if (list.length >= 3) return list;
    return [
      { symbol: "SOLUSD", price: 172.36,   changePct: 6.21 },
      { symbol: "ETHUSD", price: 3486.59,  changePct: 4.32 },
      { symbol: "ADAUSD", price: 0.6421,   changePct: 3.18 },
    ];
  }, [engine?.symbolBreakdowns]);

  const cashBP = alpacaAccount?.buyingPower ?? account.cashBalance;

  return (
    <View style={s.root}>
      <AmbientBackground />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: topPad, paddingBottom: TAB_BAR_H + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.brand} />}
      >

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.push("/profile")} activeOpacity={0.7} style={s.headerLeft}>
            <View style={s.avatar}>
              <Text style={s.avatarLetter}>{initial}</Text>
              <View style={s.avatarDot} />
            </View>
            <View>
              <Text style={s.greet}>{greeting},</Text>
              <View style={s.nameRow}>
                <Text style={s.name}>{firstName}</Text>
                <View style={s.proPill}>
                  <Text style={s.proText}>PRO</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={s.bellBtn} activeOpacity={0.7}>
            <Feather name="bell" size={18} color={C.textSecondary} />
            <View style={s.bellDot} />
          </TouchableOpacity>
        </View>

        {/* ── Portfolio Hero Card ── */}
        <View style={s.heroCard}>
          <View style={s.heroEdge} />
          <View style={s.heroLabelRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={s.heroLabel}>TOTAL PORTFOLIO VALUE</Text>
              <Feather name="eye" size={12} color={C.textDim} />
            </View>
            <View style={s.tfPill}>
              <Text style={s.tfText}>24H</Text>
              <Feather name="chevron-down" size={11} color={C.textSecondary} />
            </View>
          </View>

          <Text style={s.heroValue}>{fmt$(equity, 2)}</Text>

          <View style={s.heroPnlRow}>
            <Text style={[s.heroPnl, { color: isUp ? C.brand : C.negative }]}>
              {isUp ? "+" : ""}{fmt$(Math.abs(upnl))}
            </Text>
            <Text style={[s.heroPnlPct, { color: isUp ? C.brand : C.negative }]}>
              ({isUp ? "+" : ""}{upnlPct.toFixed(2)}%)
            </Text>
            <Text style={s.heroPnlTag}>Today</Text>
          </View>

          <View style={s.heroChartWrap}>
            <HeroChart seed={`pf-${Math.floor(equity)}`} isUp={isUp} width={290} />
          </View>

          <View style={s.heroStatsRow}>
            {[
              { l: "AVAILABLE", v: fmt$(cashBP, 0) },
              { l: "POSITIONS", v: String(positions.length) },
              { l: "WIN RATE",  v: `${account.winRate.toFixed(0)}%`,
                c: account.winRate >= 55 ? C.brand : C.warning },
            ].map((st, i) => (
              <View key={i} style={s.heroStat}>
                <Text style={s.heroStatLabel}>{st.l}</Text>
                <Text style={[s.heroStatValue, { color: (st as any).c ?? C.textPrimary }]}>{st.v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View style={s.quickRow}>
          <QuickAction icon="maximize"     label="AI Scan"     onPress={() => router.push("/(tabs)/markets")} accent={C.brand}/>
          <QuickAction icon="trending-up"  label="Open Trades" onPress={() => router.push("/(tabs)/trade")}   accent={C.brandBright}/>
          <QuickAction icon="cpu"          label="Auto Trade"  onPress={() => router.push("/profile")}        accent={C.brandDeep}/>
          <QuickAction icon="plus"         label="Deposit"     onPress={() => router.push("/profile")}        accent={C.brand}/>
        </View>

        {/* ── AI Market Insight ── */}
        <SectionHeader label="AI Market Insight" onMore={() => router.push("/(tabs)/markets")} />
        <View style={s.insightCard}>
          <View style={s.insightAssetRow}>
            <AssetIcon sym={topInsight.symbol} size={40} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.assetTitle}>
                  {SYM_SHORT[topInsight.symbol] ?? topInsight.symbol.replace("USD","")}/USDT
                </Text>
                <View style={[s.actionPill, {
                  backgroundColor: topInsight.action === "BUY" ? `${C.brand}1F` : `${C.negative}1F`,
                  borderColor:     topInsight.action === "BUY" ? C.borderHi      : "rgba(255,64,96,0.30)",
                }]}>
                  <Text style={[s.actionPillText, { color: topInsight.action === "BUY" ? C.brand : C.negative }]}>
                    {topInsight.action === "BUY" ? "BULLISH" : "BEARISH"}
                  </Text>
                </View>
              </View>
              <Text style={s.assetSub}>{SYM_LABEL[topInsight.symbol] ?? topInsight.symbol}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.assetPrice}>{fmtPx(topInsight.price)}</Text>
              <Text style={[s.assetPct, { color: topInsight.pct >= 0 ? C.brand : C.negative }]}>
                {topInsight.pct >= 0 ? "+" : ""}{topInsight.pct.toFixed(2)}%
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <View style={s.confRow}>
              <Text style={s.confLabel}>AI CONFIDENCE</Text>
              <Text style={s.confValue}>{topInsight.confidence}%</Text>
            </View>
            <ConfidenceBar value={topInsight.confidence} />
          </View>

          <View style={s.reasonBox}>
            <Feather name="zap" size={14} color={C.brand} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.reasonHead}>
                Strong {topInsight.action === "BUY" ? "buying" : "selling"} momentum detected
              </Text>
              <Text style={s.reasonBody}>
                High probability of {topInsight.action === "BUY" ? "upward" : "downward"} movement
              </Text>
              <Text style={s.reasonAge}>2 MIN AGO</Text>
            </View>
          </View>
        </View>

        {/* ── Top Gainers ── */}
        <SectionHeader label="Top Gainers" onMore={() => router.push("/(tabs)/markets")} />
        <View style={s.listCard}>
          {topGainers.map((g, i) => (
            <TouchableOpacity
              key={g.symbol}
              onPress={() => router.push("/(tabs)/markets")}
              activeOpacity={0.7}
              style={[s.gainerRow, i < topGainers.length - 1 && s.gainerSep]}>
              <AssetIcon sym={g.symbol} size={36} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.gainerSym}>{SYM_SHORT[g.symbol] ?? g.symbol.replace("USD","")}/USDT</Text>
                <Text style={s.gainerLabel}>{SYM_LABEL[g.symbol] ?? g.symbol}</Text>
              </View>
              <Sparkline seed={`gain-${g.symbol}`} trend="up" w={56} h={26} />
              <View style={{ alignItems: "flex-end", marginLeft: 10, minWidth: 76 }}>
                <Text style={s.gainerPrice}>{fmtPx(g.price)}</Text>
                <Text style={s.gainerPct}>+{(g.changePct ?? 0).toFixed(2)}%</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Active Trades ── */}
        <SectionHeader
          label="Active Trades"
          right={`${positions.length} open`}
          onMore={() => router.push("/(tabs)/trade")}
        />
        {positions.length === 0 ? (
          <View style={s.emptyBox}>
            <Feather name="activity" size={20} color={C.textDim} />
            <Text style={s.emptyText}>No open positions. AI is scanning the market.</Text>
          </View>
        ) : (
          positions.slice(0, 3).map((p, i) => {
            const isLong = (p.side ?? "BUY") === "BUY";
            const upnlVal = p.pnl ?? 0;
            const roe = p.pnlPct ?? 0;
            return (
              <View key={i} style={s.tradeCard}>
                <View style={s.tradeHead}>
                  <View style={[s.actionPill, {
                    backgroundColor: isLong ? `${C.brand}1F` : `${C.negative}1F`,
                    borderColor:     isLong ? C.borderHi : "rgba(255,64,96,0.30)",
                  }]}>
                    <Text style={[s.actionPillText, { color: isLong ? C.brand : C.negative }]}>
                      {isLong ? "LONG" : "SHORT"}
                    </Text>
                  </View>
                  <Text style={s.tradeSym}>
                    {SYM_SHORT[p.symbol] ?? p.symbol.replace("USD","")}/USDT
                  </Text>
                  <Text style={s.tradeMeta}>
                    Cross {(p as any).leverage ?? 1}x
                  </Text>
                </View>
                <View style={s.tradeBody}>
                  <View>
                    <Text style={s.tradeStatLabel}>UNREALIZED P&amp;L</Text>
                    <Text style={[s.tradeStatValue, { color: upnlVal >= 0 ? C.brand : C.negative }]}>
                      {upnlVal >= 0 ? "+" : ""}{fmt$(Math.abs(upnlVal))}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.tradeStatLabel}>ROE</Text>
                    <Text style={[s.tradeStatValue, { color: upnlVal >= 0 ? C.brand : C.negative, fontSize: 14 }]}>
                      {upnlVal >= 0 ? "+" : ""}{Number(roe).toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Subtle footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            {engine?.mode === "LIVE" ? "LIVE MODE · REAL CAPITAL" : "SIMULATION · NO REAL FUNDS"}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },

  // Header
  header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 6, marginBottom: 14 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    position: "relative", width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#0F1F18", borderWidth: 1.5, borderColor: C.borderHi,
    alignItems: "center", justifyContent: "center", ...SHADOWS.bloomSm,
  },
  avatarLetter: { fontSize: 17, fontFamily: FONTS.monoBold, color: C.brand },
  avatarDot:    { position: "absolute", bottom: -1, right: -1, width: 11, height: 11, borderRadius: 6, backgroundColor: C.brand, borderWidth: 2, borderColor: C.bg },
  greet:        { fontSize: 11, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.1 },
  nameRow:      { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 1 },
  name:         { fontSize: 16, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: -0.2 },
  proPill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${C.brand}22`, borderWidth: 1, borderColor: C.borderHi },
  proText:      { fontSize: 9, fontFamily: FONTS.monoBold, color: C.brand, letterSpacing: 1 },
  bellBtn:      { position: "relative", width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  bellDot:      { position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: C.negative },

  // Hero card
  heroCard: {
    position: "relative",
    borderRadius: 24, padding: 20, marginBottom: 16, overflow: "hidden",
    backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.borderHi,
    ...SHADOWS.cardLg,
  },
  heroEdge: {
    position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
    backgroundColor: C.brand, opacity: 0.55,
  },
  heroLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroLabel:    { fontSize: 10, fontFamily: FONTS.monoBold, color: C.textDim, letterSpacing: 1.5 },
  tfPill:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.border },
  tfText:       { fontSize: 10, fontFamily: FONTS.monoSemi, color: C.textSecondary, letterSpacing: 0.5 },
  heroValue:    { fontSize: 38, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: -1, marginTop: 10 },
  heroPnlRow:   { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  heroPnl:      { fontSize: 14, fontFamily: FONTS.monoBold, letterSpacing: -0.1 },
  heroPnlPct:   { fontSize: 12, fontFamily: FONTS.monoSemi, opacity: 0.9 },
  heroPnlTag:   { fontSize: 11, fontFamily: FONTS.mono, color: C.textDim, marginLeft: 2 },
  heroChartWrap:{ marginTop: 14, marginBottom: 4, marginLeft: -4 },
  heroStatsRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, marginTop: 10, gap: 10 },
  heroStat:     { flex: 1 },
  heroStatLabel:{ fontSize: 9, fontFamily: FONTS.monoBold, color: C.textDim, letterSpacing: 1 },
  heroStatValue:{ fontSize: 14, fontFamily: FONTS.monoBold, color: C.textPrimary, marginTop: 3, letterSpacing: -0.2 },

  // Quick actions
  quickRow: { flexDirection: "row", gap: 10 },

  // Insight card
  insightCard: {
    borderRadius: 18, padding: 16, marginBottom: 4,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    ...SHADOWS.card,
  },
  insightAssetRow: { flexDirection: "row", alignItems: "center" },
  assetTitle:      { fontSize: 14, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: -0.1 },
  assetSub:        { fontSize: 11, fontFamily: FONTS.mono, color: C.textDim, marginTop: 2 },
  assetPrice:      { fontSize: 15, fontFamily: FONTS.monoBold, color: C.textPrimary },
  assetPct:        { fontSize: 11, fontFamily: FONTS.monoSemi, marginTop: 2 },
  actionPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  actionPillText:  { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
  confRow:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  confLabel:       { fontSize: 10, fontFamily: FONTS.monoSemi, color: C.textDim, letterSpacing: 0.8 },
  confValue:       { fontSize: 13, fontFamily: FONTS.monoBold, color: C.brand },
  reasonBox: {
    flexDirection: "row", marginTop: 12, padding: 12, borderRadius: 10,
    backgroundColor: "rgba(102,255,102,0.04)", borderWidth: 1, borderColor: C.borderHi,
  },
  reasonHead: { fontSize: 12, fontFamily: FONTS.monoSemi, color: C.textPrimary, lineHeight: 17 },
  reasonBody: { fontSize: 11, fontFamily: FONTS.mono, color: C.textSecondary, marginTop: 3, lineHeight: 16 },
  reasonAge:  { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textDim, marginTop: 6, letterSpacing: 0.4 },

  // List card
  listCard: { borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  gainerRow:{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  gainerSep:{ borderBottomWidth: 1, borderBottomColor: C.border },
  gainerSym:{ fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: -0.1 },
  gainerLabel:{ fontSize: 11, fontFamily: FONTS.mono, color: C.textDim, marginTop: 2 },
  gainerPrice:{ fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary },
  gainerPct:  { fontSize: 11, fontFamily: FONTS.monoSemi, color: C.brand, marginTop: 2 },

  // Trade card
  tradeCard:    { marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, ...SHADOWS.card },
  tradeHead:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  tradeSym:     { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary },
  tradeMeta:    { fontSize: 10, fontFamily: FONTS.mono, color: C.textDim, marginLeft: "auto" },
  tradeBody:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  tradeStatLabel:{ fontSize: 9, fontFamily: FONTS.monoBold, color: C.textDim, letterSpacing: 0.8 },
  tradeStatValue:{ fontSize: 18, fontFamily: FONTS.monoBold, marginTop: 3, letterSpacing: -0.3 },

  emptyBox: { padding: 20, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderStyle: "dashed", alignItems: "center", gap: 8 },
  emptyText:{ fontSize: 12, fontFamily: FONTS.mono, color: C.textDim, textAlign: "center" },

  footer:    { alignItems: "center", paddingVertical: 18 },
  footerText:{ fontSize: 9, fontFamily: FONTS.monoBold, color: C.textDim, letterSpacing: 1.2 },
});
