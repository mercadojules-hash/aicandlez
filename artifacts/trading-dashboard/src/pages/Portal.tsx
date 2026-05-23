// ─────────────────────────────────────────────────────────────────────────────
// Portal — AICandlez Customer Dashboard
// ─────────────────────────────────────────────────────────────────────────────
// Public-facing institutional terminal. Same cinematic neon-green visual
// language as /command, but Alpaca-only — no operator controls, no Kraken,
// no admin left panel.
//
// Layout (top → bottom):
//   • Top utility bar (sign-out / social / upgrade)
//   • Logo banner with TIER badge
//   • 8 metric tiles
//   • MARKET HEARTBEAT (live cross-asset feed, glowing tiles)
//   • LIVE AI EXECUTION control bar — tier-gated:
//       free    → LOCKED · clicking opens UpgradeModal
//       starter → ARMED  · up to 3 concurrent
//       pro     → ARMED  · up to 12 concurrent
//   • TOP 20 CRYPTO SIGNALS + TOP 20 EQUITY SIGNALS (circular AI confidence
//     meters, BUY/SELL pills, momentum labels, animated sparklines)
//   • Active Trades · Trade History · Subscription · AI Auto Trade Queue
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useUser, useClerk, useAuth } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, X, Zap } from "lucide-react";

import { useUserRole } from "@/hooks/useUserRole";
import { useDisclaimerGate } from "@/hooks/useDisclaimerGate";
import { PortalExchangeConnectModal } from "@/components/PortalExchangeConnectModal";
import {
  MarketHeartbeat,
  CryptoSignalsPanel,
  EquitySignalsPanel,
  AIWarRoom,
} from "@/components/command/institutional";
import { N } from "@/components/command/institutional/theme";
import {
  ALERT_DEFINITIONS,
  ALERT_KEYS,
  type AlertKey,
  type AlertPrefs,
} from "@workspace/db/schema";
import type { EngineStatus } from "@/components/command/types";
import {
  PaperTradesProvider,
  fmtMoney,
  fmtQty,
  fmtTime,
} from "@/hooks/usePaperTrades";
import { toast } from "@/hooks/use-toast";
import { PortalModeProvider, usePortalMode, useStoredPortalMode, exchangeSupportsSandbox, type PortalMode } from "@/contexts/PortalModeContext";

const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// API base URL — in production the API lives on a different origin
// (api.aicandlez.com) supplied via VITE_API_BASE_URL. In dev it falls back to
// same-origin so the Vite proxy can route to the local api-server. NEVER use
// `basePath` for API calls — that points at the static SPA host, which
// returns index.html with status 200 for any /api/* path and causes silent
// "(HTTP 200)" failures in checkout, billing portal, subscription, etc.
const apiBaseUrl = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  basePath ??
  ""
).replace(/\/$/, "");

const j = <T,>(url: string) =>
  fetch(url, { cache: "no-store", credentials: "include" }).then(
    (r) => r.json() as Promise<T>,
  );

const Q_MEDIUM = { refetchInterval: 4_000, refetchOnWindowFocus: false, staleTime: 0 } as const;

// ── Social placeholders ──────────────────────────────────────────────────────
const SOCIAL = [
  { id: "x",  label: "X",  url: "https://x.com/aicandlez"        },
  { id: "ig", label: "IG", url: "https://instagram.com/aicandlez" },
  { id: "tt", label: "TT", url: "https://tiktok.com/@aicandlez"   },
  { id: "fb", label: "FB", url: "https://facebook.com/aicandlez"  },
  { id: "dc", label: "DC", url: "https://discord.gg/aicandlez"    },
  { id: "tg", label: "TG", url: "https://t.me/aicandlez"          },
] as const;

// ── Tier helpers ────────────────────────────────────────────────────────────
type Plan = "free" | "starter" | "pro";
function tierCapacity(plan: Plan): { cap: number; label: string } {
  if (plan === "pro")     return { cap: 12, label: "UP TO 12 CONCURRENT AI TRADES" };
  if (plan === "starter") return { cap: 3,  label: "UP TO 3 CONCURRENT AI TRADES"  };
  return { cap: 0, label: "SIMULATED ONLY · UPGRADE TO ENABLE LIVE EXECUTION" };
}

// ── Top utility bar ──────────────────────────────────────────────────────────
// All three nav items (MANAGE ACCOUNT · UPGRADE · DISCLAIMER) are modal
// triggers — no more routing into the admin/operator screens. They open
// portal-styled overlays that match the rest of the customer surface.
function TopBar({
  onAccount, onUpgrade, onDisclaimer, onConnectExchange, statusPill,
  isAdmin = false,
}: {
  onAccount:         () => void;
  onUpgrade:         () => void;
  onDisclaimer:      () => void;
  onConnectExchange: () => void;
  statusPill?:       React.ReactNode;
  // Admin operators never see the UPGRADE nav item — paywall UI is hidden
  // entirely on admintrade.aicandlez.com.
  isAdmin?:          boolean;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const display =
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "Account";

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(0,0,0,0.94)",
      backdropFilter: "blur(10px)",
      borderBottom: `1px solid ${N.BORDER}`,
      padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 18,
      fontFamily: N.FONT_MONO, fontSize: 11, letterSpacing: "0.08em",
    }}>
      <span style={{
        color: N.BRAND, fontWeight: 800,
        textShadow: `0 0 10px ${N.BRAND_GLOW}`,
      }}>AICANDLEZ</span>
      <span style={{ color: N.TEXT_2 }}>· {isAdmin ? "OPERATOR · LIVE" : "LIVE PORTAL"}</span>

      {statusPill}

      <div style={{ flex: 1 }} />

      {/* Primary onboarding CTA — opens the Connect-Exchange modal IN PLACE.
          Closing the X must keep the user on /portal (no cross-app navigation,
          no router push, no history mutation). Disclaimer gate runs first;
          on accept the modal opens, on cancel nothing happens. */}
      <button
        type="button"
        onClick={onConnectExchange}
        title="Connect Kraken, Coinbase, Binance or another exchange"
        style={{
          padding: "5px 12px",
          background: `linear-gradient(180deg, ${N.BRAND}22, ${N.BRAND}10)`,
          border: `1px solid ${N.BRAND}80`,
          borderRadius: 3,
          color: N.BRAND,
          fontSize: 10, fontWeight: 800,
          letterSpacing: "0.16em",
          fontFamily: N.FONT_MONO,
          textShadow: `0 0 8px ${N.BRAND_GLOW}`,
          boxShadow: `0 0 12px ${N.BRAND_GLOW}, inset 0 0 8px ${N.BRAND}18`,
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        ◆ CONNECT EXCHANGE
      </button>

      <NavButton onClick={onAccount}>MANAGE ACCOUNT</NavButton>
      {/* UPGRADE nav is customer-only — admins never see paywall CTAs. */}
      {!isAdmin && <NavButton onClick={onUpgrade}>UPGRADE</NavButton>}
      <NavButton onClick={onDisclaimer}>DISCLAIMER</NavButton>

      <div style={{ width: 1, height: 16, background: N.BORDER_HI }} />

      {SOCIAL.map((s) => (
        <a key={s.id} href={s.url} target="_blank" rel="noreferrer"
           title={s.label}
           style={{
             width: 22, height: 22, borderRadius: 3,
             border: `1px solid ${N.BORDER_HI}`,
             background: N.SURFACE_1,
             color: N.BRAND, textDecoration: "none",
             display: "inline-flex", alignItems: "center", justifyContent: "center",
             fontSize: 9, fontWeight: 700,
           }}>
          {s.label}
        </a>
      ))}

      <div style={{ width: 1, height: 16, background: N.BORDER_HI }} />

      <button
        onClick={onAccount}
        title="Manage account"
        style={{
          padding: "4px 10px",
          background: N.SURFACE_2,
          border: `1px solid ${N.BORDER_HI}`,
          borderRadius: 3,
          color: N.TEXT_0, fontSize: 10,
          fontFamily: N.FONT_MONO, cursor: "pointer",
          letterSpacing: "0.08em",
        }}>
        {display}
      </button>

      <button
        onClick={() => signOut()}
        style={{
          padding: "4px 10px",
          background: "transparent",
          border: `1px solid ${N.BORDER_HI}`,
          borderRadius: 3,
          color: N.TEXT_2, fontSize: 10,
          fontFamily: N.FONT_MONO, cursor: "pointer",
          letterSpacing: "0.08em",
        }}>
        SIGN OUT
      </button>
    </div>
  );
}

function NavButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent", border: "none", padding: "4px 0",
        color: N.TEXT_2, fontSize: 10, fontWeight: 600,
        letterSpacing: "0.12em", fontFamily: N.FONT_MONO, cursor: "pointer",
        transition: "color 160ms ease, text-shadow 160ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color      = N.BRAND;
        e.currentTarget.style.textShadow = `0 0 8px ${N.BRAND_GLOW}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color      = N.TEXT_2;
        e.currentTarget.style.textShadow = "none";
      }}>
      {children}
    </button>
  );
}

// ── Generic portal-styled modal shell (reused by Account + Disclaimer) ──────
function PortalModal({
  open, onClose, eyebrow, title, children, maxWidth = 500,
}: {
  open:     boolean;
  onClose:  () => void;
  eyebrow:  string;
  title:    string;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth, width: "100%",
          background: N.SURFACE_1,
          border: `1px solid ${N.BRAND_DIM}`,
          borderRadius: 8,
          padding: 28,
          fontFamily: N.FONT_MONO,
          boxShadow: `0 0 40px ${N.BRAND_GLOW}, inset 0 0 40px ${N.BRAND}10`,
          position: "relative", overflow: "hidden",
          maxHeight: "calc(100dvh - 48px)", overflowY: "auto",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${N.BRAND}, transparent)`,
        }} />

        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.22em",
          color: N.BRAND, textShadow: `0 0 8px ${N.BRAND_GLOW}`,
          marginBottom: 8,
        }}>{eyebrow}</div>
        <h3 style={{
          fontSize: 22, color: N.TEXT_0, fontWeight: 800,
          margin: "4px 0 14px", lineHeight: 1.2,
        }}>{title}</h3>

        {children}

        <button
          onClick={onClose}
          style={{
            display: "block", margin: "14px auto 0",
            background: "transparent", border: "none",
            color: N.TEXT_2, fontSize: 10, letterSpacing: "0.18em",
            fontFamily: N.FONT_MONO, cursor: "pointer",
          }}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

// ── Account Modal — customer-facing, no admin screens ───────────────────────
function AccountModal({
  open, onClose, tier, onUpgrade,
}: {
  open:     boolean;
  onClose:  () => void;
  tier:     Plan;
  onUpgrade: () => void;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const name  = user?.fullName || user?.firstName || user?.username || "Account";

  const planLabel =
    tier === "pro"     ? "AI Trading Pro · $79.99 / mo"
    : tier === "starter" ? "AI Trading · $39.99 / mo"
    : "Paper Trading · Free";
  const planColor = tier === "free" ? N.TEXT_1 : N.BRAND;
  const capacity  =
    tier === "pro" ? "Up to 12 concurrent AI trades" :
    tier === "starter" ? "Up to 3 concurrent AI trades" :
    "Simulated only";

  // Lifetime account stats — surfaces totalRealized PnL and totalFeesPaid
  // (broker commissions on every closed live leg) so the customer can audit
  // their equity drift against broker statements. Paper-only users see $0.
  type AccountSummary = {
    totalRealized?: number;
    totalFeesPaid?: number;
  };
  const accountQuery = useQuery<AccountSummary>({
    queryKey: ["/api/account"],
    enabled:  open,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/account`, {
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
      const res = await fetch(`${apiBaseUrl}/api/billing/portal`, {
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

  // ── Alert preferences (server-authoritative) ────────────────────────────────
  // Mirrors the mobile PWA Profile screen. Every ALERT_DEFINITIONS key is
  // mirrored into `user_settings.alertPrefs` server-side, so a customer can
  // mute any alert from anywhere — phone, tablet, desktop terminal — and the
  // backend push dispatcher honors it before sending. The query is keyed
  // identically to the PWA (`["/user/settings"]`) inside the same Clerk
  // session, so toggling on one surface invalidates the other.
  type UserSettingsPayload = {
    alertPrefs?:             AlertPrefs;
    notificationsLiveFills?: boolean;
  };
  const queryClient = useQueryClient();
  const settingsQuery = useQuery<UserSettingsPayload>({
    queryKey: ["/api/user/settings"],
    enabled:  open,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/user/settings`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  // Resolve a key's effective value: prefer server `alertPrefs[key]`, fall
  // back to the per-key `defaultOn` from ALERT_DEFINITIONS, and honor the
  // legacy `notificationsLiveFills` column for `liveTradeFilled` when no
  // alertPrefs row exists yet (rollout defense-in-depth).
  const resolveAlert = (key: AlertKey): boolean => {
    const stored = settingsQuery.data?.alertPrefs?.[key];
    if (typeof stored === "boolean") return stored;
    if (key === "liveTradeFilled"
        && typeof settingsQuery.data?.notificationsLiveFills === "boolean") {
      return settingsQuery.data.notificationsLiveFills;
    }
    return ALERT_DEFINITIONS.find((d) => d.key === key)?.defaultOn ?? true;
  };

  const alertPrefMutation = useMutation({
    mutationFn: async (patch: { key: AlertKey; value: boolean }) => {
      const token = await getToken().catch(() => null);
      const body: Record<string, unknown> = {
        alertPrefs: { [patch.key]: patch.value },
      };
      // Keep the legacy boolean column in sync for any downstream caller
      // still reading it (defense-in-depth during the alertPrefs rollout).
      if (patch.key === "liveTradeFilled") body.notificationsLiveFills = patch.value;
      const res = await fetch(`${apiBaseUrl}/api/user/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onMutate: async (patch: { key: AlertKey; value: boolean }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/user/settings"] });
      const prev = queryClient.getQueryData<UserSettingsPayload>(["/api/user/settings"]);
      const nextPrefs: AlertPrefs = { ...(prev?.alertPrefs ?? {}), [patch.key]: patch.value };
      const nextLegacy = patch.key === "liveTradeFilled"
        ? patch.value
        : prev?.notificationsLiveFills;
      queryClient.setQueryData<UserSettingsPayload>(["/api/user/settings"], {
        ...(prev ?? {}),
        alertPrefs: nextPrefs,
        notificationsLiveFills: nextLegacy,
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/user/settings"], ctx.prev);
      toast({ title: "Could not save preference", description: "Please try again." });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
    },
  });

  // Sanity guard — surface a typecheck failure if the shared taxonomy drifts.
  void ALERT_KEYS;

  return (
    <PortalModal
      open={open} onClose={onClose}
      eyebrow="MY ACCOUNT · PORTAL"
      title={name}
      maxWidth={500}
    >
      <div style={{ fontSize: 11, color: N.TEXT_2, marginBottom: 18 }}>{email}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        <AccountRow label="CURRENT PLAN"     value={planLabel}                color={planColor} />
        <AccountRow label="CAPACITY"          value={capacity} />
        <AccountRow label="BILLING"           value={tier === "free" ? "—" : "Monthly · Stripe"} />
        <AccountRow label="PERFORMANCE FEE"   value="3% on profitable trades only" sub="Never charged on losses" />
        <AccountRow
          label="TOTAL REALIZED PNL"
          value={`${realizedSign}${fmtMoney(totalRealized)}`}
          color={realizedColor}
          sub="Lifetime closed-trade PnL across paper + live"
        />
        <AccountRow
          label="LIFETIME BROKER FEES"
          value={`−${fmtMoney(totalFeesPaid)}`}
          color={totalFeesPaid > 0 ? N.TEXT_0 : N.TEXT_2}
          sub="Sum of entry + exit commissions on every closed live leg"
        />
        <AccountRow label="BROKER · ALPACA"   value="Not connected"           color={N.WARN} sub="Connection wizard launches with the Alpaca live keys" />
      </div>

      <AlertPreferencesPanel
        loading={settingsQuery.isLoading}
        pendingKey={alertPrefMutation.isPending
          ? (alertPrefMutation.variables?.key ?? null)
          : null}
        resolve={resolveAlert}
        onToggle={(key, next) => alertPrefMutation.mutate({ key, value: next })}
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

function AccountRow({ label, value, sub, color = N.TEXT_0 }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12,
      padding: "10px 12px",
      background: N.SURFACE_2,
      border: `1px solid ${N.BORDER}`,
      borderRadius: 4,
    }}>
      <div style={{
        fontSize: 9, color: N.TEXT_2, letterSpacing: "0.18em", fontWeight: 700,
        paddingTop: 2,
      }}>{label}</div>
      <div style={{ textAlign: "right", maxWidth: "65%" }}>
        <div style={{
          fontSize: 12, color, fontWeight: 700,
          textShadow: color !== N.TEXT_0 ? `0 0 6px ${color}40` : "none",
        }}>{value}</div>
        {sub && (
          <div style={{ fontSize: 9, color: N.TEXT_2, marginTop: 2, lineHeight: 1.4 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Alert toggle row — used inside AccountModal for notification prefs ──────
function AlertToggleRow({ label, sub, value, loading, onChange }: {
  label:    string;
  sub?:     string;
  value:    boolean;
  loading?: boolean;
  onChange: (next: boolean) => void;
}) {
  const track = value ? `${N.BRAND}55` : "rgba(255,255,255,0.10)";
  const knob  = value ? N.BRAND : N.TEXT_2;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 12,
      padding: "10px 12px",
      background: N.SURFACE_2,
      border: `1px solid ${N.BORDER}`,
      borderRadius: 4,
      opacity: loading ? 0.7 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 9, color: N.TEXT_2, letterSpacing: "0.18em", fontWeight: 700,
        }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 10, color: N.TEXT_1, marginTop: 4, lineHeight: 1.4 }}>
            {sub}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={loading}
        onClick={() => onChange(!value)}
        style={{
          flexShrink: 0,
          position: "relative",
          width: 40, height: 22,
          background: track,
          border: `1px solid ${value ? N.BRAND : N.BORDER_HI}`,
          borderRadius: 999,
          cursor: loading ? "wait" : "pointer",
          boxShadow: value ? `0 0 10px ${N.BRAND_GLOW}` : "none",
          transition: "background 160ms ease, box-shadow 160ms ease",
          padding: 0,
        }}>
        <span style={{
          position: "absolute", top: 2, left: value ? 20 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: knob,
          transition: "left 160ms ease, background 160ms ease",
          boxShadow: value ? `0 0 6px ${N.BRAND_GLOW}` : "none",
        }} />
      </button>
    </div>
  );
}

// ── Alert preferences panel — full ALERT_DEFINITIONS taxonomy ───────────────
// Renders inside AccountModal. Mirrors the PWA Profile screen so a customer
// can mute every alert type from the desktop terminal as well as their phone.
// All toggles write to `user_settings.alertPrefs[<key>]` via PUT /user/settings.
function AlertPreferencesPanel({
  loading, pendingKey, resolve, onToggle,
}: {
  loading:    boolean;
  pendingKey: AlertKey | null;
  resolve:    (key: AlertKey) => boolean;
  onToggle:   (key: AlertKey, next: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 9, color: N.TEXT_2, letterSpacing: "0.22em", fontWeight: 700,
        padding: "0 2px 8px",
      }}>
        NOTIFICATION PREFERENCES
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        opacity: loading ? 0.55 : 1,
      }}>
        {ALERT_DEFINITIONS.map((d) => (
          <AlertToggleRow
            key={d.key}
            label={d.label.toUpperCase()}
            sub={d.sub}
            value={resolve(d.key)}
            loading={loading || pendingKey === d.key}
            onChange={(next) => onToggle(d.key, next)}
          />
        ))}
      </div>
      <div style={{
        marginTop: 8, padding: "8px 10px",
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${N.BORDER}`,
        borderRadius: 4,
        fontSize: 9, color: N.TEXT_2, lineHeight: 1.5,
        letterSpacing: "0.04em",
      }}>
        Preferences sync with the mobile app · Server-side push dispatcher honors every toggle before sending.
      </div>
    </div>
  );
}

// ── Disclaimer Modal — full risk language, no blank page ────────────────────
function DisclaimerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const points = [
    "AI trading involves substantial risk. You can lose some or all of your invested capital.",
    "Results are not guaranteed. Algorithmic signals are based on historical data and statistical models — they do not predict the future with certainty.",
    "Past performance does not guarantee future results. Backtests, demo telemetry, and paper-trading metrics are not indicative of live outcomes.",
    "You are solely responsible for your trading decisions. AICandlez is software that automates execution based on your configured tier and risk parameters — final responsibility for every trade rests with you.",
    "Paper trading differs from live trading. Spreads, slippage, fills, fees, and emotional response are materially different in real markets.",
    "Market volatility can result in losses, including rapid losses outside trading hours, during news events, or in low-liquidity conditions.",
    "AICandlez is not financial, legal, or tax advice. Consult a licensed professional before making investment decisions.",
    "Performance fees are charged on profitable closed trades only — never on losses. Subscription fees are billed monthly and can be cancelled at any time.",
  ];
  return (
    <PortalModal
      open={open} onClose={onClose}
      eyebrow="LEGAL · RISK DISCLOSURE"
      title="Trading risk disclaimer"
      maxWidth={600}
    >
      <p style={{
        fontSize: 12, color: N.TEXT_1, lineHeight: 1.6, margin: "0 0 16px",
      }}>
        Please read the following carefully before enabling live AI execution.
        By continuing to use AICandlez you acknowledge that you have read and
        understood these terms.
      </p>

      <ul style={{
        listStyle: "none", padding: 0, margin: 0,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {points.map((p, i) => (
          <li key={i} style={{
            display: "flex", gap: 10,
            padding: "10px 12px",
            background: N.SURFACE_2,
            border: `1px solid ${N.BORDER}`,
            borderRadius: 4,
            fontSize: 11, color: N.TEXT_1, lineHeight: 1.55,
          }}>
            <span style={{
              flexShrink: 0,
              width: 18, height: 18, borderRadius: "50%",
              background: `${N.BRAND}14`,
              border: `1px solid ${N.BRAND}40`,
              color: N.BRAND, fontSize: 9, fontWeight: 800,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 8px ${N.BRAND_GLOW}`,
            }}>{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div style={{
        marginTop: 16,
        padding: "10px 12px",
        background: `${N.WARN}10`,
        border: `1px solid ${N.WARN}40`,
        borderRadius: 4,
        fontSize: 10, color: N.WARN, lineHeight: 1.5,
        letterSpacing: "0.04em",
      }}>
        AICandlez never requests withdrawal permissions from your connected
        broker. We only execute the trades you've authorized within your tier
        capacity.
      </div>
    </PortalModal>
  );
}

// ── Centered logo banner ─────────────────────────────────────────────────────
// Official AICandlez horizontal master logo. Sits on a soft animated aura
// — minimal, premium, never cartoonish. Bigger hero presence on desktop,
// scales down proportionally on mobile via CSS clamp().
function LogoBanner({ tier, isAdmin = false }: { tier: Plan; isAdmin?: boolean }) {
  return (
    <div style={{
      padding: "44px 24px 26px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      position: "relative",
    }}>
      {/* Outer breathing aura — soft, premium, slow */}
      <div style={{
        position: "absolute",
        top: "30%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(640px, 70vw)", height: 180,
        background: `radial-gradient(ellipse at center, ${N.BRAND}28 0%, ${N.BRAND_GLOW} 38%, transparent 75%)`,
        filter: "blur(36px)",
        pointerEvents: "none",
        animation: "aura-breathe 7s ease-in-out infinite",
      }} />
      {/* Tight inner halo right under the wordmark */}
      <div style={{
        position: "absolute",
        top: "calc(30% + 8px)", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(360px, 50vw)", height: 60,
        background: `radial-gradient(ellipse at center, ${N.BRAND_GLOW} 0%, transparent 70%)`,
        filter: "blur(14px)",
        pointerEvents: "none",
      }} />

      <img
        src={`${basePath}/aicandlez-logo.png`}
        alt="AICandlez"
        style={{
          height: "clamp(48px, 7vw, 80px)",
          width: "auto",
          maxWidth: "min(560px, 86vw)",
          position: "relative", zIndex: 1,
          filter: `drop-shadow(0 0 14px ${N.BRAND_GLOW}) drop-shadow(0 0 28px ${N.BRAND}30)`,
        }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />

      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        position: "relative", zIndex: 1, marginTop: 2,
        flexWrap: "wrap", justifyContent: "center",
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "4px 12px",
          background: `${N.LONG}0d`,
          border: `1px solid ${N.LONG}40`,
          borderRadius: 999,
          color: N.LONG,
          fontFamily: N.FONT_MONO, fontSize: 9, letterSpacing: "0.28em",
          fontWeight: 700,
          textShadow: `0 0 6px ${N.LONG_GLOW}`,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: N.LONG,
            boxShadow: `0 0 8px ${N.LONG}, 0 0 18px ${N.LONG_GLOW}`,
            animation: "live-breathe 2.4s ease-in-out infinite",
          }} />
          LIVE
        </span>

        {/* Admins never see a customer "TIER · PRO" tag — instead an explicit
            operator pill that reads as institutional ops, not paywall. */}
        <span style={{
          padding: "4px 14px",
          background: N.SURFACE_2,
          border: `1px solid ${isAdmin || tier !== "free" ? `${N.BRAND}55` : N.BORDER_HI}`,
          borderRadius: 999,
          fontFamily: N.FONT_MONO, fontSize: 10,
          color: isAdmin || tier !== "free" ? N.BRAND : N.TEXT_1,
          letterSpacing: "0.18em", fontWeight: 700,
          boxShadow: isAdmin || tier !== "free" ? `0 0 14px ${N.BRAND_GLOW}` : "none",
        }}>
          {isAdmin ? "ADMIN · OPERATOR" : `TIER · ${tier.toUpperCase()}`}
        </span>
      </div>

      <style>{`
        @keyframes live-breathe {
          0%,100% { opacity: 1;    transform: scale(1);    box-shadow: 0 0 8px ${N.LONG}, 0 0 14px ${N.LONG_GLOW}; }
          50%     { opacity: 0.55; transform: scale(1.18); box-shadow: 0 0 4px ${N.LONG}, 0 0  8px ${N.LONG_GLOW}; }
        }
        @keyframes aura-breathe {
          0%,100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1);    }
          50%     { opacity: 1;    transform: translate(-50%, -50%) scale(1.08); }
        }
        @keyframes neon-pulse {
          0%,100% { opacity: 1;   transform: scale(1);   }
          50%     { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes shimmer-sweep {
          0%   { transform: translateX(-130%); }
          100% { transform: translateX(230%);  }
        }
      `}</style>
    </div>
  );
}

// ── Metric tile ──────────────────────────────────────────────────────────────
function MetricTile({
  label, value, delta, positive = true, accent = N.BRAND, demo = false,
}: {
  label: string; value: string; delta?: string;
  positive?: boolean; accent?: string; demo?: boolean;
}) {
  return (
    <div style={{
      background: N.SURFACE_1,
      border: `1px solid ${N.BORDER}`,
      borderRadius: 6,
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 6,
      minHeight: 92,
      position: "relative", overflow: "hidden",
      fontFamily: N.FONT_MONO,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        opacity: 0.55,
      }} />
      <div style={{
        fontSize: 9, color: N.TEXT_2,
        letterSpacing: "0.16em", fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>{label}</span>
        {demo && (
          <span
            title="Demo telemetry shown until live broker is connected"
            style={{
              fontSize: 7, padding: "1px 5px", borderRadius: 2,
              background: `${N.WARN}18`, color: N.WARN,
              border: `1px solid ${N.WARN}40`,
              letterSpacing: "0.18em", fontWeight: 700,
              cursor: "help",
            }}>DEMO</span>
        )}
      </div>
      <div style={{
        fontSize: 22, color: N.TEXT_0, fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        textShadow: positive ? `0 0 12px ${N.BRAND}22` : "none",
      }}>{value}</div>
      {delta && (
        <div style={{
          fontSize: 10,
          color: positive ? N.LONG : N.SHORT, fontWeight: 600,
        }}>{positive ? "▲" : "▼"} {delta}</div>
      )}
    </div>
  );
}

// ── Live AI Execution control bar (tier-gated) ───────────────────────────────
/**
 * Lightweight exchange-status hook. Read-only; never mutates server state.
 * Used by the dashboard header pill, onboarding banner, and live-mode guardrail.
 */
interface ExchangeStatusEntry {
  exchange:    string;
  connected:   boolean;
  tradingMode?: string;
  permissions?: { read?: boolean; trade?: boolean };
  connection?: { status?: string; lastError?: string | null } | null;
}
interface ExchangeStatus {
  connectedCount: number;
  liveCount:      number;
  anyHealthy:     boolean;
  lastSyncedAt:   number;
  alpacaOauthErrored: boolean;
  alpacaLastError:    string | null;
  /** ID of the user's default connected exchange (e.g. "Binance"), or null. */
  defaultExchange:    string | null;
}
function useExchangeStatus(): ExchangeStatus {
  const { data } = useQuery({
    queryKey: ["portal-exchanges-status"],
    queryFn:  async () => {
      const r = await fetch(`${apiBaseUrl}/api/user/exchanges`, { credentials: "include" });
      if (!r.ok) return { exchanges: [] as ExchangeStatusEntry[] };
      return r.json() as Promise<{ exchanges: ExchangeStatusEntry[] }>;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
  const list = data?.exchanges ?? [];
  const connected = list.filter(e => e.connected);
  const defaultExchange =
    (list.find(e => (e as { isDefault?: boolean }).isDefault)?.exchange)
    ?? connected[0]?.exchange
    ?? null;
  const alpaca = connected.find(e => e.exchange === "Alpaca");
  const alpacaErr = alpaca?.connection?.lastError ?? null;
  const alpacaErrHint = alpacaErr?.toLowerCase() ?? "";
  const alpacaOauthErrored =
    alpaca?.connection?.status === "error" &&
    !!alpacaErr &&
    (alpacaErrHint.includes("oauth")
      || alpacaErrHint.includes("refresh")
      || alpacaErrHint.includes("token"));
  return {
    connectedCount: connected.length,
    liveCount:      connected.filter(e => e.tradingMode === "live").length,
    anyHealthy:     connected.some(e => e.permissions?.read !== false),
    lastSyncedAt:   Date.now(),
    alpacaOauthErrored,
    alpacaLastError: alpacaOauthErrored ? alpacaErr : null,
    defaultExchange,
  };
}

// ── Alpaca OAuth reconnect banner ──────────────────────────────────────────
// Shows whenever the background AlpacaTokenRefresher has marked the user's
// Alpaca connection status="error" with an OAuth-refresh-style `lastError`.
// CTA opens the same one-click OAuth popup OnboardingFlow uses. Banner clears
// the moment the next /api/user/exchanges poll reports status back to active.
interface AlpacaOauthCfgResp { enabled: boolean; authorizeUrl?: string }
function AlpacaReconnectBanner({ lastError }: { lastError: string | null }) {
  const qc = useQueryClient();
  const { data: cfg } = useQuery<AlpacaOauthCfgResp>({
    queryKey: ["portal-alpaca-oauth-config"],
    queryFn: async () => {
      const r = await fetch(`${apiBaseUrl}/api/user/exchanges/alpaca/oauth/config`, { credentials: "include" });
      if (!r.ok) return { enabled: false };
      return r.json() as Promise<AlpacaOauthCfgResp>;
    },
    staleTime: 60_000,
  });
  const [popupErr, setPopupErr] = useState<string | null>(null);
  const oauthEnabled = cfg?.enabled === true && !!cfg?.authorizeUrl;

  const onReconnect = () => {
    setPopupErr(null);
    if (!oauthEnabled || !cfg?.authorizeUrl) {
      setPopupErr("One-click reconnect unavailable — please re-enter your Alpaca keys via Connect Exchange.");
      return;
    }
    const popup = window.open(
      cfg.authorizeUrl,
      "aicandlez-alpaca-oauth",
      "width=520,height=720,menubar=no,toolbar=no",
    );
    if (!popup) {
      setPopupErr("Popup blocked — please allow popups for AICandlez and try again.");
      return;
    }
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { source?: string; ok?: boolean; error?: string } | null;
      if (!data || data.source !== "aicandlez:alpaca-oauth") return;
      window.removeEventListener("message", onMessage);
      if (data.ok) {
        qc.invalidateQueries({ queryKey: ["portal-exchanges-status"] });
        qc.invalidateQueries({ queryKey: ["portal-user-exchange-balances"] });
      } else {
        setPopupErr(data.error ?? "Alpaca did not authorize the connection.");
      }
    };
    window.addEventListener("message", onMessage);
  };

  const WARN = "#FFB020";
  return (
    <div style={{
      margin: "12px 16px 0",
      padding: "12px 16px",
      borderRadius: 6,
      border: `1px solid ${WARN}55`,
      background: `linear-gradient(180deg, ${WARN}14, ${WARN}06)`,
      boxShadow: `inset 0 0 24px ${WARN}10`,
      fontFamily: N.FONT_MONO,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.20em",
        color: WARN, textShadow: `0 0 6px ${WARN}66`,
      }}>
        ⚠ ALPACA NEEDS TO BE RECONNECTED · LIVE EXECUTION PAUSED
      </div>
      <div style={{ fontSize: 10.5, color: N.TEXT_2, lineHeight: 1.55 }}>
        Your Alpaca authorization expired or was revoked, so AI trades can no
        longer reach your brokerage account. Reconnect in one click to resume
        live execution.
      </div>
      {lastError && (
        <div style={{
          fontSize: 10, color: N.TEXT_3, lineHeight: 1.5,
          padding: "6px 10px", borderRadius: 4,
          background: "rgba(0,0,0,0.30)", border: `1px solid ${WARN}25`,
          wordBreak: "break-word",
        }}>
          {lastError}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onReconnect}
          style={{
            padding: "6px 16px",
            background: `${WARN}20`,
            border: `1px solid ${WARN}`,
            borderRadius: 3,
            color: WARN,
            fontWeight: 800, fontSize: 10, letterSpacing: "0.18em",
            fontFamily: N.FONT_MONO, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {oauthEnabled ? "RECONNECT ALPACA →" : "RE-ENTER ALPACA KEYS →"}
        </button>
        {popupErr && (
          <span style={{ fontSize: 10, color: "#ff8088", lineHeight: 1.45 }}>{popupErr}</span>
        )}
      </div>
    </div>
  );
}

// ── Live balance hook (customer per-user exchange balances) ──────────────────
// Fetches /api/user/exchanges/balances every 30s + on focus once the user has
// at least one connection. Returns aggregated USD equity plus the most-recent
// per-connection USD free balance (used as "buying power" on the hero tile).
// Falls back to nulls when no live data is available so the Portal can keep
// rendering the simulated hero.
interface LiveBalancesView {
  ready:           boolean;
  hasOk:           boolean;
  totalEquityUSD:  number | null;
  buyingPowerUSD:  number | null;
  primaryExchange: string | null;
  connections:     Array<{
    exchange:       string;
    ok:             boolean;
    totalEquityUSD: number;
    usdFree:        number;
    error?:         string;
  }>;
}
function useLiveExchangeBalances(enabled: boolean): LiveBalancesView {
  const { data } = useQuery({
    queryKey: ["portal-user-exchange-balances"],
    enabled,
    queryFn: async () => {
      const r = await fetch(`${apiBaseUrl}/api/user/exchanges/balances`, {
        credentials: "include", cache: "no-store",
      });
      if (!r.ok) return null;
      return r.json() as Promise<{
        connections: Array<{
          exchange:       string;
          ok:             boolean;
          totalEquityUSD: number;
          balances:       Record<string, { free: number; locked: number; total: number }>;
          error?:         string;
        }>;
        totalEquityUSD: number;
        fetchedAt:      number;
      }>;
    },
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
  });

  if (!data) {
    return {
      ready: false, hasOk: false,
      totalEquityUSD: null, buyingPowerUSD: null, primaryExchange: null,
      connections: [],
    };
  }
  const connections = data.connections.map(c => ({
    exchange:       c.exchange,
    ok:             c.ok,
    totalEquityUSD: c.totalEquityUSD,
    usdFree:        c.balances?.["USD"]?.free
                  ?? c.balances?.["USDT"]?.free
                  ?? c.balances?.["USDC"]?.free
                  ?? 0,
    ...(c.error ? { error: c.error } : {}),
  }));
  const okOnes = connections.filter(c => c.ok);
  const primary = okOnes[0] ?? null;
  const buyingPowerUSD = okOnes.reduce((s, c) => s + (Number.isFinite(c.usdFree) ? c.usdFree : 0), 0);
  return {
    ready:           true,
    hasOk:           okOnes.length > 0,
    totalEquityUSD:  okOnes.length > 0 ? data.totalEquityUSD : null,
    buyingPowerUSD:  okOnes.length > 0 ? buyingPowerUSD : null,
    primaryExchange: primary?.exchange ?? null,
    connections,
  };
}

/** Header status pill — shows connection / mode state at a glance.
 *  Admin override: when running on the institutional terminal (isAdmin), the
 *  pill reflects the server-side Kraken live-broker telemetry instead of the
 *  per-user `user_exchange_connections` table. Admins use server-env Kraken
 *  keys, so they never appear in the per-user table — without this override
 *  the pill would always read "NO EXCHANGE · SIM MODE" for operators. */
function ExchangeStatusPill({
  status,
  adminOverride,
}: {
  status: ExchangeStatus;
  adminOverride?: { source: "live" | "error" | "standby" | "simulation" | null; exchange: string };
}) {
  // Admin operator path — institutional live-broker pill. We render the
  // admin pill even on first paint (source === null → "CONNECTING") so the
  // operator never briefly sees the customer "NO EXCHANGE · SIM MODE"
  // fallback while the first /exchange/balances poll is in flight.
  if (adminOverride) {
    const ex = adminOverride.exchange;
    const isLive    = adminOverride.source === "live";
    const isError   = adminOverride.source === "error";
    const isLoading = adminOverride.source === null;
    const color = isLive
      ? N.BRAND
      : isError
        ? "#ff3355"
        : isLoading
          ? N.TEXT_3
          : N.WARN;
    const glow  = isLive
      ? `0 0 10px ${N.BRAND_GLOW}`
      : isError
        ? "0 0 10px #ff335580"
        : isLoading
          ? "none"
          : `0 0 8px ${N.WARN}60`;
    const label = isLive
      ? `${ex} LIVE · REAL CAPITAL`
      : isError
        ? `${ex} AUTH FAILED`
        : isLoading
          ? `${ex} CONNECTING…`
          : `${ex} STANDBY`;
    return (
      <span
        title={
          isLive
            ? `${ex} broker round-trip OK · live execution armed`
            : isError
              ? `${ex} API auth failed — keys present but rejected`
              : isLoading
                ? `${ex} initial broker handshake in flight`
                : `${ex} keys not configured — operator standby`
        }
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 9px", borderRadius: 3,
          border: `1px solid ${color}55`,
          background: `${color}10`,
          color, fontSize: 9, fontWeight: 700,
          letterSpacing: "0.16em", fontFamily: N.FONT_MONO,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 99,
          background: color, boxShadow: glow,
          animation: isLive ? "dot-pulse 1.6s ease-in-out infinite" : undefined,
        }} />
        {label}
      </span>
    );
  }

  // Customer path — per-user exchange connections.
  const { connectedCount, liveCount } = status;
  const noneConnected = connectedCount === 0;
  const isLive        = liveCount > 0;
  const color  = noneConnected ? N.TEXT_3 : isLive ? "#ff3355" : N.BRAND;
  const glow   = noneConnected ? "none"    : isLive ? "0 0 8px #ff335580" : `0 0 8px ${N.BRAND_GLOW}`;
  const label  = noneConnected
    ? "NO EXCHANGE · SIM MODE"
    : isLive
      ? `LIVE · ${connectedCount} CONNECTED`
      : `SIM · ${connectedCount} CONNECTED`;
  return (
    <span
      title={
        noneConnected
          ? "No exchange connected — paper trading only"
          : isLive
            ? `${liveCount} of ${connectedCount} exchange(s) in live mode`
            : `${connectedCount} exchange(s) connected · simulation only`
      }
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 9px", borderRadius: 3,
        border: `1px solid ${color}55`,
        background: `${color}10`,
        color, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.16em", fontFamily: N.FONT_MONO,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 99,
        background: color, boxShadow: glow,
      }} />
      {label}
    </span>
  );
}

/** Warning banner — surfaces connections returning ok:false from
 *  /api/user/exchanges/balances (auth failures, network timeouts, revoked
 *  keys, etc). Dismissible per error-set: once the underlying error changes
 *  or new failures appear the banner returns. CTA opens the in-app
 *  PortalExchangeConnectModal so the user can re-enter credentials. */
function ExchangeWarningBanner({
  failing,
  onReconnect,
}: {
  failing: Array<{ exchange: string; error?: string }>;
  onReconnect: () => void;
}) {
  const fingerprint = failing
    .map(f => `${f.exchange}::${f.error ?? ""}`)
    .sort()
    .join("|");
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Reset dismissal whenever the underlying failure set changes.
  useEffect(() => {
    if (dismissed && dismissed !== fingerprint) setDismissed(null);
  }, [fingerprint, dismissed]);
  if (failing.length === 0 || dismissed === fingerprint) return null;
  const WARN = "#FFB020";
  return (
    <div style={{
      margin: "12px 16px 0",
      padding: "12px 16px",
      borderRadius: 6,
      border: `1px solid ${WARN}55`,
      background: `linear-gradient(180deg, ${WARN}14, ${WARN}06)`,
      boxShadow: `inset 0 0 24px ${WARN}10`,
      fontFamily: N.FONT_MONO,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.20em",
          color: WARN, textShadow: `0 0 6px ${WARN}66`,
        }}>
          ⚠ EXCHANGE CONNECTION UNHEALTHY · LIVE DATA UNAVAILABLE
        </div>
        <button
          type="button"
          onClick={() => setDismissed(fingerprint)}
          title="Dismiss until error changes"
          style={{
            background: "transparent", border: "none", color: N.TEXT_3,
            fontSize: 14, lineHeight: 1, cursor: "pointer", padding: 4,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {failing.map(f => (
          <div key={f.exchange} style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: "8px 10px", borderRadius: 4,
            background: "rgba(0,0,0,0.30)", border: `1px solid ${WARN}25`,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.16em",
              color: N.TEXT_0, minWidth: 86,
            }}>{f.exchange.toUpperCase()}</span>
            <span style={{
              flex: 1, minWidth: 200,
              fontSize: 10, color: N.TEXT_2, lineHeight: 1.5,
              fontFamily: N.FONT_MONO, wordBreak: "break-word",
            }}>
              {f.error ?? "Connection failed — exchange did not respond."}
            </span>
            <button
              type="button"
              onClick={onReconnect}
              style={{
                padding: "5px 12px",
                background: `${WARN}20`,
                border: `1px solid ${WARN}`,
                borderRadius: 3,
                color: WARN,
                fontWeight: 800, fontSize: 9, letterSpacing: "0.18em",
                fontFamily: N.FONT_MONO, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              RECONNECT →
            </button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: N.TEXT_3, letterSpacing: "0.14em" }}>
        FALLBACK · SIMULATED BALANCES SHOWN UNTIL THE CONNECTION RECOVERS
      </div>
    </div>
  );
}

/** Subtle onboarding banner for first-time users with no connected exchanges.
 *  Clicking the CTA opens the in-app PortalExchangeConnectModal — it must NEVER
 *  cross-host redirect to app.aicandlez.com. Customers stay inside dashboard
 *  /portal during onboarding; the modal handles disclaimer + paid-tier
 *  membership gating server-side. */
function ExchangeOnboardingBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div style={{
      margin: "12px 16px 0",
      padding: "14px 18px",
      borderRadius: 6,
      border: `1px solid ${N.BRAND}45`,
      background: `linear-gradient(180deg, ${N.BRAND}10, ${N.BRAND}04)`,
      boxShadow: `inset 0 0 30px ${N.BRAND}10`,
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
      fontFamily: N.FONT_MONO,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        border: `1px solid ${N.BRAND}80`,
        background: N.SURFACE_2,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 14px ${N.BRAND_GLOW}`,
        flexShrink: 0,
      }}>
        <Zap size={18} color={N.BRAND} style={{ filter: `drop-shadow(0 0 6px ${N.BRAND})` }} />
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.20em",
          color: N.BRAND, textShadow: `0 0 6px ${N.BRAND_GLOW}`,
        }}>
          CONNECT YOUR EXCHANGE TO ENABLE LIVE AI TRADING
        </div>
        <div style={{ fontSize: 10, color: N.TEXT_2, marginTop: 4, lineHeight: 1.55 }}>
          AICandlez <strong style={{ color: N.TEXT_0 }}>never holds your funds</strong> — your
          balance stays on your exchange at all times. Credentials are AES-256 encrypted,
          and <strong style={{ color: N.TEXT_0 }}>withdrawal permissions are never requested</strong>.
        </div>
        <div style={{
          fontSize: 8, color: N.TEXT_3, letterSpacing: "0.18em", marginTop: 6,
        }}>
          SUPPORTED · ALPACA · KRAKEN · COINBASE · CRYPTO.COM · BINANCE
        </div>
      </div>
      <button
        type="button"
        onClick={onConnect}
        style={{
          padding: "8px 18px",
          background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
          border: `1px solid ${N.BRAND}`,
          borderRadius: 4,
          color: "#001a0d",
          fontWeight: 800, fontSize: 11, letterSpacing: "0.18em",
          fontFamily: N.FONT_MONO, textDecoration: "none", cursor: "pointer",
          boxShadow: `0 0 22px ${N.BRAND_GLOW}`,
          whiteSpace: "nowrap",
        }}
      >
        CONNECT EXCHANGE →
      </button>
    </div>
  );
}

function LiveExecutionBar({
  tier, onUpgrade, onConnectExchange, exchangeConnected, openSlots, isAdmin = false,
}: {
  tier: Plan;
  onUpgrade: () => void;
  onConnectExchange: () => void;
  exchangeConnected: boolean;
  openSlots: number;
  isAdmin?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  // Admin operators on admintrade.aicandlez.com must NEVER see a locked
  // Live AI Execution control. They get unlimited live access with a 30-slot
  // concurrent cap, regardless of subscription state or whether a per-user
  // Kraken row exists in the DB — the platform's Kraken keys are server-side
  // env-provisioned and admins operate against that shared live account.
  const tierLocked     = !isAdmin && tier === "free";
  const exchangeLocked = !isAdmin && !exchangeConnected;
  const locked         = tierLocked || exchangeLocked;
  const cap            = isAdmin
    ? { cap: 30, label: "UP TO 30 CONCURRENT LIVE TRADES · KRAKEN · ADMIN" }
    : tierCapacity(tier);

  // Auto-disarm if the exchange disconnects mid-session.
  useEffect(() => {
    if (exchangeLocked && armed) setArmed(false);
  }, [exchangeLocked, armed]);

  const handle = () => {
    if (tierLocked)     { onUpgrade(); return; }
    if (exchangeLocked) { onConnectExchange(); return; }
    setArmed(a => !a);
  };

  const ringColor = locked ? N.TEXT_3 : armed ? N.LONG : N.BRAND;
  const ringGlow  = locked ? "none" : `0 0 22px ${armed ? N.LONG_GLOW : N.BRAND_GLOW}`;

  return (
    <section
      className="px-2"
      style={{ fontFamily: N.FONT_MONO }}
    >
      <div style={{
        position: "relative",
        background: `linear-gradient(180deg, ${N.SURFACE_1} 0%, ${N.BG} 100%)`,
        border: `1px solid ${locked ? N.BORDER_HI : N.BORDER_LV}`,
        borderRadius: 6,
        padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 18,
        overflow: "hidden",
        boxShadow: locked ? "none" : `inset 0 0 40px ${N.BRAND_GLOW}, 0 0 24px ${N.BRAND}10`,
      }}>
        {/* Scan sweep — animated edge */}
        {!locked && (
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `linear-gradient(90deg, transparent 0%, ${N.BRAND_GLOW} 50%, transparent 100%)`,
            opacity: 0.08,
            animation: "edge-sweep-portal 4s linear infinite",
          }} />
        )}

        {/* Status orb */}
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: `2px solid ${ringColor}`,
          boxShadow: ringGlow,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: N.SURFACE_2,
        }}>
          {locked
            ? <Lock  size={14} color={N.TEXT_2} />
            : <Zap   size={16} color={armed ? N.LONG : N.BRAND}
                     style={{ filter: `drop-shadow(0 0 6px ${armed ? N.LONG : N.BRAND})` }} />
          }
        </div>

        {/* Label */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.24em",
            color: locked ? N.TEXT_1 : armed ? N.LONG : N.BRAND,
            textShadow: locked ? "none" : `0 0 8px ${armed ? N.LONG_GLOW : N.BRAND_GLOW}`,
          }}>
            {tierLocked
              ? "LIVE AI EXECUTION · LOCKED"
              : exchangeLocked
                ? "CONNECT EXCHANGE TO UNLOCK LIVE EXECUTION"
                : armed
                  ? "LIVE AI EXECUTION · ARMED"
                  : "ENABLE LIVE AI TRADING"}
          </div>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: N.TEXT_2, fontWeight: 600 }}>
            {exchangeLocked && !tierLocked
              ? "Live trading disabled · no validated exchange connection"
              : cap.label}
          </div>
        </div>

        {/* Capacity meter — only meaningful once the bar is unlocked. */}
        {!locked && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "flex-end",
            gap: 4, marginRight: 6,
          }}>
            <span style={{ fontSize: 9, color: N.TEXT_2, letterSpacing: "0.14em" }}>SLOTS</span>
            <span style={{
              fontSize: 18, color: N.BRAND, fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
              textShadow: `0 0 10px ${N.BRAND_GLOW}`,
            }}>{openSlots} / {cap.cap}</span>
          </div>
        )}

        {/* Primary action */}
        <button
          onClick={handle}
          style={{
            position: "relative", overflow: "hidden",
            padding: "10px 22px",
            background: locked
              ? `linear-gradient(180deg, ${N.GOLD} 0%, ${N.GOLD_DEEP} 100%)`
              : armed
                ? `linear-gradient(180deg, ${N.SHORT} 0%, #aa1133 100%)`
                : `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
            border: `1px solid ${locked ? N.GOLD : armed ? N.SHORT : N.BRAND}`,
            borderRadius: 4,
            color: locked ? "#1a0e00" : armed ? "#fff" : "#001a0d",
            fontWeight: 800, fontSize: 11, letterSpacing: "0.18em",
            fontFamily: N.FONT_MONO, cursor: "pointer",
            boxShadow: locked
              ? `0 0 18px ${N.GOLD_GLOW}`
              : armed
                ? `0 0 18px ${N.SHORT_GLOW}`
                : `0 0 22px ${N.BRAND_GLOW}`,
            whiteSpace: "nowrap",
            transition: "background 300ms ease, box-shadow 300ms ease, transform 200ms ease",
          }}
        >
          <span style={{ position: "relative", zIndex: 1 }}>
            {tierLocked
              ? "UPGRADE TO UNLOCK"
              : exchangeLocked
                ? "CONNECT EXCHANGE"
                : armed
                  ? "DISARM"
                  : "ARM EXECUTION"}
          </span>
          {/* Shimmer sweep (locked free-tier CTA only) */}
          {locked && (
            <span
              aria-hidden
              style={{
                position: "absolute", top: 0, bottom: 0, left: 0, width: "55%",
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
                animation: "shimmer-sweep 2.6s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
          )}
        </button>
      </div>

      <style>{`
        @keyframes edge-sweep-portal {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </section>
  );
}

// ── Upgrade Modal ────────────────────────────────────────────────────────────
// Single source of truth for the premium upgrade funnel. Every "upgrade" CTA on
// /portal (UPGRADE TO UNLOCK · VIEW UPGRADE OPTIONS · START AI TRADING ·
// Upgrade to AI Trading · Upgrade to AI Trading Pro) opens this modal. Each
// plan card is itself a button that POSTs to /api/billing/checkout with the
// plan id and immediately redirects to the Stripe Checkout session URL — no
// intermediate /billing page, no alternate route, no legacy handler.
function UpgradeModal({ open, onClose, gate }: {
  open:    boolean;
  onClose: () => void;
  /**
   * Disclaimer-gate wrapper from `useDisclaimerGate`. Wraps the actual
   * checkout fetch so the modal flow is:
   *   click plan → gate(startCheckout) → if needsAcceptance: open disclaimer
   *   modal → on accept POST /api/user/disclaimer → run startCheckout →
   *   POST /api/billing/checkout → redirect to Stripe URL.
   * Without this, the backend `requireDisclaimer` middleware returns
   * "Risk disclaimer acceptance required." and the user sees no modal.
   */
  gate:    (action: () => void) => void;
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
      // Cross-site iframes can drop the Clerk session cookie, so we always
      // attach a fresh Bearer token (same pattern the WebSocket + Desktop
      // Terminal use). The api-server's clerkMiddleware accepts both.
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/billing/checkout`, {
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
      // Surface enough diagnostic context in the browser console that prod
      // issues are root-cause-able without redeploying for more logs.
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
          The Free tier is paper-trading only. Upgrade to let the AI execute
          real trades through Alpaca on your behalf — with capacity that scales
          with your tier. Select a plan to continue to secure Stripe checkout.
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
    ? { name: "AI Trading",     price: "$39.99", cap: "3 concurrent AI trades", color: N.BRAND }
    : { name: "AI Trading Pro", price: "$79.99", cap: "12 concurrent AI trades · crypto + equities", color: N.BRAND_BRT };
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

// ── Panel scaffold ───────────────────────────────────────────────────────────
function Panel({
  title, accent = N.BRAND, children, height = 280, locked = false, onUnlock,
}: {
  title:    string;
  accent?:  string;
  height?:  number;
  locked?:  boolean;
  onUnlock?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: N.SURFACE_1,
      border: `1px solid ${locked ? `${N.GOLD}30` : N.BORDER}`,
      borderRadius: 6,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      fontFamily: N.FONT_MONO,
      position: "relative",
    }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${N.BORDER}`,
        display: "flex", alignItems: "center", gap: 10,
        background: `linear-gradient(180deg, ${accent}08 0%, ${N.BG} 100%)`,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: locked ? N.GOLD : accent,
          boxShadow: `0 0 8px ${locked ? N.GOLD : accent}, 0 0 18px ${locked ? N.GOLD_GLOW : accent + "50"}`,
          animation: "neon-pulse 1.4s infinite",
        }} />
        <span style={{
          fontSize: 10, letterSpacing: "0.22em",
          color: N.TEXT_0, fontWeight: 800,
        }}>{title}</span>
        {locked && (
          <span style={{
            marginLeft: "auto",
            fontSize: 8, padding: "2px 7px",
            background: `${N.GOLD}18`, color: N.GOLD,
            border: `1px solid ${N.GOLD}40`,
            borderRadius: 2, letterSpacing: "0.22em", fontWeight: 700,
          }}>LOCKED</span>
        )}
      </div>
      <div className="neon-scroll" style={{
        // Fixed-height scroll viewport. `height` (default 280) is enforced as
        // BOTH the minimum and maximum so the panel never stretches when the
        // child list (e.g. LIVE TRADES at 30+ rows) grows — keeps the
        // institutional terminal layout stable. `flex: "0 0 auto"` defeats
        // the previous `flex: 1` that defeated `height` on its own.
        flex: "0 0 auto",
        padding: 14,
        height,
        maxHeight: height,
        overflowY: "auto", overflowX: "hidden",
        position: "relative",
        scrollBehavior: "smooth",
      }}>
        <div
          aria-hidden={locked || undefined}
          {...(locked ? { inert: "" as unknown as boolean } : {})}
          style={{
            filter: locked ? "blur(3.5px)" : "none",
            opacity: locked ? 0.55 : 1,
            pointerEvents: locked ? "none" : "auto",
            transition: "filter 200ms ease",
          }}>
          {children}
        </div>

        {locked && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 10, padding: 16, textAlign: "center",
            background: `radial-gradient(ellipse at center, ${N.BG}cc 0%, ${N.BG}f5 70%)`,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: N.SURFACE_2,
              border: `1px solid ${N.GOLD}60`,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 18px ${N.GOLD_GLOW}`,
            }}>
              <Lock size={16} color={N.GOLD} />
            </div>
            <div style={{
              fontSize: 11, color: N.TEXT_0, fontWeight: 800,
              letterSpacing: "0.16em",
            }}>UPGRADE TO ACTIVATE AI EXECUTION</div>
            <div style={{
              fontSize: 9, color: N.TEXT_2, letterSpacing: "0.14em",
              maxWidth: 240, lineHeight: 1.5,
            }}>
              Live trade data unlocks when you enable AI execution on Starter or Pro.
            </div>
            <button
              onClick={onUnlock}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.transform   = "translateY(-1px)";
                el.style.boxShadow   = `0 0 22px ${N.GOLD}, 0 0 36px ${N.GOLD_GLOW}`;
                el.style.letterSpacing = "0.22em";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.transform   = "translateY(0)";
                el.style.boxShadow   = `0 0 16px ${N.GOLD_GLOW}`;
                el.style.letterSpacing = "0.18em";
              }}
              style={{
                marginTop: 6,
                padding: "8px 16px",
                background: `linear-gradient(180deg, ${N.GOLD} 0%, ${N.GOLD_DEEP} 100%)`,
                border: `1px solid ${N.GOLD}`,
                borderRadius: 3,
                color: "#1a0e00", fontSize: 10, fontWeight: 800,
                letterSpacing: "0.18em",
                fontFamily: N.FONT_MONO, cursor: "pointer",
                boxShadow: `0 0 16px ${N.GOLD_GLOW}`,
                transition: "transform 220ms ease, box-shadow 220ms ease, letter-spacing 220ms ease",
              }}
            >
              VIEW UPGRADE OPTIONS →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ left, right, color = N.TEXT_0, sub }: {
  left: string; right: string; color?: string; sub?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0",
      borderBottom: `1px solid ${N.BORDER}`,
      fontSize: 11,
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ color: N.TEXT_0, fontWeight: 600 }}>{left}</span>
        {sub && <span style={{ color: N.TEXT_2, fontSize: 9, marginTop: 2 }}>{sub}</span>}
      </div>
      <span style={{
        color, fontVariantNumeric: "tabular-nums", fontWeight: 700,
        textShadow: color !== N.TEXT_0 ? `0 0 6px ${color}40` : "none",
      }}>{right}</span>
    </div>
  );
}

// ── Exchange Connections Health panel (customer terminal) ────────────────────
// Mirrors the per-exchange health pills the PWA Profile page already shows so
// desktop customers get the same at-a-glance signal. Polls the same balances
// feed (`/api/user/exchanges/balances`) every 30s and reads the connection
// list (`/api/user/exchanges`) on a slow cadence. We deliberately reuse the
// PWA's react-query keys (`user-exchanges` / `user-exchanges-balances`) so
// invalidations triggered here also refresh the PWA Profile health card and
// vice-versa — health stays in lockstep across surfaces.
interface PortalExchangeListEntry {
  exchange:   string;
  connected:  boolean;
  connection: {
    id: string; exchange: string; label: string | null;
    tradingMode: string; lastVerifiedAt?: string | null; lastError?: string | null;
  } | null;
  meta: { id: string; name: string; logo?: string; color?: string } | null;
}
interface PortalBalanceConn {
  exchange:       string;
  label:          string | null;
  tradingMode:    string;
  ok:             boolean;
  totalEquityUSD: number;
  error?:         string;
}

function ExchangeConnectionsHealthPanel() {
  const qc = useQueryClient();
  // NOTE: queryKeys here intentionally match `artifacts/aicandlez-app/src/pages/Profile.tsx`
  // (`ExchangeConnectionsHealth`) so invalidating one surface refreshes both.
  const { data: listData, isLoading: listLoading } = useQuery<{ exchanges: PortalExchangeListEntry[] }>({
    queryKey: ["user-exchanges"],
    queryFn:  () => j<{ exchanges: PortalExchangeListEntry[] }>(`${apiBaseUrl}/api/user/exchanges`),
    retry:    false,
    staleTime: 60_000,
  });
  const { data: balData, isFetching: balFetching, dataUpdatedAt } = useQuery<{
    connections: PortalBalanceConn[]; totalEquityUSD: number; fetchedAt: number;
  }>({
    queryKey: ["user-exchanges-balances"],
    queryFn:  () => j<{ connections: PortalBalanceConn[]; totalEquityUSD: number; fetchedAt: number }>(
      `${apiBaseUrl}/api/user/exchanges/balances`,
    ),
    retry:    false,
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
  });

  const connected = useMemo(
    () => (listData?.exchanges ?? []).filter(e => e.connected && e.connection),
    [listData],
  );
  const byExchange = useMemo(() => {
    const m: Record<string, PortalBalanceConn> = {};
    for (const c of balData?.connections ?? []) m[c.exchange] = c;
    return m;
  }, [balData]);

  const handleTest = () => {
    // Invalidate the shared keys so every consumer (this panel, PWA Profile,
    // and any future surface using `user-exchanges-balances`) refetches.
    void qc.invalidateQueries({ queryKey: ["user-exchanges-balances"] });
    void qc.invalidateQueries({ queryKey: ["user-exchanges"] });
  };

  if (listLoading) {
    return (
      <div style={{ padding: "12px 0", color: N.TEXT_2, fontSize: 10, letterSpacing: "0.14em" }}>
        LOADING EXCHANGE CONNECTIONS…
      </div>
    );
  }
  if (connected.length === 0) {
    return (
      <div style={{ padding: "12px 0", color: N.TEXT_2, fontSize: 10, letterSpacing: "0.14em", lineHeight: 1.6 }}>
        NO EXCHANGES CONNECTED · CONNECT ONE TO ENABLE REAL-MONEY EXECUTION
      </div>
    );
  }

  const verifiedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {connected.map(row => {
        const bal        = byExchange[row.exchange];
        const storedErr  = row.connection?.lastError ?? null;
        const hasBalance = bal !== undefined;
        const healthy    = hasBalance && bal!.ok;
        const failing    = hasBalance && !bal!.ok;
        const pending    = !hasBalance && balFetching;
        // GREEN healthy · RED failing · AMBER pending or stored error · GREY unknown
        const pillCol    = healthy ? N.BRAND
                         : failing ? "#ff3355"
                         : (pending || storedErr) ? N.WARN
                         : N.TEXT_3;
        const pillLabel  = healthy ? "HEALTHY"
                         : failing ? "DEGRADED"
                         : pending ? "CHECKING"
                         : storedErr ? "ATTENTION"
                         : "UNKNOWN";
        const errText    = bal?.error ?? storedErr ?? null;
        const name       = row.meta?.name ?? row.exchange;
        const mode       = (row.connection?.tradingMode ?? "paper").toUpperCase();

        return (
          <div key={row.exchange} style={{
            padding: "10px 12px",
            border: `1px solid ${N.BORDER}`,
            borderRadius: 4,
            background: "rgba(0,0,0,0.30)",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{
                  fontSize: 11, color: N.TEXT_0, fontWeight: 800, letterSpacing: "0.12em",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {name.toUpperCase()}
                </span>
                <span style={{ fontSize: 9, color: N.TEXT_2, letterSpacing: "0.16em" }}>
                  {mode} · {verifiedAt ? `CHECKED ${verifiedAt}` : "AWAITING CHECK"}
                </span>
              </div>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 9px", borderRadius: 3,
                border: `1px solid ${pillCol}55`, background: `${pillCol}10`,
                color: pillCol, fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
                fontFamily: N.FONT_MONO, whiteSpace: "nowrap",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: pillCol,
                  boxShadow: `0 0 8px ${pillCol}, 0 0 16px ${pillCol}60`,
                  animation: pending ? "dot-pulse 1.4s ease-in-out infinite" : undefined,
                }} />
                {pillLabel}
              </span>
            </div>

            {errText && (
              <div style={{
                padding: "7px 10px", borderRadius: 3,
                background: "rgba(255,51,85,0.08)",
                border: "1px solid rgba(255,51,85,0.30)",
                color: "#ffb8c0", fontSize: 10, lineHeight: 1.45,
                fontFamily: N.FONT_MONO, wordBreak: "break-word",
              }}>
                {errText}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleTest}
                disabled={balFetching}
                style={{
                  padding: "5px 12px", borderRadius: 3,
                  background: `${N.BRAND}10`, border: `1px solid ${N.BRAND}55`,
                  color: N.BRAND, fontFamily: N.FONT_MONO, fontWeight: 800,
                  fontSize: 9, letterSpacing: "0.18em",
                  cursor: balFetching ? "wait" : "pointer",
                  opacity: balFetching ? 0.55 : 1,
                }}
              >
                {balFetching ? "TESTING…" : "TEST CONNECTION"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const QUEUE = [
  { sym: "BTC/USD", side: "BUY", conf: "84%", state: "QUEUED · executes when slot frees" },
  { sym: "ETH/USD", side: "BUY", conf: "78%", state: "QUEUED · awaiting confirmation" },
  { sym: "ADA/USD", side: "BUY", conf: "71%", state: "QUEUED · capacity limit reached" },
];

// ── Live paper-trade panels ─────────────────────────────────────────────────

// ── Admin LIVE panels (Kraken-sourced, no paper trade data) ─────────────────
// These two panels back the admin /portal layout. They pull from the
// cross-tenant operator endpoints `/api/admin/positions` and
// `/api/admin/closed-trades`, NOT from usePaperTrades(). The customer
// `ActiveTradesPanel` / `TradeHistoryPanel` below remain unchanged for the
// customer surface — admin and customer surfaces are now data-isolated.

type AdminPosition = {
  id:           string | number;
  user_email?:  string | null;
  symbol:       string;
  side:         string;
  size_usd:     number | string | null;
  entry_price:  number | string | null;
  entry_time:   number | null;
  mode?:        string | null;
  source?:      string | null;
  exchange?:                  string | null;
  entry_fee_broker?:          number | string | null;
  entry_fee_broker_currency?: string | null;
};

type AdminClosed = AdminPosition & {
  exit_price:        number | string | null;
  realized_pnl:      number | string | null;
  realized_pnl_pct:  number | string | null;
  close_reason?:     string | null;
  exit_time:         number | null;
  net_fees?:         number | string | null;
  entry_fee?:                 number | string | null;
  exit_fee?:                  number | string | null;
  exit_fee_broker?:           number | string | null;
  exit_fee_broker_currency?:  string | null;
};

const toNum = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

// USD-stable settlement currencies — broker fees quoted in these are treated
// as USD-equivalent for net-PnL math. Native-asset fees (BTC, BNB, etc.) are
// still surfaced verbatim in the row tooltip but USD totals fall back to the
// catalog estimate so receipt math matches account equity. Mirrors the PWA
// `TradeDetailSheet.tsx` logic exactly.
const USD_STABLE_FEE_CCY = new Set([
  "USD","USDT","USDC","BUSD","DAI","TUSD","USDP","FDUSD","ZUSD",
]);

// Extract the base asset from a trading symbol so we can convert a broker
// fee quoted in the base currency (e.g. BTC on a BTC/USDT trade) into USD
// using the trade's exit price. Mirrors the PWA Home helper exactly.
function extractBaseAsset(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const s = String(symbol).toUpperCase().replace(/[/\-_]/g, "");
  const quotes = ["USDT","USDC","BUSD","FDUSD","TUSD","USDP","DAI","ZUSD","USD"];
  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) {
      const base = s.slice(0, s.length - q.length);
      return base === "XBT" ? "BTC" : base;
    }
  }
  return null;
}
// Resolve effective per-leg fee in USD: prefer broker-reported when the
// broker quoted it in a USD-stable currency OR when a native fee can be
// converted via the trade's exit price (e.g. BTC fee on a BTC/USDT trade).
// Falls back to the catalog estimate otherwise. `displayFromBroker`
// tells the UI whether the USD amount being shown is actually broker
// data (= "Actual" pill) or an estimate fallback (= "Est." pill).
function resolveFeeLeg(
  brokerRaw:    number | string | null | undefined,
  brokerCcy:    string | null | undefined,
  estimateRaw:  number | string | null | undefined,
  exitPrice?:   number,
  baseAsset?:   string | null,
): {
  usd:               number;
  displayFromBroker: boolean;
  fromBroker:        boolean;
  brokerIsUsd:       boolean;
  brokerAmount?:     number;
  brokerCcy?:        string;
  estimate?:         number;
} {
  const broker   = brokerRaw   != null ? toNum(brokerRaw)   : undefined;
  const estimate = estimateRaw != null ? toNum(estimateRaw) : undefined;
  const ccy      = brokerCcy ?? undefined;
  const fromBroker  = typeof broker === "number";
  const brokerIsUsd = fromBroker && (!ccy || USD_STABLE_FEE_CCY.has(ccy.toUpperCase()));
  const ccyMatchesBase = !!(ccy && baseAsset && ccy.toUpperCase() === baseAsset.toUpperCase());
  const convertible = fromBroker && !brokerIsUsd && ccyMatchesBase
    && typeof exitPrice === "number" && exitPrice > 0;
  const brokerUsd = brokerIsUsd
    ? broker!
    : (convertible ? (broker! * exitPrice!) : undefined);
  const displayFromBroker = typeof brokerUsd === "number";
  const usd = displayFromBroker ? brokerUsd! : (estimate ?? 0);
  return {
    usd, displayFromBroker, fromBroker, brokerIsUsd,
    brokerAmount: broker,
    brokerCcy:    ccy,
    estimate,
  };
}

function AdminLiveTradesPanel() {
  const { getToken } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin-positions"],
    queryFn:  async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/admin/positions?limit=50`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("admin/positions failed");
      return res.json() as Promise<{ positions: AdminPosition[] }>;
    },
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const positions = data?.positions ?? [];

  return (
    <Panel title="LIVE TRADES · KRAKEN" height={420} locked={false}>
      {positions.length === 0 ? (
        <div style={{
          padding: "18px 4px", fontSize: 10, lineHeight: 1.6,
          color: N.TEXT_2, letterSpacing: "0.10em",
        }}>
          No open live positions. Kraken executor is armed and listening — open
          positions will surface here in real time across the platform.
        </div>
      ) : positions.map((t) => {
        const side  = String(t.side ?? "").toUpperCase();
        const sym   = String(t.symbol ?? "—");
        const entry = toNum(t.entry_price);
        const size  = toNum(t.size_usd);
        const when  = t.entry_time ? fmtTime(Number(t.entry_time)) : "—";
        const longSide = side === "LONG" || side === "BUY";
        // Entry-leg commission — show only when this position was opened
        // against a real broker (live execution). Mirrors the PWA receipt:
        // prefer the broker-reported fee when present, otherwise omit
        // (catalog entry estimates aren't carried on open positions).
        const entryLeg = resolveFeeLeg(
          t.entry_fee_broker, t.entry_fee_broker_currency, null,
        );
        const showEntryFee = !!t.exchange && entryLeg.fromBroker;
        const entryFeeLabel = entryLeg.brokerIsUsd
          ? `−$${(entryLeg.brokerAmount ?? 0).toFixed(2)} OPEN FEE`
          : `−${(entryLeg.brokerAmount ?? 0).toFixed(
              (entryLeg.brokerAmount ?? 0) < 1 ? 6 : 4,
            )} ${entryLeg.brokerCcy ?? ""} OPEN FEE`;
        const entryFeeTitle = `Opening commission charged by broker${
          entryLeg.brokerCcy && !entryLeg.brokerIsUsd ? ` (${entryLeg.brokerCcy})` : ""
        }`;
        return (
          <div key={String(t.id)} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0",
            borderBottom: `1px solid ${N.BORDER}`,
            fontSize: 11,
          }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ color: N.TEXT_0, fontWeight: 700 }}>
                {sym}{"  "}
                <span style={{
                  color: longSide ? N.LONG : N.SHORT,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 9,
                  marginLeft: 4,
                }}>{longSide ? "LONG" : "SHORT"}</span>
                <span style={{
                  color: N.BRAND, fontWeight: 800, letterSpacing: "0.16em",
                  fontSize: 8, marginLeft: 6,
                  padding: "1px 5px",
                  border: `1px solid ${N.BRAND}55`,
                  borderRadius: 2,
                }}>LIVE</span>
              </span>
              <span style={{ color: N.TEXT_2, fontSize: 9, marginTop: 2, letterSpacing: "0.04em" }}>
                Entry ${entry.toFixed(entry >= 100 ? 2 : 4)} · ${size.toLocaleString()} · {when}
                {t.user_email ? ` · ${t.user_email}` : ""}
              </span>
            </div>
            {showEntryFee && (
              <span
                title={entryFeeTitle}
                style={{
                  color: N.TEXT_2, fontSize: 8, fontWeight: 700,
                  letterSpacing: "0.10em",
                  fontVariantNumeric: "tabular-nums", textTransform: "uppercase",
                  flexShrink: 0, marginLeft: 8,
                }}
              >
                {entryFeeLabel}
              </span>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

function AdminTradeHistoryPanel() {
  const { getToken } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin-closed-trades"],
    queryFn:  async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/admin/closed-trades?limit=50`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("admin/closed-trades failed");
      return res.json() as Promise<{ trades: AdminClosed[] }>;
    },
    refetchInterval: 8_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const trades = data?.trades ?? [];

  return (
    <Panel title="TRADE HISTORY · KRAKEN" height={420} locked={false}>
      {trades.length === 0 ? (
        <div style={{
          padding: "18px 4px", fontSize: 10, lineHeight: 1.6,
          color: N.TEXT_2, letterSpacing: "0.10em",
        }}>
          Closed live trades will surface here with realized P/L, exit price
          and timestamp. Operator console only — no paper-trade data.
        </div>
      ) : trades.map((t) => {
        const side  = String(t.side ?? "").toUpperCase();
        const sym   = String(t.symbol ?? "—");
        const pnl   = toNum(t.realized_pnl);
        const pnlP  = toNum(t.realized_pnl_pct);
        const exit  = toNum(t.exit_price);
        const when  = t.exit_time ? fmtTime(Number(t.exit_time)) : "—";
        const reason = (t.close_reason ?? "").toString().toUpperCase();
        // Prefer broker-reported commissions over the catalog estimate, in
        // lock-step with `TradeDetailSheet.tsx` on the PWA. USD-stable broker
        // fees feed PnL math directly; native-asset fees (BTC, BNB, …) are
        // surfaced in the row tooltip but USD totals fall back to the
        // catalog estimate so the dashboard matches account equity.
        const baseAsset = extractBaseAsset(t.symbol);
        const entryLeg = resolveFeeLeg(
          t.entry_fee_broker, t.entry_fee_broker_currency, t.entry_fee,
          exit, baseAsset,
        );
        const exitLeg  = resolveFeeLeg(
          t.exit_fee_broker,  t.exit_fee_broker_currency,  t.exit_fee,
          exit, baseAsset,
        );
        const fees =
          (entryLeg.fromBroker || entryLeg.estimate != null
            || exitLeg.fromBroker  || exitLeg.estimate  != null)
            ? entryLeg.usd + exitLeg.usd
            : (t.net_fees != null ? toNum(t.net_fees) : 0);
        const anyBroker  = entryLeg.fromBroker || exitLeg.fromBroker;
        // "ACTUAL" only when BOTH legs' displayed USD came from broker
        // data (USD-stable broker quote OR native fee converted via exit
        // price). Anything else falls back to "EST." so the pill always
        // matches the number the user is reading.
        const bothActual   = entryLeg.displayFromBroker && exitLeg.displayFromBroker;
        const feePillLabel = bothActual ? "ACTUAL" : "EST.";
        const feePillColor = bothActual ? N.BRAND  : N.TEXT_2;
        // Tooltip surfaces both per-leg breakdown + native-currency amounts
        // when the broker quoted a non-USD fee, matching the PWA receipt.
        const fmtLegTitle = (legName: string, leg: ReturnType<typeof resolveFeeLeg>): string | null => {
          if (leg.fromBroker) {
            const ccy = leg.brokerCcy && !leg.brokerIsUsd ? ` ${leg.brokerCcy}` : "";
            const dp  = leg.brokerIsUsd ? 2 : ((leg.brokerAmount ?? 0) < 1 ? 6 : 4);
            const sym = leg.brokerIsUsd ? "$" : "";
            return `${legName}: ${sym}${(leg.brokerAmount ?? 0).toFixed(dp)}${ccy} · charged by broker`;
          }
          if (leg.estimate != null) {
            return `${legName}: $${leg.estimate.toFixed(2)} (est.)`;
          }
          return null;
        };
        const tooltipLines: string[] = [];
        const openTip  = fmtLegTitle("Opening commission", entryLeg);
        const closeTip = fmtLegTitle("Closing commission", exitLeg);
        if (openTip)  tooltipLines.push(openTip);
        if (closeTip) tooltipLines.push(closeTip);
        tooltipLines.push(`Net of fees: ${fmtMoney(pnl - fees)}`);
        const feeTooltip = tooltipLines.join("\n");
        const color = pnl >= 0 ? N.LONG : N.SHORT;
        const tag = reason === "TP" ? "TP HIT" : reason === "SL" ? "SL HIT" : "CLOSED";
        const tagColor = reason === "TP" ? N.LONG : reason === "SL" ? N.SHORT : N.TEXT_2;
        const longSide = side === "LONG" || side === "BUY";
        return (
          <div key={String(t.id)} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0",
            borderBottom: `1px solid ${N.BORDER}`,
            fontSize: 11,
          }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ color: N.TEXT_0, fontWeight: 700 }}>
                {sym}{"  "}
                <span style={{
                  color: longSide ? N.LONG : N.SHORT,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 9,
                  marginLeft: 4,
                }}>{longSide ? "LONG" : "SHORT"}</span>
                <span style={{
                  color: tagColor,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 8,
                  marginLeft: 6,
                  padding: "1px 5px",
                  border: `1px solid ${tagColor}40`,
                  borderRadius: 2,
                }}>{tag}</span>
              </span>
              <span style={{ color: N.TEXT_2, fontSize: 9, marginTop: 2, letterSpacing: "0.04em" }}>
                Exit ${exit.toFixed(exit >= 100 ? 2 : 4)} · {when}
                {t.user_email ? ` · ${t.user_email}` : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{
                color, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                textShadow: `0 0 6px ${color}40`,
              }}>
                {fmtMoney(pnl)}
              </span>
              <span style={{
                color, fontSize: 9, fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}>
                {pnlP >= 0 ? "+" : ""}{pnlP.toFixed(2)}%
              </span>
              {fees > 0 && (
                <span
                  title={feeTooltip}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    marginTop: 2,
                  }}
                >
                  <span style={{
                    padding: "1px 4px", borderRadius: 2,
                    background: `${feePillColor}1F`,
                    border: `1px solid ${feePillColor}55`,
                    fontSize: 7, fontWeight: 800,
                    color: feePillColor, letterSpacing: "0.10em",
                    lineHeight: 1.2,
                  }}>{feePillLabel}</span>
                  <span style={{
                    color: anyBroker ? N.BRAND_DIM : N.TEXT_2,
                    fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.10em",
                    fontVariantNumeric: "tabular-nums", textTransform: "uppercase",
                  }}>
                    −${fees.toFixed(2)} FEES
                  </span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

// ── Customer LIVE panels (signed-in user's own server-side trades) ──────────
// These panels render the user's real `/api/simulation/*` data — open paper +
// live positions, then closed trade history with broker-reported fees. The
// fee math reuses `resolveFeeLeg` so a customer reading this panel sees the
// same commission figures shown on the PWA receipt and the operator console.
//
// Side normalization: the server uses BUY/SELL on positions and SELL/BUY
// closures, while the existing UI vocabulary is LONG/SHORT. We translate
// BUY → LONG, SELL → SHORT at the boundary so rows match every other panel.

type CustomerPosition = {
  id:                       string;
  symbol:                   string;
  side:                     "BUY" | "SELL";
  quantity:                 number;
  entryPrice:               number;
  entryTime:                number;
  sizeUSD:                  number;
  unrealizedPnL?:           number;
  unrealizedPnLPct?:        number;
  exchange?:                string | null;
  entryFeeBroker?:          number | string | null;
  entryFeeBrokerCurrency?:  string | null;
  sandbox?:                 boolean | null;
};

type CustomerAccount = {
  positions: CustomerPosition[];
};

type CustomerTrade = {
  id:                       string;
  symbol:                   string;
  side:                     "BUY" | "SELL";
  entryPrice:               number;
  exitPrice:                number;
  exitTime:                 number;
  realizedPnL:              number;
  realizedPnLPct:           number;
  closeReason?:             string | null;
  exchange?:                string | null;
  entryFee?:                number | string | null;
  exitFee?:                 number | string | null;
  netFees?:                 number | string | null;
  entryFeeBroker?:          number | string | null;
  entryFeeBrokerCurrency?:  string | null;
  exitFeeBroker?:           number | string | null;
  exitFeeBrokerCurrency?:   string | null;
  sandbox?:                 boolean | null;
};

function displaySymbol(sym: string): string {
  const s = String(sym ?? "").toUpperCase();
  if (s.endsWith("USD") && s.length > 3) return `${s.slice(0, -3)}/USD`;
  if (s.endsWith("USDT") && s.length > 4) return `${s.slice(0, -4)}/USDT`;
  return s;
}

function ActiveTradesPanel({ onUpgrade }: { onUpgrade: () => void }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-simulation-account"],
    queryFn:  async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/simulation/account`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("simulation/account failed");
      return res.json() as Promise<CustomerAccount>;
    },
    refetchInterval: 4_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const closeMutation = useMutation({
    mutationFn: async (positionId: string) => {
      const token = await getToken().catch(() => null);
      const res = await fetch(
        `${apiBaseUrl}/api/simulation/close/${encodeURIComponent(positionId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ closeReason: "MANUAL" }),
        },
      );
      if (!res.ok) throw new Error("simulation/close failed");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customer-simulation-account"] });
      void qc.invalidateQueries({ queryKey: ["customer-simulation-trades"] });
    },
  });

  const positions = data?.positions ?? [];

  return (
    <Panel title="LIVE TRADES" height={420} locked={false} onUnlock={onUpgrade}>
      {positions.length === 0 ? (
        <div style={{
          padding: "18px 4px", fontSize: 10, lineHeight: 1.6,
          color: N.TEXT_2, letterSpacing: "0.10em",
        }}>
          {isLoading
            ? "Loading your open positions…"
            : <>No open positions. Click <b style={{ color: N.LONG }}>BUY</b> or{" "}
              <b style={{ color: N.SHORT }}>SELL</b> on any signal above to open
              a trade. Positions appear here in real time with live P/L until
              TP / SL is hit.</>}
        </div>
      ) : positions.map((p) => {
        const longSide = p.side === "BUY";
        const pnl      = toNum(p.unrealizedPnL);
        const pnlPct   = toNum(p.unrealizedPnLPct);
        const color    = pnl >= 0 ? N.LONG : N.SHORT;
        const display  = displaySymbol(p.symbol);
        const entry    = toNum(p.entryPrice);
        const isLive   = !!p.exchange;
        const isSandbox = p.sandbox === true;
        // Entry-leg broker commission — only present on live positions where
        // the exchange surfaced a per-order fee. Matches the AdminLiveTrades
        // panel logic above.
        const entryLeg = resolveFeeLeg(
          p.entryFeeBroker, p.entryFeeBrokerCurrency, null,
        );
        const showEntryFee = isLive && entryLeg.fromBroker;
        const entryFeeLabel = entryLeg.brokerIsUsd
          ? `−$${(entryLeg.brokerAmount ?? 0).toFixed(2)} OPEN FEE`
          : `−${(entryLeg.brokerAmount ?? 0).toFixed(
              (entryLeg.brokerAmount ?? 0) < 1 ? 6 : 4,
            )} ${entryLeg.brokerCcy ?? ""} OPEN FEE`;
        const entryFeeTitle = `Opening commission charged by broker${
          entryLeg.brokerCcy && !entryLeg.brokerIsUsd ? ` (${entryLeg.brokerCcy})` : ""
        }`;
        return (
          <div key={p.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0",
            borderBottom: `1px solid ${N.BORDER}`,
            fontSize: 11,
          }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ color: N.TEXT_0, fontWeight: 700 }}>
                {display}{"  "}
                <span style={{
                  color: longSide ? N.LONG : N.SHORT,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 9,
                  marginLeft: 4,
                }}>{longSide ? "LONG" : "SHORT"}</span>
                <span style={{
                  color: isLive ? N.BRAND : N.TEXT_2,
                  fontWeight: 800, letterSpacing: "0.16em",
                  fontSize: 8, marginLeft: 6,
                  padding: "1px 5px",
                  border: `1px solid ${(isLive ? N.BRAND : N.TEXT_2)}55`,
                  borderRadius: 2,
                }}>{isLive ? "LIVE" : "PAPER"}</span>
                {isSandbox && (
                  <span
                    title={`Routed through ${(p.exchange ?? "exchange").toString().toUpperCase()} public testnet — no real funds at risk`}
                    style={{
                      color: N.WARN,
                      fontWeight: 800, letterSpacing: "0.16em",
                      fontSize: 8, marginLeft: 6,
                      padding: "1px 5px",
                      border: `1px solid ${N.WARN}66`,
                      borderRadius: 2,
                      background: `${N.WARN}12`,
                    }}>SANDBOX</span>
                )}
              </span>
              <span style={{ color: N.TEXT_2, fontSize: 9, marginTop: 2, letterSpacing: "0.04em" }}>
                Entry ${entry.toFixed(entry >= 100 ? 2 : 4)} · {fmtQty(toNum(p.quantity))} · {fmtTime(Number(p.entryTime))}
              </span>
              {showEntryFee && (
                <span
                  title={entryFeeTitle}
                  style={{
                    color: N.BRAND_DIM, fontSize: 8, fontWeight: 700,
                    marginTop: 2, letterSpacing: "0.10em",
                    fontVariantNumeric: "tabular-nums", textTransform: "uppercase",
                  }}
                >
                  {entryFeeLabel}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{
                  color, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  textShadow: `0 0 6px ${color}40`,
                }}>
                  {fmtMoney(pnl)}
                </span>
                <span style={{
                  color, fontSize: 9, fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                </span>
              </div>
              <button
                onClick={() => closeMutation.mutate(p.id)}
                disabled={closeMutation.isPending}
                title="Close position"
                aria-label={`Close ${display} position`}
                style={{
                  width: 22, height: 22, borderRadius: 3,
                  background: "transparent",
                  border: `1px solid ${N.BORDER_HI}`,
                  color: N.TEXT_2,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  cursor: closeMutation.isPending ? "wait" : "pointer",
                  opacity: closeMutation.isPending ? 0.5 : 1,
                  transition: "all 140ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = N.SHORT;
                  e.currentTarget.style.color       = N.SHORT;
                  e.currentTarget.style.background  = `${N.SHORT}10`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = N.BORDER_HI;
                  e.currentTarget.style.color       = N.TEXT_2;
                  e.currentTarget.style.background  = "transparent";
                }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

function TradeHistoryPanel({ onUpgrade }: { onUpgrade: () => void }) {
  const { getToken } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-simulation-trades"],
    queryFn:  async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/simulation/trades`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("simulation/trades failed");
      return res.json() as Promise<{ trades: CustomerTrade[] }>;
    },
    refetchInterval: 6_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const history = data?.trades ?? [];

  // Toast on every new auto-close (TP / SL) so the feedback feels institutional.
  const lastSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (history.length === 0) return;
    const newest = history[0];
    if (!newest) return;
    if (lastSeenRef.current === newest.id) return;
    if (lastSeenRef.current !== null) {
      const display = displaySymbol(newest.symbol);
      const longSide = newest.side === "BUY";
      const sideLabel = longSide ? "LONG" : "SHORT";
      const pnl    = toNum(newest.realizedPnL);
      const pnlPct = toNum(newest.realizedPnLPct);
      const exit   = toNum(newest.exitPrice);
      const reason = String(newest.closeReason ?? "").toUpperCase();
      if (reason.startsWith("TP")) {
        toast({
          title: `TARGET HIT ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% — ${display}`,
          description: `${sideLabel} closed at $${exit.toFixed(exit >= 100 ? 2 : 4)} · ${fmtMoney(pnl)} realized`,
        });
      } else if (reason.startsWith("SL")) {
        toast({
          title: `STOP LOSS TRIGGERED — ${display}`,
          description: `${sideLabel} closed at $${exit.toFixed(exit >= 100 ? 2 : 4)} · ${fmtMoney(pnl)} realized`,
        });
      } else {
        toast({
          title: `POSITION CLOSED — ${display}`,
          description: `${sideLabel} · ${fmtMoney(pnl)} realized`,
        });
      }
    }
    lastSeenRef.current = newest.id;
  }, [history]);

  return (
    <Panel title="TRADE HISTORY" height={420} locked={false} onUnlock={onUpgrade}>
      {history.length === 0 ? (
        <div style={{
          padding: "18px 4px", fontSize: 10, lineHeight: 1.6,
          color: N.TEXT_2, letterSpacing: "0.10em",
        }}>
          {isLoading
            ? "Loading your trade history…"
            : "Closed positions land here with realized P/L, exit reason and timestamp. Open a trade above to populate this feed."}
        </div>
      ) : history.map((t) => {
        const pnl    = toNum(t.realizedPnL);
        const pnlPct = toNum(t.realizedPnLPct);
        const exit   = toNum(t.exitPrice);
        const color  = pnl >= 0 ? N.LONG : N.SHORT;
        const reason = String(t.closeReason ?? "").toUpperCase();
        const tag    = reason.startsWith("TP") ? "TP HIT"
                     : reason.startsWith("SL") ? "SL HIT" : "CLOSED";
        const tagColor = reason.startsWith("TP") ? N.LONG
                       : reason.startsWith("SL") ? N.SHORT : N.TEXT_2;
        const longSide = t.side === "BUY";
        const display  = displaySymbol(t.symbol);

        // Reuse the same broker-vs-estimate resolver as the operator panel
        // and the PWA receipt so this row's fee number matches every other
        // surface that displays the same trade.
        const baseAsset = extractBaseAsset(t.symbol);
        const entryLeg = resolveFeeLeg(
          t.entryFeeBroker, t.entryFeeBrokerCurrency, t.entryFee,
          exit, baseAsset,
        );
        const exitLeg  = resolveFeeLeg(
          t.exitFeeBroker,  t.exitFeeBrokerCurrency,  t.exitFee,
          exit, baseAsset,
        );
        const fees =
          (entryLeg.fromBroker || entryLeg.estimate != null
            || exitLeg.fromBroker  || exitLeg.estimate  != null)
            ? entryLeg.usd + exitLeg.usd
            : (t.netFees != null ? toNum(t.netFees) : 0);
        const anyBroker  = entryLeg.fromBroker || exitLeg.fromBroker;
        // "ACTUAL" only when BOTH legs' displayed USD came from broker
        // data (USD-stable broker quote OR native fee converted via exit
        // price). Anything else falls back to "EST." so the pill always
        // matches the number the user is reading.
        const bothActual   = entryLeg.displayFromBroker && exitLeg.displayFromBroker;
        const feePillLabel = bothActual ? "ACTUAL" : "EST.";
        const feePillColor = bothActual ? N.BRAND  : N.TEXT_2;
        const fmtLegTitle = (legName: string, leg: ReturnType<typeof resolveFeeLeg>): string | null => {
          if (leg.fromBroker) {
            const ccy = leg.brokerCcy && !leg.brokerIsUsd ? ` ${leg.brokerCcy}` : "";
            const dp  = leg.brokerIsUsd ? 2 : ((leg.brokerAmount ?? 0) < 1 ? 6 : 4);
            const sym = leg.brokerIsUsd ? "$" : "";
            return `${legName}: ${sym}${(leg.brokerAmount ?? 0).toFixed(dp)}${ccy} · charged by broker`;
          }
          if (leg.estimate != null) {
            return `${legName}: $${leg.estimate.toFixed(2)} (est.)`;
          }
          return null;
        };
        const tooltipLines: string[] = [];
        const openTip  = fmtLegTitle("Opening commission", entryLeg);
        const closeTip = fmtLegTitle("Closing commission", exitLeg);
        if (openTip)  tooltipLines.push(openTip);
        if (closeTip) tooltipLines.push(closeTip);
        tooltipLines.push(`Net of fees: ${fmtMoney(pnl - fees)}`);
        const feeTooltip = tooltipLines.join("\n");

        return (
          <div key={t.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0",
            borderBottom: `1px solid ${N.BORDER}`,
            fontSize: 11,
          }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ color: N.TEXT_0, fontWeight: 700 }}>
                {display}{"  "}
                <span style={{
                  color: longSide ? N.LONG : N.SHORT,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 9,
                  marginLeft: 4,
                }}>{longSide ? "LONG" : "SHORT"}</span>
                <span style={{
                  color: tagColor,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 8,
                  marginLeft: 6,
                  padding: "1px 5px",
                  border: `1px solid ${tagColor}40`,
                  borderRadius: 2,
                }}>{tag}</span>
                {(() => {
                  const isLive = !!t.exchange;
                  const isSandbox = t.sandbox === true;
                  const chipColor = isLive ? N.BRAND : N.TEXT_2;
                  return (
                    <>
                      <span style={{
                        color: chipColor,
                        fontWeight: 800, letterSpacing: "0.16em", fontSize: 8,
                        marginLeft: 6,
                        padding: "1px 5px",
                        border: `1px solid ${chipColor}55`,
                        borderRadius: 2,
                      }}>{isLive ? "LIVE" : "PAPER"}</span>
                      {isSandbox && (
                        <span
                          title={`Routed through ${(t.exchange ?? "exchange").toString().toUpperCase()} public testnet — no real funds at risk`}
                          style={{
                            color: N.WARN,
                            fontWeight: 800, letterSpacing: "0.16em", fontSize: 8,
                            marginLeft: 6,
                            padding: "1px 5px",
                            border: `1px solid ${N.WARN}66`,
                            borderRadius: 2,
                            background: `${N.WARN}12`,
                          }}>SANDBOX</span>
                      )}
                    </>
                  );
                })()}
              </span>
              <span style={{ color: N.TEXT_2, fontSize: 9, marginTop: 2, letterSpacing: "0.04em" }}>
                Exit ${exit.toFixed(exit >= 100 ? 2 : 4)} · {fmtTime(Number(t.exitTime))}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{
                color, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                textShadow: `0 0 6px ${color}40`,
              }}>
                {fmtMoney(pnl)}
              </span>
              <span style={{
                color, fontSize: 9, fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}>
                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
              </span>
              {fees > 0 && (
                <span
                  title={feeTooltip}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    marginTop: 2,
                  }}
                >
                  <span style={{
                    padding: "1px 4px", borderRadius: 2,
                    background: `${feePillColor}1F`,
                    border: `1px solid ${feePillColor}55`,
                    fontSize: 7, fontWeight: 800,
                    color: feePillColor, letterSpacing: "0.10em",
                    lineHeight: 1.2,
                  }}>{feePillLabel}</span>
                  <span style={{
                    color: anyBroker ? N.BRAND_DIM : N.TEXT_2,
                    fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.10em",
                    fontVariantNumeric: "tabular-nums", textTransform: "uppercase",
                  }}>
                    −${fees.toFixed(2)} FEES
                  </span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

// ── Monthly Fees Trend (desktop port of PWA FeesMonthlyChart, Task #95) ─────
// Renders the same 6-month broker-commission bar chart shown on the mobile
// Portfolio page, restyled with the institutional theme tokens. Bars use the
// neon brand green with a soft glow; inactive months render as a flat dim
// scaffold bar. Empty state mirrors the PWA copy.
const PORTAL_FEES_MONTH_LABELS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
function portalFeesShortLabel(key: string): string {
  const [, m] = key.split("-");
  const idx = (parseInt(m ?? "0", 10) - 1);
  return PORTAL_FEES_MONTH_LABELS[idx] ?? key;
}
// Mirrors deriveFeesInsight from the mobile Portfolio page (Task #105).
// Deterministic one-line callout sourced from the same bucket data the chart
// already renders, plus the user's lifetime win rate. No free-form LLM.
function derivePortalFeesInsight(
  buckets: { month: string; feesPaid: number; tradeCount: number; realizedPnL: number }[],
  winRate: number | undefined,
): string | null {
  if (!buckets || buckets.length === 0) return null;
  const scored: { b: typeof buckets[number]; ratio: number; losing: boolean }[] = [];
  for (const b of buckets) {
    if (b.feesPaid <= 0) continue;
    if (b.realizedPnL > 0) {
      const ratio = (b.feesPaid / b.realizedPnL) * 100;
      if (ratio >= 50) scored.push({ b, ratio, losing: false });
    } else {
      scored.push({ b, ratio: Infinity, losing: true });
    }
  }
  if (scored.length === 0) return null;
  scored.sort((a, z) => z.ratio - a.ratio);
  const worst = scored[0];
  const monthName = portalFeesShortLabel(worst.b.month);
  const suggestThreshold = (winRate ?? 0) < 55 ? 75 : 70;
  const avgTradeFee = worst.b.tradeCount > 0
    ? worst.b.feesPaid / worst.b.tradeCount : 0;
  const tradesLabel = worst.b.tradeCount === 1
    ? "1 trade" : `${worst.b.tradeCount} trades`;
  if (worst.losing) {
    return `Your ${monthName} paid $${worst.b.feesPaid.toFixed(2)} in fees across ${tradesLabel} on a losing month — consider widening signal confidence above ${suggestThreshold} to trade less.`;
  }
  return `Your ${monthName} fees consumed ${worst.ratio.toFixed(0)}% of profit ($${avgTradeFee.toFixed(2)} avg per trade) — consider widening signal confidence above ${suggestThreshold} to trade less.`;
}

// ── AI Confidence Threshold panel (customer terminal) ─────────────────────────
// Deep-link target for Task #117. Sits inside /portal so the AI TAKE callout
// can drop the operator straight onto the min-confidence slider without
// leaving the terminal. Reads/writes `minConfidence` on the same
// /api/user/settings endpoint the mobile PWA uses — engine reloads user
// settings on every loop tick so the change applies immediately.
function PortalAIConfidencePanel() {
  const { getToken } = useAuth();
  const queryClient  = useQueryClient();
  const { data } = useQuery<{ minConfidence?: number }>({
    queryKey: ["/api/user/settings"],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/user/settings`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const current = Math.round(data?.minConfidence ?? 60);
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? current;

  const tier =
    value >= 75 ? { label:"SAFE",       color:"#00ff8a" } :
    value >= 60 ? { label:"BALANCED",   color:"#66FF66" } :
                  { label:"AGGRESSIVE", color:"#ff9400" };

  const mutation = useMutation({
    mutationFn: async (v: number) => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/user/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ minConfidence: v }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onMutate: async (v: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/user/settings"] });
      const prev = queryClient.getQueryData<{ minConfidence?: number }>(["/api/user/settings"]);
      queryClient.setQueryData(["/api/user/settings"], { ...(prev ?? {}), minConfidence: v });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/user/settings"], ctx.prev);
      toast({ title: "Could not save threshold", description: "Please try again." });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
    },
  });

  const commit = (v: number) => {
    setDraft(v);
    mutation.mutate(v);
  };

  return (
    <div
      id="ai-confidence-threshold"
      style={{
        scrollMarginTop: 80,
        border: `1px solid ${N.BORDER}`,
        background: N.SURFACE_1,
        borderRadius: 4,
        padding: "14px 16px",
      }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: "0.18em", color: N.BRAND,
            fontWeight: 700, textTransform: "uppercase",
          }}>
            AI SETTINGS · MIN CONFIDENCE THRESHOLD
          </div>
          <div style={{ fontSize: 10, color: N.TEXT_2, marginTop: 4 }}>
            Engine only trades signals above this confidence — raise it to trade less.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
            color: tier.color, padding: "2px 8px", borderRadius: 3,
            border: `1px solid ${tier.color}55`,
            background: `${tier.color}10`,
          }}>{tier.label}</span>
          <span style={{
            fontSize: 20, fontWeight: 700, color: N.BRAND,
            fontFamily: "ui-monospace, monospace", minWidth: 64, textAlign: "right",
          }}>{value}%</span>
        </div>
      </div>
      <input
        type="range" min={35} max={95} step={5}
        value={value}
        onChange={e => commit(parseInt(e.target.value, 10))}
        style={{ width: "100%", accentColor: N.BRAND }}
      />
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 9, color: N.TEXT_2, letterSpacing: "0.12em", marginTop: 2,
      }}>
        <span>AGGRESSIVE · 35%</span>
        <span>SAFE · 95%</span>
      </div>
    </div>
  );
}

// Same-page scroll for the AI TAKE deep-link (Task #117). The customer
// terminal mounts the PortalAIConfidencePanel under id="ai-confidence-threshold"
// further down the page, so we use scrollIntoView rather than navigating away.
function scrollToAIConfidenceThreshold() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("ai-confidence-threshold");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Update the URL hash so refresh / back keeps the anchor.
    if (typeof window !== "undefined" && window.location.hash !== "#ai-confidence-threshold") {
      try { window.history.replaceState(null, "", "#ai-confidence-threshold"); } catch {}
    }
  }
}

function PortalFeesTrend({
  data, winRate, onSelectMonth,
  }: {
    data: { months: { month: string; feesPaid: number; tradeCount: number; realizedPnL: number }[]; totalFeesPaid: number } | undefined;
    winRate: number | undefined;
    onSelectMonth: (month: string) => void;
}) {
  const buckets = data?.months ?? [];
  const insight = derivePortalFeesInsight(buckets, winRate);
  const hasAny  = buckets.some(b => b.feesPaid > 0 || b.realizedPnL !== 0);
  const peak    = Math.max(
    0,
    ...buckets.map(b => Math.max(b.feesPaid, Math.abs(b.realizedPnL))),
  );

  if (!hasAny) {
    return (
      <div style={{
        padding: "14px 16px",
        border: `1px solid ${N.BRAND}22`,
        borderRadius: 6,
        background: `${N.BRAND}05`,
        fontFamily: N.FONT_MONO, fontSize: 10, color: N.TEXT_3,
        letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center",
      }}>
        NO LIVE FEES YET · LAST 6 MONTHS
      </div>
    );
  }

  return (
    <div style={{
      padding: "14px 16px",
      border: `1px solid ${N.BRAND}33`,
      borderRadius: 6,
      background: `${N.BRAND}06`,
      fontFamily: N.FONT_MONO,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 10, color: N.TEXT_2,
          letterSpacing: "0.16em", textTransform: "uppercase" }}>
          FEES vs PROFIT · LAST 6 MONTHS
        </span>
        <span style={{ fontSize: 10, color: N.TEXT_1, letterSpacing: "0.08em" }}>
          PEAK ${peak.toFixed(2)}
        </span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${buckets.length}, 1fr)`,
        alignItems: "end",
        gap: 8,
        height: 72,
      }}>
        {buckets.map(b => {
          const profit  = b.realizedPnL;
          const profitH = peak > 0 ? Math.max(profit > 0 ? 2 : 0, Math.round((Math.max(profit, 0) / peak) * 64)) : 0;
          const feeH    = peak > 0 ? Math.max(b.feesPaid > 0 ? 2 : 0, Math.round((b.feesPaid / peak) * 64)) : 0;
          const overrun = b.feesPaid > 0 && b.feesPaid >= Math.max(profit, 0);
          const ratio   = profit > 0 ? (b.feesPaid / profit) * 100 : null;
          const ratioLabel = ratio !== null
            ? ` · fees ${ratio.toFixed(1)}% of profit`
            : (profit < 0 ? " · losing month" : "");
          const profitColor = profit >= 0 ? N.BRAND : `${N.TEXT_3}88`;
          const feeColor    = overrun ? "#ff7a3d" : `${N.TEXT_2}aa`;
          const clickable = b.tradeCount > 0;
          return (
            <div
              key={b.month}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : -1}
              onClick={() => { if (clickable) onSelectMonth(b.month); }}
              onKeyDown={(e) => {
                if (clickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelectMonth(b.month);
                }
              }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                height: "100%",
                cursor: clickable ? "pointer" : "default",
              }}
              title={
                (clickable ? "Click to see trades · " : "") +
                `${portalFeesShortLabel(b.month)} ${b.month.slice(0,4)} · ` +
                `$${b.feesPaid.toFixed(2)} fees on ` +
                `${profit >= 0 ? "$" : "−$"}${Math.abs(profit).toFixed(2)} profit · ` +
                `${b.tradeCount} trade${b.tradeCount === 1 ? "" : "s"}${ratioLabel}`
              }
            >
              <div style={{
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                gap: 3, width: "100%", height: "100%",
              }}>
                {profitH > 0 && (
                  <div style={{
                    width: "45%", height: profitH, borderRadius: 2,
                    background: profitColor,
                    boxShadow: profit > 0 ? `0 0 8px ${N.BRAND_GLOW}` : "none",
                  }} />
                )}
                {feeH > 0 && (
                  <div style={{
                    width: "45%", height: feeH, borderRadius: 2,
                    background: feeColor,
                    boxShadow: overrun ? "0 0 8px rgba(255,122,61,0.5)" : "none",
                  }} />
                )}
                {profitH === 0 && feeH === 0 && (
                  <div style={{ width: "100%", height: 2, borderRadius: 2, background: `${N.TEXT_3}55` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${buckets.length}, 1fr)`,
        gap: 8, marginTop: 8,
      }}>
        {buckets.map(b => (
          <div key={`${b.month}-l`} style={{
            fontSize: 9, color: N.TEXT_2,
            textAlign: "center", letterSpacing: "0.12em",
          }}>
            {portalFeesShortLabel(b.month)}
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", justifyContent: "center", gap: 16,
        marginTop: 10, fontSize: 9, color: N.TEXT_2,
        letterSpacing: "0.12em", textTransform: "uppercase",
      }}>
        <span><span style={{ color: N.BRAND }}>■</span> PROFIT</span>
        <span><span style={{ color: N.TEXT_2 }}>■</span> FEES</span>
        <span><span style={{ color: "#ff7a3d" }}>■</span> FEES &gt; PROFIT</span>
      </div>
      {insight && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => scrollToAIConfidenceThreshold()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              scrollToAIConfidenceThreshold();
            }
          }}
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 4,
            border: "1px solid rgba(255,122,61,0.35)",
            background: "rgba(255,122,61,0.06)",
            display: "flex", gap: 10, alignItems: "flex-start",
            cursor: "pointer",
          }}>
          <span style={{
            fontSize: 9, color: "#ff7a3d",
            letterSpacing: "0.18em", textTransform: "uppercase",
            padding: "2px 6px", borderRadius: 3,
            border: "1px solid rgba(255,122,61,0.45)",
            flexShrink: 0, marginTop: 1, fontWeight: 700,
          }}>AI TAKE</span>
          <span style={{
            fontSize: 11, color: "#f4c89f",
            lineHeight: 1.5, letterSpacing: "0.02em", flex: 1,
          }}>
            {insight}
            {" "}
            <span style={{
              color: "#ff7a3d", fontWeight: 700, whiteSpace: "nowrap",
              textDecoration: "underline", textUnderlineOffset: 2,
            }}>Adjust →</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Month drill-down modal (desktop mirror of PWA FeesMonthModal) ──────────
// Opens when the user clicks a bar on PortalFeesTrend. Lists every closed
// trade whose exitTime falls inside the YYYY-MM bucket, sorted by
// entryFee+exitFee descending so the costliest fee offenders surface first.
function portalCustomerTradeFeeImpact(t: CustomerTrade): number {
  const toN = (v: number | string | null | undefined): number => {
    if (v === null || v === undefined) return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  // Prefer broker-reported commissions when present, fall back to catalog.
  const entry = toN(t.entryFeeBroker) || toN(t.entryFee);
  const exit  = toN(t.exitFeeBroker)  || toN(t.exitFee);
  return entry + exit;
}

function portalTradeMonthKey(t: CustomerTrade): string | null {
  const ms = Number(t.exitTime ?? 0);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function portalCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function portalDownloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map(r => r.map(portalCsvCell).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function PortalFeesMonthModal({
  month, trades, onClose,
}: {
  month: string;
  trades: CustomerTrade[];
  onClose: () => void;
}) {
  const monthTrades = useMemo(() => {
    return trades
      .filter(t => portalTradeMonthKey(t) === month)
      .map(t => ({ t, impact: portalCustomerTradeFeeImpact(t) }))
      .sort((a, b) => b.impact - a.impact);
  }, [month, trades]);

  const totalFees     = monthTrades.reduce((s, x) => s + x.impact, 0);
  const totalRealized = monthTrades.reduce((s, x) => s + Number(x.t.realizedPnL ?? 0), 0);
  const label = `${portalFeesShortLabel(month)} ${month.slice(0, 4)}`;

  const exportCsv = () => {
    const toN = (v: number | string | null | undefined): number => {
      if (v === null || v === undefined) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const header = [
      "symbol", "side", "entry_price", "exit_price", "exit_time",
      "broker", "entry_fee", "exit_fee", "total_fee", "realized_pnl",
    ];
    const rows: string[][] = [header];
    for (const { t, impact } of monthTrades) {
      const entry = toN(t.entryFeeBroker) || toN(t.entryFee);
      const exit  = toN(t.exitFeeBroker)  || toN(t.exitFee);
      const exitMs = Number(t.exitTime ?? 0);
      const exitIso = Number.isFinite(exitMs) && exitMs > 0
        ? new Date(exitMs).toISOString() : "";
      rows.push([
        displaySymbol(t.symbol),
        t.side,
        String(t.entryPrice),
        String(t.exitPrice),
        exitIso,
        (t.exchange ?? "").toString().toUpperCase(),
        entry.toFixed(4),
        exit.toFixed(4),
        impact.toFixed(4),
        toN(t.realizedPnL).toFixed(4),
      ]);
    }
    portalDownloadCsv(`aicandlez-fees-${month}.csv`, rows);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Fee breakdown for ${label}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.74)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        fontFamily: N.FONT_MONO,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 640,
          background: "#050D1A",
          border: `1px solid ${N.BRAND}40`,
          borderRadius: 8,
          padding: "18px 20px 22px",
          maxHeight: "84vh", overflowY: "auto",
          boxShadow: `0 0 40px ${N.BRAND_GLOW}, inset 0 0 20px ${N.BRAND}08`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: N.TEXT_2, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              MONTHLY FEE BREAKDOWN
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: N.BRAND, marginTop: 4,
              letterSpacing: "0.06em", textShadow: `0 0 8px ${N.BRAND_GLOW}` }}>
              {label}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={exportCsv}
              disabled={monthTrades.length === 0}
              aria-label="Export CSV"
              title="Download month's fee breakdown as CSV"
              style={{
                background: `linear-gradient(180deg, ${N.BRAND}22, ${N.BRAND}10)`,
                border: `1px solid ${N.BRAND}66`,
                color: monthTrades.length === 0 ? N.TEXT_3 : N.BRAND,
                padding: "0 12px", height: 36, borderRadius: 6,
                fontFamily: N.FONT_MONO, fontSize: 10, fontWeight: 800,
                letterSpacing: "0.16em",
                textShadow: monthTrades.length === 0 ? "none" : `0 0 8px ${N.BRAND_GLOW}`,
                cursor: monthTrades.length === 0 ? "not-allowed" : "pointer",
                opacity: monthTrades.length === 0 ? 0.4 : 1,
              }}
            >EXPORT CSV</button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent", border: `1px solid ${N.BORDER_HI}`,
                color: N.TEXT_2, width: 36, height: 36, borderRadius: 6,
                fontFamily: N.FONT_MONO, fontSize: 16, cursor: "pointer",
              }}
            >×</button>
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
          padding: "12px 0 14px", borderBottom: `1px solid ${N.BORDER_HI}`, marginBottom: 12,
        }}>
          <div>
            <div style={{ fontSize: 9, color: N.TEXT_2, letterSpacing: "0.14em" }}>TRADES</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: N.TEXT_1, marginTop: 4 }}>
              {monthTrades.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: N.TEXT_2, letterSpacing: "0.14em" }}>FEES</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#ff7a3d", marginTop: 4 }}>
              −${totalFees.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: N.TEXT_2, letterSpacing: "0.14em" }}>REALIZED PNL</div>
            <div style={{
              fontSize: 16, fontWeight: 700, marginTop: 4,
              color: totalRealized >= 0 ? N.BRAND : "#ff4466",
            }}>
              {totalRealized >= 0 ? "+" : ""}${totalRealized.toFixed(2)}
            </div>
          </div>
        </div>

        <div style={{
          fontSize: 9, color: N.TEXT_2,
          letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8,
        }}>
          COSTLIEST FIRST · ENTRY + EXIT FEE
        </div>

        {monthTrades.length === 0 ? (
          <div style={{
            padding: "32px 0", textAlign: "center",
            fontSize: 10, color: N.TEXT_3,
            letterSpacing: "0.14em", textTransform: "uppercase",
          }}>
            NO CLOSED TRADES THIS MONTH
          </div>
        ) : (
          monthTrades.map(({ t, impact }) => {
            const pnl = Number(t.realizedPnL ?? 0);
            const up  = pnl >= 0;
            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0", borderBottom: `1px solid ${N.BORDER_HI}66`,
              }}>
                <div style={{
                  width: 3, alignSelf: "stretch", borderRadius: 2,
                  background: up ? N.BRAND : "#ff4466",
                  boxShadow: up ? `0 0 6px ${N.BRAND_GLOW}` : "0 0 6px rgba(255,68,102,0.4)",
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: N.TEXT_1 }}>
                    {displaySymbol(t.symbol)}
                    <span style={{ color: up ? N.BRAND : "#ff4466", fontWeight: 600, marginLeft: 8, fontSize: 10 }}>
                      {t.side}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: N.TEXT_2, marginTop: 3 }}>
                    ${Number(t.entryPrice).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    <span style={{ color: N.TEXT_3 }}> → </span>
                    ${Number(t.exitPrice).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    {t.exchange && (
                      <span style={{ color: N.TEXT_3 }}> · {String(t.exchange).toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#ff7a3d" }}>
                    −${impact.toFixed(2)}
                  </div>
                  <div style={{
                    fontSize: 10, marginTop: 2,
                    color: up ? N.BRAND : "#ff4466", opacity: 0.85,
                  }}>
                    {up ? "+" : ""}${pnl.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Portal() {
  // PaperTradesProvider and PortalModeProvider are both mounted only on the
  // customer portal path (gated inside PortalInner by `!isAdmin`). Admin
  // operators on admintrade.aicandlez.com get neither — their /portal is
  // real-execution-only with no paper-trade store and no PAPER/LIVE toggle.
  return <PortalInner />;
}

function PortalInner() {
  const { isAdmin } = useUserRole();
  const { getToken, isSignedIn } = useAuth();
  const [dbTier, setDbTier] = useState<Plan>("free");
  const [upgradeOpen,    setUpgradeOpen]    = useState(false);
  const [accountOpen,    setAccountOpen]    = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [connectExchangeOpen, setConnectExchangeOpen] = useState(false);
  // Drill-down month for the PortalFeesTrend bar-click modal (Task #106).
  const [feesDrillMonth, setFeesDrillMonth] = useState<string | null>(null);
  const { gate: disclaimerGate, modal: disclaimerGateModal } = useDisclaimerGate();

  // Admin / super-admin bypass — admins are not customers and must never see
  // paywall UI, locked panels, "Upgrade to Pro" prompts, FeatureGate overlays,
  // or any subscription gating. Their effective tier is treated as the highest
  // customer tier ("pro") so every downstream tier check reads as unlocked.
  // Concurrent execution cap is bumped to 30 for admins (vs the 12-slot Pro
  // customer cap). Real authorization is still enforced server-side via
  // requireRole in api-server; this is a UX-only flattening.
  const tier: Plan = isAdmin ? "pro" : dbTier;
  const ADMIN_CONCURRENT_CAP = 30;
  // Suppress the UpgradeModal entirely for admins. We intercept setter calls
  // by wrapping the open setter — keeps every existing call site (~7 of them)
  // working without per-site changes.
  const setUpgradeOpenSafe = (v: boolean) => {
    if (isAdmin) return;
    setUpgradeOpen(v);
  };

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken().catch(() => null);
        const res = await fetch(`${apiBaseUrl}/api/billing/subscription`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = (await res.json()) as { plan?: string };
        if (cancelled || !data.plan) return;
        const p = data.plan as string;
        setDbTier(p === "starter" || p === "pro" ? p : "free");
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, getToken]);

  // Live engine status drives the signal panels + heartbeat.
  const { data: engine } = useQuery({
    queryKey: ["engine-status-portal"],
    queryFn:  () => j<EngineStatus>(`${basePath}/api/engine/status`),
    ...Q_MEDIUM,
  });

  const cap = useMemo(() => {
    if (isAdmin) {
      return { cap: ADMIN_CONCURRENT_CAP, label: `UP TO ${ADMIN_CONCURRENT_CAP} CONCURRENT LIVE TRADES · ADMIN` };
    }
    return tierCapacity(tier);
  }, [tier, isAdmin]);
  const exchangeStatus = useExchangeStatus();
  const hasExchange    = exchangeStatus.connectedCount > 0;
  const liveBalances   = useLiveExchangeBalances(hasExchange);

  // Server-derived stats — shares the cache key with ActiveTradesPanel /
  // TradeHistoryPanel so the metric tiles, open-position list, and closed
  // trade history all read from the same `/api/simulation/*` snapshot the
  // PWA receipt and account screen render. No client-only simulator state.
  const simAccountQuery = useQuery<CustomerAccount & {
    equity?: number;
    startBalance?: number;
    totalPnL?: number;
    totalPnLPct?: number;
    unrealizedPnL?: number;
  }>({
    queryKey: ["customer-simulation-account"],
    enabled: isSignedIn ?? false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/simulation/account`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("simulation/account failed");
      return res.json();
    },
    refetchInterval: 4_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const simTradesQuery = useQuery<{ trades: CustomerTrade[] }>({
    queryKey: ["customer-simulation-trades"],
    enabled: isSignedIn ?? false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/simulation/trades`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("simulation/trades failed");
      return res.json();
    },
    refetchInterval: 6_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Mode-driven account hydration: PAPER tiles read from /api/simulation/account,
  // LIVE tiles read from the per-user exchange balances (`useLiveExchangeBalances`).
  // Admins on /admintrade never see PortalModeProvider, so they always get the
  // simulation-backed view as before (their LIVE telemetry lives elsewhere).
  const storedMode = useStoredPortalMode();
  const effectiveMode: PortalMode = !isAdmin && tier !== "free" && hasExchange ? storedMode : "PAPER";

  const stats = useMemo(() => {
    const acct      = simAccountQuery.data;
    const positions = acct?.positions ?? [];
    const trades    = simTradesQuery.data?.trades ?? [];

    const startBalance = toNum(acct?.startBalance ?? 100_000);
    const simEquity    = acct?.equity != null ? toNum(acct.equity) : startBalance;
    const simTotalPnl  = acct?.totalPnL != null ? toNum(acct.totalPnL) : simEquity - startBalance;

    // In LIVE mode, replace equity/totalPnL with live exchange balances when
    // available. PnL deltas (today/month/winRate) stay computed from the
    // simulation trade ledger — those are tagged PAPER/LIVE in the chips and
    // will graduate to a true LIVE ledger when the broker-fee schema fields
    // are restored (tracked as a tech-debt follow-up).
    const useLive  = effectiveMode === "LIVE" && liveBalances.hasOk && liveBalances.totalEquityUSD !== null;
    const equity   = useLive ? (liveBalances.totalEquityUSD as number) : simEquity;
    const totalPnl = useLive ? (equity - startBalance) : simTotalPnl;

    const now = new Date();
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let todayPnl = 0;
    let monthPnl = 0;
    let wins = 0;
    let bestSymbol: string | null = null;
    let bestPnl = -Infinity;
    for (const t of trades) {
      const ts  = Number(t.exitTime ?? 0);
      const pnl = toNum(t.realizedPnL);
      if (ts >= startOfDay)   todayPnl += pnl;
      if (ts >= startOfMonth) monthPnl += pnl;
      if (pnl > 0) wins += 1;
      if (pnl > bestPnl) { bestPnl = pnl; bestSymbol = displaySymbol(t.symbol); }
    }
    const closedCount = trades.length;
    const openCount   = positions.length;
    const winRate     = closedCount === 0 ? 0 : (wins / closedCount) * 100;

    return {
      openCount,
      closedCount,
      totalCount: openCount + closedCount,
      totalPnl,
      todayPnl,
      monthPnl,
      winRate,
      equity,
      startBalance,
      bestSymbol,
      bestPnl: closedCount === 0 ? 0 : bestPnl,
    };
  }, [simAccountQuery.data, simTradesQuery.data, effectiveMode, liveBalances.hasOk, liveBalances.totalEquityUSD]);

  // Live-derived metric strings (replace earlier hardcoded demo numbers).
  const equityBase = stats.startBalance || 100_000;
  const fmtPct = (n: number) =>
    `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const totalPct = (stats.totalPnl / equityBase) * 100;
  const todayPct = (stats.todayPnl / equityBase) * 100;
  const monthPct = (stats.monthPnl / equityBase) * 100;
  const equityStr = `$${stats.equity.toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
  // Capacity: free tier has no live execution slots; starter=3, pro=12;
  // admin = 30 (handled inside `cap` memo above).
  const capacityDisplay =
    isAdmin ? String(ADMIN_CONCURRENT_CAP)
    : tier === "free" ? "—"
    : String(cap.cap ?? "—");
  const hasClosed = stats.closedCount > 0;
  const hasAnyActivity = stats.totalCount > 0;

  // Lifetime broker commission paid across every closed live leg. Mirrors the
  // mobile PWA Portfolio "Fees paid" stat (Task #82) so equity reconciliation
  // reads the same on every surface. Pulls from /api/account → simAccount
  // .totalFeesPaid; paper-only users see "—".
  const accountFeesQuery = useQuery<{ totalFeesPaid?: number }>({
    queryKey: ["/api/account", "portal-fees"],
    enabled:  isSignedIn ?? false,
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/account`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load account");
      return res.json();
    },
  });
  const totalFeesPaid = accountFeesQuery.data?.totalFeesPaid ?? 0;

  // Monthly broker-commission trend (last 6 months) — mirrors the PWA
  // Portfolio FeesMonthlyChart (Task #95) so desktop customers can see
  // whether commission is climbing or shrinking over time. Same endpoint,
  // same shape, same empty-state semantics.
  type MonthlyFeesBucket = { month: string; feesPaid: number; tradeCount: number; realizedPnL: number };
  type MonthlyFeesResp   = { months: MonthlyFeesBucket[]; totalFeesPaid: number };
  const monthlyFeesQuery = useQuery<MonthlyFeesResp>({
    queryKey: ["/api/account/fees/monthly", "portal"],
    enabled:  (isSignedIn ?? false) && !isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/account/fees/monthly?months=6`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load monthly fees");
      return res.json();
    },
  });
  const monthlyFees = monthlyFeesQuery.data;

  // Admin-scoped monthly broker-fee trend — platform-wide aggregation across
  // every user's closed sim_trades. Mirrors the customer endpoint shape so
  // PortalFeesTrend / PortalFeesMonthModal can render either feed. Only fetched
  // for admin/super-admin users (the customer monthlyFeesQuery covers the
  // rest); endpoint itself is requireOperator-gated server-side.
  const adminMonthlyFeesQuery = useQuery<MonthlyFeesResp>({
    queryKey: ["/api/admin/fees/monthly", "portal-admin"],
    enabled:  (isSignedIn ?? false) && isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/admin/fees/monthly?months=6`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load admin monthly fees");
      return res.json();
    },
  });
  const adminMonthlyFees = adminMonthlyFeesQuery.data;

  // Admin month-drill trades — loaded on demand when an operator taps a bar on
  // the admin fees-trend chart. Returns every closed sim_trades row whose
  // exit_time falls inside the YYYY-MM bucket, already sorted by entry+exit
  // fee descending (costliest first) so PortalFeesMonthModal can render as-is.
  type AdminMonthTradesResp = { month: string; trades: Array<Record<string, unknown>> };
  const adminFeesMonthQuery = useQuery<AdminMonthTradesResp>({
    queryKey: ["/api/admin/fees/month", feesDrillMonth, "portal-admin"],
    enabled:  (isSignedIn ?? false) && isAdmin && !!feesDrillMonth,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${apiBaseUrl}/api/admin/fees/month/${feesDrillMonth}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load admin month fees");
      return res.json();
    },
  });
  // Map the raw snake_case rows to the CustomerTrade shape consumed by
  // PortalFeesMonthModal. The fields used by the modal are: id, symbol, side,
  // entryPrice, exitPrice, exitTime, realizedPnL, exchange, entryFee, exitFee,
  // entryFeeBroker, exitFeeBroker — everything else is optional.
  const adminFeesMonthTrades: CustomerTrade[] = useMemo(() => {
    const rows = adminFeesMonthQuery.data?.trades ?? [];
    return rows.map((r: Record<string, unknown>) => ({
      id:                       String(r["id"] ?? ""),
      symbol:                   String(r["symbol"] ?? ""),
      side:                     (String(r["side"] ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
      entryPrice:               Number(r["entry_price"] ?? 0),
      exitPrice:                Number(r["exit_price"] ?? 0),
      exitTime:                 Number(r["exit_time"] ?? 0),
      realizedPnL:              Number(r["realized_pnl"] ?? 0),
      realizedPnLPct:           Number(r["realized_pnl_pct"] ?? 0),
      closeReason:              (r["close_reason"] as string | null) ?? null,
      exchange:                 (r["exchange"] as string | null) ?? null,
      entryFee:                 (r["entry_fee"]                as number | null) ?? null,
      exitFee:                  (r["exit_fee"]                 as number | null) ?? null,
      entryFeeBroker:           (r["entry_fee_broker"]         as number | null) ?? null,
      entryFeeBrokerCurrency:   (r["entry_fee_broker_currency"] as string | null) ?? null,
      exitFeeBroker:            (r["exit_fee_broker"]          as number | null) ?? null,
      exitFeeBrokerCurrency:    (r["exit_fee_broker_currency"]  as string | null) ?? null,
    }));
  }, [adminFeesMonthQuery.data]);

  // Platform-wide win-rate seed for the admin fees-trend "AI take" insight.
  // Derived from the aggregated months payload so we don't fan out an extra
  // closed-trades fetch on every admin Portal mount.
  const adminWinRate = useMemo(() => {
    if (!adminMonthlyFees) return undefined;
    let trades = 0;
    let wins   = 0;
    for (const b of adminMonthlyFees.months) {
      trades += b.tradeCount;
      if (b.realizedPnL > 0) wins += b.tradeCount; // coarse proxy at month grain
    }
    if (trades === 0) return undefined;
    return (wins / trades) * 100;
  }, [adminMonthlyFees]);

  // ── ADMIN OPERATOR · Real Kraken live snapshot ──────────────────────────────
  // On admintrade.aicandlez.com the workstation must reflect REAL Kraken account
  // state (USD balance, exchange identity, live/error source), never the
  // $100,000 paper-trade hero. We poll /api/exchange/balances (requireOperator)
  // every 10s once admin auth resolves, and force the shared engine into LIVE
  // mode once on mount so the very first read is real.
  type KrakenSnap = {
    // "live"       — real broker round-trip succeeded, balances are real
    // "error"      — keys present but auth/network failed (banner stays red)
    // "standby"    — no live keys configured server-side
    // "simulation" — legacy server response, treated identically to standby
    //                (we NEVER surface the $100K sim hero on the admin Portal)
    source: "live" | "simulation" | "error" | "standby";
    exchange: string;
    balances: { USD: number; BTC: number; ETH: number; SOL: number };
    error?: string;
  };
  const [adminKraken, setAdminKraken] = useState<KrakenSnap | null>(null);

  useEffect(() => {
    if (!isAdmin || !isSignedIn) return;
    let cancelled = false;

    const authHeaders = async (): Promise<HeadersInit> => {
      const t = await getToken().catch(() => null);
      return t ? { Authorization: `Bearer ${t}` } : {};
    };

    const forceLive = async () => {
      try {
        const headers = await authHeaders();
        await fetch(`${apiBaseUrl}/api/exchange/mode`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ mode: "live" }),
        });
      } catch { /* tolerate — read still attempts */ }
    };

    const fetchSnap = async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBaseUrl}/api/exchange/balances`, {
          credentials: "include", headers,
        });
        if (!res.ok) return;
        const data = (await res.json()) as KrakenSnap;
        if (!cancelled) setAdminKraken(data);
      } catch { /* keep last snapshot */ }
    };

    void forceLive().then(fetchSnap);
    const iv = setInterval(fetchSnap, 10_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAdmin, isSignedIn, getToken]);

  const adminLiveSource = adminKraken?.source ?? null;
  const adminIsLive       = adminLiveSource === "live";
  // Only display a USD figure when the read genuinely came back live. Any
  // other state (loading / standby / error / legacy "simulation") renders
  // "—" so the institutional terminal never surfaces a fake hero balance.
  const adminUsd          = adminIsLive ? (adminKraken?.balances.USD ?? 0) : null;
  const adminExchangeName = (adminKraken?.exchange ?? "kraken").toUpperCase();
  const adminLiveBadge = adminIsLive
    ? `${adminExchangeName} LIVE`
    : adminLiveSource === "error"
      ? `${adminExchangeName} AUTH FAILED`
      : adminLiveSource === "standby" || adminLiveSource === "simulation"
        ? `${adminExchangeName} STANDBY`
        : "CONNECTING…";

  const body = (
    <div style={{
      minHeight: "100dvh",
      background: N.BG,
      color: N.TEXT_0,
      fontFamily: N.FONT_MONO,
    }}>
      <TopBar
        onAccount={() => setAccountOpen(true)}
        onUpgrade={() => setUpgradeOpenSafe(true)}
        onDisclaimer={() => setDisclaimerOpen(true)}
        onConnectExchange={() => disclaimerGate(() => setConnectExchangeOpen(true))}
        statusPill={
          <ExchangeStatusPill
            status={exchangeStatus}
            adminOverride={isAdmin ? { source: adminLiveSource, exchange: adminExchangeName } : undefined}
          />
        }
        isAdmin={isAdmin}
      />

      {isAdmin && (
        <div style={{
          padding: "8px 24px",
          background: `${N.BRAND}10`,
          borderBottom: `1px solid ${N.BRAND}30`,
          fontFamily: N.FONT_MONO, fontSize: 10, letterSpacing: "0.16em",
          color: N.BRAND, display: "flex", alignItems: "center", gap: 12,
        }}>
          <span>▲ ADMIN VIEW — VIEWING CUSTOMER PORTAL</span>
          <Link href="/command">
            <a style={{ color: N.BRAND, textDecoration: "underline" }}>OPEN COMMAND CENTER →</a>
          </Link>
        </div>
      )}

      {!isAdmin && (
        <>
          <PortalModeToggle
            onUpgrade={() => setUpgradeOpenSafe(true)}
            onConnectExchange={() => disclaimerGate(() => setConnectExchangeOpen(true))}
          />
          <PaperSandboxToggle defaultExchange={exchangeStatus.defaultExchange} />
        </>
      )}

      <LogoBanner tier={tier} isAdmin={isAdmin} />

      {/* First-time onboarding banner — auto-hides once at least one exchange
          is connected. Admins use server-side env Kraken keys (no per-user
          row in user_exchange_connections), so this customer onboarding
          prompt is suppressed for them — otherwise it would always render. */}
      {!isAdmin && !hasExchange && <ExchangeOnboardingBanner onConnect={() => disclaimerGate(() => setConnectExchangeOpen(true))} />}

      {/* Alpaca OAuth re-authorize banner — surfaced when the background
          AlpacaTokenRefresher has marked the user's Alpaca row as
          status="error" with an OAuth-refresh failure. Banner clears once
          the next /api/user/exchanges poll reports status back to active. */}
      {!isAdmin && exchangeStatus.alpacaOauthErrored && (
        <AlpacaReconnectBanner lastError={exchangeStatus.alpacaLastError} />
      )}

      {/* Unhealthy connection warning — non-blocking, dismissible. Surfaces
          any per-connection `ok:false` reported by /api/user/exchanges/balances
          (auth failure, revoked key, exchange timeout) so users aren't silently
          dropped to simulated balances without notice. */}
      {!isAdmin && liveBalances.ready && (
        <ExchangeWarningBanner
          failing={liveBalances.connections
            .filter(c => !c.ok)
            .map(c => ({ exchange: c.exchange, error: c.error }))}
          onReconnect={() => disclaimerGate(() => setConnectExchangeOpen(true))}
        />
      )}

      {/* Metrics row.
          Admin operators on admintrade.aicandlez.com see REAL Kraken live
          telemetry only (USD balance, exchange identity, open live slots,
          source). Customers continue to see paper-trade tiles tagged DEMO. */}
      {isAdmin ? (
        <div style={{
          padding: "12px 24px 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
        }}>
          <MetricTile
            label={`${adminExchangeName} USD`}
            value={adminUsd !== null
              ? `$${adminUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
            delta={adminLiveBadge}
            positive={adminIsLive}
          />
          <MetricTile
            label="BTC"
            value={adminIsLive && adminKraken ? adminKraken.balances.BTC.toFixed(6) : "—"}
            delta={adminIsLive ? "LIVE" : "—"}
            positive={adminIsLive}
          />
          <MetricTile
            label="ETH"
            value={adminIsLive && adminKraken ? adminKraken.balances.ETH.toFixed(4) : "—"}
            delta={adminIsLive ? "LIVE" : "—"}
            positive={adminIsLive}
          />
          <MetricTile
            label="SOL"
            value={adminIsLive && adminKraken ? adminKraken.balances.SOL.toFixed(3) : "—"}
            delta={adminIsLive ? "LIVE" : "—"}
            positive={adminIsLive}
          />
          <MetricTile
            label="LIVE AI TRADES"
            value={`${stats.openCount} / ${ADMIN_CONCURRENT_CAP}`}
            delta="OPERATOR"
            positive
          />
          <MetricTile
            label="EXCHANGE"
            value={adminExchangeName}
            delta="LIVE ONLY"
            positive
          />
          <MetricTile
            label="MODE"
            value="LIVE"
            delta="KRAKEN OPERATOR"
            positive
          />
        </div>
      ) : (
        <div style={{
          padding: "12px 24px 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
        }}>
          <MetricTile
            label="TOTAL P/L"
            value={fmtMoney(stats.totalPnl)}
            delta={hasAnyActivity ? fmtPct(totalPct) : "—"}
            positive={stats.totalPnl >= 0}
            demo
          />
          <MetricTile
            label="WIN RATE"
            value={hasClosed ? `${stats.winRate.toFixed(1)}%` : "—"}
            delta={hasClosed ? `${stats.closedCount} CLOSED` : "AWAITING CLOSE"}
            positive={stats.winRate >= 50}
            demo
          />
          <MetricTile
            label="ACTIVE AI TRADES"
            value={`${stats.openCount} / ${capacityDisplay}`}
            delta={tier.toUpperCase()}
            positive
            demo
          />
          <MetricTile
            label="TODAY"
            value={fmtMoney(stats.todayPnl)}
            delta={hasClosed ? fmtPct(todayPct) : "—"}
            positive={stats.todayPnl >= 0}
            demo
          />
          <MetricTile
            label="MONTHLY"
            value={fmtMoney(stats.monthPnl)}
            delta={hasClosed ? fmtPct(monthPct) : "—"}
            positive={stats.monthPnl >= 0}
            demo
          />
          <MetricTile
            label="TOTAL TRADES"
            value={String(stats.totalCount)}
            delta={`${stats.openCount} OPEN`}
            positive
            demo
          />
          <MetricTile
            label="BEST ASSET"
            value={stats.bestSymbol ?? "—"}
            delta={stats.bestSymbol ? fmtMoney(stats.bestPnl) : "AWAITING CLOSE"}
            positive={stats.bestPnl >= 0}
            demo
          />
          {/* EQUITY tile always reads the server-side simulation account so
              the customer Portal header reconciles 1:1 with the PWA account
              screen and trade receipt. When a live exchange is connected we
              surface the broker-reported equity / buying power as a delta
              line below the canonical value instead of replacing it. */}
          <MetricTile
            label="EQUITY"
            value={equityStr}
            delta={
              liveBalances.hasOk && liveBalances.totalEquityUSD !== null
                ? `${(liveBalances.primaryExchange ?? "EXCHANGE").toUpperCase()} $${liveBalances.totalEquityUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}${
                    liveBalances.buyingPowerUSD !== null
                      ? ` · BP $${liveBalances.buyingPowerUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                      : ""
                  }`
                : undefined
            }
            positive={stats.totalPnl >= 0}
            demo
          />
          {/* Lifetime broker commission across every closed live leg —
              mirrors the PWA Portfolio "Fees paid" stat. Dimmed em-dash
              for paper-only customers. fmtMoney already injects a +/- sign
              so we format the unsigned value manually to render "−$x.xx". */}
          <MetricTile
            label="FEES PAID"
            value={totalFeesPaid > 0
              ? `−$${totalFeesPaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
            delta={totalFeesPaid > 0 ? "LIFETIME BROKER" : "NO LIVE FEES YET"}
            positive={false}
            demo
          />
        </div>
      )}

      {/* Monthly broker-fee trend — desktop mirror of the PWA Portfolio
          FeesMonthlyChart. Customer build pulls per-user /account/fees/monthly;
          admin build pulls platform-wide /admin/fees/monthly (every user's
          closed sim_trades aggregated). Both feeds render through the same
          PortalFeesTrend component and drill into PortalFeesMonthModal. */}
      <div style={{ padding: "12px 24px 0" }}>
        <PortalFeesTrend
          data={isAdmin ? adminMonthlyFees : monthlyFees}
          winRate={isAdmin ? adminWinRate : stats.winRate}
          onSelectMonth={(m) => setFeesDrillMonth(m)}
        />
      </div>

      {/* Month drill-down modal — opens when the user (or admin operator)
          clicks a bar on PortalFeesTrend. Customer build reuses the already-
          mounted simTradesQuery; admin build fetches the platform-wide
          drill-down from /admin/fees/month/:month so operators see every
          user's costliest trades for that month sorted fee-desc. */}
      {feesDrillMonth && (
        <PortalFeesMonthModal
          month={feesDrillMonth}
          trades={isAdmin ? adminFeesMonthTrades : (simTradesQuery.data?.trades ?? [])}
          onClose={() => setFeesDrillMonth(null)}
        />
      )}

      {/* AI Settings · Min Confidence Threshold — customer-only, deep-link
          target for the AI TAKE callout on PortalFeesTrend (Task #117). */}
      {!isAdmin && (
        <div style={{ padding: "12px 16px 0" }}>
          <PortalAIConfidencePanel />
        </div>
      )}

      {/* AI Intelligence Center — radar + diverse live telemetry */}
      <div style={{ padding: "16px 16px 0" }}>
        <AIWarRoom />
      </div>

      {/* Live cross-asset heartbeat (institutional row) */}
      <div style={{ padding: "12px 16px 0" }}>
        <MarketHeartbeat />
      </div>

      {/* Live AI Execution control */}
      <div style={{ padding: "12px 16px 0" }}>
        <LiveExecutionBar
          tier={tier}
          onUpgrade={() => setUpgradeOpenSafe(true)}
          onConnectExchange={() => disclaimerGate(() => setConnectExchangeOpen(true))}
          exchangeConnected={hasExchange}
          openSlots={stats.openCount}
          isAdmin={isAdmin}
        />
      </div>

      {/* ── ADMIN OPERATOR LAYOUT ──────────────────────────────────────────────
          Two-column institutional terminal: Crypto signals stacked above Live
          Trades on the left, Equity signals stacked above Trade History on
          the right. Same neon-green panel chrome, expanded vertical footprint,
          no subscription/queue panels. */}
      {isAdmin ? (
        <div style={{
          padding: "16px 16px 32px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CryptoSignalsPanel engine={engine} />
            {/* Admin layout uses live Kraken-sourced panels — never the
                paper-trade simulator. See AdminLiveTradesPanel above. */}
            <AdminLiveTradesPanel />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <EquitySignalsPanel engine={engine} />
            <AdminTradeHistoryPanel />
          </div>
        </div>
      ) : (
      <>
      {/* TOP 20 CRYPTO + TOP 20 EQUITY signal panels */}
      <div style={{
        padding: "14px 16px 0",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
      }}>
        <CryptoSignalsPanel engine={engine} />
        <EquitySignalsPanel engine={engine} />
      </div>

      {/* Bottom panels */}
      <div style={{
        padding: "16px 16px 32px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 10,
      }}>
        <ActiveTradesPanel onUpgrade={() => setUpgradeOpenSafe(true)} />

        <TradeHistoryPanel onUpgrade={() => setUpgradeOpenSafe(true)} />

        <Panel title="SUBSCRIPTION STATUS">
          <Row left="Current Plan"    right={tier.toUpperCase()} color={N.BRAND} />
          <Row left="Concurrent Cap"  right={tier === "pro" ? "12 trades" : tier === "starter" ? "3 trades" : "Paper only"} />
          <Row left="Billing"         right={tier === "free" ? "—" : "Monthly"} sub="Cancel anytime · Stripe portal" />
          <Row left="Performance Fee" right="3% (profitable trades only)" sub="Never charged on losses" />
          <div style={{ marginTop: 14 }}>
            {tier === "pro" ? (
              // Pro users go straight to the Stripe customer portal via the
              // same /api/billing/portal endpoint the AccountModal uses — no
              // intermediate /billing page.
              <button
                onClick={async () => {
                  try {
                    const token = await getToken().catch(() => null);
                    const res = await fetch(`${apiBaseUrl}/api/billing/portal`, {
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
                }}
                style={{
                  display: "block", width: "100%",
                  textAlign: "center",
                  padding: "10px 14px",
                  background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
                  border: `1px solid ${N.BRAND}`,
                  borderRadius: 4,
                  color: "#001a0d", fontWeight: 800, fontSize: 11,
                  letterSpacing: "0.16em",
                  cursor: "pointer",
                  fontFamily: N.FONT_MONO,
                  boxShadow: `0 0 18px ${N.BRAND_GLOW}`,
                }}
              >
                MANAGE BILLING
              </button>
            ) : (
              // Free + Starter both open the same unified upgrade modal that
              // every other locked CTA on /portal uses. No more split routing.
              <button
                onClick={() => setUpgradeOpenSafe(true)}
                style={{
                  display: "block", width: "100%",
                  textAlign: "center",
                  padding: "10px 14px",
                  background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
                  border: `1px solid ${N.BRAND}`,
                  borderRadius: 4,
                  color: "#001a0d", fontWeight: 800, fontSize: 11,
                  letterSpacing: "0.16em",
                  cursor: "pointer",
                  fontFamily: N.FONT_MONO,
                  boxShadow: `0 0 18px ${N.BRAND_GLOW}`,
                  transition: "transform 200ms ease, box-shadow 200ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 0 26px ${N.BRAND_GLOW}, 0 0 12px ${N.BRAND}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = `0 0 18px ${N.BRAND_GLOW}`;
                }}
              >
                {tier === "starter" ? "UPGRADE TO PRO" : "START AI TRADING"}
              </button>
            )}
          </div>
        </Panel>

        <Panel title="EXCHANGE CONNECTIONS · HEALTH">
          <ExchangeConnectionsHealthPanel />
        </Panel>

        <Panel title="AI AUTO TRADE QUEUE" locked={tier === "free"} onUnlock={() => setUpgradeOpenSafe(true)}>
          {QUEUE.map((q) => (
            <Row key={q.sym} left={`${q.sym}  ${q.side}`} right={q.conf}
                 color={N.BRAND} sub={q.state} />
          ))}
          <div style={{ marginTop: 10, color: N.TEXT_2, fontSize: 9, letterSpacing: "0.14em" }}>
            AI EXECUTES IN ORDER OF CONFIDENCE · 80% MIN CONFIDENCE FLOOR · CAPACITY GATED BY PLAN
          </div>
        </Panel>
      </div>
      </>
      )}

      <footer style={{
        padding: "20px 24px",
        borderTop: `1px solid ${N.BORDER}`,
        textAlign: "center",
        color: N.TEXT_2, fontSize: 9, letterSpacing: "0.20em",
      }}>
        {isAdmin
          ? "AICANDLEZ · OPERATOR WORKSTATION · KRAKEN LIVE EXECUTION · INTERNAL USE ONLY"
          : "AICANDLEZ · ALPACA-ROUTED LIVE EXECUTION · 3% FEE ON PROFITABLE TRADES ONLY"}
      </footer>

      <UpgradeModal    open={upgradeOpen}    onClose={() => setUpgradeOpen(false)}
                       gate={disclaimerGate} />
      <AccountModal    open={accountOpen}    onClose={() => setAccountOpen(false)}
                       tier={tier} onUpgrade={() => setUpgradeOpenSafe(true)} />
      <DisclaimerModal open={disclaimerOpen} onClose={() => setDisclaimerOpen(false)} />
      <PortalExchangeConnectModal
        open={connectExchangeOpen}
        onClose={() => setConnectExchangeOpen(false)}
      />
      {disclaimerGateModal}
    </div>
  );

  // Admin operators on admintrade.aicandlez.com: real-only, no PAPER store,
  // no PAPER/LIVE toggle, no per-tier gates. They get the raw body.
  if (isAdmin) return body;

  // Customer portal: mount PaperTradesProvider (BUY/SELL paper exec store)
  // and PortalModeProvider (PAPER/LIVE toggle + tier/exchange-gated live).
  return (
    <PaperTradesProvider>
      <PortalModeProvider tier={dbTier} hasExchange={hasExchange}>
        {body}
      </PortalModeProvider>
    </PaperTradesProvider>
  );
}

/**
 * PortalModeToggle — segmented PAPER / LIVE control rendered between the
 * TopBar and LogoBanner on the customer portal. Free tier sees a static
 * PAPER pill + inline "Upgrade to unlock LIVE" link. Subscribers see a
 * real toggle; LIVE is disabled when no exchange is connected (with a
 * "Connect an exchange" CTA in place of the lock copy).
 */
function PortalModeToggle({
  onConnectExchange,
}: {
  onUpgrade:          () => void;
  onConnectExchange:  () => void;
}) {
  const { mode, setMode, canUseLive, hasExchange, liveLockReason } = usePortalMode();
  const liveLocked = !canUseLive || !hasExchange;

  // Free tier: NO toggle. Static PAPER pill + inline /subscribe link, per
  // task spec ("free users locked to PAPER with 'Upgrade to unlock LIVE' CTA").
  if (!canUseLive) {
    return (
      <div
        role="group"
        aria-label="Portal trading mode"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 14, padding: "10px 24px 0",
          fontFamily: N.FONT_MONO,
        }}
      >
        <span style={{
          fontSize: 9, letterSpacing: "0.22em", color: N.TEXT_2, fontWeight: 700,
        }}>
          MODE
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "6px 18px",
          border: `1px solid ${N.BRAND}55`,
          borderRadius: 4,
          background: `${N.BRAND}1f`,
          color: N.BRAND,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.22em",
          textShadow: `0 0 8px ${N.BRAND}80`,
        }}>
          PAPER MODE
        </span>
        <Link
          href="/subscribe"
          style={{
            fontSize: 9, letterSpacing: "0.18em", fontWeight: 700,
            color: N.GOLD,
            textShadow: `0 0 6px ${N.GOLD_GLOW}`,
            fontFamily: N.FONT_MONO,
            textDecoration: "none",
          }}
        >
          UPGRADE TO UNLOCK LIVE →
        </Link>
      </div>
    );
  }

  // Paid tier: segmented toggle.
  return (
    <div
      role="group"
      aria-label="Portal trading mode"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 14, padding: "10px 24px 0",
        fontFamily: N.FONT_MONO,
      }}
    >
      <span style={{
        fontSize: 9, letterSpacing: "0.22em", color: N.TEXT_2, fontWeight: 700,
      }}>
        MODE
      </span>

      <div style={{
        display: "inline-flex",
        border: `1px solid ${N.BORDER_HI}`,
        borderRadius: 4,
        overflow: "hidden",
        background: N.SURFACE_1,
        boxShadow: `inset 0 0 14px ${N.BRAND}08`,
      }}>
        <ModeSeg
          label="PAPER"
          active={mode === "PAPER"}
          onClick={() => setMode("PAPER")}
        />
        <ModeSeg
          label="LIVE"
          active={mode === "LIVE"}
          disabled={liveLocked}
          tone="live"
          onClick={() => {
            if (!hasExchange)       { onConnectExchange(); return; }
            setMode("LIVE");
          }}
        />
      </div>

      {liveLockReason && (
        <button
          type="button"
          onClick={onConnectExchange}
          style={{
            background: "transparent", border: "none", padding: 0,
            fontSize: 9, letterSpacing: "0.18em", fontWeight: 700,
            color: N.GOLD, cursor: "pointer",
            textShadow: `0 0 6px ${N.GOLD_GLOW}`,
            fontFamily: N.FONT_MONO,
          }}
        >
          {liveLockReason.toUpperCase()} →
        </button>
      )}
    </div>
  );
}

/**
 * PaperSandboxToggle — sub-toggle shown directly under PortalModeToggle when
 * the user is in PAPER mode. Lets paid OR free users opt into routing paper
 * orders through their connected exchange's PUBLIC TESTNET / SANDBOX (via the
 * adapter `testnet: true` host switch) instead of the internal simulator.
 *
 * When the user's default exchange has no sandbox we still render the toggle
 * but disable it with a clear "<exchange> has no public sandbox — internal
 * simulator only" note, so the user understands the fallback.
 */
function PaperSandboxToggle({ defaultExchange }: { defaultExchange: string | null }) {
  const {
    mode,
    paperSandboxEnabled,
    setPaperSandboxEnabled,
  } = usePortalMode();

  if (mode !== "PAPER") return null;

  const supported = exchangeSupportsSandbox(defaultExchange);
  const exchLabel = defaultExchange ?? "no exchange connected";

  return (
    <div
      role="group"
      aria-label="Paper-mode sandbox routing"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 12, padding: "6px 24px 0",
        fontFamily: N.FONT_MONO,
      }}
    >
      <span style={{
        fontSize: 9, letterSpacing: "0.22em", color: N.TEXT_2, fontWeight: 700,
      }}>
        PAPER ROUTING
      </span>

      <label style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        cursor: supported ? "pointer" : "not-allowed",
        opacity: supported ? 1 : 0.55,
      }}>
        <input
          type="checkbox"
          checked={supported && paperSandboxEnabled}
          disabled={!supported}
          onChange={(e) => setPaperSandboxEnabled(e.target.checked)}
          style={{ accentColor: N.BRAND, width: 12, height: 12 }}
        />
        <span style={{
          fontSize: 10, letterSpacing: "0.18em", fontWeight: 700,
          color: supported && paperSandboxEnabled ? N.BRAND : N.TEXT_1,
          textShadow: supported && paperSandboxEnabled ? `0 0 6px ${N.BRAND}80` : undefined,
        }}>
          USE EXCHANGE SANDBOX
        </span>
      </label>

      <span style={{
        fontSize: 9, letterSpacing: "0.12em", color: N.TEXT_2, fontWeight: 600,
      }}>
        {supported
          ? `${exchLabel.toUpperCase()} TESTNET${paperSandboxEnabled ? " · ACTIVE" : ""}`
          : `${exchLabel.toUpperCase()} HAS NO PUBLIC SANDBOX — INTERNAL SIMULATOR ONLY`}
      </span>
    </div>
  );
}

function ModeSeg({
  label, active, disabled, tone, onClick,
}: {
  label:     string;
  active:    boolean;
  disabled?: boolean;
  tone?:     "live";
  onClick:   () => void;
}) {
  const color = tone === "live"
    ? (active ? N.LONG : disabled ? N.TEXT_3 : N.BRAND)
    : (active ? N.BRAND : N.TEXT_2);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 18px",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.22em",
        fontFamily: N.FONT_MONO,
        background: active ? `${color}1f` : "transparent",
        color, border: "none", cursor: "pointer",
        borderRight: tone === "live" ? "none" : `1px solid ${N.BORDER_HI}`,
        textShadow: active ? `0 0 8px ${color}80` : "none",
        opacity: disabled && !active ? 0.55 : 1,
        transition: "background 140ms ease",
      }}
    >
      {label}
    </button>
  );
}

// Re-export mode type so consumers (SignalRow) get a single source of truth.
export type { PortalMode };
