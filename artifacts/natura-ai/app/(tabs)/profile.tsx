import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Alert, Platform, TextInput, KeyboardAvoidingView,
  Animated, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTrading, fmt$, fmtPct } from "@/contexts/TradingContext";
import { LiveDot } from "@/components/LiveDot";
import { PerformancePanel } from "@/components/PerformancePanel";
import { C, FONTS, RADIUS } from "@/constants/theme";

const TAB_BAR_H = 88;

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const EXCHANGE_OPTIONS = [
  { id:"kraken",    name:"Kraken",     letter:"K",  color:"#5741d9", aiScore:96, latency:"12ms", recommended:true,  passphrase:false },
  { id:"binance",   name:"Binance",    letter:"B",  color:"#f0b90b", aiScore:94, latency:"8ms",  recommended:true,  passphrase:false },
  { id:"coinbase",  name:"Coinbase",   letter:"CB", color:"#2775ca", aiScore:88, latency:"22ms", recommended:false, passphrase:false },
  { id:"cryptocom", name:"Crypto.com", letter:"CC", color:"#0033ad", aiScore:82, latency:"18ms", recommended:false, passphrase:false },
  { id:"bybit",     name:"Bybit",      letter:"BY", color:"#f7a600", aiScore:91, latency:"10ms", recommended:false, passphrase:false },
  { id:"okx",       name:"OKX",        letter:"OX", color:"#b8bfc7", aiScore:89, latency:"14ms", recommended:false, passphrase:true  },
  { id:"kucoin",    name:"KuCoin",     letter:"KC", color:"#24ae8f", aiScore:85, latency:"20ms", recommended:false, passphrase:true  },
];

const ACHIEVEMENTS = [
  { id:"accuracy",  icon:"target",    name:"High Accuracy Week",  desc:"63%+ win rate for 7 days",       earned:true,  date:"May 12" },
  { id:"streak",    icon:"zap",       name:"5-Day Win Streak",    desc:"5 consecutive profitable days",   earned:true,  date:"May 10" },
  { id:"risk",      icon:"shield",    name:"Risk Controlled",     desc:"Zero stop-loss violations",       earned:true,  date:"May 8"  },
  { id:"vol",       icon:"activity",  name:"Volatility Master",   desc:"Profit during high-vol session",  earned:false, date:""       },
  { id:"century",   icon:"award",     name:"Centurion",           desc:"Complete 100 total trades",       earned:false, date:""       },
  { id:"night",     icon:"moon",      name:"Night Owl",           desc:"10+ after-hours trades",          earned:false, date:""       },
];

type ExchangeStatus = "connected" | "warning" | "disconnected";

interface ExchangeDef {
  id: string; name: string; color: string; icon: string;
  status: ExchangeStatus; isDefault: boolean; health: number;
  permissions: { read: boolean; trade: boolean }; lastSeen?: string;
}

const EXCHANGES: ExchangeDef[] = [
  { id:"kraken",    name:"Kraken",     color:"#5741d9", icon:"anchor",  status:"connected",    isDefault:true,  health:100, permissions:{read:true,  trade:true},  lastSeen:"2m ago" },
  { id:"cryptocom", name:"Crypto.com", color:"#0033ad", icon:"shield",  status:"connected",    isDefault:false, health:98,  permissions:{read:true,  trade:true},  lastSeen:"4m ago" },
  { id:"binance",   name:"Binance",    color:"#f0b90b", icon:"zap",     status:"warning",      isDefault:false, health:72,  permissions:{read:true,  trade:false}, lastSeen:"8m ago" },
  { id:"coinbase",  name:"Coinbase",   color:"#2775ca", icon:"circle",  status:"disconnected", isDefault:false, health:0,   permissions:{read:false, trade:false} },
];

const STATUS_CFG: Record<ExchangeStatus, {color:string; label:string}> = {
  connected:    { color:C.green,   label:"CONNECTED" },
  warning:      { color:C.orange,  label:"DEGRADED"  },
  disconnected: { color:C.textDim, label:"OFFLINE"   },
};

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ initials, size = 68 }: { initials: string; size?: number }) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 3000, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 3000, useNativeDriver: true }),
    ])).start();
  }, []);
  const shadowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  return (
    <Animated.View style={[av.ring, { width:size+12, height:size+12, borderRadius:(size+12)/2, shadowOpacity:shadowOp }]}>
      <View style={[av.inner, { width:size, height:size, borderRadius:size/2 }]}>
        <Text style={[av.text, { fontSize:size*0.36 }]}>{initials}</Text>
      </View>
      <View style={av.dot}><LiveDot color={C.green} size={9} /></View>
    </Animated.View>
  );
}
const av = StyleSheet.create({
  ring:  { alignItems:"center", justifyContent:"center", borderWidth:1.5, borderColor:`${C.cyan}55`, shadowColor:C.cyan, shadowRadius:28, shadowOffset:{width:0,height:0}, elevation:12 },
  inner: { alignItems:"center", justifyContent:"center", backgroundColor:`${C.cyan}12` },
  text:  { fontFamily:FONTS.monoBold, color:C.cyan, letterSpacing:1 },
  dot:   { position:"absolute", bottom:2, right:2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Trader Level Card
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_NAMES = [
  { min:0,     name:"PAPER TRADER",          next:"JUNIOR ANALYST" },
  { min:500,   name:"JUNIOR ANALYST",         next:"TECHNICAL ANALYST" },
  { min:1500,  name:"TECHNICAL ANALYST",      next:"SYSTEMATIC TRADER" },
  { min:4000,  name:"SYSTEMATIC TRADER",      next:"QUANTITATIVE ANALYST" },
  { min:8000,  name:"QUANTITATIVE ANALYST",   next:"ALGO STRATEGIST" },
  { min:15000, name:"ALGO STRATEGIST",         next:"INSTITUTIONAL TRADER" },
  { min:30000, name:"INSTITUTIONAL TRADER",    next:"HEDGE FUND OPERATOR" },
];

function TraderLevelCard({ winRate, totalTrades }: { winRate: number; totalTrades: number }) {
  const xp       = Math.round(winRate * totalTrades * 14.2);
  const lvlDef   = [...LEVEL_NAMES].reverse().find(l => xp >= l.min) ?? LEVEL_NAMES[0];
  const lvlIdx   = LEVEL_NAMES.indexOf(lvlDef);
  const level    = lvlIdx + 1;
  const nextMin  = LEVEL_NAMES[lvlIdx + 1]?.min ?? lvlDef.min * 2;
  const progress = Math.min((xp - lvlDef.min) / (nextMin - lvlDef.min), 1);
  const barAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, { toValue: progress, duration: 1200, useNativeDriver: false, delay: 300 }).start();
  }, [progress]);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={lv.card}>
      <View style={lv.topBar} />
      <View style={lv.body}>
        <View style={lv.levelCircle}>
          <Text style={lv.levelNum}>{level}</Text>
          <Text style={lv.levelTag}>LVL</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
            <Text style={lv.levelName}>{lvlDef.name}</Text>
            <Text style={lv.xpText}>{xp.toLocaleString()} XP</Text>
          </View>
          <View style={lv.barBg}>
            <Animated.View style={[lv.barFill, { width: barWidth as any }]} />
          </View>
          <Text style={lv.nextLevel}>Next: {lvlDef.next} · {nextMin.toLocaleString()} XP</Text>
        </View>
      </View>
    </View>
  );
}
const lv = StyleSheet.create({
  card:        { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.purple}30`, marginBottom:14, overflow:"hidden", shadowColor:C.purple, shadowOpacity:0.12, shadowRadius:16, shadowOffset:{width:0,height:3}, elevation:5 },
  topBar:      { height:1.5, backgroundColor:C.purple, opacity:0.5 },
  body:        { flexDirection:"row", alignItems:"center", padding:16, gap:16 },
  levelCircle: { width:52, height:52, borderRadius:26, backgroundColor:`${C.purple}15`, borderWidth:1.5, borderColor:`${C.purple}40`, alignItems:"center", justifyContent:"center" },
  levelNum:    { fontSize:20, fontFamily:FONTS.monoBold, color:C.purple },
  levelTag:    { fontSize:6, fontFamily:FONTS.mono, color:`${C.purple}80`, letterSpacing:1, marginTop:-2 },
  levelName:   { fontSize:10, fontFamily:FONTS.monoBold, color:C.textPrimary, letterSpacing:0.8 },
  xpText:      { fontSize:9, fontFamily:FONTS.mono, color:C.textMuted },
  barBg:       { height:4, backgroundColor:C.border, borderRadius:2, overflow:"hidden" },
  barFill:     { height:"100%", backgroundColor:C.purple, borderRadius:2 },
  nextLevel:   { fontSize:8, fontFamily:FONTS.mono, color:C.textDim },
});

// ─────────────────────────────────────────────────────────────────────────────
// Add Exchange CTA Card
// ─────────────────────────────────────────────────────────────────────────────

function AddExchangeCTA({ onPress }: { onPress: () => void }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(7000),
      Animated.timing(sweep, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])).start();
  }, []);

  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-280, 500] });

  return (
    <TouchableOpacity style={cta.card} onPress={onPress} activeOpacity={0.88}>
      {/* Sweep shine */}
      <Animated.View style={[cta.shine, { transform: [{ translateX: sweepX }] }]} />

      {/* Header row */}
      <View style={cta.topRow}>
        <View style={cta.plusWrap}>
          <Feather name="plus" size={22} color={C.cyan} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cta.title}>Connect Your Exchange</Text>
          <Text style={cta.sub}>Trade with your own accounts securely</Text>
        </View>
        <View style={cta.badge}>
          <Feather name="shield" size={9} color={C.green} />
          <Text style={cta.badgeText}>AES-256</Text>
        </View>
      </View>

      {/* Exchange logos */}
      <View style={cta.logoRow}>
        {EXCHANGE_OPTIONS.map(ex => (
          <View key={ex.id} style={[cta.logo, { borderColor: `${ex.color}35`, backgroundColor: `${ex.color}10` }]}>
            <Text style={[cta.logoLetter, { color: ex.color }]}>{ex.letter}</Text>
          </View>
        ))}
        <View style={{ flex: 1 }} />
        <Feather name="chevron-right" size={16} color={`${C.cyan}60`} />
      </View>

      <Text style={cta.hint}>7 exchanges supported · No withdrawal permissions ever requested</Text>
    </TouchableOpacity>
  );
}
const cta = StyleSheet.create({
  card:       { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.cyan}40`, padding:18, marginBottom:12, overflow:"hidden", shadowColor:C.cyan, shadowOpacity:0.2, shadowRadius:20, shadowOffset:{width:0,height:4}, elevation:8 },
  shine:      { position:"absolute", top:0, bottom:0, width:80, backgroundColor:"rgba(0,170,255,0.06)", transform:[{skewX:"-20deg"}] },
  topRow:     { flexDirection:"row", alignItems:"center", gap:14, marginBottom:14 },
  plusWrap:   { width:46, height:46, borderRadius:23, backgroundColor:`${C.cyan}15`, borderWidth:1.5, borderColor:`${C.cyan}40`, alignItems:"center", justifyContent:"center" },
  title:      { fontSize:15, fontFamily:FONTS.monoBold, color:C.textPrimary, letterSpacing:0.3 },
  sub:        { fontSize:9, fontFamily:FONTS.mono, color:C.textSecondary, marginTop:2 },
  badge:      { flexDirection:"row", alignItems:"center", gap:4, backgroundColor:`${C.green}10`, borderRadius:6, borderWidth:1, borderColor:`${C.green}30`, paddingHorizontal:7, paddingVertical:4 },
  badgeText:  { fontSize:7, fontFamily:FONTS.monoBold, color:C.green, letterSpacing:0.6 },
  logoRow:    { flexDirection:"row", alignItems:"center", gap:7, marginBottom:12 },
  logo:       { width:32, height:32, borderRadius:9, borderWidth:1, alignItems:"center", justifyContent:"center" },
  logoLetter: { fontSize:10, fontFamily:FONTS.monoBold },
  hint:       { fontSize:8, fontFamily:FONTS.mono, color:C.textDim, letterSpacing:0.3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Achievements Section
// ─────────────────────────────────────────────────────────────────────────────

function AchievementsSection() {
  return (
    <View style={ach.wrap}>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
        {ACHIEVEMENTS.map(a => (
          <View key={a.id} style={[ach.card, { opacity: a.earned ? 1 : 0.38, borderColor: a.earned ? `${C.purple}30` : C.border }]}>
            <View style={[ach.iconWrap, { backgroundColor: a.earned ? `${C.purple}15` : `${C.border}40` }]}>
              <Feather name={a.icon as any} size={14} color={a.earned ? C.purple : C.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ach.name, { color: a.earned ? C.textPrimary : C.textMuted }]}>{a.name}</Text>
              <Text style={ach.desc}>{a.desc}</Text>
              {a.earned && a.date && <Text style={ach.date}>Earned {a.date}</Text>}
              {!a.earned && <Text style={ach.date}>Locked</Text>}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
const ach = StyleSheet.create({
  wrap: { marginBottom: 20 },
  card: { width:"48%", backgroundColor:C.surface, borderRadius:RADIUS.lg, borderWidth:1, padding:12, flexDirection:"row", gap:10, alignItems:"flex-start" },
  iconWrap: { width:30, height:30, borderRadius:8, alignItems:"center", justifyContent:"center" },
  name: { fontSize:10, fontFamily:FONTS.monoBold, letterSpacing:0.2, marginBottom:2 },
  desc: { fontSize:7, fontFamily:FONTS.mono, color:C.textDim, lineHeight:10 },
  date: { fontSize:7, fontFamily:FONTS.mono, color:C.purple, marginTop:3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = C.textPrimary }: { label:string; value:string; sub?:string; color?:string }) {
  return (
    <View style={[sc.card, { shadowColor:color, shadowOpacity:0.1, shadowRadius:10, shadowOffset:{width:0,height:2}, elevation:3 }]}>
      <Text style={[sc.value, { color }]}>{value}</Text>
      {sub && <Text style={[sc.sub, { color:`${color}90` }]}>{sub}</Text>}
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { flex:1, alignItems:"center", paddingVertical:16, backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:C.border },
  value: { fontSize:22, fontFamily:FONTS.monoBold, letterSpacing:0.3 },
  sub:   { fontSize:9,  fontFamily:FONTS.mono, marginTop:2 },
  label: { fontSize:8,  fontFamily:FONTS.mono, color:C.textMuted, letterSpacing:1, marginTop:5 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Setting Row
// ─────────────────────────────────────────────────────────────────────────────

function SettingRow({ icon, label, value, onPress, danger=false, accent=C.cyan }: { icon:string; label:string; value?:string; onPress?:()=>void; danger?:boolean; accent?:string }) {
  const ic = danger ? C.red : accent;
  return (
    <TouchableOpacity onPress={onPress} style={sr.row} activeOpacity={0.7}>
      <View style={[sr.icon, { backgroundColor:`${ic}12` }]}>
        <Feather name={icon as any} size={15} color={ic} />
      </View>
      <Text style={[sr.label, { color:danger ? C.red : C.textPrimary }]}>{label}</Text>
      {value && <Text style={sr.value}>{value}</Text>}
      <Feather name="chevron-right" size={14} color={C.textDim} />
    </TouchableOpacity>
  );
}
const sr = StyleSheet.create({
  row:   { flexDirection:"row", alignItems:"center", paddingVertical:15, borderBottomWidth:1, borderBottomColor:C.border, gap:14 },
  icon:  { width:36, height:36, borderRadius:10, alignItems:"center", justifyContent:"center" },
  label: { flex:1, fontSize:14, fontFamily:FONTS.monoMedium },
  value: { fontSize:11, fontFamily:FONTS.mono, color:C.textMuted, marginRight:4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Exchange Card
// ─────────────────────────────────────────────────────────────────────────────

function ExchangeCard({ ex, onConnect }: { ex:ExchangeDef; onConnect:(ex:ExchangeDef)=>void }) {
  const cfg  = STATUS_CFG[ex.status];
  const isOn = ex.status !== "disconnected";
  return (
    <View style={[exc.card, { borderColor:isOn ? `${ex.color}35` : C.border, shadowColor:isOn ? ex.color : "#000", shadowOpacity:isOn ? 0.12 : 0.04, shadowRadius:isOn ? 14 : 6, shadowOffset:{width:0,height:3}, elevation:isOn ? 5 : 2 }]}>
      <View style={[exc.topBar, { backgroundColor:isOn ? ex.color : "#1a2535" }]} />
      <View style={exc.body}>
        <View style={[exc.logoWrap, { backgroundColor:`${ex.color}12`, borderColor:`${ex.color}28` }]}>
          <Feather name={ex.icon as any} size={18} color={isOn ? ex.color : C.textDim} />
        </View>
        <View style={exc.info}>
          <View style={exc.nameRow}>
            <Text style={[exc.name, { color:isOn ? C.textPrimary : C.textMuted }]}>{ex.name}</Text>
            {ex.isDefault && <View style={exc.defBadge}><Text style={exc.defText}>DEFAULT</Text></View>}
          </View>
          <View style={exc.statusRow}>
            <View style={[exc.dot, { backgroundColor:cfg.color }]} />
            <Text style={[exc.statusText, { color:cfg.color }]}>{cfg.label}</Text>
            {isOn && <><Text style={exc.sep}>·</Text><Text style={exc.meta}>Health {ex.health}%</Text></>}
            {ex.lastSeen && <><Text style={exc.sep}>·</Text><Text style={exc.meta}>{ex.lastSeen}</Text></>}
          </View>
          {isOn && (
            <View style={exc.perms}>
              {[
                { label:"READ",         active:ex.permissions.read,  color:C.green },
                { label:"TRADE",        active:ex.permissions.trade, color:C.cyan  },
                { label:"NO WITHDRAW",  active:false,                color:C.red   },
              ].map(p => (
                <View key={p.label} style={[exc.permTag, { borderColor:p.active || p.label==="NO WITHDRAW" ? `${p.color}40` : `${C.textDim}25`, backgroundColor:p.active ? `${p.color}08` : "transparent" }]}>
                  <Text style={[exc.permText, { color:p.active || p.label==="NO WITHDRAW" ? p.color : C.textDim }]}>{p.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {!isOn ? (
          <TouchableOpacity onPress={() => onConnect(ex)} style={exc.connectBtn} activeOpacity={0.8}>
            <Feather name="link" size={12} color={ex.color} />
            <Text style={[exc.connectText, { color:ex.color }]}>Connect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={exc.menuBtn}><Feather name="more-vertical" size={16} color={C.textMuted} /></TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const exc = StyleSheet.create({
  card:        { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, marginBottom:10, overflow:"hidden" },
  topBar:      { height:2 },
  body:        { flexDirection:"row", alignItems:"flex-start", padding:14, gap:12 },
  logoWrap:    { width:46, height:46, borderRadius:13, borderWidth:1, alignItems:"center", justifyContent:"center", marginTop:2 },
  info:        { flex:1, gap:5 },
  nameRow:     { flexDirection:"row", alignItems:"center", gap:8 },
  name:        { fontSize:15, fontFamily:FONTS.monoBold, letterSpacing:0.3 },
  defBadge:    { backgroundColor:`${C.green}12`, borderRadius:4, borderWidth:1, borderColor:`${C.green}35`, paddingHorizontal:6, paddingVertical:2 },
  defText:     { fontSize:7, fontFamily:FONTS.monoBold, color:C.green, letterSpacing:1 },
  statusRow:   { flexDirection:"row", alignItems:"center", gap:5 },
  dot:         { width:5, height:5, borderRadius:3 },
  statusText:  { fontSize:9, fontFamily:FONTS.monoBold, letterSpacing:0.6 },
  sep:         { fontSize:8, color:C.textDim },
  meta:        { fontSize:9, fontFamily:FONTS.mono, color:C.textMuted },
  perms:       { flexDirection:"row", gap:5, flexWrap:"wrap" },
  permTag:     { borderRadius:4, borderWidth:1, paddingHorizontal:6, paddingVertical:2 },
  permText:    { fontSize:7, fontFamily:FONTS.monoBold, letterSpacing:0.6 },
  connectBtn:  { alignItems:"center", gap:4, paddingHorizontal:10, paddingVertical:8, borderRadius:RADIUS.md, borderWidth:1, borderColor:"#1a2535" },
  connectText: { fontSize:9, fontFamily:FONTS.monoBold, letterSpacing:0.5 },
  menuBtn:     { padding:4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Premium Multi-Step Modal
// ─────────────────────────────────────────────────────────────────────────────

type ModalStep = "select" | "keys" | "validating" | "success";

function ExchangeModal({ visible, onClose }: { visible:boolean; onClose:()=>void }) {
  const [step,       setStep]       = useState<ModalStep>("select");
  const [selected,   setSelected]   = useState<typeof EXCHANGE_OPTIONS[0]|null>(null);
  const [apiKey,     setApiKey]     = useState("");
  const [apiSecret,  setApiSecret]  = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [agreed,     setAgreed]     = useState(false);
  const [progress,   setProgress]   = useState(0);
  const progAnim = useRef(new Animated.Value(0)).current;
  const fadeIn   = useRef(new Animated.Value(0)).current;
  const isWeb    = Platform.OS === "web";

  useEffect(() => {
    if (visible) Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [visible]);

  const reset = () => {
    setStep("select"); setSelected(null); setApiKey(""); setApiSecret("");
    setPassphrase(""); setAgreed(false); setProgress(0); progAnim.setValue(0);
    fadeIn.setValue(0); onClose();
  };

  const handleSelect = (ex: typeof EXCHANGE_OPTIONS[0]) => {
    Haptics.selectionAsync();
    setSelected(ex); setStep("keys");
  };

  const handleConnect = () => {
    if (!agreed) return Alert.alert("Acknowledgement required", "Please confirm the no-withdrawal agreement.");
    setStep("validating");
    Animated.timing(progAnim, { toValue: 1, duration: 2800, useNativeDriver: false }).start(() => {
      setStep("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  };

  const barWidth = progAnim.interpolate({ inputRange:[0,1], outputRange:["0%","100%"] });

  const STEPS: ModalStep[] = ["select","keys","validating","success"];
  const stepIdx = STEPS.indexOf(step);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <KeyboardAvoidingView style={mo.overlay} behavior={isWeb ? "padding" : "height"}>
        <TouchableOpacity style={mo.backdrop} activeOpacity={1} onPress={step === "success" ? reset : undefined} />

        <Animated.View style={[mo.sheet, { opacity: fadeIn }]}>
          <View style={mo.handle} />

          {/* Progress dots */}
          {step !== "success" && (
            <View style={mo.dots}>
              {["select","keys","validating"].map((s, i) => (
                <View key={s} style={[mo.dot, { backgroundColor: i <= stepIdx ? C.cyan : C.border, width: i === stepIdx ? 20 : 7 }]} />
              ))}
            </View>
          )}

          {/* ── Step 1: Select Exchange ── */}
          {step === "select" && (
            <>
              <View style={mo.header}>
                <Text style={mo.title}>Select Exchange</Text>
                <Text style={mo.sub}>7 exchanges · AI compatibility scored</Text>
                <TouchableOpacity onPress={reset} style={mo.close}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>
              <View style={mo.gridWrap}>
                {EXCHANGE_OPTIONS.map(ex => (
                  <TouchableOpacity key={ex.id} style={[mo.exCard, { borderColor:`${ex.color}30` }]} onPress={() => handleSelect(ex)} activeOpacity={0.82}>
                    {ex.recommended && <View style={mo.recBadge}><Text style={mo.recText}>★ REC</Text></View>}
                    <View style={[mo.exLogo, { backgroundColor:`${ex.color}15`, borderColor:`${ex.color}30` }]}>
                      <Text style={[mo.exLetter, { color:ex.color }]}>{ex.letter}</Text>
                    </View>
                    <Text style={mo.exName}>{ex.name}</Text>
                    <View style={mo.scoreRow}>
                      <Text style={[mo.score, { color:ex.aiScore >= 90 ? C.green : ex.aiScore >= 85 ? C.cyan : C.orange }]}>{ex.aiScore}</Text>
                      <Text style={mo.scoreLabel}>AI</Text>
                    </View>
                    <View style={[mo.scoreBg, { backgroundColor:`${C.border}60` }]}>
                      <View style={[mo.scoreBar, { width:`${ex.aiScore}%`, backgroundColor:ex.aiScore >= 90 ? C.green : ex.aiScore >= 85 ? C.cyan : C.orange }]} />
                    </View>
                    <View style={mo.latRow}>
                      <Feather name="clock" size={8} color={C.textDim} />
                      <Text style={mo.latText}>{ex.latency}</Text>
                    </View>
                    {ex.passphrase && <Text style={mo.passTag}>Passphrase</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ── Step 2: API Keys ── */}
          {step === "keys" && selected && (
            <>
              <View style={mo.header}>
                <TouchableOpacity onPress={() => setStep("select")} style={mo.back}><Feather name="arrow-left" size={18} color={C.textMuted} /></TouchableOpacity>
                <View style={{ flex:1 }}>
                  <Text style={mo.title}>Connect {selected.name}</Text>
                  <Text style={mo.sub}>AI Score {selected.aiScore}/100 · {selected.latency} avg latency</Text>
                </View>
                <TouchableOpacity onPress={reset} style={mo.close}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>
              <View style={mo.form}>
                <View style={mo.secBanner}>
                  <Feather name="shield" size={14} color={C.green} />
                  <Text style={mo.secText}>AES-256 encrypted · Withdrawal permissions never requested · Keys stored only on your account</Text>
                </View>
                {[
                  { label:"API Key",     value:apiKey,     set:setApiKey,     secure:false },
                  { label:"API Secret",  value:apiSecret,  set:setApiSecret,  secure:true  },
                  ...(selected.passphrase ? [{ label:"Passphrase", value:passphrase, set:setPassphrase, secure:true }] : []),
                ].map(f => (
                  <View key={f.label} style={mo.field}>
                    <Text style={mo.fieldLabel}>{f.label}</Text>
                    <TextInput style={mo.input} value={f.value} onChangeText={f.set}
                      placeholder={`Enter your ${f.label.toLowerCase()}`} placeholderTextColor={C.textDim}
                      autoCapitalize="none" autoCorrect={false} secureTextEntry={f.secure} />
                  </View>
                ))}
                <TouchableOpacity style={mo.checkRow} onPress={() => setAgreed(a => !a)} activeOpacity={0.8}>
                  <View style={[mo.checkbox, agreed && { backgroundColor:C.cyan, borderColor:C.cyan }]}>
                    {agreed && <Feather name="check" size={10} color="#000" />}
                  </View>
                  <Text style={mo.checkLabel}>I confirm no withdrawal permissions will be requested or granted.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[mo.connectBtn, { opacity: apiKey && apiSecret && agreed ? 1 : 0.4 }]}
                  onPress={handleConnect}
                  disabled={!apiKey || !apiSecret || !agreed}
                  activeOpacity={0.85}
                >
                  <Feather name="link-2" size={14} color="#000" />
                  <Text style={mo.connectBtnText}>Validate & Connect</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Step 3: Validating ── */}
          {step === "validating" && selected && (
            <View style={mo.validating}>
              <View style={[mo.exLogo, { width:64, height:64, borderRadius:18, borderColor:`${selected.color}40`, backgroundColor:`${selected.color}15` }]}>
                <Text style={[mo.exLetter, { fontSize:24, color:selected.color }]}>{selected.letter}</Text>
              </View>
              <Text style={mo.valTitle}>Connecting to {selected.name}…</Text>
              <Text style={mo.valSub}>Testing API credentials and validating permissions</Text>
              <View style={mo.progressBg}>
                <Animated.View style={[mo.progressFill, { width: barWidth as any, backgroundColor: selected.color }]} />
              </View>
              <View style={{ gap: 6, width:"100%" }}>
                {["Verifying API key format…","Testing network connection…","Authenticating with exchange…","Checking permissions…"].map((msg, i) => (
                  <View key={msg} style={mo.checkItem}>
                    <Feather name="check-circle" size={12} color={i < 3 ? C.green : C.textDim} />
                    <Text style={[mo.checkItemText, { color: i < 3 ? C.textSecondary : C.textDim }]}>{msg}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Step 4: Success ── */}
          {step === "success" && selected && (
            <View style={mo.success}>
              <View style={[mo.successIcon, { borderColor:`${C.green}50`, backgroundColor:`${C.green}12` }]}>
                <Feather name="check" size={32} color={C.green} />
              </View>
              <Text style={mo.successTitle}>Connected!</Text>
              <Text style={mo.successSub}>{selected.name} is now linked to your Apex AI account</Text>
              <View style={mo.successStats}>
                <View style={mo.successStat}>
                  <Text style={[mo.successStatVal, { color:C.green }]}>{selected.aiScore}</Text>
                  <Text style={mo.successStatLabel}>AI SCORE</Text>
                </View>
                <View style={mo.successStat}>
                  <Text style={[mo.successStatVal, { color:C.cyan }]}>{selected.latency}</Text>
                  <Text style={mo.successStatLabel}>LATENCY</Text>
                </View>
                <View style={mo.successStat}>
                  <Text style={[mo.successStatVal, { color:C.purple }]}>READY</Text>
                  <Text style={mo.successStatLabel}>STATUS</Text>
                </View>
              </View>
              <TouchableOpacity style={mo.doneBtn} onPress={reset} activeOpacity={0.85}>
                <Text style={mo.doneBtnText}>Start Trading</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mo = StyleSheet.create({
  overlay:     { flex:1, justifyContent:"flex-end" },
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor:"rgba(0,0,0,0.78)" },
  sheet:       { backgroundColor:"#060d18", borderTopLeftRadius:26, borderTopRightRadius:26, borderWidth:1, borderColor:C.border, paddingBottom:36, maxHeight:"90%" },
  handle:      { width:36, height:4, backgroundColor:C.border, borderRadius:2, alignSelf:"center", marginTop:12, marginBottom:4 },
  dots:        { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, paddingVertical:10 },
  dot:         { height:7, borderRadius:4, backgroundColor:C.cyan, transition:"width 0.3s" } as any,
  header:      { flexDirection:"row", alignItems:"flex-start", padding:20, paddingBottom:12, borderBottomWidth:1, borderBottomColor:C.border, gap:12 },
  back:        { paddingTop:2 },
  close:       { paddingTop:2 },
  title:       { fontSize:17, fontFamily:FONTS.monoBold, color:C.textPrimary },
  sub:         { fontSize:10, fontFamily:FONTS.mono, color:C.textMuted, marginTop:3 },

  gridWrap: { flexDirection:"row", flexWrap:"wrap", gap:10, padding:16 },
  exCard:   { width:"30%", backgroundColor:C.surface, borderRadius:RADIUS.lg, borderWidth:1, padding:10, alignItems:"center", gap:6, overflow:"hidden" },
  recBadge: { position:"absolute", top:6, right:4, backgroundColor:`${C.green}15`, borderRadius:3, paddingHorizontal:4, paddingVertical:2 },
  recText:  { fontSize:6, fontFamily:FONTS.monoBold, color:C.green, letterSpacing:0.4 },
  exLogo:   { width:44, height:44, borderRadius:13, borderWidth:1, alignItems:"center", justifyContent:"center" },
  exLetter: { fontSize:16, fontFamily:FONTS.monoBold },
  exName:   { fontSize:9, fontFamily:FONTS.monoBold, color:C.textPrimary, textAlign:"center" },
  scoreRow: { flexDirection:"row", alignItems:"baseline", gap:3 },
  score:    { fontSize:16, fontFamily:FONTS.monoBold },
  scoreLabel: { fontSize:7, fontFamily:FONTS.mono, color:C.textDim },
  scoreBg:  { width:"100%", height:3, borderRadius:2, overflow:"hidden" },
  scoreBar: { height:"100%", borderRadius:2 },
  latRow:   { flexDirection:"row", alignItems:"center", gap:3 },
  latText:  { fontSize:8, fontFamily:FONTS.mono, color:C.textDim },
  passTag:  { fontSize:6, fontFamily:FONTS.mono, color:C.orange, borderWidth:1, borderColor:`${C.orange}30`, borderRadius:3, paddingHorizontal:4, paddingVertical:1 },

  form:     { padding:20, gap:14 },
  secBanner:{ flexDirection:"row", gap:10, backgroundColor:`${C.green}08`, borderRadius:RADIUS.md, borderWidth:1, borderColor:`${C.green}20`, padding:12, alignItems:"flex-start" },
  secText:  { flex:1, fontSize:10, fontFamily:FONTS.mono, color:C.textMuted, lineHeight:15 },
  field:    { gap:6 },
  fieldLabel:{ fontSize:9, fontFamily:FONTS.monoBold, color:C.textMuted, letterSpacing:1.2 },
  input:    { backgroundColor:C.surface, borderRadius:RADIUS.md, borderWidth:1, borderColor:C.border, paddingHorizontal:14, paddingVertical:13, fontSize:13, fontFamily:FONTS.mono, color:C.textPrimary },
  checkRow: { flexDirection:"row", alignItems:"flex-start", gap:12 },
  checkbox: { width:18, height:18, borderRadius:5, borderWidth:1.5, borderColor:C.border, alignItems:"center", justifyContent:"center", marginTop:1 },
  checkLabel:{ flex:1, fontSize:11, fontFamily:FONTS.mono, color:C.textMuted, lineHeight:16 },
  connectBtn:{ flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8, backgroundColor:C.cyan, borderRadius:RADIUS.lg, paddingVertical:15 },
  connectBtnText:{ fontSize:13, fontFamily:FONTS.monoBold, color:"#000", letterSpacing:0.5 },

  validating: { padding:28, alignItems:"center", gap:16 },
  valTitle:   { fontSize:17, fontFamily:FONTS.monoBold, color:C.textPrimary, textAlign:"center" },
  valSub:     { fontSize:11, fontFamily:FONTS.mono, color:C.textMuted, textAlign:"center" },
  progressBg: { width:"100%", height:4, backgroundColor:C.border, borderRadius:2, overflow:"hidden" },
  progressFill:{ height:"100%", borderRadius:2 },
  checkItem:  { flexDirection:"row", alignItems:"center", gap:8 },
  checkItemText:{ fontSize:11, fontFamily:FONTS.mono },

  success:       { padding:32, alignItems:"center", gap:16 },
  successIcon:   { width:80, height:80, borderRadius:40, borderWidth:2, alignItems:"center", justifyContent:"center", shadowColor:C.green, shadowOpacity:0.4, shadowRadius:20, shadowOffset:{width:0,height:0}, elevation:10 },
  successTitle:  { fontSize:24, fontFamily:FONTS.monoBold, color:C.textPrimary },
  successSub:    { fontSize:12, fontFamily:FONTS.mono, color:C.textMuted, textAlign:"center" },
  successStats:  { flexDirection:"row", gap:24, marginTop:4 },
  successStat:   { alignItems:"center", gap:4 },
  successStatVal:{ fontSize:18, fontFamily:FONTS.monoBold },
  successStatLabel:{ fontSize:8, fontFamily:FONTS.mono, color:C.textDim, letterSpacing:1 },
  doneBtn:       { backgroundColor:C.cyan, borderRadius:RADIUS.lg, paddingVertical:15, paddingHorizontal:40 },
  doneBtnText:   { fontSize:14, fontFamily:FONTS.monoBold, color:"#000", letterSpacing:0.5 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────

function SH({ label, accent = C.cyan }: { label:string; accent?:string }) {
  return (
    <View style={{ flexDirection:"row", alignItems:"center", marginBottom:12, marginTop:10 }}>
      <View style={{ width:3, height:14, backgroundColor:accent, borderRadius:2, marginRight:10, opacity:0.85 }} />
      <Text style={{ fontSize:9, fontFamily:FONTS.monoBold, color:`${accent}88`, letterSpacing:2 }}>{label}</Text>
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
  const [modalOpen, setModalOpen] = useState(false);

  const totalPnL = account.realizedPnL;
  const winRate  = account.winRate;

  return (
    <>
      <ScrollView
        style={p.root}
        contentContainerStyle={[p.scroll, { paddingTop:topPad, paddingBottom:TAB_BAR_H + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.cyan} />}
      >

        {/* ── Identity Card ── */}
        <View style={p.identityCard}>
          <View style={p.idGlow} /><View style={p.idGlow2} />
          <View style={p.identityRow}>
            <Avatar initials="AT" size={68} />
            <View style={p.identityInfo}>
              <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
                <Text style={p.userName}>Apex Trader</Text>
                <View style={p.proBadge}><Text style={p.proBadgeText}>PRO</Text></View>
              </View>
              <Text style={p.userEmail}>trader@apexai.com</Text>
              <Text style={p.userMeta}>Member since Jan 2025</Text>
            </View>
          </View>
        </View>

        {/* ── Trader Level ── */}
        <TraderLevelCard winRate={winRate} totalTrades={account.totalTrades} />

        {/* ── Stats ── */}
        <View style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
          <StatCard label="EQUITY"   value={fmt$(account.equity, 0)} color={C.cyan} />
          <StatCard label="REALIZED" value={`${totalPnL >= 0 ? "+" : ""}${fmt$(totalPnL, 0)}`} color={totalPnL >= 0 ? C.green : C.red} />
        </View>
        <View style={{ flexDirection:"row", gap:8, marginBottom:20 }}>
          <StatCard label="WIN RATE"  value={`${winRate.toFixed(1)}%`} sub={`${trades.filter(t=>t.pnl>=0).length}W · ${trades.filter(t=>t.pnl<0).length}L`} color={winRate >= 55 ? C.green : C.orange} />
          <StatCard label="FEES PAID" value={fmt$(account.totalFeesPaid)} color={C.orange} />
        </View>

        {/* ── Performance ── */}
        <SH label="PERFORMANCE INTELLIGENCE" accent={C.purple} />
        <PerformancePanel totalPnL={totalPnL} winRate={winRate} totalTrades={account.totalTrades} feesPaid={account.totalFeesPaid} />

        {/* ── Achievements ── */}
        <SH label="ACHIEVEMENTS" accent={C.orange} />
        <AchievementsSection />

        {/* ── Exchange Connections ── */}
        <SH label="EXCHANGE CONNECTIONS" accent={C.cyan} />
        <AddExchangeCTA onPress={() => setModalOpen(true)} />
        {EXCHANGES.map(ex => (
          <ExchangeCard key={ex.id} ex={ex} onConnect={() => setModalOpen(true)} />
        ))}

        {/* ── Settings ── */}
        <SH label="ACCOUNT SETTINGS" accent={C.teal} />
        <View style={p.settingsCard}>
          <SettingRow icon="bell"     label="Notifications"   value="All alerts"  accent={C.cyan}   />
          <SettingRow icon="shield"   label="Security"        value="2FA enabled" accent={C.green}  />
          <SettingRow icon="sliders"  label="Risk Parameters" value="Moderate"    accent={C.purple} />
          <SettingRow icon="globe"    label="Timezone"        value="UTC−5"       accent={C.teal}   />
          <SettingRow icon="download" label="Export Data"                         accent={C.cyan}   />
          <SettingRow icon="log-out"  label="Sign Out" danger />
        </View>

        {/* ── System Status ── */}
        <SH label="SYSTEM STATUS" accent={C.green} />
        <View style={p.statusCard}>
          {[
            { label:"AI Trading Engine", status:"Operational", color:C.green  },
            { label:"Market Data Feed",  status:"Live",        color:C.green  },
            { label:"Risk Management",   status:"Active",      color:C.green  },
            { label:"Order Execution",   status:"Ready",       color:C.cyan   },
          ].map(item => (
            <View key={item.label} style={p.statusRow}>
              <View style={[p.statusDot, { backgroundColor:item.color, shadowColor:item.color, shadowOpacity:0.8, shadowRadius:4, shadowOffset:{width:0,height:0} }]} />
              <Text style={p.statusLabel}>{item.label}</Text>
              <Text style={[p.statusVal, { color:item.color }]}>{item.status}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <ExchangeModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

const p = StyleSheet.create({
  root:   { flex:1, backgroundColor:C.bg },
  scroll: { paddingHorizontal:16 },

  identityCard: { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.cyan}28`, padding:18, marginBottom:14, overflow:"hidden", shadowColor:C.cyan, shadowOpacity:0.16, shadowRadius:24, shadowOffset:{width:0,height:5}, elevation:10 },
  idGlow:       { position:"absolute", top:-50, right:-50, width:180, height:180, borderRadius:90, backgroundColor:`${C.cyan}05` },
  idGlow2:      { position:"absolute", bottom:-30, left:-30, width:120, height:120, borderRadius:60, backgroundColor:`${C.purple}04` },
  identityRow:  { flexDirection:"row", alignItems:"center", gap:18 },
  identityInfo: { flex:1, gap:3 },
  userName:     { fontSize:20, fontFamily:FONTS.monoBold, color:C.textPrimary, letterSpacing:0.3 },
  proBadge:     { backgroundColor:`${C.cyan}15`, borderRadius:5, borderWidth:1, borderColor:`${C.cyan}40`, paddingHorizontal:7, paddingVertical:2 },
  proBadgeText: { fontSize:8, fontFamily:FONTS.monoBold, color:C.cyan, letterSpacing:1 },
  userEmail:    { fontSize:11, fontFamily:FONTS.mono, color:C.textSecondary },
  userMeta:     { fontSize:9, fontFamily:FONTS.mono, color:C.textDim },

  settingsCard: { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:C.border, paddingHorizontal:16, marginBottom:24, shadowColor:"#000", shadowOpacity:0.06, shadowRadius:10, shadowOffset:{width:0,height:2}, elevation:3 },

  statusCard: { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.green}18`, padding:16, marginBottom:24, shadowColor:C.green, shadowOpacity:0.08, shadowRadius:14, shadowOffset:{width:0,height:3}, elevation:4 },
  statusRow:  { flexDirection:"row", alignItems:"center", paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.border, gap:10 },
  statusDot:  { width:7, height:7, borderRadius:4, elevation:4 },
  statusLabel:{ flex:1, fontSize:13, fontFamily:FONTS.monoMedium, color:C.textMuted },
  statusVal:  { fontSize:11, fontFamily:FONTS.monoBold, letterSpacing:0.4 },
});
