/**
 * UpgradeModal — Stripe-gated tier-upgrade flow for the customer terminal.
 *
 * Extracted from `pages/portal/AdminPortalLegacy.tsx` (Phase E3). Admin path
 * keeps its own local copy and is unchanged.
 *
 * Customer-surface copy fix (Phase E1 alignment): Pro plan capacity reads
 * "12 concurrent AI trades · crypto majors + alts + emerging" — the legacy
 * "crypto + equities" string predated the crypto-only customer scrub and is
 * stale per `replit.md`.
 */

import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Lock } from "lucide-react";

import { authFetch } from "@/lib/authFetch";
import { N, apiBaseUrl } from "./_shared";

export function UpgradeModal({ open, onClose, gate }: {
  open:    boolean;
  onClose: () => void;
  /**
   * Disclaimer-gate wrapper from `useDisclaimerGate`. Wraps the actual
   * checkout fetch so the modal flow is:
   *   click plan → gate(startCheckout) → if needsAcceptance: open disclaimer
   *   modal → on accept POST /api/user/disclaimer → run startCheckout →
   *   POST /api/billing/checkout → redirect to Stripe URL.
   */
  gate: (action: () => void) => void;
}) {
  const { getToken, isSignedIn } = useAuth();
  const [pending, setPending] = useState<"starter" | "pro" | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  if (!open) return null;

  const startCheckout = async (planId: "starter" | "pro") => {
    if (pending) return;
    setPending(planId);
    setError(null);
    try {
      if (!isSignedIn) {
        setError("Please sign in to upgrade your plan.");
        setPending(null);
        return;
      }
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/billing/checkout`, {
        method:      "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:        JSON.stringify({ planId }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      const isJson      = contentType.includes("application/json");
      const data = isJson
        ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string })
        : {};
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      console.error("[checkout] failed", {
        status:      res.status,
        contentType,
        url:         `${apiBaseUrl}/api/billing/checkout`,
        data,
      });
      const friendly =
        res.status === 401 ? "Your session expired. Please sign in again to continue."
        : res.status === 403 ? "Your account does not have permission to upgrade."
        : res.status === 429 ? "Too many attempts — please wait a moment and try again."
        : !isJson           ? "Checkout endpoint mis-routed (received HTML instead of JSON). Reach out to support — this is a config issue, not a card problem."
        : data.error
          ? `Stripe checkout could not start — ${data.error}.`
          : `Stripe checkout could not start (HTTP ${res.status}). Please try again.`;
      setError(friendly);
      setPending(null);
    } catch {
      setError("Network error. Check your connection and try again.");
      setPending(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460, width: "100%",
          background: N.SURFACE_1,
          border: `1px solid ${N.BRAND_DIM}`,
          borderRadius: 8,
          padding: 28,
          fontFamily: N.FONT_MONO,
          boxShadow: `0 0 40px ${N.BRAND_GLOW}, inset 0 0 40px ${N.BRAND}10`,
          position: "relative", overflow: "hidden",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${N.BRAND}, transparent)`,
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Lock size={18} color={N.BRAND} />
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: "0.22em",
            color: N.BRAND, textShadow: `0 0 8px ${N.BRAND_GLOW}`,
          }}>PREMIUM FEATURE · LIVE AI EXECUTION</span>
        </div>

        <h3 style={{
          fontSize: 22, color: N.TEXT_0, fontWeight: 800,
          margin: "8px 0 6px", lineHeight: 1.2,
        }}>
          Unlock live AI trading
        </h3>
        <p style={{ fontSize: 12, color: N.TEXT_1, lineHeight: 1.6, margin: "0 0 18px" }}>
          The Free tier is paper-trading only. Upgrade to unlock live AI
          execution capacity that scales with your tier. Select a plan to
          continue to secure Stripe checkout.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          <PlanCard plan="starter"
                    pending={pending === "starter"}
                    disabled={pending !== null}
                    onSelect={() => gate(() => { void startCheckout("starter"); })} />
          <PlanCard plan="pro"
                    pending={pending === "pro"}
                    disabled={pending !== null}
                    onSelect={() => gate(() => { void startCheckout("pro"); })} />
        </div>

        {error && (
          <div style={{
            fontSize: 10, letterSpacing: "0.14em",
            color: N.SHORT, textAlign: "center",
            margin: "0 0 10px",
          }}>{error}</div>
        )}

        <div style={{
          fontSize: 9, letterSpacing: "0.18em",
          color: N.TEXT_2, textAlign: "center",
          margin: "4px 0 0",
        }}>
          MONTHLY · CANCEL ANYTIME · STRIPE-SECURED CHECKOUT
        </div>

        <button
          onClick={onClose}
          style={{
            display: "block", margin: "14px auto 0",
            background: "transparent", border: "none",
            color: N.TEXT_2, fontSize: 10, letterSpacing: "0.18em",
            fontFamily: N.FONT_MONO, cursor: "pointer",
          }}>
          CONTINUE WITH PAPER TRADING
        </button>
      </div>
    </div>
  );
}

function PlanCard({
  plan, pending = false, disabled = false, onSelect,
}: {
  plan:      "starter" | "pro";
  pending?:  boolean;
  disabled?: boolean;
  onSelect:  () => void;
}) {
  const data = plan === "starter"
    ? { name: "AI Trading",     price: "$39.99", cap: "3 concurrent AI trades",                              color: N.BRAND }
    : { name: "AI Trading Pro", price: "$79.99", cap: "12 concurrent AI trades · crypto majors + alts + emerging", color: N.BRAND_BRT };
  const isDim = disabled && !pending;
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      style={{
        background: N.SURFACE_2,
        border: `1px solid ${data.color}${pending ? "" : "40"}`,
        borderRadius: 4,
        padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 14,
        width: "100%", textAlign: "left",
        cursor: disabled ? "default" : "pointer",
        opacity: isDim ? 0.5 : 1,
        fontFamily: N.FONT_MONO,
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        boxShadow: pending ? `0 0 22px ${data.color}55` : "none",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform   = "translateY(-1px)";
        e.currentTarget.style.boxShadow   = `0 0 22px ${data.color}55`;
        e.currentTarget.style.borderColor = data.color;
      }}
      onMouseLeave={(e) => {
        if (pending) return;
        e.currentTarget.style.transform   = "translateY(0)";
        e.currentTarget.style.boxShadow   = "none";
        e.currentTarget.style.borderColor = `${data.color}40`;
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: data.color, fontWeight: 800,
          letterSpacing: "0.18em", marginBottom: 2,
        }}>{data.name.toUpperCase()}</div>
        <div style={{ fontSize: 10, color: N.TEXT_2 }}>{data.cap}</div>
        <div style={{
          fontSize: 9, letterSpacing: "0.16em",
          color: pending ? data.color : N.TEXT_2,
          marginTop: 4, fontWeight: 700,
        }}>
          {pending ? "REDIRECTING TO STRIPE…" : `CHOOSE ${data.name.toUpperCase()} →`}
        </div>
      </div>
      <div style={{
        fontSize: 18, color: N.TEXT_0, fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        textShadow: `0 0 8px ${data.color}60`,
      }}>{data.price}<span style={{ fontSize: 10, color: N.TEXT_2 }}>/mo</span></div>
    </button>
  );
}
