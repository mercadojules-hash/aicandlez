export function AppPreview() {
  return (
    <section
      id="app-preview"
      style={{
        padding: "120px 24px",
        position: "relative",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          height: 600,
          background:
            "radial-gradient(ellipse, rgba(0,229,255,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            Live Dashboard
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
            Your Command Center
            <br />
            <span className="gradient-text-cyan-purple">for AI Trading</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 520, margin: "0 auto" }}>
            Every signal, position, risk metric, and AI decision — unified in one
            cinematic dashboard built for serious traders.
          </p>
        </div>

        <div
          style={{
            position: "relative",
            maxWidth: 1000,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              background: "rgba(13,21,30,0.95)",
              border: "1px solid rgba(0,229,255,0.15)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow:
                "0 0 0 1px rgba(0,229,255,0.05), 0 40px 80px rgba(0,0,0,0.8), 0 0 60px rgba(0,229,255,0.08)",
            }}
          >
            <div
              style={{
                background: "rgba(0,0,0,0.6)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                padding: "12px 20px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 6 }}>
                {["#ff5f57", "#ffbd2e", "#28c940"].map((c, i) => (
                  <div
                    key={i}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: c,
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: "#647385",
                  fontFamily: "var(--app-font-mono)",
                  marginLeft: 8,
                }}
              >
                app.aicandlez.com/command
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "220px 1fr",
                minHeight: 480,
              }}
            >
              <div
                style={{
                  background: "rgba(0,0,0,0.4)",
                  borderRight: "1px solid rgba(255,255,255,0.04)",
                  padding: "20px 0",
                }}
              >
                <div style={{ padding: "0 16px 16px", marginBottom: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: "rgba(0,229,255,0.1)",
                      borderRadius: 8,
                      border: "1px solid rgba(0,229,255,0.15)",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        background: "linear-gradient(135deg, #00e5ff, #9b5cf5)",
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 900,
                        color: "#000",
                      }}
                    >
                      AI
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>AICandlez</div>
                      <div style={{ fontSize: 10, color: "#00e5ff" }}>● LIVE</div>
                    </div>
                  </div>
                </div>

                {[
                  { icon: "⚡", label: "Command", active: true },
                  { icon: "📊", label: "Markets", active: false },
                  { icon: "🤖", label: "AI Signals", active: false },
                  { icon: "💼", label: "Portfolio", active: false },
                  { icon: "⚖️", label: "Risk", active: false },
                  { icon: "📈", label: "Backtest", active: false },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 20px",
                      fontSize: 13,
                      color: item.active ? "#00e5ff" : "#647385",
                      background: item.active ? "rgba(0,229,255,0.06)" : "transparent",
                      borderRight: item.active ? "2px solid #00e5ff" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span>{item.icon}</span>
                    <span style={{ fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Portfolio", value: "$103,241", change: "+3.24%", up: true },
                    { label: "Open Trades", value: "3", change: "BTC / ETH / SOL", up: true },
                    { label: "Today's PnL", value: "+$824", change: "+0.82%", up: true },
                    { label: "Win Rate", value: "78.4%", change: "Last 30 days", up: true },
                  ].map((card) => (
                    <div
                      key={card.label}
                      style={{
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 10,
                        padding: "14px 16px",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#647385", marginBottom: 6, fontWeight: 500 }}>
                        {card.label}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 2 }}>
                        {card.value}
                      </div>
                      <div style={{ fontSize: 11, color: card.up ? "#00ff88" : "#ff4466" }}>
                        {card.change}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
                  <div
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 10,
                      padding: 16,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#8892a4", marginBottom: 12, fontWeight: 600, letterSpacing: "0.06em" }}>
                      AI SIGNAL — BTC/USD
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <div
                        style={{
                          background: "rgba(0,255,136,0.12)",
                          border: "1px solid rgba(0,255,136,0.3)",
                          color: "#00ff88",
                          padding: "6px 14px",
                          borderRadius: 6,
                          fontSize: 14,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                        }}
                      >
                        BUY
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>87%</div>
                        <div style={{ fontSize: 10, color: "#647385" }}>CONFIDENCE</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { label: "RSI", value: "42.1", note: "Oversold" },
                        { label: "EMA Cross", value: "↑ Bullish", note: "9/21" },
                        { label: "Volume", value: "+34%", note: "Surge" },
                      ].map((ind) => (
                        <div
                          key={ind.label}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11,
                            color: "#8892a4",
                            padding: "4px 0",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <span>{ind.label}</span>
                          <span style={{ color: "#fff", fontWeight: 600 }}>
                            {ind.value} <span style={{ color: "#00e5ff" }}>{ind.note}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 10,
                      padding: 16,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#8892a4", marginBottom: 12, fontWeight: 600, letterSpacing: "0.06em" }}>
                      OPEN POSITIONS
                    </div>
                    {[
                      { symbol: "BTC/USD", side: "LONG", pnl: "+$521", pnlPct: "+0.62%", up: true },
                      { symbol: "ETH/USD", side: "LONG", pnl: "+$203", pnlPct: "+0.41%", up: true },
                      { symbol: "SOL/USD", side: "SHORT", pnl: "+$100", pnlPct: "+0.29%", up: true },
                    ].map((pos) => (
                      <div
                        key={pos.symbol}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{pos.symbol}</div>
                          <div style={{ fontSize: 11, color: "#647385" }}>{pos.side}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: pos.up ? "#00ff88" : "#ff4466" }}>
                            {pos.pnl}
                          </div>
                          <div style={{ fontSize: 11, color: pos.up ? "#00ff88" : "#ff4466" }}>
                            {pos.pnlPct}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              inset: -1,
              borderRadius: 17,
              background:
                "linear-gradient(135deg, rgba(0,229,255,0.15) 0%, transparent 50%, rgba(155,92,245,0.1) 100%)",
              pointerEvents: "none",
              zIndex: -1,
              filter: "blur(1px)",
            }}
          />
        </div>
      </div>
    </section>
  );
}
