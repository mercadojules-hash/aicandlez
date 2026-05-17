// ── Onboarding architecture skeleton ──────────────────────────────────────────
// T011: Foundation for walkthroughs, glossary, risk education, paper vs live.
// Not yet fully wired — hooks and state shape are defined here for future build.

import { useState, useEffect, useCallback } from "react";

export type OnboardingStep =
  | "welcome"
  | "paper_vs_live"
  | "ai_confidence"
  | "risk_disclosure"
  | "account_connect"
  | "done";

export interface OnboardingState {
  completed:    boolean;
  currentStep:  OnboardingStep;
  stepsVisited: OnboardingStep[];
  dismissedAt:  number | null;
}

const STORAGE_KEY = "aicandlez_onboarding_v1";

const DEFAULT_STATE: OnboardingState = {
  completed:    false,
  currentStep:  "welcome",
  stepsVisited: [],
  dismissedAt:  null,
};

function load(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function save(state: OnboardingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable
  }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(load);

  const advance = useCallback((next: OnboardingStep) => {
    setState(prev => {
      const updated: OnboardingState = {
        ...prev,
        currentStep:  next,
        stepsVisited: prev.stepsVisited.includes(prev.currentStep)
          ? prev.stepsVisited
          : [...prev.stepsVisited, prev.currentStep],
      };
      save(updated);
      return updated;
    });
  }, []);

  const complete = useCallback(() => {
    setState(prev => {
      const updated: OnboardingState = { ...prev, completed: true, currentStep: "done" };
      save(updated);
      return updated;
    });
  }, []);

  const dismiss = useCallback(() => {
    setState(prev => {
      const updated: OnboardingState = { ...prev, dismissedAt: Date.now() };
      save(updated);
      return updated;
    });
  }, []);

  const reset = useCallback(() => {
    save(DEFAULT_STATE);
    setState(DEFAULT_STATE);
  }, []);

  // Re-show after 7 days if dismissed but not completed
  const shouldShow = !state.completed && (
    state.dismissedAt === null ||
    Date.now() - state.dismissedAt > 7 * 24 * 60 * 60 * 1000
  );

  return { state, shouldShow, advance, complete, dismiss, reset };
}

// ── Glossary terms (used by HelpModal and MetricTooltip) ───────────────────────

export const GLOSSARY: Record<string, { short: string; detail: string }> = {
  "AI Confidence": {
    short:  "Probability score the AI model assigns to a signal.",
    detail: "A value from 0–100 representing how strongly the AI model believes a trade signal is valid. Higher = more certainty. Scores below 60 are typically filtered out.",
  },
  "Exposure": {
    short:  "Percentage of your portfolio currently allocated to open positions.",
    detail: "If you have $10,000 and $5,600 is in open positions, your exposure is 56%. High exposure means more capital at risk. The AI caps exposure based on your risk settings.",
  },
  "Win Rate": {
    short:  "Percentage of closed trades that ended in profit.",
    detail: "Win Rate = profitable trades ÷ total closed trades. A 60% win rate means 6 out of 10 trades were profitable. A high win rate doesn't guarantee overall profit — the size of wins and losses matters too.",
  },
  "Unrealized P&L": {
    short:  "Profit or loss on currently open positions — not yet locked in.",
    detail: "This value changes in real time as prices move. It becomes 'realized' only when the position is closed. Unrealized P&L does not affect your account balance until the trade closes.",
  },
  "Realized P&L": {
    short:  "Profit or loss from all trades that have been closed.",
    detail: "Every time a position is closed, its gain or loss is added to your realized P&L. This is your actual historical performance. In simulation mode, this represents virtual profits — not real money.",
  },
  "Paper Trading": {
    short:  "Simulated trading using virtual capital — no real money is involved.",
    detail: "Paper trading lets you test AI strategies without financial risk. Trades are executed against real market prices but use virtual funds. Results may differ from live trading due to slippage, liquidity, and execution timing.",
  },
  "Signal Strength": {
    short:  "How many technical indicators align to confirm a trade signal.",
    detail: "Signal strength measures multi-timeframe confluence. When EMA, RSI, volume, and trend all point the same direction, signal strength is high. Weak signals are filtered before execution.",
  },
  "MTF Confirmation": {
    short:  "Multi-timeframe confirmation — signal validated across multiple chart periods.",
    detail: "The AI checks if a bullish or bearish signal appears on both the 5-minute and 1-hour chart. Signals that appear on only one timeframe are considered weaker and may be rejected.",
  },
  "Stop Loss": {
    short:  "Automatic exit price that limits your maximum loss on a trade.",
    detail: "If a position moves against you by a set percentage, the AI automatically closes it. This protects your capital from large drawdowns.",
  },
  "Take Profit": {
    short:  "Automatic exit price that locks in your profit on a trade.",
    detail: "When a position reaches your target gain percentage, the AI closes it and books the profit. This prevents giving back gains if the market reverses.",
  },
};
