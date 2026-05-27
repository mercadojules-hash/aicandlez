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

export type Plan = "free" | "starter" | "pro";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export function useCustomerPlan(): Plan {
  const { isSignedIn, getToken } = useAuth();
  const { data } = useQuery<{
    plan?:            string;
    isComplimentary?: boolean;
    effectivePlan?:   string;
  }>({
    queryKey: ["billing-subscription-portal-shell"],
    enabled:  isSignedIn ?? false,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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
  // Operator-granted complimentary entitlement collapses onto the effective
  // tier — without this every consumer renders complimentary users as FREE
  // despite the backend AI gate granting full live access.
  const p = data?.isComplimentary
    ? (data?.effectivePlan ?? "pro")
    : data?.plan;
  return p === "starter" || p === "pro" ? p : "free";
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
