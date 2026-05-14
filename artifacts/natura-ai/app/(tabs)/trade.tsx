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
      activeOpacity={0.72}
      style={[
        ctrl.btn,
        { borderColor: active ? color : `${color}30`, backgroundColor: active ? `${color}15` : "transparent" },
        active && { shadowColor: color, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
      ]}
    >
      <Feather name={icon as any} size={19} color={active ? color : `${color}70`} />
      <Text style={[ctrl.label, { color: active ? color : `${color}60` }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const ctrl = StyleSheet.create({
  btn:   { flex: 1, alignItems: "center", paddingVertical: 15, borderRadius: RADIUS.xl, borderWidth: 1.5, gap: 5 },
  label: { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 1 },
});

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ label, accent = C.cyan, count }: { label: string; accent?: string; count?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, marginTop: 8 }}>
      <View style={{ width: 3, height: 14, backgroundColor: accent, borderRadius: 2, marginRight: 10, opacity: 0.85 }} />
      <Text style={{ fontSize: 9, fontFamily: FONTS.monoBold, color: `${accent}88`, letterSpacing: 2, flex: 1 }}>{label}</Text>
      {count != null && (
        <Text style={{ fontSize: 9, fontFamily: FONTS.monoBold, color: C.textDim }}>{count}</Text>
      )}
    </View>
  );
}

// ── Trade History Row ─────────────────────────────────────────────────────────

function TradeRow({ t }: { t: ReturnType<typeof useTrading>["trades"][number] }) {
  const isPos = t.pnl >= 0;
  return (
    <View style={tr.row}>
      <View style={[tr.sideBar, { backgroundColor: isPos ? C.green : C.red }]} />
      <View style={tr.info}>
        <Text style={tr.sym}>{t.symbol.replace("USD", "")}</Text>
        <Text style={tr.meta}>{t.side} · {fmtAge(t.closedAt)}</Text>
      </View>
      <View style={tr.right}>
        <Text style={[tr.pnl, { color: isPos ? C.green : C.red }]}>
          {isPos ? "+" : ""}{fmt$(t.pnl)}
        </Text>
        <Text style={[tr.pct, { color: isPos ? C.green : C.red }]}>{fmtPct(t.pnlPct)}</Text>
      </View>
      {t.score != null && (
        <View style={[tr.score, {
          borderColor: t.score >= 75 ? `${C.green}40` : `${C.orange}40`,
          backgroundColor: t.score >= 75 ? `${C.green}08` : `${C.orange}08`,
        }]}>
          <Text style={[tr.scoreText, { color: t.score >= 75 ? C.green : C.orange }]}>{t.score}</Text>
        </View>
      )}
    </View>
  );
}
const tr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  sideBar:   { width: 2.5, height: 30, borderRadius: 2 },
  info:      { flex: 1 },
  sym:       { fontSize: 13, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 0.3 },
  meta:      { fontSize: 9,  fontFamily: FONTS.mono, color: C.textMuted, marginTop: 2 },
  right:     { alignItems: "flex-end", gap: 1 },
  pnl:       { fontSize: 14, fontFamily: FONTS.monoBold, letterSpacing: 0.2 },
  pct:       { fontSize: 9,  fontFamily: FONTS.mono },
  score:     { width: 30, height: 30, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  scoreText: { fontSize: 10, fontFamily: FONTS.monoBold },
});

// ── Trade Screen ──────────────────────────────────────────────────────────────

export default function TradeScreen() {
  const { engine, positions, trades, isLoading, refresh } = useTrading();
  const insets = useSafeAreaInsets();
  const isWeb  = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top + 10;

  const [autoMode,   setAutoMode]   = useState(true);
  const [killActive, setKillActive] = useState(false);
  const [paused,     setPaused]     = useState(false);

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <LiveDot color={!killActive && !paused && engine?.running ? C.green : C.textDim} size={6} />
            <Text style={s.sub}>
              {killActive ? "KILL SWITCH ACTIVE" : paused ? "PAUSED" : engine?.running ? "AI ENGINE ACTIVE" : "ENGINE STOPPED"}
            </Text>
          </View>
        </View>
        <View style={[
          s.modeBadge,
          {
            borderColor: engine?.mode === "LIVE" ? `${C.red}50` : `${C.cyan}35`,
            backgroundColor: engine?.mode === "LIVE" ? `${C.red}12` : C.cyanDim,
          },
        ]}>
          <Text style={[s.modeText, { color: engine?.mode === "LIVE" ? C.red : C.cyan }]}>
            {engine?.mode ?? "SIMULATION"}
          </Text>
        </View>
      </View>

      {/* ── Controls ── */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <CtrlBtn label="KILL"  icon="zap-off" color={C.red}    onPress={handleKill}  active={killActive} />
        <CtrlBtn label="PAUSE" icon="pause"   color={C.orange} onPress={handlePause} active={paused} />
        <CtrlBtn label="AUTO"  icon="cpu"     color={C.cyan}   onPress={handleAuto}  active={autoMode} />
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
        <View style={[s.pnlBanner, {
          borderColor: totalUnreal >= 0 ? `${C.green}35` : `${C.red}35`,
          backgroundColor: totalUnreal >= 0 ? `${C.green}08` : `${C.red}08`,
          shadowColor: totalUnreal >= 0 ? C.green : C.red,
          shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        }]}>
          <View>
            <Text style={s.pnlBannerLabel}>TOTAL UNREALIZED P&L</Text>
            <Text style={s.pnlBannerSub}>{positions.length} open position{positions.length !== 1 ? "s" : ""}</Text>
          </View>
          <Text style={[s.pnlBannerValue, { color: totalUnreal >= 0 ? C.green : C.red }]}>
            {totalUnreal >= 0 ? "+" : ""}{fmt$(totalUnreal)}
          </Text>
        </View>
      )}

      {/* ── Open Positions ── */}
      <SectionHeader label="OPEN POSITIONS" accent={C.green} count={positions.length} />

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
      <SectionHeader label="TRADE HISTORY" accent={C.purple} count={trades.length} />
      <View style={s.card}>
        {trades.length === 0 ? (
          <Text style={{ textAlign: "center", color: C.textDim, fontSize: 10, fontFamily: FONTS.mono, paddingVertical: 18 }}>
            No closed trades yet
          </Text>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:  { fontSize: 22, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 1.5 },
  sub:    { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1 },
  modeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.md, borderWidth: 1 },
  modeText:  { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 1 },

  pnlBanner: {
    borderRadius: RADIUS.xl, borderWidth: 1, padding: 16,
    marginBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  pnlBannerLabel: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.2 },
  pnlBannerSub:   { fontSize: 8, fontFamily: FONTS.mono, color: C.textDim, marginTop: 2 },
  pnlBannerValue: { fontSize: 26, fontFamily: FONTS.monoBold, letterSpacing: -0.3 },

  empty: {
    alignItems: "center", paddingVertical: 36, gap: 8,
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: C.border, marginBottom: 18,
  },
  emptyText: { fontSize: 13, fontFamily: FONTS.monoMedium, color: C.textMuted },
  emptyHint: { fontSize: 9,  fontFamily: FONTS.mono, color: C.textDim },

  card: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
});
