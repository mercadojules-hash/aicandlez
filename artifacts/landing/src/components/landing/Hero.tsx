import { useEffect, useRef } from "react";

const TICKER_ITEMS = [
  { symbol: "BTC/USD", price: "94,312.40", change: "+2.84%", up: true },
  { symbol: "ETH/USD", price: "3,847.22", change: "+1.92%", up: true },
  { symbol: "SOL/USD", price: "218.67", change: "+4.11%", up: true },
  { symbol: "AAPL", price: "227.83", change: "-0.32%", up: false },
  { symbol: "NVDA", price: "942.50", change: "+3.17%", up: true },
  { symbol: "TSLA", price: "411.22", change: "+5.82%", up: true },
  { symbol: "SPY", price: "558.14", change: "+0.44%", up: true },
  { symbol: "AVAX/USD", price: "42.18", change: "-1.28%", up: false },
];

function CandleChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const candles = 40;
    const candleW = Math.floor(W / candles) - 2;

    let prices = [100];
    for (let i = 1; i < candles; i++) {
      prices.push(prices[i - 1] + (Math.random() - 0.45) * 8);
    }

    const minP = Math.min(...prices) - 10;
    const maxP = Math.max(...prices) + 10;
    const range = maxP - minP;

    const toY = (v: number) => H - ((v - minP) / range) * H;

    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < candles; i++) {
      const open = prices[i];
      const close = open + (Math.random() - 0.48) * 6;
      const high = Math.max(open, close) + Math.random() * 4;
      const low = Math.min(open, close) - Math.random() * 4;

      const x = i * (candleW + 2) + 1;
      const up = close >= open;
      const color = up ? "#00ff88" : "#ff4466";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + candleW / 2, toY(high));
      ctx.lineTo(x + candleW / 2, toY(low));
      ctx.stroke();

      ctx.fillStyle = up ? "rgba(0,255,136,0.8)" : "rgba(255,68,102,0.8)";
      const yTop = toY(Math.max(open, close));
      const yBot = toY(Math.min(open, close));
      const bodyH = Math.max(1, yBot - yTop);
      ctx.fillRect(x, yTop, candleW, bodyH);
    }

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#000");
    grad.addColorStop(0.08, "transparent");
    grad.addColorStop(0.92, "transparent");
    grad.addColorStop(1, "#000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

export function Hero() {
  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="grid-bg"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 900,
          height: 500,
          background:
            "radial-gradient(ellipse, rgba(0,229,255,0.12) 0%, rgba(155,92,245,0.06) 40%, transparent 70%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "15%",
          right: "5%",
          width: 400,
          height: 400,
          background:
            "radial-gradient(ellipse, rgba(0,255,136,0.08) 0%, transparent 70%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
          paddingTop: 120,
          paddingBottom: 40,
          padding: "120px 24px 40px",
          textAlign: "center",
        }}
      >
        <div
          className="section-label"
          style={{ marginBottom: 32 }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#00ff88",
              display: "inline-block",
              animation: "pulse-glow 2s ease-in-out infinite",
            }}
          />
          AI-Powered Crypto & Equity Trading
        </div>

        <h1
          style={{
            fontSize: "clamp(42px, 7vw, 88px)",
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: "-0.04em",
            maxWidth: 900,
            marginBottom: 24,
          }}
        >
          Trade Smarter.{" "}
          <span className="gradient-text">Not Harder.</span>
        </h1>

        <p
          style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            color: "#8892a4",
            maxWidth: 600,
            lineHeight: 1.7,
            marginBottom: 48,
          }}
        >
          AICandlez is an institutional-grade AI trading platform that analyzes
          markets 24/7, generates high-confidence signals, and executes trades
          autonomously — so you never miss an opportunity.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "center",
            marginBottom: 64,
          }}
        >
          <a href="/apex-trader-app/" className="btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Launch App — Free
          </a>
          <a href="#how-it-works" className="btn-ghost">
            See How It Works
          </a>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 40,
            justifyContent: "center",
            marginBottom: 64,
          }}
        >
          {[
            { value: "94.7%", label: "Signal Accuracy", color: "#00ff88" },
            { value: "$2.4B+", label: "Volume Analyzed", color: "#00e5ff" },
            { value: "3%", label: "Fee on Profits Only", color: "#9b5cf5" },
            { value: "24/7", label: "AI Monitoring", color: "#ffd200" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  color: stat.color,
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: 13, color: "#647385", fontWeight: 500 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(0,0,0,0.6)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          height: 200,
          overflow: "hidden",
        }}
      >
        <CandleChart />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 11,
            color: "#647385",
            letterSpacing: "0.08em",
            fontFamily: "var(--app-font-mono)",
            whiteSpace: "nowrap",
          }}
        >
          LIVE MARKET VISUALIZATION — BTC/USD 5M
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          overflow: "hidden",
          background: "#000",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            animation: "ticker 30s linear infinite",
            padding: "12px 0",
          }}
        >
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginRight: 48,
                fontSize: 13,
                fontFamily: "var(--app-font-mono)",
              }}
            >
              <span style={{ color: "#8892a4" }}>{item.symbol}</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{item.price}</span>
              <span style={{ color: item.up ? "#00ff88" : "#ff4466" }}>
                {item.change}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
