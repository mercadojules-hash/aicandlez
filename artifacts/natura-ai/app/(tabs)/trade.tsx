import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTrading, fmt$, fmtPct, fmtAge } from "@/contexts/TradingContext";
import { PositionCard } from "@/components/PositionCard";
import { LiveDot } from "@/components/LiveDot";
import { MicroAnalytics } from "@/components/MicroAnalytics";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 84;

// ── Control Button ────────────────────────────────────────────────────────────

function CtrlBtn({
  label, icon, color, onPress, active = false,
}: { label: string; icon: string; color: string; onPress: () => void; active?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[ctrl.btn, { borderColor: active ? color : `${color}35`, backgroundColor: active ? `${color}18` : "transparent" }]}
    >
      <Feather name={icon as any} size={18} color={active ? color : `${color}80`} />
      <Text style={[ctrl.label, { color: active ? color : `${color}70` }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const ctrl = StyleSheet.create({
  btn:   { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: RADIUS.lg, borderWidth: 1.5, gap: 5 },
  label: { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
});

// ── Trade History Row ─────────────────────────────────────────────────────────

function TradeRow({ t }: { t: ReturnType<typeof useTrading>["trades"][number] }) {
  const isPos = t.pnl >= 0;
  return (
    <View style={tr.row}>
      <View style={[tr.sideBar, { backgroundColor: isPos ? C.green : C.red }]} />
      <View style={tr.info}>
        <Text style={tr.sym}>{t.symbol}</Text>
        <Text style={tr.meta}>{t.side} · {fmtAge(t.closedAt)}</Text>
      </View>
      <View style={tr.right}>
        <Text style={[tr.pnl, { color: isPos ? C.green : C.red }]}>
          {isPos ? "+" : ""}{fmt$(t.pnl)}
        </Text>
        <Text style={[tr.pct, { color: isPos ? C.green : C.red }]}>{fmtPct(t.pnlPct)}</Text>
      </View>
      {t.score != null && (
        <View style={[tr.score, { borderColor: t.score >= 75 ? `${C.green}40` : `${C.orange}40` }]}>
          <Text style={[tr.scoreText, { color: t.score >= 75 ? C.green : C.orange }]}>{t.score}</Text>
        </View>
      )}
    </View>
  );
}
const tr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  sideBar:   { width: 2, height: 28, borderRadius: 1 },
  info:      { flex: 1 },
  sym:       { fontSize: 12, fontFamily: FONTS.monoBold, color: C.textPrimary },
  meta:      { fontSize: 9,  fontFamily: FONTS.mono, color: C.textMuted, marginTop: 1 },
  right:     { alignItems: "flex-end" },
  pnl:       { fontSize: 13, fontFamily: FONTS.monoBold },
  pct:       { fontSize: 9,  fontFamily: FONTS.mono, marginTop: 1 },
  score:     { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  scoreText: { fontSize: 9, fontFamily: FONTS.monoBold },
});

// ── Trade Screen ──────────────────────────────────────────────────────────────

export default function TradeScreen() {
  const { engine, positions, trades, isLoading, refresh } = useTrading();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 67 : insets.top + 10;

  const [autoMode,    setAutoMode]    = useState(true);
  const [killActive,  setKillActive]  = useState(false);
  const [paused,      setPaused]      = useState(false);

  const totalUnreal = positions.reduce((s, p) => s + p.pnl, 0);

  const handleKill = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "KILL SWITCH",
      "This will immediately close all open positions and halt AI trading. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "ACTIVATE KILL SWITCH",
          style: "destructive",
          onPress: () => {
            setKillActive(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          },
        },
      ]
    );
  };

  const handlePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPaused(p => !p);
  };

  const handleAuto = () => {
    Haptics.selectionAsync();
    setAutoMode(a => !a);
  };

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
          <Text style={s.title}>LIVE TRADING</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <LiveDot color={!killActive && !paused && engine?.running ? C.green : C.textDim} size={6} />
            <Text style={s.sub}>
              {killActive ? "KILL SWITCH ACTIVE" : paused ? "PAUSED" : engine?.running ? "AI ENGINE ACTIVE" : "ENGINE STOPPED"}
            </Text>
          </View>
        </View>
        <View style={[s.modeBadge, { borderColor: engine?.mode === "LIVE" ? `${C.red}50` : `${C.cyan}35`, backgroundColor: engine?.mode === "LIVE" ? `${C.red}12` : C.cyanDim }]}>
          <Text style={[s.modeText, { color: engine?.mode === "LIVE" ? C.red : C.cyan }]}>
            {engine?.mode ?? "SIMULATION"}
          </Text>
        </View>
      </View>

      {/* ── Controls ── */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <CtrlBtn label="KILL"   icon="zap-off"   color={C.red}    onPress={handleKill}  active={killActive} />
        <CtrlBtn label="PAUSE"  icon="pause"      color={C.orange} onPress={handlePause} active={paused} />
        <CtrlBtn label="AUTO"   icon="cpu"        color={C.cyan}   onPress={handleAuto}  active={autoMode} />
      </View>

      {/* ── Micro Analytics ── */}
      {(() => {
        const closed = trades.filter(t => t.pnl != null);
        const wins   = closed.filter(t => t.pnl > 0).length;
        let streak   = 0;
        for (let i = closed.length - 1; i >= 0; i--) {
          if (closed[i].pnl > 0) { if (streak >= 0) streak++; else break; }
          else                   { if (streak <= 0) streak--; else break; }
        }
        const exposure = Math.min(positions.length * 28, 100);
        return (
          <MicroAnalytics
            wins={wins}
            total={closed.length}
            confidence={engine?.confidence ?? 62}
            streak={streak}
            exposure={exposure}
            avgHoldMins={47}
            aiRunning={!killActive && !paused && (engine?.running ?? false)}
          />
        );
      })()}

      {/* ── Unrealized PnL banner ── */}
      {positions.length > 0 && (
        <View style={[s.pnlBanner, { borderColor: totalUnreal >= 0 ? `${C.green}30` : `${C.red}30`, backgroundColor: totalUnreal >= 0 ? `${C.green}08` : `${C.red}08` }]}>
          <Text style={s.pnlBannerLabel}>TOTAL UNREALIZED P&L</Text>
          <Text style={[s.pnlBannerValue, { color: totalUnreal >= 0 ? C.green : C.red }]}>
            {totalUnreal >= 0 ? "+" : ""}{fmt$(totalUnreal)}
          </Text>
        </View>
      )}

      {/* ── Positions ── */}
      <View style={s.sectionRow}>
        <View style={{ width: 2, height: 12, backgroundColor: C.green, borderRadius: 1, marginRight: 8 }} />
        <Text style={s.sectionLabel}>OPEN POSITIONS</Text>
        <Text style={s.sectionCount}>{positions.length}</Text>
      </View>

      {positions.length === 0 ? (
        <View style={s.empty}>
          <Feather name="trending-up" size={28} color={C.textDim} />
          <Text style={s.emptyText}>No open positions</Text>
          <Text style={s.emptyHint}>{autoMode ? "AI is scanning for opportunities" : "Enable auto mode to start trading"}</Text>
        </View>
      ) : (
        positions.map(pos => <PositionCard key={pos.id} pos={pos} />)
      )}

      {/* ── Trade History ── */}
      <View style={[s.sectionRow, { marginTop: 8 }]}>
        <View style={{ width: 2, height: 12, backgroundColor: C.purple, borderRadius: 1, marginRight: 8 }} />
        <Text style={s.sectionLabel}>TRADE HISTORY</Text>
        <Text style={s.sectionCount}>{trades.length}</Text>
      </View>

      <View style={s.card}>
        {trades.length === 0 ? (
          <Text style={{ textAlign: "center", color: C.textDim, fontSize: 10, fontFamily: FONTS.mono, paddingVertical: 16 }}>No closed trades yet</Text>
        ) : (
          trades.map(t => <TradeRow key={t.id} t={t} />)
        )}
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  title:  { fontSize: 20, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 1.5 },
  sub:    { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 0.8 },
  modeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.md, borderWidth: 1 },
  modeText:  { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.8 },
  pnlBanner: { borderRadius: RADIUS.lg, borderWidth: 1, padding: 14, marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pnlBannerLabel: { fontSize: 9,  fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1 },
  pnlBannerValue: { fontSize: 20, fontFamily: FONTS.monoBold },
  sectionRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sectionLabel: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.5, flex: 1 },
  sectionCount: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textDim },
  empty: { alignItems: "center", paddingVertical: 32, gap: 8, backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  emptyText: { fontSize: 13, fontFamily: FONTS.monoMedium, color: C.textMuted },
  emptyHint: { fontSize: 9,  fontFamily: FONTS.mono, color: C.textDim },
  card: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 },
});
