import { useLocation } from "wouter";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const W    = "#ffffff";
const GR   = "#8892a4";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";

// ── Legal content ────────────────────────────────────────────────────────────────
type Section = { heading: string; body: string };
type Doc     = { title: string; updated: string; sections: Section[] };

const DOCS: Record<string, Doc> = {
  terms: {
    title:   "Terms & Conditions",
    updated: "January 1, 2026",
    sections: [
      {
        heading: "1. Acceptance of Terms",
        body: "By accessing or using AICandlez, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use the service. We reserve the right to update these terms at any time with reasonable notice.",
      },
      {
        heading: "2. Account Registration",
        body: "You must be at least 18 years of age to create an account. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. You must provide accurate and complete information during registration.",
      },
      {
        heading: "3. Paper Trading vs. Live Trading",
        body: "Paper trading is a simulated environment using virtual funds with no real financial exposure. Live trading involves real funds on connected exchanges and carries financial risk. Live trading features require an active paid subscription. You acknowledge that live trading can result in losses.",
      },
      {
        heading: "4. API Key Responsibility",
        body: "You are solely responsible for the API keys you provide. By connecting an exchange, you authorize AICandlez to execute trades on your behalf according to your configured settings. We request only read and trade permissions — withdrawal permissions are never requested or used.",
      },
      {
        heading: "5. Prohibited Activities",
        body: "You may not use AICandlez for market manipulation, money laundering, or any activity that violates applicable laws or exchange terms of service. You may not attempt to reverse-engineer or exploit the platform's AI systems.",
      },
      {
        heading: "6. Service Availability",
        body: "We strive for continuous availability but do not guarantee uninterrupted service. Scheduled maintenance, technical failures, or exchange outages may temporarily affect functionality. We are not liable for losses resulting from service interruptions.",
      },
      {
        heading: "7. Limitation of Liability",
        body: "To the maximum extent permitted by law, AICandlez and its affiliates are not liable for any indirect, incidental, or consequential damages arising from your use of the service, including trading losses, loss of data, or business interruption.",
      },
      {
        heading: "8. Termination",
        body: "We reserve the right to suspend or terminate accounts that violate these terms. You may cancel your account at any time from the profile settings. Outstanding subscription fees are non-refundable except where required by applicable law.",
      },
    ],
  },

  privacy: {
    title:   "Privacy Policy",
    updated: "January 1, 2026",
    sections: [
      {
        heading: "1. Information We Collect",
        body: "We collect account information (name, email) provided during registration, trading activity data generated through your use of the platform, device and usage information for performance monitoring, and payment information processed securely via Stripe.",
      },
      {
        heading: "2. How We Use Your Information",
        body: "Your information is used to provide and improve the trading platform, process payments and subscriptions, send account notifications and alerts, maintain platform security, and comply with legal obligations. We do not use your data for advertising purposes.",
      },
      {
        heading: "3. API Credential Security",
        body: "Exchange API keys and secrets are encrypted using AES-256-GCM encryption with a per-user key derivation (PBKDF2, 100,000 iterations). Credentials are never stored in plaintext, never logged, and never transmitted outside of the encrypted storage system.",
      },
      {
        heading: "4. Data Sharing",
        body: "We do not sell your personal information to third parties. We share data only with service providers necessary to operate the platform (authentication via Clerk, payments via Stripe) and as required by applicable law or valid legal process.",
      },
      {
        heading: "5. Data Retention",
        body: "Account data is retained for the duration of your account. Trade history is retained for up to 7 years to comply with financial record-keeping requirements. Encrypted API credentials are permanently deleted within 30 days of account termination.",
      },
      {
        heading: "6. Your Rights",
        body: "You may request access to, correction of, or deletion of your personal data at any time. To exercise these rights, contact our support team. We will respond within 30 days. Note that some data may be retained as required by law.",
      },
      {
        heading: "7. Security",
        body: "We implement industry-standard security measures including TLS encryption in transit, AES-256-GCM encryption at rest for credentials, regular security audits, and access controls. However, no system is completely secure and we cannot guarantee absolute security.",
      },
    ],
  },

  risk: {
    title:   "Risk Disclosure",
    updated: "January 1, 2026",
    sections: [
      {
        heading: "Cryptocurrency Volatility",
        body: "Cryptocurrencies are highly volatile assets. Prices can fluctuate dramatically within short time periods. The value of any cryptocurrency can decrease significantly, and you may lose some or all of your invested capital. Do not invest more than you can afford to lose.",
      },
      {
        heading: "AI Trading System Risk",
        body: "The AI-powered trading signals and auto-execution engine are based on historical data and statistical models. Past signal performance does not guarantee future results. AI systems can and do make errors, and market conditions can change in ways that invalidate historical patterns.",
      },
      {
        heading: "Market and Liquidity Risk",
        body: "Cryptocurrency markets may experience periods of low liquidity, exchange outages, or extreme volatility (flash crashes). During such events, orders may execute at significantly different prices than expected, or may not execute at all.",
      },
      {
        heading: "Exchange Counterparty Risk",
        body: "Connected exchanges are independent third-party services. AICandlez is not responsible for exchange security breaches, technical failures, insolvency, or regulatory actions affecting connected exchanges. Always maintain independent records of your holdings.",
      },
      {
        heading: "Regulatory Risk",
        body: "Cryptocurrency regulations vary by jurisdiction and are subject to change. Regulatory actions by governments may restrict trading, require disclosure, or result in asset freezes. It is your responsibility to comply with applicable laws in your jurisdiction.",
      },
      {
        heading: "Technology Risk",
        body: "Automated trading systems depend on network connectivity, API availability, and software correctness. Technical failures, bugs, or connectivity issues may result in missed trades, duplicate orders, or other unintended outcomes. Always monitor your positions.",
      },
      {
        heading: "Acknowledgement",
        body: "By using the live trading features of AICandlez, you acknowledge that you have read and understood these risk disclosures, that you are trading with funds you can afford to lose, and that you bear sole responsibility for your trading decisions.",
      },
    ],
  },

  disclaimer: {
    title:   "Trading Disclaimer",
    updated: "January 1, 2026",
    sections: [
      {
        heading: "Not Financial Advice",
        body: "AICandlez is a technology platform that provides AI-generated trading signals and automated execution tools. Nothing on this platform constitutes financial, investment, legal, or tax advice. All trading signals, recommendations, and analytics are for informational and educational purposes only.",
      },
      {
        heading: "No Guarantee of Profits",
        body: "AICandlez makes no representation or guarantee that use of the platform will result in profits. All trading involves risk of loss. The AI trading engine is a tool to assist your trading — not a guarantee of returns. Past performance of the AI system does not predict future results.",
      },
      {
        heading: "User Responsibility",
        body: "You are solely responsible for all trading decisions made through the platform. You should conduct your own research and consider your financial situation, investment objectives, and risk tolerance before making trading decisions. We strongly recommend consulting a qualified financial advisor.",
      },
      {
        heading: "Tax Obligations",
        body: "Trading activity may generate taxable events depending on your jurisdiction. You are solely responsible for determining, reporting, and paying any applicable taxes on your trading gains. AICandlez does not provide tax advice and is not responsible for your tax obligations.",
      },
      {
        heading: "Simulation vs. Live Trading",
        body: "Results achieved in the paper trading simulation are not indicative of results achievable with real funds. Simulated trading does not account for slippage, liquidity constraints, exchange fees, or market impact that affect real trades. Live trading results may differ materially from simulated results.",
      },
      {
        heading: "Regulatory Compliance",
        body: "It is your responsibility to ensure that your use of this platform complies with all applicable laws and regulations in your jurisdiction. AICandlez does not operate as a registered broker-dealer, investment adviser, or financial institution.",
      },
    ],
  },
};

// ── Main page ────────────────────────────────────────────────────────────────────
export default function LegalPage() {
  const [location, setLocation] = useLocation();
  const segments = location.split("/");
  const type     = segments[segments.length - 1] ?? "terms";
  const doc      = DOCS[type] ?? DOCS.terms;

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 40 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px 16px",
        borderBottom: `1px solid ${E}` }}>
        <button onClick={() => setLocation("/profile")} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: SANS, fontSize: 10, fontWeight: 500,
          color: GR, letterSpacing: "0.04em",
          padding: "0 0 10px 0", display: "block",
        }}>
          ← Profile
        </button>
        <div style={{ fontSize: 22, fontFamily: SANS, fontWeight: 700, color: W }}>
          {doc.title}
        </div>
        <div style={{ fontSize: 9, fontFamily: SANS, color: GR, marginTop: 4 }}>
          Last updated: {doc.updated}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 16px 0" }}>
        {doc.sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ background: CARD, border: `1px solid ${E}`,
              borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontFamily: SANS, fontWeight: 600, color: W,
                marginBottom: 10 }}>
                {section.heading}
              </div>
              <div style={{ fontSize: 12, fontFamily: SANS, fontWeight: 400,
                color: "rgba(255,255,255,0.70)", lineHeight: 1.75 }}>
                {section.body}
              </div>
            </div>
          </div>
        ))}

        {/* Footer */}
        <div style={{ padding: "12px 16px", background: CARD,
          border: `1px solid ${E}`, borderRadius: 8, marginTop: 4 }}>
          <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.8 }}>
            Questions? Contact us at legal@aicandlez.com
          </div>
        </div>
      </div>
    </div>
  );
}
