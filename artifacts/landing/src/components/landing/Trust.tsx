const TRUST_ITEMS = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "AES-256-GCM Encryption",
    description:
      "All API credentials are encrypted with AES-256-GCM and per-user PBKDF2 key derivation. Raw keys never stored in plaintext — ever.",
    color: "#00e5ff",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Non-Custodial",
    description:
      "AICandlez never holds, transfers, or touches your funds. Your capital lives in your own regulated crypto exchange account (Kraken, Binance, Coinbase) — we only execute trades.",
    color: "#00ff88",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    title: "No Withdrawal Access",
    description:
      "The platform never requests withdrawal permissions from any broker. Even if credentials were compromised, funds could not be moved.",
    color: "#9b5cf5",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Kill Switch & Risk Controls",
    description:
      "One-tap global kill switch halts all trading instantly. Daily loss limits, position caps, and confidence thresholds prevent runaway losses.",
    color: "#ffd200",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
    title: "Regulated Exchanges — Kraken · Binance · Coinbase",
    description:
      "All live trading is routed through your connected crypto exchange via read + trade API keys. Withdrawal permissions are never requested.",
    color: "#00e5ff",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    title: "Paper Mode by Default",
    description:
      "Every new account starts in paper trading mode. Switching to live trading requires explicit confirmation — no accidental live orders.",
    color: "#00ff88",
  },
];

export function Trust() {
  return (
    <section
      id="trust"
      style={{
        padding: "120px 24px",
        background: "linear-gradient(180deg, #000 0%, #050d18 100%)",
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
            "linear-gradient(90deg, transparent, rgba(155,92,245,0.4), rgba(0,229,255,0.4), transparent)",
        }}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            Security & Trust
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
            Institutional-Grade{" "}
            <span style={{ color: "#9b5cf5" }}>Security</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 520, margin: "0 auto" }}>
            Your capital and credentials are protected with the same standards
            used by professional trading desks.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 20,
            marginBottom: 64,
          }}
        >
          {TRUST_ITEMS.map((item) => (
            <div
              key={item.title}
              className="hover-lift"
              style={{
                background: "rgba(13,21,30,0.7)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: 28,
                display: "flex",
                gap: 20,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `rgba(${
                    item.color === "#00e5ff"
                      ? "0,229,255"
                      : item.color === "#00ff88"
                      ? "0,255,136"
                      : item.color === "#9b5cf5"
                      ? "155,92,245"
                      : "255,210,0"
                  }, 0.1)`,
                  border: `1px solid ${item.color}25`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: item.color,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#fff",
                    marginBottom: 8,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ color: "#8892a4", fontSize: 13, lineHeight: 1.65 }}>
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(13,21,30,0.9)",
            border: "1px solid rgba(0,229,255,0.12)",
            borderRadius: 20,
            padding: "40px 48px",
            display: "flex",
            flexWrap: "wrap",
            gap: 40,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginBottom: 10,
                color: "#fff",
              }}
            >
              Routed Through Your Own Regulated Exchange
            </h3>
            <p style={{ color: "#8892a4", fontSize: 15, maxWidth: 500, lineHeight: 1.6 }}>
              Every live order is placed on your connected Kraken, Binance, or
              Coinbase account via read + trade API keys — withdrawals never
              requested. AICandlez is the intelligent layer on top, never the
              custodian.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {[
              { label: "Kraken", sublabel: "Regulated" },
              { label: "Binance", sublabel: "Tier-1 Liquidity" },
              { label: "Coinbase", sublabel: "US-Listed" },
            ].map((badge) => (
              <div
                key={badge.label}
                style={{
                  background: "rgba(0,229,255,0.08)",
                  border: "1px solid rgba(0,229,255,0.15)",
                  borderRadius: 10,
                  padding: "12px 20px",
                  textAlign: "center",
                  minWidth: 90,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: "#00e5ff", letterSpacing: "-0.02em" }}>
                  {badge.label}
                </div>
                <div style={{ fontSize: 11, color: "#647385", marginTop: 2 }}>
                  {badge.sublabel}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
