/**
 * rejectionToast — Phase 3 Step 4 scaffold (additive).
 *
 * Single entrypoint for surfacing `[EXECUTION_REJECTED]`-class server
 * rejections to the customer as a visible, dedupe-guarded toast. Phase 3
 * invariant: no silent paper-downgrade — if the server refuses to ship
 * a LIVE order, the user MUST see it.
 *
 * Dedupe key = `(errorCode, symbol)` over a 30s window. This stops a
 * burst of rejections (e.g. ARM toggle hammering, repeated signal fires
 * on a blocked symbol) from spamming the toast queue while still
 * surfacing genuinely new failure conditions instantly.
 *
 * This module is intentionally side-effect free until a call site
 * invokes `notifyRejection(...)`. Existing call sites are NOT migrated
 * in this pass — Step 4b wires SignalRow.fireTrade onError into this
 * helper as a separate, reviewable change.
 */

import { toast } from "@/hooks/use-toast";

/**
 * Server-emitted execution errorCodes that customers must see as toasts.
 *
 * SUPERSET of `LiveUserOrderResult.errorCode` from
 * `api-server lib/liveUserExecution.ts`. The two groups:
 *
 * 1. **Mirror codes** — every value in the server union is present
 *    here (verified by architect Phase 3 Step 4 review): includes
 *    `no_sandbox`, `price_unavailable`, etc.
 * 2. **Reserved codes** — `runtime_not_armed`, `live_required`,
 *    `live_unavailable`. NOT yet emitted by the server; reserved
 *    for Phase 3 Step 5 cutover when ARM-gate + strict-mode
 *    downgrade-rejection paths land. Keeping them in the union now
 *    means Step 5 can wire them without touching call sites.
 *
 * Step 4b should add a compile-time parity assertion against the
 * generated OpenAPI type once `mode`/`errorCode` are codegen'd
 * (Phase 2 Step 4 follow-up).
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

/**
 * Customer-facing copy for each errorCode. Institutional tone — no
 * arcade language, no exclamation points. The error message returned
 * by the server (`error` field) is appended when non-empty so the
 * user sees the structural reason AND the live detail.
 */
function customerCopy(code: RejectionErrorCode): { title: string; tone: "warn" | "block" } {
  switch (code) {
    case "customer_live_execution_disabled":
      return { title: "Live execution disabled", tone: "block" };
    case "concurrent_live_cap_reached":
      return { title: "Live trade cap reached", tone: "warn" };
    case "runtime_not_armed":
      return { title: "Runtime not armed", tone: "warn" };
    case "low_confidence_signal":
      return { title: "Signal below confidence threshold", tone: "warn" };
    case "volume_safety_gate":
      return { title: "Volume below safety threshold", tone: "warn" };
    case "liquidity_protected":
      return { title: "Liquidity guard rejected order", tone: "warn" };
    case "trade_limit_exhausted":
      return { title: "Plan trade limit reached", tone: "block" };
    case "user_status_blocked":
      return { title: "Account on hold", tone: "block" };
    case "user_ai_disabled":
      return { title: "AI trading disabled", tone: "warn" };
    case "ai_disclaimer_not_accepted":
      return { title: "Accept AI disclaimer to trade", tone: "warn" };
    case "no_connection":
      return { title: "No live exchange connection", tone: "block" };
    case "decrypt_failed":
      return { title: "Exchange credentials unreadable", tone: "block" };
    case "unsupported":
    case "unsupported_symbol":
      return { title: "Symbol not supported by exchange", tone: "warn" };
    case "no_sandbox":
      return { title: "Exchange sandbox unavailable", tone: "block" };
    case "price_unavailable":
      return { title: "Live price unavailable", tone: "warn" };
    case "exchange_reject":
      return { title: "Exchange rejected order", tone: "warn" };
    case "risk_max_per_trade":
    case "risk_max_simultaneous":
    case "risk_max_allocation":
    case "risk_reserve_cash_breach":
    case "risk_no_equity":
      return { title: "Risk guard rejected order", tone: "warn" };
    case "plan_max_positions_reached":
      return { title: "Position cap reached for plan", tone: "warn" };
    case "live_required":
      return { title: "Live execution required", tone: "block" };
    case "live_unavailable":
      return { title: "Live execution unavailable", tone: "block" };
  }
}

export interface RejectionInput {
  errorCode: RejectionErrorCode;
  /** Trading symbol (e.g. `BTCUSD`). Optional — falls back to "—". */
  symbol?:   string;
  /** Server-provided detail string from `LiveUserOrderResult.error`. */
  detail?:   string;
}

/**
 * Surface a server rejection to the user. Dedup-guarded by
 * `(errorCode, symbol)` over a 30s window. Safe to call from any
 * onError handler — never throws.
 */
export function notifyRejection(input: RejectionInput): void {
  try {
    const sym = input.symbol ?? "—";
    const key = `${input.errorCode}::${sym}`;
    const now = Date.now();
    const prev = lastShownAt.get(key);
    if (prev !== undefined && now - prev < DEDUPE_WINDOW_MS) return;
    lastShownAt.set(key, now);

    const copy = customerCopy(input.errorCode);
    const desc = input.detail
      ? `${sym} · ${input.detail}`
      : sym;
    toast({
      title:       copy.title,
      description: desc,
      variant:     copy.tone === "block" ? "destructive" : "default",
    });
  } catch { /* never throw from a toast */ }
}

/** Test helper — clears dedupe state. Not exported from any index. */
export function __resetRejectionToastDedupe(): void {
  lastShownAt.clear();
}
