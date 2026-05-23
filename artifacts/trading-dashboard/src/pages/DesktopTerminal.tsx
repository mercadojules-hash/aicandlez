/**
 * Module 20 — Desktop Terminal
 * Institutional power-user interface: multi-panel widget grid, live WS data,
 * ticker bar, signal feed, position monitor, AI brief, risk status.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { authFetch } from "../lib/authFetch";
import {
  Activity, AlertTriangle, Bell, BellOff, ChevronDown, ChevronUp,
  Cpu, Maximize2, Minimize2, Radio, RefreshCw, Shield,
  Terminal, TrendingDown, TrendingUp, Zap, X,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "#000508";
const CARD   = "#040d14";
const BORD   = "#0a1e2e";
const C      = "#00e5ff";
const G      = "#00ff88";
const R      = "#ff3355";
const AM     = "#ffd200";
const P      = "#9b5cf5";
const W      = "#f0f4f8";
const GR     = "#8892a4";
const DIM    = "#3a5a6a";
const MONO   = "'JetBrains Mono','SF Mono','Roboto Mono',Consolas,monospace";

// ── Base URL ──────────────────────────────────────────────────────────────────
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface TickerEntry { symbol: string; price: number; change: number; }
interface SignalEntry  { id: string; symbol: string; direction: "BUY" | "SELL" | "HOLD"; confidence: number; ts: number; timeframe: string; }
interface Position     { id: string; symbol: string; side: string; qty: number; entryPrice: number; currentPrice: number; unrealizedPnl: number; }
interface AIDecision   { signal: string; confidence: number; reasoning: string; timeframe: string; symbol: string; }
interface RiskStatus   { dailyPnl: number; dailyLoss: number; maxDailyLoss: number; activePositions: number; maxPositions: number; killSwitchActive: boolean; mode: string; }

// ── WebSocket hook ────────────────────────────────────────────────────────────
function useTerminalWS(token: string | null, onSignal: (s: SignalEntry) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    // VITE_WS_URL lets production deployments target the API server directly.
    const wsBase   = (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, "");
    const url      = wsBase
      ? `${wsBase}?token=${token}`
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${BASE}/ws?token=${token}`;
    const ws       = new WebSocket(url);
    wsRef.current  = ws;

    ws.onopen    = () => setConnected(true);
    ws.onclose   = () => setConnected(false);
    ws.onerror   = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string } & Record<string, unknown>;
        if (msg.type === "signal" || msg.type === "signal_update") {
          onSignal({
            id:         String(msg.id ?? Date.now()),
            symbol:     String(msg.symbol ?? "BTC"),
            direction:  (msg.signal ?? msg.direction ?? "HOLD") as SignalEntry["direction"],
            confidence: Number(msg.confidence ?? 0),
            ts:         Number(msg.timestamp ?? Date.now()),
            timeframe:  String(msg.timeframe ?? "5m"),
          });
        }
      } catch { /* ignore */ }
    };

    return () => { ws.close(); };
  }, [token]);

  return connected;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function fmtPrice(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPnl(n: number) {
  const s = n >= 0 ? "+" : "";
  return `${s}$${Math.abs(n).toFixed(2)}`;
}
function dirColor(d: string) {
  return d === "BUY" ? G : d === "SELL" ? R : GR;
}
function useInterval(fn: () => void, ms: number) {
  const cb = useRef(fn);
  useEffect(() => { cb.current = fn; }, [fn]);
  useEffect(() => { const t = setInterval(() => cb.current(), ms); return () => clearInterval(t); }, [ms]);
}

// ── Widget shell ──────────────────────────────────────────────────────────────
function Widget({
  title, icon: Icon, accent = C, children, maximized, onToggle,
}: {
  title: string; icon: React.ElementType; accent?: string;
  children: React.ReactNode; maximized?: boolean; onToggle?: () => void;
}) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORD}`,
      display: "flex", flexDirection: "column", borderRadius: 4, overflow: "hidden",
      boxShadow: `0 0 0 0.5px ${accent}10 inset`,
      transition: "box-shadow 0.2s",
    }}>
      {/* Widget header */}
      <div style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 10px",
        borderBottom: `1px solid ${BORD}`, flexShrink: 0,
        background: `linear-gradient(90deg, ${accent}08, transparent)`,
      }}>
        <Icon style={{ width: 11, height: 11, color: accent, flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: accent, letterSpacing: "0.12em", flex: 1 }}>
          {title}
        </span>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: G, boxShadow: `0 0 6px ${G}`, flexShrink: 0 }} />
        {onToggle && (
          <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            {maximized
              ? <Minimize2 style={{ width: 9, height: 9, color: DIM }} />
              : <Maximize2 style={{ width: 9, height: 9, color: DIM }} />}
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// ── Ticker row ────────────────────────────────────────────────────────────────
function TickerRow({ tickers, wsConnected }: { tickers: TickerEntry[]; wsConnected: boolean }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  return (
    <div style={{
      height: 42, background: "#010a10", borderBottom: `1px solid ${BORD}`,
      display: "flex", alignItems: "center", gap: 0, flexShrink: 0, padding: "0 12px",
      overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 20, flexShrink: 0 }}>
        <Terminal style={{ width: 14, height: 14, color: C }} />
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C, letterSpacing: "0.15em" }}>TERMINAL</span>
        <span style={{ fontFamily: MONO, fontSize: 7, color: DIM, letterSpacing: "0.1em" }}>v2.0</span>
      </div>

      {/* Ticker bar */}
      <div style={{ display: "flex", gap: 24, flex: 1, overflowX: "auto" }}>
        {tickers.map(t => (
          <div key={t.symbol} style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: GR, fontWeight: 600 }}>{t.symbol}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: W, fontWeight: 700 }}>{fmtPrice(t.price)}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: t.change >= 0 ? G : R, fontWeight: 600 }}>
              {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>

      {/* Connection + Clock */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: wsConnected ? G : R,
            boxShadow: wsConnected ? `0 0 8px ${G}` : "none", flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 8, color: wsConnected ? G : R }}>
            {wsConnected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 9, color: GR }}>
          {time.toLocaleTimeString("en-US", { hour12: false })} UTC
        </span>
      </div>
    </div>
  );
}

// ── Signal Feed widget ────────────────────────────────────────────────────────
function SignalFeedWidget({ signals }: { signals: SignalEntry[] }) {
  return (
    <div style={{ padding: "6px 0" }}>
      {signals.length === 0 && (
        <div style={{ textAlign: "center", padding: 24, fontFamily: MONO, fontSize: 9, color: DIM }}>
          Awaiting signals…
        </div>
      )}
      {signals.map(s => (
        <div key={s.id} style={{
          padding: "7px 10px", borderBottom: `1px solid ${BORD}`,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <span style={{
            fontFamily: MONO, fontSize: 8, fontWeight: 700, color: dirColor(s.direction),
            border: `1px solid ${dirColor(s.direction)}40`, padding: "1px 5px", borderRadius: 2, flexShrink: 0,
          }}>{s.direction}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: W }}>{s.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 8, color: GR }}>{s.timeframe}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 8, color: GR }}>Confidence</span>
              <div style={{ flex: 1, height: 2, background: "#0a1e2e", borderRadius: 1, overflow: "hidden" }}>
                <div style={{ width: `${s.confidence}%`, height: "100%", background: dirColor(s.direction), transition: "width 0.3s" }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 8, color: dirColor(s.direction), fontWeight: 700 }}>{s.confidence}%</span>
            </div>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 7, color: DIM, flexShrink: 0 }}>
            {new Date(s.ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Position Monitor widget ───────────────────────────────────────────────────
function PositionWidget({ positions, loading }: { positions: Position[]; loading: boolean }) {
  if (loading) {
    return <div style={{ textAlign: "center", padding: 20, fontFamily: MONO, fontSize: 9, color: DIM }}>Loading…</div>;
  }
  if (positions.length === 0) {
    return <div style={{ textAlign: "center", padding: 20, fontFamily: MONO, fontSize: 9, color: DIM }}>No open positions</div>;
  }
  return (
    <div>
      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 60px 70px 70px 70px",
        gap: 4, padding: "4px 10px", borderBottom: `1px solid ${BORD}`,
      }}>
        {["SYMBOL", "SIDE", "QTY", "ENTRY", "PNL"].map(h => (
          <span key={h} style={{ fontFamily: MONO, fontSize: 7, color: DIM, fontWeight: 700, letterSpacing: "0.1em" }}>{h}</span>
        ))}
      </div>
      {positions.map(p => (
        <div key={p.id} style={{
          display: "grid", gridTemplateColumns: "1fr 60px 70px 70px 70px",
          gap: 4, padding: "6px 10px", borderBottom: `1px solid ${BORD}20`,
          alignItems: "center",
        }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: W }}>{p.symbol}</span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: p.side === "long" ? G : R, fontWeight: 700 }}>
            {p.side.toUpperCase()}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: GR }}>{p.qty.toFixed(4)}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: GR }}>${fmtPrice(p.entryPrice)}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: p.unrealizedPnl >= 0 ? G : R }}>
            {fmtPnl(p.unrealizedPnl)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── AI Brief widget ───────────────────────────────────────────────────────────
function AIBriefWidget({ decision, loading }: { decision: AIDecision | null; loading: boolean }) {
  if (loading) return <div style={{ textAlign: "center", padding: 20, fontFamily: MONO, fontSize: 9, color: DIM }}>Analyzing…</div>;
  if (!decision) return <div style={{ textAlign: "center", padding: 20, fontFamily: MONO, fontSize: 9, color: DIM }}>No data</div>;
  const sigColor = dirColor(decision.signal);
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 3,
          background: `${sigColor}12`, border: `1px solid ${sigColor}30`,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: sigColor }}>{decision.signal}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 8, color: GR }}>Confidence</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <div style={{ flex: 1, height: 3, background: BORD, borderRadius: 1.5 }}>
              <div style={{ width: `${decision.confidence}%`, height: "100%", background: sigColor, borderRadius: 1.5, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: sigColor }}>{decision.confidence}%</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: W }}>{decision.symbol}</div>
          <div style={{ fontFamily: MONO, fontSize: 7, color: DIM }}>{decision.timeframe}</div>
        </div>
      </div>
      <div style={{
        background: "#010a10", borderRadius: 3, padding: "8px 10px",
        border: `1px solid ${BORD}`, fontFamily: MONO, fontSize: 8.5,
        color: GR, lineHeight: 1.7,
      }}>
        {decision.reasoning}
      </div>
    </div>
  );
}

// ── Risk Monitor widget ───────────────────────────────────────────────────────
function RiskWidget({ risk, loading }: { risk: RiskStatus | null; loading: boolean }) {
  if (loading) return <div style={{ textAlign: "center", padding: 20, fontFamily: MONO, fontSize: 9, color: DIM }}>Loading…</div>;
  if (!risk) return <div style={{ textAlign: "center", padding: 20, fontFamily: MONO, fontSize: 9, color: DIM }}>No data</div>;

  const pnlPct = Math.min(Math.abs(risk.dailyPnl / (risk.maxDailyLoss || 1)) * 100, 100);
  const pnlColor = risk.dailyPnl >= 0 ? G : R;

  const rows = [
    { label: "MODE",        value: risk.mode.toUpperCase(),     color: risk.mode === "live" ? AM : C       },
    { label: "KILL SWITCH", value: risk.killSwitchActive ? "ACTIVE" : "STANDBY",
      color: risk.killSwitchActive ? R : G                                                                  },
    { label: "POSITIONS",   value: `${risk.activePositions}/${risk.maxPositions}`, color: W                },
    { label: "DAILY PNL",   value: fmtPnl(risk.dailyPnl),       color: pnlColor                           },
  ];

  return (
    <div style={{ padding: "8px 10px" }}>
      {rows.map(row => (
        <div key={row.label} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 0", borderBottom: `1px solid ${BORD}20`,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 8, color: DIM, letterSpacing: "0.08em" }}>{row.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: row.color }}>{row.value}</span>
        </div>
      ))}
      {/* Daily loss utilization bar */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 7, color: DIM }}>DAILY LOSS LIMIT</span>
          <span style={{ fontFamily: MONO, fontSize: 7, color: R }}>{pnlPct.toFixed(0)}% used</span>
        </div>
        <div style={{ height: 4, background: BORD, borderRadius: 2 }}>
          <div style={{
            width: `${pnlPct}%`, height: "100%", borderRadius: 2,
            background: pnlPct > 80 ? R : pnlPct > 50 ? AM : G,
            transition: "width 0.3s",
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Mini log feed ─────────────────────────────────────────────────────────────
function EventLog({ events }: { events: Array<{ ts: number; type: string; msg: string }> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [events]);
  return (
    <div ref={ref} style={{ padding: "4px 10px", height: "100%", overflowY: "auto" }}>
      {events.length === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 8, color: DIM, marginTop: 8 }}>No events yet…</div>
      )}
      {events.slice(-60).map((ev, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
          <span style={{ fontFamily: MONO, fontSize: 7.5, color: DIM, flexShrink: 0 }}>
            {new Date(ev.ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 7.5, fontWeight: 700, flexShrink: 0,
            color: ev.type === "BUY" ? G : ev.type === "SELL" ? R : ev.type === "RISK" ? AM : C,
          }}>[{ev.type}]</span>
          <span style={{ fontFamily: MONO, fontSize: 7.5, color: GR }}>{ev.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DesktopTerminal() {
  const { getToken } = useAuth();
  const [token, setToken]         = useState<string | null>(null);
  const [signals, setSignals]     = useState<SignalEntry[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [ai, setAI]               = useState<AIDecision | null>(null);
  const [risk, setRisk]           = useState<RiskStatus | null>(null);
  const [tickers, setTickers]     = useState<TickerEntry[]>([
    { symbol: "BTC/USD", price: 0, change: 0 },
    { symbol: "ETH/USD", price: 0, change: 0 },
    { symbol: "SOL/USD", price: 0, change: 0 },
  ]);
  const [events, setEvents]       = useState<Array<{ ts: number; type: string; msg: string }>>([]);
  const [posLoading, setPosLoading] = useState(true);
  const [aiLoading,  setAiLoading]  = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [maxWidget, setMaxWidget]   = useState<string | null>(null);

  // Push signal to feed + event log
  const onSignal = useCallback((s: SignalEntry) => {
    setSignals(prev => [s, ...prev].slice(0, 40));
    setEvents(prev => [{
      ts: s.ts, type: s.direction,
      msg: `${s.symbol} — ${s.confidence}% confidence (${s.timeframe})`,
    }, ...prev].slice(0, 200));
  }, []);

  // Get token
  useEffect(() => {
    getToken().then(t => setToken(t)).catch(() => {});
  }, [getToken]);

  const wsConnected = useTerminalWS(token, onSignal);

  // Add WS connect event to log
  useEffect(() => {
    setEvents(prev => [{
      ts: Date.now(), type: "SYS",
      msg: wsConnected ? "WebSocket connected" : "WebSocket disconnected",
    }, ...prev]);
  }, [wsConnected]);

  // Fetch helpers
  const fetchWithAuth = useCallback(async (path: string) => {
    if (!token) return null;
    const r = await authFetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    return r.ok ? r.json() : null;
  }, [token]);

  // Fetch all data
  const loadAll = useCallback(async () => {
    if (!token) return;

    // Positions
    const posData = await fetchWithAuth("/api/simulation/positions");
    if (posData) { setPositions(Array.isArray(posData) ? posData : posData.positions ?? []); }
    setPosLoading(false);

    // AI decision
    const aiData = await fetchWithAuth("/api/aiDecision");
    if (aiData) setAI(aiData as AIDecision);
    setAiLoading(false);

    // Risk / engine status
    const engineData = await fetchWithAuth("/api/engine/status");
    if (engineData) {
      setRisk({
        dailyPnl:        engineData.dailyPnl        ?? 0,
        dailyLoss:       engineData.dailyLoss        ?? 0,
        maxDailyLoss:    engineData.maxDailyLoss     ?? 500,
        activePositions: engineData.activePositions  ?? 0,
        maxPositions:    engineData.maxPositions     ?? 5,
        killSwitchActive:engineData.killSwitchActive ?? false,
        mode:            engineData.mode             ?? "paper",
      });
    }
    setRiskLoading(false);

    // Tickers via candles
    const symbols = [
      { symbol: "BTC/USD", api: "XBTUSD" },
      { symbol: "ETH/USD", api: "ETHUSD" },
      { symbol: "SOL/USD", api: "SOLUSD" },
    ];
    const priceArr = await Promise.allSettled(
      symbols.map(async (s) => {
        const data = await fetchWithAuth(`/api/candles?symbol=${s.api}&timeframe=1m&limit=2`);
        if (!Array.isArray(data) || data.length < 2) return null;
        const cur  = data[data.length - 1] as { close: number };
        const prev = data[data.length - 2] as { close: number };
        return { symbol: s.symbol, price: cur.close, change: ((cur.close - prev.close) / prev.close) * 100 };
      }),
    );
    setTickers(
      priceArr.map((r, i) =>
        r.status === "fulfilled" && r.value
          ? r.value
          : { symbol: symbols[i].symbol, price: 0, change: 0 },
      ),
    );

    // Recent signals
    const sigData = await fetchWithAuth("/api/signals?limit=20");
    if (Array.isArray(sigData)) {
      setSignals(sigData.map((s: Record<string, unknown>) => ({
        id:         String(s.id ?? Math.random()),
        symbol:     String(s.symbol ?? "BTC"),
        direction:  (s.signal ?? s.direction ?? "HOLD") as SignalEntry["direction"],
        confidence: Number(s.confidence ?? 0),
        ts:         Number(s.timestamp ?? Date.now()),
        timeframe:  String(s.timeframe ?? "5m"),
      })));
    }
  }, [token, fetchWithAuth]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useInterval(loadAll, 30_000);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const gridCols = maxWidget ? "1fr" : "230px 1fr 230px";
  const gridRows = maxWidget ? "1fr" : "1fr 180px";

  const widgets: Record<string, React.ReactNode> = {
    signals: (
      <Widget title="SIGNAL FEED" icon={Zap} accent={C} maximized={maxWidget === "signals"} onToggle={() => setMaxWidget(p => p === "signals" ? null : "signals")}>
        <SignalFeedWidget signals={signals} />
      </Widget>
    ),
    positions: (
      <Widget title="POSITIONS" icon={Activity} accent={G} maximized={maxWidget === "positions"} onToggle={() => setMaxWidget(p => p === "positions" ? null : "positions")}>
        <PositionWidget positions={positions} loading={posLoading} />
      </Widget>
    ),
    ai: (
      <Widget title="AI BRIEF" icon={Radio} accent={P} maximized={maxWidget === "ai"} onToggle={() => setMaxWidget(p => p === "ai" ? null : "ai")}>
        <AIBriefWidget decision={ai} loading={aiLoading} />
      </Widget>
    ),
    risk: (
      <Widget title="RISK MONITOR" icon={Shield} accent={AM} maximized={maxWidget === "risk"} onToggle={() => setMaxWidget(p => p === "risk" ? null : "risk")}>
        <RiskWidget risk={risk} loading={riskLoading} />
      </Widget>
    ),
    log: (
      <Widget title="EVENT LOG" icon={Cpu} accent={GR}>
        <EventLog events={events} />
      </Widget>
    ),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG, overflow: "hidden" }}>

      {/* ── Ticker bar ─────────────────────────────────────────────────────── */}
      <TickerRow tickers={tickers} wsConnected={wsConnected} />

      {/* ── Refresh / widget controls ───────────────────────────────────────── */}
      <div style={{
        height: 28, background: "#020a10", borderBottom: `1px solid ${BORD}`,
        display: "flex", alignItems: "center", padding: "0 10px", gap: 8, flexShrink: 0,
      }}>
        <button
          onClick={loadAll}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
        >
          <RefreshCw style={{ width: 9, height: 9, color: DIM }} />
          <span style={{ fontFamily: MONO, fontSize: 8, color: DIM }}>Refresh</span>
        </button>
        {maxWidget && (
          <>
            <span style={{ fontFamily: MONO, fontSize: 8, color: DIM, marginLeft: 6 }}>
              Maximized: <span style={{ color: C }}>{maxWidget.toUpperCase()}</span>
            </span>
            <button
              onClick={() => setMaxWidget(null)}
              style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}
            >
              <X style={{ width: 9, height: 9, color: R }} />
              <span style={{ fontFamily: MONO, fontSize: 8, color: R }}>Exit fullscreen</span>
            </button>
          </>
        )}
        {!maxWidget && (
          <span style={{ fontFamily: MONO, fontSize: 7, color: DIM, marginLeft: "auto" }}>
            Click <Maximize2 style={{ width: 8, height: 8, display: "inline", verticalAlign: "middle" }} /> on any widget to maximize
          </span>
        )}
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: maxWidget ? "1fr" : "230px 1fr 230px",
        gridTemplateRows:    maxWidget ? "1fr" : "1fr 180px",
        gap: 4, padding: 4, overflow: "hidden",
        minHeight: 0,
      }}>
        {maxWidget ? (
          <div style={{ gridColumn: "1", gridRow: "1" }}>{widgets[maxWidget]}</div>
        ) : (
          <>
            {/* Col 1: Signal Feed (full height) */}
            <div style={{ gridColumn: "1", gridRow: "1 / 3" }}>{widgets.signals}</div>

            {/* Col 2 top: Positions */}
            <div style={{ gridColumn: "2", gridRow: "1" }}>{widgets.positions}</div>

            {/* Col 2 bottom: AI Brief */}
            <div style={{ gridColumn: "2", gridRow: "2" }}>{widgets.ai}</div>

            {/* Col 3 top: Risk Monitor */}
            <div style={{ gridColumn: "3", gridRow: "1" }}>{widgets.risk}</div>

            {/* Col 3 bottom: Event Log */}
            <div style={{ gridColumn: "3", gridRow: "2" }}>{widgets.log}</div>
          </>
        )}
      </div>
    </div>
  );
}
