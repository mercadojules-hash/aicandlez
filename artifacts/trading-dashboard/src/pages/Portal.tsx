/**
 * Portal — role-dispatching entry for the trading-dashboard `/portal` route.
 *
 * Phase E3 graduation (see .local/session_plan.md → T001):
 *   • Customer (non-admin) surface = graduated CommandDeck v3 terminal at
 *     `components/portal/PortalCustomerShell.tsx`. Crypto-only, paper-only,
 *     no ARM LIVE, no kill switch, no PAPER/LIVE toggle, no equities,
 *     no Alpaca affordances. Withdrawal permissions never requested.
 *   • Admin / super-admin surface (`admintrade.aicandlez.com`) is preserved
 *     byte-identical via `pages/portal/AdminPortalLegacy.tsx`, the wholesale
 *     pre-graduation Portal.tsx body. No admin behaviour may change.
 *
 * Hydration gate mirrors the previous staged behaviour so first paint does
 * not flash the wrong surface while `useUserRole()` resolves `/api/auth/me`.
 */

import { useEffect, useState } from "react";

import { useUserRole } from "../hooks/useUserRole";
import { PaperTradesProvider } from "../hooks/usePaperTrades";
import { PortalCustomerShell } from "../components/portal/PortalCustomerShell";
import { AdminPortalShell } from "../components/portal/AdminPortalShell";
import AdminPortalLegacy from "./portal/AdminPortalLegacy";

// Phase 1 admin-portal graduation rollback hatch.
// Default ON (use the graduated AdminPortalShell). Set
// `VITE_ADMIN_PORTAL_LEGACY=true` at build-time to fall back to the
// byte-frozen legacy admin terminal if a regression is found in prod.
const USE_LEGACY_ADMIN: boolean =
  (import.meta.env.VITE_ADMIN_PORTAL_LEGACY as string | undefined) === "true";

/**
 * Operator → customer-view override (production-capable).
 *
 * An operator/admin session normally renders `AdminPortalShell` at /portal.
 * This override lets that same operator intentionally render the customer
 * `PortalCustomerShell` (Candidate B) WITHOUT losing operator access — the
 * Clerk role is untouched, /command and every admin route still resolve to
 * the operator surface, and all server-side role checks remain enforced.
 *
 * Safety contract:
 *  • The flag ONLY ever lets an *admin* render the lower-privilege customer
 *    shell. It can never grant a non-admin the operator surface (a non-admin
 *    already gets the customer shell, and the server gates every /api/admin
 *    + operator route independently). No privilege escalation is possible.
 *  • Default (no override) preserves the locked admin → AdminPortalShell
 *    dispatch, so nothing changes for operators who don't opt in.
 *  • Persisted in localStorage so the choice survives navigation + reload;
 *    `?previewCustomer=1` sets it and `?previewCustomer=0` clears it.
 */
const OPERATOR_CUSTOMER_VIEW_KEY = "aicandlez:operator-customer-view";

function readOperatorCustomerView(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("previewCustomer");
    if (q === "1") {
      window.localStorage.setItem(OPERATOR_CUSTOMER_VIEW_KEY, "1");
      return true;
    }
    if (q === "0") {
      window.localStorage.removeItem(OPERATOR_CUSTOMER_VIEW_KEY);
      return false;
    }
    return window.localStorage.getItem(OPERATOR_CUSTOMER_VIEW_KEY) === "1";
  } catch {
    return false;
  }
}

const N = {
  BG:         "#000000",
  BORDER:     "rgba(255,255,255,0.08)",
  BRAND:      "#66FF66",
  BRAND_GLOW: "rgba(102,255,102,0.45)",
  TEXT_1:     "#A8B8B0",
  TEXT_2:     "#5F706A",
};

export default function Portal() {
  const { isAdmin, loading } = useUserRole();

  // Operator → customer-view override (persisted). Only meaningful for an
  // admin/operator session; a non-admin always renders the customer shell.
  const [operatorCustomerView, setOperatorCustomerView] =
    useState<boolean>(readOperatorCustomerView);

  const toggleOperatorCustomerView = () => {
    setOperatorCustomerView(prev => {
      const next = !prev;
      try {
        if (next) window.localStorage.setItem(OPERATOR_CUSTOMER_VIEW_KEY, "1");
        else window.localStorage.removeItem(OPERATOR_CUSTOMER_VIEW_KEY);
      } catch { /* localStorage unavailable — keep in-memory state only */ }
      return next;
    });
  };

  // After `?previewCustomer=1|0` has been applied to the persisted flag
  // (in readOperatorCustomerView), strip it from the URL so a shared link
  // can't silently force a viewer into the override.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("previewCustomer")) {
        url.searchParams.delete("previewCustomer");
        window.history.replaceState({}, "", url.toString());
      }
    } catch { /* URL/history unavailable — noop */ }
  }, []);

  // Staged hydration gate (preserves the no-flicker invariant from the
  // legacy Portal.tsx): 0–800ms spinner, post-800ms role-neutral
  // workstation skeleton. After role resolves we dispatch to the
  // graduated customer shell or the byte-identical admin legacy.
  const [gateTimedOut, setGateTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) { setGateTimedOut(false); return; }
    const id = setTimeout(() => setGateTimedOut(true), 800);
    return () => clearTimeout(id);
  }, [loading]);

  if (loading) {
    return gateTimedOut ? <SkeletonChrome /> : <ResolvingSession />;
  }

  // An operator may opt into the customer Candidate B surface without losing
  // operator access (Clerk role + /command untouched). Default (no override)
  // keeps the locked admin → AdminPortalShell dispatch.
  const operatorInCustomerView = isAdmin && operatorCustomerView;

  if (isAdmin && !operatorInCustomerView) {
    return (
      <>
        <OperatorViewToggle inCustomerView={false} onToggle={toggleOperatorCustomerView} />
        {USE_LEGACY_ADMIN ? <AdminPortalLegacy /> : <AdminPortalShell />}
      </>
    );
  }

  return (
    <PaperTradesProvider>
      {isAdmin && (
        <OperatorViewToggle inCustomerView onToggle={toggleOperatorCustomerView} />
      )}
      <PortalCustomerShell operatorPreview={isAdmin} />
    </PaperTradesProvider>
  );
}

/**
 * Floating operator-only toggle to switch /portal between the admin shell
 * and the customer Candidate B surface. Rendered ONLY for admin sessions
 * (see Portal dispatch). When the operator is viewing the customer shell it
 * turns amber + reads "Back to Admin" so the surface can never be mistaken
 * for a production regression. Clicking flips the persisted override.
 */
function OperatorViewToggle({
  inCustomerView,
  onToggle,
}: {
  inCustomerView: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={inCustomerView
        ? "Operator preview of the customer (Candidate B) portal. Click to return to the admin shell. Your operator access is unchanged."
        : "Preview the customer (Candidate B) portal without losing operator access."}
      style={{
        position: "fixed", bottom: 16, right: 16, zIndex: 2147483000,
        padding: "9px 15px",
        border: `1px solid ${inCustomerView ? "rgba(255,193,7,0.65)" : N.BRAND_GLOW}`,
        borderRadius: 6,
        background: inCustomerView ? "rgba(255,193,7,0.12)" : "rgba(102,255,102,0.10)",
        color: inCustomerView ? "#FFC107" : N.BRAND,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase",
        cursor: "pointer",
        backdropFilter: "blur(6px)",
        boxShadow: inCustomerView
          ? "0 0 14px rgba(255,193,7,0.30)"
          : `0 0 14px ${N.BRAND_GLOW}`,
      }}
    >
      {inCustomerView ? "● Operator · Back to Admin" : "View as Customer"}
    </button>
  );
}

function ResolvingSession() {
  return (
    <div style={{
      minHeight: "100vh", background: N.BG, color: N.TEXT_2,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: N.BRAND, boxShadow: `0 0 9px ${N.BRAND_GLOW}`,
          animation: "brand-pulse 1.2s ease-in-out infinite",
        }} />
        <span style={{ color: N.TEXT_2 }}>Resolving session…</span>
      </div>
    </div>
  );
}

function SkeletonChrome() {
  return (
    <div style={{
      minHeight: "100vh", background: N.BG, color: N.TEXT_1,
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: `1px solid ${N.BORDER}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", background: N.BRAND,
            boxShadow: `0 0 9px ${N.BRAND_GLOW}`,
            animation: "brand-pulse 1.2s ease-in-out infinite",
          }} />
          <span style={{ color: N.TEXT_2, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase" }}>
            AICandlez · Loading Workstation
          </span>
        </div>
        <span style={{ color: N.TEXT_2, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Resolving role · Telemetry Pending
        </span>
      </div>
      <div style={{ padding: 24, display: "grid", gap: 14 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 96, borderRadius: 6,
            border: `1px solid ${N.BORDER}`,
            background: `linear-gradient(90deg, ${N.BG} 0%, rgba(102,255,102,0.05) 50%, ${N.BG} 100%)`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.6s linear infinite",
          }} />
        ))}
      </div>
    </div>
  );
}
