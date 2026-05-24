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
import AdminPortalLegacy from "./portal/AdminPortalLegacy";

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

  if (isAdmin) {
    return <AdminPortalLegacy />;
  }

  return (
    <PaperTradesProvider>
      <PortalCustomerShell />
    </PaperTradesProvider>
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
          background: N.BRAND, boxShadow: `0 0 14px ${N.BRAND_GLOW}`,
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
            boxShadow: `0 0 14px ${N.BRAND_GLOW}`,
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
