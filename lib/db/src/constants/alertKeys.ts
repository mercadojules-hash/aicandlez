/**
 * Alert key taxonomy — shared between the API server (push dispatch gating)
 * and the PWA (Alert Preferences UI in Profile).
 *
 * Adding a new alert type:
 *   1. Add the key + label + sub here.
 *   2. The PWA's `lib/feedback.ts` re-exports ALERT_DEFINITIONS from this
 *      module so the toggle row renders automatically.
 *   3. The API server reads `userSettings.alertPrefs[<key>]` before
 *      dispatching any push tagged with that key via
 *      `NotificationDispatcher.sendToUser` / `broadcastToAll`. Callers pass
 *      `alertKey: "<key>"` in the PushPayload.
 *
 * Sensible defaults: high-signal alerts default ON, noisy ones default OFF.
 * `isAlertEnabled` honors that default whenever a stored pref is missing.
 */

export const ALERT_DEFINITIONS = [
  { key: "aiSignalAlerts",         label: "AI Signal Alerts",          sub: "New BUY/SELL signals from the AI scanner",            defaultOn: false },
  { key: "autoTradeExecuted",      label: "AI Auto Trade Executions",  sub: "Autonomous trades opened or closed",                   defaultOn: true  },
  { key: "liveTradeFilled",        label: "Live Trade Filled",         sub: "Real-money AI fill confirmations from your exchange",  defaultOn: true  },
  { key: "tradeOpened",            label: "Trade Opened",              sub: "A new position is opened",                             defaultOn: true  },
  { key: "tradeClosed",            label: "Trade Closed",              sub: "A position is closed (win or loss)",                   defaultOn: true  },
  { key: "takeProfitHit",          label: "Take Profit Hit",           sub: "Position closed at target",                            defaultOn: true  },
  { key: "stopLossHit",            label: "Stop Loss Hit",             sub: "Position closed at stop",                              defaultOn: true  },
  { key: "highConfidenceSignals",  label: "High Confidence Setups",    sub: "Confidence ≥ 80% opportunities",                       defaultOn: true  },
  { key: "marketScannerAlerts",    label: "Market Scanner Alerts",     sub: "Major scanner state changes",                          defaultOn: false },
  { key: "volatilityAlerts",       label: "Volatility Alerts",         sub: "Sudden volatility spikes",                             defaultOn: false },
  { key: "portfolioAlerts",        label: "Portfolio Performance",     sub: "Daily P&L summary + milestones",                       defaultOn: false },
] as const;

export type AlertKey = (typeof ALERT_DEFINITIONS)[number]["key"];

export type AlertPrefs = Partial<Record<AlertKey, boolean>>;

export const ALERT_KEYS: readonly AlertKey[] =
  ALERT_DEFINITIONS.map((d) => d.key) as readonly AlertKey[];

export function defaultAlertPrefs(): Record<AlertKey, boolean> {
  const out = {} as Record<AlertKey, boolean>;
  for (const d of ALERT_DEFINITIONS) out[d.key] = d.defaultOn;
  return out;
}

/**
 * Returns whether an alert of this key should be delivered for a user
 * given their stored `alertPrefs` JSON blob. Missing keys fall back to
 * the per-key `defaultOn` setting.
 */
export function isAlertEnabled(
  prefs: AlertPrefs | null | undefined,
  key:   AlertKey,
): boolean {
  const stored = prefs?.[key];
  if (typeof stored === "boolean") return stored;
  const def = ALERT_DEFINITIONS.find((d) => d.key === key);
  return def?.defaultOn ?? true;
}
