import { useQuery } from "@tanstack/react-query";
import { api, type MobileStatus, type Portfolio } from "@/lib/api";

function StatCard({ label, value, sub, color = "#00f0ff" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "#050d18",
      border:     "1px solid #0d2035",
      borderRadius: 8,
      padding:    "14px 16px",
    }}>
      <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#3a6080", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function Home() {
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

  const engine    = status?.engine;
  const risk      = status?.risk;
  const pnl       = portfolio?.openPnL ?? 0;
  const pnlPositive = pnl >= 0;

  return (
    <div style={{ padding: "16px 16px 80px" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
          APEX TRADER
        </div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Dashboard
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: engine?.running ? "#00ff8a" : "#ff4444",
            boxShadow:  engine?.running ? "0 0 8px #00ff8a" : "0 0 8px #ff4444",
          }} />
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#3a6080",
            letterSpacing: "0.12em" }}>
            {engine?.running ? "AI ENGINE ACTIVE" : "ENGINE OFFLINE"} · {engine?.mode?.toUpperCase() ?? "PAPER"} MODE
          </span>
        </div>
      </div>

      {/* Paper balance banner */}
      <div style={{
        background:   "#00050d",
        border:       "1px solid #00aaff22",
        borderRadius: 10,
        padding:      "16px 20px",
        marginBottom: 16,
        display:      "flex",
        justifyContent: "space-between",
        alignItems:   "center",
      }}>
        <div>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            PAPER ACCOUNT (FREE)
          </div>
          <div style={{ fontSize: 28, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
            ${(portfolio?.totalValue ?? 100000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{
            fontSize: 12, fontFamily: "monospace", fontWeight: 600,
            color:    pnlPositive ? "#00ff8a" : "#ff4466",
            marginTop: 4,
          }}>
            {pnlPositive ? "+" : ""}${pnl.toFixed(2)} open PnL
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
            letterSpacing: "0.1em", marginBottom: 4 }}>EXCHANGE</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#3a6080", fontWeight: 700 }}>
            {engine?.exchange?.toUpperCase() ?? "SIMULATION"}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <StatCard
          label="Signals Today"
          value={String(engine?.signalsGenerated ?? 0)}
          sub="AI generated"
        />
        <StatCard
          label="Trades Executed"
          value={String(engine?.tradesExecuted ?? 0)}
          sub="this session"
          color="#00ff8a"
        />
        <StatCard
          label="Daily PnL"
          value={`${(risk?.dailyPnLPct ?? 0) >= 0 ? "+" : ""}${(risk?.dailyPnLPct ?? 0).toFixed(2)}%`}
          sub={`$${(risk?.dailyPnL ?? 0).toFixed(2)}`}
          color={(risk?.dailyPnL ?? 0) >= 0 ? "#00ff8a" : "#ff4466"}
        />
        <StatCard
          label="Positions"
          value={String(portfolio?.positions?.length ?? 0)}
          sub="open"
          color="#ffaa00"
        />
      </div>

      {/* Risk strip */}
      <div style={{
        background:   "#050d18",
        border:       "1px solid #0d2035",
        borderRadius: 8,
        padding:      "12px 16px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.14em", marginBottom: 8 }}>RISK STATUS</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              padding: "2px 8px",
              borderRadius: 4,
              background: risk?.level === "LOW" ? "#00ff8a15" : risk?.level === "HIGH" ? "#ff444415" : "#ffaa0015",
              border:     `1px solid ${risk?.level === "LOW" ? "#00ff8a40" : risk?.level === "HIGH" ? "#ff444440" : "#ffaa0040"}`,
              fontSize: 9, fontFamily: "monospace", fontWeight: 700,
              color:    risk?.level === "LOW" ? "#00ff8a" : risk?.level === "HIGH" ? "#ff4466" : "#ffaa00",
              letterSpacing: "0.1em",
            }}>
              {risk?.level ?? "LOW"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50" }}>TRADES</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#3a6080", fontWeight: 700 }}>
                {risk?.tradesUsedToday ?? 0} / {(risk?.tradesUsedToday ?? 0) + (risk?.tradesRemaining ?? 5)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Paper trading note */}
      <div style={{
        padding:      "10px 14px",
        background:   "#00050d",
        border:       "1px solid #0d2035",
        borderRadius: 6,
        display:      "flex",
        alignItems:   "center",
        gap:          10,
      }}>
        <span style={{ fontSize: 14 }}>📄</span>
        <div>
          <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: "#3a6080",
            letterSpacing: "0.08em" }}>
            PAPER TRADING — NO REAL FUNDS AT RISK
          </div>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50", marginTop: 2 }}>
            Ready to go live? Tap Live tab to activate real trading.
          </div>
        </div>
      </div>
    </div>
  );
}
