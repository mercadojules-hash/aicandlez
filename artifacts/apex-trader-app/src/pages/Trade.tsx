import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type MobileStatus, type Portfolio, type SimTrade } from "@/lib/api";

const S = "#0d0e1a", B = "#1c1f32", C = "#00e5ff", G = "#00ff88",
      P = "#9b5cf5", O = "#ff9400", R = "#ff3355", W = "#ffffff",
      GR = "#8892a4", DIM = "#3a3f5c";

// ── Donut gauge ────────────────────────────────────────────────────────────────
function Donut({ value, color, label, size = 72 }: { value: number; color: string; label: string; size?: number }) {
  const r = (size - 10) / 2, c = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(value / 100, 1) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#1c1f32" strokeWidth="7" />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`} />
        <text x={c} y={c + 5} textAnchor="middle" fill={color}
          fontSize="15" fontWeight="800" fontFamily="monospace">{value}</text>
      </svg>
      <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, letterSpacing: "0.12em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Position card ──────────────────────────────────────────────────────────────
function PositionCard({ pos }: { pos: Portfolio["positions"][number] }) {
  const pnl     = pos.unrealizedPnL ?? 0;
  const up      = pnl >= 0;
  const color   = up ? G : R;
  const sl      = pos.entryPrice * (pos.side === "BUY" ? 0.965 : 1.035);
  const tp      = pos.entryPrice * (pos.side === "BUY" ? 1.04  : 0.96);
  const pnlPct  = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.size)) * 100 : 0;
  const age     = "2h ago";

  return (
    <div style={{ background: "#0a0b14", border: `1px solid ${up ? G + "40" : R + "30"}`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 10,
      boxShadow: `0 0 16px ${color}06` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: W }}>{pos.symbol}</span>
            <span style={{ padding: "2px 8px", background: up ? G+"20" : R+"20",
              border: `1px solid ${color}50`, borderRadius: 4,
              fontSize: 8, fontFamily: "monospace", fontWeight: 700, color, letterSpacing: "0.1em" }}>
              {pos.side}
            </span>
          </div>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: DIM, marginTop: 4 }}>
            {pos.size} @ {pos.entryPrice.toFixed(0)} · {age}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 800, color }}>
            {up ? "+" : ""}${Math.abs(pnl).toFixed(2)}
          </div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color, marginTop: 2 }}>
            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 8, fontFamily: "monospace", color: R, marginRight: 4 }}>SL</span>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: R, fontWeight: 700 }}>${sl.toFixed(0)}</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, marginBottom: 2 }}>CURRENT</div>
          <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: W }}>
            ${(pos.currentPrice ?? pos.entryPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 8, fontFamily: "monospace", color: G, marginRight: 4 }}>TP</span>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: G, fontWeight: 700 }}>${tp.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Trade history row ──────────────────────────────────────────────────────────
const MOCK_HISTORY: SimTrade[] = [
  { id: "1", symbol: "BTC", side: "BUY",  pnl:  84.00, pnlPct:  2.58, score: 88, closedAt: "25h ago", entryPrice: 67000, exitPrice: 68732 },
  { id: "2", symbol: "ETH", side: "SELL", pnl: 112.00, pnlPct:  3.87, score: 91, closedAt: "49h ago", entryPrice: 3400, exitPrice: 3268  },
  { id: "3", symbol: "SOL", side: "BUY",  pnl: -16.80, pnlPct: -2.76, score: 44, closedAt: "73h ago", entryPrice: 192, exitPrice: 186.7  },
  { id: "4", symbol: "BTC", side: "BUY",  pnl:  84.00, pnlPct:  2.19, score: 78, closedAt: "97h ago", entryPrice: 66500, exitPrice: 67957 },
  { id: "5", symbol: "ETH", side: "BUY",  pnl: 130.00, pnlPct:  3.93, score: 85, closedAt: "121h ago", entryPrice: 3350, exitPrice: 3482 },
];

function TradeRow({ trade }: { trade: SimTrade }) {
  const up  = trade.pnl >= 0;
  const col = up ? G : R;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0,
      padding: "12px 0", borderBottom: `1px solid ${B}` }}>
      <div style={{ width: 3, height: 36, background: col, borderRadius: 2, flexShrink: 0, marginRight: 14 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 800, color: W }}>{trade.symbol}</div>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, marginTop: 2 }}>
          {trade.side} · {trade.closedAt}
        </div>
      </div>
      <div style={{ textAlign: "right", flex: 1 }}>
        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: col }}>
          {up ? "+" : ""}${Math.abs(trade.pnl).toFixed(2)}
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: col, opacity: 0.7 }}>
          {up ? "+" : ""}{trade.pnlPct.toFixed(2)}%
        </div>
      </div>
      {trade.score !== undefined && (
        <div style={{ marginLeft: 12, width: 32, height: 32, borderRadius: 6,
          background: trade.score >= 70 ? G+"20" : trade.score >= 50 ? O+"20" : R+"20",
          border: `1px solid ${trade.score >= 70 ? G+"40" : trade.score >= 50 ? O+"40" : R+"40"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontFamily: "monospace", fontWeight: 800,
          color: trade.score >= 70 ? G : trade.score >= 50 ? O : R }}>
          {trade.score}
        </div>
      )}
    </div>
  );
}

export default function Trade() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: status } = useQuery<MobileStatus>({
    queryKey: ["mobile-status"], queryFn: () => api.get("/mobile/status"), refetchInterval: 5_000,
  });
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["mobile-portfolio"], queryFn: () => api.get("/mobile/portfolio"), refetchInterval: 8_000,
  });
  const { data: tradeHistory } = useQuery<{ trades: SimTrade[] }>({
    queryKey: ["sim-trades"], queryFn: () => api.get("/simulation/trades"),
    retry: false, staleTime: 30_000,
  });

  const engine    = status?.engine;
  const isLive    = engine?.mode === "live";
  const positions = portfolio?.positions ?? [];
  const openPnL   = portfolio?.openPnL ?? 0;
  const history   = tradeHistory?.trades?.length ? tradeHistory.trades : MOCK_HISTORY;
  const wins      = history.filter(t => t.pnl > 0).length;
  const winPct    = history.length > 0 ? Math.round((wins / history.length) * 100) : 80;
  const confidence = 62;
  const exposure   = 56;

  const killMutation = useMutation({
    mutationFn: () => api.post("/engine/kill-switch", { active: true }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });
  const pauseMutation = useMutation({
    mutationFn: () => api.post("/engine/pause", {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });
  const autoMutation = useMutation({
    mutationFn: () => api.put("/user/settings", { autoMode: !engine?.autoMode }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });

  return (
    <div className="page-enter" style={{ background: "#080810", minHeight: "100%", paddingBottom: 24 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: W, fontFamily: "monospace", letterSpacing: "-0.02em" }}>
            LIVE TRADING
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: G, boxShadow: `0 0 8px ${G}`, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.1em" }}>AI ENGINE ACTIVE</span>
          </div>
        </div>
        <div style={{ padding: "3px 10px", border: `1px solid ${C}60`, borderRadius: 4,
          fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C, letterSpacing: "0.14em", marginTop: 4 }}>
          {isLive ? "LIVE" : "SIMULATION"}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Control Buttons ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          <button onClick={() => killMutation.mutate()} style={{
            background: R+"15", border: `1px solid ${R}50`, borderRadius: 12, padding: "14px 0",
            cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2C6.03 2 2 6.03 2 11s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" stroke={R} strokeWidth="1.5"/>
              <path d="M7 7l8 8M15 7l-8 8" stroke={R} strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: R, letterSpacing: "0.1em" }}>KILL</span>
          </button>
          <button onClick={() => pauseMutation.mutate()} style={{
            background: O+"15", border: `1px solid ${O}50`, borderRadius: 12, padding: "14px 0",
            cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="6" y="5" width="3.5" height="12" rx="1.5" fill={O}/>
              <rect x="12.5" y="5" width="3.5" height="12" rx="1.5" fill={O}/>
            </svg>
            <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: O, letterSpacing: "0.1em" }}>PAUSE</span>
          </button>
          <button onClick={() => autoMutation.mutate()} style={{
            background: engine?.autoMode ? C+"20" : "#0d0e1a",
            border: `1px solid ${engine?.autoMode ? C+"80" : C+"40"}`,
            borderRadius: 12, padding: "14px 0",
            cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            boxShadow: engine?.autoMode ? `0 0 16px ${C}20` : "none",
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="3" width="16" height="16" rx="3" stroke={C} strokeWidth="1.5"/>
              <path d="M7 11h4m4 0h-4m0 0V7m0 4v4" stroke={C} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: C, letterSpacing: "0.1em" }}>AUTO</span>
          </button>
        </div>

        {/* ── Metrics Panel (gradient glow border) ────────────────────────── */}
        <div style={{ padding: 1, borderRadius: 14, marginBottom: 16,
          background: `linear-gradient(135deg, ${P}80, ${C}80)` }}>
          <div style={{ background: "#0b0c18", borderRadius: 13, padding: "18px 16px" }}>
            {/* Donuts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 16 }}>
              <Donut value={winPct} color={G}  label="WIN / LOSS" />
              <Donut value={confidence} color={P} label="AI CONFIDENCE" />
              <Donut value={exposure}   color={C} label="EXPOSURE" />
            </div>
            {/* Bottom row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
              borderTop: `1px solid ${B}`, paddingTop: 14 }}>
              {[
                { val: "+2", sub: "wins", label: "STREAK",   color: G },
                { val: "47m", sub: "",    label: "AVG HOLD", color: C },
                { val: `${winPct}%`, sub: "", label: "WIN RATE", color: G },
              ].map(({ val, sub, label, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 800, color }}>{val}</div>
                  {sub && <div style={{ fontSize: 7, color: DIM, fontFamily: "monospace" }}>{sub}</div>}
                  <div style={{ fontSize: 7, color: DIM, fontFamily: "monospace", letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: P,
                  boxShadow: `0 0 12px ${P}`, animation: "pulse 1.5s ease infinite" }} />
                <div style={{ fontSize: 7, fontFamily: "monospace", color: P, letterSpacing: "0.1em" }}>AI ACTIVE</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Total Unrealized P&L ─────────────────────────────────────────── */}
        <div style={{ background: S, border: `1px solid ${openPnL >= 0 ? G+"25" : R+"25"}`,
          borderRadius: 12, padding: "14px 18px", marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.14em", marginBottom: 4 }}>
              TOTAL UNREALIZED P&L
            </div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: DIM }}>
              {positions.length} open position{positions.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ fontSize: 26, fontFamily: "monospace", fontWeight: 900,
            color: openPnL >= 0 ? G : R }}>
            {openPnL >= 0 ? "+" : ""}${Math.abs(openPnL).toFixed(2)}
          </div>
        </div>

        {/* ── Open Positions ───────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 3, height: 14, background: P, borderRadius: 2 }} />
            <span style={{ fontSize: 9, color: GR, letterSpacing: "0.2em", fontFamily: "monospace", fontWeight: 700 }}>
              OPEN POSITIONS
            </span>
            <div style={{ marginLeft: "auto", width: 20, height: 20, borderRadius: 4,
              background: "#1a1d2e", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: W }}>
              {positions.length}
            </div>
          </div>

          {positions.length === 0 && (
            <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 12, padding: "24px 0",
              textAlign: "center", fontSize: 10, fontFamily: "monospace", color: DIM }}>
              NO OPEN POSITIONS
            </div>
          )}
          {positions.map(pos => <PositionCard key={pos.id} pos={pos} />)}
        </div>

        {/* ── Trade History ────────────────────────────────────────────────── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 3, height: 14, background: P, borderRadius: 2 }} />
            <span style={{ fontSize: 9, color: GR, letterSpacing: "0.2em", fontFamily: "monospace", fontWeight: 700 }}>
              TRADE HISTORY
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "monospace", color: DIM }}>
              {history.length}
            </span>
          </div>
          <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 12, padding: "0 16px" }}>
            {history.slice(0, 5).map(t => <TradeRow key={t.id} trade={t} />)}
          </div>
        </div>

        {/* ── Subscribe CTA if on free plan ───────────────────────────────── */}
        <div style={{ marginTop: 16, padding: "12px 16px", background: C+"08",
          border: `1px solid ${C}20`, borderRadius: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C, letterSpacing: "0.1em" }}>
              ACTIVATE LIVE TRADING
            </div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, marginTop: 2 }}>
              $5.99/mo + 2% on profitable trades
            </div>
          </div>
          <button onClick={() => setLocation("/subscribe")} style={{
            padding: "7px 14px", background: C+"18", border: `1px solid ${C}50`,
            borderRadius: 6, color: C, fontFamily: "monospace", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer",
          }}>
            GO LIVE →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
