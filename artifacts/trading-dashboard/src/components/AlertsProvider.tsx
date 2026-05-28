import { authFetch } from "@/lib/authFetch";
import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  wsConnected: boolean;
  toggleSound: () => void;
  dismiss: (id: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<AlertsCtx>({
  alerts: [], soundEnabled: false, wsConnected: false,
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative flex flex-col items-center gap-3 px-10 py-8 rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] border-2"
        style={{
          background: `radial-gradient(ellipse at center, ${color}18 0%, #0a0a0f 70%)`,
          borderColor: color,
          boxShadow: `0 0 60px ${color}50, 0 0 120px ${color}20`,
        }}
      >
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
            <div className="px-3 py-1 rounded-lg text-lg font-black tracking-wide" style={{ backgroundColor: color + "25", color }}>
              {sym}
            </div>
          </div>
        )}
        <div className="text-sm text-white/70 font-mono text-center leading-relaxed">{flash.body}</div>
      </div>
    </div>
  );
}

// ── WS connection indicator ───────────────────────────────────────────────────

function WsIndicator({ connected }: { connected: boolean }) {
  return (
    <div
      title={connected ? "Live WebSocket connected" : "Polling (WebSocket disconnected)"}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono"
      style={{
        color:      connected ? "#00ff88" : "#647385",
        background: connected ? "rgba(0,255,136,0.06)" : "rgba(255,255,255,0.03)",
        border:     `1px solid ${connected ? "rgba(0,255,136,0.15)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <span
        style={{
          width: 5, height: 5, borderRadius: "50%",
          background: connected ? "#00ff88" : "#647385",
          animation: connected ? "pulse 2s ease-in-out infinite" : "none",
          display: "inline-block",
        }}
      />
      {connected ? "LIVE" : "POLL"}
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_SOUND = "ac_sound_v1";
const STORAGE_SEEN  = "ac_seen_signals_v1";
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

// ── Hydration query keys invalidated on every execution/account event ────────
// Keep this list in sync with the keys consumers actually use; over-invalidation
// is acceptable (a few extra refetches), under-invalidation leaves panels stale.
const HYDRATION_QUERY_KEYS: readonly string[] = [
  "mobile-portfolio",
  "sim-account",
  "sim-trades",
  "execution-state",
  "runtime-state",
  "user-ai-liquidity",
];

// Server-broadcast WS event types that must trigger client-side hydration.
const HYDRATION_EVENTS: ReadonlySet<string> = new Set([
  "trade_executed",
  "position_opened",
  "position_closed",
  "account_updated",
  "live_trades_hydrated",
  "ai_fanout_executed",
]);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn, userId } = useAuth();
  const qc = useQueryClient();

  // Hide all operator/debug chrome (LIVE/POLL websocket pip, sound toggle,
  // alert toasts) on the customer portal — those are operator surfaces and
  // must never appear in the production customer experience.
  const [pathname] = useLocation();
  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");

  const [alerts,       setAlerts]       = useState<Alert[]>([]);
  const [tradeFlash,   setTradeFlash]   = useState<TradeFlash | null>(null);
  const [wsConnected,  setWsConnected]  = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_SOUND) !== "false"; } catch { return false; }
  });

  const seenIds        = useRef<Set<string>>(new Set());
  const prevTradeCount = useRef<number | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);

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

    if (alert.type === "trade") {
      setTradeFlash({ id: alert.id, symbol: alert.symbol, body: alert.body });
    }

    setAlerts((prev) => [alert, ...prev].slice(0, MAX_VISIBLE));
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

  // ── WebSocket connection ───────────────────────────────────────────────────

  const connectWs = useCallback(async () => {
    if (!isSignedIn) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    let token: string | null = null;
    try {
      token = await getToken();
    } catch {
      return;
    }
    if (!token) return;

    // VITE_WS_URL lets production deployments point directly at the API server's
    // WebSocket endpoint (e.g. wss://api.aicandlez.com/ws) rather than relying
    // on the reverse proxy to forward /ws from the frontend's own hostname.
    const wsBase  = (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, "");
    const wsUrl   = wsBase
      ? `${wsBase}?token=${encodeURIComponent(token)}`
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      reconnectDelay.current = 1000; // reset backoff
      ws.send(JSON.stringify({ type: "subscribe", symbols: ["BTCUSD", "ETHUSD", "SOLUSD"] }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          symbol?: string;
          action?: string;
          confidence?: number;
          reason?: string;
          side?: string;
          price?: number;
          sizeUSD?: number;
          id?: string;
          title?: string;
          message?: string;
          timestamp?: number;
          runtimeMode?: "paper" | "live" | string;
        };

        // ── Hydration invalidation ─────────────────────────────────────────────
        // Any execution/account/fanout event from the server must invalidate
        // the client query cache so the dashboard panels (OPEN count, Live
        // Trades, Trade History, Realized/Unrealized, Equity) refetch without
        // waiting for their poll interval.
        const HYDRATION_EVENTS = new Set([
          "trade_executed",
          "position_opened",
          "position_closed",
          "account_updated",
          "live_trades_hydrated",
          "ai_fanout_executed",
        ]);
        if (HYDRATION_EVENTS.has(msg.type)) {
          const ts = msg.timestamp ?? Date.now();
          // eslint-disable-next-line no-console
          console.info("[CLIENT_HYDRATION_INVALIDATE]", {
            eventType: msg.type,
            queryKeys: HYDRATION_QUERY_KEYS,
            userId: userId ?? null,
            runtimeMode: msg.runtimeMode ?? null,
            timestamp: ts,
          });
          Promise.all(
            HYDRATION_QUERY_KEYS.map((key) =>
              qc.invalidateQueries({ queryKey: [key], refetchType: "active" }),
            ),
          )
            .then(() => {
              // eslint-disable-next-line no-console
              console.info("[CLIENT_HYDRATION_REFETCHED]", {
                eventType: msg.type,
                queryKeys: HYDRATION_QUERY_KEYS,
                userId: userId ?? null,
                runtimeMode: msg.runtimeMode ?? null,
                timestamp: Date.now(),
              });
            })
            .catch((err: unknown) => {
              // eslint-disable-next-line no-console
              console.warn("[CLIENT_HYDRATION_FAILED]", {
                eventType: msg.type,
                queryKeys: HYDRATION_QUERY_KEYS,
                userId: userId ?? null,
                runtimeMode: msg.runtimeMode ?? null,
                timestamp: Date.now(),
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }

        if (msg.type === "signal" && msg.symbol && msg.action && msg.action !== "HOLD") {
          const id    = msg.id ?? `ws-sig-${msg.symbol}-${msg.timestamp ?? Date.now()}`;
          const isBuy = msg.action === "BUY";
          const sym   = msg.symbol.replace("USD", "");
          push({
            id,
            type:       isBuy ? "buy" : "sell",
            symbol:     msg.symbol,
            title:      `${isBuy ? "BUY" : "SELL"} Signal — ${sym}`,
            body:       msg.reason ?? `${msg.action} signal detected`,
            confidence: msg.confidence,
            timestamp:  msg.timestamp ?? Date.now(),
          });
        }

        if (msg.type === "trade_executed" && msg.symbol) {
          const id  = msg.id ?? `ws-trade-${msg.symbol}-${msg.timestamp ?? Date.now()}`;
          const sym = msg.symbol.replace("USD", "");
          push({
            id,
            type:      "trade",
            symbol:    msg.symbol,
            title:     `Trade Executed — ${sym} ${msg.side ?? ""}`,
            body:      `$${(msg.sizeUSD ?? 0).toFixed(0)} @ $${(msg.price ?? 0).toFixed(2)}`,
            timestamp: msg.timestamp ?? Date.now(),
          });
        }

        if (msg.type === "notification" && msg.title) {
          const id  = msg.id ?? `ws-notif-${msg.timestamp ?? Date.now()}`;
          push({
            id,
            type:      "mtf",
            symbol:    "",
            title:     msg.title,
            body:      msg.message ?? "",
            timestamp: msg.timestamp ?? Date.now(),
          });
        }
      } catch {}
    };

    ws.onclose = (event) => {
      setWsConnected(false);
      wsRef.current = null;
      if (event.code === 4001 || event.code === 4003) return; // auth failure — don't retry

      // Exponential backoff reconnect
      const delay = Math.min(reconnectDelay.current, 30_000);
      reconnectDelay.current = Math.min(delay * 2, 30_000);
      reconnectTimer.current = setTimeout(() => {
        void connectWs();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [isSignedIn, getToken, push]);

  // Connect on mount / sign-in
  useEffect(() => {
    if (isSignedIn) {
      void connectWs();
    }
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isSignedIn, connectWs]);

  // ── Polling fallback ───────────────────────────────────────────────────────
  // Runs at 30s (reduced from 8s) as reliability net for signals the WS may miss.
  // If WS is connected we only poll every 30s; if disconnected, poll every 8s
  // to maintain responsiveness.

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await authFetch("/api/engine/status");
        if (!res.ok) return;
        const data: EngineStatus = await res.json();

        for (const entry of (data.recentSignalLog ?? [])) {
          if (entry.decision === "HOLD") continue;
          if (seenIds.current.has(entry.id)) continue;

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

          if (entry.executedAs) {
            const tradeAlertId = `trade-${entry.id}`;
            push({
              id:         tradeAlertId,
              type:       "trade",
              symbol:     entry.symbol,
              title:      `Trade Executed — ${symLbl} ${entry.decision}`,
              body:       `${entry.executedAs === "test" ? "Test" : "Auto"} trade placed · conf ${(Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : 0).toFixed(0)}%`,
              confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : undefined,
              timestamp:  entry.timestamp,
            });
          }
        }

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

    poll();
    const interval = setInterval(poll, wsConnected ? 30_000 : 8_000);
    return () => clearInterval(interval);
  }, [push, wsConnected]);

  return (
    <Ctx.Provider value={{ alerts, soundEnabled, wsConnected, toggleSound, dismiss }}>
      {children}

      {tradeFlash && (
        <TradeFlashBanner
          key={tradeFlash.id}
          flash={tradeFlash}
          onDone={() => setTradeFlash(null)}
        />
      )}

      {/* Operator chrome — toasts, WS pip, sound toggle. Hidden on /portal. */}
      {!isPortal && (
        <>
          {/* Toast stack — fixed BOTTOM-LEFT so it never overlaps the
           *  Terminal right rail (MY ACCOUNT + AI AUTOTRADE), which is
           *  the operator's primary execution surface. Top-right was
           *  burying live AI controls under SELL signal toasts. */}
          <div className="fixed bottom-4 left-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none w-[320px] max-w-[calc(100vw-2rem)]">
            <div className="pointer-events-auto flex justify-start items-center gap-2 mt-1">
              <WsIndicator connected={wsConnected} />
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

          {/* Persistent sound toggle — bottom-LEFT corner when no alerts,
           *  mirroring the toast stack's new home so it stays clear of
           *  the right-rail account controls. */}
          {alerts.length === 0 && (
            <div className="fixed bottom-4 left-4 z-[9998] flex flex-col gap-2 items-start">
              <WsIndicator connected={wsConnected} />
              <button
                onClick={toggleSound}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-card/80 backdrop-blur border border-border/30 text-muted-foreground/60 hover:text-muted-foreground transition-colors shadow"
                title={soundEnabled ? "Sound alerts ON — click to mute" : "Sound alerts OFF — click to enable"}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </>
      )}
    </Ctx.Provider>
  );
}
