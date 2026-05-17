const LAYERS = [
  {
    id: "clients",
    label: "CLIENT LAYER",
    color: "#00e5ff",
    nodes: [
      { icon: "📱", name: "Mobile PWA", sub: "apex-trader-app" },
      { icon: "🖥️", name: "Desktop Terminal", sub: "app.aicandlez.com" },
      { icon: "🌐", name: "Marketing Site", sub: "aicandlez.com" },
    ],
  },
  {
    id: "gateway",
    label: "API GATEWAY",
    color: "#9b5cf5",
    nodes: [
      { icon: "⚡", name: "REST API", sub: "/api/*" },
      { icon: "🔌", name: "WebSocket", sub: "/ws" },
      { icon: "🔑", name: "Clerk Auth", sub: "JWT / Session" },
    ],
  },
  {
    id: "engine",
    label: "AI ENGINE LAYER",
    color: "#00ff88",
    nodes: [
      { icon: "🧠", name: "Signal Engine", sub: "EMA · RSI · MACD" },
      { icon: "⚖️", name: "Risk Engine", sub: "Kill switch · Limits" },
      { icon: "🔔", name: "Event Bus", sub: "Notifications · Alerts" },
    ],
  },
  {
    id: "infra",
    label: "INFRASTRUCTURE",
    color: "#ffd200",
    nodes: [
      { icon: "🏦", name: "Alpaca Broker", sub: "Paper + Live orders" },
      { icon: "🗄️", name: "PostgreSQL", sub: "User data · Trades" },
      { icon: "📊", name: "Market Data", sub: "Crypto · Equities" },
    ],
  },
];

export function EcosystemArch() {
  return (
    <section
      id="ecosystem"
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
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700,
          height: 500,
          background:
            "radial-gradient(ellipse, rgba(0,229,255,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            Full Ecosystem
          </div>
          <h2
            style={{
              fontSize: "clamp(32px, 4vw, 52px)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: 20,
            }}
          >
            One AI Brain.{" "}
            <span className="gradient-text">Every Platform.</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 540, margin: "0 auto" }}>
            AICandlez is built as a unified ecosystem — the same AI engine, broker infrastructure,
            and auth layer powering mobile, web, and desktop simultaneously.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {LAYERS.map((layer, li) => (
            <div
              key={layer.id}
              style={{
                background: "rgba(13,21,30,0.7)",
                border: `1px solid ${layer.color}18`,
                borderRadius: 14,
                padding: "20px 24px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: 3,
                  background: layer.color,
                  opacity: 0.6,
                  borderRadius: "14px 0 0 14px",
                }}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: 24,
                  alignItems: "center",
                }}
              >
                <div style={{ paddingLeft: 12 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: layer.color,
                      letterSpacing: "0.12em",
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    {layer.label}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {layer.nodes.map((node) => (
                    <div
                      key={node.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 16px",
                        background: "rgba(0,0,0,0.3)",
                        border: `1px solid rgba(255,255,255,0.06)`,
                        borderRadius: 10,
                        flex: "1 1 auto",
                        minWidth: 160,
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{node.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{node.name}</div>
                        <div style={{ fontSize: 11, color: "#647385", fontFamily: "var(--app-font-mono)" }}>{node.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {li < LAYERS.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -9,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 1,
                    height: 18,
                    background: `linear-gradient(${layer.color}, ${LAYERS[li + 1].color})`,
                    zIndex: 2,
                    opacity: 0.4,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 48,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {[
            {
              icon: "🔔",
              title: "Push Notifications",
              desc: "Real-time trade alerts via Expo EAS (mobile) and Web Push API (desktop) — signal fires, trade executions, stop-loss triggers.",
              color: "#00e5ff",
              tag: "In Development",
            },
            {
              icon: "🖥️",
              title: "Desktop Terminal",
              desc: "app.aicandlez.com — full power-user dashboard with multi-monitor support, advanced charting, order book, and custom watchlists.",
              color: "#9b5cf5",
              tag: "Coming Soon",
            },
            {
              icon: "⚡",
              title: "WebSocket Streaming",
              desc: "Live candle data, real-time positions, and AI signal streaming via shared WebSocket — zero-latency across all clients.",
              color: "#00ff88",
              tag: "Live",
            },
            {
              icon: "🔑",
              title: "Shared Auth Layer",
              desc: "One Clerk account unlocks mobile app, desktop terminal, and API — httpOnly cookie for web, Bearer token for mobile.",
              color: "#ffd200",
              tag: "Live",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="hover-lift"
              style={{
                background: "rgba(13,21,30,0.7)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 24,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: 10,
                    color: item.tag === "Live" ? "#00ff88" : item.color,
                    background: item.tag === "Live" ? "rgba(0,255,136,0.08)" : `${item.color}10`,
                    padding: "2px 8px",
                    borderRadius: 100,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    border: `1px solid ${item.tag === "Live" ? "rgba(0,255,136,0.2)" : `${item.color}25`}`,
                  }}
                >
                  {item.tag}
                </span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8, letterSpacing: "-0.01em" }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 13, color: "#8892a4", lineHeight: 1.6 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
