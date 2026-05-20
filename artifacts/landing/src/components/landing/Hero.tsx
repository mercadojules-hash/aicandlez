import { useEffect, useRef, useState } from "react";

const TICKER_ITEMS = [
  { symbol: "BTC/USD", price: "94,312.40", change: "+2.84%", up: true },
  { symbol: "ETH/USD", price: "3,847.22", change: "+1.92%", up: true },
  { symbol: "SOL/USD", price: "218.67", change: "+4.11%", up: true },
  { symbol: "AAPL", price: "227.83", change: "-0.32%", up: false },
  { symbol: "NVDA", price: "942.50", change: "+3.17%", up: true },
  { symbol: "TSLA", price: "411.22", change: "+5.82%", up: true },
  { symbol: "SPY", price: "558.14", change: "+0.44%", up: true },
  { symbol: "AVAX/USD", price: "42.18", change: "-1.28%", up: false },
  { symbol: "LINK/USD", price: "18.42", change: "+2.03%", up: true },
  { symbol: "QQQ", price: "487.90", change: "+0.61%", up: true },
];

function AnimatedGrid() {
  return (
    <div
      style={{
        position: "absolute",
        inset: "-60px",
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          animation: "grid-drift 20s linear infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, #000 100%)",
        }}
      />
    </div>
  );
}

function VolumetricOrbs() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: "8%",
          left: "52%",
          width: 700,
          height: 500,
          background:
            "radial-gradient(ellipse, rgba(0,229,255,0.13) 0%, rgba(0,229,255,0.04) 40%, transparent 70%)",
          filter: "blur(1px)",
          zIndex: 0,
          pointerEvents: "none",
          animation: "orb-drift 14s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "20%",
          width: 500,
          height: 400,
          background:
            "radial-gradient(ellipse, rgba(155,92,245,0.09) 0%, transparent 70%)",
          filter: "blur(2px)",
          zIndex: 0,
          pointerEvents: "none",
          animation: "orb-drift 18s ease-in-out infinite reverse",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "20%",
          right: "10%",
          width: 350,
          height: 280,
          background:
            "radial-gradient(ellipse, rgba(0,255,136,0.07) 0%, transparent 70%)",
          filter: "blur(1px)",
          zIndex: 0,
          pointerEvents: "none",
          animation: "orb-drift 22s ease-in-out infinite",
          animationDelay: "-7s",
        }}
      />
    </>
  );
}

function DataStreams() {
  const columns = [8, 18, 32, 47, 63, 76, 88];
  const chars = "01▲▼◆⬡⬢◉⬛⬜∑∆Ω∞≈≠≤≥";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.35,
      }}
    >
      {columns.map((left, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${left}%`,
            top: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: 10,
            fontFamily: "var(--app-font-mono)",
            color: i % 3 === 0 ? "#00e5ff" : i % 3 === 1 ? "#9b5cf5" : "#00ff88",
            lineHeight: 1,
            animation: `data-stream ${12 + i * 2.3}s ${i * -1.7}s linear infinite`,
          }}
        >
          {Array.from({ length: 20 }, (_, j) => (
            <span key={j} style={{ opacity: 1 - j * 0.05 }}>
              {chars[(i * 7 + j * 3) % chars.length]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function RadarPulse() {
  return (
    <div
      style={{
        position: "absolute",
        top: "15%",
        right: "8%",
        width: 120,
        height: 120,
        zIndex: 1,
        pointerEvents: "none",
        opacity: 0.5,
      }}
    >
      {[1, 0.7, 0.4].map((scale, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px solid rgba(0,229,255,0.4)",
            transform: `scale(${scale})`,
            top: "50%",
            left: "50%",
            width: 120,
            height: 120,
            marginLeft: -60,
            marginTop: -60,
            animation: `radarPing 2.5s ${i * 0.8}s ease-out infinite`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          top: "50%",
          left: "50%",
          width: 8,
          height: 8,
          marginLeft: -4,
          marginTop: -4,
          borderRadius: "50%",
          background: "#00e5ff",
          boxShadow: "0 0 12px #00e5ff, 0 0 24px rgba(0,229,255,0.5)",
          animation: "pulse-glow 2s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes radarPing {
          0% { transform: scale(0.1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ScannerPulse() {
  return (
    <div
      style={{
        position: "absolute",
        top: "55%",
        left: "5%",
        width: 80,
        height: 80,
        zIndex: 1,
        pointerEvents: "none",
        opacity: 0.4,
      }}
    >
      {[1, 0.7, 0.5].map((scale, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 80,
            height: 80,
            marginLeft: -40,
            marginTop: -40,
            borderRadius: "50%",
            border: "1px solid rgba(0,255,136,0.4)",
            animation: `radarPing 3s ${i * 1}s ease-out infinite`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          borderRadius: "50%",
          background: "#00ff88",
          boxShadow: "0 0 10px #00ff88, 0 0 20px rgba(0,255,136,0.5)",
          animation: "pulse-glow 2.5s ease-in-out infinite",
          animationDelay: "0.5s",
        }}
      />
    </div>
  );
}

function CandleChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const pricesRef = useRef<number[]>([]);

  useEffect(() => {
    const initial = [100];
    for (let i = 1; i < 50; i++) {
      initial.push(initial[i - 1] + (Math.random() - 0.45) * 8);
    }
    pricesRef.current = initial;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const prices = pricesRef.current;
      const last = prices[prices.length - 1];
      prices.push(last + (Math.random() - 0.46) * 7);
      if (prices.length > 60) prices.shift();
      setTick((t) => t + 1);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const prices = pricesRef.current;
    if (!prices.length) return;

    const W = canvas.width;
    const H = canvas.height;
    const candles = prices.length;
    const candleW = Math.max(4, Math.floor(W / candles) - 2);

    const minP = Math.min(...prices) - 8;
    const maxP = Math.max(...prices) + 8;
    const range = maxP - minP;
    const toY = (v: number) => H - ((v - minP) / range) * H;

    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < candles; i++) {
      const open = prices[i];
      const close = open + (Math.random() - 0.48) * 5;
      const high = Math.max(open, close) + Math.random() * 3;
      const low = Math.min(open, close) - Math.random() * 3;
      const x = i * (candleW + 2) + 1;
      const up = close >= open;
      const alpha = 0.5 + (i / candles) * 0.5;
      const color = up ? `rgba(0,255,136,${alpha})` : `rgba(255,68,102,${alpha})`;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + candleW / 2, toY(high));
      ctx.lineTo(x + candleW / 2, toY(low));
      ctx.stroke();

      ctx.fillStyle = color;
      const yTop = toY(Math.max(open, close));
      const yBot = toY(Math.min(open, close));
      ctx.fillRect(x, yTop, candleW, Math.max(1, yBot - yTop));
    }

    // EMA line
    const ema: number[] = [];
    const k = 2 / (9 + 1);
    for (let i = 0; i < prices.length; i++) {
      ema.push(i === 0 ? prices[0] : prices[i] * k + ema[i - 1] * (1 - k));
    }
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,229,255,0.6)";
    ctx.lineWidth = 1.5;
    ema.forEach((v, i) => {
      const x = i * (candleW + 2) + 1 + candleW / 2;
      if (i === 0) ctx.moveTo(x, toY(v));
      else ctx.lineTo(x, toY(v));
    });
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#000");
    grad.addColorStop(0.06, "transparent");
    grad.addColorStop(0.94, "transparent");
    grad.addColorStop(1, "#000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const vGrad = ctx.createLinearGradient(0, 0, 0, H);
    vGrad.addColorStop(0, "transparent");
    vGrad.addColorStop(0.85, "transparent");
    vGrad.addColorStop(1, "#000");
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, W, H);
  }, [tick]);

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={220}
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
        background: "#000",
      }}
    >
      <AnimatedGrid />
      <VolumetricOrbs />
      <DataStreams />
      <RadarPulse />
      <ScannerPulse />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
          padding: "120px 24px 40px",
          textAlign: "center",
        }}
      >
        <div
          className="section-label animate-flicker"
          style={{ marginBottom: 32 }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#00ff88",
              display: "inline-block",
              animation: "pulse-glow 1.8s ease-in-out infinite",
            }}
          />
          AI-Powered Crypto & Equity Trading
        </div>

        <h1
          style={{
            fontSize: "clamp(44px, 7.5vw, 96px)",
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: "-0.04em",
            maxWidth: 960,
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
            maxWidth: 580,
            lineHeight: 1.7,
            marginBottom: 48,
          }}
        >
          AICandlez is an institutional-grade AI trading platform that
          analyzes markets 24/7, generates high-confidence signals, and
          executes trades autonomously — so you never miss an opportunity.
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
          <a href="https://app.aicandlez.com/portal" className="btn-primary">
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
                  fontSize: "clamp(28px, 4vw, 44px)",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  color: stat.color,
                  lineHeight: 1,
                  marginBottom: 4,
                  textShadow: `0 0 20px ${stat.color}60`,
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

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          {[
            { icon: "🔒", text: "Non-custodial" },
            { icon: "🛡️", text: "Alpaca broker" },
            { icon: "📱", text: "iOS & Android PWA" },
            { icon: "⚡", text: "Sub-second execution" },
          ].map((item) => (
            <span
              key={item.text}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 100,
                fontSize: 12,
                color: "#8892a4",
              }}
            >
              {item.icon} {item.text}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          background: "rgba(0,0,0,0.7)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          height: 220,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,229,255,0.03) 0%, transparent 30%, transparent 70%, rgba(155,92,245,0.03) 100%)",
          }}
        />
        <CandleChart />
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <span style={{ fontSize: 10, color: "#647385", letterSpacing: "0.1em", fontFamily: "var(--app-font-mono)", whiteSpace: "nowrap" }}>
            BTC/USD · 5M · LIVE
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: "#647385", fontFamily: "var(--app-font-mono)" }}>
            <span style={{ color: "#00e5ff" }}>— EMA9</span>
            <span style={{ color: "#00ff88" }}>▲ Bullish</span>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          overflow: "hidden",
          background: "rgba(0,0,0,0.85)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            animation: "ticker 32s linear infinite",
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
                fontSize: 12,
                fontFamily: "var(--app-font-mono)",
              }}
            >
              <span style={{ color: "#647385" }}>{item.symbol}</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{item.price}</span>
              <span style={{ color: item.up ? "#00ff88" : "#ff4466" }}>{item.change}</span>
              <span style={{ color: "rgba(255,255,255,0.08)" }}>·</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
