import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from "react";
import { TrendingUp, TrendingDown, Zap, CheckCircle2, X, Volume2, VolumeX } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  type: "buy" | "sell" | "mtf" | "trade";
  symbol: string;
  title: string;
  body: string;
  confidence?: number;
  timestamp: number;
}

interface AlertsCtx {
  alerts: Alert[];
  soundEnabled: boolean;
  toggleSound: () => void;
  dismiss: (id: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<AlertsCtx>({
  alerts: [], soundEnabled: false,
  toggleSound: () => {}, dismiss: () => {},
});

export function useAlerts() { return useContext(Ctx); }

// ── Sound helper ──────────────────────────────────────────────────────────────

function playBeep(type: "buy" | "sell" | "trade") {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    gain.connect(ctx.destination);

    const freqs = type === "buy"   ? [440, 550] :
                  type === "sell"  ? [550, 390] :
                                    [520, 520];

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.18);
    });

    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

// ── Toast card ────────────────────────────────────────────────────────────────

const SYMBOL_COLOR: Record<string, string> = {
  BTCUSD: "#F7931A", ETHUSD: "#627EEA", SOLUSD: "#9945FF",
  XRPUSD: "#00AAE4", ADAUSD: "#0033AD",
};

function AlertToast({ alert, onDismiss }: { alert: Alert; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  const dismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 250);
  };

  useEffect(() => {
    const t = setTimeout(dismiss, 8000);
    return () => clearTimeout(t);
  }, []);

  const color = SYMBOL_COLOR[alert.symbol] ?? "#6366f1";
  const Icon  = alert.type === "buy"   ? TrendingUp  :
                alert.type === "sell"  ? TrendingDown :
                alert.type === "trade" ? Zap          :
                CheckCircle2;

  const iconColor = alert.type === "buy"   ? "text-emerald-400" :
                    alert.type === "sell"  ? "text-red-400"     :
                    alert.type === "trade" ? "text-amber-400"   :
                    "text-sky-400";

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 w-full max-w-[320px] bg-card border border-border/60
        rounded-xl shadow-2xl p-3.5 transition-all duration-250
        ${exiting ? "opacity-0 translate-x-4 scale-95" : "opacity-100 translate-x-0 scale-100"}`}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className={`shrink-0 mt-0.5 ${iconColor}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold leading-tight mb-0.5">{alert.title}</div>
        <div className="text-[11px] text-muted-foreground/70 leading-snug">{alert.body}</div>
        {alert.confidence != null && (
          <div className="text-[10px] text-muted-foreground/50 mt-1">
            Confidence: <span className="font-mono font-bold">{alert.confidence.toFixed(1)}%</span>
          </div>
        )}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Trade execution flash banner ───────────────────────────────────────────────
// Fires only on real trade execution (type === "trade"). Full-viewport, center-
// screen, impossible to miss. Auto-dismisses after 3.5 s.

interface TradeFlash {
  id: string;
  symbol: string;
  body: string;
}

function TradeFlashBanner({ flash, onDone }: { flash: TradeFlash; onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 120);
    const t2 = setTimeout(() => setPhase("out"),  3000);
    const t3 = setTimeout(() => onDone(),         3500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const sym   = flash.symbol ? flash.symbol.replace("USD", "") : "";
  const color = SYMBOL_COLOR[flash.symbol] ?? "#f59e0b";

  return (
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none
        transition-all duration-300
        ${phase === "out" ? "opacity-0 scale-105" : phase === "in" ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* card */}
      <div
        className="relative flex flex-col items-center gap-3 px-10 py-8 rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] border-2"
        style={{
          background: `radial-gradient(ellipse at center, ${color}18 0%, #0a0a0f 70%)`,
          borderColor: color,
          boxShadow: `0 0 60px ${color}50, 0 0 120px ${color}20`,
        }}
      >
        {/* pulsing ring */}
        <div
          className="absolute inset-0 rounded-2xl animate-ping opacity-20 pointer-events-none"
          style={{ border: `2px solid ${color}` }}
        />

        <div className="flex items-center gap-3">
          <Zap className="w-8 h-8" style={{ color }} />
          <span className="text-3xl sm:text-4xl font-black tracking-widest uppercase" style={{ color }}>
            TRADE EXECUTED
          </span>
          <Zap className="w-8 h-8" style={{ color }} />
        </div>

        {sym && (
          <div className="flex items-center gap-2">
            <div
              className="px-3 py-1 rounded-lg text-lg font-black tracking-wide"
              style={{ backgroundColor: color + "25", color }}
            >
              {sym}
            </div>
          </div>
        )}

        <div className="text-sm text-white/70 font-mono text-center leading-relaxed">
          {flash.body}
        </div>
      </div>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_SOUND = "apex_sound_v1";
const STORAGE_SEEN  = "apex_seen_signals_v1";
const MAX_VISIBLE   = 4;
const MAX_SEEN_SIZE = 200;

interface EngineStatus {
  recentSignalLog: Array<{
    id: string; symbol: string; decision: string;
    confidence: number; shortSummary: string; blockReason: string | null;
    executedAs: "auto" | "test" | null; timestamp: number;
  }>;
  tradesExecuted: number;
  mtfConfirmedCount: number;
}

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [alerts,       setAlerts]       = useState<Alert[]>([]);
  const [tradeFlash,   setTradeFlash]   = useState<TradeFlash | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_SOUND) !== "false"; } catch { return false; }
  });

  const seenIds        = useRef<Set<string>>(new Set());
  const prevTradeCount = useRef<number | null>(null);

  // Restore seen IDs from storage (to survive hot-reload)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SEEN);
      if (raw) { JSON.parse(raw).forEach((id: string) => seenIds.current.add(id)); }
    } catch {}
  }, []);

  const persistSeen = () => {
    try {
      const arr = Array.from(seenIds.current).slice(-MAX_SEEN_SIZE);
      localStorage.setItem(STORAGE_SEEN, JSON.stringify(arr));
    } catch {}
  };

  const push = useCallback((alert: Alert) => {
    if (seenIds.current.has(alert.id)) return;
    seenIds.current.add(alert.id);
    persistSeen();

    if (soundEnabled && (alert.type === "buy" || alert.type === "sell" || alert.type === "trade")) {
      playBeep(alert.type);
    }

    // For trade execution: show the high-visibility flash banner
    if (alert.type === "trade") {
      setTradeFlash({
        id:     alert.id,
        symbol: alert.symbol,
        body:   alert.body,
      });
    }

    setAlerts((prev) => {
      const next = [alert, ...prev].slice(0, MAX_VISIBLE);
      return next;
    });
  }, [soundEnabled]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_SOUND, String(next)); } catch {}
      return next;
    });
  }, []);

  // Poll engine status for new signals / trades
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/engine/status");
        if (!res.ok) return;
        const data: EngineStatus = await res.json();

        // Check recentSignalLog for new BUY/SELL signals (signal alerts only — NOT for executed trades)
        for (const entry of (data.recentSignalLog ?? [])) {
          if (entry.decision === "HOLD") continue;
          if (seenIds.current.has(entry.id)) continue;

          // Signal alert — shows for every non-HOLD signal (with or without execution)
          const isBuy  = entry.decision === "BUY";
          const symLbl = entry.symbol.replace("USD", "");
          push({
            id:         entry.id,
            type:       isBuy ? "buy" : "sell",
            symbol:     entry.symbol,
            title:      `${isBuy ? "BUY" : "SELL"} Signal — ${symLbl}`,
            body:       entry.shortSummary || `${entry.decision} signal detected`,
            confidence: entry.confidence,
            timestamp:  entry.timestamp,
          });

          // Execution alert — only fires when the signal was actually executed as a trade
          if (entry.executedAs) {
            const tradeAlertId = `trade-${entry.id}`;
            push({
              id:         tradeAlertId,
              type:       "trade",
              symbol:     entry.symbol,
              title:      `Trade Executed — ${symLbl} ${entry.decision}`,
              body:       `${entry.executedAs === "test" ? "Test" : "Auto"} trade placed · conf ${entry.confidence.toFixed(0)}%`,
              confidence: entry.confidence,
              timestamp:  entry.timestamp,
            });
          }
        }

        // Fallback: watch raw tradesExecuted counter for increment
        // (catches trades placed via force-test or manual orders that may not appear in recentSignalLog)
        const tc = data.tradesExecuted ?? 0;
        if (prevTradeCount.current !== null && tc > prevTradeCount.current) {
          const tradeId = `trade-count-${tc}`;
          push({
            id:        tradeId,
            type:      "trade",
            symbol:    "",
            title:     "Trade Executed",
            body:      `${tc} total trades executed this session`,
            timestamp: Date.now(),
          });
        }
        prevTradeCount.current = tc;
      } catch {}
    };

    poll(); // immediate
    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [push]);

  return (
    <Ctx.Provider value={{ alerts, soundEnabled, toggleSound, dismiss }}>
      {children}

      {/* High-visibility trade execution flash — center screen, impossible to miss */}
      {tradeFlash && (
        <TradeFlashBanner
          key={tradeFlash.id}
          flash={tradeFlash}
          onDone={() => setTradeFlash(null)}
        />
      )}

      {/* Toast stack — fixed top-right */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none w-[320px] max-w-[calc(100vw-2rem)]">
        {/* Sound toggle button */}
        <div className="pointer-events-auto flex justify-end mb-1">
          {alerts.length > 0 && (
            <button
              onClick={toggleSound}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-card border border-border/40 text-muted-foreground hover:text-foreground transition-colors shadow-lg"
            >
              {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
              {soundEnabled ? "Sound ON" : "Sound OFF"}
            </button>
          )}
        </div>
        {alerts.map((a) => (
          <AlertToast key={a.id} alert={a} onDismiss={() => dismiss(a.id)} />
        ))}
      </div>

      {/* Persistent sound toggle — always visible in corner when no alerts */}
      {alerts.length === 0 && (
        <div className="fixed bottom-20 right-4 z-[9998]">
          <button
            onClick={toggleSound}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-card/80 backdrop-blur border border-border/30 text-muted-foreground/60 hover:text-muted-foreground transition-colors shadow"
            title={soundEnabled ? "Sound alerts ON — click to mute" : "Sound alerts OFF — click to enable"}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}
