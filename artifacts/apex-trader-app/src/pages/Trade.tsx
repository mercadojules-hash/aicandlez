import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type MobileStatus, type Portfolio, type SimTrade } from "@/lib/api";

// ── Design tokens (mirrors Home.tsx) ───────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "#00ff88";
const P    = "#9b5cf5";
const O    = "#ff9400";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#3a3f5c";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

// ── Mini sparkline helpers ──────────────────────────────────────────────────────
function miniSparkData(symbol: string, up: boolean): number[] {
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 17);
  const pts: number[] = [];
  let v = 48;
  for (let i = 0; i < 22; i++) {
    const n = ((seed * (i + 5) * 2053 + i * 397) % 1000) / 1000;
    v += (n - 0.48) * 11;
    v = Math.max(8, Math.min(92, v));
    pts.push(v);
  }
  const bias = up ? 9 : -9;
  for (let i = pts.length - 6; i < pts.length; i++) {
    pts[i] = Math.max(8, Math.min(92, pts[i] + bias * ((i - (pts.length - 6)) / 5)));
  }
  return pts;
}

function sparkPath(pts: number[], w: number, h: number): string {
  if (pts.length < 2) return "";
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const pad = h * 0.08;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(p => h - pad - ((p - min) / range) * (h - pad * 2));
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((xs[i - 1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cpx} ${ys[i-1].toFixed(1)} ${cpx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return d;
}

function MiniSparkline({ symbol, up, w = 96, h = 38 }: { symbol: string; up: boolean; w?: number; h?: number }) {
  const pts  = miniSparkData(symbol, up);
  const d    = sparkPath(pts, w, h);
  const col  = up ? "rgba(0,220,110,0.62)" : "rgba(230,70,70,0.58)";
  const gid  = `sg-${symbol}-${up ? "u" : "d"}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow: "visible", flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={col} stopOpacity="0.09"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* subtle fill area */}
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`}
        fill={`url(#${gid})`} />
      {/* line */}
      <path d={d} fill="none" stroke={col} strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Donut gauge ─────────────────────────────────────────────────────────────────
function Donut({ value, color, label, size = 70 }: { value: number; color: string; label: string; size?: number }) {
  const r    = (size - 12) / 2;
  const cx   = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(value / 100, 1) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} shapeRendering="geometricPrecision">
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth="5"/>
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}/>
        <text x={cx} y={cx + 4} textAnchor="middle"
          fill={GR} fontSize="13" fontWeight="600"
          fontFamily={MONO}>{value}</text>
      </svg>
      <div style={{ fontSize: 7, fontFamily: SANS, fontWeight: 500, color: DIM,
        letterSpacing: "0.11em", marginTop: 2, textTransform: "uppercase" as const }}>{label}</div>
    </div>
  );
}

// ── Position card ────────────────────────────────────────────────────────────────
function PositionCard({ pos }: { pos: Portfolio["positions"][number] }) {
  const pnl    = pos.unrealizedPnL ?? 0;
  const up     = pnl >= 0;
  const col    = up ? G : R;
  const sl     = pos.entryPrice * (pos.side === "BUY" ? 0.965 : 1.035);
  const tp     = pos.entryPrice * (pos.side === "BUY" ? 1.040 : 0.960);
  const pnlPct = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.size)) * 100 : 0;
  const borderCol = up ? "rgba(0,255,136,0.11)" : "rgba(255,51,85,0.09)";

  return (
    <div style={{ background: CARD, border: `1px solid ${borderCol}`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>

      {/* Row 1 — symbol + side badge + P&L */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontFamily: MONO, fontWeight: 700, color: W }}>
              {pos.symbol}
            </span>
            <span style={{ padding: "2px 8px",
              background: up ? "rgba(0,255,136,0.08)" : "rgba(255,51,85,0.08)",
              border: `1px solid ${up ? "rgba(0,255,136,0.22)" : "rgba(255,51,85,0.22)"}`,
              borderRadius: 4,
              fontSize: 8, fontFamily: SANS, fontWeight: 600, color: col,
              letterSpacing: "0.08em" }}>
              {pos.side}
            </span>
          </div>
          <div style={{ fontSize: 9, fontFamily: SANS, color: DIM }}>
            <span style={{ fontFamily: MONO }}>{pos.size}</span>
            {" @ "}
            <span style={{ fontFamily: MONO }}>{pos.entryPrice.toFixed(0)}</span>
            {" · 2h ago"}
          </div>
        </div>

        {/* P&L block */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontFamily: MONO, fontWeight: 700, color: col }}>
            {up ? "+" : ""}${Math.abs(pnl).toFixed(2)}
          </div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: col, opacity: 0.75, marginTop: 1 }}>
            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Row 2 — SL / current price / TP + sparkline */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* SL / price / TP */}
        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 7, fontFamily: SANS, color: DIM, letterSpacing: "0.1em",
              marginBottom: 2 }}>SL</div>
            <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600,
              color: "rgba(255,51,85,0.80)" }}>${sl.toFixed(0)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 7, fontFamily: SANS, color: DIM, letterSpacing: "0.1em",
              marginBottom: 2 }}>CURRENT</div>
            <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: W }}>
              ${(pos.currentPrice ?? pos.entryPrice).toLocaleString("en-US",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 7, fontFamily: SANS, color: DIM, letterSpacing: "0.1em",
              marginBottom: 2 }}>TP</div>
            <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600,
              color: "rgba(0,255,136,0.80)" }}>${tp.toFixed(0)}</div>
          </div>
        </div>

        {/* Micro sparkline — right-aligned, supports the card, doesn't dominate it */}
        <div style={{ flexShrink: 0, opacity: 0.68 }}>
          <MiniSparkline symbol={pos.symbol} up={up} w={88} h={34}/>
        </div>
      </div>
    </div>
  );
}

// ── Trade history row ────────────────────────────────────────────────────────────
const MOCK_HISTORY: SimTrade[] = [
  { id:"1", symbol:"BTC", side:"BUY",  pnl:  84.00, pnlPct:  2.58, score:88, closedAt:"25h ago",  entryPrice:67000, exitPrice:68732 },
  { id:"2", symbol:"ETH", side:"SELL", pnl: 112.00, pnlPct:  3.87, score:91, closedAt:"49h ago",  entryPrice:3400,  exitPrice:3268  },
  { id:"3", symbol:"SOL", side:"BUY",  pnl: -16.80, pnlPct: -2.76, score:44, closedAt:"73h ago",  entryPrice:192,   exitPrice:186.7 },
  { id:"4", symbol:"BTC", side:"BUY",  pnl:  84.00, pnlPct:  2.19, score:78, closedAt:"97h ago",  entryPrice:66500, exitPrice:67957 },
  { id:"5", symbol:"ETH", side:"BUY",  pnl: 130.00, pnlPct:  3.93, score:85, closedAt:"121h ago", entryPrice:3350,  exitPrice:3482  },
];

function TradeRow({ trade }: { trade: SimTrade }) {
  const up  = trade.pnl >= 0;
  const col = up ? G : R;
  return (
    <div style={{ display: "flex", alignItems: "center",
      padding: "11px 0", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
      <div style={{ width: 2, height: 28, background: col, opacity: 0.45,
        borderRadius: 2, flexShrink: 0, marginRight: 14 }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 600,
          color: "rgba(255,255,255,0.88)" }}>
          {trade.symbol}
        </div>
        <div style={{ fontSize: 8, fontFamily: SANS, color: GR, marginTop: 2 }}>
          {trade.side} · {trade.closedAt}
        </div>
      </div>
      <div style={{ textAlign: "right", flex: 1 }}>
        <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 600,
          color: up ? "rgba(0,220,110,0.82)" : "rgba(230,70,70,0.80)" }}>
          {up ? "+" : ""}${Math.abs(trade.pnl).toFixed(2)}
        </div>
        <div style={{ fontSize: 9, fontFamily: MONO,
          color: up ? "rgba(0,220,110,0.55)" : "rgba(230,70,70,0.52)", marginTop: 1 }}>
          {up ? "+" : ""}{trade.pnlPct.toFixed(2)}%
        </div>
      </div>
      {trade.score !== undefined && (
        <div style={{ marginLeft: 12, width: 30, height: 30, borderRadius: 6,
          background: trade.score >= 70 ? "rgba(0,210,100,0.06)"
                    : trade.score >= 50 ? "rgba(255,148,0,0.06)"
                    : "rgba(230,70,70,0.06)",
          border: `1px solid ${trade.score >= 70 ? "rgba(0,210,100,0.18)"
                              : trade.score >= 50 ? "rgba(255,148,0,0.18)"
                              : "rgba(230,70,70,0.18)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontFamily: MONO, fontWeight: 600,
          color: trade.score >= 70 ? "rgba(0,210,100,0.80)"
               : trade.score >= 50 ? "rgba(255,148,0,0.80)"
               : "rgba(230,70,70,0.78)" }}>
          {trade.score}
        </div>
      )}
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────────
function SectionHead({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 2, height: 13, background: "rgba(255,255,255,0.25)",
        borderRadius: 2, flexShrink: 0 }}/>
      <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600, color: GR,
        letterSpacing: "0.18em", textTransform: "uppercase" as const }}>
        {label}
      </span>
      {count !== undefined && (
        <div style={{ marginLeft: "auto", minWidth: 20, height: 20, borderRadius: 4,
          background: "rgba(255,255,255,0.05)", border: `1px solid ${E}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontFamily: MONO, fontWeight: 600, color: GR, padding: "0 5px" }}>
          {count}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function Trade() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: status } = useQuery<MobileStatus>({
    queryKey: ["mobile-status"],
    queryFn:  () => api.get("/mobile/status"),
    refetchInterval: 5_000,
  });
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["mobile-portfolio"],
    queryFn:  () => api.get("/mobile/portfolio"),
    refetchInterval: 8_000,
  });
  const { data: tradeHistory } = useQuery<{ trades: SimTrade[] }>({
    queryKey: ["sim-trades"],
    queryFn:  () => api.get("/simulation/trades"),
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

  const killMutation  = useMutation({
    mutationFn: () => api.post("/engine/kill-switch", { active: true }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });
  const pauseMutation = useMutation({
    mutationFn: () => api.post("/engine/pause", {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });
  const autoMutation  = useMutation({
    mutationFn: () => api.put("/user/settings", { autoMode: !engine?.autoMode }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 28 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px 14px",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: W, fontFamily: SANS,
            letterSpacing: "-0.01em" }}>
            Live Trading
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: G,
              flexShrink: 0, animation: "dot-pulse 2.5s ease-in-out infinite" }}/>
            <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 500, color: GR,
              letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
              AI Engine Active
            </span>
          </div>
        </div>

        {/* Mode badge */}
        <div style={{
          padding: "3px 11px",
          border: `1px solid ${isLive ? "rgba(0,255,136,0.25)" : "rgba(0,229,255,0.20)"}`,
          background: isLive ? "#001508" : "#00101a",
          borderRadius: 4, marginTop: 4,
          fontSize: 9, fontFamily: SANS, fontWeight: 600,
          color: isLive ? G : C, letterSpacing: "0.05em",
        }}>
          {isLive ? "Live" : "Simulation"}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Execution controls ──────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>

          {/* KILL */}
          <button onClick={() => killMutation.mutate()} style={{
            background: "rgba(255,51,85,0.05)",
            border: "1px solid rgba(255,51,85,0.18)",
            borderRadius: 10, padding: "13px 0",
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 7,
          }}>
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="8.5" stroke="rgba(255,51,85,0.70)" strokeWidth="1.4"/>
              <path d="M7.5 7.5l7 7M14.5 7.5l-7 7" stroke="rgba(255,51,85,0.80)"
                strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
              color: "rgba(255,51,85,0.85)", letterSpacing: "0.09em" }}>KILL</span>
          </button>

          {/* PAUSE */}
          <button onClick={() => pauseMutation.mutate()} style={{
            background: "rgba(255,148,0,0.05)",
            border: "1px solid rgba(255,148,0,0.18)",
            borderRadius: 10, padding: "13px 0",
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 7,
          }}>
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="6.5" y="5.5" width="3" height="11" rx="1.5"
                fill="rgba(255,148,0,0.75)"/>
              <rect x="12.5" y="5.5" width="3" height="11" rx="1.5"
                fill="rgba(255,148,0,0.75)"/>
            </svg>
            <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
              color: "rgba(255,148,0,0.85)", letterSpacing: "0.09em" }}>PAUSE</span>
          </button>

          {/* AUTO */}
          <button onClick={() => autoMutation.mutate()} style={{
            background: engine?.autoMode ? "rgba(0,229,255,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${engine?.autoMode ? "rgba(0,229,255,0.22)" : "rgba(0,229,255,0.12)"}`,
            borderRadius: 10, padding: "13px 0",
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 7,
          }}>
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="3.5" y="3.5" width="15" height="15" rx="2.5"
                stroke={engine?.autoMode ? "rgba(0,229,255,0.85)" : "rgba(0,229,255,0.50)"}
                strokeWidth="1.4"/>
              <path d="M7 11h4m4 0h-4m0 0V7m0 4v4"
                stroke={engine?.autoMode ? "rgba(0,229,255,0.85)" : "rgba(0,229,255,0.50)"}
                strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
              color: engine?.autoMode ? "rgba(0,229,255,0.90)" : "rgba(0,229,255,0.55)",
              letterSpacing: "0.09em" }}>AUTO</span>
          </button>
        </div>

        {/* ── Metrics panel ───────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${E}`,
          borderRadius: 14, padding: "18px 16px", marginBottom: 12 }}>

          {/* Donuts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            marginBottom: 16 }}>
            <Donut value={winPct}     color="rgba(0,210,100,0.60)"  label="Win / Loss"/>
            <Donut value={confidence} color="rgba(130,80,215,0.62)" label="AI Confidence"/>
            <Donut value={exposure}   color="rgba(0,185,215,0.58)"  label="Exposure"/>
          </div>

          {/* Stat row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
            borderTop: `1px solid rgba(255,255,255,0.05)`, paddingTop: 14 }}>
            {([
              { val: "+2",      sub: "wins",  label: "Streak",   color: G },
              { val: "47m",     sub: "",      label: "Avg Hold", color: C },
              { val: `${winPct}%`, sub: "",   label: "Win Rate", color: G },
            ] as { val:string; sub:string; label:string; color:string }[]).map(({ val, sub, label, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color }}>{val}</div>
                {sub && <div style={{ fontSize: 7, color: DIM, fontFamily: SANS }}>{sub}</div>}
                <div style={{ fontSize: 7, color: DIM, fontFamily: SANS,
                  letterSpacing: "0.08em", marginTop: 2, textTransform: "uppercase" as const }}>
                  {label}
                </div>
              </div>
            ))}

            {/* AI status dot */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%",
                background: G, opacity: 0.80,
                animation: "dot-pulse 2.5s ease-in-out 0.6s infinite" }}/>
              <div style={{ fontSize: 7, fontFamily: SANS, fontWeight: 500,
                color: GR, letterSpacing: "0.1em",
                textTransform: "uppercase" as const }}>AI Active</div>
            </div>
          </div>
        </div>

        {/* ── Total unrealized P&L ────────────────────────────────────────── */}
        <div style={{ background: CARD,
          border: `1px solid ${openPnL >= 0 ? "rgba(0,255,136,0.18)" : "rgba(255,51,85,0.15)"}`,
          borderRadius: 12, padding: "14px 18px", marginBottom: 14,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 500, color: GR,
              letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: 4 }}>
              Total Unrealized P&L
            </div>
            <div style={{ fontSize: 9, fontFamily: SANS, color: DIM }}>
              <span style={{ fontFamily: MONO }}>{positions.length}</span>
              {" "}open position{positions.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ fontSize: 26, fontFamily: MONO, fontWeight: 700,
            color: openPnL >= 0 ? G : R }}>
            {openPnL >= 0 ? "+" : ""}${Math.abs(openPnL).toFixed(2)}
          </div>
        </div>

        {/* ── Open positions ───────────────────────────────────────────────── */}
        <div style={{ marginBottom: 15 }}>
          <SectionHead label="Open Positions" count={positions.length}/>
          {positions.length === 0 && (
            <div style={{ background: CARD, border: `1px solid ${E}`,
              borderRadius: 12, padding: "28px 0", textAlign: "center",
              fontSize: 10, fontFamily: SANS, color: DIM, letterSpacing: "0.06em" }}>
              No open positions
            </div>
          )}
          {positions.map(pos => <PositionCard key={pos.id} pos={pos}/>)}
        </div>

        {/* ── Trade history ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <SectionHead label="Trade History"/>
          <div style={{ background: CARD, border: `1px solid ${E}`,
            borderRadius: 12, padding: "0 16px" }}>
            {history.slice(0, 5).map(t => <TradeRow key={t.id} trade={t}/>)}
          </div>
        </div>

        {/* ── Activate live CTA ────────────────────────────────────────────── */}
        <div style={{ padding: "13px 16px", background: "rgba(0,229,255,0.04)",
          border: `1px solid rgba(0,229,255,0.14)`, borderRadius: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600, color: C,
              letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
              Activate Live Trading
            </div>
            <div style={{ fontSize: 8, fontFamily: SANS, color: DIM, marginTop: 3 }}>
              $5.99/mo + 2% on profitable trades
            </div>
          </div>
          <button onClick={() => setLocation("/subscribe")} style={{
            padding: "7px 14px",
            background: "rgba(0,229,255,0.10)",
            border: "1px solid rgba(0,229,255,0.28)",
            borderRadius: 6, color: C,
            fontFamily: SANS, fontSize: 9, fontWeight: 600,
            letterSpacing: "0.06em", cursor: "pointer",
          }}>
            Go Live →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.4; transform: scale(0.80); }
        }
      `}</style>
    </div>
  );
}
