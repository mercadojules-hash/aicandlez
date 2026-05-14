import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C, FONTS, RADIUS } from "@/constants/theme";
import { fmt$, fmtPct, fmtAge, SimPosition } from "@/contexts/TradingContext";

export function PositionCard({ pos }: { pos: SimPosition }) {
  const isPos    = pos.pnl >= 0;
  const pnlColor = isPos ? C.green : C.red;
  const accent   = pos.side === "BUY" ? C.green : C.red;

  return (
    <View style={[styles.card, {
      borderColor: `${accent}35`,
      shadowColor: accent, shadowOpacity: 0.12,
      shadowRadius: 14, shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    }]}>
      {/* Top accent bar */}
      <View style={[styles.accent, { backgroundColor: accent }]} />

      <View style={styles.row}>
        <View style={styles.flex}>
          <View style={styles.headerRow}>
            <Text style={styles.symbol}>{pos.symbol}</Text>
            <View style={[styles.sideBadge, { backgroundColor: `${accent}15`, borderColor: `${accent}40` }]}>
              <Text style={[styles.sideText, { color: accent }]}>{pos.side}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {pos.qty} @ {pos.entryPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })} · {fmtAge(pos.openedAt)}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.pnl, { color: pnlColor }]}>
            {isPos ? "+" : ""}{fmt$(pos.pnl)}
          </Text>
          <Text style={[styles.pnlPct, { color: pnlColor }]}>{fmtPct(pos.pnlPct)}</Text>
        </View>
      </View>

      <View style={styles.levels}>
        <View style={styles.levelItem}>
          <Text style={styles.levelLabel}>SL</Text>
          <Text style={[styles.levelValue, { color: C.red }]}>
            ${pos.stopLoss.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.currentLabel}>CURRENT</Text>
          <Text style={styles.currentPrice}>
            ${pos.currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={[styles.levelItem, { alignItems: "flex-end" }]}>
          <Text style={styles.levelLabel}>TP</Text>
          <Text style={[styles.levelValue, { color: C.green }]}>
            ${pos.takeProfit.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    marginBottom: 10, overflow: "hidden",
  },
  accent: { height: 2, width: "100%" },
  row:    { flexDirection: "row", alignItems: "flex-start", padding: 14, paddingBottom: 12 },
  flex:   { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  symbol: { fontSize: 16, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 0.3 },
  sideBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  sideText:  { fontSize: 8, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
  meta:   { fontSize: 10, fontFamily: FONTS.mono, color: C.textMuted },
  right:  { alignItems: "flex-end", gap: 2 },
  pnl:    { fontSize: 18, fontFamily: FONTS.monoBold, letterSpacing: 0.4 },
  pnlPct: { fontSize: 10, fontFamily: FONTS.mono },
  levels: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: 1, borderTopColor: C.border,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: `${C.surface}99`,
  },
  levelItem:    { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  levelLabel:   { fontSize: 8, fontFamily: FONTS.monoBold, color: C.textDim, letterSpacing: 0.8 },
  levelValue:   { fontSize: 11, fontFamily: FONTS.monoSemi },
  priceBox:     { alignItems: "center" },
  currentLabel: { fontSize: 7, fontFamily: FONTS.mono, color: C.textDim, letterSpacing: 1 },
  currentPrice: { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary },
});
