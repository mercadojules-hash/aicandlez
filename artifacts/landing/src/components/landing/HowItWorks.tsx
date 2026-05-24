const STEPS = [
  {
    number: "01",
    title: "Connect Your Exchange",
    description:
      "Link your Kraken, Binance, or Coinbase account (paper or live) in seconds. AICandlez never holds your funds and withdrawal permissions are never requested — your exchange handles custody.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    color: "#00e5ff",
    detail: "Kraken · Binance · Coinbase — read + trade only",
  },
  {
    number: "02",
    title: "AI Analyzes Markets",
    description:
      "Our multi-timeframe AI engine scans BTC, ETH, SOL, and 200+ crypto assets every minute. It cross-references RSI, EMA, MACD, volume, and sentiment to generate high-confidence signals.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
    color: "#9b5cf5",
    detail: "EMA · RSI · MACD · Volume · Sentiment fusion",
  },
  {
    number: "03",
    title: "AI Executes Trades",
    description:
      "When confidence exceeds your threshold (default: 55%), AICandlez autonomously places bracket orders with stop-loss and take-profit. Zero emotion. Full discipline.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
    color: "#00ff88",
    detail: "Bracket orders · Stop-loss · Take-profit auto-set",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      style={{
        padding: "120px 24px",
        background: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(0,229,255,0.3), rgba(155,92,245,0.3), transparent)",
        }}
      />

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            How It Works
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
            From Signal to Trade{" "}
            <span style={{ color: "#00e5ff" }}>in Seconds</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 500, margin: "0 auto" }}>
            A fully autonomous trading loop — no manual intervention required once configured.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className="hover-lift"
              style={{
                background: "rgba(13,21,30,0.8)",
                border: `1px solid rgba(255,255,255,0.07)`,
                borderRadius: 16,
                padding: 32,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: step.color,
                  opacity: 0.6,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -40,
                  right: -20,
                  fontSize: 120,
                  fontWeight: 900,
                  color: step.color,
                  opacity: 0.04,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                  userSelect: "none",
                }}
              >
                {step.number}
              </div>

              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: `rgba(${
                    step.color === "#00e5ff"
                      ? "0,229,255"
                      : step.color === "#9b5cf5"
                      ? "155,92,245"
                      : "0,255,136"
                  }, 0.1)`,
                  border: `1px solid ${step.color}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: step.color,
                  marginBottom: 20,
                }}
              >
                {step.icon}
              </div>

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: step.color,
                  letterSpacing: "0.12em",
                  marginBottom: 10,
                  fontFamily: "var(--app-font-mono)",
                }}
              >
                STEP {step.number}
              </div>

              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  marginBottom: 14,
                  color: "#fff",
                }}
              >
                {step.title}
              </h3>

              <p style={{ color: "#8892a4", fontSize: 15, lineHeight: 1.7, marginBottom: 20 }}>
                {step.description}
              </p>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: `rgba(${
                    step.color === "#00e5ff"
                      ? "0,229,255"
                      : step.color === "#9b5cf5"
                      ? "155,92,245"
                      : "0,255,136"
                  }, 0.08)`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: step.color,
                  fontFamily: "var(--app-font-mono)",
                  fontWeight: 500,
                }}
              >
                <span>▸</span>
                {step.detail}
              </div>

              {i < STEPS.length - 1 && (
                <div
                  style={{
                    display: "none",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
