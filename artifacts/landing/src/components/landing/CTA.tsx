import { APP_HOME_URL } from "../../lib/appUrls";

export function CTA() {
  return (
    <section
      style={{
        padding: "120px 24px",
        background: "#000",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,229,255,0.08) 0%, rgba(155,92,245,0.05) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div className="grid-bg" style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "rgba(0,255,136,0.08)",
            border: "1px solid rgba(0,255,136,0.2)",
            borderRadius: 100,
            fontSize: 13,
            color: "#00ff88",
            fontWeight: 600,
            marginBottom: 32,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#00ff88",
              display: "inline-block",
              animation: "pulse-glow 2s ease-in-out infinite",
            }}
          />
          AI is live — trading now
        </div>

        <h2
          style={{
            fontSize: "clamp(36px, 5vw, 72px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            marginBottom: 24,
          }}
        >
          Start Trading with AI{" "}
          <br />
          <span className="gradient-text">in Under 60 Seconds</span>
        </h2>

        <p
          style={{
            color: "#8892a4",
            fontSize: "clamp(16px, 2vw, 19px)",
            lineHeight: 1.7,
            marginBottom: 48,
            maxWidth: 560,
            margin: "0 auto 48px",
          }}
        >
          No credit card. No setup fee. Start with simulated capital and
          switch to live trading whenever you're ready.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "center",
          }}
        >
          <a
            href={APP_HOME_URL}
            className="btn-primary"
            style={{ fontSize: 17, padding: "16px 36px" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Launch AICandlez — Free
          </a>
          <a
            href={APP_HOME_URL}
            className="btn-ghost"
            style={{ fontSize: 17, padding: "16px 36px" }}
          >
            Sign In
          </a>
        </div>

        <p
          style={{
            marginTop: 24,
            fontSize: 13,
            color: "#647385",
          }}
        >
          Paper trading is 100% free forever · Live trading: 3% fee on profits only
        </p>
      </div>
    </section>
  );
}
