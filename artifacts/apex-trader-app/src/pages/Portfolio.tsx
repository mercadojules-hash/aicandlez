import { useQuery } from "@tanstack/react-query";
import { api, type Portfolio as PortfolioData } from "@/lib/api";

function PositionRow({ pos }: { pos: PortfolioData["positions"][number] }) {
  const pnl = pos.unrealizedPnL ?? 0;
  const up  = pnl >= 0;
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      padding:      "12px 0",
      borderBottom: "1px solid #0d2035",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          {pos.symbol}
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060", marginTop: 2 }}>
          {pos.side} · {pos.size} · ENTRY ${pos.entryPrice?.toFixed(2)}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700,
          color: up ? "#00ff8a" : "#ff4466" }}>
          {up ? "+" : ""}${pnl.toFixed(2)}
        </div>
        {pos.currentPrice && (
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060", marginTop: 2 }}>
            NOW ${pos.currentPrice.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { data, isLoading } = useQuery<PortfolioData>({
    queryKey:        ["mobile-portfolio"],
    queryFn:         () => api.get("/mobile/portfolio"),
    refetchInterval: 10_000,
  });

  const totalValue = data?.totalValue ?? 100000;
  const openPnL    = data?.openPnL    ?? 0;
  const pnlPositive = openPnL >= 0;
  const positions  = data?.positions ?? [];

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
          PAPER ACCOUNT
        </div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Portfolio
        </div>
      </div>

      {/* Total value */}
      <div style={{
        background:   "#050d18",
        border:       "1px solid #0d2035",
        borderRadius: 10,
        padding:      "18px 20px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
          TOTAL VALUE (PAPER)
        </div>
        <div style={{ fontSize: 30, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{
          fontSize:  13,
          fontFamily: "monospace",
          fontWeight: 600,
          color:     pnlPositive ? "#00ff8a" : "#ff4466",
          marginTop: 6,
        }}>
          {pnlPositive ? "+" : ""}${openPnL.toFixed(2)} unrealized PnL
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50" }}>EXCHANGE</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#3a6080", fontWeight: 700, marginTop: 2 }}>
              {data?.exchange?.toUpperCase() ?? "SIMULATION"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50" }}>MODE</div>
            <div style={{ fontSize: 11, fontFamily: "monospace",
              color: data?.mode === "live" ? "#00ff8a" : "#ffaa00", fontWeight: 700, marginTop: 2 }}>
              {data?.mode?.toUpperCase() ?? "PAPER"}
            </div>
          </div>
        </div>
      </div>

      {/* Balances */}
      {data?.balances && Object.keys(data.balances).length > 0 && (
        <div style={{
          background: "#050d18", border: "1px solid #0d2035",
          borderRadius: 10, padding: "14px 16px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.14em", marginBottom: 10 }}>BALANCES</div>
          {Object.entries(data.balances).map(([asset, amount]) => (
            <div key={asset} style={{ display: "flex", justifyContent: "space-between",
              padding: "6px 0", borderBottom: "1px solid #0a1a28" }}>
              <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
                {asset}
              </span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#3a6080" }}>
                {typeof amount === "number" ? amount.toFixed(8).replace(/0+$/, "0") : amount}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Positions */}
      <div style={{ background: "#050d18", border: "1px solid #0d2035",
        borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.14em", marginBottom: 4 }}>
          OPEN POSITIONS ({positions.length})
        </div>

        {isLoading && (
          <div style={{ padding: "20px 0", textAlign: "center", fontFamily: "monospace",
            fontSize: 10, color: "#2a4060" }}>LOADING...</div>
        )}

        {!isLoading && positions.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", fontFamily: "monospace",
            fontSize: 10, color: "#1e3a50" }}>NO OPEN POSITIONS</div>
        )}

        {positions.map(pos => <PositionRow key={pos.id} pos={pos} />)}
      </div>
    </div>
  );
}
