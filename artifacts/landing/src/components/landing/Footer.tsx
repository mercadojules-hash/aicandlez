import { useState } from "react";
import { APP_HOME_URL } from "../../lib/appUrls";

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0d151e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          padding: 40,
          maxWidth: 700,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#8892a4",
            cursor: "pointer",
            padding: "6px 12px",
            fontSize: 13,
          }}
        >
          ✕ Close
        </button>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "#fff",
            marginBottom: 24,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        <div style={{ color: "#8892a4", fontSize: 14, lineHeight: 1.8 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Footer() {
  const [modal, setModal] = useState<string | null>(null);

  const legal = {
    "Privacy Policy": (
      <div>
        <p style={{ marginBottom: 16 }}>
          <strong style={{ color: "#fff" }}>Last updated:</strong> May 2025
        </p>
        <p style={{ marginBottom: 12 }}>
          AICandlez ("we", "our", "us") is committed to protecting your privacy. This policy describes how we collect,
          use, and protect information when you use our platform.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Information We Collect</h3>
        <p style={{ marginBottom: 12 }}>
          We collect account information (email, name) via Clerk authentication, trading preferences and settings,
          and anonymized performance metrics. We do NOT collect or store broker API keys in plaintext — all credentials
          are encrypted with AES-256-GCM before storage.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>How We Use Your Information</h3>
        <p style={{ marginBottom: 12 }}>
          Your information is used solely to operate your trading account, provide AI signals, execute trades on your
          behalf, and calculate performance fees. We do not sell, share, or market your personal data to third parties.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Data Security</h3>
        <p>
          All data is encrypted in transit (TLS 1.3) and at rest. Broker credentials use per-user AES-256-GCM
          encryption with PBKDF2 key derivation. We never log or expose raw API keys.
        </p>
      </div>
    ),
    "Terms of Service": (
      <div>
        <p style={{ marginBottom: 16 }}>
          <strong style={{ color: "#fff" }}>Last updated:</strong> May 2025
        </p>
        <p style={{ marginBottom: 12 }}>
          By using AICandlez, you agree to these Terms of Service. Please read them carefully.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Service Description</h3>
        <p style={{ marginBottom: 12 }}>
          AICandlez provides AI-powered trading signals and automated order execution via connected brokerage accounts.
          We are not a registered investment adviser, broker-dealer, or financial institution.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>User Responsibilities</h3>
        <p style={{ marginBottom: 12 }}>
          You are responsible for your own trading decisions. AICandlez provides tools and signals — not financial advice.
          You must comply with all applicable laws and your broker's terms of service.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Fees</h3>
        <p>
          A 3% performance fee is charged on profitable closed trades only. No fee is charged on losing trades.
          Fees are calculated per-trade and collected via Stripe.
        </p>
      </div>
    ),
    "Risk Disclosure": (
      <div>
        <p
          style={{
            background: "rgba(255,68,68,0.08)",
            border: "1px solid rgba(255,68,68,0.2)",
            borderRadius: 8,
            padding: 16,
            color: "#ff8888",
            marginBottom: 24,
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          ⚠️ <strong>Important Risk Warning:</strong> Trading cryptocurrency and securities involves significant risk of loss.
          Past performance is not indicative of future results. Never trade with money you cannot afford to lose.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Market Risk</h3>
        <p style={{ marginBottom: 12 }}>
          Cryptocurrency and equity markets are highly volatile. Prices can move dramatically in short periods due to
          market sentiment, regulatory news, macroeconomic events, and other factors outside our control.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>AI Signal Risk</h3>
        <p style={{ marginBottom: 12 }}>
          AI-generated signals are based on historical patterns and technical analysis. They do not guarantee future
          performance. Signals can be wrong. Autonomous trading amplifies both gains and losses.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Technology Risk</h3>
        <p>
          System outages, network failures, or bugs could prevent order execution, cause missed trades, or result in
          unintended orders. Always monitor your positions and have a manual exit plan.
        </p>
      </div>
    ),
    "AI Disclaimer": (
      <div>
        <p style={{ marginBottom: 16 }}>
          AICandlez uses artificial intelligence and machine learning algorithms to generate trading signals and execute
          orders autonomously.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Not Financial Advice</h3>
        <p style={{ marginBottom: 12 }}>
          AI signals and trading decisions generated by AICandlez do not constitute financial, investment, tax, or legal
          advice. We are a technology platform, not a registered investment adviser.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Algorithm Limitations</h3>
        <p style={{ marginBottom: 12 }}>
          Our AI models are trained on historical market data. They may not accurately predict future price movements,
          especially during black swan events, liquidity crises, or extreme market conditions not represented in
          training data.
        </p>
        <h3 style={{ color: "#00e5ff", marginBottom: 8, marginTop: 20 }}>Human Oversight Required</h3>
        <p>
          We strongly recommend regular monitoring of your account, periodic review of AI performance, and maintaining
          manual override capability at all times via the kill switch feature.
        </p>
      </div>
    ),
  };

  return (
    <>
      {modal && (
        <Modal
          title={modal}
          onClose={() => setModal(null)}
        >
          {legal[modal as keyof typeof legal]}
        </Modal>
      )}

      <footer
        style={{
          background: "#000",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "60px 24px 40px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              gap: 48,
              marginBottom: 60,
            }}
            className="footer-grid"
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    background: "linear-gradient(135deg, #00e5ff, #9b5cf5)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 900,
                    color: "#000",
                  }}
                >
                  AI
                </div>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
                  AICandlez
                </span>
              </div>
              <p style={{ color: "#647385", fontSize: 14, lineHeight: 1.7, maxWidth: 300, marginBottom: 24 }}>
                Institutional-grade AI trading for everyone. Trade smarter,
                not harder — powered by machine learning and real-time market signals.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                {/* Social channels are not live yet — render a non-interactive
                    placeholder strip (no href="#") instead of dead anchors that
                    would jump to the top of the page and confuse users. */}
                {["𝕏", "📱", "💬"].map((icon, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    title="Coming soon"
                    style={{
                      width: 36,
                      height: 36,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      color: "#647385",
                      opacity: 0.55,
                      cursor: "default",
                    }}
                  >
                    {icon}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.1em", marginBottom: 20 }}>
                PLATFORM
              </div>
              {[
                { label: "Launch App", href: APP_HOME_URL },
                { label: "Operator Console", href: "https://admintrade.aicandlez.com/" },
                { label: "Features", href: "#features" },
                { label: "How It Works", href: "#how-it-works" },
                { label: "Pricing", href: "#pricing" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  style={{
                    display: "block",
                    color: "#647385",
                    fontSize: 14,
                    textDecoration: "none",
                    marginBottom: 12,
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#8892a4"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#647385"; }}
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.1em", marginBottom: 20 }}>
                SECURITY
              </div>
              {["Trust & Safety", "Encryption", "Alpaca Broker", "Audit Logs"].map((item) => (
                <div
                  key={item}
                  style={{
                    color: "#647385",
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.1em", marginBottom: 20 }}>
                LEGAL
              </div>
              {Object.keys(legal).map((item) => (
                <button
                  key={item}
                  onClick={() => setModal(item)}
                  style={{
                    display: "block",
                    background: "none",
                    border: "none",
                    color: "#647385",
                    fontSize: 14,
                    marginBottom: 12,
                    cursor: "pointer",
                    padding: 0,
                    textAlign: "left",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#8892a4"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#647385"; }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.04)",
              paddingTop: 32,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <p style={{ color: "#647385", fontSize: 13, marginBottom: 8 }}>
                © 2025 AICandlez. All rights reserved.
              </p>
              <p style={{ color: "#647385", fontSize: 12, maxWidth: 700, lineHeight: 1.6 }}>
                AICandlez is not a registered investment adviser or broker-dealer. All trading involves significant
                risk of loss. AI signals do not constitute financial advice. Past performance is not indicative of
                future results. Trade only with capital you can afford to lose.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "#647385",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#00ff88",
                  display: "inline-block",
                }}
              />
              All systems operational
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .footer-grid {
              grid-template-columns: 1fr 1fr !important;
              gap: 32px !important;
            }
          }
          @media (max-width: 480px) {
            .footer-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </footer>
    </>
  );
}
