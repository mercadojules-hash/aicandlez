import { useState, useEffect, useRef } from "react";
import {
  Play, Pause, ShieldOff, Shield, Square,
  TrendingUp, TrendingDown, Clock, Zap, AlertTriangle, Activity, X, Trash2,
} from "lucide-react";
import type { EngineStatus, AppSettings, Trade, ExchangeStatus, SimAccount, LiveBalance } from "./types";

// ── Exchange options ──────────────────────────────────────────────────────────

const LIVE_EXCHANGES = [
  { id: "kraken",    label: "KRAKEN",     color: "#5741d9" },
  { id: "coinbase",  label: "COINBASE",   color: "#2775ca" },
  { id: "binance",   label: "BINANCE.US", color: "#f0b90b" },
  { id: "cryptocom", label: "CRYPTO.COM", color: "#1199fa" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  engine:                EngineStatus   | undefined;
  settings:              AppSettings    | undefined;
  exchangeStatus:        ExchangeStatus | undefined;
  trades:                Trade[]        | undefined;
  simAccount:            SimAccount     | undefined;
  liveBalance?:          LiveBalance    | undefined;
  activeId:              string;
  liveActive:            boolean;
  onToggleKill:          () => void;
  onTogglePause:         () => void;
  onStartEngine:         () => void;
  onStopEngine:          () => void;
  onSettingsPatch:       (patch: Record<string, number | boolean>) => void;
  onSelectSim:           () => void;
  onSelectLive:          (ex: string) => void;
  switchError?:          string | null;
  onClearSwitchError?:   () => void;
  onCloseAllPositions?:  () => void;
  closingAll?:           boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$( n: number, decimals = 2 ) {
  const abs = Math.abs(n);
  const str = abs >= 1_000_000 ? `$${(abs/1_000_000).toFixed(2)}M`
    : abs >= 1_000 ? `$${(abs/1_000).toFixed(2)}K`
    : `$${abs.toFixed(decimals)}`;
  return n < 0 ? `-${str}` : str;
}

function pctColor(n: number | null): string {
  if (n == null) return "#9FB3C8";
  return n > 0 ? "#00ff8a" : n < 0 ? "#ff3355" : "#9FB3C8";
}

function tradeDuration(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, valueColor = "#EAF2FF", big = false,
}: {
  label: string; value: string; sub?: string; valueColor?: string; big?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2 flex-1 min-w-0 border-r last:border-r-0"
      style={{ borderRightColor: "#0d1e2e" }}>
      <div className={`font-mono font-bold tabular-nums leading-none ${big ? "text-2xl" : "text-xl"}`}
        style={{ color: valueColor }}>
        {value}
      </div>
      {sub && (
        <div className="text-[9px] font-mono font-semibold leading-none mt-0.5"
          style={{ color: pctColor(parseFloat(sub)) }}>
          {parseFloat(sub) > 0 ? "▲" : parseFloat(sub) < 0 ? "▼" : ""} {sub}
        </div>
      )}
      <div className="text-[9px] font-mono font-medium uppercase tracking-[0.12em] leading-none mt-1"
        style={{ color: "#4a6070" }}>
        {label}
      </div>
    </div>
  );
}

function LargeButton({
  onClick, label, sub, icon: Icon, color, bgColor, borderColor, disabled = false,
}: {
  onClick: () => void; label: string; sub?: string; icon: React.ElementType;
  color: string; bgColor: string; borderColor: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 w-full font-mono font-bold transition-all rounded-md"
      style={{
        padding:       "12px 16px",
        fontSize:      "13px",
        letterSpacing: "0.08em",
        color,
        background:    bgColor,
        border:        `1px solid ${borderColor}`,
        boxShadow:     `0 0 12px ${bgColor}40`,
        opacity:       disabled ? 0.35 : 1,
        cursor:        disabled ? "not-allowed" : "pointer",
      }}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div className="flex flex-col items-start gap-0.5">
        <span>{label}</span>
        {sub && <span className="text-[9px] font-normal opacity-60">{sub}</span>}
      </div>
    </button>
  );
}

// ── Signal-waiting animated visualization ─────────────────────────────────────

function SignalWaitingViz() {
  const N = 40;
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: N }, () => 8 + Math.random() * 22));
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setBars(prev => {
        const next = [...prev.slice(1), 8 + Math.random() * 22];
        return next;
      });
      setPulse(p => p + 1);
    }, 140);
    return () => clearInterval(id);
  }, []);

  const W = 520, H = 56, barW = W / N - 1;

  return (
    <div className="border-t flex items-stretch" style={{ borderTopColor: "#0a1a28", background: "#000000", minHeight: 58 }}>

      {/* Animated bar chart */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ display: "block" }}>
          {bars.map((h, i) => {
            const isRecent = i >= N - 4;
            const color = isRecent ? "#00f0ff" : i % 7 === 0 ? "#cc55ff" : "#00f0ff";
            const opacity = 0.12 + (i / N) * 0.55 + (isRecent ? 0.3 : 0);
            return (
              <rect key={i}
                x={i * (barW + 1)} y={H - h} width={barW} height={h}
                fill={color} opacity={opacity} rx={1} />
            );
          })}
          {/* Scanning line */}
          <line
            x1={((pulse % N) / N) * W} y1={0}
            x2={((pulse % N) / N) * W} y2={H}
            stroke="#00f0ff" strokeWidth={1} opacity={0.3} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", paddingLeft: 12, gap: 8,
        }}>
          <Activity style={{ width: 13, height: 13, color: "#1e3a50", flexShrink: 0 }} />
          <span style={{ fontSize: 9.5, fontFamily: "monospace", fontWeight: 700,
            color: "#1e3a50", letterSpacing: "0.2em", textTransform: "uppercase" }}>
            No active positions — AI monitoring signals
          </span>
        </div>
      </div>

      {/* Right: live signal counters */}
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        gap: 3, paddingLeft: 14, paddingRight: 16, borderLeft: "1px solid #0a1824",
        flexShrink: 0,
      }}>
        {[
          { label: "SIGNAL FLOW",  color: "#00f0ff" },
          { label: "MTF ACTIVE",   color: "#cc55ff" },
          { label: "RISK OK",      color: "#00ff8a" },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: color,
              boxShadow: `0 0 4px ${color}`, flexShrink: 0 }} className="live-dot" />
            <span style={{ fontSize: 7.5, fontFamily: "monospace", color: `${color}70`,
              letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Signal Activity mini panel ─────────────────────────────────────────────

function AISignalMini({ engine }: { engine?: EngineStatus }) {
  const [pts, setPts] = useState<number[]>(() => Array.from({ length: 24 }, () => 45 + Math.random() * 30));
  const [lastAction, setLastAction] = useState<{ action: string; color: string } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const base = engine?.signalCounts?.BUY ?? 0;
      const conf  = 40 + base * 1.2 + (Math.random() - 0.5) * 14;
      setPts(prev => [...prev.slice(1), Math.max(5, Math.min(95, conf))]);
    }, 1600);
    return () => clearInterval(id);
  }, [engine]);

  useEffect(() => {
    const sig = engine?.lastSignal;
    if (!sig) return;
    const color = sig.action === "BUY" ? "#00ff8a" : sig.action === "SELL" ? "#ff3355" : "#ffaa00";
    setLastAction({ action: sig.action, color });
    const t = setTimeout(() => setLastAction(null), 4000);
    return () => clearTimeout(t);
  }, [engine?.lastSignal]);

  const W = 240, H = 36;
  const smooth = (arr: number[]) => arr.map((v, i) => {
    const x = (i / (arr.length - 1)) * W;
    const y = H - (v / 100) * H;
    return { x, y };
  });
  const pts2d = smooth(pts);
  const d = pts2d.map((p, i) =>
    i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  ).join(" ");
  const area = `${d} L ${W} ${H} L 0 ${H} Z`;

  const lastConf = pts[pts.length - 1] ?? 0;
  const confColor = lastConf >= 65 ? "#00ff8a" : lastConf >= 45 ? "#ffaa00" : "#ff5544";

  return (
    <div style={{
      background: "#000000",
      border: "1px solid #0d1824",
      borderRadius: 4,
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 7.5, fontFamily: "monospace", fontWeight: 700,
          color: "#2a4050", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          AI SIGNAL MONITOR
        </span>
        {lastAction && (
          <span style={{
            fontSize: 7, fontFamily: "monospace", fontWeight: 700,
            padding: "2px 6px", borderRadius: 3,
            background: `${lastAction.color}15`,
            color: lastAction.color,
            border: `1px solid ${lastAction.color}40`,
            letterSpacing: "0.1em",
          }}>
            {lastAction.action}
          </span>
        )}
      </div>

      {/* Confidence sparkline */}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: "block" }}>
        <defs>
          <linearGradient id="ltc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={confColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={confColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ltc-grad)" />
        <path d={d} fill="none" stroke={confColor} strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 0 4px ${confColor}60)` }} />
        {/* Live dot */}
        {pts2d[pts2d.length - 1] && (
          <circle cx={pts2d[pts2d.length - 1]!.x} cy={pts2d[pts2d.length - 1]!.y}
            r={3} fill={confColor}
            style={{ filter: `drop-shadow(0 0 5px ${confColor})` }} />
        )}
      </svg>

      {/* Metric row */}
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { label: "CONFIDENCE",  value: `${lastConf.toFixed(0)}%`,            color: confColor },
          { label: "SIGNALS",     value: String(engine?.signalsGenerated ?? 0), color: "#00aaff" },
          { label: "EXECUTIONS",  value: String(engine?.tradesExecuted ?? 0),   color: "#ffaa00" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700,
              color, lineHeight: 1, letterSpacing: "-0.01em" }}>{value}</span>
            <span style={{ fontSize: 7, fontFamily: "monospace", color: "#1e3040",
              textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Active Trade Card ─────────────────────────────────────────────────────────

function ActiveTradeCard({ openTrade, simPos }: {
  openTrade: Trade | undefined;
  simPos:    SimAccount["positions"][0] | undefined;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const trade = openTrade;
  const pos   = simPos;

  if (!trade && !pos) {
    return <SignalWaitingViz />;
  }

  const symbol    = trade?.symbol  ?? pos?.symbol  ?? "—";
  const side      = trade?.side    ?? pos?.side.toUpperCase() ?? "—";
  const entry     = trade?.price   ?? pos?.entryPrice ?? 0;
  const current   = pos?.currentPrice ?? 0;
  const pnl       = trade?.pnl     ?? pos?.unrealizedPnL ?? 0;
  const pnlPct    = trade?.pnlPercent ?? pos?.unrealizedPnLPct ?? 0;
  const sl        = trade?.stopLoss ?? null;
  const tp        = trade?.takeProfit ?? null;
  const startMs   = pos ? pos.entryTime : new Date(trade?.timestamp ?? Date.now()).getTime();
  const dur       = tradeDuration(startMs);
  const reason    = trade?.reason ?? "—";
  const isBuy     = side.toUpperCase() === "BUY";
  const sideColor = isBuy ? "#00ff8a" : "#ff3355";

  return (
    <div className="border-t" style={{ borderTopColor: "#0d1e2e", background: "#000508" }}>
      {/* Trade header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0 live-dot"
            style={{ background: sideColor, boxShadow: `0 0 6px ${sideColor}` }} />
          <span className="text-[13px] font-bold font-mono" style={{ color: "#EAF2FF" }}>
            {symbol}
          </span>
          <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded"
            style={{ background: `${sideColor}18`, color: sideColor, border: `1px solid ${sideColor}40` }}>
            {side}
          </span>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ background: "#00ff8a10", color: "#00ff8a60", border: "1px solid #00ff8a20" }}>
            OPEN
          </span>
        </div>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 text-[10px] font-mono font-medium"
          style={{ color: "#4a6070" }}>
          <Clock className="w-3 h-3" /> {tick >= 0 ? dur : dur}
        </span>
      </div>

      {/* Price grid */}
      <div className="grid px-4 pb-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: "2px 16px" }}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>ENTRY</span>
          <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#9FB3C8" }}>
            ${entry.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {current > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>CURRENT</span>
            <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#EAF2FF" }}>
              ${current.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>UNREALIZED P&L</span>
          <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: pctColor(pnl) }}>
            {pnl >= 0 ? "+" : ""}{fmt$(pnl)}
            <span className="text-[10px] ml-1 opacity-70">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>
          </span>
        </div>
        {tp != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>TAKE PROFIT</span>
            <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#00ff8a" }}>
              ${Number(tp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
        {sl != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>STOP LOSS</span>
            <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#ff5555" }}>
              ${Number(sl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Signal reason */}
      {reason && reason !== "—" && (
        <div className="px-4 pb-2.5 flex items-center gap-2">
          <Zap className="w-3 h-3 flex-shrink-0" style={{ color: "#00aaff60" }} />
          <span className="text-[9px] font-mono" style={{ color: "#4a7a94" }}>
            SIGNAL: {String(reason).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LiveTradingConsole({
  engine, settings, exchangeStatus, trades, simAccount, liveBalance,
  activeId, liveActive,
  onToggleKill, onTogglePause, onStartEngine, onStopEngine,
  onSettingsPatch, onSelectSim, onSelectLive,
  switchError, onClearSwitchError, onCloseAllPositions, closingAll,
}: Props) {
  const isRunning  = engine?.running ?? false;
  const isKill     = exchangeStatus?.killSwitch ?? false;
  const isPaused   = exchangeStatus?.paused     ?? false;
  const exName     = exchangeStatus?.exchangeName ?? "Kraken";

  // Confidence slider with local state + debounced save
  const [confidence, setConfidence] = useState(settings?.minConfidence ?? 45);
  const [maxPos,     setMaxPos]     = useState(settings?.allocation    ?? 0.01);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (settings?.minConfidence != null) setConfidence(settings.minConfidence);
  }, [settings?.minConfidence]);
  useEffect(() => {
    if (settings?.allocation != null) setMaxPos(settings.allocation);
  }, [settings?.allocation]);

  function debouncedSave(patch: Record<string, number | boolean>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSettingsPatch(patch), 600);
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const closedTrades = (trades ?? []).filter(t => t.status === "closed");
  const openTrades   = (trades ?? []).filter(t => t.status === "open");
  const wins         = closedTrades.filter(t => (t.pnl ?? 0) > 0);
  const losses       = closedTrades.filter(t => (t.pnl ?? 0) < 0);
  const winRate      = closedTrades.length > 0 ? Math.round(wins.length / closedTrades.length * 100) : null;
  const totalRealized = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  const todayStr   = new Date().toISOString().slice(0, 10);
  const todayTrades = closedTrades.filter(t => (t.timestamp ?? "").startsWith(todayStr));
  const sessionPnL  = todayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const tradesLeft  = Math.max(0, (settings?.maxTradesPerDay ?? 5) - todayTrades.length);

  const simPos     = simAccount?.positions?.[0];
  const openTrade  = openTrades[0];

  // In LIVE mode: show real exchange USD balance. In SIM mode: show simulation equity.
  // Strict exchange-scope: never fall back to sim balance when in live mode
  const liveUSD      = liveActive && liveBalance?.source === "live" ? (liveBalance.balances.USD ?? null) : null;
  const balance      = liveActive ? liveUSD : (simAccount?.equity ?? simAccount?.account?.cashBalance ?? null);
  const balanceLabel = liveActive
    ? (liveUSD != null ? `${exName.toUpperCase()} LIVE USD` : "CONNECTING…")
    : "ACCOUNT EQUITY";
  const unrealPnL  = simAccount?.unrealizedPnL ?? 0;

  // ── Status banner color ───────────────────────────────────────────────────

  let bannerBg = "#000508";
  let bannerBorder = "#0d1e2e";
  let modeLabel = "SIMULATION MODE";
  let modeBadgeColor = "#ffaa00";

  if (isKill) {
    bannerBg = "#160008";
    bannerBorder = "#ff225540";
    modeLabel = "KILL SWITCH ACTIVE — ALL TRADING HALTED";
    modeBadgeColor = "#ff2255";
  } else if (liveActive && isRunning && !isPaused) {
    bannerBg = "#001208";
    bannerBorder = "#00ff8a30";
    modeLabel = `LIVE TRADING — ${exName.toUpperCase()} — SPOT ONLY`;
    modeBadgeColor = "#00ff8a";
  } else if (liveActive) {
    bannerBg = "#060010";
    bannerBorder = "#5741d940";
    modeLabel = `LIVE MODE — ${exName.toUpperCase()} — AI PAUSED`;
    modeBadgeColor = "#5741d9";
  } else if (isRunning && !isPaused) {
    bannerBg = "#000a18";
    bannerBorder = "#00aaff30";
    modeLabel = "SIMULATION MODE — AI TRADING ACTIVE";
    modeBadgeColor = "#00aaff";
  }

  return (
    <div className="flex-shrink-0" style={{ background: "#000000", borderBottom: `2px solid ${bannerBorder}` }}>

      {/* ── Exchange switch error banner ────────────────────────────────────── */}
      {switchError && (
        <div className="flex items-center gap-3 px-4 py-2"
          style={{ background: "#1a0008", borderBottom: "1px solid #ff225540" }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ff2255" }} />
          <span className="text-[10px] font-mono font-bold flex-1" style={{ color: "#ff6688" }}>
            EXCHANGE SWITCH FAILED — {switchError.toUpperCase()}
          </span>
          <span className="text-[9px] font-mono" style={{ color: "#ff225560" }}>
            ADD API KEYS IN SETTINGS → EXCHANGE CONNECTIONS
          </span>
          <button onClick={onClearSwitchError}
            className="flex-shrink-0 rounded p-0.5 transition-all"
            style={{ color: "#ff225580", background: "transparent", border: "none" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Status Banner ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2.5"
        style={{ background: bannerBg, borderBottom: "1px solid #0a1520" }}>

        {/* Pulse + Mode label */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(isRunning && !isKill) && (
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 live-dot"
              style={{ background: modeBadgeColor, boxShadow: `0 0 8px ${modeBadgeColor}` }} />
          )}
          {isKill && <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#ff2255" }} />}
          <span className="text-[11px] font-bold font-mono tracking-[0.15em]"
            style={{ color: modeBadgeColor }}>
            {modeLabel}
          </span>
        </div>

        <div className="flex-1" />

        {/* Quick status chips */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusChip label="AI ENGINE" value={isRunning ? (isPaused ? "PAUSED" : "RUNNING") : "STOPPED"}
            color={isRunning && !isPaused ? "#00ff8a" : isPaused ? "#ffaa00" : "#ff3355"} />
          <StatusChip label="KILL SWITCH" value={isKill ? "ACTIVE" : "SAFE"}
            color={isKill ? "#ff2255" : "#00ff8a"} />
          <StatusChip label="MODE" value={liveActive ? `LIVE · ${exName.toUpperCase()}` : "SIMULATION"}
            color={liveActive ? "#00ff8a" : "#ffaa00"} />
          <StatusChip label="OPEN POSITIONS" value={String((openTrades.length) + (simPos ? 1 : 0))}
            color="#9FB3C8" />
          {(sessionPnL !== 0) && (
            <StatusChip label="SESSION P&L" value={`${sessionPnL >= 0 ? "+" : ""}${fmt$(sessionPnL)}`}
              color={pctColor(sessionPnL)} />
          )}
        </div>
      </div>

      {/* ── Main control panel ─────────────────────────────────────────────── */}
      <div className="flex" style={{ minHeight: 160 }}>

        {/* LEFT: Primary Action Buttons */}
        <div className="flex flex-col gap-2 p-4 flex-shrink-0"
          style={{ width: 230, borderRight: "1px solid #0d1e2e", background: "#000305" }}>
          <div className="text-[8px] font-bold font-mono tracking-[0.2em] mb-1" style={{ color: "#2a4050" }}>
            PRIMARY CONTROLS
          </div>

          {!isRunning ? (
            <LargeButton
              onClick={onStartEngine}
              label="START AI TRADER"
              sub="Begin signal monitoring"
              icon={Play}
              color="#00ff8a"
              bgColor="#00ff8a14"
              borderColor="#00ff8a40"
              disabled={isKill}
            />
          ) : (
            <LargeButton
              onClick={onStopEngine}
              label="STOP AI TRADER"
              sub="Halt signal loop"
              icon={Square}
              color="#ff9900"
              bgColor="#ff990014"
              borderColor="#ff990040"
            />
          )}

          <LargeButton
            onClick={onTogglePause}
            label={isPaused ? "RESUME TRADING" : "PAUSE TRADING"}
            sub={isPaused ? "Resume order execution" : "Hold — keep monitoring"}
            icon={isPaused ? Play : Pause}
            color={isPaused ? "#00aaff" : "#ffaa00"}
            bgColor={isPaused ? "#00aaff14" : "#ffaa0014"}
            borderColor={isPaused ? "#00aaff40" : "#ffaa0040"}
            disabled={!isRunning}
          />

          <LargeButton
            onClick={onToggleKill}
            label={isKill ? "KILL SWITCH: ON" : "KILL SWITCH"}
            sub={isKill ? "Click to re-enable trading" : "Emergency stop all trades"}
            icon={isKill ? ShieldOff : Shield}
            color={isKill ? "#ff2255" : "#9FB3C8"}
            bgColor={isKill ? "#ff225514" : "transparent"}
            borderColor={isKill ? "#ff225560" : "#1c2a36"}
          />

          {/* Close All Positions — unblocks the max-positions gate */}
          <LargeButton
            onClick={onCloseAllPositions ?? (() => {})}
            label={closingAll ? "CLOSING…" : "CLOSE ALL POSITIONS"}
            sub="Force-close all open trades & reset sim"
            icon={Trash2}
            color="#ff6600"
            bgColor="#ff660010"
            borderColor="#ff660035"
            disabled={closingAll}
          />
        </div>

        {/* CENTER: Stats + Active Trade */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Stats row */}
          <div className="flex border-b" style={{ borderBottomColor: "#0d1e2e" }}>
            <StatCard
              label={balanceLabel}
              value={balance != null ? fmt$(balance, 0) : "—"}
              big
              valueColor={liveUSD != null ? "#00ff8a" : "#EAF2FF"}
            />
            <StatCard
              label="TOTAL REALIZED P&L"
              value={closedTrades.length > 0 ? `${totalRealized >= 0 ? "+" : ""}${fmt$(totalRealized)}` : "—"}
              valueColor={pctColor(totalRealized)}
            />
            <StatCard
              label="UNREALIZED P&L"
              value={unrealPnL !== 0 ? `${unrealPnL >= 0 ? "+" : ""}${fmt$(unrealPnL)}` : "—"}
              valueColor={pctColor(unrealPnL)}
            />
            <StatCard
              label="WIN RATE"
              value={winRate != null ? `${winRate}%` : "—"}
              sub={closedTrades.length > 0 ? `${wins.length}W / ${losses.length}L` : undefined}
              valueColor={winRate != null ? (winRate >= 50 ? "#00ff8a" : "#ff5555") : "#9FB3C8"}
            />
            <StatCard
              label="TRADES TODAY"
              value={String(todayTrades.length)}
              sub={`of ${settings?.maxTradesPerDay ?? 5} limit · ${tradesLeft > 0 ? `${tradesLeft} left` : "maxed"}`}
              valueColor={tradesLeft === 0 ? "#ffaa00" : "#9FB3C8"}
            />
            <StatCard
              label="SESSION P&L"
              value={todayTrades.length > 0 ? `${sessionPnL >= 0 ? "+" : ""}${fmt$(sessionPnL)}` : "—"}
              valueColor={pctColor(sessionPnL)}
            />
          </div>

          {/* Active trade / no-position card */}
          <ActiveTradeCard openTrade={openTrade} simPos={simPos} />
        </div>

        {/* RIGHT: Configuration Panel */}
        <div className="flex flex-col gap-4 p-4 flex-shrink-0"
          style={{ width: 280, borderLeft: "1px solid #0d1e2e", background: "#000305" }}>

          {/* Header + Test mode badge */}
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-bold font-mono tracking-[0.2em]" style={{ color: "#2a4050" }}>
              LIVE TEST CONFIG
            </span>
            {liveActive && exName !== "Kraken" && (
              <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded"
                style={{ background: "#ff990018", color: "#ff9900", border: "1px solid #ff990040" }}>
                {exName.toUpperCase()} · SPOT ONLY
              </span>
            )}
          </div>

          {/* Confidence slider */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold font-mono" style={{ color: "#9FB3C8" }}>
                AI CONFIDENCE THRESHOLD
              </label>
              <span className="text-[16px] font-bold font-mono tabular-nums" style={{ color: "#00aaff" }}>
                {confidence}
              </span>
            </div>
            <input
              type="range" min={30} max={95} step={5}
              value={confidence}
              onChange={e => {
                const v = Number(e.target.value);
                setConfidence(v);
                debouncedSave({ minConfidence: v });
              }}
              className="w-full accent-blue-500"
              style={{ accentColor: "#00aaff", height: 6, cursor: "pointer" }}
            />
            <div className="flex justify-between text-[8px] font-mono" style={{ color: "#2a4050" }}>
              <span>30 · AGGRESSIVE</span>
              <span>95 · STRICT</span>
            </div>
            <div className="text-[8px] font-mono px-2 py-1.5 rounded" style={{ background: "#00aaff0a", color: "#00aaff60", border: "1px solid #00aaff18" }}>
              TESTING RANGE: 40–55 recommended for Kraken spot
            </div>
          </div>

          {/* Position size */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold font-mono" style={{ color: "#9FB3C8" }}>
              MAX POSITION SIZE (% of balance)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.001} max={2} step={0.001}
                value={maxPos}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 0.01;
                  setMaxPos(v);
                  debouncedSave({ allocation: v });
                }}
                className="font-mono font-bold text-[16px] tabular-nums rounded px-3 py-1.5 w-24"
                style={{ background: "#050d18", color: "#EAF2FF", border: "1px solid #1a2a36" }}
              />
              <span className="text-[10px] font-mono" style={{ color: "#4a6070" }}>% ≈ $10 test size</span>
            </div>
            <div className="text-[8px] font-mono" style={{ color: "#4a6070" }}>
              Stop loss: {settings?.stopLossPercent ?? 2}%  ·  Take profit: {settings?.takeProfitPercent ?? 4}%
            </div>
          </div>

          {/* AI Signal Activity — replaces duplicate exchange selector */}
          <AISignalMini engine={engine} />
        </div>
      </div>
    </div>
  );
}

// ── StatusChip helper (inline to avoid extra file) ────────────────────────────

function StatusChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-1 rounded"
      style={{ background: `${color}0c`, border: `1px solid ${color}28` }}>
      <span className="text-[8px] font-mono font-bold uppercase tracking-[0.12em]" style={{ color: `${color}90` }}>
        {label}
      </span>
      <span className="text-[10px] font-bold font-mono" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
