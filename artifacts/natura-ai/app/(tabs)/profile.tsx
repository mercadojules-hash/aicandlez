import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Alert, Platform, TextInput, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTrading, fmt$, fmtPct } from "@/contexts/TradingContext";
import { NeonCard } from "@/components/NeonCard";
import { LiveDot } from "@/components/LiveDot";
import { PerformancePanel } from "@/components/PerformancePanel";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 88;

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ initials, size = 68 }: { initials: string; size?: number }) {
  return (
    <View style={[av.ring, { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2 }]}>
      <View style={[av.inner, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[av.text, { fontSize: size * 0.36 }]}>{initials}</Text>
      </View>
      <View style={av.dot}>
        <LiveDot color={C.green} size={9} />
      </View>
    </View>
  );
}
const av = StyleSheet.create({
  ring:  {
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: `${C.cyan}55`,
    shadowColor: C.cyan, shadowOpacity: 0.25, shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  inner: { alignItems: "center", justifyContent: "center", backgroundColor: `${C.cyan}15` },
  text:  { fontFamily: FONTS.monoBold, color: C.cyan },
  dot:   { position: "absolute", bottom: 2, right: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = C.textPrimary }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={sc.card}>
      <Text style={[sc.value, { color }]}>{value}</Text>
      {sub && <Text style={[sc.sub, { color: `${color}90` }]}>{sub}</Text>}
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card:  {
    flex: 1, alignItems: "center", paddingVertical: 16,
    backgroundColor: C.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: C.border,
  },
  value: { fontSize: 20, fontFamily: FONTS.monoBold, letterSpacing: 0.5 },
  sub:   { fontSize: 9,  fontFamily: FONTS.mono, marginTop: 2 },
  label: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 0.8, marginTop: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Setting Row
// ─────────────────────────────────────────────────────────────────────────────

function SettingRow({ icon, label, value, onPress, danger = false, accent = C.cyan }: {
  icon: string; label: string; value?: string;
  onPress?: () => void; danger?: boolean; accent?: string;
}) {
  const iconColor = danger ? C.red : accent;
  return (
    <TouchableOpacity onPress={onPress} style={sr.row} activeOpacity={0.7}>
      <View style={[sr.icon, { backgroundColor: `${iconColor}12` }]}>
        <Feather name={icon as any} size={15} color={iconColor} />
      </View>
      <Text style={[sr.label, { color: danger ? C.red : C.textPrimary }]}>{label}</Text>
      {value && <Text style={sr.value}>{value}</Text>}
      <Feather name="chevron-right" size={14} color={C.textDim} />
    </TouchableOpacity>
  );
}
const sr = StyleSheet.create({
  row:   {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 14,
  },
  icon:  { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 14, fontFamily: FONTS.monoMedium },
  value: { fontSize: 11, fontFamily: FONTS.mono, color: C.textMuted, marginRight: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Exchange data
// ─────────────────────────────────────────────────────────────────────────────

type ExchangeStatus = "connected" | "warning" | "disconnected";

interface ExchangeDef {
  id:        string;
  name:      string;
  color:     string;
  icon:      string;       // Feather icon name fallback
  status:    ExchangeStatus;
  isDefault: boolean;
  health:    number;       // 0–100
  permissions: { read: boolean; trade: boolean };
  lastSeen?: string;
}

const EXCHANGES: ExchangeDef[] = [
  {
    id: "kraken",    name: "Kraken",     color: "#5741d9", icon: "anchor",
    status: "connected",    isDefault: true,  health: 100,
    permissions: { read: true, trade: true },
    lastSeen: "2m ago",
  },
  {
    id: "cryptocom", name: "Crypto.com", color: "#0033ad", icon: "shield",
    status: "connected",    isDefault: false, health: 98,
    permissions: { read: true, trade: true },
    lastSeen: "4m ago",
  },
  {
    id: "binance",   name: "Binance",    color: "#f0b90b", icon: "zap",
    status: "warning",      isDefault: false, health: 72,
    permissions: { read: true, trade: false },
    lastSeen: "8m ago",
  },
  {
    id: "coinbase",  name: "Coinbase",   color: "#2775ca", icon: "circle",
    status: "disconnected", isDefault: false, health: 0,
    permissions: { read: false, trade: false },
    lastSeen: undefined,
  },
];

const STATUS_CONFIG: Record<ExchangeStatus, { color: string; label: string }> = {
  connected:    { color: C.green,  label: "CONNECTED"    },
  warning:      { color: C.orange, label: "DEGRADED"     },
  disconnected: { color: C.textDim, label: "OFFLINE"     },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exchange Card
// ─────────────────────────────────────────────────────────────────────────────

function ExchangeCard({ ex, onConnect }: { ex: ExchangeDef; onConnect: (ex: ExchangeDef) => void }) {
  const sc   = STATUS_CONFIG[ex.status];
  const isOn = ex.status !== "disconnected";

  return (
    <View style={[exc.card, { borderColor: isOn ? `${ex.color}30` : C.border }]}>
      {/* Top accent line */}
      <View style={[exc.topBar, { backgroundColor: isOn ? ex.color : "#1a2535" }]} />

      <View style={exc.body}>
        {/* Left — logo placeholder + name */}
        <View style={[exc.logoWrap, { backgroundColor: `${ex.color}12`, borderColor: `${ex.color}25` }]}>
          <Feather name={ex.icon as any} size={18} color={isOn ? ex.color : C.textDim} />
        </View>

        <View style={exc.info}>
          <View style={exc.nameRow}>
            <Text style={[exc.name, { color: isOn ? C.textPrimary : C.textMuted }]}>{ex.name}</Text>
            {ex.isDefault && (
              <View style={exc.defaultBadge}>
                <Text style={exc.defaultText}>DEFAULT</Text>
              </View>
            )}
          </View>

          {/* Status + health */}
          <View style={exc.statusRow}>
            <View style={[exc.statusDot, { backgroundColor: sc.color }]} />
            <Text style={[exc.statusText, { color: sc.color }]}>{sc.label}</Text>
            {isOn && (
              <>
                <Text style={exc.sep}>·</Text>
                <Text style={exc.healthText}>
                  Health {ex.health}%
                </Text>
              </>
            )}
            {ex.lastSeen && (
              <>
                <Text style={exc.sep}>·</Text>
                <Text style={exc.lastSeen}>{ex.lastSeen}</Text>
              </>
            )}
          </View>

          {/* Permissions */}
          {isOn && (
            <View style={exc.permsRow}>
              <View style={[exc.permTag, { borderColor: ex.permissions.read  ? `${C.green}40` : `${C.textDim}25`, backgroundColor: ex.permissions.read  ? `${C.green}08`   : "transparent" }]}>
                <Text style={[exc.permText, { color: ex.permissions.read  ? C.green  : C.textDim }]}>READ</Text>
              </View>
              <View style={[exc.permTag, { borderColor: ex.permissions.trade ? `${C.cyan}40`  : `${C.textDim}25`, backgroundColor: ex.permissions.trade ? `${C.cyan}08`    : "transparent" }]}>
                <Text style={[exc.permText, { color: ex.permissions.trade ? C.cyan   : C.textDim }]}>TRADE</Text>
              </View>
              <View style={[exc.permTag, { borderColor: `${C.red}25`, backgroundColor: "transparent" }]}>
                <Text style={[exc.permText, { color: C.red }]}>NO WITHDRAW</Text>
              </View>
            </View>
          )}
        </View>

        {/* Right — action */}
        {!isOn ? (
          <TouchableOpacity
            onPress={() => onConnect(ex)}
            style={exc.connectBtn}
            activeOpacity={0.8}
          >
            <Feather name="link" size={12} color={ex.color} />
            <Text style={[exc.connectText, { color: ex.color }]}>Connect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={exc.menuBtn} activeOpacity={0.7}>
            <Feather name="more-vertical" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const exc = StyleSheet.create({
  card:     { backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  topBar:   { height: 2 },
  body:     { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12 },
  logoWrap: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 2 },
  info:     { flex: 1, gap: 5 },
  nameRow:  { flexDirection: "row", alignItems: "center", gap: 8 },
  name:     { fontSize: 15, fontFamily: FONTS.monoBold, letterSpacing: 0.3 },
  defaultBadge: { backgroundColor: `${C.green}12`, borderRadius: 4, borderWidth: 1, borderColor: `${C.green}35`, paddingHorizontal: 6, paddingVertical: 2 },
  defaultText:  { fontSize: 7, fontFamily: FONTS.monoBold, color: C.green, letterSpacing: 0.8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText:{ fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.5 },
  sep:       { fontSize: 8, color: C.textDim },
  healthText:{ fontSize: 9, fontFamily: FONTS.mono, color: C.textMuted },
  lastSeen:  { fontSize: 9, fontFamily: FONTS.mono, color: C.textDim },
  permsRow:  { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  permTag:   { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  permText:  { fontSize: 7, fontFamily: FONTS.monoBold, letterSpacing: 0.5 },
  connectBtn:{ alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#1a2535" },
  connectText:{ fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.5 },
  menuBtn:   { padding: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Add Exchange Modal
// ─────────────────────────────────────────────────────────────────────────────

const AVAILABLE_EXCHANGES = [
  { id: "bybit",  name: "Bybit",  color: "#f7a600", needsPassphrase: false },
  { id: "okx",    name: "OKX",    color: "#b8bfc7", needsPassphrase: true  },
  { id: "kucoin", name: "KuCoin", color: "#24ae8f", needsPassphrase: true  },
];

function AddExchangeModal({ visible, onClose, prefill }: {
  visible: boolean; onClose: () => void; prefill?: ExchangeDef | null;
}) {
  const [step,       setStep]       = useState<"pick" | "keys">("pick");
  const [selected,   setSelected]   = useState<typeof AVAILABLE_EXCHANGES[0] | null>(null);
  const [label,      setLabel]      = useState("");
  const [apiKey,     setApiKey]     = useState("");
  const [apiSecret,  setApiSecret]  = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [agreed,     setAgreed]     = useState(false);

  const reset = () => {
    setStep("pick"); setSelected(null); setLabel(""); setApiKey("");
    setApiSecret(""); setPassphrase(""); setAgreed(false);
    onClose();
  };

  const handlePick = (ex: typeof AVAILABLE_EXCHANGES[0]) => {
    setSelected(ex);
    setStep("keys");
  };

  const handleConnect = () => {
    if (!agreed) return Alert.alert("Acknowledgement required", "Please confirm you understand this platform never requests withdrawal permissions.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Validating…", "Testing connection to exchange API. This may take a few seconds.", [{ text: "OK", onPress: reset }]);
  };

  const isWeb = Platform.OS === "web";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <KeyboardAvoidingView
        style={mo.overlay}
        behavior={isWeb ? "padding" : "height"}
      >
        <TouchableOpacity style={mo.backdrop} activeOpacity={1} onPress={reset} />

        <View style={mo.sheet}>
          {/* Handle */}
          <View style={mo.handle} />

          {/* Header */}
          <View style={mo.header}>
            {step === "keys" && (
              <TouchableOpacity onPress={() => setStep("pick")} style={{ marginRight: 12 }}>
                <Feather name="arrow-left" size={18} color={C.textMuted} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={mo.title}>
                {step === "pick" ? "Add Exchange" : `Connect ${selected?.name}`}
              </Text>
              <Text style={mo.sub}>
                {step === "pick"
                  ? "Select an exchange to connect your API keys"
                  : "Read-only or trading permissions — no withdrawals"}
              </Text>
            </View>
            <TouchableOpacity onPress={reset}>
              <Feather name="x" size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {step === "pick" ? (
            /* ── Exchange Picker ── */
            <View style={mo.pickerList}>
              {AVAILABLE_EXCHANGES.map(ex => (
                <TouchableOpacity
                  key={ex.id}
                  style={mo.pickerRow}
                  onPress={() => handlePick(ex)}
                  activeOpacity={0.8}
                >
                  <View style={[mo.pickerIcon, { backgroundColor: `${ex.color}12`, borderColor: `${ex.color}25` }]}>
                    <Text style={[mo.pickerLetter, { color: ex.color }]}>{ex.name[0]}</Text>
                  </View>
                  <Text style={mo.pickerName}>{ex.name}</Text>
                  {ex.needsPassphrase && (
                    <Text style={mo.pickerTag}>Passphrase</Text>
                  )}
                  <Feather name="chevron-right" size={16} color={C.textDim} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* ── API Key Form ── */
            <View style={mo.form}>
              <View style={mo.field}>
                <Text style={mo.fieldLabel}>Label (optional)</Text>
                <TextInput
                  style={mo.input}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="e.g. Main account"
                  placeholderTextColor={C.textDim}
                  autoCapitalize="none"
                />
              </View>
              <View style={mo.field}>
                <Text style={mo.fieldLabel}>API Key</Text>
                <TextInput
                  style={mo.input}
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="Paste your API key"
                  placeholderTextColor={C.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={mo.field}>
                <Text style={mo.fieldLabel}>API Secret</Text>
                <TextInput
                  style={mo.input}
                  value={apiSecret}
                  onChangeText={setApiSecret}
                  placeholder="Paste your API secret"
                  placeholderTextColor={C.textDim}
                  autoCapitalize="none"
                  secureTextEntry
                />
              </View>
              {selected?.needsPassphrase && (
                <View style={mo.field}>
                  <Text style={mo.fieldLabel}>Passphrase</Text>
                  <TextInput
                    style={mo.input}
                    value={passphrase}
                    onChangeText={setPassphrase}
                    placeholder="Required for this exchange"
                    placeholderTextColor={C.textDim}
                    secureTextEntry
                  />
                </View>
              )}

              {/* Safety notice */}
              <View style={mo.notice}>
                <Feather name="shield" size={13} color={C.green} />
                <Text style={mo.noticeText}>
                  Withdrawal permissions are never requested. API keys are encrypted with AES-256 and stored only on your account.
                </Text>
              </View>

              {/* Acknowledgement */}
              <TouchableOpacity
                style={mo.checkRow}
                onPress={() => setAgreed(a => !a)}
                activeOpacity={0.8}
              >
                <View style={[mo.checkbox, agreed && { backgroundColor: C.cyan, borderColor: C.cyan }]}>
                  {agreed && <Feather name="check" size={10} color="#000" />}
                </View>
                <Text style={mo.checkLabel}>
                  I understand no withdrawal permissions will be requested or granted.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[mo.connectBtn, { opacity: apiKey && apiSecret && agreed ? 1 : 0.4 }]}
                onPress={handleConnect}
                disabled={!apiKey || !apiSecret || !agreed}
                activeOpacity={0.8}
              >
                <Feather name="link-2" size={14} color="#000" />
                <Text style={mo.connectBtnText}>Validate & Connect</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mo = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet:    { backgroundColor: "#070f1a", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.border, paddingBottom: 40 },
  handle:   { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header:   { flexDirection: "row", alignItems: "flex-start", padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  title:    { fontSize: 17, fontFamily: FONTS.monoBold, color: C.textPrimary },
  sub:      { fontSize: 10, fontFamily: FONTS.mono, color: C.textMuted, marginTop: 3 },

  pickerList: { paddingHorizontal: 20, paddingTop: 8 },
  pickerRow:  { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerIcon: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pickerLetter: { fontSize: 16, fontFamily: FONTS.monoBold },
  pickerName: { flex: 1, fontSize: 15, fontFamily: FONTS.monoMedium, color: C.textPrimary },
  pickerTag:  { fontSize: 8, fontFamily: FONTS.mono, color: C.orange, borderWidth: 1, borderColor: `${C.orange}35`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },

  form:       { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  field:      { gap: 6 },
  fieldLabel: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1 },
  input:      { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: FONTS.mono, color: C.textPrimary },

  notice:     { flexDirection: "row", gap: 10, backgroundColor: `${C.green}08`, borderRadius: RADIUS.md, borderWidth: 1, borderColor: `${C.green}20`, padding: 12, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 10, fontFamily: FONTS.mono, color: C.textMuted, lineHeight: 15 },

  checkRow:   { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox:   { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkLabel: { flex: 1, fontSize: 11, fontFamily: FONTS.mono, color: C.textMuted, lineHeight: 16 },

  connectBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.cyan, borderRadius: RADIUS.lg, paddingVertical: 14, marginTop: 4 },
  connectBtnText: { fontSize: 13, fontFamily: FONTS.monoBold, color: "#000", letterSpacing: 0.5 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ label, accent = C.cyan }: { label: string; accent?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, marginTop: 8 }}>
      <View style={{ width: 3, height: 13, backgroundColor: accent, borderRadius: 2, marginRight: 10 }} />
      <Text style={{ fontSize: 10, fontFamily: FONTS.monoBold, color: `${accent}90`, letterSpacing: 1.8 }}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { account, trades, engine } = useTrading();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 67 : insets.top + 10;

  const [modalVisible, setModalVisible] = useState(false);
  const [prefillEx,    setPrefillEx]    = useState<ExchangeDef | null>(null);

  const closed   = trades.filter(t => t.pnl != null);
  const wins     = closed.filter(t => t.pnl > 0);
  const winRate  = closed.length ? (wins.length / closed.length) * 100 : account.winRate;
  const totalPnL = closed.reduce((s, t) => s + t.pnl, 0);

  const openConnect = (ex?: ExchangeDef) => {
    setPrefillEx(ex ?? null);
    setModalVisible(true);
    Haptics.selectionAsync();
  };

  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Sign Out", "You'll need to sign back in to access your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => {} },
    ]);
  };

  return (
    <>
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.scroll, { paddingTop: topPad, paddingBottom: TAB_BAR_H + 16 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile Header ── */}
        <View style={s.profileCard}>
          <Avatar initials="AT" size={68} />
          <View style={s.profileInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={s.name}>Apex Trader</Text>
              <View style={s.proBadge}><Text style={s.proText}>PRO</Text></View>
            </View>
            <Text style={s.email}>trader@apexai.com</Text>
            <Text style={s.since}>Member since Jan 2025</Text>
          </View>
        </View>

        {/* ── Performance Stats ── */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <StatCard label="EQUITY"   value={fmt$(account.equity, 0)}   color={C.textPrimary} />
          <StatCard label="REALIZED" value={totalPnL >= 0 ? `+${fmt$(totalPnL)}` : fmt$(totalPnL)} color={totalPnL >= 0 ? C.green : C.red} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
          <StatCard
            label="WIN RATE"
            value={`${winRate.toFixed(1)}%`}
            sub={`${wins.length}W · ${closed.length - wins.length}L`}
            color={winRate >= 55 ? C.green : C.orange}
          />
          <StatCard label="FEES PAID" value={fmt$(account.totalFeesPaid)} color={C.orange} />
        </View>

        {/* ── Performance Intelligence ── */}
        <SectionHeader label="PERFORMANCE INTELLIGENCE" accent={C.purple} />
        <PerformancePanel
          totalPnL={totalPnL}
          winRate={winRate}
          totalTrades={account.totalTrades}
          feesPaid={account.totalFeesPaid}
        />

        {/* ── Exchange Connections ── */}
        <SectionHeader label="EXCHANGE CONNECTIONS" accent={C.cyan} />

        {EXCHANGES.map(ex => (
          <ExchangeCard key={ex.id} ex={ex} onConnect={openConnect} />
        ))}

        {/* Add Exchange button */}
        <TouchableOpacity style={s.addExBtn} onPress={() => openConnect()} activeOpacity={0.8}>
          <View style={s.addExIcon}>
            <Feather name="plus" size={16} color={C.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.addExLabel}>Add Exchange</Text>
            <Text style={s.addExSub}>Connect Bybit, OKX, KuCoin and more</Text>
          </View>
          <Feather name="chevron-right" size={16} color={C.textDim} />
        </TouchableOpacity>

        {/* ── AI Configuration ── */}
        <SectionHeader label="AI CONFIGURATION" accent={C.purple} />
        <NeonCard accent={C.purple} style={{ marginBottom: 24 }}>
          <SettingRow icon="cpu"          label="AI Personality"  value="Balanced"                        accent={C.purple} />
          <SettingRow icon="shield"       label="Risk Profile"    value="Moderate"                        accent={C.purple} />
          <SettingRow icon="sliders"      label="Min Confidence"  value="60%"                             accent={C.purple} />
          <SettingRow icon="toggle-right" label="Auto Mode"       value={engine?.running ? "ON" : "OFF"} accent={C.purple} />
          <SettingRow icon="percent"      label="Position Size"   value="0.01%"                           accent={C.purple} />
          <SettingRow icon="trending-down" label="Stop Loss"      value="2%"                              accent={C.purple} />
          <SettingRow icon="trending-up"  label="Take Profit"     value="4%"                              accent={C.purple} />
        </NeonCard>

        {/* ── Account ── */}
        <SectionHeader label="ACCOUNT" accent={C.orange} />
        <NeonCard accent={C.orange} style={{ marginBottom: 16 }}>
          <SettingRow icon="bell"        label="Notifications"    value="All"     accent={C.orange} />
          <SettingRow icon="clock"       label="Timezone"         value="UTC-5"   accent={C.orange} />
          <SettingRow icon="dollar-sign" label="Display Currency" value="USD"     accent={C.orange} />
          <SettingRow icon="lock"        label="Security"         value="2FA On"  accent={C.orange} />
          <SettingRow icon="download"    label="Export Trade Data"                accent={C.orange} />
          <SettingRow icon="log-out"     label="Sign Out"         onPress={handleSignOut} danger />
        </NeonCard>

      </ScrollView>

      <AddExchangeModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        prefill={prefillEx}
      />
    </>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },

  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 18,
    marginBottom: 22, padding: 18,
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: `${C.cyan}20`,
  },
  profileInfo: { flex: 1 },
  name:   { fontSize: 20, fontFamily: FONTS.monoBold, color: C.textPrimary },
  email:  { fontSize: 11, fontFamily: FONTS.mono, color: C.textMuted, marginTop: 3 },
  since:  { fontSize: 9,  fontFamily: FONTS.mono, color: C.textDim, marginTop: 3 },
  proBadge:{ backgroundColor: `${C.cyan}15`, borderRadius: 5, borderWidth: 1, borderColor: `${C.cyan}35`, paddingHorizontal: 8, paddingVertical: 3 },
  proText: { fontSize: 8, fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1 },

  addExBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: `${C.cyan}20`,
    borderStyle: "dashed", padding: 16, marginBottom: 24,
  },
  addExIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: `${C.cyan}10`, borderWidth: 1, borderColor: `${C.cyan}25`,
    alignItems: "center", justifyContent: "center",
  },
  addExLabel: { fontSize: 14, fontFamily: FONTS.monoBold, color: C.cyan },
  addExSub:   { fontSize: 10, fontFamily: FONTS.mono, color: C.textMuted, marginTop: 2 },
});
