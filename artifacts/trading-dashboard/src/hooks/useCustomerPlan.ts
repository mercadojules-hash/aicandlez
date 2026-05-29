// Phase 6 — Shared customer plan hook (extracted from PortalCustomerShell).
//
// Previously this hook was defined inline inside PortalCustomerShell. Phase 6
// needs to thread plan-awareness into SignalRow (rendered transitively from
// the shell via the dual-crypto matrix), which would have created a circular
// import (PortalCustomerShell → CryptoMajorsSignalsPanel → SignalRow →
// PortalCustomerShell). Extracting the hook to its own module breaks the cycle
// and gives every customer-scoped surface a single source of truth.
//
// Semantics are byte-identical to the previous inline impl:
//   • Reads /api/billing/subscription via authFetch (Bearer + cookie fallback)
//   • 60s refetch, 30s stale, no focus refetch
//   • Collapses operator-granted complimentary entitlement onto effectivePlan
//   • Returns "free" for anything outside the locked 3-tier ladder

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
// ^ Matches the import path used everywhere else in this artifact
//   (e.g. PortalCustomerShell, SignalRow). Do not switch to
//   @clerk/clerk-react — it would break the type-deduped singleton.
import { authFetch } from "../lib/authFetch";

export type Plan = "free" | "starter" | "pro" | "elite";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

// Shared cache key — every customer-shell surface (useCustomerPlan,
// useCustomerEntitlement, SignalRow) reads from this single query so
// invalidations from OnboardingFlow / Billing.tsx settle every consumer
// in lockstep. Do not split this key without also updating
// OnboardingFlow's `?checkout=success` invalidation list, or paying
// customers will see stale `plan="free"` after Stripe redirects them
// back into the portal (P0 — gates the Connect Exchange CTA).
export const BILLING_SUBSCRIPTION_QUERY_KEY = ["billing-subscription-portal-shell"] as const;

interface SubscriptionPayload {
  plan?:            string;
  planStatus?:      string | null;
  isComplimentary?: boolean;
  effectivePlan?:   string;
  isActive?:        boolean;
  isPaid?:          boolean;
  canLiveTrade?:    boolean;
}

function useSubscriptionQuery() {
  const { isSignedIn, getToken } = useAuth();
  return useQuery<SubscriptionPayload>({
    queryKey: BILLING_SUBSCRIPTION_QUERY_KEY,
    enabled:  isSignedIn ?? false,
    // 60s background poll + 30s stale window — same as Phase 6. We additionally
    // refetch on window focus + every mount so that returning from Stripe
    // checkout (which navigates away and back) hydrates the fresh entitlement
    // immediately rather than waiting up to a minute for the poll to wake.
    // Without this the Connect Exchange CTA opens the UpgradeModal on the
    // first click after a successful checkout because the cached
    // `plan="free"` is still in memory.
    refetchInterval:      60_000,
    staleTime:            30_000,
    refetchOnWindowFocus: true,
    refetchOnMount:       "always",
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/billing/subscription`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("billing/subscription failed");
      return res.json();
    },
  });
}

export function useCustomerPlan(): Plan {
  const { data } = useSubscriptionQuery();
  // Operator-granted complimentary entitlement collapses onto the effective
  // tier — without this every consumer renders complimentary users as FREE
  // despite the backend AI gate granting full live access.
  const p = data?.isComplimentary
    ? (data?.effectivePlan ?? "pro")
    : data?.plan;
  return p === "starter" || p === "pro" || p === "elite" ? p : "free";
}

export interface CustomerEntitlement {
  plan:         Plan;
  /** Server-derived: true for any paid plan OR complimentary grant. Use this
   *  (not `plan !== "free"`) for any gate that asks "is this user entitled
   *  to a paid feature?" — it correctly handles the complimentary,
   *  trialing, and brief webhook-race windows where `plan` may still read
   *  as "free" while the server already considers the user paid. */
  isPaid:       boolean;
  /** True when the user's subscription is in a billable state
   *  (active / trialing / complimentary). Free-but-active users included. */
  isActive:     boolean;
  /** True when the user is entitled to live trading at the tier level.
   *  Server-side execution still gates on the kill switch + ARM. */
  canLiveTrade: boolean;
  isLoading:    boolean;
}

/**
 * Rich entitlement projection backed by the same shared cache as
 * `useCustomerPlan`. Use this for any UI gate that should grant access on
 * payment / complimentary state — `plan === "free"` is a brittle proxy that
 * mis-locks paying customers during webhook races, complimentary grants,
 * and trialing windows.
 */
export function useCustomerEntitlement(): CustomerEntitlement {
  const { data, isLoading } = useSubscriptionQuery();
  const plan = useCustomerPlan();
  return {
    plan,
    isPaid:       data?.isPaid       === true || data?.isComplimentary === true || plan !== "free",
    isActive:     data?.isActive     === true,
    canLiveTrade: data?.canLiveTrade === true,
    isLoading,
  };
}

// Phase 6 — Upgrade event bridge.
//
// Customer-scoped surfaces nested deep inside the matrix (SignalRow, etc.)
// need to trigger the UpgradeModal that lives in PortalCustomerShell without
// threading a setter through 6 layers of memoized components. A tiny window
// CustomEvent gives us that bridge with zero prop plumbing and zero context
// rebuilds. The shell mounts a single listener; emitters call openUpgrade().
export const UPGRADE_EVENT = "aicandlez:open-upgrade" as const;
export function openUpgrade(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UPGRADE_EVENT));
}
