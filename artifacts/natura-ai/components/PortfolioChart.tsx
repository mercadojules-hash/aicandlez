import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Path, Defs, LinearGradient, Stop, Circle,
} from "react-native-svg";
import { C, FONTS, RADIUS } from "@/constants/theme";

// ── Data generation ────────────────────────────────────────────────────────────

type TF = "1D" | "1W" | "1M" | "3M" | "ALL";

interface TFConfig {
  key: TF; label: string;
  points: number; start: number; end: number; seed: number;
}

const TIMEFRAMES: TFConfig[] = [
  { key: "1D",  label: "1D",  points: 24, start: 103_540, end: 103_820, seed: 1.2 },
  { key: "1W",  label: "1W",  points: 28, start:  99_200, end: 103_820, seed: 2.1 },
  { key: "1M",  label: "1M",  points: 30, start:  95_100, end: 103_820, seed: 0.7 },
  { key: "3M",  label: "3M",  points: 45, start:  88_400, end: 103_820, seed: 3.4 },
  { key: "ALL", label: "ALL", points: 60, start: 100_000, end: 103_820, seed: 1.8 },
];

function genCurve(cfg: TFConfig): number[] {
  const { points, start, end, seed } = cfg;
  const data = [start];
  for (let i = 1; i < points; i++) {
    const trend = (end - start) / points;
    const vol   = start * 0.006;
    const noise = (Math.sin(i * 2.3 + seed) * 0.6 + Math.cos(i * 1.7 + seed * 0.5) * 0.4) * vol;
    data.push(data[i - 1] + trend + noise);
  }
  return data;
}

function makePaths(
  data: number[], w: number, h: number, pad = 6,
): { line: string; fill: string; lastX: number; lastY: number } {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: pad + (1 - (v - min) / range) * (h - pad * 2),
  }));

  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cpx = (pts[i].x + pts[i + 1].x) / 2;
    line += ` C ${cpx.toFixed(1)} ${pts[i].y.toFixed(1)} ${cpx.toFixed(1)} ${pts[i + 1].y.toFixed(1)} ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  const fill = `${line} L ${last.x.toFixed(1)} ${h} L ${pts[0].x.toFixed(1)} ${h} Z`;
  return { line, fill, lastX: last.x, lastY: last.y };
}

// ── Pulsing cursor ─────────────────────────────────────────────────────────────

function PulseCursor({ x, y, color }: { x: number; y: number; color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800,  useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  return (
    <View style={[cur.wrap, { left: x - 10, top: y - 10 }]}>
      <Animated.View style={[cur.ring, { transform: [{ scale }], opacity, borderColor: color }]} />
      <View style={[cur.dot, { backgroundColor: color }]} />
    </View>
  );
}
const cur = StyleSheet.create({
  wrap: { position: "absolute", width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  dot:  { width: 6, height: 6, borderRadius: 3 },
});

// ── Portfolio Chart ────────────────────────────────────────────────────────────

export function PortfolioChart({ equity = 103_820 }: { equity?: number }) {
  const { width: screenW } = useWindowDimensions();
  const chartW = Math.max(screenW - 32, 200);
  const chartH = 164;

  const [tf, setTf]           = useState<TF>("1W");
  const fadeAnim              = useRef(new Animated.Value(1)).current;
  const translateAnim         = useRef(new Animated.Value(0)).current;

  const cfg  = TIMEFRAMES.find(t => t.key === tf)!;
  const data = genCurve(cfg);
  const { line, fill, lastX, lastY } = makePaths(data, chartW, chartH);

  const change    = data[data.length - 1] - data[0];
  const changePct = (change / data[0]) * 100;
  const isPos     = change >= 0;
  const lineColor = isPos ? C.green : C.red;
  const gradId    = `grad_${tf}`;
  const fillGradId = `fillGrad_${tf}`;

  const handleTf = (next: TF) => {
    if (next === tf) return;
    Animated.parallel([
      Animated.timing(fadeAnim,      { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(translateAnim, { toValue: 6, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setTf(next);
      Animated.parallel([
        Animated.timing(fadeAnim,      { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(translateAnim, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
      ]).start();
    });
  };

  return (
    <View style={s.card}>
      {/* Period change */}
      <View style={s.changeRow}>
        <Text style={[s.changeAmt, { color: lineColor }]}>
          {isPos ? "+" : ""}${Math.abs(change).toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </Text>
        <View style={[s.pctBadge, { backgroundColor: `${lineColor}12`, borderColor: `${lineColor}30` }]}>
          <Text style={[s.pctText, { color: lineColor }]}>
            {isPos ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
          </Text>
        </View>
        <Text style={s.periodLabel}>{cfg.label} period</Text>
      </View>

      {/* SVG Chart */}
      <Animated.View
        style={[s.chartWrap, { opacity: fadeAnim, transform: [{ translateY: translateAnim }] }]}
      >
        <Svg width={chartW} height={chartH}>
          <Defs>
            <LinearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={lineColor} stopOpacity={0.22} />
              <Stop offset="60%"  stopColor={lineColor} stopOpacity={0.06} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0}    />
            </LinearGradient>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%"   stopColor={lineColor} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={1}   />
            </LinearGradient>
          </Defs>
          {/* Area fill */}
          <Path d={fill} fill={`url(#${fillGradId})`} />
          {/* Glow layer */}
          <Path d={line} stroke={lineColor} strokeWidth={8} fill="none" strokeOpacity={0.07} strokeLinecap="round" strokeLinejoin="round" />
          {/* Main line */}
          <Path d={line} stroke={`url(#${gradId})`} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <PulseCursor x={lastX} y={lastY} color={lineColor} />
      </Animated.View>

      {/* Timeframe tabs */}
      <View style={s.tfRow}>
        {TIMEFRAMES.map(t => {
          const active = t.key === tf;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => handleTf(t.key)}
              style={[s.tfBtn, active && { backgroundColor: `${lineColor}15`, borderColor: `${lineColor}40` }]}
              activeOpacity={0.75}
            >
              <Text style={[s.tfText, { color: active ? lineColor : C.textDim }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:      { marginBottom: 14 },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, paddingHorizontal: 2 },
  changeAmt: { fontSize: 15, fontFamily: FONTS.monoBold, letterSpacing: 0.3 },
  pctBadge:  { flexDirection: "row", alignItems: "center", borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  pctText:   { fontSize: 10, fontFamily: FONTS.monoBold, letterSpacing: 0.4 },
  periodLabel: { flex: 1, textAlign: "right", fontSize: 9, fontFamily: FONTS.mono, color: C.textDim },
  chartWrap: { borderRadius: RADIUS.lg, overflow: "hidden" },
  tfRow:     { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  tfBtn:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: "transparent" },
  tfText:    { fontSize: 10, fontFamily: FONTS.monoBold, letterSpacing: 0.4 },
});
