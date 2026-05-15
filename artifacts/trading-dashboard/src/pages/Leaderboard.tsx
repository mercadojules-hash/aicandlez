import { useQuery } from "@tanstack/react-query";
import type { EngineStatus } from "@/components/command/types";

const Q_OPTS = { refetchOnWindowFocus: false, retry: false } as const;

export default function Leaderboard() {
  const { data: engine } = useQuery<EngineStatus>({
    queryKey: ["engine-leaderboard"],
    queryFn:  () => fetch("/api/engine/status").then(r => r.json()),
    refetchInterval: 10_000,
    ...Q_OPTS,
  });

  const bds = engine ? Object.values(engine.symbolBreakdowns ?? {}) as any[] : [];
  const ranked = [...bds].sort((a, b) => (b.avgConfidence ?? 0) - (a.avgConfidence ?? 0));

  const sigTotal = engine?.signalsGenerated ?? 0;
  const execTotal = engine?.tradesExecuted ?? 0;
  const blockTotal = engine?.tradesBlocked ?? 0;
  const mtfPass = engine?.mtfConfirmedCount ?? 0;

  const decColor = (d: string) =>
    d === "BUY" ? "#00ff8a" : d === "SELL" ? "#ff3355" : "#4a8fa8";

  const confColor = (c: number) =>
    c >= 65 ? "#00ff8a" : c >= 45 ? "#ffaa00" : "#ff5555";

  const mcColor = (mc: string) =>
    mc === "trending" ? "#00ff8a" : mc === "sideways" ? "#ffaa00" : "#9FB3C8";

  return (
    <div style={{ padding: "24px 28px", fontFamily: "monospace", color: "#EAF2FF", background: "#000508", minHeight: "100vh" }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 9, color: "#2a4a60", letterSpacing: "0.25em", marginBottom: 6, textTransform: "uppercase" }}>
          AI ENGINE · OPERATOR CONSOLE
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#EAF2FF", letterSpacing: "0.04em" }}>
          Signal Leaderboard
        </div>
        <div style={{ fontSize: 10, color: "#3a5a70", marginTop: 4 }}>
          Ranked by AI confidence score — live engine data only
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "SIGNALS GENERATED", value: sigTotal,   color: "#00f0ff" },
          { label: "TRADES EXECUTED",   value: execTotal,  color: "#00ff8a" },
          { label: "SIGNALS BLOCKED",   value: blockTotal, color: "#ff5555" },
          { label: "MTF CONFIRMED",     value: mtfPass,    color: "#cc55ff" },
        ].map(stat => (
          <div key={stat.label} style={{
            padding: "16px 20px",
            background: "#000a14",
            border: "1px solid #0d1e2e",
            borderRadius: 3,
          }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: stat.color, lineHeight: 1, textShadow: `0 0 20px ${stat.color}30` }}>
              {engine ? String(stat.value) : "—"}
            </div>
            <div style={{ fontSize: 7.5, color: "#2a4050", textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 5 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {ranked.length > 0 ? (
        <div style={{ border: "1px solid #0d1e2e", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 110px 110px 110px 120px 130px",
            padding: "7px 16px",
            borderBottom: "1px solid #0d1e2e",
            background: "#000000",
            gap: 8,
          }}>
            {["#", "SYMBOL", "5M SIGNAL", "1H TREND", "AVG CONF", "MARKET", "UPDATED"].map(h => (
              <span key={h} style={{ fontSize: 7, color: "#1e3a50", textTransform: "uppercase", letterSpacing: "0.15em" }}>{h}</span>
            ))}
          </div>

          {ranked.map((bd: any, i: number) => (
            <div key={bd.symbol ?? i} style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr 110px 110px 110px 120px 130px",
              padding: "11px 16px",
              borderBottom: "1px solid #060d14",
              background: i % 2 === 0 ? "#000000" : "#00040a",
              gap: 8,
              alignItems: "center",
            }}>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: i === 0 ? "#ffaa00" : i === 1 ? "#9FB3C8" : i === 2 ? "#8a6a30" : "#1e3a50",
              }}>
                {i + 1}
              </span>

              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#EAF2FF" }}>
                  {(bd.symbol ?? "—").replace("USD", "")}/USD
                </div>
                <div style={{ fontSize: 7, color: "#2a4050", marginTop: 2 }}>
                  {bd.mtfConfirmed ? "MTF CONFIRMED" : "MTF PENDING"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: decColor(bd.fast?.decision ?? "—") }}>
                  {bd.fast?.decision ?? "—"}
                </div>
                <div style={{ fontSize: 7, color: "#2a4050" }}>{bd.fast?.confidence?.toFixed(0) ?? "—"}%</div>
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: decColor(bd.slow?.decision ?? "—") }}>
                  {bd.slow?.decision ?? "—"}
                </div>
                <div style={{ fontSize: 7, color: "#2a4050" }}>{bd.slow?.confidence?.toFixed(0) ?? "—"}%</div>
              </div>

              <div style={{ fontSize: 20, fontWeight: 700, color: confColor(bd.avgConfidence ?? 0) }}>
                {(bd.avgConfidence ?? 0).toFixed(0)}%
              </div>

              <span style={{ fontSize: 10, color: mcColor(bd.marketCondition ?? ""), textTransform: "uppercase" }}>
                {bd.marketCondition ?? "—"}
              </span>

              <span style={{ fontSize: 8.5, color: "#2a4050" }}>
                {bd.lastUpdated ? new Date(bd.lastUpdated).toLocaleTimeString() : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "48px 32px", textAlign: "center", border: "1px solid #0d1e2e", borderRadius: 3 }}>
          <div style={{ fontSize: 11, color: "#2a4050" }}>
            {engine ? "No symbol data — engine starting…" : "CONNECTING TO ENGINE…"}
          </div>
        </div>
      )}
    </div>
  );
}
