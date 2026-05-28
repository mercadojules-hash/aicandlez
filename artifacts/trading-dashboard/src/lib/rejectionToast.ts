/**
 * rejectionToast — Phase 3 Step 4 scaffold (additive).
 *
 * Mirror of the PWA helper so the customer portal and the PWA share an
 * identical dedupe-guarded rejection toast for `[EXECUTION_REJECTED]`
 * server responses. See `artifacts/aicandlez-app/src/lib/rejectionToast.ts`
 * for full design notes. Call sites are NOT migrated in this pass —
 * Step 4b wires SignalRow.fireTrade onError into this helper.
 */

import { toast } from "@/hooks/use-toast";

/**
 * SUPERSET of `LiveUserOrderResult.errorCode`. Mirror group covers
 * every server-emitted code; reserved group (`runtime_not_armed`,
 * `live_required`, `live_unavailable`) is added for Phase 3 Step 5
 * cutover without touching call sites. See PWA copy for full design
 * notes.
 */
export type RejectionErrorCode =
  // ── Mirror of LiveUserOrderResult.errorCode ──
  | "no_connection"
  | "decrypt_failed"
  | "unsupported"
  | "unsupported_symbol"
  | "no_sandbox"
  | "price_unavailable"
  | "exchange_reject"
  | "trade_limit_exhausted"
  | "user_status_blocked"
  | "customer_live_execution_disabled"
  | "user_ai_disabled"
  | "concurrent_live_cap_reached"
  | "risk_max_per_trade"
  | "risk_max_simultaneous"
  | "risk_max_allocation"
  | "risk_reserve_cash_breach"
  | "risk_no_equity"
  | "ai_disclaimer_not_accepted"
  | "low_confidence_signal"
  | "volume_safety_gate"
  | "liquidity_protected"
  | "plan_max_positions_reached"
  // ── Reserved for Phase 3 Step 5 cutover (not yet server-emitted) ──
  | "runtime_not_armed"
  | "live_required"
  | "live_unavailable";

const DEDUPE_WINDOW_MS = 30_000;
const lastShownAt = new Map<string, number>();

function customerCopy(code: RejectionErrorCode): { title: string; tone: "warn" | "block" } {
  switch (code) {
    case "customer_live_execution_disabled": return { title: "Live execution disabled", tone: "block" };
    case "concurrent_live_cap_reached":      return { title: "Live trade cap reached", tone: "warn" };
    case "runtime_not_armed":                return { title: "Runtime not armed", tone: "warn" };
    case "low_confidence_signal":            return { title: "Signal below confidence threshold", tone: "warn" };
    case "volume_safety_gate":               return { title: "Volume below safety threshold", tone: "warn" };
    case "liquidity_protected":              return { title: "Liquidity guard rejected order", tone: "warn" };
    case "trade_limit_exhausted":            return { title: "Plan trade limit reached", tone: "block" };
    case "user_status_blocked":              return { title: "Account on hold", tone: "block" };
    case "user_ai_disabled":                 return { title: "AI trading disabled", tone: "warn" };
    case "ai_disclaimer_not_accepted":       return { title: "Accept AI disclaimer to trade", tone: "warn" };
    case "no_connection":                    return { title: "No live exchange connection", tone: "block" };
    case "decrypt_failed":                   return { title: "Exchange credentials unreadable", tone: "block" };
    case "unsupported":
    case "unsupported_symbol":               return { title: "Symbol not supported by exchange", tone: "warn" };
    case "no_sandbox":                       return { title: "Exchange sandbox unavailable", tone: "block" };
    case "price_unavailable":                return { title: "Live price unavailable", tone: "warn" };
    case "exchange_reject":                  return { title: "Exchange rejected order", tone: "warn" };
    case "risk_max_per_trade":
    case "risk_max_simultaneous":
    case "risk_max_allocation":
    case "risk_reserve_cash_breach":
    case "risk_no_equity":                   return { title: "Risk guard rejected order", tone: "warn" };
    case "plan_max_positions_reached":       return { title: "Position cap reached for plan", tone: "warn" };
    case "live_required":                    return { title: "Live execution required", tone: "block" };
    case "live_unavailable":                 return { title: "Live execution unavailable", tone: "block" };
  }
}

export interface RejectionInput {
  errorCode: RejectionErrorCode;
  symbol?:   string;
  detail?:   string;
}

export function notifyRejection(input: RejectionInput): void {
  try {
    const sym = input.symbol ?? "—";
    const key = `${input.errorCode}::${sym}`;
    const now = Date.now();
    const prev = lastShownAt.get(key);
    if (prev !== undefined && now - prev < DEDUPE_WINDOW_MS) return;
    lastShownAt.set(key, now);

    const copy = customerCopy(input.errorCode);
    const desc = input.detail ? `${sym} · ${input.detail}` : sym;
    toast({
      title:       copy.title,
      description: desc,
      variant:     copy.tone === "block" ? "destructive" : "default",
    });
  } catch { /* never throw from a toast */ }
}

export function __resetRejectionToastDedupe(): void {
  lastShownAt.clear();
}
