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
import { useQuery } from "@tanstack/react-query";
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
import type { EngineStatus } from "@/components/command/types";
import {
  PaperTradesProvider,
  usePaperTrades,
  fmtMoney,
  fmtQty,
  fmtTime,
} from "@/hooks/usePaperTrades";
import { toast } from "@/hooks/use-toast";

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
}: {
  onAccount:         () => void;
  onUpgrade:         () => void;
  onDisclaimer:      () => void;
  onConnectExchange: () => void;
  statusPill?:       React.ReactNode;
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
      <span style={{ color: N.TEXT_2 }}>· LIVE PORTAL</span>

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
      <NavButton onClick={onUpgrade}>UPGRADE</NavButton>
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
        <AccountRow label="BROKER · ALPACA"   value="Not connected"           color={N.WARN} sub="Connection wizard launches with the Alpaca live keys" />
      </div>

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
function LogoBanner({ tier }: { tier: Plan }) {
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

        <span style={{
          padding: "4px 14px",
          background: N.SURFACE_2,
          border: `1px solid ${tier === "free" ? N.BORDER_HI : `${N.BRAND}55`}`,
          borderRadius: 999,
          fontFamily: N.FONT_MONO, fontSize: 10,
          color: tier === "free" ? N.TEXT_1 : N.BRAND,
          letterSpacing: "0.18em", fontWeight: 700,
          boxShadow: tier === "free" ? "none" : `0 0 14px ${N.BRAND_GLOW}`,
        }}>
          TIER · {tier.toUpperCase()}
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
}
interface ExchangeStatus {
  connectedCount: number;
  liveCount:      number;
  anyHealthy:     boolean;
  lastSyncedAt:   number;
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
  return {
    connectedCount: connected.length,
    liveCount:      connected.filter(e => e.tradingMode === "live").length,
    anyHealthy:     connected.some(e => e.permissions?.read !== false),
    lastSyncedAt:   Date.now(),
  };
}

/** Header status pill — shows connection / mode state at a glance. */
function ExchangeStatusPill({ status }: { status: ExchangeStatus }) {
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

const QUEUE = [
  { sym: "BTC/USD", side: "BUY", conf: "84%", state: "QUEUED · executes when slot frees" },
  { sym: "ETH/USD", side: "BUY", conf: "78%", state: "QUEUED · awaiting confirmation" },
  { sym: "ADA/USD", side: "BUY", conf: "71%", state: "QUEUED · capacity limit reached" },
];

// ── Live paper-trade panels ─────────────────────────────────────────────────

function ActiveTradesPanel({ onUpgrade }: { onUpgrade: () => void }) {
  const { open, closeTrade } = usePaperTrades();
  return (
    <Panel title="LIVE TRADES" height={420} locked={false} onUnlock={onUpgrade}>
      {open.length === 0 ? (
        <div style={{
          padding: "18px 4px", fontSize: 10, lineHeight: 1.6,
          color: N.TEXT_2, letterSpacing: "0.10em",
        }}>
          No open positions. Click <b style={{ color: N.LONG }}>BUY</b> or{" "}
          <b style={{ color: N.SHORT }}>SELL</b> on any signal above to open
          a simulated trade. Positions appear here in real time and walk live
          P/L until TP / SL is hit.
        </div>
      ) : open.map((t) => {
        const color = t.pnl >= 0 ? N.LONG : N.SHORT;
        return (
          <div key={t.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0",
            borderBottom: `1px solid ${N.BORDER}`,
            fontSize: 11,
          }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ color: N.TEXT_0, fontWeight: 700 }}>
                {t.display}{"  "}
                <span style={{
                  color: t.side === "LONG" ? N.LONG : N.SHORT,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 9,
                  marginLeft: 4,
                }}>{t.side}</span>
              </span>
              <span style={{ color: N.TEXT_2, fontSize: 9, marginTop: 2, letterSpacing: "0.04em" }}>
                Entry ${t.entry.toFixed(t.entry >= 100 ? 2 : 4)} · {fmtQty(t.qty)} · {fmtTime(t.openedAt)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{
                  color, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  textShadow: `0 0 6px ${color}40`,
                }}>
                  {fmtMoney(t.pnl)}
                </span>
                <span style={{
                  color, fontSize: 9, fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
                </span>
              </div>
              <button
                onClick={() => closeTrade(t.id, "MANUAL")}
                title="Close position"
                aria-label={`Close ${t.display} position`}
                style={{
                  width: 22, height: 22, borderRadius: 3,
                  background: "transparent",
                  border: `1px solid ${N.BORDER_HI}`,
                  color: N.TEXT_2,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
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
  const { history } = usePaperTrades();
  // Toast on every new auto-close (TP / SL) so the feedback feels institutional.
  const lastSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (history.length === 0) return;
    const newest = history[0];
    if (lastSeenRef.current === newest.id) return;
    // Skip the very first toast on mount
    if (lastSeenRef.current !== null) {
      if (newest.reason === "TP") {
        toast({
          title: `TARGET HIT ${newest.pnlPct >= 0 ? "+" : ""}${newest.pnlPct.toFixed(2)}% — ${newest.display}`,
          description: `${newest.side} closed at $${newest.exit.toFixed(newest.exit >= 100 ? 2 : 4)} · ${fmtMoney(newest.pnl)} realized`,
        });
      } else if (newest.reason === "SL") {
        toast({
          title: `STOP LOSS TRIGGERED — ${newest.display}`,
          description: `${newest.side} closed at $${newest.exit.toFixed(newest.exit >= 100 ? 2 : 4)} · ${fmtMoney(newest.pnl)} realized`,
        });
      } else {
        toast({
          title: `POSITION CLOSED — ${newest.display}`,
          description: `${newest.side} · ${fmtMoney(newest.pnl)} realized`,
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
          Closed positions land here with realized P/L, exit reason and
          timestamp. Open a paper trade above to populate this feed.
        </div>
      ) : history.map((t) => {
        const color = t.pnl >= 0 ? N.LONG : N.SHORT;
        const tag = t.reason === "TP" ? "TP HIT" : t.reason === "SL" ? "SL HIT" : "CLOSED";
        const tagColor = t.reason === "TP" ? N.LONG : t.reason === "SL" ? N.SHORT : N.TEXT_2;
        return (
          <div key={t.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0",
            borderBottom: `1px solid ${N.BORDER}`,
            fontSize: 11,
          }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ color: N.TEXT_0, fontWeight: 700 }}>
                {t.display}{"  "}
                <span style={{
                  color: t.side === "LONG" ? N.LONG : N.SHORT,
                  fontWeight: 800, letterSpacing: "0.16em", fontSize: 9,
                  marginLeft: 4,
                }}>{t.side}</span>
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
                Exit ${t.exit.toFixed(t.exit >= 100 ? 2 : 4)} · {fmtTime(t.closedAt)}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{
                color, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                textShadow: `0 0 6px ${color}40`,
              }}>
                {fmtMoney(t.pnl)}
              </span>
              <span style={{
                color, fontSize: 9, fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}>
                {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Portal() {
  return (
    <PaperTradesProvider>
      <PortalInner />
    </PaperTradesProvider>
  );
}

function PortalInner() {
  const { isAdmin } = useUserRole();
  const { getToken, isSignedIn } = useAuth();
  const [dbTier, setDbTier] = useState<Plan>("free");
  const [upgradeOpen,    setUpgradeOpen]    = useState(false);
  const [accountOpen,    setAccountOpen]    = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [connectExchangeOpen, setConnectExchangeOpen] = useState(false);
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
  const { stats } = usePaperTrades();
  const exchangeStatus = useExchangeStatus();
  const hasExchange    = exchangeStatus.connectedCount > 0;

  // Live-derived metric strings (replace earlier hardcoded demo numbers).
  const equityBase = 100_000;
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

  // ── ADMIN OPERATOR · Real Kraken live snapshot ──────────────────────────────
  // On admintrade.aicandlez.com the workstation must reflect REAL Kraken account
  // state (USD balance, exchange identity, live/error source), never the
  // $100,000 paper-trade hero. We poll /api/exchange/balances (requireOperator)
  // every 10s once admin auth resolves, and force the shared engine into LIVE
  // mode once on mount so the very first read is real.
  type KrakenSnap = {
    source: "live" | "simulation" | "error";
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

  const adminUsd = adminKraken?.balances.USD ?? 0;
  const adminLiveSource = adminKraken?.source ?? null;
  const adminExchangeName = (adminKraken?.exchange ?? "kraken").toUpperCase();

  return (
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
        statusPill={<ExchangeStatusPill status={exchangeStatus} />}
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

      <LogoBanner tier={tier} />

      {/* First-time onboarding banner — auto-hides once at least one exchange
          is connected. Reinforces non-custodial security promise inline. */}
      {!hasExchange && <ExchangeOnboardingBanner onConnect={() => disclaimerGate(() => setConnectExchangeOpen(true))} />}

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
            label="KRAKEN USD"
            value={adminKraken
              ? `$${adminUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
            delta={adminLiveSource === "live"
              ? "LIVE"
              : adminLiveSource === "error"
                ? "AUTH FAILED"
                : adminLiveSource === "simulation"
                  ? "SIM FALLBACK"
                  : "LOADING"}
            positive={adminLiveSource === "live"}
          />
          <MetricTile
            label="BTC"
            value={adminKraken ? adminKraken.balances.BTC.toFixed(6) : "—"}
            delta="LIVE"
            positive
          />
          <MetricTile
            label="ETH"
            value={adminKraken ? adminKraken.balances.ETH.toFixed(4) : "—"}
            delta="LIVE"
            positive
          />
          <MetricTile
            label="SOL"
            value={adminKraken ? adminKraken.balances.SOL.toFixed(3) : "—"}
            delta="LIVE"
            positive
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
          <MetricTile label="EQUITY" value={equityStr} demo />
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
            <ActiveTradesPanel onUpgrade={() => { /* no-op for admin */ }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <EquitySignalsPanel engine={engine} />
            <TradeHistoryPanel onUpgrade={() => { /* no-op for admin */ }} />
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
}
