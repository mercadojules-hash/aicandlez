import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { C, FONTS, RADIUS } from "@/constants/theme";

// ── Breathing border hook ──────────────────────────────────────────────────────

function useBreathing(duration = 3200) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return anim;
}

// ── Donut Ring (Win / Loss) ────────────────────────────────────────────────────

function DonutRing({
  wins, total, size = 78,
}: { wins: number; total: number; size?: number }) {
  const strokeW = 7;
  const r       = (size - strokeW) / 2;
  const cx      = size / 2;
  const cy      = size / 2;
  const circ    = 2 * Math.PI * r;
  const pct     = total > 0 ? wins / total : 0;
  const winDash = pct * circ;
  const winRate = total > 0 ? Math.round(pct * 100) : 0;
  const color   = winRate >= 55 ? C.green : C.orange;

  return (
    <View style={dr.wrap}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="winGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.6} />
            <Stop offset="100%" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle cx={cx} cy={cy} r={r} stroke={`${color}18`} strokeWidth={strokeW} fill="none" />
        {/* Win arc */}
        {pct > 0 && (
          <Circle
            cx={cx} cy={cy} r={r}
            stroke="url(#winGrad)" strokeWidth={strokeW} fill="none"
            strokeDasharray={`${winDash.toFixed(1)} ${circ.toFixed(1)}`}
            strokeLinecap="round"
            transform={`rotate(-90, ${cx}, ${cy})`}
          />
        )}
      </Svg>
      <View style={[dr.center, { width: size, height: size }]}>
        <Text style={[dr.pct, { color }]}>{winRate}%</Text>
        <Text style={dr.label}>WIN</Text>
      </View>
    </View>
  );
}
const dr = StyleSheet.create({
  wrap:   { position: "relative", alignItems: "center" },
  center: { position: "absolute", top: 0, left: 0, alignItems: "center", justifyContent: "center" },
  pct:    { fontSize: 15, fontFamily: FONTS.monoBold },
  label:  { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 1, marginTop: 1 },
});

// ── Gauge Arc ─────────────────────────────────────────────────────────────────

function GaugeArc({
  value, color, size = 78, label,
}: { value: number; color: string; size?: number; label?: string }) {
  const strokeW  = 6;
  const r        = (size - strokeW) / 2;
  const cx       = size / 2;
  const cy       = size * 0.72;
  const halfCirc = Math.PI * r;
  const dash     = (Math.min(value, 100) / 100) * halfCirc;
  const startX   = cx - r;
  const endX     = cx + r;
  const arcPath  = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`;

  return (
    <View style={ga.wrap}>
      <Svg width={size} height={size * 0.65}>
        {/* Track */}
        <Path d={arcPath} stroke={`${color}18`} strokeWidth={strokeW} fill="none" strokeLinecap="round" />
        {/* Glow */}
        {value > 0 && (
          <Path d={arcPath} stroke={`${color}25`} strokeWidth={strokeW + 4} fill="none" strokeLinecap="round"
            strokeDasharray={`${dash.toFixed(1)} ${halfCirc.toFixed(1)}`}
          />
        )}
        {/* Fill */}
        {value > 0 && (
          <Path d={arcPath} stroke={color} strokeWidth={strokeW} fill="none" strokeLinecap="round"
            strokeDasharray={`${dash.toFixed(1)} ${halfCirc.toFixed(1)}`}
          />
        )}
      </Svg>
      <View style={ga.label}>
        <Text style={[ga.value, { color }]}>{value}</Text>
        {label && <Text style={ga.sub}>{label}</Text>}
      </View>
    </View>
  );
}
const ga = StyleSheet.create({
  wrap:  { alignItems: "center" },
  label: { alignItems: "center", marginTop: -6 },
  value: { fontSize: 15, fontFamily: FONTS.monoBold },
  sub:   { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.6, marginTop: 1 },
});

// ── Metric Tile ───────────────────────────────────────────────────────────────

function MetricTile({
  value, label, color = C.textPrimary, sub,
}: { value: string; label: string; color?: string; sub?: string }) {
  return (
    <View style={mt.tile}>
      <Text style={[mt.value, { color }]}>{value}</Text>
      {sub && <Text style={[mt.sub, { color: `${color}80` }]}>{sub}</Text>}
      <Text style={mt.label}>{label}</Text>
    </View>
  );
}
const mt = StyleSheet.create({
  tile:  { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 },
  value: { fontSize: 18, fontFamily: FONTS.monoBold, letterSpacing: 0.2 },
  sub:   { fontSize: 8, fontFamily: FONTS.mono, marginTop: 1 },
  label: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8, marginTop: 3, textAlign: "center" },
});

// ── AI Pulse Indicator ────────────────────────────────────────────────────────

function AIPulse({ active }: { active: boolean }) {
  const pulse  = useRef(new Animated.Value(0)).current;
  const glow   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { pulse.setValue(0); glow.setValue(0); return; }
    const a1 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    const a2 = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    );
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, [active]);

  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 0.25, 0.9] });
  const coreOp  = glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={ap.wrap}>
      {active && (
        <Animated.View style={[ap.ring, { transform: [{ scale }], opacity, borderColor: C.purple }]} />
      )}
      <Animated.View style={[ap.core, { opacity: active ? coreOp : 0.25 }]} />
      <Text style={[ap.label, { color: active ? `${C.purple}90` : C.textDim }]}>
        {active ? "AI ACTIVE" : "AI IDLE"}
      </Text>
    </View>
  );
}
const ap = StyleSheet.create({
  wrap:  { alignItems: "center", justifyContent: "center", height: 58, gap: 0 },
  ring:  { position: "absolute", width: 32, height: 32, borderRadius: 16, borderWidth: 1.5 },
  core:  { width: 10, height: 10, borderRadius: 5, backgroundColor: C.purple, shadowColor: C.purple, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  label: { fontSize: 7, fontFamily: FONTS.mono, letterSpacing: 0.9, marginTop: 8 },
});

// ── MicroAnalytics ─────────────────────────────────────────────────────────────

interface Props {
  wins:         number;
  total:        number;
  confidence:   number;
  streak:       number;
  exposure:     number;
  avgHoldMins:  number;
  aiRunning:    boolean;
}

export function MicroAnalytics({
  wins, total, confidence, streak, exposure, avgHoldMins, aiRunning,
}: Props) {
  const winRate    = total > 0 ? Math.round((wins / total) * 100) : 0;
  const holdLabel  = avgHoldMins >= 60 ? `${(avgHoldMins / 60).toFixed(1)}h` : `${avgHoldMins}m`;
  const breathAnim = useBreathing(3400);

  const borderOpacity = breathAnim.interpolate({
    inputRange: [0, 1], outputRange: [0.18, 0.55],
  });

  return (
    <Animated.View style={[
      s.card,
      { borderColor: C.purple },
    ]}>
      {/* Breathing border overlay */}
      <Animated.View style={[s.breathBorder, { opacity: borderOpacity }]} />

      {/* Subtle top accent */}
      <View style={[s.topAccent, { backgroundColor: aiRunning ? C.purple : C.border }]} />

      {/* Row 1: Donut + Gauges */}
      <View style={s.row1}>
        <View style={s.chartCell}>
          <DonutRing wins={wins} total={total} />
          <Text style={s.cellLabel}>WIN / LOSS</Text>
        </View>

        <View style={s.divider} />

        <View style={s.chartCell}>
          <GaugeArc value={confidence} color={C.purple} label="CONF" />
          <Text style={s.cellLabel}>AI CONFIDENCE</Text>
        </View>

        <View style={s.divider} />

        <View style={s.chartCell}>
          <GaugeArc value={Math.min(exposure, 100)} color={exposure > 75 ? C.orange : C.cyan} label="EXP" />
          <Text style={s.cellLabel}>EXPOSURE</Text>
        </View>
      </View>

      {/* Row 2: text metrics */}
      <View style={s.row2}>
        <MetricTile
          value={streak > 0 ? `+${streak}` : String(streak)}
          label="STREAK"
          color={streak >= 3 ? C.green : streak < 0 ? C.red : C.textMuted}
          sub={streak > 0 ? "wins" : streak < 0 ? "loss" : ""}
        />
        <View style={s.divV} />
        <MetricTile value={holdLabel}     label="AVG HOLD"  color={C.cyan}   />
        <View style={s.divV} />
        <MetricTile value={`${winRate}%`} label="WIN RATE"  color={winRate >= 55 ? C.green : C.orange} />
        <View style={s.divV} />
        <View style={s.aiCell}>
          <AIPulse active={aiRunning} />
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1,
    marginBottom: 16, overflow: "hidden",
    shadowColor: C.purple, shadowOpacity: 0.18,
    shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  breathBorder: {
    position: "absolute", inset: 0,
    borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.purple,
    pointerEvents: "none",
  } as any,
  topAccent: { height: 1.5, opacity: 0.6 },
  row1: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 12, paddingTop: 18, paddingBottom: 10,
  },
  row2: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: 1, borderTopColor: C.border,
    paddingVertical: 14, paddingHorizontal: 8,
  },
  chartCell: { flex: 1, alignItems: "center", gap: 5 },
  cellLabel: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 1 },
  divider:   { width: 1, height: 68, backgroundColor: C.border, marginHorizontal: 6 },
  divV:      { width: 1, height: 30, backgroundColor: C.border },
  aiCell:    { flex: 1, alignItems: "center" },
});
