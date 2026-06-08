// ── Risk Disclaimer (current required gate) ───────────────────────────────────
// Customer users must accept this disclaimer BEFORE any of:
//   • Stripe checkout                  (POST /api/billing/checkout)
//   • Connecting an exchange API key   (POST /api/user/exchanges/connect)
//   • Activating live AI execution
//   • Plan upgrade
//
// Bumping DISCLAIMER_VERSION forces every customer to re-accept on next
// gated action. Admin / super-admin users bypass this gate entirely (the
// admintrade.aicandlez.com operator workstation is exempt by design).

export const DISCLAIMER_VERSION = "disclaimer-v1.0";

export interface DisclaimerAck {
  key:   keyof DisclaimerAcks;
  label: string;
}

export interface DisclaimerAcks {
  acceptedNotAdvice:        boolean;
  acceptedTradingRisk:      boolean;
  acceptedAiInaccuracy:     boolean;
  acceptedPastPerformance:  boolean;
  acceptedUserResponsible:  boolean;
  acceptedAutomatedLosses:  boolean;
}

export const DISCLAIMER_ACKS: DisclaimerAck[] = [
  { key: "acceptedNotAdvice",       label: "I understand AICandlez is not financial advice." },
  { key: "acceptedTradingRisk",     label: "I understand trading involves substantial financial risk." },
  { key: "acceptedAiInaccuracy",    label: "I understand AI-generated signals may be inaccurate." },
  { key: "acceptedPastPerformance", label: "I understand past performance does not guarantee future results." },
  { key: "acceptedUserResponsible", label: "I am fully responsible for my trading decisions." },
  { key: "acceptedAutomatedLosses", label: "I understand automated trading can result in losses." },
];

export const DISCLAIMER_ACK_KEYS = DISCLAIMER_ACKS.map(a => a.key);
