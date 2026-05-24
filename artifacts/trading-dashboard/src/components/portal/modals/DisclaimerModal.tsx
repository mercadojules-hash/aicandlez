/**
 * DisclaimerModal — risk disclosure for the customer terminal.
 *
 * Extracted from `pages/portal/AdminPortalLegacy.tsx` (Phase E3). Admin path
 * keeps its own local copy and is unchanged.
 */

import { N, PortalModal } from "./_shared";

export function DisclaimerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const points = [
    "AI trading involves substantial risk. You can lose some or all of your invested capital.",
    "Results are not guaranteed. Algorithmic signals are based on historical data and statistical models — they do not predict the future with certainty.",
    "Past performance does not guarantee future results. Backtests, demo telemetry, and paper-trading metrics are not indicative of live outcomes.",
    "You are solely responsible for your trading decisions. AICandlez is software that automates execution based on your configured tier and risk parameters — final responsibility for every trade rests with you.",
    "Paper trading differs from live trading. Spreads, slippage, fills, fees, and emotional response are materially different in real markets.",
    "Market volatility can result in losses, including rapid losses outside trading hours, during news events, or in low-liquidity conditions.",
    "AICandlez is not financial, legal, or tax advice. Consult a licensed professional before making investment decisions.",
    "Performance fees are charged on profitable closed trades only — never on losses. Subscription fees are billed monthly and can be cancelled at any time.",
  ];
  return (
    <PortalModal
      open={open} onClose={onClose}
      eyebrow="LEGAL · RISK DISCLOSURE"
      title="Trading risk disclaimer"
      maxWidth={600}
    >
      <p style={{
        fontSize: 12, color: N.TEXT_1, lineHeight: 1.6, margin: "0 0 16px",
      }}>
        Please read the following carefully before enabling live AI execution.
        By continuing to use AICandlez you acknowledge that you have read and
        understood these terms.
      </p>

      <ul style={{
        listStyle: "none", padding: 0, margin: 0,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {points.map((p, i) => (
          <li key={i} style={{
            display: "flex", gap: 10,
            padding: "10px 12px",
            background: N.SURFACE_2,
            border: `1px solid ${N.BORDER}`,
            borderRadius: 4,
            fontSize: 11, color: N.TEXT_1, lineHeight: 1.55,
          }}>
            <span style={{
              flexShrink: 0,
              width: 18, height: 18, borderRadius: "50%",
              background: `${N.BRAND}14`,
              border: `1px solid ${N.BRAND}40`,
              color: N.BRAND, fontSize: 9, fontWeight: 800,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 8px ${N.BRAND_GLOW}`,
            }}>{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div style={{
        marginTop: 16,
        padding: "10px 12px",
        background: `${N.WARN}10`,
        border: `1px solid ${N.WARN}40`,
        borderRadius: 4,
        fontSize: 10, color: N.WARN, lineHeight: 1.5,
        letterSpacing: "0.04em",
      }}>
        AICandlez never requests withdrawal permissions from your connected
        exchange. We only execute the trades authorized within your tier
        capacity.
      </div>
    </PortalModal>
  );
}
