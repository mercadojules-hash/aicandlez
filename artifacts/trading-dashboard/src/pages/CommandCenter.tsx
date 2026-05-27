/**
 * /command — AICandlez Institutional Trading Workstation (operator console)
 *
 * Desktop-only command center. Matte black + neon green.
 *
 *   ┌─ CommandBar ─────────────────────────────────────────────────────────────┐
 *   ├─ PlatformOverview  (13-metric global telemetry) ─────────────────────────┤
 *   ├─ LiveAccountPanel  (my Kraken proof-of-performance) ─────────────────────┤
 *   ├─ MarketHeartbeat   (BTC ETH SOL · NVDA TSLA SPY · live sparklines) ──────┤
 *   ├─ PositionsRow      (Active · Closed hedge-fund blotter) ────────────────-┤
 *   ├─ LiveControlBar    ENABLE LIVE AI CRYPTO TRADING ───────────────────────-┤
 *   ├─ Top 20 Crypto Signals (grouped LONG / SHORT) ──────────────────────────-┤
 *   ├─ LiveControlBar    ENABLE LIVE AI EQUITIES TRADING ──────────────────────┤
 *   └─ Top 20 Equity Signals (grouped LONG / SHORT) ──────────────────────────-┘
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { LiveConsentModal, useLiveConsent } from "@/components/ConsentGate";

const apiBaseUrl = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  (import.meta.env.BASE_URL ?? "/")
).replace(/\/$/, "");

// ── Operator bypass ───────────────────────────────────────────────────────────
// The /command desktop console is the institutional operator surface.
// Admin / super-admin / operator accounts have FULL unrestricted access:
//   • no consent modal     • no subscription gate
//   • no onboarding gate   • no live-trading paywall
//   • all controls unlocked at all times
// `useOperatorRole` resolves the bypass flag from /api/auth/me (DB-backed role).
interface MeResponse { role?: string }
function useOperatorRole(): { isOperator: boolean; isRoleResolved: boolean } {
  const { getToken } = useAuth();
  const { data, status, fetchStatus } = useQuery<MeResponse>({
    queryKey:  ["auth-me"],
    queryFn:   async () => {
      // Cross-subdomain Bearer fallback — see useUserRole.ts for rationale.
      const token = await getToken().catch(() => null);
      const r = await authFetch(`${apiBaseUrl}/api/auth/me`, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!r.ok) throw new Error(`auth/me ${r.status}`);
      return r.json() as Promise<MeResponse>;
    },
    // staleTime: 0 + refetchOnMount: "always" forces a fresh role read on
    // every mount, eliminating the stale-cache race entirely. Combined with
    // the fetchStatus === "idle" check in `isRoleResolved`, the modal
    // cannot render until a fresh /auth/me response confirms role identity.
    staleTime:        0,
    refetchOnMount:   "always",
    retry:            2,
  });
  const role = (data?.role ?? "").toLowerCase();
  // Role is only "resolved" when we have a definitive successful response AND
  // there is no in-flight refetch. This blocks ALL race windows including:
  //   • initial load (status !== "success")
  //   • error states (status === "error")
  //   • stale-cache background refetch (fetchStatus === "fetching")
  // The consent modal must NEVER appear before role is fully settled.
  const isRoleResolved =
    status === "success" && data !== undefined && fetchStatus === "idle";
  return {
    isOperator:     role === "admin" || role === "super-admin" || role === "operator",
    isRoleResolved,
  };
}

import {
  CommandBar, PlatformOverview, OperatorTelemetryGrid, LiveAccountPanel,
  MarketHeartbeat, PositionsRow, LiveControlBar,
  CryptoMajorsSignalsPanel, CryptoAltsMemesPanel,
} from "@/components/command/institutional";
import { N } from "@/components/command/institutional/theme";
import { CRYPTO_MAJORS_30, CRYPTO_ALTS_MEMES } from "@/components/command/institutional/tickers";
import { resolveDirection } from "@/components/command/institutional/signalUtils";
import EngineHeartbeat from "@/components/EngineHeartbeat";
import LiveExecutionStream from "@/components/LiveExecutionStream";
import { Zap, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

/* ── BATTLEFIELD COMPOSITION (operator /command surface) ─────────────────────
 * Per user direction: restore the OLD command-center emotional composition
 * (Scanning hero · Market Pulse gauge · LIVE OPPORTUNITY BATTLEFIELD framing
 * · MY ACCOUNT rail · AI ACTIVITY feed) powered by the NEW engine + new
 * dual crypto matrix (no equities — locked invariant preserved) + new
 * confidence sorting + new tier hierarchy.
 *
 * Architecture below: ScanningHero (chip strip with tier styling) +
 * MarketPulseGauge (BULL/BEAR conviction read) live above the BattlefieldHeader,
 * which sits above a 3-column row (matrix-left · matrix-right · MyAccountRail
 * with AiActivityFeed below). All read-only / presentational; execution path
 * untouched. */
const PULSE_MIN_CONFIDENCE = 70;
const PULSE_MAX_ITEMS      = 5;
const PULSE_UNIVERSE = [...CRYPTO_MAJORS_30, ...CRYPTO_ALTS_MEMES];
const PULSE_SYMBOL_SET = new Set(PULSE_UNIVERSE.map(t => t.symbol));

/* Tier helper — single source of truth for ELITE / STRONG / ACTIVE styling
 * driving border, glow, font weight, dot size. Used by both ScanningHero
 * chips and any future tier-aware surface. */
type Tier = "ELITE" | "STRONG" | "ACTIVE";
function convictionTier(conf: number): Tier {
  return conf >= 90 ? "ELITE" : conf >= 80 ? "STRONG" : "ACTIVE";
}
function tierStyle(tier: Tier, dirColor: string) {
  if (tier === "ELITE") return {
    border:     `1px solid ${dirColor}cc`,
    bg:         `linear-gradient(180deg, ${dirColor}33 0%, ${dirColor}10 100%)`,
    shadow:     `0 0 12px ${dirColor}55, inset 0 0 10px ${dirColor}33`,
    tickerWt:   900 as const,
    tickerSize: 14,
    confSize:   14,
    confShadow: `0 0 8px ${dirColor}, 0 0 16px ${dirColor}80`,
    dotSize:    7,
    padding:    "7px 12px",
  };
  if (tier === "STRONG") return {
    border:     `1px solid ${dirColor}66`,
    bg:         `linear-gradient(180deg, ${dirColor}1c 0%, transparent 100%)`,
    shadow:     `inset 0 0 8px ${dirColor}1f`,
    tickerWt:   800 as const,
    tickerSize: 13,
    confSize:   13,
    confShadow: `0 0 5px ${dirColor}66`,
    dotSize:    6,
    padding:    "6px 11px",
  };
  return {
    border:     `1px solid ${dirColor}30`,
    bg:         "transparent",
    shadow:     "none",
    tickerWt:   700 as const,
    tickerSize: 12,
    confSize:   12,
    confShadow: "none",
    dotSize:    5,
    padding:    "5px 10px",
  };
}

/* Shared selector — top N highest-conviction crypto signals, filtered to
 * the matrix universe, deduped, sorted desc. Drives ScanningHero chips and
 * any future conviction-aware composition. */
function useTopConviction(
  engine: EngineStatus | undefined,
  minConfidence: number,
  maxItems: number,
) {
  const breakdowns = engine?.symbolBreakdowns ?? {};
  return useMemo(() => {
    const rows: Array<{
      symbol: string; display: string; conf: number; dir: "LONG" | "SHORT";
    }> = [];
    for (const t of PULSE_UNIVERSE) {
      const b = breakdowns[t.symbol];
      const conf = b?.avgConfidence ?? 0;
      if (conf < minConfidence) continue;
      rows.push({
        symbol:  t.symbol,
        display: t.display ?? t.label ?? t.symbol,
        conf:    Math.round(conf),
        dir:     resolveDirection(t.symbol, b),
      });
    }
    rows.sort((a, b) => b.conf - a.conf);
    return rows.slice(0, maxItems);
  }, [breakdowns, minConfidence, maxItems]);
}

/* ── ScanningHero ────────────────────────────────────────────────────────────
 * Left side of the hero row. Mirrors the legacy "Scanning N markets · last
 * surge — X · Ys ago" hero from the old battlefield, but the high-conviction
 * chip strip on the right uses the new tier system. Replaces the prior
 * standalone TopConvictionPulse strip per the restored composition. */
function ScanningHero({ engine }: { engine?: EngineStatus }) {
  const chips = useTopConviction(engine, PULSE_MIN_CONFIDENCE, PULSE_MAX_ITEMS);
  const trackedCount = useMemo(
    () => Object.keys(engine?.symbolBreakdowns ?? {}).filter(s => PULSE_SYMBOL_SET.has(s)).length,
    [engine?.symbolBreakdowns],
  );
  const lastSignalAgo = useMemo(() => {
    if (!engine?.lastSignalAt) return "—";
    const sec = Math.max(0, Math.round((Date.now() - engine.lastSignalAt) / 1000));
    if (sec < 60)  return `${sec}s ago`;
    if (sec < 3600)return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  }, [engine?.lastSignalAt]);
  const surgeCount = engine?.signalCounts
    ? engine.signalCounts.BUY + engine.signalCounts.SELL
    : 0;
  const isHunting = (engine?.running ?? false) && !(engine?.killSwitch ?? false);

  return (
    <div
      role="region"
      aria-label="AI engine scanning hero"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "18px 22px",
        border: `1px solid ${N.BRAND}33`,
        borderRadius: 5,
        background: `linear-gradient(90deg, ${N.BRAND}10 0%, ${N.BG} 75%, ${N.BRAND}06 100%)`,
        boxShadow: `inset 0 0 22px ${N.BRAND}10`,
        fontFamily: N.FONT_MONO,
        minHeight: 152,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: isHunting ? N.BRAND_BRT : N.TEXT_3,
          boxShadow: isHunting ? `0 0 8px ${N.BRAND}, 0 0 16px ${N.BRAND}80` : "none",
          animation: isHunting ? "cd-pulse-dot 1400ms ease-in-out infinite" : undefined,
        }} />
        <span style={{
          fontSize: 11, fontWeight: 800, color: N.BRAND_BRT,
          letterSpacing: "0.30em", textShadow: `0 0 8px ${N.BRAND}55`,
        }}>
          AI ENGINE
        </span>
        <span style={{ fontSize: 10.5, color: N.TEXT_3, letterSpacing: "0.20em" }}>
          · {isHunting ? "HUNTING" : "STANDBY"} · AUTONOMOUS
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 36, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: "-0.025em", lineHeight: 1,
        }}>
          Scanning <span style={{
            color: N.BRAND_BRT,
            textShadow: `0 0 12px ${N.BRAND}66, 0 0 24px ${N.BRAND}33`,
          }}>{trackedCount || PULSE_UNIVERSE.length}</span> markets
        </span>
        <span style={{
          fontSize: 20, fontWeight: 700, color: N.TEXT_1,
          letterSpacing: "0.02em",
        }}>
          · last surge — <span style={{ color: N.BRAND_BRT, fontWeight: 800 }}>{surgeCount}</span>
        </span>
        <span style={{ fontSize: 11, color: N.TEXT_3, letterSpacing: "0.18em" }}>
          {lastSignalAgo}
        </span>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        flexWrap: "wrap", marginTop: 4,
      }}>
        {chips.length === 0 ? (
          <span style={{
            fontSize: 9.5, color: N.TEXT_3,
            letterSpacing: "0.22em", fontWeight: 700,
          }}>
            · AWAITING {PULSE_MIN_CONFIDENCE}%+ SIGNALS · LIVE CONVICTION STREAM
          </span>
        ) : (
          chips.map((r, i) => {
            const dirColor = r.dir === "LONG" ? N.LONG : N.SHORT;
            const DirIcon  = r.dir === "LONG" ? TrendingUp : TrendingDown;
            const tier     = convictionTier(r.conf);
            const isTop    = i === 0;
            const isEliteTop = isTop && tier === "ELITE";
            const ts = tierStyle(tier, dirColor);
            return (
              <span
                key={r.symbol}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: ts.padding,
                  background: ts.bg,
                  border: ts.border,
                  borderRadius: 3,
                  boxShadow: isEliteTop
                    ? `${ts.shadow}, 0 0 18px ${dirColor}77`
                    : ts.shadow,
                  animation: isEliteTop
                    ? "cd-pulse-halo 1800ms ease-in-out infinite"
                    : undefined,
                }}
              >
                <span aria-hidden style={{
                  width: ts.dotSize, height: ts.dotSize, borderRadius: "50%",
                  background: dirColor,
                  boxShadow: tier === "ELITE"
                    ? `0 0 8px ${dirColor}, 0 0 16px ${dirColor}cc`
                    : tier === "STRONG"
                    ? `0 0 6px ${dirColor}, 0 0 12px ${dirColor}80`
                    : `0 0 3px ${dirColor}80`,
                  animation: isTop ? "cd-pulse-dot 1400ms ease-in-out infinite" : undefined,
                }} />
                <span style={{
                  fontSize: ts.tickerSize, fontWeight: ts.tickerWt,
                  color: tier === "ACTIVE" ? N.TEXT_1 : N.TEXT_0,
                  letterSpacing: "0.08em",
                }}>{r.display}</span>
                <DirIcon size={tier === "ELITE" ? 11 : 10} style={{ color: dirColor }} />
                <span style={{
                  fontSize: ts.confSize,
                  fontWeight: tier === "ELITE" ? 900 : 800,
                  color: dirColor,
                  letterSpacing: "0.04em",
                  textShadow: ts.confShadow,
                }}>{r.conf}</span>
              </span>
            );
          })
        )}
      </div>
      <style>{`
        @keyframes cd-pulse-dot {
          0%, 100% { transform: scale(1);   opacity: 1;   }
          50%      { transform: scale(1.5); opacity: 0.55;}
        }
        @keyframes cd-pulse-halo {
          0%, 100% { filter: brightness(1)    saturate(1);   }
          50%      { filter: brightness(1.18) saturate(1.15);}
        }
      `}</style>
    </div>
  );
}

/* ── MarketPulseGauge ────────────────────────────────────────────────────────
 * Right side of the hero row. BULL/BEAR/NEUTRAL bias + conviction% derived
 * from the engine's BUY/SELL/HOLD signal distribution (last loop pass).
 * Mirrors the legacy "MARKET PULSE | BULL 73 CONVICTION" panel using new
 * engine data only — no legacy backend code path. */
function MarketPulseGauge({ engine }: { engine?: EngineStatus }) {
  const { bias, conviction } = useMemo(() => {
    const c = engine?.signalCounts ?? { BUY: 0, SELL: 0, HOLD: 0 };
    const total = c.BUY + c.SELL + c.HOLD;
    if (total === 0) return { bias: "NEUTRAL" as const, conviction: 0 };
    const directional = c.BUY + c.SELL;
    if (directional === 0) return { bias: "NEUTRAL" as const, conviction: 0 };
    const bullPct = (c.BUY / directional) * 100;
    if (bullPct >= 55)  return { bias: "BULL"    as const, conviction: Math.round(bullPct) };
    if (bullPct <= 45)  return { bias: "BEAR"    as const, conviction: Math.round(100 - bullPct) };
    return                     { bias: "NEUTRAL" as const, conviction: 50 };
  }, [engine?.signalCounts]);

  const biasColor =
    bias === "BULL" ? N.LONG :
    bias === "BEAR" ? N.SHORT :
                      N.TEXT_2;

  return (
    <div
      role="region"
      aria-label="Market pulse"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "18px 22px",
        border: `1px solid ${biasColor}40`,
        borderRadius: 5,
        background: `linear-gradient(90deg, ${biasColor}10 0%, ${N.BG} 80%)`,
        boxShadow: `inset 0 0 20px ${biasColor}14`,
        fontFamily: N.FONT_MONO,
        minHeight: 152,
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <Activity size={14} style={{
          color: biasColor,
          filter: `drop-shadow(0 0 5px ${biasColor})`,
        }} />
        <span style={{
          fontSize: 11, fontWeight: 800, color: biasColor,
          letterSpacing: "0.30em", textShadow: `0 0 8px ${biasColor}55`,
        }}>
          MARKET PULSE
        </span>
      </div>

      <div style={{
        display: "flex", alignItems: "baseline", gap: 14,
        flex: 1, justifyContent: "flex-end",
      }}>
        <span style={{
          fontSize: 56, fontWeight: 900, color: biasColor,
          letterSpacing: "0.04em",
          textShadow: `0 0 14px ${biasColor}88, 0 0 28px ${biasColor}55`,
          lineHeight: 1,
        }}>
          {bias}
        </span>
        <span style={{
          fontSize: 40, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: "-0.025em", lineHeight: 1,
        }}>
          | {conviction}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: N.TEXT_2,
          letterSpacing: "0.26em",
        }}>
          CONVICTION
        </span>
      </div>
    </div>
  );
}

/* ── BattlefieldHeader ───────────────────────────────────────────────────────
 * Composition framing band that separates the hero row from the matrix +
 * rail. Read-only status chips reflect actual engine + execution state. */
function BattlefieldHeader({
  engine, cryptoActive,
}: { engine?: EngineStatus; cryptoActive: boolean }) {
  const marketCount = PULSE_UNIVERSE.length;
  const riskActive  = !(engine?.killSwitch ?? false);
  const execArmed   = cryptoActive;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "14px 20px",
        border: `1px solid ${N.BORDER_HI}`,
        borderRadius: 5,
        background: `linear-gradient(90deg, ${N.SURFACE_1} 0%, ${N.BG} 60%, ${N.SURFACE_1} 100%)`,
        fontFamily: N.FONT_MONO,
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{
          fontSize: 20, fontWeight: 900, color: N.TEXT_0,
          letterSpacing: "0.22em",
        }}>
          LIVE OPPORTUNITY
        </span>
        <span style={{
          fontSize: 20, fontWeight: 900, color: N.BRAND_BRT,
          letterSpacing: "0.22em",
          textShadow: `0 0 10px ${N.BRAND}88, 0 0 20px ${N.BRAND}44`,
        }}>
          BATTLEFIELD
        </span>
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: N.TEXT_3,
          letterSpacing: "0.24em",
        }}>
          · {marketCount} MARKETS · AI RANKED BY CONVICTION
        </span>
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <StatusChip
          label="RISK GATES"
          value={riskActive ? "ACTIVE" : "BYPASSED"}
          color={riskActive ? N.BRAND_BRT : N.DANGER_BRT}
        />
        <StatusChip
          label="EXEC"
          value={execArmed ? "ARMED" : "STANDBY"}
          color={execArmed ? N.GOLD_BRT : N.TEXT_2}
        />
      </div>
    </div>
  );
}

function StatusChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "5px 11px",
      border: `1px solid ${color}55`,
      borderRadius: 4,
      background: `${color}10`,
      fontFamily: N.FONT_MONO,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}, 0 0 12px ${color}80`,
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: N.TEXT_2, letterSpacing: "0.20em" }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: "0.16em" }}>{value}</span>
    </span>
  );
}

/* ── MyAccountRail ───────────────────────────────────────────────────────────
 * Premium vertical equity card for the right rail with live equity curve.
 * Per user direction: removed the red AI AUTOTRADE strip and LIVE POSITIONS
 * "no broker linked" block — replaced with a cinematic glowing equity chart
 * (PERFORMANCE) so the rail feels like an active operator station, not
 * empty stacked boxes. Curve is built from cumulative realized PnL across
 * recent closed trades; falls back to a slowly-drifting synthetic walk
 * anchored on engine.signalsGenerated so the line is never dead-flat. */
function MyAccountRail({
  exchangeStatus, liveBalance, trades, engine,
}: {
  exchangeStatus?: ExchangeStatus;
  liveBalance?:    LiveBalance;
  trades:          Trade[];
  engine?:         EngineStatus;
}) {
  const isLive = (exchangeStatus?.mode === "kraken") && (liveBalance?.source === "live");
  const usd    = isLive ? (liveBalance?.balances?.USD ?? 0) : 0;
  const stats = useMemo(() => {
    const safe = Array.isArray(trades) ? trades : [];
    const liveOnly = safe.filter(t => {
      const m = (t.mode ?? "").toLowerCase();
      const s = ((t as { source?: string }).source ?? "").toLowerCase();
      return m === "live" || s === "live";
    });
    const closed = liveOnly.filter(t => t.status?.toLowerCase() !== "open");
    const open   = liveOnly.filter(t => t.status?.toLowerCase() === "open");
    const realized   = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const unrealized = open.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const today = closed.filter(t => {
      if (!t.closedAt) return false;
      return new Date(t.closedAt).toDateString() === new Date().toDateString();
    });
    const todayPnl = today.reduce((s, t) => s + (t.pnl ?? 0), 0);
    return { realized, unrealized, todayPnl, fillsToday: today.length, openCount: open.length, closed };
  }, [trades]);

  /* Slow time anchor — re-renders the cold-start fallback curve every 4s so
   * the line breathes even when engine.signalsGenerated is static. Cheap
   * (one number, no side effects beyond the chart). */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 100000), 4000);
    return () => clearInterval(id);
  }, []);

  /* Equity curve series — prefer real cumulative realized PnL when present.
   * If no closed trades exist (cold start) synthesize a gentle drift seeded
   * by engine signalsGenerated + slow tick so the rail feels alive without
   * dead-flat or phase-snap artifacts. */
  const curve = useMemo(() => {
    const sorted = [...stats.closed]
      .filter(t => t.closedAt)
      .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());
    if (sorted.length >= 2) {
      let acc = usd - stats.realized;
      return sorted.map((t, i) => {
        acc += (t.pnl ?? 0);
        return { i, v: acc };
      });
    }
    const seed = (engine?.signalsGenerated ?? 0) + tick;
    const base = Math.max(usd, 100);
    const pts = 48;
    const out: Array<{ i: number; v: number }> = [];
    for (let i = 0; i < pts; i++) {
      const phase = (i + seed) * 0.18;
      const wave  = Math.sin(phase) * (base * 0.012);
      const slow  = Math.sin(phase * 0.27) * (base * 0.006);
      out.push({ i, v: base + wave + slow });
    }
    return out;
  }, [stats.closed, stats.realized, usd, engine?.signalsGenerated, tick]);

  const curveColor = stats.todayPnl >= 0 ? N.LONG : N.SHORT;
  const eq = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
  const pctToday = usd > 0 ? (stats.todayPnl / usd) * 100 : 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      border: `1px solid ${N.BORDER_HI}`,
      borderRadius: 5,
      background: N.SURFACE_1,
      fontFamily: N.FONT_MONO,
      overflow: "hidden",
      boxShadow: `inset 0 0 24px ${N.BRAND}08`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 14px",
        borderBottom: `1px solid ${N.BORDER}`,
        background: `linear-gradient(180deg, ${N.BRAND}0d 0%, ${N.BG} 100%)`,
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: "0.26em",
        }}>MY ACCOUNT</span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: isLive ? N.BRAND_BRT : N.TEXT_3,
          letterSpacing: "0.18em",
          padding: "3px 8px",
          border: `1px solid ${isLive ? N.BRAND : N.BORDER_HI}`,
          borderRadius: 3,
          background: isLive ? `${N.BRAND}10` : "transparent",
        }}>
          ● {isLive ? "LIVE · KRAKEN" : "STANDBY"}
        </span>
      </div>

      <div style={{ padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        <span style={{ fontSize: 10, color: N.TEXT_3, letterSpacing: "0.24em", fontWeight: 700 }}>EQUITY</span>
        <span style={{
          fontSize: 38, fontWeight: 900, color: N.TEXT_0,
          letterSpacing: "-0.025em", lineHeight: 1,
          textShadow: pctToday !== 0 ? `0 0 14px ${curveColor}44` : "none",
        }}>
          ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: pctToday >= 0 ? N.LONG : N.SHORT,
          letterSpacing: "0.04em",
        }}>
          {pctToday >= 0 ? "+" : ""}{pctToday.toFixed(2)}% TODAY · real-time · kraken
        </span>
      </div>

      {/* Cinematic glowing equity curve — replaces the prior red AI AUTOTRADE
          strip + "NO BROKER LINKED" empty block per direction. */}
      <div style={{
        padding: "8px 12px 14px",
        borderTop: `1px solid ${N.BORDER}`,
        background: `radial-gradient(ellipse at 50% 100%, ${curveColor}0c 0%, transparent 70%)`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 9.5, color: N.TEXT_3, letterSpacing: "0.24em", fontWeight: 700 }}>
            PERFORMANCE
          </span>
          <span style={{
            fontSize: 9.5, color: curveColor, letterSpacing: "0.18em", fontWeight: 800,
            textShadow: `0 0 6px ${curveColor}55`,
          }}>
            ● LIVE
          </span>
        </div>
        <div style={{ width: "100%", height: 132 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="cdEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={curveColor} stopOpacity={0.45} />
                  <stop offset="60%"  stopColor={curveColor} stopOpacity={0.10} />
                  <stop offset="100%" stopColor={curveColor} stopOpacity={0.00} />
                </linearGradient>
                <filter id="cdEquityGlow" x="-20%" y="-50%" width="140%" height="200%">
                  <feGaussianBlur stdDeviation="2.4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
              <Area
                type="monotone"
                dataKey="v"
                stroke={curveColor}
                strokeWidth={2}
                fill="url(#cdEquityFill)"
                isAnimationActive={false}
                style={{ filter: "url(#cdEquityGlow)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 1,
        background: N.BORDER,
        borderTop: `1px solid ${N.BORDER}`,
      }}>
        <RailMetric label="TODAY"        value={eq(stats.todayPnl)} color={stats.todayPnl >= 0 ? N.LONG : N.SHORT} />
        <RailMetric label="FILLS · TODAY" value={String(stats.fillsToday)} color={N.TEXT_0} />
        <RailMetric label="REALIZED"     value={eq(stats.realized)} color={stats.realized >= 0 ? N.LONG : N.SHORT} />
        <RailMetric label="UNREALIZED"   value={eq(stats.unrealized)} color={stats.unrealized >= 0 ? N.LONG : N.SHORT} />
      </div>
    </div>
  );
}

function RailMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: N.SURFACE_1,
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      <span style={{ fontSize: 9.5, color: N.TEXT_3, letterSpacing: "0.22em", fontWeight: 700 }}>
        {label}
      </span>
      <span style={{
        fontSize: 15, fontWeight: 800, color,
        letterSpacing: "0.02em",
        fontFamily: N.FONT_MONO,
      }}>{value}</span>
    </div>
  );
}

/* ── AiActivityFeed ──────────────────────────────────────────────────────────
 * Right-rail live feed of recent AI signal events sourced from
 * engine.recentSignalLog. Replaces the legacy "AI ACTIVITY" feed using new
 * engine data only — no /api/admin/execution/stream coupling. */
function AiActivityFeed({ engine }: { engine?: EngineStatus }) {
  const rows = useMemo(() => {
    const log = engine?.recentSignalLog ?? [];
    return [...log]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 14);
  }, [engine?.recentSignalLog]);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      border: `1px solid ${N.BORDER_HI}`,
      borderRadius: 5,
      background: N.SURFACE_1,
      fontFamily: N.FONT_MONO,
      overflow: "hidden",
      flex: 1,
      minHeight: 620,
      boxShadow: `inset 0 0 24px ${N.BRAND}08`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 14px",
        borderBottom: `1px solid ${N.BORDER}`,
        background: `linear-gradient(180deg, ${N.BRAND}0d 0%, ${N.BG} 100%)`,
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: "0.26em",
        }}>AI ACTIVITY</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: N.BRAND_BRT,
          letterSpacing: "0.20em",
          textShadow: `0 0 6px ${N.BRAND}55`,
        }}>● LIVE FEED</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }} className="cd-scroll">
        {rows.length === 0 ? (
          <div style={{
            padding: 18, fontSize: 10.5, color: N.TEXT_3,
            letterSpacing: "0.20em", fontWeight: 700, textAlign: "center",
          }}>
            · AWAITING ENGINE SIGNALS
          </div>
        ) : rows.map(r => {
          const ts = new Date(r.timestamp);
          const hh = String(ts.getHours()).padStart(2, "0");
          const mm = String(ts.getMinutes()).padStart(2, "0");
          const ss = String(ts.getSeconds()).padStart(2, "0");
          const isBlocked = !!r.blockReason;
          const color = isBlocked ? N.WARN : r.decision === "BUY" ? N.LONG : r.decision === "SELL" ? N.SHORT : N.TEXT_2;
          const verb  = isBlocked ? "BLOCKED" : (r.executedAs ?? r.decision);
          return (
            <div key={r.id} style={{
              padding: "9px 14px",
              borderBottom: `1px solid ${N.BORDER}`,
              display: "flex", alignItems: "center", gap: 10,
              fontSize: 11, color: N.TEXT_1,
              letterSpacing: "0.02em",
            }}>
              <span style={{ color: N.TEXT_3, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {hh}:{mm}:{ss}
              </span>
              <span style={{
                color, fontWeight: 800, fontSize: 10, letterSpacing: "0.16em",
                flexShrink: 0, minWidth: 62,
                textShadow: color !== N.TEXT_2 ? `0 0 4px ${color}55` : "none",
              }}>
                AI {verb}
              </span>
              <span style={{ color: N.TEXT_0, fontWeight: 800, fontSize: 11.5, flexShrink: 0 }}>
                {r.symbol}
              </span>
              <span style={{
                color: N.TEXT_3, fontSize: 10,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                · {isBlocked ? r.blockReason : (r.shortSummary || `${r.decision} ${r.timeframe}`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── BlotterPanel ────────────────────────────────────────────────────────────
 * Compact vertical-scroll blotter for either LIVE (open) or HISTORY (closed)
 * trades. Renders directly underneath the dual matrix per restored battlefield
 * composition. Read-only; no execution affordances. */
function BlotterPanel({
  title, accent, badge, rows, mode,
}: {
  title:  string;
  accent: string;
  badge:  string;
  rows:   Trade[];
  mode:   "LIVE" | "HISTORY";
}) {
  const fmtUsd = (n: number) =>
    `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
  const fmtPct = (n: number) =>
    `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      border: `1px solid ${N.BORDER_HI}`,
      borderRadius: 5,
      background: N.SURFACE_1,
      fontFamily: N.FONT_MONO,
      overflow: "hidden",
      maxHeight: 520,
      boxShadow: `inset 0 0 24px ${accent}08`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${N.BORDER}`,
        background: `linear-gradient(180deg, ${accent}14 0%, ${N.BG} 100%)`,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: "0.26em",
        }}>{title}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: accent,
          letterSpacing: "0.20em",
          padding: "4px 9px",
          border: `1px solid ${accent}55`,
          borderRadius: 3,
          background: `${accent}10`,
          textShadow: `0 0 6px ${accent}55`,
        }}>{badge}</span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 0.5fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 0.7fr)",
        gap: 8,
        padding: "8px 16px",
        borderBottom: `1px solid ${N.BORDER}`,
        fontSize: 10, color: N.TEXT_3,
        letterSpacing: "0.20em", fontWeight: 700,
      }}>
        <span>SYMBOL</span>
        <span>SIDE</span>
        <span style={{ textAlign: "right" }}>ENTRY</span>
        <span style={{ textAlign: "right" }}>{mode === "LIVE" ? "MARK" : "EXIT"}</span>
        <span style={{ textAlign: "right" }}>PNL</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }} className="cd-scroll">
        {rows.length === 0 ? (
          <div style={{
            padding: 32, fontSize: 11, color: N.TEXT_3,
            letterSpacing: "0.20em", fontWeight: 700, textAlign: "center",
          }}>
            · {mode === "LIVE" ? "NO OPEN POSITIONS" : "NO CLOSED TRADES"}
          </div>
        ) : rows.map(t => {
          const side    = (t.side ?? "").toUpperCase();
          const isLong  = side === "BUY" || side === "LONG";
          const sideColor = isLong ? N.LONG : N.SHORT;
          const pnl     = t.pnl ?? 0;
          const pnlPct  = t.pnlPercent ?? 0;
          const pnlColor = pnl > 0 ? N.LONG : pnl < 0 ? N.SHORT : N.TEXT_2;
          const exitOrMark = mode === "LIVE"
            ? (t.exitPrice ?? t.price)
            : (t.exitPrice ?? 0);
          return (
            <div key={t.id} style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 0.5fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 0.7fr)",
              gap: 8, alignItems: "center",
              padding: "10px 16px",
              borderBottom: `1px solid ${N.BORDER}`,
              fontSize: 12.5,
            }}>
              <span style={{ color: N.TEXT_0, fontWeight: 800, letterSpacing: "0.04em", fontSize: 13 }}>
                {t.symbol}
              </span>
              <span style={{
                color: sideColor, fontWeight: 800,
                fontSize: 11, letterSpacing: "0.16em",
                textShadow: `0 0 4px ${sideColor}44`,
              }}>{isLong ? "LONG" : "SHORT"}</span>
              <span style={{
                color: N.TEXT_1, textAlign: "right", fontWeight: 700,
                fontSize: 12,
              }}>${t.price?.toFixed(2) ?? "—"}</span>
              <span style={{
                color: N.TEXT_1, textAlign: "right", fontWeight: 700,
                fontSize: 12,
              }}>${exitOrMark?.toFixed(2) ?? "—"}</span>
              <span style={{
                color: pnlColor, textAlign: "right", fontWeight: 800,
                fontSize: 12.5,
                display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15,
                textShadow: pnl !== 0 ? `0 0 5px ${pnlColor}44` : "none",
              }}>
                <span>{fmtUsd(pnl)}</span>
                <span style={{ fontSize: 10, fontWeight: 700 }}>{fmtPct(pnlPct)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Legacy slim chip strip — kept as fallback export, no longer rendered.
 * ScanningHero supersedes it with the same chip rendering inline. */
function TopConvictionPulse({ engine }: { engine?: EngineStatus }) {
  const breakdowns = engine?.symbolBreakdowns ?? {};
  const ranked = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{
      symbol: string; display: string; conf: number; dir: "LONG" | "SHORT";
    }> = [];
    for (const t of PULSE_UNIVERSE) {
      if (seen.has(t.symbol)) continue;
      seen.add(t.symbol);
      const b = breakdowns[t.symbol];
      const conf = b?.avgConfidence ?? 0;
      if (conf < PULSE_MIN_CONFIDENCE) continue;
      rows.push({
        symbol:  t.symbol,
        display: t.display ?? t.label ?? t.symbol,
        conf:    Math.round(conf),
        dir:     resolveDirection(t.symbol, b),
      });
    }
    rows.sort((a, b) => b.conf - a.conf);
    return rows.slice(0, PULSE_MAX_ITEMS);
  }, [breakdowns]);

  // Engine hasn't surfaced any 70%+ breakdowns yet — render a low-key
  // placeholder so the strip's vertical reservation is consistent and the
  // matrix below doesn't reflow when the first conviction lands.
  if (ranked.length === 0) {
    return (
      <div
        role="status"
        aria-label="Top conviction pulse — awaiting signals"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 14px",
          border: `1px solid ${N.BORDER}`,
          borderRadius: 4,
          background: `linear-gradient(90deg, ${N.SURFACE_1} 0%, ${N.BG} 100%)`,
          fontFamily: N.FONT_MONO,
        }}
      >
        <Activity size={12} style={{ color: N.TEXT_3 }} />
        <span style={{
          fontSize: 10, fontWeight: 800, color: N.TEXT_2,
          letterSpacing: "0.24em",
        }}>
          TOP CONVICTION PULSE
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: N.TEXT_3,
          letterSpacing: "0.18em",
        }}>
          · AWAITING 70%+ SIGNALS
        </span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Top conviction pulse"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 12px",
        border: `1px solid ${N.BRAND}33`,
        borderRadius: 4,
        background: `linear-gradient(90deg, ${N.BRAND}0d 0%, ${N.BG} 70%, ${N.BRAND}08 100%)`,
        boxShadow: `inset 0 0 16px ${N.BRAND}10`,
        fontFamily: N.FONT_MONO,
        overflow: "hidden",
      }}
    >
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        <Activity size={12} style={{
          color: N.BRAND_BRT,
          filter: `drop-shadow(0 0 4px ${N.BRAND})`,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 800, color: N.BRAND_BRT,
          letterSpacing: "0.24em", textShadow: `0 0 6px ${N.BRAND}55`,
        }}>
          TOP CONVICTION PULSE
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: N.TEXT_3,
          letterSpacing: "0.18em",
        }}>
          · TOP {ranked.length}
        </span>
      </div>

      <div style={{
        flex: 1, minWidth: 0,
        display: "flex", alignItems: "center",
        gap: 8, overflow: "hidden",
      }}>
        {ranked.map((r, i) => {
          const dirColor = r.dir === "LONG" ? N.LONG : N.SHORT;
          const DirIcon  = r.dir === "LONG" ? TrendingUp : TrendingDown;
          // Conviction tier — emotional contrast between elite / strong /
          // active setups. Drives border weight, glow intensity, font weight,
          // and dot size so the operator's eye locks onto 90%+ instantly.
          const tier: "ELITE" | "STRONG" | "ACTIVE" =
            r.conf >= 90 ? "ELITE" :
            r.conf >= 80 ? "STRONG" :
                           "ACTIVE";
          const isTop = i === 0;
          const isEliteTop = isTop && tier === "ELITE";

          const tierStyle = {
            ELITE: {
              border:      `1px solid ${dirColor}cc`,
              bg:          `linear-gradient(180deg, ${dirColor}33 0%, ${dirColor}10 100%)`,
              shadow:      `0 0 10px ${dirColor}55, inset 0 0 8px ${dirColor}33`,
              tickerWt:    900 as const,
              tickerSize:  12,
              confSize:    12,
              confShadow:  `0 0 7px ${dirColor}, 0 0 14px ${dirColor}80`,
              dotSize:     6,
              padding:     "5px 9px",
            },
            STRONG: {
              border:      `1px solid ${dirColor}66`,
              bg:          `linear-gradient(180deg, ${dirColor}1c 0%, transparent 100%)`,
              shadow:      `inset 0 0 6px ${dirColor}1f`,
              tickerWt:    800 as const,
              tickerSize:  11,
              confSize:    11,
              confShadow:  `0 0 4px ${dirColor}66`,
              dotSize:     5,
              padding:     "4px 8px",
            },
            ACTIVE: {
              border:      `1px solid ${dirColor}30`,
              bg:          "transparent",
              shadow:      "none",
              tickerWt:    700 as const,
              tickerSize:  10.5,
              confSize:    10.5,
              confShadow:  "none",
              dotSize:     4,
              padding:     "3px 7px",
            },
          }[tier];

          return (
            <span
              key={r.symbol}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: tierStyle.padding,
                background: tierStyle.bg,
                border: tierStyle.border,
                borderRadius: 3,
                flexShrink: 0,
                position: "relative",
                boxShadow: isEliteTop
                  ? `${tierStyle.shadow}, 0 0 18px ${dirColor}77`
                  : tierStyle.shadow,
                animation: isEliteTop
                  ? "cd-pulse-halo 1800ms ease-in-out infinite"
                  : undefined,
              }}
            >
              {/* Pulse dot — animated on #1, larger + brighter on ELITE */}
              <span
                aria-hidden
                style={{
                  width: tierStyle.dotSize, height: tierStyle.dotSize,
                  borderRadius: "50%",
                  background: dirColor,
                  boxShadow: tier === "ELITE"
                    ? `0 0 8px ${dirColor}, 0 0 16px ${dirColor}cc`
                    : tier === "STRONG"
                    ? `0 0 6px ${dirColor}, 0 0 12px ${dirColor}80`
                    : `0 0 3px ${dirColor}80`,
                  animation: isTop ? "cd-pulse-dot 1400ms ease-in-out infinite" : undefined,
                }}
              />
              <span style={{
                fontSize: tierStyle.tickerSize,
                fontWeight: tierStyle.tickerWt,
                color: tier === "ACTIVE" ? N.TEXT_1 : N.TEXT_0,
                letterSpacing: "0.08em",
              }}>
                {r.display}
              </span>
              <DirIcon size={tier === "ELITE" ? 11 : 10} style={{ color: dirColor }} />
              <span style={{
                fontSize: tierStyle.confSize,
                fontWeight: tier === "ELITE" ? 900 : 800,
                color: dirColor,
                letterSpacing: "0.04em",
                textShadow: tierStyle.confShadow,
              }}>
                {r.conf}
              </span>
            </span>
          );
        })}
      </div>
      {/* Inline keyframes — scoped to this strip so we don't bleed into the
          global animation lib. cd-pulse-halo only fires on the #1 conviction
          when it crosses into ELITE (≥90), per the "subtle movement on only
          the strongest signal" directive. */}
      <style>{`
        @keyframes cd-pulse-dot {
          0%, 100% { transform: scale(1);   opacity: 1;   }
          50%      { transform: scale(1.5); opacity: 0.55;}
        }
        @keyframes cd-pulse-halo {
          0%, 100% { filter: brightness(1)    saturate(1);   }
          50%      { filter: brightness(1.18) saturate(1.15);}
        }
      `}</style>
    </div>
  );
}

/* ── AI AUTOTRADE bar (operator-grade, red activation strip) ─────────────────
 * Sits above each LIVE AI CRYPTO EXECUTION bar in Row 1. Pulled from the
 * customer /portal MY ACCOUNT card per design direction — adapted for the
 * operator surface: no upgrade flow, no subscription gating, just a static
 * red activation strip that announces "AI AUTOTRADE — TO ACTIVATE AI
 * EXECUTION". Full column width, matches the matrix panels exactly. */
function AiAutotradeBar() {
  return (
    <div
      role="presentation"
      style={{
        width: "100%",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${N.DANGER}66`,
        borderRadius: 4,
        background: `linear-gradient(90deg, ${N.DANGER}1a 0%, ${N.DANGER}22 50%, ${N.DANGER}1a 100%)`,
        boxShadow: `inset 0 0 18px ${N.DANGER}1f, 0 0 14px ${N.DANGER}22`,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontFamily: N.FONT_MONO,
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <Zap size={14} style={{ color: N.DANGER_BRT, filter: `drop-shadow(0 0 4px ${N.DANGER})` }} />
        <span style={{
          fontSize: 12, fontWeight: 800, color: N.DANGER_BRT,
          letterSpacing: "0.24em", textShadow: `0 0 6px ${N.DANGER}66`,
        }}>
          AI AUTOTRADE
        </span>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color: `${N.DANGER_BRT}cc`,
        letterSpacing: "0.22em",
      }}>
        TO ACTIVATE AI EXECUTION
      </span>
    </div>
  );
}

import { authFetch } from "../lib/authFetch";
import type {
  EngineStatus, AppSettings, Trade, ExchangeStatus, SimAccount, LiveBalance,
} from "@/components/command/types";

// Row shape returned by GET /api/admin/closed-trades (operator-only).
// Mirrors `AdminClosed` in Portal.tsx — snake_case, broker-fee fields
// possibly null for legacy global-engine rows.
interface AdminClosedRow {
  id:                          string;
  symbol:                      string;
  side:                        string;
  size_usd?:                   number | string | null;
  entry_price?:                number | string | null;
  exit_price?:                 number | string | null;
  realized_pnl?:               number | string | null;
  realized_pnl_pct?:           number | string | null;
  mode?:                       string | null;
  close_reason?:               string | null;
  exit_time?:                  number | string | null;
  net_fees?:                   number | string | null;
  exchange?:                   string | null;
  entry_fee?:                  number | string | null;
  exit_fee?:                   number | string | null;
  entry_fee_broker?:           number | string | null;
  entry_fee_broker_currency?:  string | null;
  exit_fee_broker?:            number | string | null;
  exit_fee_broker_currency?:   string | null;
}

function adminClosedRowToTrade(r: AdminClosedRow): Trade {
  const num = (v: number | string | null | undefined): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const exitMs = r.exit_time != null ? Number(r.exit_time) : NaN;
  return {
    id:         String(r.id),
    symbol:     String(r.symbol ?? ""),
    side:       String(r.side ?? ""),
    amount:     num(r.size_usd) ?? 0,
    price:      num(r.entry_price) ?? 0,
    exitPrice:  num(r.exit_price),
    pnl:        num(r.realized_pnl),
    pnlPercent: num(r.realized_pnl_pct),
    status:     "closed",
    mode:       String(r.mode ?? "live"),
    signalId:   null,
    stopLoss:   null,
    takeProfit: null,
    reason:     r.close_reason ?? null,
    timestamp:  Number.isFinite(exitMs) ? new Date(exitMs).toISOString() : new Date().toISOString(),
    closedAt:   Number.isFinite(exitMs) ? new Date(exitMs).toISOString() : null,
    exchange:                r.exchange ?? null,
    entryFee:                r.entry_fee ?? null,
    exitFee:                 r.exit_fee ?? null,
    entryFeeBroker:          r.entry_fee_broker ?? null,
    entryFeeBrokerCurrency:  r.entry_fee_broker_currency ?? null,
    exitFeeBroker:           r.exit_fee_broker ?? null,
    exitFeeBrokerCurrency:   r.exit_fee_broker_currency ?? null,
  };
}

const Q_FAST   = { refetchInterval: 2_000, refetchOnWindowFocus: false, staleTime: 0 } as const;
const Q_MEDIUM = { refetchInterval: 4_000, refetchOnWindowFocus: false, staleTime: 0 } as const;
const Q_SLOW   = { refetchInterval: 10_000, refetchOnWindowFocus: false, staleTime: 0 } as const;

const j = <T,>(url: string) =>
  fetch(url, { cache: "no-store" }).then(r => r.json() as Promise<T>);

export default function CommandCenter() {
  const qc = useQueryClient();
  const { isOperator, isRoleResolved } = useOperatorRole();

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const { data: engine }   = useQuery({ queryKey: ["engine-status-cmd"],   queryFn: () => j<EngineStatus>("/api/engine/status"),     ...Q_MEDIUM });
  const { data: settings } = useQuery({ queryKey: ["settings-cmd"],        queryFn: () => j<AppSettings>("/api/settings"),           ...Q_SLOW   });
  const { data: trades }   = useQuery({ queryKey: ["trades-cmd"],          queryFn: () => j<Trade[]>("/api/trades"),                 ...Q_FAST   });
  // Operator-only cross-tenant closed-trade feed. Carries broker-reported
  // commission fields (entry_fee_broker, exit_fee_broker, …) so the /command
  // trade-history blotter mirrors the customer receipt + AdminTradeHistoryPanel
  // on /portal. NULL for the global-engine legacy rows; we fall back to the
  // catalog estimate fields in ClosedPanel.
  const { data: adminClosed } = useQuery<{ trades: AdminClosedRow[] }>({
    queryKey: ["admin-closed-trades-cmd"],
    queryFn:  () => j<{ trades: AdminClosedRow[] }>("/api/admin/closed-trades?limit=80"),
    enabled:  isOperator,
    ...Q_MEDIUM,
  });
  const { data: exchangeStatus, refetch: refetchExchange } = useQuery({
    queryKey: ["exchange-status-cmd"],
    queryFn:  () => j<ExchangeStatus>("/api/exchange/status"),
    ...Q_MEDIUM,
  });
  const { data: simAccount }  = useQuery({ queryKey: ["sim-account-cmd"],  queryFn: () => j<SimAccount>("/api/simulation/account"),  ...Q_FAST   });
  const { data: liveBalance } = useQuery({ queryKey: ["live-balance-cmd"], queryFn: () => j<LiveBalance>("/api/exchange/balances"),  ...Q_MEDIUM });

  void settings;

  /* ── Active exchange ──────────────────────────────────────────────────── */
  const mode       = exchangeStatus?.mode ?? "simulation";
  const liveActive = mode !== "simulation" && (exchangeStatus?.liveEnabled ?? false);
  // Operator surface is LIVE-only — default the highlighted exchange tab to
  // KRAKEN when the engine hasn't reported a live mode yet (so the tab is
  // visually selected the moment the page mounts, even before the auto-arm
  // effect resolves).
  const activeId   = liveActive ? mode : "kraken";
  const isPaused   = exchangeStatus?.paused ?? false;

  /* ── Consent flow ─────────────────────────────────────────────────────── */
  const { hasConsented } = useLiveConsent();
  const [pendingLiveEx, setPendingLiveEx] = useState<string | null>(null);

  /* ── Mutations ────────────────────────────────────────────────────────── */
  const post = (url: string, body?: Record<string, unknown>) =>
    fetch(url, {
      method:  "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body:    body ? JSON.stringify(body) : undefined,
      cache:   "no-store",
    });

  const startEngine = () => post("/api/engine/start").then(() => qc.invalidateQueries({ queryKey: ["engine-status-cmd"] }));
  const stopEngine  = () => post("/api/engine/stop").then(()  => qc.invalidateQueries({ queryKey: ["engine-status-cmd"] }));
  const togglePause = () => post("/api/exchange/pause").then(() => { void refetchExchange(); });
  const toggleKill  = () => post("/api/exchange/kill").then(()  => { void refetchExchange(); });

  const switchExchangeMode = (pendingId: string, apiMode: string) => {
    if (pendingId !== "sim") qc.removeQueries({ queryKey: ["sim-account-cmd"] });
    qc.removeQueries({ queryKey: ["live-balance-cmd"] });
    post("/api/engine/exchange-mode", { mode: apiMode })
      .then(() => qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] }));
  };

  const selectSim  = () => switchExchangeMode("sim", "simulation");
  const selectLive = (ex: string) => {
    const id = ex.toLowerCase();
    // Operator bypass — admins skip the consent gate entirely.
    if (isOperator) { switchExchangeMode(id, id); return; }
    // Role must be definitively resolved before we ever open the modal.
    // Loading / error / refetch / stale-cache states all block the modal.
    if (!isRoleResolved) return;
    if (hasConsented) {
      switchExchangeMode(id, id);
    } else {
      setPendingLiveEx(id);
    }
  };

  // Defensive auto-close — if the modal was opened before role resolved and the
  // user turns out to be an operator, close it immediately and proceed.
  useEffect(() => {
    if (isOperator && pendingLiveEx) {
      const id = pendingLiveEx;
      setPendingLiveEx(null);
      switchExchangeMode(id, id);
    }
    // switchExchangeMode is a stable closure within this render — intentionally
    // omitted from deps to avoid re-firing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOperator, pendingLiveEx]);

  // NOTE: We do NOT auto-arm the engine on mount. Operator must explicitly
  // click the live-execution bar to switch the broker into live mode. The
  // CommandBar still highlights KRAKEN as the default exchange visually so
  // it's the obvious one-click target, but no live POST happens until
  // the operator presses ENABLE LIVE AI CRYPTO EXECUTION.

  /* ── Live-trading control bars (operator) ─────────────────────────────── */
  // Operator surface = two states only: HALTED (red, default) ↔ ARMED (gold).
  // No neutral STANDBY on the operator dashboard — the engine is either live
  // or it is hard-stopped. The bar starts HALTED on every mount until the
  // operator manually arms it.
  const cryptoState: "LIVE" | "STANDBY" | "PAUSED" =
    liveActive && !isPaused ? "LIVE" : "PAUSED";

  const toggleCryptoLive = () => {
    if (liveActive && !isPaused) {
      // ARMED → HALTED. Stop execution by pausing the engine.
      togglePause();
      return;
    }
    if (liveActive && isPaused) {
      // HALTED (already in live mode, just paused) → resume to ARMED.
      togglePause();
      return;
    }
    // HALTED + not in live mode → arm Kraken live execution.
    selectLive("kraken");
  };

  // EQUITIES execution is intentionally OFF for this phase — Kraken crypto
  // is the only sanctioned live broker. The equities bar renders HALTED/red
  // and is non-interactive.
  const equitiesState: "LIVE" | "STANDBY" | "PAUSED" = "PAUSED";
  const toggleEquitiesLive = () => { /* disabled — equities live not enabled */ };

  /* ── Derived trade pools ──────────────────────────────────────────────────
   * Operator dashboard rule: NEVER render simulated execution.
   *   - Active Positions  → ONLY when live engine is armed; otherwise empty.
   *   - Closed Trade Hist → ONLY real-execution rows; sim history is hidden.
   * If Kraken has no positions, the blotter is genuinely empty by design. */
  const tradesArr     = Array.isArray(trades) ? trades : [];
  const liveTrades    = liveActive
    ? tradesArr.filter(t => (t.mode ?? "").toLowerCase() === "live" || (t as { source?: string }).source === "live")
    : [];
  // If `mode`/`source` columns aren't populated yet, fall back to ALL trades
  // ONLY when live is armed — otherwise nothing renders.
  const effectiveTrades = liveTrades.length > 0 || !liveActive ? liveTrades : tradesArr;
  const openTrades    = effectiveTrades.filter(t => t.status?.toLowerCase() === "open");
  // Closed-trade blotter: prefer the operator-only cross-tenant feed so
  // broker-reported commissions surface in the /command audit view (matches
  // /portal AdminTradeHistoryPanel + customer trade receipt). Fall back to
  // the engine-global /api/trades pool when the admin feed is unavailable
  // (e.g. role not yet resolved, or non-operator viewer).
  const adminClosedRows = adminClosed?.trades ?? [];
  const closedTrades: Trade[] = adminClosedRows.length > 0
    ? adminClosedRows.map(adminClosedRowToTrade)
    : effectiveTrades.filter(t => t.status?.toLowerCase() !== "open" || t.exitPrice != null);
  const livePositions: SimAccount["positions"] = [];

  /* ── Live-execution confidence eligibility (80% hard floor) ───────────────
   * Compute the strongest current AI confidence per asset class from engine
   * breakdowns. STANDBY → ARMED transition is blocked unless ≥80%.
   * Backend `autoExecute` enforces the same floor as a hard rule. */
  const breakdowns = engine?.symbolBreakdowns ?? {};
  const CRYPTO_SYMS = new Set(["BTC","ETH","SOL","XRP","ADA","AVAX","DOGE","LINK","DOT","MATIC","LTC","ATOM","NEAR","ALGO","FIL","ARB","OP","INJ","SUI","APT","BCH","UNI","AAVE","ETC"]);
  let cryptoMax = 0, equitiesMax = 0;
  for (const [sym, b] of Object.entries(breakdowns)) {
    const base = sym.replace(/[\/-].*$/,"").replace(/USD[TC]?$/,"").toUpperCase();
    const conf = b?.avgConfidence ?? 0;
    if (CRYPTO_SYMS.has(base)) cryptoMax   = Math.max(cryptoMax,   conf);
    else                       equitiesMax = Math.max(equitiesMax, conf);
  }
  const LIVE_CONF_FLOOR = 80;
  const cryptoEligible   = cryptoMax   >= LIVE_CONF_FLOOR;
  const equitiesEligible = equitiesMax >= LIVE_CONF_FLOOR;
  const cryptoReason   = cryptoMax   > 0 ? `MAX ${cryptoMax.toFixed(0)}% · NEED 80%`   : "AWAITING SIGNALS";
  const equitiesReason = equitiesMax > 0 ? `MAX ${equitiesMax.toFixed(0)}% · NEED 80%` : "AWAITING SIGNALS";

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div
      className="flex flex-col min-h-screen w-full"
      style={{
        background: N.BG,
        backgroundImage: `radial-gradient(1200px 600px at 50% -10%, ${N.BRAND}06 0%, transparent 60%), radial-gradient(800px 400px at 20% 100%, ${N.BRAND_DEEP}05 0%, transparent 55%)`,
      }}
    >
      <CommandBar
        engine={engine}
        exchangeStatus={exchangeStatus}
        simAccount={undefined}
        liveBalance={liveBalance}
        activeId={activeId}
        liveActive={liveActive}
        onStartEngine={startEngine}
        onStopEngine={stopEngine}
        onTogglePause={togglePause}
        onToggleKill={toggleKill}
        onSelectSim={selectSim}
        onSelectLive={selectLive}
      />

      <main className="flex-1 flex flex-col gap-1.5 py-1.5"
            style={{ maxWidth: 1880, width: "100%", margin: "0 auto" }}>

        {/* Row 0 — Global platform telemetry */}
        <div className="px-2">
          <PlatformOverview />
        </div>

        {/* Row 1 — BATTLEFIELD HERO (Scanning + Market Pulse)
            Restored OLD composition powered by NEW engine. Replaces the
            prior standalone TopConvictionPulse strip; chip tier hierarchy
            now lives inside ScanningHero. */}
        <section
          className="grid gap-1.5 px-2"
          style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}
        >
          <ScanningHero    engine={engine} />
          <MarketPulseGauge engine={engine} />
        </section>

        {/* Row 2 — BATTLEFIELD framing band */}
        <div className="px-2">
          <BattlefieldHeader engine={engine} cryptoActive={cryptoState === "LIVE"} />
        </div>

        {/* Row 3 — BATTLEFIELD: dual crypto matrix + MY ACCOUNT / AI ACTIVITY rail
            LEFT col = TOP CRYPTO MAJORS · MID col = ALTS & MEMECOINS · RAIL = account+feed
            Single unified AiAutotradeBar + LiveControlBar spans both matrix
            columns (one execution state for the entire battlefield).
            (Crypto-only locked invariant preserved — no equities.) */}
        <section
          className="grid gap-1.5 px-2"
          style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 296px", alignItems: "start" }}
        >
          <div className="flex flex-col gap-1.5" style={{ gridColumn: "1 / span 2" }}>
            <AiAutotradeBar />
            <LiveControlBar
              assetClass="CRYPTO"
              state={cryptoState}
              onToggle={toggleCryptoLive}
              eligible={cryptoEligible}
              eligibilityReason={cryptoReason}
            />
          </div>
          <div className="flex flex-col gap-1.5" style={{ gridColumn: "3 / span 1", gridRow: "1 / span 2", alignSelf: "stretch" }}>
            <MyAccountRail
              exchangeStatus={exchangeStatus}
              liveBalance={liveBalance}
              trades={tradesArr}
              engine={engine}
            />
            <AiActivityFeed engine={engine} />
          </div>
          <div style={{ gridColumn: "1 / span 1", gridRow: "2 / span 1" }}>
            <CryptoMajorsSignalsPanel engine={engine} />
          </div>
          <div style={{ gridColumn: "2 / span 1", gridRow: "2 / span 1" }}>
            <CryptoAltsMemesPanel engine={engine} />
          </div>
        </section>

        {/* Row 4 — LIVE TRADES + TRADE HISTORY blotters (only content beneath
            the dual matrix per restored composition). Vertical-scroll only;
            no other analytics, no deep equity decompose, no operator
            telemetry below this point. */}
        <section
          className="grid gap-1.5 px-2"
          style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "start" }}
        >
          <BlotterPanel
            title="20 LIVE TRADES"
            accent={N.BRAND_BRT}
            badge={`${openTrades.length} OPEN`}
            rows={openTrades.slice(0, 20)}
            mode="LIVE"
          />
          <BlotterPanel
            title="TRADE HISTORY"
            accent={N.GOLD_BRT}
            badge={`${closedTrades.length} CLOSED`}
            rows={closedTrades.slice(0, 50)}
            mode="HISTORY"
          />
        </section>

        <footer
          className="px-3 py-2 flex items-center justify-between text-[8.5px] font-bold tracking-[0.22em]"
          style={{
            color: N.TEXT_3,
            borderTop: `1px solid ${N.BORDER}`,
            fontFamily: N.FONT_MONO,
          }}
        >
          <span>AICANDLEZ · OPERATOR COMMAND CENTER · v2.1{isOperator ? " · INTERNAL ACCESS" : ""}</span>
          <span>AI ENGINE · {engine?.running ? "RUNNING" : "IDLE"} · {engine?.signalsGenerated ?? 0} SIGNALS · {engine?.tradesExecuted ?? 0} EXECS · {isOperator ? "OPERATOR · ALL GATES BYPASSED · UNLIMITED" : "UNLIMITED"}</span>
        </footer>
      </main>

      {/* Consent modal — render-gate triple-locks against operator surfaces:
          must have a pending exchange, role must be resolved, and user must
          NOT be an operator. Any one being false hard-blocks display. */}
      <LiveConsentModal
        open={pendingLiveEx !== null && isRoleResolved && !isOperator}
        onConsented={() => {
          if (pendingLiveEx) switchExchangeMode(pendingLiveEx, pendingLiveEx);
          setPendingLiveEx(null);
        }}
        onCancel={() => setPendingLiveEx(null)}
      />
    </div>
  );
}
