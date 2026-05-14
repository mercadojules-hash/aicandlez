import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, {
  Rect, Path, Defs, LinearGradient, Stop,
  Circle, Text as SvgText,
} from "react-native-svg";
import { C, FONTS, RADIUS } from "@/constants/theme";

// ── Monthly bar chart ─────────────────────────────────────────────────────────

const MONTHS = [
  { m: "NOV", pnl: -820  },
  { m: "DEC", pnl:  1240 },
  { m: "JAN", pnl:  2100 },
  { m: "FEB", pnl:   980 },
  { m: "MAR", pnl:  3200 },
  { m: "APR", pnl:  1600 },
  { m: "MAY", pnl:   393 },
];

function MonthlyBars({ width = 280 }: { width?: number }) {
  const chartH  = 80;
  const pad     = 4;
  const barGap  = 5;
  const barW    = (width - pad * 2 - barGap * (MONTHS.length - 1)) / MONTHS.length;
  const maxAbs  = Math.max(...MONTHS.map(m => Math.abs(m.pnl)));
  const zeroY   = chartH * 0.52;

  return (
    <Svg width={width} height={chartH + 18}>
      <Defs>
        <LinearGradient id="posBar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={C.green} stopOpacity={1}    />
          <Stop offset="100%" stopColor={C.green} stopOpacity={0.40} />
        </LinearGradient>
        <LinearGradient id="negBar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={C.red} stopOpacity={0.40} />
          <Stop offset="100%" stopColor={C.red} stopOpacity={1}    />
        </LinearGradient>
      </Defs>

      {/* Zero line */}
      <Path d={`M ${pad} ${zeroY} L ${width - pad} ${zeroY}`} stroke={C.border} strokeWidth={0.5} />

      {MONTHS.map((m, i) => {
        const x    = pad + i * (barW + barGap);
        const pos  = m.pnl >= 0;
        const barH = Math.max((Math.abs(m.pnl) / maxAbs) * (chartH * 0.46), 3);
        const y    = pos ? zeroY - barH : zeroY;
        const rx   = Math.min(3, barW / 3);
        const isLatest = i === MONTHS.length - 1;

        return (
          <React.Fragment key={m.m}>
            <Rect
              x={x} y={y} width={barW} height={barH}
              rx={rx} ry={rx}
              fill={pos ? "url(#posBar)" : "url(#negBar)"}
              fillOpacity={isLatest ? 0.6 : 1}
            />
            <SvgText
              x={x + barW / 2} y={chartH + 14}
              textAnchor="middle"
              fontSize={7} fontFamily={FONTS.mono}
              fill={isLatest ? C.textMuted : C.textDim}
            >
              {m.m}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const size = 60;
  const sw   = 5;
  const r    = (size - sw) / 2;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <View style={rg.wrap}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={`${color}18`} strokeWidth={sw} fill="none" />
        {score > 0 && (
          <Circle
            cx={cx} cy={cy} r={r} stroke={color}
            strokeWidth={sw} fill="none"
            strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
            strokeLinecap="round"
            transform={`rotate(-90, ${cx}, ${cy})`}
          />
        )}
      </Svg>
      <View style={[rg.center, { width: size, height: size }]}>
        <Text style={[rg.score, { color }]}>{score}</Text>
      </View>
      <Text style={rg.label}>{label}</Text>
    </View>
  );
}
const rg = StyleSheet.create({
  wrap:   { alignItems: "center", gap: 4 },
  center: { position: "absolute", top: 0, left: 0, alignItems: "center", justifyContent: "center" },
  score:  { fontSize: 13, fontFamily: FONTS.monoBold },
  label:  { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 0.7, textAlign: "center" },
});

// ── Stat Row ──────────────────────────────────────────────────────────────────

function StatRow({ label, value, color = C.textPrimary }: {
  label: string; value: string; color?: string;
}) {
  return (
    <View style={sr.row}>
      <Text style={sr.label}>{label}</Text>
      <Text style={[sr.value, { color }]}>{value}</Text>
    </View>
  );
}
const sr = StyleSheet.create({
  row:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: 13, fontFamily: FONTS.monoMedium, color: C.textMuted },
  value: { fontSize: 13, fontFamily: FONTS.monoBold },
});

// ── Performance Panel ─────────────────────────────────────────────────────────

interface Props {
  totalPnL:    number;
  winRate:     number;
  totalTrades: number;
  feesPaid:    number;
}

export function PerformancePanel({ totalPnL, winRate, totalTrades, feesPaid }: Props) {
  const fmt = (v: number) =>
    `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const aiScore     = Math.min(Math.round(winRate * 1.12), 98);
  const consistency = Math.min(Math.round(winRate * 0.93), 95);
  const efficiency  = Math.min(Math.round(Math.max(winRate - 6, 42)), 94);

  return (
    <View style={s.card}>
      {/* Monthly bar chart */}
      <View style={s.barSection}>
        <Text style={s.sectionTitle}>MONTHLY AI PERFORMANCE</Text>
        <View style={s.barWrap}>
          <MonthlyBars />
        </View>
      </View>

      {/* Score rings */}
      <View style={s.scoreRow}>
        <ScoreRing score={aiScore}     label="AI SCORE"    color={C.purple} />
        <ScoreRing score={consistency} label="CONSISTENCY" color={C.cyan}   />
        <ScoreRing score={efficiency}  label="EFFICIENCY"  color={C.green}  />
      </View>

      {/* Stats table */}
      <View style={s.statsSection}>
        <StatRow label="Cumulative Return"  value={fmt(totalPnL)}               color={totalPnL >= 0 ? C.green : C.red} />
        <StatRow label="Total Trades"       value={String(totalTrades)}         color={C.textPrimary} />
        <StatRow label="Win Rate"           value={`${winRate.toFixed(1)}%`}    color={winRate >= 55 ? C.green : C.orange} />
        <StatRow label="Fees Incurred"      value={`$${feesPaid.toFixed(2)}`}  color={C.orange} />
        <StatRow label="AI Engine Uptime"   value="99.97%"                      color={C.green} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.border, marginBottom: 24, overflow: "hidden",
  },
  barSection:   { borderBottomWidth: 1, borderBottomColor: C.border, padding: 16 },
  sectionTitle: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.5 },
  barWrap:      { alignItems: "center", marginTop: 10 },
  scoreRow:     {
    flexDirection: "row", justifyContent: "space-around",
    paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  statsSection: { paddingHorizontal: 16, paddingBottom: 4 },
});
