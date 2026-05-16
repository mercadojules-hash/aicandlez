import { useEffect, useRef, useCallback } from "react";
import { useAIAutoTrade } from "@/contexts/AIAutoTradeContext";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";

// ── Constants ─────────────────────────────────────────────────────────────────
const POLL_MS     = 6_000;
const ORDER_NOTIONAL = 400; // USD per AI trade

// ── Helpers ───────────────────────────────────────────────────────────────────
interface MobileSignal {
  action:     string;
  symbol:     string;
  confidence: number;
  ts:         number;
}
interface MobileStatusResp { lastSignal: MobileSignal | null; ts: number }

function fmtSymbol(s: string): string {
  // BTC/USD or BTCUSD → BTC/USD for Alpaca
  if (s.includes("/")) return s;
  return s.replace(/([A-Z]+)(USD)$/, "$1/USD");
}

// ── Component ─────────────────────────────────────────────────────────────────
// Sits inside all providers. Polls for AI signals and mirrors them as Alpaca
// paper orders when both AI auto-trade AND broker paper_active are true.

export function AlpacaAutoTrader() {
  const { enabled }             = useAIAutoTrade();
  const { status: brokerStatus } = useBrokerConnection();

  const lastSignalTs = useRef<number>(0);
  const isActive     = enabled && (brokerStatus === "paper_active" || brokerStatus === "live_active");

  const checkAndTrade = useCallback(async () => {
    try {
      const res = await fetch("/api/mobile/status");
      if (!res.ok) return;
      const data = (await res.json()) as MobileStatusResp;
      const sig  = data.lastSignal;

      if (
        sig &&
        sig.ts > lastSignalTs.current &&
        (sig.action === "BUY" || sig.action === "SELL") &&
        sig.confidence >= 55
      ) {
        lastSignalTs.current = sig.ts;

        const symbol = fmtSymbol(sig.symbol ?? "BTC/USD");
        const side   = sig.action === "BUY" ? "buy" : "sell";

        const orderRes = await fetch("/api/exchange/alpaca/order", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ symbol, side, notional: ORDER_NOTIONAL }),
        });

        if (orderRes.ok) {
          const order = (await orderRes.json()) as { id: string; symbol: string; side: string; status: string };
          console.info(
            `[AlpacaAutoTrader] Paper order placed — ${order.side} ${order.symbol} ($${ORDER_NOTIONAL}) | status: ${order.status}`
          );
        } else {
          const err = (await orderRes.json().catch(() => ({}))) as { error?: string };
          console.warn("[AlpacaAutoTrader] Order failed:", err.error ?? `HTTP ${orderRes.status}`);
        }
      }
    } catch {
      // Silently swallow — polling will retry
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;

    // Seed lastSignalTs so we don't replay old signals on enable
    void fetch("/api/mobile/status")
      .then(r => r.ok ? r.json() as Promise<MobileStatusResp> : null)
      .then(d => {
        if (d?.lastSignal?.ts) lastSignalTs.current = d.lastSignal.ts;
      })
      .catch(() => {});

    const timer = setInterval(() => void checkAndTrade(), POLL_MS);
    return () => clearInterval(timer);
  }, [isActive, checkAndTrade]);

  return null;
}
