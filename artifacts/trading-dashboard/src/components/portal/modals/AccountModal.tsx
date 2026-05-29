/**
 * AccountModal — customer-surface account & alert-preferences modal.
 *
 * Extracted from `pages/portal/AdminPortalLegacy.tsx` (Phase E3) so the
 * customer shell stops cross-importing from the admin module. Admin path
 * retains its own local copy and is unchanged.
 *
 * Crypto-only customer copy: the legacy "BROKER · ALPACA" row is intentionally
 * dropped on this surface — customer /portal is paper-only and does not route
 * orders to broker networks (see `replit.md` customer-vs-admin separation).
 */

import { useUser, useClerk, useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";

import { authFetch } from "@/lib/authFetch";
import {
  N, type Plan, apiBaseUrl, PortalModal, AccountRow,
  AlertPreferencesPanel, useAlertPreferences,
} from "./_shared";
import { fmtMoney } from "@/hooks/usePaperTrades";

export function AccountModal({
  open, onClose, tier, onUpgrade,
}: {
  open:      boolean;
  onClose:   () => void;
  tier:      Plan;
  onUpgrade: () => void;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const name  = user?.fullName || user?.firstName || user?.username || "Account";

  const planLabel =
    tier === "elite"   ? "AI Trading Elite VIP · $199.95 / mo"
    : tier === "pro"     ? "AI Trading Pro · $99.95 / mo"
    : tier === "starter" ? "AI Trading · $49.95 / mo"
    : "Paper Trading · Free";
  const planColor = tier === "free" ? N.TEXT_1 : N.BRAND;
  const capacity  =
    tier === "elite" ? "Up to 12 concurrent AI trades" :
    tier === "pro" ? "Up to 6 concurrent AI trades" :
    tier === "starter" ? "Up to 3 concurrent AI trades" :
    "Simulated only";

  type AccountSummary = { totalRealized?: number; totalFeesPaid?: number };
  const accountQuery = useQuery<AccountSummary>({
    queryKey: ["/api/account"],
    enabled:  open,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/account`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load account");
      return res.json();
    },
  });
  const totalRealized = accountQuery.data?.totalRealized ?? 0;
  const totalFeesPaid = accountQuery.data?.totalFeesPaid ?? 0;
  const realizedSign  = totalRealized >= 0 ? "+" : "";
  const realizedColor = totalRealized >= 0 ? N.LONG : N.SHORT;

  const openPortal = async () => {
    try {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/billing/portal`, {
        method: "POST", credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch { /* no-op */ }
  };

  const { loading, pendingKey, resolveAlert, setAlertPref } =
    useAlertPreferences(open);

  return (
    <PortalModal
      open={open} onClose={onClose}
      eyebrow="MY ACCOUNT · PORTAL"
      title={name}
      maxWidth={500}
    >
      <div style={{ fontSize: 11, color: N.TEXT_2, marginBottom: 18 }}>{email}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        <AccountRow label="CURRENT PLAN"   value={planLabel}      color={planColor} />
        <AccountRow label="CAPACITY"        value={capacity} />
        <AccountRow label="BILLING"         value={tier === "free" ? "—" : "Monthly · Stripe"} />
        <AccountRow label="PERFORMANCE FEE" value="3% on profitable trades only" sub="Never charged on losses" />
        <AccountRow
          label="TOTAL REALIZED PNL"
          value={`${realizedSign}${fmtMoney(totalRealized)}`}
          color={realizedColor}
          sub="Lifetime closed-trade PnL"
        />
        <AccountRow
          label="LIFETIME FEES"
          value={`−${fmtMoney(totalFeesPaid)}`}
          color={totalFeesPaid > 0 ? N.TEXT_0 : N.TEXT_2}
          sub="Performance fees on profitable closed trades"
        />
        {/* Customer surface is paper-only — no broker connection row. Real
            execution is routed by AICandlez through the operator terminal,
            not from this portal. See replit.md customer↔admin separation. */}
      </div>

      <AlertPreferencesPanel
        loading={loading}
        pendingKey={pendingKey}
        resolve={resolveAlert}
        onToggle={setAlertPref}
      />

      {tier === "free" ? (
        <button
          onClick={() => { onClose(); onUpgrade(); }}
          style={{
            display: "block", width: "100%",
            padding: "12px 16px",
            background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
            border: `1px solid ${N.BRAND}`,
            borderRadius: 4,
            color: "#001a0d", fontWeight: 800, fontSize: 11,
            letterSpacing: "0.18em",
            fontFamily: N.FONT_MONO, cursor: "pointer",
            boxShadow: `0 0 22px ${N.BRAND_GLOW}`,
          }}>
          UPGRADE TO AI TRADING →
        </button>
      ) : (
        <button
          onClick={openPortal}
          style={{
            display: "block", width: "100%",
            padding: "12px 16px",
            background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
            border: `1px solid ${N.BRAND}`,
            borderRadius: 4,
            color: "#001a0d", fontWeight: 800, fontSize: 11,
            letterSpacing: "0.18em",
            fontFamily: N.FONT_MONO, cursor: "pointer",
            boxShadow: `0 0 22px ${N.BRAND_GLOW}`,
          }}>
          MANAGE BILLING →
        </button>
      )}

      <button
        onClick={() => signOut()}
        style={{
          display: "block", width: "100%", marginTop: 10,
          padding: "10px 14px",
          background: "transparent",
          border: `1px solid ${N.BORDER_HI}`,
          borderRadius: 4,
          color: N.TEXT_1, fontWeight: 700, fontSize: 10,
          letterSpacing: "0.18em",
          fontFamily: N.FONT_MONO, cursor: "pointer",
        }}>
        SIGN OUT
      </button>
    </PortalModal>
  );
}
