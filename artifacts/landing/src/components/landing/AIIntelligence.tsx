import { useEffect, useRef, useState } from "react";

const SIGNALS = [
  { symbol: "BTC/USD", action: "BUY", confidence: 87, rsi: 42.1, trend: "↑ Bullish", vol: "+34%", color: "#00ff88" },
  { symbol: "ETH/USD", action: "BUY", confidence: 79, rsi: 38.7, trend: "↑ Bullish", vol: "+21%", color: "#00ff88" },
  { symbol: "SOL/USD", action: "HOLD", confidence: 61, rsi: 51.2, trend: "→ Neutral", vol: "+8%", color: "#00e5ff" },
  { symbol: "NVDA", action: "BUY", confidence: 82, rsi: 44.3, trend: "↑ Bullish", vol: "+47%", color: "#00ff88" },
  { symbol: "AVAX/USD", action: "SELL", confidence: 73, rsi: 68.4, trend: "↓ Bearish", vol: "+15%", color: "#ff4466" },
  { symbol: "TSLA", action: "BUY", confidence: 68, rsi: 40.1, trend: "↑ Bullish", vol: "+29%", color: "#00ff88" },
];

function ScannerLine() {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: 1,
        background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.6), transparent)",
        animation: "scanner 3s linear infinite",
        zIndex: 2,
        pointerEvents: "none",
      }}
    />
  );
}

function RadarRing({ size, delay }: { size: number; delay: number }) {
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid rgba(0,229,255,0.15)",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        animation: `radarPulse 3s ${delay}s ease-out infinite`,
      }}
    />
  );
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div
      style={{
        height: 4,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 2,
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: color,
          borderRadius: 2,
          transition: "width 1.5s ease",
          boxShadow: `0 0 8px ${color}80`,
        }}
      />
    </div>
  );
}

function NeuralNode({ x, y, active }: { x: number; y: number; active?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        width: active ? 10 : 6,
        height: active ? 10 : 6,
        borderRadius: "50%",
        background: active ? "#00e5ff" : "rgba(0,229,255,0.3)",
        boxShadow: active ? "0 0 12px #00e5ff, 0 0 24px rgba(0,229,255,0.4)" : "none",
        animation: active ? "pulse-glow 2s ease-in-out infinite" : "none",
        zIndex: 2,
      }}
    />
  );
}

export function AIIntelligence() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const nodes = [
      { x: 80, y: 60 }, { x: 80, y: 120 }, { x: 80, y: 180 },
      { x: 200, y: 40 }, { x: 200, y: 90 }, { x: 200, y: 140 }, { x: 200, y: 190 }, { x: 200, y: 240 },
      { x: 320, y: 80 }, { x: 320, y: 150 }, { x: 320, y: 210 },
      { x: 440, y: 60 }, { x: 440, y: 140 }, { x: 440, y: 200 },
      { x: 560, y: 120 },
    ];

    const connections = [
      [0, 3], [0, 4], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [2, 6],
      [3, 8], [4, 8], [4, 9], [5, 9], [5, 10], [6, 9], [6, 10], [7, 10],
      [8, 11], [9, 11], [9, 12], [10, 12], [10, 13],
      [11, 14], [12, 14], [13, 14],
    ];

    connections.forEach(([a, b]) => {
      const na = nodes[a];
      const nb = nodes[b];
      if (!na || !nb) return;
      const active = (tick + a + b) % 5 === 0;
      ctx.strokeStyle = active
        ? "rgba(0,229,255,0.5)"
        : "rgba(0,229,255,0.08)";
      ctx.lineWidth = active ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
      ctx.stroke();
    });

    nodes.forEach((n, i) => {
      const active = (tick + i) % 4 === 0;
      ctx.beginPath();
      ctx.arc(n.x, n.y, active ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#00e5ff" : "rgba(0,229,255,0.25)";
      ctx.fill();
      if (active) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,229,255,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }, [tick]);

  const activeSignals = SIGNALS.filter((s) => s.action !== "HOLD").slice(0, 4);

  return (
    <section
      style={{
        padding: "120px 24px",
        background: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes scanner {
          0% { top: 0%; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes radarPulse {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes dataflow {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-40px); opacity: 0; }
        }
        .signal-row {
          animation: fadeSlideIn 0.5s ease both;
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          top: "30%",
          right: "5%",
          width: 500,
          height: 500,
          background: "radial-gradient(ellipse, rgba(155,92,245,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "20%",
          left: "5%",
          width: 400,
          height: 400,
          background: "radial-gradient(ellipse, rgba(0,255,136,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9b5cf5", display: "inline-block", animation: "pulse-glow 2s ease-in-out infinite" }} />
            AI Intelligence Engine
          </div>
          <h2
            style={{
              fontSize: "clamp(32px, 4vw, 56px)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: 20,
            }}
          >
            A Living Market{" "}
            <span style={{ color: "#9b5cf5" }}>Intelligence System</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 560, margin: "0 auto" }}>
            The AI scans hundreds of signals every minute — cross-referencing indicators,
            volume, sentiment, and multi-timeframe trends to surface high-confidence opportunities.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
          }}
          className="ai-grid"
        >
          <div
            style={{
              background: "rgba(13,21,30,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: 28,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 8, marginBottom: 20 }}>
              <ScannerLine />
            </div>
            <div style={{ fontSize: 12, color: "#9b5cf5", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 16, fontFamily: "var(--app-font-mono)" }}>
              NEURAL SIGNAL NETWORK
            </div>
            <canvas
              ref={canvasRef}
              width={640}
              height={280}
              style={{ width: "100%", height: "auto", display: "block", marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 24 }}>
              {[
                { label: "Active Nodes", value: "15", color: "#00e5ff" },
                { label: "Connections", value: "24", color: "#9b5cf5" },
                { label: "Inference/min", value: "847", color: "#00ff88" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: stat.color, letterSpacing: "-0.03em" }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: "#647385", marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "rgba(13,21,30,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: 28,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#00e5ff", fontWeight: 700, letterSpacing: "0.1em", fontFamily: "var(--app-font-mono)" }}>
                LIVE SIGNAL FEED
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#00ff88" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff88", display: "inline-block", animation: "pulse-glow 1.5s ease-in-out infinite" }} />
                SCANNING
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SIGNALS.map((sig, i) => (
                <div
                  key={sig.symbol}
                  className="signal-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: 10,
                    border: `1px solid ${i === 0 ? `${sig.color}25` : "rgba(255,255,255,0.04)"}`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  <div style={{ minWidth: 80, fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "var(--app-font-mono)" }}>
                    {sig.symbol}
                  </div>
                  <div
                    style={{
                      padding: "3px 9px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      background: `${sig.color}15`,
                      color: sig.color,
                      border: `1px solid ${sig.color}30`,
                      minWidth: 42,
                      textAlign: "center",
                    }}
                  >
                    {sig.action}
                  </div>
                  <ConfidenceBar value={sig.confidence} color={sig.color} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: sig.color, minWidth: 32, textAlign: "right", fontFamily: "var(--app-font-mono)" }}>
                    {sig.confidence}%
                  </div>
                  <div style={{ fontSize: 11, color: "#647385", minWidth: 60, fontFamily: "var(--app-font-mono)" }}>
                    {sig.trend}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 20,
                padding: 14,
                background: "rgba(0,229,255,0.06)",
                border: "1px solid rgba(0,229,255,0.12)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 16 }}>🤖</span>
              <div style={{ fontSize: 13, color: "#8892a4", lineHeight: 1.5 }}>
                <span style={{ color: "#00e5ff", fontWeight: 700 }}>AI Engine:</span>{" "}
                Strong bullish alignment across BTC, ETH and NVDA. Volume confirmation active.
                Placing bracket orders with 2% stop-loss and 4% take-profit targets.
              </div>
            </div>
          </div>

          <div
            style={{
              background: "rgba(13,21,30,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: 28,
            }}
          >
            <div style={{ fontSize: 12, color: "#ffd200", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 20, fontFamily: "var(--app-font-mono)" }}>
              RISK INTELLIGENCE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "Portfolio Exposure", value: "23.4%", max: 40, color: "#00ff88", note: "Safe" },
                { label: "Daily PnL Risk", value: "$824", max: 2000, color: "#00e5ff", note: "Within limits" },
                { label: "Open Positions", value: "3 / 5", max: 5, color: "#9b5cf5", note: "60% capacity" },
                { label: "Volatility Score", value: "42", max: 100, color: "#ffd200", note: "Moderate" },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "#8892a4" }}>{item.label}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "var(--app-font-mono)" }}>{item.value}</span>
                      <span style={{ fontSize: 11, color: item.color, background: `${item.color}15`, padding: "2px 7px", borderRadius: 4 }}>{item.note}</span>
                    </div>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${typeof item.max === "number" ? Math.min(100, (parseFloat(item.value) / item.max) * 100) : 60}%`,
                        background: item.color,
                        borderRadius: 3,
                        boxShadow: `0 0 6px ${item.color}60`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 20,
                display: "flex",
                gap: 10,
                padding: "12px 14px",
                background: "rgba(0,255,136,0.06)",
                border: "1px solid rgba(0,255,136,0.15)",
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 18 }}>🛡️</span>
              <div style={{ fontSize: 12, color: "#8892a4" }}>
                <span style={{ color: "#00ff88", fontWeight: 700 }}>Kill switch armed.</span>{" "}
                All risk thresholds within bounds. Auto-mode active.
              </div>
            </div>
          </div>

          <div
            style={{
              background: "rgba(13,21,30,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: 28,
            }}
          >
            <div style={{ fontSize: 12, color: "#00ff88", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 20, fontFamily: "var(--app-font-mono)" }}>
              AUTONOMOUS EXECUTION LOG
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { time: "01:13:22", event: "BUY BTC/USD", detail: "Conf 87% — $2,480 position opened", color: "#00ff88", icon: "▲" },
                { time: "01:11:54", event: "STOP-LOSS SET", detail: "BTC/USD @ $92,841 (-2%)", color: "#ffd200", icon: "⚑" },
                { time: "01:09:31", event: "BUY ETH/USD", detail: "Conf 79% — $1,240 position opened", color: "#00ff88", icon: "▲" },
                { time: "01:07:18", event: "CLOSE SOL/USD", detail: "+$204 profit — TP hit +4.2%", color: "#00e5ff", icon: "✓" },
                { time: "01:04:55", event: "SIGNAL REJECTED", detail: "AVAX below 55% threshold — SKIP", color: "#647385", icon: "✕" },
                { time: "01:02:12", event: "BUY NVDA", detail: "Conf 82% — $1,860 position opened", color: "#00ff88", icon: "▲" },
              ].map((log) => (
                <div
                  key={log.time}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#647385", fontFamily: "var(--app-font-mono)", minWidth: 56, paddingTop: 1 }}>
                    {log.time}
                  </span>
                  <span style={{ color: log.color, fontSize: 12, paddingTop: 1 }}>{log.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: log.color, marginBottom: 2 }}>{log.event}</div>
                    <div style={{ fontSize: 11, color: "#647385" }}>{log.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .ai-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
