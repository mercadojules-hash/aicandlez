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

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Zap } from "lucide-react";

import { useUserRole } from "@/hooks/useUserRole";
import {
  MarketHeartbeat,
  CryptoSignalsPanel,
  EquitySignalsPanel,
} from "@/components/command/institutional";
import { N } from "@/components/command/institutional/theme";
import type { EngineStatus } from "@/components/command/types";

const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

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
function TopBar() {
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

      <div style={{ flex: 1 }} />

      <NavLink href="/account">MANAGE ACCOUNT</NavLink>
      <NavLink href="/billing">UPGRADE</NavLink>
      <NavLink href="/disclaimer">DISCLAIMER</NavLink>

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

      <span style={{
        padding: "4px 10px",
        background: N.SURFACE_2,
        border: `1px solid ${N.BORDER_HI}`,
        borderRadius: 3,
        color: N.TEXT_0, fontSize: 10,
      }}>
        {display}
      </span>

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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <a style={{
        color: N.TEXT_2, textDecoration: "none", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.12em", padding: "4px 0",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = N.BRAND)}
      onMouseLeave={(e) => (e.currentTarget.style.color = N.TEXT_2)}>
        {children}
      </a>
    </Link>
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
function LiveExecutionBar({
  tier, onUpgrade,
}: { tier: Plan; onUpgrade: () => void }) {
  const [armed, setArmed] = useState(false);
  const locked = tier === "free";
  const cap    = tierCapacity(tier);

  const handle = () => {
    if (locked) { onUpgrade(); return; }
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
            {locked ? "LIVE AI EXECUTION · LOCKED" : armed ? "LIVE AI EXECUTION · ARMED" : "ENABLE LIVE AI TRADING"}
          </div>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: N.TEXT_2, fontWeight: 600 }}>
            {cap.label}
          </div>
        </div>

        {/* Capacity meter */}
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
            }}>0 / {cap.cap}</span>
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
            {locked ? "UPGRADE TO UNLOCK" : armed ? "DISARM" : "ARM EXECUTION"}
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
function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
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
          with your tier.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <PlanCard plan="starter" />
          <PlanCard plan="pro" />
        </div>

        <Link href="/billing">
          <a style={{
            display: "block", textAlign: "center",
            padding: "12px 16px",
            background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
            border: `1px solid ${N.BRAND}`,
            borderRadius: 4,
            color: "#001a0d", fontWeight: 800, fontSize: 11,
            letterSpacing: "0.18em", textDecoration: "none",
            boxShadow: `0 0 22px ${N.BRAND_GLOW}`,
          }}>
            VIEW PLANS & UPGRADE →
          </a>
        </Link>

        <button
          onClick={onClose}
          style={{
            display: "block", margin: "12px auto 0",
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

function PlanCard({ plan }: { plan: "starter" | "pro" }) {
  const data = plan === "starter"
    ? { name: "AI Trading",     price: "$15.99", cap: "3 concurrent AI trades", color: N.BRAND }
    : { name: "AI Trading Pro", price: "$39.99", cap: "12 concurrent AI trades · crypto + equities", color: N.BRAND_BRT };
  return (
    <div style={{
      background: N.SURFACE_2,
      border: `1px solid ${data.color}40`,
      borderRadius: 4,
      padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: data.color, fontWeight: 800,
          letterSpacing: "0.18em", marginBottom: 2,
        }}>{data.name.toUpperCase()}</div>
        <div style={{ fontSize: 10, color: N.TEXT_2 }}>{data.cap}</div>
      </div>
      <div style={{
        fontSize: 18, color: N.TEXT_0, fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        textShadow: `0 0 8px ${data.color}60`,
      }}>{data.price}<span style={{ fontSize: 10, color: N.TEXT_2 }}>/mo</span></div>
    </div>
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
      <div style={{
        flex: 1, padding: 14, height,
        overflowY: "auto", overflowX: "hidden",
        position: "relative",
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

// ── Synthetic data (replaced by /api when live keys land) ────────────────────
const ACTIVE_TRADES = [
  { sym: "BTC/USD",  side: "LONG",  pnl: "+$248.14", up: true,  sub: "Entry 67,420.00 · 0.0150 BTC" },
  { sym: "ETH/USD",  side: "LONG",  pnl: "+$54.92",  up: true,  sub: "Entry 3,240.50 · 0.4000 ETH" },
  { sym: "SOL/USD",  side: "SHORT", pnl: "-$12.40",  up: false, sub: "Entry 182.10 · 2.5000 SOL" },
];
const TRADE_HISTORY = [
  { sym: "BTC/USD", pnl: "+$420.00", up: true,  sub: "Closed · 18:02 · LONG" },
  { sym: "ETH/USD", pnl: "+$112.50", up: true,  sub: "Closed · 14:38 · LONG" },
  { sym: "AVAX/USD", pnl: "-$48.20", up: false, sub: "Closed · 11:15 · LONG" },
  { sym: "DOGE/USD", pnl: "+$22.80", up: true,  sub: "Closed · 09:50 · LONG" },
  { sym: "ADA/USD",  pnl: "+$8.40",  up: true,  sub: "Closed · 08:12 · LONG" },
];
const QUEUE = [
  { sym: "BTC/USD", side: "BUY", conf: "84%", state: "QUEUED · executes when slot frees" },
  { sym: "ETH/USD", side: "BUY", conf: "78%", state: "QUEUED · awaiting confirmation" },
  { sym: "ADA/USD", side: "BUY", conf: "71%", state: "QUEUED · capacity limit reached" },
];

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Portal() {
  const { isAdmin } = useUserRole();
  const [tier, setTier] = useState<Plan>("free");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/api/billing/subscription`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { plan?: string };
        if (cancelled || !data.plan) return;
        const p = data.plan as string;
        setTier(p === "starter" || p === "pro" ? p : "free");
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Live engine status drives the signal panels + heartbeat.
  const { data: engine } = useQuery({
    queryKey: ["engine-status-portal"],
    queryFn:  () => j<EngineStatus>(`${basePath}/api/engine/status`),
    ...Q_MEDIUM,
  });

  const cap = useMemo(() => tierCapacity(tier), [tier]);

  return (
    <div style={{
      minHeight: "100dvh",
      background: N.BG,
      color: N.TEXT_0,
      fontFamily: N.FONT_MONO,
    }}>
      <TopBar />

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

      {/* Metrics row — values are paper-account demo until Alpaca account
          telemetry is wired; tiles tagged with DEMO so users aren't misled. */}
      <div style={{
        padding: "12px 24px 0",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}>
        <MetricTile label="TOTAL P/L"        value="+$1,284.42"  delta="+1.28%"    positive demo />
        <MetricTile label="WIN RATE"         value="68.4%"       delta="+2.1%"     positive demo />
        <MetricTile label="ACTIVE AI TRADES" value={`0 / ${cap.cap || "—"}`} delta={tier.toUpperCase()} positive demo />
        <MetricTile label="TODAY"            value="+$184.20"    delta="+0.18%"    positive demo />
        <MetricTile label="MONTHLY"          value="+$2,940.80"  delta="+2.94%"    positive demo />
        <MetricTile label="AI CONFIDENCE"    value="78%"         delta="STRONG"    positive demo />
        <MetricTile label="BEST ASSET"       value="BTC/USD"     delta="+$420.00"  positive demo />
        <MetricTile label="EQUITY"           value="$101,284.42" demo />
      </div>

      {/* Live cross-asset heartbeat (institutional row) */}
      <div style={{ padding: "16px 16px 0" }}>
        <MarketHeartbeat />
      </div>

      {/* Live AI Execution control */}
      <div style={{ padding: "12px 16px 0" }}>
        <LiveExecutionBar tier={tier} onUpgrade={() => setUpgradeOpen(true)} />
      </div>

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
        <Panel title="ACTIVE TRADES" locked={tier === "free"} onUnlock={() => setUpgradeOpen(true)}>
          {ACTIVE_TRADES.map((t) => (
            <Row key={t.sym} left={`${t.sym}  ${t.side}`} right={t.pnl}
                 color={t.up ? N.LONG : N.SHORT} sub={t.sub} />
          ))}
        </Panel>

        <Panel title="TRADE HISTORY" locked={tier === "free"} onUnlock={() => setUpgradeOpen(true)}>
          {TRADE_HISTORY.map((t, i) => (
            <Row key={`${t.sym}-${i}`} left={t.sym} right={t.pnl}
                 color={t.up ? N.LONG : N.SHORT} sub={t.sub} />
          ))}
        </Panel>

        <Panel title="SUBSCRIPTION STATUS">
          <Row left="Current Plan"    right={tier.toUpperCase()} color={N.BRAND} />
          <Row left="Concurrent Cap"  right={tier === "pro" ? "12 trades" : tier === "starter" ? "3 trades" : "Paper only"} />
          <Row left="Billing"         right={tier === "free" ? "—" : "Monthly"} sub="Cancel anytime · Stripe portal" />
          <Row left="Performance Fee" right="3% (profitable trades only)" sub="Never charged on losses" />
          <div style={{ marginTop: 14 }}>
            {tier === "pro" ? (
              // Pro users go straight to the Stripe customer portal.
              <Link href="/billing">
                <a style={{
                  display: "block",
                  textAlign: "center",
                  padding: "10px 14px",
                  background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
                  border: `1px solid ${N.BRAND}`,
                  borderRadius: 4,
                  color: "#001a0d", fontWeight: 800, fontSize: 11,
                  letterSpacing: "0.16em",
                  textDecoration: "none",
                  boxShadow: `0 0 18px ${N.BRAND_GLOW}`,
                }}>
                  MANAGE BILLING
                </a>
              </Link>
            ) : (
              // Free + Starter both open the same unified upgrade modal that
              // every other locked CTA on /portal uses. No more split routing.
              <button
                onClick={() => setUpgradeOpen(true)}
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

        <Panel title="AI AUTO TRADE QUEUE" locked={tier === "free"} onUnlock={() => setUpgradeOpen(true)}>
          {QUEUE.map((q) => (
            <Row key={q.sym} left={`${q.sym}  ${q.side}`} right={q.conf}
                 color={N.BRAND} sub={q.state} />
          ))}
          <div style={{ marginTop: 10, color: N.TEXT_2, fontSize: 9, letterSpacing: "0.14em" }}>
            AI EXECUTES IN ORDER OF CONFIDENCE · 80% MIN CONFIDENCE FLOOR · CAPACITY GATED BY PLAN
          </div>
        </Panel>
      </div>

      <footer style={{
        padding: "20px 24px",
        borderTop: `1px solid ${N.BORDER}`,
        textAlign: "center",
        color: N.TEXT_2, fontSize: 9, letterSpacing: "0.20em",
      }}>
        AICANDLEZ · ALPACA-ROUTED LIVE EXECUTION · 3% FEE ON PROFITABLE TRADES ONLY
      </footer>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
