import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type MobileStatus, type Portfolio } from "@/lib/api";

function StatCard({ label, value, sub, color = "#00aaff", trend }: {
  label: string; value: string; sub?: string; color?: string; trend?: "up" | "down" | "flat";
}) {
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : undefined;
  return (
    <div style={{
      background:   "#050d18",
      border:       "1px solid #0d2035",
      borderRadius: 10,
      padding:      "14px 16px",
    }}>
      <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700, color, lineHeight: 1 }}>
          {value}
        </div>
        {trendArrow && (
          <span style={{ fontSize: 12, color, opacity: 0.7 }}>{trendArrow}</span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function PulsingDot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: color, opacity: 0.3,
        animation: "pulse-ring 1.8s ease infinite",
      }} />
      <div style={{ width: size, height: size, borderRadius: "50%",
        background: color, boxShadow: `0 0 ${size}px ${color}` }} />
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.4; }
          60%  { transform: scale(2.2); opacity: 0;   }
          100% { transform: scale(2.2); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();

  const { data: status } = useQuery<MobileStatus>({
    queryKey:        ["mobile-status"],
    queryFn:         () => api.get("/mobile/status"),
    refetchInterval: 5_000,
  });

  const { data: portfolio } = useQuery<Portfolio>({
    queryKey:        ["mobile-portfolio"],
    queryFn:         () => api.get("/mobile/portfolio"),
    refetchInterval: 10_000,
  });

  const engine      = status?.engine;
  const risk        = status?.risk;
  const pnl         = portfolio?.openPnL ?? 0;
  const pnlPositive = pnl >= 0;
  const totalValue  = portfolio?.totalValue ?? 100_000;

  const riskColor = risk?.level === "LOW" ? "#00ff8a" : risk?.level === "HIGH" ? "#ff4466" : "#ffaa00";

  return (
    <div style={{ padding: "0 0 24px" }} className="page-enter">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        background:   "linear-gradient(180deg, #050d18 0%, #030810 100%)",
        borderBottom: "1px solid #0d2035",
        padding:      "20px 20px 16px",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
              letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 3 }}>
              APEX TRADER
            </div>
            <div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
              Dashboard
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <PulsingDot color={engine?.running ? "#00ff8a" : "#ff4444"} size={7} />
            <span style={{ fontSize: 8, fontFamily: "monospace",
              color: engine?.running ? "#00ff8a" : "#ff4466",
              letterSpacing: "0.12em", fontWeight: 700 }}>
              {engine?.running ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>

        {/* Engine mode strip */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{
            padding: "3px 10px",
            background: engine?.mode === "live" ? "#00ff8a12" : "#ffaa0012",
            border:     `1px solid ${engine?.mode === "live" ? "#00ff8a30" : "#ffaa0030"}`,
            borderRadius: 6,
            fontSize: 8, fontFamily: "monospace", fontWeight: 700,
            color: engine?.mode === "live" ? "#00ff8a" : "#ffaa00",
            letterSpacing: "0.1em",
          }}>
            {engine?.mode === "live" ? "⚡ LIVE MODE" : "📄 PAPER MODE"}
          </div>
          <div style={{
            padding: "3px 10px",
            background: "#00aaff10", border: "1px solid #00aaff25",
            borderRadius: 6,
            fontSize: 8, fontFamily: "monospace", color: "#00aaff",
            letterSpacing: "0.1em",
          }}>
            {engine?.exchange?.toUpperCase() ?? "SIMULATION"}
          </div>
          {engine?.autoMode && (
            <div style={{
              padding: "3px 10px",
              background: "#a855f712", border: "1px solid #a855f730",
              borderRadius: 6,
              fontSize: 8, fontFamily: "monospace", color: "#a855f7",
              letterSpacing: "0.1em",
            }}>
              AUTO-AI
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Paper balance banner ─────────────────────────────────────────── */}
        <div style={{
          background:    "linear-gradient(135deg, #050d18 0%, #030c14 100%)",
          border:        "1px solid #00aaff18",
          borderRadius:  12,
          padding:       "18px 20px",
          marginBottom:  16,
        }}>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            PAPER ACCOUNT BALANCE
          </div>
          <div style={{ fontSize: 32, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff",
            letterSpacing: "-0.02em" }}>
            ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{
              fontSize: 13, fontFamily: "monospace", fontWeight: 700,
              color: pnlPositive ? "#00ff8a" : "#ff4466",
            }}>
              {pnlPositive ? "+" : ""}${pnl.toFixed(2)}
            </span>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060" }}>
              unrealized PnL
            </span>
          </div>

          {/* Mini progress vs starting 100k */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 7, fontFamily: "monospace", color: "#1e3a50" }}>STARTING $100,000</span>
              <span style={{ fontSize: 7, fontFamily: "monospace",
                color: pnlPositive ? "#00ff8a" : "#ff4466" }}>
                {pnlPositive ? "+" : ""}{((totalValue / 100_000 - 1) * 100).toFixed(2)}%
              </span>
            </div>
            <div style={{ height: 3, background: "#0d2035", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(Math.max((totalValue / 100_000) * 50, 0), 100)}%`,
                background: pnlPositive ? "#00ff8a" : "#ff4466",
                borderRadius: 2,
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        </div>

        {/* ── Stats grid ────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <StatCard
            label="AI Signals Today"
            value={String(engine?.signalsGenerated ?? 0)}
            sub="generated this session"
            color="#00aaff"
          />
          <StatCard
            label="Trades Executed"
            value={String(engine?.tradesExecuted ?? 0)}
            sub="paper trades"
            color="#00ff8a"
          />
          <StatCard
            label="Daily PnL"
            value={`${(risk?.dailyPnLPct ?? 0) >= 0 ? "+" : ""}${(risk?.dailyPnLPct ?? 0).toFixed(2)}%`}
            sub={`$${Math.abs(risk?.dailyPnL ?? 0).toFixed(2)} ${(risk?.dailyPnL ?? 0) >= 0 ? "gained" : "lost"}`}
            color={(risk?.dailyPnL ?? 0) >= 0 ? "#00ff8a" : "#ff4466"}
            trend={(risk?.dailyPnL ?? 0) > 0 ? "up" : (risk?.dailyPnL ?? 0) < 0 ? "down" : "flat"}
          />
          <StatCard
            label="Open Positions"
            value={String(portfolio?.positions?.length ?? 0)}
            sub={`${(risk?.tradesUsedToday ?? 0)} trades today`}
            color="#ffaa00"
          />
        </div>

        {/* ── Risk strip ────────────────────────────────────────────────────── */}
        <div style={{
          background:   "#050d18",
          border:       `1px solid ${riskColor}20`,
          borderRadius: 10,
          padding:      "12px 16px",
          marginBottom: 16,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              padding: "3px 10px",
              background: riskColor + "15",
              border:     `1px solid ${riskColor}40`,
              borderRadius: 6,
              fontSize: 9, fontFamily: "monospace", fontWeight: 800,
              color: riskColor, letterSpacing: "0.12em",
            }}>
              {risk?.level ?? "LOW"} RISK
            </div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060" }}>
              {risk?.tradesRemaining ?? 5} trades left today
            </div>
          </div>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#1e3a50" }}>
            {risk?.tradesUsedToday ?? 0}/{(risk?.tradesUsedToday ?? 0) + (risk?.tradesRemaining ?? 5)}
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setLocation("/signals")}
            style={{
              padding: "13px 0",
              background: "#00aaff10", border: "1px solid #00aaff30",
              borderRadius: 10, color: "#00aaff",
              fontFamily: "monospace", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer",
              transition: "background 0.15s ease",
            }}>
            ◈ VIEW SIGNALS
          </button>
          <button
            onClick={() => setLocation("/live")}
            style={{
              padding: "13px 0",
              background: "#00ff8a10", border: "1px solid #00ff8a30",
              borderRadius: 10, color: "#00ff8a",
              fontFamily: "monospace", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer",
              transition: "background 0.15s ease",
            }}>
            ⚡ GO LIVE
          </button>
        </div>

        {/* ── Paper trading disclaimer ─────────────────────────────────────── */}
        <div style={{
          padding:      "11px 14px",
          background:   "#030810",
          border:       "1px solid #0a1825",
          borderRadius: 8,
          display:      "flex",
          alignItems:   "center",
          gap:          10,
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>📄</span>
          <div>
            <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700,
              color: "#2a4060", letterSpacing: "0.08em" }}>
              PAPER TRADING — NO REAL FUNDS AT RISK
            </div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1a3040", marginTop: 2 }}>
              Simulate with $100,000 virtual capital. Always free.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
