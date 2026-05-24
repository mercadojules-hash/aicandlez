const FEATURES = [
  {
    icon: "🧠",
    title: "Multi-Signal AI Engine",
    description:
      "Fuses EMA crossovers, RSI divergence, MACD momentum, volume confirmation, and 1H trend alignment into a single confidence score.",
    tag: "Core AI",
    color: "#00e5ff",
  },
  {
    icon: "⚡",
    title: "Autonomous Trade Execution",
    description:
      "When confidence ≥ 55%, the AI places bracket orders automatically via your connected exchange — entry, stop-loss, and take-profit all in one atomic action.",
    tag: "Automation",
    color: "#00ff88",
  },
  {
    icon: "🛡️",
    title: "Institutional Risk Management",
    description:
      "Kill switch, daily loss limits, max position sizing, max trades per day, and confidence thresholds. Your capital stays protected.",
    tag: "Risk Control",
    color: "#9b5cf5",
  },
  {
    icon: "📊",
    title: "Multi-Asset Coverage",
    description:
      "BTC, ETH, SOL, and 200+ crypto assets across majors, alts, and emerging tokens — all analyzed concurrently by independent AI engines with cross-asset correlation tracking.",
    tag: "Markets",
    color: "#ffd200",
  },
  {
    icon: "🔬",
    title: "Walk-Forward Backtesting",
    description:
      "Validate strategies across historical data with out-of-sample windows, overfitting detection (A–F grade), and Sharpe ratio analysis.",
    tag: "Analytics",
    color: "#00e5ff",
  },
  {
    icon: "📱",
    title: "Mobile-First PWA",
    description:
      "Install AICandlez on your iPhone or Android as a full-screen PWA. OLED-optimized dark theme, real-time alerts, and instant access.",
    tag: "Accessibility",
    color: "#00ff88",
  },
  {
    icon: "🔔",
    title: "Real-Time Signal Alerts",
    description:
      "Instant push notifications for BUY/SELL signals, trade executions, risk events, and portfolio milestones — never miss a move.",
    tag: "Alerts",
    color: "#9b5cf5",
  },
  {
    icon: "📈",
    title: "Trade Journal & Scoring",
    description:
      "Every trade is automatically logged and scored 0–100 based on signal quality, execution, timing, and outcome. Learn from each decision.",
    tag: "Intelligence",
    color: "#ffd200",
  },
  {
    icon: "🔐",
    title: "Non-Custodial & Secure",
    description:
      "AICandlez never touches your funds. All credentials are encrypted with AES-256-GCM. Your broker holds your capital — we just trade it.",
    tag: "Security",
    color: "#00e5ff",
  },
];

export function Features() {
  return (
    <section
      id="features"
      style={{
        padding: "120px 24px",
        background: "linear-gradient(180deg, #000 0%, #050d18 50%, #000 100%)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            Platform Features
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
            Built for{" "}
            <span className="gradient-text">Serious Traders</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 500, margin: "0 auto" }}>
            Every feature engineered around one goal — helping you trade with
            the precision of an institutional desk.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 20,
          }}
        >
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="hover-lift"
              style={{
                background: "rgba(13,21,30,0.7)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                cursor: "default",
                transition: "border-color 0.3s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${feature.color}30`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div
                  style={{
                    fontSize: 28,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {feature.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "inline-flex",
                      padding: "2px 8px",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 4,
                      fontSize: 10,
                      color: feature.color,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      marginBottom: 8,
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    {feature.tag.toUpperCase()}
                  </div>
                  <h3
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#fff",
                      letterSpacing: "-0.01em",
                      lineHeight: 1.3,
                    }}
                  >
                    {feature.title}
                  </h3>
                </div>
              </div>
              <p style={{ color: "#8892a4", fontSize: 14, lineHeight: 1.65 }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
