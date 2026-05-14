import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Path, Defs, LinearGradient, Stop, Circle, Line,
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
  data: number[], w: number, h: number, pad = 8,
): { line: string; fill: string; lastX: number; lastY: number } {
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 1;
  const pts   = data.map((v, i) => ({
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
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse1, { toValue: 0, duration: 600,  useNativeDriver: true }),
      ])
    ).start();
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse2, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(pulse2, { toValue: 0, duration: 600,  useNativeDriver: true }),
        ])
      ).start();
    }, 700);
  }, []);

  const scale1   = pulse1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const opacity1 = pulse1.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.7, 0.3, 0] });
  const scale2   = pulse2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const opacity2 = pulse2.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.5, 0.2, 0] });

  return (
    <View style={[cur.wrap, { left: x - 12, top: y - 12 }]}>
      <Animated.View style={[cur.ring, { transform: [{ scale: scale1 }], opacity: opacity1, borderColor: color }]} />
      <Animated.View style={[cur.ring, { transform: [{ scale: scale2 }], opacity: opacity2, borderColor: color }]} />
      <View style={[cur.dot, { backgroundColor: color, shadowColor: color, shadowOpacity: 0.8, shadowRadius: 4 }]} />
    </View>
  );
}
const cur = StyleSheet.create({
  wrap: { position: "absolute", width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  dot:  { width: 7, height: 7, borderRadius: 3.5, shadowOffset: { width: 0, height: 0 } },
});

// ── Grid lines ─────────────────────────────────────────────────────────────────

function GridLines({ w, h, pad = 8, color }: { w: number; h: number; pad: number; color: string }) {
  const steps = [0.25, 0.5, 0.75];
  return (
    <>
      {steps.map((t, i) => {
        const y = pad + t * (h - pad * 2);
        return (
          <Line
            key={i}
            x1={pad} y1={y} x2={w - pad} y2={y}
            stroke={color} strokeWidth={0.5} strokeOpacity={0.18}
            strokeDasharray="3 6"
          />
        );
      })}
    </>
  );
}

// ── Portfolio Chart ────────────────────────────────────────────────────────────

export function PortfolioChart({ equity = 103_820 }: { equity?: number }) {
  const { width: screenW } = useWindowDimensions();
  const chartW = Math.max(screenW - 32, 200);
  const chartH = 184;
  const PAD    = 8;

  const [tf, setTf]   = useState<TF>("1W");
  const fadeAnim      = useRef(new Animated.Value(1)).current;
  const slideAnim     = useRef(new Animated.Value(0)).current;

  const cfg  = TIMEFRAMES.find(t => t.key === tf)!;
  const data = genCurve(cfg);
  const { line, fill, lastX, lastY } = makePaths(data, chartW, chartH, PAD);

  const change    = data[data.length - 1] - data[0];
  const changePct = (change / data[0]) * 100;
  const isPos     = change >= 0;
  const lineColor = isPos ? C.green : C.red;

  const handleTf = (next: TF) => {
    if (next === tf) return;
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 8, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setTf(next);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 220 }),
      ]).start();
    });
  };

  return (
    <View style={s.card}>
      {/* Ambient top glow */}
      <View style={[s.ambientGlow, { backgroundColor: lineColor }]} />

      {/* Period change row */}
      <View style={s.changeRow}>
        <Text style={[s.changeAmt, { color: lineColor }]}>
          {isPos ? "+" : "−"}${Math.abs(change).toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </Text>
        <View style={[s.pctBadge, { backgroundColor: `${lineColor}14`, borderColor: `${lineColor}35` }]}>
          <Text style={[s.pctText, { color: lineColor }]}>
            {isPos ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
          </Text>
        </View>
        <Text style={s.periodLabel}>{cfg.label} period</Text>
      </View>

      {/* SVG Chart */}
      <Animated.View
        style={[s.chartWrap, {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          shadowColor: lineColor,
        }]}
      >
        <Svg width={chartW} height={chartH}>
          <Defs>
            <LinearGradient id={`fill_${tf}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={lineColor} stopOpacity={0.28} />
              <Stop offset="55%"  stopColor={lineColor} stopOpacity={0.08} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0}    />
            </LinearGradient>
            <LinearGradient id={`stroke_${tf}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%"   stopColor={lineColor} stopOpacity={0.2}  />
              <Stop offset="60%"  stopColor={lineColor} stopOpacity={0.85} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={1}    />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          <GridLines w={chartW} h={chartH} pad={PAD} color={C.cyan} />

          {/* Area fill */}
          <Path d={fill} fill={`url(#fill_${tf})`} />

          {/* Outer glow — very soft ambient */}
          <Path d={line} stroke={lineColor} strokeWidth={20} fill="none"
            strokeOpacity={0.035} strokeLinecap="round" strokeLinejoin="round" />

          {/* Mid glow */}
          <Path d={line} stroke={lineColor} strokeWidth={8} fill="none"
            strokeOpacity={0.12} strokeLinecap="round" strokeLinejoin="round" />

          {/* Main premium line */}
          <Path d={line} stroke={`url(#stroke_${tf})`} strokeWidth={2.8} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
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
              style={[
                s.tfBtn,
                active && { backgroundColor: `${lineColor}12`, borderColor: `${lineColor}40` },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[s.tfText, { color: active ? lineColor : C.textDim }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 16, overflow: "hidden" },

  ambientGlow: {
    position: "absolute", top: 0, left: 0, right: 0, height: 1, opacity: 0.12,
  },

  changeRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginBottom: 12, paddingHorizontal: 2,
  },
  changeAmt: {
    fontSize: 19, fontFamily: FONTS.monoBold, letterSpacing: 0.3,
  },
  pctBadge: {
    flexDirection: "row", alignItems: "center",
    borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  pctText:    { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 0.4 },
  periodLabel:{ flex: 1, textAlign: "right", fontSize: 9, fontFamily: FONTS.mono, color: C.textDim },

  chartWrap: {
    borderRadius: RADIUS.lg, overflow: "hidden",
    shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 4 },
  },

  tfRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 },
  tfBtn: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: "transparent",
  },
  tfText: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 0.5 },
});
