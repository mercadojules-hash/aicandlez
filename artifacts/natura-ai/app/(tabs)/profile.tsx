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
import { TradingModeToggle } from "@/components/TradingModeToggle";
import { C, FONTS, RADIUS } from "@/constants/theme";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

const TAB_BAR_H = 88;

// ─────────────────────────────────────────────────────────────────────────────
// Exchange / Broker Ecosystem
// ─────────────────────────────────────────────────────────────────────────────

interface ExchangeOption {
  id: string; name: string; letter: string; color: string;
  aiScore: number; latency: string; recommended: boolean;
  passphrase: boolean; cat: "crypto" | "stocks";
  badges: string[];
}

const EXCHANGE_OPTIONS: ExchangeOption[] = [
  { id:"kraken",    name:"Kraken",     letter:"K",  color:"#5741d9", aiScore:96, latency:"12ms", recommended:true,  passphrase:false, cat:"crypto", badges:["RECOMMENDED","LOW LATENCY"] },
  { id:"binance",   name:"Binance",    letter:"B",  color:"#f0b90b", aiScore:94, latency:"8ms",  recommended:true,  passphrase:false, cat:"crypto", badges:["RECOMMENDED","LOW LATENCY"] },
  { id:"coinbase",  name:"Coinbase",   letter:"CB", color:"#2775ca", aiScore:88, latency:"22ms", recommended:false, passphrase:false, cat:"crypto", badges:["AI VERIFIED","PAPER READY"] },
  { id:"cryptocom", name:"Crypto.com", letter:"CC", color:"#0033ad", aiScore:82, latency:"18ms", recommended:false, passphrase:false, cat:"crypto", badges:["PAPER READY"] },
  { id:"bybit",     name:"Bybit",      letter:"BY", color:"#f7a600", aiScore:91, latency:"10ms", recommended:false, passphrase:false, cat:"crypto", badges:["LOW LATENCY","AI VERIFIED"] },
  { id:"okx",       name:"OKX",        letter:"OX", color:"#b8bfc7", aiScore:89, latency:"14ms", recommended:false, passphrase:true,  cat:"crypto", badges:["AI VERIFIED"] },
  { id:"kucoin",    name:"KuCoin",     letter:"KC", color:"#24ae8f", aiScore:85, latency:"20ms", recommended:false, passphrase:true,  cat:"crypto", badges:["PAPER READY"] },
  { id:"alpaca",    name:"Alpaca",     letter:"AL", color:"#30c78d", aiScore:88, latency:"15ms", recommended:false, passphrase:false, cat:"stocks", badges:["PAPER READY","AI VERIFIED"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────────────

const ACHIEVEMENTS = [
  { id:"accuracy",  icon:"target",   name:"High Accuracy Week",  desc:"63%+ win rate for 7 days",      earned:true,  date:"May 12" },
  { id:"streak",    icon:"zap",      name:"5-Day Win Streak",    desc:"5 consecutive profitable days",  earned:true,  date:"May 10" },
  { id:"risk",      icon:"shield",   name:"Risk Controlled",     desc:"Zero stop-loss violations",      earned:true,  date:"May 8"  },
  { id:"vol",       icon:"activity", name:"Volatility Master",   desc:"Profit during high-vol session", earned:false, date:""       },
  { id:"century",   icon:"award",    name:"Centurion",           desc:"Complete 100 total trades",      earned:false, date:""       },
  { id:"night",     icon:"moon",     name:"Night Owl",           desc:"10+ after-hours trades",         earned:false, date:""       },
];

// ─────────────────────────────────────────────────────────────────────────────
// Connected Exchange Definitions
// ─────────────────────────────────────────────────────────────────────────────

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
// Trader Level
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_NAMES = [
  { min:0,     name:"PAPER TRADER",         next:"JUNIOR ANALYST",       maxXP:500   },
  { min:500,   name:"JUNIOR ANALYST",        next:"TECHNICAL ANALYST",    maxXP:1500  },
  { min:1500,  name:"TECHNICAL ANALYST",     next:"SYSTEMATIC TRADER",    maxXP:4000  },
  { min:4000,  name:"SYSTEMATIC TRADER",     next:"QUANTITATIVE ANALYST", maxXP:8000  },
  { min:8000,  name:"QUANTITATIVE ANALYST",  next:"ALGO STRATEGIST",      maxXP:15000 },
  { min:15000, name:"ALGO STRATEGIST",        next:"INSTITUTIONAL TRADER", maxXP:30000 },
  { min:30000, name:"INSTITUTIONAL TRADER",   next:"HEDGE FUND OPERATOR",  maxXP:60000 },
];

function TraderLevelCard({ winRate, totalTrades }: { winRate:number; totalTrades:number }) {
  const xp       = Math.round(winRate * totalTrades * 14.2);
  const lvlDef   = [...LEVEL_NAMES].reverse().find(l => xp >= l.min) ?? LEVEL_NAMES[0];
  const lvlIdx   = LEVEL_NAMES.indexOf(lvlDef);
  const level    = lvlIdx + 1;
  const progress = Math.min((xp - lvlDef.min) / (lvlDef.maxXP - lvlDef.min), 1);
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
        <View style={{ flex:1, gap:6 }}>
          <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
            <Text style={lv.levelName}>{lvlDef.name}</Text>
            <Text style={lv.xpText}>{xp.toLocaleString()} XP</Text>
          </View>
          <View style={lv.barBg}>
            <Animated.View style={[lv.barFill, { width: barWidth as any }]} />
          </View>
          <Text style={lv.nextLevel}>Next: {lvlDef.next} · {lvlDef.maxXP.toLocaleString()} XP</Text>
        </View>
      </View>
    </View>
  );
}
const lv = StyleSheet.create({
  card:       { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.purple}30`, marginBottom:14, overflow:"hidden", shadowColor:C.purple, shadowOpacity:0.12, shadowRadius:16, shadowOffset:{width:0,height:3}, elevation:5 },
  topBar:     { height:1.5, backgroundColor:C.purple, opacity:0.5 },
  body:       { flexDirection:"row", alignItems:"center", padding:16, gap:16 },
  levelCircle:{ width:52, height:52, borderRadius:26, backgroundColor:`${C.purple}15`, borderWidth:1.5, borderColor:`${C.purple}40`, alignItems:"center", justifyContent:"center" },
  levelNum:   { fontSize:20, fontFamily:FONTS.monoBold, color:C.purple },
  levelTag:   { fontSize:6, fontFamily:FONTS.mono, color:`${C.purple}80`, letterSpacing:1, marginTop:-2 },
  levelName:  { fontSize:10, fontFamily:FONTS.monoBold, color:C.textPrimary, letterSpacing:0.8 },
  xpText:     { fontSize:9, fontFamily:FONTS.mono, color:C.textMuted },
  barBg:      { height:4, backgroundColor:C.border, borderRadius:2, overflow:"hidden" },
  barFill:    { height:"100%", backgroundColor:C.purple, borderRadius:2 },
  nextLevel:  { fontSize:8, fontFamily:FONTS.mono, color:C.textDim },
});

// ─────────────────────────────────────────────────────────────────────────────
// Connect Trading Infrastructure CTA
// ─────────────────────────────────────────────────────────────────────────────

const BADGE_CFG: Record<string, string> = {
  "RECOMMENDED": C.green,
  "LOW LATENCY": C.cyan,
  "AI VERIFIED": C.purple,
  "PAPER READY": C.teal,
};

function InfrastructureCTA({ onPress }: { onPress:()=>void }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(8000),
      Animated.timing(sweep, { toValue:1, duration:1000, useNativeDriver:true }),
      Animated.timing(sweep, { toValue:0, duration:0,    useNativeDriver:true }),
    ])).start();
  }, []);

  const sweepX = sweep.interpolate({ inputRange:[0,1], outputRange:[-300,520] });

  return (
    <TouchableOpacity style={cta.card} onPress={onPress} activeOpacity={0.88}>
      <Animated.View style={[cta.shine, { transform:[{translateX:sweepX}] }]} />

      {/* Top row */}
      <View style={cta.topRow}>
        <View style={cta.iconWrap}>
          <Feather name="cpu" size={20} color={C.cyan} />
        </View>
        <View style={{ flex:1 }}>
          <Text style={cta.title}>Connect Trading Infrastructure</Text>
          <Text style={cta.sub}>Securely connect exchanges and brokers for AI-powered execution.</Text>
        </View>
        <View style={[cta.secBadge]}>
          <Feather name="shield" size={9} color={C.green} />
          <Text style={cta.secText}>AES-256</Text>
        </View>
      </View>

      {/* Category pills */}
      <View style={cta.catRow}>
        {[
          { label:"CRYPTO",   color:C.cyan,   icon:"layers"    },
          { label:"STOCKS",   color:C.teal,   icon:"briefcase" },
          { label:"AI READY", color:C.purple, icon:"cpu"       },
        ].map(c => (
          <View key={c.label} style={[cta.catPill, { borderColor:`${c.color}28`, backgroundColor:`${c.color}08` }]}>
            <Feather name={c.icon as any} size={9} color={c.color} />
            <Text style={[cta.catText, { color:c.color }]}>{c.label}</Text>
          </View>
        ))}
      </View>

      {/* Provider logos */}
      <View style={cta.logoRow}>
        {EXCHANGE_OPTIONS.map(ex => (
          <View key={ex.id} style={[cta.logo, {
            borderColor:`${ex.color}30`,
            backgroundColor:`${ex.color}10`,
            borderWidth: ex.cat === "stocks" ? 1.5 : 1,
          }]}>
            <Text style={[cta.logoLetter, { color:ex.color }]}>{ex.letter}</Text>
          </View>
        ))}
      </View>

      <View style={cta.footer}>
        <Feather name="shield" size={9} color={C.green} />
        <Text style={cta.footerText}>8 providers · No withdrawal permissions ever requested</Text>
        <Feather name="chevron-right" size={14} color={`${C.cyan}50`} />
      </View>
    </TouchableOpacity>
  );
}
const cta = StyleSheet.create({
  card:      { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.cyan}35`, padding:18, marginBottom:12, overflow:"hidden", shadowColor:C.cyan, shadowOpacity:0.18, shadowRadius:22, shadowOffset:{width:0,height:4}, elevation:8 },
  shine:     { position:"absolute", top:0, bottom:0, width:90, backgroundColor:"rgba(0,170,255,0.05)", transform:[{skewX:"-20deg"}] },
  topRow:    { flexDirection:"row", alignItems:"flex-start", gap:14, marginBottom:14 },
  iconWrap:  { width:46, height:46, borderRadius:23, backgroundColor:`${C.cyan}12`, borderWidth:1.5, borderColor:`${C.cyan}35`, alignItems:"center", justifyContent:"center" },
  title:     { fontSize:15, fontFamily:FONTS.monoBold, color:C.textPrimary, letterSpacing:0.2, marginBottom:4 },
  sub:       { fontSize:10, fontFamily:FONTS.mono, color:C.textSecondary, lineHeight:15 },
  secBadge:  { flexDirection:"row", alignItems:"center", gap:4, backgroundColor:`${C.green}10`, borderRadius:6, borderWidth:1, borderColor:`${C.green}28`, paddingHorizontal:7, paddingVertical:4 },
  secText:   { fontSize:7, fontFamily:FONTS.monoBold, color:C.green, letterSpacing:0.6 },
  catRow:    { flexDirection:"row", gap:7, marginBottom:14 },
  catPill:   { flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:9, paddingVertical:5, borderRadius:6, borderWidth:1 },
  catText:   { fontSize:8, fontFamily:FONTS.monoBold, letterSpacing:0.5 },
  logoRow:   { flexDirection:"row", gap:6, marginBottom:12 },
  logo:      { width:32, height:32, borderRadius:9, alignItems:"center", justifyContent:"center" },
  logoLetter:{ fontSize:9, fontFamily:FONTS.monoBold },
  footer:    { flexDirection:"row", alignItems:"center", gap:6 },
  footerText:{ flex:1, fontSize:8, fontFamily:FONTS.mono, color:C.textDim },
});

// ─────────────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────────────

function AchievementsSection() {
  return (
    <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
      {ACHIEVEMENTS.map(a => (
        <View key={a.id} style={[ach.card, { opacity:a.earned ? 1 : 0.38, borderColor:a.earned ? `${C.purple}30` : C.border }]}>
          <View style={[ach.iconWrap, { backgroundColor:a.earned ? `${C.purple}15` : `${C.border}40` }]}>
            <Feather name={a.icon as any} size={14} color={a.earned ? C.purple : C.textDim} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={[ach.name, { color:a.earned ? C.textPrimary : C.textMuted }]}>{a.name}</Text>
            <Text style={ach.desc}>{a.desc}</Text>
            <Text style={[ach.date, { color:a.earned ? C.purple : C.textDim }]}>
              {a.earned ? `Earned ${a.date}` : "Locked"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
const ach = StyleSheet.create({
  card:    { width:"48%", backgroundColor:C.surface, borderRadius:RADIUS.lg, borderWidth:1, padding:12, flexDirection:"row", gap:10, alignItems:"flex-start" },
  iconWrap:{ width:30, height:30, borderRadius:8, alignItems:"center", justifyContent:"center" },
  name:    { fontSize:10, fontFamily:FONTS.monoBold, letterSpacing:0.2, marginBottom:2 },
  desc:    { fontSize:7, fontFamily:FONTS.mono, color:C.textDim, lineHeight:10 },
  date:    { fontSize:7, fontFamily:FONTS.mono, marginTop:3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Exchange Card
// ─────────────────────────────────────────────────────────────────────────────

function ExchangeCard({ ex, onConnect }: { ex:ExchangeDef; onConnect:()=>void }) {
  const cfg  = STATUS_CFG[ex.status];
  const isOn = ex.status !== "disconnected";
  return (
    <View style={[exc.card, { borderColor:isOn ? `${ex.color}35` : C.border, shadowColor:isOn ? ex.color : "#000", shadowOpacity:isOn ? 0.1 : 0.03, shadowRadius:isOn ? 12 : 4, shadowOffset:{width:0,height:3}, elevation:isOn ? 4 : 2 }]}>
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
                { label:"READ",        active:ex.permissions.read,  color:C.green },
                { label:"TRADE",       active:ex.permissions.trade, color:C.cyan  },
                { label:"NO WITHDRAW", active:false,                color:C.red   },
              ].map(pp => (
                <View key={pp.label} style={[exc.permTag, { borderColor:pp.active || pp.label==="NO WITHDRAW" ? `${pp.color}40` : `${C.textDim}25`, backgroundColor:pp.active ? `${pp.color}08` : "transparent" }]}>
                  <Text style={[exc.permText, { color:pp.active || pp.label==="NO WITHDRAW" ? pp.color : C.textDim }]}>{pp.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {!isOn
          ? <TouchableOpacity onPress={onConnect} style={exc.connectBtn} activeOpacity={0.8}><Feather name="link" size={12} color={ex.color} /><Text style={[exc.connectText, { color:ex.color }]}>Connect</Text></TouchableOpacity>
          : <TouchableOpacity style={exc.menuBtn}><Feather name="more-vertical" size={16} color={C.textMuted} /></TouchableOpacity>
        }
      </View>
    </View>
  );
}
const exc = StyleSheet.create({
  card:       { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, marginBottom:10, overflow:"hidden" },
  topBar:     { height:2 },
  body:       { flexDirection:"row", alignItems:"flex-start", padding:14, gap:12 },
  logoWrap:   { width:46, height:46, borderRadius:13, borderWidth:1, alignItems:"center", justifyContent:"center", marginTop:2 },
  info:       { flex:1, gap:5 },
  nameRow:    { flexDirection:"row", alignItems:"center", gap:8 },
  name:       { fontSize:15, fontFamily:FONTS.monoBold, letterSpacing:0.3 },
  defBadge:   { backgroundColor:`${C.green}12`, borderRadius:4, borderWidth:1, borderColor:`${C.green}35`, paddingHorizontal:6, paddingVertical:2 },
  defText:    { fontSize:7, fontFamily:FONTS.monoBold, color:C.green, letterSpacing:1 },
  statusRow:  { flexDirection:"row", alignItems:"center", gap:5 },
  dot:        { width:5, height:5, borderRadius:3 },
  statusText: { fontSize:9, fontFamily:FONTS.monoBold, letterSpacing:0.6 },
  sep:        { fontSize:8, color:C.textDim },
  meta:       { fontSize:9, fontFamily:FONTS.mono, color:C.textMuted },
  perms:      { flexDirection:"row", gap:5, flexWrap:"wrap" },
  permTag:    { borderRadius:4, borderWidth:1, paddingHorizontal:6, paddingVertical:2 },
  permText:   { fontSize:7, fontFamily:FONTS.monoBold, letterSpacing:0.6 },
  connectBtn: { alignItems:"center", gap:4, paddingHorizontal:10, paddingVertical:8, borderRadius:RADIUS.md, borderWidth:1, borderColor:"#1a2535" },
  connectText:{ fontSize:9, fontFamily:FONTS.monoBold, letterSpacing:0.5 },
  menuBtn:    { padding:4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Premium 5-Step Infrastructure Onboarding Modal
// ─────────────────────────────────────────────────────────────────────────────

type ModalStep = "provider" | "mode" | "keys" | "check" | "success";

const CHECK_ITEMS = [
  { label:"Network connection verified",      icon:"wifi"       },
  { label:"API credentials authenticated",   icon:"key"        },
  { label:"Trade permissions confirmed",      icon:"check-circle"},
  { label:"Paper trading supported",          icon:"shield"     },
  { label:"AI compatibility confirmed",       icon:"cpu"        },
];

function InfrastructureModal({ visible, onClose }: { visible:boolean; onClose:()=>void }) {
  const [step,         setStep]         = useState<ModalStep>("provider");
  const [selected,     setSelected]     = useState<ExchangeOption|null>(null);
  const [selectedMode, setSelectedMode] = useState<"paper"|"live">("paper");
  const [apiKey,       setApiKey]       = useState("");
  const [apiSecret,    setApiSecret]    = useState("");
  const [passphrase,   setPassphrase]   = useState("");
  const [agreed,       setAgreed]       = useState(false);
  const [revealed,     setRevealed]     = useState<number[]>([]);
  const progAnim = useRef(new Animated.Value(0)).current;
  const fadeIn   = useRef(new Animated.Value(0)).current;
  const isWeb    = Platform.OS === "web";

  useEffect(() => {
    if (visible) Animated.timing(fadeIn, { toValue:1, duration:300, useNativeDriver:true }).start();
  }, [visible]);

  useEffect(() => {
    if (step === "check") {
      setRevealed([]);
      progAnim.setValue(0);
      Animated.timing(progAnim, { toValue:1, duration:2800, useNativeDriver:false }).start();
      CHECK_ITEMS.forEach((_, i) => {
        setTimeout(() => {
          setRevealed(prev => [...prev, i]);
          if (i === CHECK_ITEMS.length - 1) setTimeout(() => setStep("success"), 700);
        }, i * 520 + 250);
      });
    }
  }, [step]);

  const reset = () => {
    setStep("provider"); setSelected(null); setSelectedMode("paper");
    setApiKey(""); setApiSecret(""); setPassphrase(""); setAgreed(false);
    setRevealed([]); progAnim.setValue(0); fadeIn.setValue(0); onClose();
  };

  const handleSelect = (ex: ExchangeOption) => { Haptics.selectionAsync(); setSelected(ex); setStep("mode"); };

  const STEPS: ModalStep[] = ["provider","mode","keys","check","success"];
  const stepIdx = STEPS.indexOf(step);
  const barWidth = progAnim.interpolate({ inputRange:[0,1], outputRange:["0%","100%"] });

  const cryptoExchanges = EXCHANGE_OPTIONS.filter(e => e.cat === "crypto");
  const stocksBrokers   = EXCHANGE_OPTIONS.filter(e => e.cat === "stocks");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <KeyboardAvoidingView style={mo.overlay} behavior={isWeb ? "padding" : "height"}>
        <TouchableOpacity style={mo.backdrop} activeOpacity={1} onPress={step === "success" ? reset : undefined} />

        <Animated.View style={[mo.sheet, { opacity:fadeIn }]}>
          <View style={mo.handle} />

          {/* Progress dots */}
          {step !== "success" && (
            <View style={mo.dots}>
              {STEPS.slice(0, 4).map((s, i) => (
                <View key={s} style={[mo.dot, {
                  backgroundColor: i <= stepIdx ? C.cyan : C.border,
                  width: i === stepIdx ? 22 : 7,
                }]} />
              ))}
            </View>
          )}

          {/* ── STEP 1: Provider Selection ── */}
          {step === "provider" && (
            <>
              <View style={mo.header}>
                <View style={{ flex:1 }}>
                  <Text style={mo.title}>Select Infrastructure</Text>
                  <Text style={mo.sub}>Choose your exchange or broker to connect</Text>
                </View>
                <TouchableOpacity onPress={reset} style={mo.closeBtn}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                <View style={mo.sectionLabel}>
                  <Feather name="layers" size={9} color={C.cyan} />
                  <Text style={[mo.sectionLabelText, { color:C.cyan }]}>CRYPTO EXCHANGES</Text>
                </View>
                <View style={mo.grid}>
                  {cryptoExchanges.map(ex => (
                    <TouchableOpacity key={ex.id} style={[mo.exCard, { borderColor:`${ex.color}28` }]} onPress={() => handleSelect(ex)} activeOpacity={0.82}>
                      {ex.recommended && <View style={mo.recBadge}><Text style={mo.recText}>★</Text></View>}
                      <View style={[mo.exLogo, { backgroundColor:`${ex.color}15`, borderColor:`${ex.color}28` }]}>
                        <Text style={[mo.exLetter, { color:ex.color }]}>{ex.letter}</Text>
                      </View>
                      <Text style={mo.exName}>{ex.name}</Text>
                      <View style={mo.scoreRow}>
                        <Text style={[mo.score, { color:ex.aiScore >= 90 ? C.green : ex.aiScore >= 85 ? C.cyan : C.orange }]}>{ex.aiScore}</Text>
                        <Text style={mo.scoreLabel}>AI</Text>
                      </View>
                      <View style={mo.scoreBg}><View style={[mo.scoreBar, { width:`${ex.aiScore}%`, backgroundColor:ex.aiScore >= 90 ? C.green : ex.aiScore >= 85 ? C.cyan : C.orange }]} /></View>
                      <View style={mo.latRow}><Feather name="clock" size={8} color={C.textDim} /><Text style={mo.latText}>{ex.latency}</Text></View>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={[mo.sectionLabel, { marginTop:6 }]}>
                  <Feather name="briefcase" size={9} color={C.teal} />
                  <Text style={[mo.sectionLabelText, { color:C.teal }]}>STOCKS & HYBRID BROKERS</Text>
                </View>
                <View style={mo.grid}>
                  {stocksBrokers.map(ex => (
                    <TouchableOpacity key={ex.id} style={[mo.exCard, { borderColor:`${ex.color}35`, borderWidth:1.5 }]} onPress={() => handleSelect(ex)} activeOpacity={0.82}>
                      <View style={[mo.exLogo, { backgroundColor:`${ex.color}15`, borderColor:`${ex.color}35` }]}>
                        <Text style={[mo.exLetter, { color:ex.color, fontSize:13 }]}>{ex.letter}</Text>
                      </View>
                      <Text style={mo.exName}>{ex.name}</Text>
                      <View style={mo.scoreRow}>
                        <Text style={[mo.score, { color:C.cyan }]}>{ex.aiScore}</Text>
                        <Text style={mo.scoreLabel}>AI</Text>
                      </View>
                      <View style={mo.scoreBg}><View style={[mo.scoreBar, { width:`${ex.aiScore}%`, backgroundColor:C.cyan }]} /></View>
                      {ex.badges.map(b => (
                        <View key={b} style={[mo.badgeTag, { borderColor:`${BADGE_CFG[b] ?? C.cyan}30`, backgroundColor:`${BADGE_CFG[b] ?? C.cyan}08` }]}>
                          <Text style={[mo.badgeText, { color:BADGE_CFG[b] ?? C.cyan }]}>{b}</Text>
                        </View>
                      ))}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ height: 16 }} />
              </ScrollView>
            </>
          )}

          {/* ── STEP 2: Trading Mode ── */}
          {step === "mode" && selected && (
            <>
              <View style={mo.header}>
                <TouchableOpacity onPress={() => setStep("provider")} style={mo.backBtn}><Feather name="arrow-left" size={18} color={C.textMuted} /></TouchableOpacity>
                <View style={{ flex:1 }}>
                  <Text style={mo.title}>Choose Trading Mode</Text>
                  <Text style={mo.sub}>How should AI operate on {selected.name}?</Text>
                </View>
                <TouchableOpacity onPress={reset} style={mo.closeBtn}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>

              <View style={mo.modeWrap}>
                {/* Paper AI */}
                <TouchableOpacity
                  style={[mo.modeCard, selectedMode === "paper" && mo.modeCardActive, selectedMode === "paper" && { borderColor:`${C.cyan}55`, shadowColor:C.cyan, shadowOpacity:0.15, shadowRadius:12, elevation:5 }]}
                  onPress={() => setSelectedMode("paper")} activeOpacity={0.85}
                >
                  <View style={[mo.modeIconWrap, { backgroundColor:`${C.cyan}12` }]}>
                    <Feather name="shield" size={28} color={C.cyan} />
                  </View>
                  <Text style={[mo.modeTitle, { color:C.cyan }]}>PAPER AI</Text>
                  <Text style={mo.modeSub}>AI training mode{"\n"}No real capital at risk</Text>
                  <View style={mo.modeRec}><Text style={[mo.modeRecText, { color:C.cyan }]}>RECOMMENDED</Text></View>
                  {selectedMode === "paper" && (
                    <View style={[mo.modeCheck, { borderColor:C.cyan, backgroundColor:`${C.cyan}20` }]}>
                      <Feather name="check" size={11} color={C.cyan} />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Live AI */}
                <TouchableOpacity
                  style={[mo.modeCard, selectedMode === "live" && mo.modeCardLiveActive, selectedMode === "live" && { borderColor:`${C.orange}45`, shadowColor:C.orange, shadowOpacity:0.12, shadowRadius:12, elevation:5 }]}
                  onPress={() => setSelectedMode("live")} activeOpacity={0.85}
                >
                  <View style={[mo.modeIconWrap, { backgroundColor:`${C.orange}10` }]}>
                    <Feather name="zap" size={28} color={C.orange} />
                  </View>
                  <Text style={[mo.modeTitle, { color:selectedMode === "live" ? C.orange : C.textMuted }]}>LIVE AI</Text>
                  <Text style={mo.modeSub}>Real capital execution{"\n"}Requires validated exchange</Text>
                  {selectedMode === "live" && (
                    <View style={[mo.modeCheck, { borderColor:C.orange, backgroundColor:`${C.orange}18` }]}>
                      <Feather name="check" size={11} color={C.orange} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={mo.modeContinueWrap}>
                <TouchableOpacity style={[mo.connectBtn, { backgroundColor: selectedMode === "paper" ? C.cyan : C.orange }]} onPress={() => setStep("keys")} activeOpacity={0.85}>
                  <Text style={mo.connectBtnText}>Continue with {selectedMode === "paper" ? "Paper AI" : "Live AI"}</Text>
                  <Feather name="arrow-right" size={14} color="#000" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── STEP 3: API Keys ── */}
          {step === "keys" && selected && (
            <>
              <View style={mo.header}>
                <TouchableOpacity onPress={() => setStep("mode")} style={mo.backBtn}><Feather name="arrow-left" size={18} color={C.textMuted} /></TouchableOpacity>
                <View style={{ flex:1 }}>
                  <Text style={mo.title}>API Credentials</Text>
                  <Text style={mo.sub}>{selected.name} · {selectedMode === "paper" ? "PAPER AI" : "LIVE AI"}</Text>
                </View>
                <TouchableOpacity onPress={reset} style={mo.closeBtn}><Feather name="x" size={20} color={C.textMuted} /></TouchableOpacity>
              </View>
              <View style={mo.form}>
                <View style={mo.secBanner}>
                  <Feather name="shield" size={14} color={C.green} />
                  <Text style={mo.secText}>AES-256 encrypted · Withdrawal permissions never requested · Keys never stored in plaintext</Text>
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
                  <Text style={mo.checkLabel}>I confirm withdrawal permissions will never be requested or granted.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[mo.connectBtn, { opacity:apiKey && apiSecret && agreed ? 1 : 0.38, backgroundColor:selectedMode === "paper" ? C.cyan : C.orange }]}
                  onPress={() => setStep("check")} disabled={!apiKey || !apiSecret || !agreed} activeOpacity={0.85}
                >
                  <Feather name="cpu" size={14} color="#000" />
                  <Text style={mo.connectBtnText}>Run AI Readiness Check</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── STEP 4: AI Readiness Check ── */}
          {step === "check" && selected && (
            <View style={mo.checking}>
              <View style={[mo.exLogo, { width:60, height:60, borderRadius:18, borderColor:`${selected.color}40`, backgroundColor:`${selected.color}12`, marginBottom:8 }]}>
                <Text style={[mo.exLetter, { fontSize:22, color:selected.color }]}>{selected.letter}</Text>
              </View>
              <Text style={mo.checkTitle}>AI Readiness Check</Text>
              <Text style={mo.checkSub}>{selected.name} · {selectedMode === "paper" ? "Paper AI" : "Live AI"}</Text>
              <View style={mo.progressBg}>
                <Animated.View style={[mo.progressFill, { width: barWidth as any, backgroundColor:selected.color }]} />
              </View>
              <View style={mo.checkList}>
                {CHECK_ITEMS.map((item, i) => (
                  <View key={item.label} style={[mo.checkItem, { opacity: revealed.includes(i) ? 1 : 0.22 }]}>
                    <Feather name={revealed.includes(i) ? "check-circle" : (item.icon as any)} size={13} color={revealed.includes(i) ? C.green : C.textDim} />
                    <Text style={[mo.checkItemText, { color:revealed.includes(i) ? C.textSecondary : C.textDim }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── STEP 5: Success ── */}
          {step === "success" && selected && (
            <View style={mo.success}>
              <View style={[mo.successIcon, { borderColor:`${C.green}50`, backgroundColor:`${C.green}10` }]}>
                <Feather name="check" size={30} color={C.green} />
              </View>
              <Text style={mo.successTitle}>AI Trading Infrastructure</Text>
              <Text style={[mo.successTitle, { color:C.cyan }]}>Connected</Text>
              <Text style={mo.successSub}>{selected.name} is now linked and AI-ready</Text>
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
                  <Text style={[mo.successStatVal, { color: selectedMode === "paper" ? C.cyan : C.orange }]}>
                    {selectedMode === "paper" ? "PAPER" : "LIVE"}
                  </Text>
                  <Text style={mo.successStatLabel}>MODE</Text>
                </View>
              </View>
              <TouchableOpacity style={[mo.connectBtn, { backgroundColor:selectedMode === "paper" ? C.cyan : C.orange }]} onPress={reset} activeOpacity={0.85}>
                <Text style={mo.connectBtnText}>Start AI Trading</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mo = StyleSheet.create({
  overlay:    { flex:1, justifyContent:"flex-end" },
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor:"rgba(0,0,0,0.8)" },
  sheet:      { backgroundColor:"#060d18", borderTopLeftRadius:26, borderTopRightRadius:26, borderWidth:1, borderColor:C.border, paddingBottom:36, maxHeight:"92%" },
  handle:     { width:36, height:4, backgroundColor:C.border, borderRadius:2, alignSelf:"center", marginTop:12, marginBottom:4 },
  dots:       { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, paddingVertical:10 },
  dot:        { height:7, borderRadius:4 },
  header:     { flexDirection:"row", alignItems:"flex-start", padding:20, paddingBottom:14, borderBottomWidth:1, borderBottomColor:C.border, gap:12 },
  backBtn:    { paddingTop:2 },
  closeBtn:   { paddingTop:2 },
  title:      { fontSize:17, fontFamily:FONTS.monoBold, color:C.textPrimary },
  sub:        { fontSize:10, fontFamily:FONTS.mono, color:C.textMuted, marginTop:3 },

  sectionLabel:     { flexDirection:"row", alignItems:"center", gap:7, paddingHorizontal:16, paddingTop:14, paddingBottom:10 },
  sectionLabelText: { fontSize:8, fontFamily:FONTS.monoBold, letterSpacing:1.5 },
  grid:       { flexDirection:"row", flexWrap:"wrap", gap:10, paddingHorizontal:16 },
  exCard:     { width:"30%", backgroundColor:C.surface, borderRadius:RADIUS.lg, borderWidth:1, padding:10, alignItems:"center", gap:5, overflow:"hidden" },
  recBadge:   { position:"absolute", top:5, right:5 },
  recText:    { fontSize:10, color:C.green },
  exLogo:     { width:42, height:42, borderRadius:12, borderWidth:1, alignItems:"center", justifyContent:"center" },
  exLetter:   { fontSize:14, fontFamily:FONTS.monoBold },
  exName:     { fontSize:9, fontFamily:FONTS.monoBold, color:C.textPrimary, textAlign:"center" },
  scoreRow:   { flexDirection:"row", alignItems:"baseline", gap:2 },
  score:      { fontSize:15, fontFamily:FONTS.monoBold },
  scoreLabel: { fontSize:7, fontFamily:FONTS.mono, color:C.textDim },
  scoreBg:    { width:"100%", height:3, borderRadius:2, backgroundColor:C.border, overflow:"hidden" },
  scoreBar:   { height:"100%", borderRadius:2 },
  latRow:     { flexDirection:"row", alignItems:"center", gap:3 },
  latText:    { fontSize:8, fontFamily:FONTS.mono, color:C.textDim },
  badgeTag:   { borderRadius:3, borderWidth:1, paddingHorizontal:5, paddingVertical:1 },
  badgeText:  { fontSize:6, fontFamily:FONTS.monoBold, letterSpacing:0.4 },

  modeWrap:          { flexDirection:"row", gap:12, padding:20, paddingTop:16 },
  modeCard:          { flex:1, backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:C.border, padding:16, alignItems:"center", gap:10 },
  modeCardActive:    { backgroundColor:`${C.cyan}05` },
  modeCardLiveActive:{ backgroundColor:`${C.orange}04` },
  modeIconWrap:      { width:56, height:56, borderRadius:28, alignItems:"center", justifyContent:"center" },
  modeTitle:         { fontSize:12, fontFamily:FONTS.monoBold, letterSpacing:1 },
  modeSub:           { fontSize:9, fontFamily:FONTS.mono, color:C.textMuted, textAlign:"center", lineHeight:14 },
  modeRec:           { backgroundColor:`${C.cyan}12`, borderRadius:4, paddingHorizontal:7, paddingVertical:3 },
  modeRecText:       { fontSize:7, fontFamily:FONTS.monoBold, letterSpacing:0.8 },
  modeCheck:         { width:22, height:22, borderRadius:11, borderWidth:1.5, alignItems:"center", justifyContent:"center" },
  modeContinueWrap:  { paddingHorizontal:20, paddingBottom:4 },

  form:      { padding:20, gap:14 },
  secBanner: { flexDirection:"row", gap:10, backgroundColor:`${C.green}08`, borderRadius:RADIUS.md, borderWidth:1, borderColor:`${C.green}20`, padding:12, alignItems:"flex-start" },
  secText:   { flex:1, fontSize:9, fontFamily:FONTS.mono, color:C.textMuted, lineHeight:14 },
  field:     { gap:6 },
  fieldLabel:{ fontSize:9, fontFamily:FONTS.monoBold, color:C.textMuted, letterSpacing:1.2 },
  input:     { backgroundColor:C.surface, borderRadius:RADIUS.md, borderWidth:1, borderColor:C.border, paddingHorizontal:14, paddingVertical:13, fontSize:13, fontFamily:FONTS.mono, color:C.textPrimary },
  checkRow:  { flexDirection:"row", alignItems:"flex-start", gap:12 },
  checkbox:  { width:18, height:18, borderRadius:5, borderWidth:1.5, borderColor:C.border, alignItems:"center", justifyContent:"center", marginTop:1 },
  checkLabel:{ flex:1, fontSize:11, fontFamily:FONTS.mono, color:C.textMuted, lineHeight:16 },

  connectBtn:     { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8, borderRadius:RADIUS.lg, paddingVertical:15 },
  connectBtnText: { fontSize:13, fontFamily:FONTS.monoBold, color:"#000", letterSpacing:0.4 },

  checking:     { padding:28, alignItems:"center", gap:14 },
  checkTitle:   { fontSize:18, fontFamily:FONTS.monoBold, color:C.textPrimary },
  checkSub:     { fontSize:10, fontFamily:FONTS.mono, color:C.textMuted },
  progressBg:   { width:"100%", height:4, backgroundColor:C.border, borderRadius:2, overflow:"hidden" },
  progressFill: { height:"100%", borderRadius:2 },
  checkList:    { gap:10, width:"100%", marginTop:4 },
  checkItem:    { flexDirection:"row", alignItems:"center", gap:10 },
  checkItemText:{ fontSize:12, fontFamily:FONTS.mono },

  success:          { padding:32, alignItems:"center", gap:14 },
  successIcon:      { width:72, height:72, borderRadius:36, borderWidth:2, alignItems:"center", justifyContent:"center", shadowColor:C.green, shadowOpacity:0.35, shadowRadius:18, shadowOffset:{width:0,height:0}, elevation:10 },
  successTitle:     { fontSize:22, fontFamily:FONTS.monoBold, color:C.textPrimary, lineHeight:28 },
  successSub:       { fontSize:12, fontFamily:FONTS.mono, color:C.textMuted, textAlign:"center" },
  successStats:     { flexDirection:"row", gap:24, marginTop:4 },
  successStat:      { alignItems:"center", gap:4 },
  successStatVal:   { fontSize:18, fontFamily:FONTS.monoBold },
  successStatLabel: { fontSize:7, fontFamily:FONTS.mono, color:C.textDim, letterSpacing:1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Supporting components
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ initials, size = 68 }: { initials:string; size?:number }) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue:1, duration:3000, useNativeDriver:true }),
      Animated.timing(glow, { toValue:0, duration:3000, useNativeDriver:true }),
    ])).start();
  }, []);
  const shadowOp = glow.interpolate({ inputRange:[0,1], outputRange:[0.25,0.55] });
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

  const [modalOpen,    setModalOpen]    = useState(false);
  const [tradingMode,  setTradingMode]  = useState<"paper"|"live">("paper");
  const [pushEnabled,  setPushEnabled]  = useState(false);

  useEffect(() => {
    async function checkPush() {
      if (Platform.OS === "web" || !Device.isDevice) return;
      const { status } = await Notifications.getPermissionsAsync();
      setPushEnabled(status === "granted");
    }
    void checkPush();
  }, []);

  async function togglePushNotifications() {
    if (!Device.isDevice) {
      Alert.alert("Push Notifications", "Push notifications require a physical device.");
      return;
    }
    if (pushEnabled) {
      Alert.alert(
        "Disable Notifications",
        "To disable notifications, go to your phone's Settings → Notifications → AICandlez.",
      );
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Enable notifications in your phone settings to receive trade alerts.");
      return;
    }
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      await fetch("/api/user/push-token", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          token:      tokenData.data,
          platform:   "expo",
          deviceName: Device.deviceName ?? "Mobile",
        }),
        credentials: "include",
      });
      setPushEnabled(true);
    } catch {
      Alert.alert("Error", "Could not register push token. Please try again.");
    }
  }

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
              <View style={{ flexDirection:"row", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <Text style={p.userName}>AICandlez</Text>
                <View style={p.proBadge}><Text style={p.proBadgeText}>PRO</Text></View>
              </View>
              <Text style={p.userEmail}>user@aicandlez.com</Text>
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

        {/* ── Trading Mode ── */}
        <SH label="AI TRADING MODE" accent={C.cyan} />
        <View style={p.modeCard}>
          <View style={p.modeCardLeft}>
            <Text style={p.modeCardTitle}>{tradingMode === "paper" ? "Paper AI Active" : "Live AI Active"}</Text>
            <Text style={p.modeCardSub}>
              {tradingMode === "paper"
                ? "AI training mode — no real capital at risk"
                : "Real execution — AI managing live positions"}
            </Text>
          </View>
          <TradingModeToggle mode={tradingMode} onChange={setTradingMode} />
        </View>

        {/* ── Exchange Connections ── */}
        <SH label="EXCHANGE CONNECTIONS" accent={C.cyan} />
        <InfrastructureCTA onPress={() => setModalOpen(true)} />
        {EXCHANGES.map(ex => (
          <ExchangeCard key={ex.id} ex={ex} onConnect={() => setModalOpen(true)} />
        ))}

        {/* ── Account Settings ── */}
        <SH label="ACCOUNT SETTINGS" accent={C.teal} />
        <View style={p.settingsCard}>
          <SettingRow
            icon="bell"
            label="Push Notifications"
            value={pushEnabled ? "Enabled" : Platform.OS === "web" ? "Web only" : "Disabled"}
            accent={pushEnabled ? C.green : C.cyan}
            onPress={togglePushNotifications}
          />
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

      <InfrastructureModal visible={modalOpen} onClose={() => setModalOpen(false)} />
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

  modeCard:      { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.cyan}20`, padding:16, marginBottom:16, flexDirection:"row", alignItems:"center", gap:14, shadowColor:C.cyan, shadowOpacity:0.07, shadowRadius:10, shadowOffset:{width:0,height:2}, elevation:3 },
  modeCardLeft:  { flex:1 },
  modeCardTitle: { fontSize:13, fontFamily:FONTS.monoBold, color:C.textPrimary, marginBottom:3 },
  modeCardSub:   { fontSize:9, fontFamily:FONTS.mono, color:C.textMuted, lineHeight:13 },

  settingsCard: { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:C.border, paddingHorizontal:16, marginBottom:24, shadowColor:"#000", shadowOpacity:0.06, shadowRadius:10, shadowOffset:{width:0,height:2}, elevation:3 },

  statusCard: { backgroundColor:C.surface, borderRadius:RADIUS.xl, borderWidth:1, borderColor:`${C.green}18`, padding:16, marginBottom:24, shadowColor:C.green, shadowOpacity:0.07, shadowRadius:14, shadowOffset:{width:0,height:3}, elevation:4 },
  statusRow:  { flexDirection:"row", alignItems:"center", paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.border, gap:10 },
  statusDot:  { width:7, height:7, borderRadius:4, elevation:4 },
  statusLabel:{ flex:1, fontSize:13, fontFamily:FONTS.monoMedium, color:C.textMuted },
  statusVal:  { fontSize:11, fontFamily:FONTS.monoBold, letterSpacing:0.4 },
});
