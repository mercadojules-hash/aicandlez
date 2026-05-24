import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

// ── Global billing-hold indicator (Sprint 1 fix P1-ON-02) ────────────────────
//
// A thin, always-visible red pill that appears on every PWA route EXCEPT
// /billing whenever the authenticated user's wallet is in `billing_hold`.
// Without this, the user only learned their live execution was paused
// after navigating to /billing or after a failed order attempt — a
// silent-degradation footgun called out by the audit.
//
// Polls /api/billing/wallet at 30s. Same endpoint Billing.tsx already
// reads, so the data path is proven. Fails closed (renders nothing on
// error) — never blocks the app.

interface WalletHealth { currentStatus?: string }
interface WalletResponse { health?: WalletHealth }

export function BillingHoldBanner() {
  const [loc] = useLocation();

  // Hide on /billing itself (where the in-page banner + actions live)
  // and on sign-in/sign-up surfaces where the user is not yet logged in.
  const hidden =
    loc.startsWith("/billing")  ||
    loc.startsWith("/sign-")    ||
    loc.startsWith("/consent")  ||
    loc.startsWith("/legal");

  const { data } = useQuery<WalletResponse>({
    queryKey:        ["billing-wallet-banner"],
    queryFn:         () => api.get<WalletResponse>("/billing/wallet"),
    staleTime:       20_000,
    refetchInterval: 30_000,
    retry:           false,
  });

  if (hidden) return null;
  const onHold = data?.health?.currentStatus === "billing_hold";
  if (!onHold) return null;

  return (
    <a
      href="/billing"
      style={{
        display:        "block",
        textDecoration: "none",
        background:     "linear-gradient(180deg,#3a0a14 0%,#280812 100%)",
        borderBottom:   "1px solid #ff4060",
        color:          "#ffd2d8",
        fontFamily:     "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize:       12,
        lineHeight:     1.45,
        padding:        "10px 14px",
        textAlign:      "center",
        letterSpacing:  "0.02em",
        zIndex:         50,
        position:       "sticky",
        top:            0,
      }}
      data-testid="banner-billing-hold"
    >
      <b style={{ color: "#ff6f80", letterSpacing: "0.08em" }}>
        LIVE EXECUTION PAUSED
      </b>
      <span style={{ margin: "0 8px", opacity: 0.6 }}>·</span>
      Outstanding performance fees owed.
      <span style={{ margin: "0 8px", opacity: 0.6 }}>·</span>
      <span style={{ color: "#fff", textDecoration: "underline" }}>
        Resolve in Billing →
      </span>
    </a>
  );
}
