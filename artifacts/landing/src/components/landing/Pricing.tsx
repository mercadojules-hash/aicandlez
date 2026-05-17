export function Pricing() {
  return (
    <section
      id="pricing"
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
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 400,
          background:
            "radial-gradient(ellipse, rgba(155,92,245,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            Pricing
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
            We Only Win{" "}
            <span style={{ color: "#00ff88" }}>When You Win</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 520, margin: "0 auto" }}>
            No monthly fees. No subscription traps. AICandlez charges a small
            performance fee — only on profitable trades.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              background: "rgba(13,21,30,0.8)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: 36,
            }}
          >
            <div style={{ fontSize: 13, color: "#8892a4", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 16 }}>
              PAPER TRADING
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>
                Free
              </span>
            </div>
            <p style={{ color: "#647385", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              Practice with $100,000 of simulated capital. Full AI engine, all signals, all features — risk-free.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
              {[
                "Full AI signal engine",
                "Simulated paper trading",
                "Walk-forward backtesting",
                "Trade journal & scoring",
                "All 9 assets — BTC, ETH, SOL +",
                "Real-time signal alerts",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#8892a4" }}>
                  <span style={{ color: "#00e5ff", fontSize: 16 }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
            <a href="/apex-trader-app/" className="btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
              Start Paper Trading
            </a>
          </div>

          <div
            style={{
              background: "rgba(13,21,30,0.95)",
              border: "1px solid rgba(0,255,136,0.25)",
              borderRadius: 20,
              padding: 36,
              position: "relative",
              overflow: "hidden",
            }}
            className="glow-green"
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: "linear-gradient(90deg, #00ff88, #00e5ff)",
              }}
            />
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                background: "rgba(0,255,136,0.12)",
                border: "1px solid rgba(0,255,136,0.25)",
                borderRadius: 100,
                fontSize: 11,
                color: "#00ff88",
                fontWeight: 700,
                letterSpacing: "0.1em",
                marginBottom: 16,
              }}
            >
              ✦ MOST FAIR
            </div>
            <div style={{ fontSize: 13, color: "#8892a4", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 16 }}>
              LIVE TRADING
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 72, fontWeight: 900, color: "#00ff88", letterSpacing: "-0.04em", lineHeight: 1 }}>
                3%
              </span>
            </div>
            <p style={{ color: "#647385", fontSize: 13, marginBottom: 4 }}>
              of profitable trade PnL only
            </p>
            <p style={{ color: "#8892a4", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              No monthly fee. No subscription. If a trade loses money, you pay nothing. We're aligned with your success.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
              {[
                "Everything in Paper Trading",
                "Real Alpaca live order execution",
                "Autonomous AI trading loop",
                "Bracket orders + stop-loss auto-set",
                "3% fee on profitable trades only",
                "Zero fees on losing trades",
                "Institutional risk controls",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#8892a4" }}>
                  <span style={{ color: "#00ff88", fontSize: 16 }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
            <a href="/apex-trader-app/" className="btn-primary" style={{ width: "100%", justifyContent: "center" }}>
              Start Live Trading
            </a>
          </div>
        </div>

        <div
          style={{
            background: "rgba(13,21,30,0.5)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: "24px 32px",
            display: "flex",
            flexWrap: "wrap",
            gap: 32,
            justifyContent: "space-around",
            alignItems: "center",
          }}
        >
          {[
            { icon: "💡", text: "No monthly subscription ever" },
            { icon: "📉", text: "Zero fee on losing trades" },
            { icon: "🤝", text: "We win when you win" },
            { icon: "🔒", text: "Cancel anytime, no lock-in" },
          ].map((item) => (
            <div
              key={item.text}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                color: "#8892a4",
              }}
            >
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              {item.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
