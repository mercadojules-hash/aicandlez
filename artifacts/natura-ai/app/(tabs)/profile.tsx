import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Alert, Platform, TextInput, KeyboardAvoidingView, Animated, RefreshControl,
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
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const shadowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <Animated.View style={[av.ring, {
      width: size + 12, height: size + 12, borderRadius: (size + 12) / 2,
      shadowOpacity: shadowOp,
    }]}>
      <View style={[av.inner, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[av.text, { fontSize: size * 0.36 }]}>{initials}</Text>
      </View>
      <View style={av.dot}>
        <LiveDot color={C.green} size={9} />
      </View>
    </Animated.View>
  );
}
const av = StyleSheet.create({
  ring: {
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: `${C.cyan}55`,
    shadowColor: C.cyan, shadowRadius: 28, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  inner: { alignItems: "center", justifyContent: "center", backgroundColor: `${C.cyan}12` },
  text:  { fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1 },
  dot:   { position: "absolute", bottom: 2, right: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = C.textPrimary }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={[sc.card, {
      shadowColor: color, shadowOpacity: 0.1,
      shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3,
    }]}>
      <Text style={[sc.value, { color }]}>{value}</Text>
      {sub && <Text style={[sc.sub, { color: `${color}90` }]}>{sub}</Text>}
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1, alignItems: "center", paddingVertical: 16,
    backgroundColor: C.surface, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.border,
  },
  value: { fontSize: 22, fontFamily: FONTS.monoBold, letterSpacing: 0.3 },
  sub:   { fontSize: 9,  fontFamily: FONTS.mono, marginTop: 2 },
  label: { fontSize: 8,  fontFamily: FONTS.mono, color: C.textMuted, letterSpacing: 1, marginTop: 5 },
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
  row:   { flexDirection: "row", alignItems: "center", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.border, gap: 14 },
  icon:  { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
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
  icon:      string;
  status:    ExchangeStatus;
  isDefault: boolean;
  health:    number;
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
  connected:    { color: C.green,   label: "CONNECTED" },
  warning:      { color: C.orange,  label: "DEGRADED"  },
  disconnected: { color: C.textDim, label: "OFFLINE"   },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exchange Card
// ─────────────────────────────────────────────────────────────────────────────

function ExchangeCard({ ex, onConnect }: { ex: ExchangeDef; onConnect: (ex: ExchangeDef) => void }) {
  const cfg  = STATUS_CONFIG[ex.status];
  const isOn = ex.status !== "disconnected";

  return (
    <View style={[exc.card, {
      borderColor: isOn ? `${ex.color}35` : C.border,
      shadowColor: isOn ? ex.color : "#000",
      shadowOpacity: isOn ? 0.12 : 0.04,
      shadowRadius: isOn ? 14 : 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: isOn ? 5 : 2,
    }]}>
      <View style={[exc.topBar, { backgroundColor: isOn ? ex.color : "#1a2535" }]} />
      <View style={exc.body}>
        <View style={[exc.logoWrap, { backgroundColor: `${ex.color}12`, borderColor: `${ex.color}28` }]}>
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

          <View style={exc.statusRow}>
            <View style={[exc.statusDot, { backgroundColor: cfg.color }]} />
            <Text style={[exc.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            {isOn && (
              <>
                <Text style={exc.sep}>·</Text>
                <Text style={exc.healthText}>Health {ex.health}%</Text>
              </>
            )}
            {ex.lastSeen && (
              <>
                <Text style={exc.sep}>·</Text>
                <Text style={exc.lastSeen}>{ex.lastSeen}</Text>
              </>
            )}
          </View>

          {isOn && (
            <View style={exc.permsRow}>
              <View style={[exc.permTag, { borderColor: ex.permissions.read  ? `${C.green}40` : `${C.textDim}25`, backgroundColor: ex.permissions.read  ? `${C.green}08` : "transparent" }]}>
                <Text style={[exc.permText, { color: ex.permissions.read  ? C.green  : C.textDim }]}>READ</Text>
              </View>
              <View style={[exc.permTag, { borderColor: ex.permissions.trade ? `${C.cyan}40`  : `${C.textDim}25`, backgroundColor: ex.permissions.trade ? `${C.cyan}08`  : "transparent" }]}>
                <Text style={[exc.permText, { color: ex.permissions.trade ? C.cyan   : C.textDim }]}>TRADE</Text>
              </View>
              <View style={[exc.permTag, { borderColor: `${C.red}25`, backgroundColor: "transparent" }]}>
                <Text style={[exc.permText, { color: C.red }]}>NO WITHDRAW</Text>
              </View>
            </View>
          )}
        </View>

        {!isOn ? (
          <TouchableOpacity onPress={() => onConnect(ex)} style={exc.connectBtn} activeOpacity={0.8}>
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
  logoWrap: { width: 46, height: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 2 },
  info:     { flex: 1, gap: 5 },
  nameRow:  { flexDirection: "row", alignItems: "center", gap: 8 },
  name:     { fontSize: 15, fontFamily: FONTS.monoBold, letterSpacing: 0.3 },
  defaultBadge: { backgroundColor: `${C.green}12`, borderRadius: 4, borderWidth: 1, borderColor: `${C.green}35`, paddingHorizontal: 6, paddingVertical: 2 },
  defaultText:  { fontSize: 7, fontFamily: FONTS.monoBold, color: C.green, letterSpacing: 1 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText:{ fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.6 },
  sep:       { fontSize: 8, color: C.textDim },
  healthText:{ fontSize: 9, fontFamily: FONTS.mono, color: C.textMuted },
  lastSeen:  { fontSize: 9, fontFamily: FONTS.mono, color: C.textDim },
  permsRow:  { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  permTag:   { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  permText:  { fontSize: 7, fontFamily: FONTS.monoBold, letterSpacing: 0.6 },
  connectBtn:{ alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#1a2535" },
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

  const handleConnect = () => {
    if (!agreed) return Alert.alert("Acknowledgement required", "Please confirm you understand this platform never requests withdrawal permissions.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Validating…", "Testing connection to exchange API. This may take a few seconds.", [{ text: "OK", onPress: reset }]);
  };

  const isWeb = Platform.OS === "web";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <KeyboardAvoidingView style={mo.overlay} behavior={isWeb ? "padding" : "height"}>
        <TouchableOpacity style={mo.backdrop} activeOpacity={1} onPress={reset} />
        <View style={mo.sheet}>
          <View style={mo.handle} />
          <View style={mo.header}>
            {step === "keys" && (
              <TouchableOpacity onPress={() => setStep("pick")} style={{ marginRight: 12 }}>
                <Feather name="arrow-left" size={18} color={C.textMuted} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={mo.title}>{step === "pick" ? "Add Exchange" : `Connect ${selected?.name}`}</Text>
              <Text style={mo.sub}>{step === "pick" ? "Select an exchange to connect your API keys" : "Read-only or trading permissions — no withdrawals"}</Text>
            </View>
            <TouchableOpacity onPress={reset}>
              <Feather name="x" size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {step === "pick" ? (
            <View style={mo.pickerList}>
              {AVAILABLE_EXCHANGES.map(ex => (
                <TouchableOpacity key={ex.id} style={mo.pickerRow} onPress={() => { setSelected(ex); setStep("keys"); }} activeOpacity={0.8}>
                  <View style={[mo.pickerIcon, { backgroundColor: `${ex.color}12`, borderColor: `${ex.color}25` }]}>
                    <Text style={[mo.pickerLetter, { color: ex.color }]}>{ex.name[0]}</Text>
                  </View>
                  <Text style={mo.pickerName}>{ex.name}</Text>
                  {ex.needsPassphrase && <Text style={mo.pickerTag}>Passphrase</Text>}
                  <Feather name="chevron-right" size={16} color={C.textDim} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={mo.form}>
              <View style={mo.field}>
                <Text style={mo.fieldLabel}>Label (optional)</Text>
                <TextInput style={mo.input} value={label} onChangeText={setLabel} placeholder="e.g. Main account" placeholderTextColor={C.textDim} autoCapitalize="none" />
              </View>
              <View style={mo.field}>
                <Text style={mo.fieldLabel}>API Key</Text>
                <TextInput style={mo.input} value={apiKey} onChangeText={setApiKey} placeholder="Paste your API key" placeholderTextColor={C.textDim} autoCapitalize="none" autoCorrect={false} />
              </View>
              <View style={mo.field}>
                <Text style={mo.fieldLabel}>API Secret</Text>
                <TextInput style={mo.input} value={apiSecret} onChangeText={setApiSecret} placeholder="Paste your API secret" placeholderTextColor={C.textDim} autoCapitalize="none" secureTextEntry />
              </View>
              {selected?.needsPassphrase && (
                <View style={mo.field}>
                  <Text style={mo.fieldLabel}>Passphrase</Text>
                  <TextInput style={mo.input} value={passphrase} onChangeText={setPassphrase} placeholder="Required for this exchange" placeholderTextColor={C.textDim} secureTextEntry />
                </View>
              )}
              <View style={mo.notice}>
                <Feather name="shield" size={13} color={C.green} />
                <Text style={mo.noticeText}>Withdrawal permissions are never requested. API keys are encrypted with AES-256 and stored only on your account.</Text>
              </View>
              <TouchableOpacity style={mo.checkRow} onPress={() => setAgreed(a => !a)} activeOpacity={0.8}>
                <View style={[mo.checkbox, agreed && { backgroundColor: C.cyan, borderColor: C.cyan }]}>
                  {agreed && <Feather name="check" size={10} color="#000" />}
                </View>
                <Text style={mo.checkLabel}>I understand no withdrawal permissions will be requested or granted.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.connectBtn, { opacity: apiKey && apiSecret && agreed ? 1 : 0.4 }]} onPress={handleConnect} disabled={!apiKey || !apiSecret || !agreed} activeOpacity={0.8}>
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.75)" },
  sheet:    { backgroundColor: "#060d18", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: C.border, paddingBottom: 40 },
  handle:   { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header:   { flexDirection: "row", alignItems: "flex-start", padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  title:    { fontSize: 17, fontFamily: FONTS.monoBold, color: C.textPrimary },
  sub:      { fontSize: 10, fontFamily: FONTS.mono, color: C.textMuted, marginTop: 3 },
  pickerList: { paddingHorizontal: 20, paddingTop: 8 },
  pickerRow:  { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerIcon: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pickerLetter: { fontSize: 17, fontFamily: FONTS.monoBold },
  pickerName: { flex: 1, fontSize: 15, fontFamily: FONTS.monoMedium, color: C.textPrimary },
  pickerTag:  { fontSize: 8, fontFamily: FONTS.mono, color: C.orange, borderWidth: 1, borderColor: `${C.orange}35`, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  form:       { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  field:      { gap: 6 },
  fieldLabel: { fontSize: 9, fontFamily: FONTS.monoBold, color: C.textMuted, letterSpacing: 1.2 },
  input:      { backgroundColor: C.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 13, fontFamily: FONTS.mono, color: C.textPrimary },
  notice:     { flexDirection: "row", gap: 10, backgroundColor: `${C.green}08`, borderRadius: RADIUS.md, borderWidth: 1, borderColor: `${C.green}20`, padding: 12, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 10, fontFamily: FONTS.mono, color: C.textMuted, lineHeight: 15 },
  checkRow:   { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox:   { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkLabel: { flex: 1, fontSize: 11, fontFamily: FONTS.mono, color: C.textMuted, lineHeight: 16 },
  connectBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.cyan, borderRadius: RADIUS.lg, paddingVertical: 15, marginTop: 4 },
  connectBtnText: { fontSize: 13, fontFamily: FONTS.monoBold, color: "#000", letterSpacing: 0.5 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ label, accent = C.cyan }: { label: string; accent?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, marginTop: 10 }}>
      <View style={{ width: 3, height: 14, backgroundColor: accent, borderRadius: 2, marginRight: 10, opacity: 0.85 }} />
      <Text style={{ fontSize: 9, fontFamily: FONTS.monoBold, color: `${accent}88`, letterSpacing: 2 }}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { account, trades, isLoading, refresh } = useTrading();
  const insets = useSafeAreaInsets();
  const isWeb  = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top + 10;
  const [modalVisible, setModalVisible] = useState(false);
  const [prefillEx,    setPrefillEx]    = useState<ExchangeDef | null>(null);

  const openConnect = (ex: ExchangeDef) => {
    setPrefillEx(ex);
    setModalVisible(true);
  };

  const totalPnL  = account.realizedPnL;
  const winRate   = account.winRate;

  return (
    <>
      <ScrollView
        style={p.root}
        contentContainerStyle={[p.scroll, { paddingTop: topPad, paddingBottom: TAB_BAR_H + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.cyan} />}
      >

        {/* ── Identity Card ── */}
        <View style={p.identityCard}>
          {/* Ambient glow */}
          <View style={p.identityGlow} />
          <View style={p.identityGlow2} />

          <View style={p.identityRow}>
            <Avatar initials="AT" size={68} />
            <View style={p.identityInfo}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={p.userName}>Apex Trader</Text>
                <View style={p.proBadge}>
                  <Text style={p.proBadgeText}>PRO</Text>
                </View>
              </View>
              <Text style={p.userEmail}>trader@apexai.com</Text>
              <Text style={p.userMeta}>Member since Jan 2025</Text>
            </View>
          </View>
        </View>

        {/* ── Stats Grid ── */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <StatCard label="EQUITY"   value={fmt$(account.equity, 0)}  color={C.cyan}  />
          <StatCard label="REALIZED" value={`${totalPnL >= 0 ? "+" : ""}${fmt$(totalPnL, 0)}`} color={totalPnL >= 0 ? C.green : C.red} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          <StatCard label="WIN RATE" value={`${winRate.toFixed(1)}%`} sub={`${trades.filter(t => t.pnl >= 0).length}W · ${trades.filter(t => t.pnl < 0).length}L`} color={winRate >= 55 ? C.green : C.orange} />
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

        {/* ── Account Settings ── */}
        <SectionHeader label="ACCOUNT SETTINGS" accent={C.teal} />
        <View style={p.settingsCard}>
          <SettingRow icon="bell"       label="Notifications"      value="All alerts"   accent={C.cyan} />
          <SettingRow icon="shield"     label="Security"           value="2FA enabled"  accent={C.green} />
          <SettingRow icon="sliders"    label="Risk Parameters"    value="Moderate"     accent={C.purple} />
          <SettingRow icon="globe"      label="Timezone"           value="UTC−5"        accent={C.teal} />
          <SettingRow icon="download"   label="Export Trade Data"                       accent={C.cyan} />
          <SettingRow icon="log-out"    label="Sign Out"           danger />
        </View>

        {/* ── System Status ── */}
        <SectionHeader label="SYSTEM STATUS" accent={C.green} />
        <View style={p.statusCard}>
          {[
            { label: "AI Trading Engine", status: "Operational", color: C.green },
            { label: "Market Data Feed",  status: "Live",        color: C.green },
            { label: "Risk Management",   status: "Active",      color: C.green },
            { label: "Order Execution",   status: "Ready",       color: C.cyan  },
          ].map(item => (
            <View key={item.label} style={p.statusRow}>
              <View style={[p.statusDot, { backgroundColor: item.color, shadowColor: item.color, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }]} />
              <Text style={p.statusLabel}>{item.label}</Text>
              <Text style={[p.statusVal, { color: item.color }]}>{item.status}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <AddExchangeModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setPrefillEx(null); }}
        prefill={prefillEx}
      />
    </>
  );
}

const p = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16 },

  identityCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: `${C.cyan}28`, padding: 18, marginBottom: 16, overflow: "hidden",
    shadowColor: C.cyan, shadowOpacity: 0.16, shadowRadius: 24,
    shadowOffset: { width: 0, height: 5 }, elevation: 10,
  },
  identityGlow:  { position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: `${C.cyan}05` },
  identityGlow2: { position: "absolute", bottom: -30, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: `${C.purple}04` },
  identityRow:   { flexDirection: "row", alignItems: "center", gap: 18 },
  identityInfo:  { flex: 1, gap: 3 },
  userName:      { fontSize: 20, fontFamily: FONTS.monoBold, color: C.textPrimary, letterSpacing: 0.3 },
  proBadge:      { backgroundColor: `${C.cyan}15`, borderRadius: 5, borderWidth: 1, borderColor: `${C.cyan}40`, paddingHorizontal: 7, paddingVertical: 2 },
  proBadgeText:  { fontSize: 8, fontFamily: FONTS.monoBold, color: C.cyan, letterSpacing: 1 },
  userEmail:     { fontSize: 11, fontFamily: FONTS.mono, color: C.textSecondary },
  userMeta:      { fontSize: 9,  fontFamily: FONTS.mono, color: C.textDim },

  settingsCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 16, marginBottom: 24,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },

  statusCard: {
    backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1,
    borderColor: `${C.green}18`, padding: 16, marginBottom: 24,
    shadowColor: C.green, shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  statusRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  statusDot:   { width: 7, height: 7, borderRadius: 4, elevation: 4 },
  statusLabel: { flex: 1, fontSize: 13, fontFamily: FONTS.monoMedium, color: C.textMuted },
  statusVal:   { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 0.4 },
});
