import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { C, FONTS, RADIUS } from "@/constants/theme";

// ── Donut Ring (Win / Loss) ────────────────────────────────────────────────────

function DonutRing({
  wins, total, size = 68,
}: { wins: number; total: number; size?: number }) {
  const strokeW = 6;
  const r       = (size - strokeW) / 2;
  const cx      = size / 2;
  const cy      = size / 2;
  const circ    = 2 * Math.PI * r;
  const pct     = total > 0 ? wins / total : 0;
  const winDash = pct * circ;
  const winRate = total > 0 ? Math.round(pct * 100) : 0;

  return (
    <View style={dr.wrap}>
      <Svg width={size} height={size}>
        {/* Loss track */}
        <Circle cx={cx} cy={cy} r={r} stroke={`${C.red}25`} strokeWidth={strokeW} fill="none" />
        {/* Win arc */}
        {pct > 0 && (
          <Circle
            cx={cx} cy={cy} r={r}
            stroke={C.green} strokeWidth={strokeW} fill="none"
            strokeDasharray={`${winDash.toFixed(1)} ${circ.toFixed(1)}`}
            strokeLinecap="round"
            transform={`rotate(-90, ${cx}, ${cy})`}
          />
        )}
      </Svg>
      <View style={[dr.center, { width: size, height: size }]}>
        <Text style={[dr.pct, { color: winRate >= 55 ? C.green : C.orange }]}>{winRate}%</Text>
        <Text style={dr.label}>WIN</Text>
      </View>
    </View>
  );
}
const dr = StyleSheet.create({
  wrap:   { position: "relative", alignItems: "center" },
  center: { position: "absolute", top: 0, left: 0, alignItems: "center", justifyContent: "center" },
  pct:    { fontSize: 13, fontFamily: FONTS.monoBold },
  label:  { fontSize: 7,  fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8 },
});

// ── Gauge Arc ─────────────────────────────────────────────────────────────────
// A half-circle arc from left to right

function GaugeArc({
  value, color, size = 68, label,
}: { value: number; color: string; size?: number; label?: string }) {
  const strokeW = 5;
  const r       = (size - strokeW) / 2;
  const cx      = size / 2;
  const cy      = size * 0.7;
  const halfCirc = Math.PI * r;
  const dash     = (value / 100) * halfCirc;
  const startX   = cx - r;
  const endX     = cx + r;

  const bgPath   = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`;
  const fillPath = bgPath;

  return (
    <View style={ga.wrap}>
      <Svg width={size} height={size * 0.65}>
        {/* Track */}
        <Path d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
          stroke={`${color}20`} strokeWidth={strokeW} fill="none" strokeLinecap="round" />
        {/* Fill */}
        {value > 0 && (
          <Path d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
            stroke={color} strokeWidth={strokeW} fill="none" strokeLinecap="round"
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
  label: { alignItems: "center", marginTop: -8 },
  value: { fontSize: 13, fontFamily: FONTS.monoBold },
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
  value: { fontSize: 17, fontFamily: FONTS.monoBold, letterSpacing: 0.3 },
  sub:   { fontSize: 8,  fontFamily: FONTS.mono, marginTop: 1 },
  label: { fontSize: 7,  fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.7, marginTop: 3, textAlign: "center" },
});

// ── AI Pulse Indicator ────────────────────────────────────────────────────────

function AIPulse({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active]);

  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.3, 0.8] });

  return (
    <View style={ap.wrap}>
      <Animated.View style={[ap.ring, { transform: [{ scale }], opacity, borderColor: C.purple }]} />
      <View style={ap.core} />
      <Text style={ap.label}>AI ACTIVE</Text>
    </View>
  );
}
const ap = StyleSheet.create({
  wrap:  { alignItems: "center", justifyContent: "center", height: 56 },
  ring:  { position: "absolute", width: 28, height: 28, borderRadius: 14, borderWidth: 1.5 },
  core:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.purple },
  label: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8, marginTop: 6 },
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
  const winRate   = total > 0 ? Math.round((wins / total) * 100) : 0;
  const holdLabel = avgHoldMins >= 60
    ? `${(avgHoldMins / 60).toFixed(1)}h`
    : `${avgHoldMins}m`;

  return (
    <View style={s.card}>
      {/* Row 1: Donut + Gauge + AI pulse */}
      <View style={s.row1}>
        {/* Win/Loss donut */}
        <View style={s.chartCell}>
          <DonutRing wins={wins} total={total} />
          <Text style={s.cellLabel}>WIN / LOSS</Text>
        </View>

        <View style={s.divider} />

        {/* AI Confidence gauge */}
        <View style={s.chartCell}>
          <GaugeArc value={confidence} color={C.purple} label="CONF" />
          <Text style={s.cellLabel}>AI CONFIDENCE</Text>
        </View>

        <View style={s.divider} />

        {/* Exposure gauge */}
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
          sub={streak > 0 ? "wins" : ""}
        />
        <View style={s.divV} />
        <MetricTile value={holdLabel}      label="AVG HOLD"  color={C.cyan}   />
        <View style={s.divV} />
        <MetricTile value={`${winRate}%`}  label="WIN RATE"  color={winRate >= 55 ? C.green : C.orange} />
        <View style={s.divV} />
        <View style={s.aiCell}>
          <AIPulse active={aiRunning} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 16, overflow: "hidden",
  },
  row1: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 8, paddingTop: 16, paddingBottom: 8,
  },
  row2: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: 1, borderTopColor: C.border,
    paddingVertical: 12, paddingHorizontal: 8,
  },
  chartCell: { flex: 1, alignItems: "center", gap: 4 },
  cellLabel: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.8 },
  divider:   { width: 1, height: 64, backgroundColor: C.border, marginHorizontal: 4 },
  divV:      { width: 1, height: 28, backgroundColor: C.border },
  aiCell:    { flex: 1, alignItems: "center" },
});
