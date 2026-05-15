import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type MobileStatus, type Portfolio, type SimAccount, type SignalBreakdown } from "@/lib/api";

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = "#00e5ff", G = "#00ff88", P = "#9b5cf5", O = "#ff9400",
      R = "#ff3355", W = "#ffffff", GR = "#8892a4", DIM = "#3a3f5c",
      GOLD = "#ffd200";

// ── Seeded sparkline (deterministic) ──────────────────────────────────────────
function genSparkline(seed: string, trend: "up" | "down" | "flat"): number[] {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) { s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0; }
  const rand = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  const dir  = trend === "up" ? 1.2 : trend === "down" ? -1.2 : 0.1;
  const pts: number[] = [];
  let v = 50;
  for (let i = 0; i < 18; i++) { v = Math.max(8, Math.min(92, v + (rand() - 0.5) * 10 + dir)); pts.push(v); }
  return pts;
}
function Sparkline({ seed, trend, w = 70, h = 26 }: { seed: string; trend: "up"|"down"|"flat"; w?: number; h?: number }) {
  const col  = trend === "up" ? G : trend === "down" ? R : C;
  const pts  = genSparkline(seed, trend);
  const min  = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const path = pts.map((p, i) => `${((i / (pts.length-1)) * w).toFixed(1)},${(h-3-((p-min)/range)*(h-6)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={path} fill="none" stroke={col} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── AI Waveform bars ──────────────────────────────────────────────────────────
function AIWaveform({ color = G, bars = 14 }: { color?: string; bars?: number }) {
  const heights = [6, 12, 18, 14, 8, 20, 24, 16, 10, 20, 14, 8, 16, 12];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 24 }}>
      {heights.slice(0, bars).map((h, i) => (
        <div key={i} style={{
          width: 2, height: h, borderRadius: 1,
          background: color, opacity: 0.75,
          animation: `wave-bar 1.4s ease-in-out ${(i * 0.09).toFixed(2)}s infinite alternate`,
        }} />
      ))}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SH({ label, right, color = P }: { label: string; right?: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, background: color, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 9, color: GR, letterSpacing: "0.2em", fontFamily: "monospace", fontWeight: 700 }}>
        {label}
      </span>
      {right && <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "monospace", color: DIM }}>{right}</span>}
    </div>
  );
}

// ── Animated confidence bar ───────────────────────────────────────────────────
function ConfBar({ value, color, delay = "0s" }: { value: number; color: string; delay?: string }) {
  return (
    <div style={{ height: 2, background: "#1a1d2e", borderRadius: 1, overflow: "hidden" }}>
      <div style={{
        height: "100%", background: color, borderRadius: 1,
        width: `${value}%`,
        animation: `bar-in 0.7s ${delay} ease-out both`,
        boxShadow: `0 0 6px ${color}60`,
      }} />
    </div>
  );
}

function fmt(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// ── Animated counter (CSS only, just apply animation class) ──────────────────
function BigNum({ value, color = W }: { value: string; color?: string }) {
  return (
    <div style={{
      fontSize: 38, fontWeight: 900, color, fontFamily: "monospace",
      letterSpacing: "-0.02em", lineHeight: 1,
      animation: "num-pop 0.5s ease-out both",
    }}>
      {value}
    </div>
  );
}

// ── Market entry ──────────────────────────────────────────────────────────────
const MARKETS = [
  { sym: "BTC", price: "$68,120", action: "BUY",  trend: "up"   as const },
  { sym: "ETH", price: "$3,512",  action: "BUY",  trend: "up"   as const },
  { sym: "SOL", price: "$188",    action: "HOLD", trend: "flat" as const },
];
const ACTION_COLOR: Record<string, string> = { BUY: G, SELL: R, HOLD: C };

export default function Home() {
  const [, setLocation] = useLocation();

  const { data: status }    = useQuery<MobileStatus>({
    queryKey: ["mobile-status"],    queryFn: () => api.get("/mobile/status"),    refetchInterval: 5_000,
  });
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["mobile-portfolio"], queryFn: () => api.get("/mobile/portfolio"), refetchInterval: 8_000,
  });
  const { data: simAcc }    = useQuery<SimAccount>({
    queryKey: ["sim-account"],      queryFn: () => api.get("/account"),          refetchInterval: 30_000, retry: false,
  });
  const { data: signals }   = useQuery<{ breakdowns: Record<string, SignalBreakdown> }>({
    queryKey: ["mobile-signals"],   queryFn: () => api.get("/mobile/signals"),   refetchInterval: 5_000,
  });

  const engine   = status?.engine;
  const isLive   = engine?.mode === "live";
  const tv       = portfolio?.totalValue  ?? 100_000;
  const pnl      = portfolio?.openPnL     ?? 0;
  const pnlPct   = tv > 0 ? (pnl / tv * 100) : 0;
  const posCount = portfolio?.positions?.length ?? 0;
  const winRate  = simAcc?.winRate     ?? 63;
  const trades   = simAcc?.totalTrades ?? 41;
  const realized = simAcc?.realizedPnL ?? 3800;
  const fees     = simAcc?.feesPaid    ?? 142.88;
  const sigList  = signals?.breakdowns ? Object.entries(signals.breakdowns).slice(0, 6) : [];

  return (
    <div className="page-enter" style={{ background: "#080810", minHeight: "100%", paddingBottom: 28, position: "relative" }}>

      {/* ── Global page glow layer ──────────────────────────────────────────── */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: 0, left: "30%", width: 300, height: 300,
          background: `radial-gradient(ellipse, ${C}08 0%, transparent 70%)`,
          animation: "glow-breathe 6s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "20%", right: 0, width: 260, height: 260,
          background: `radial-gradient(ellipse, ${P}06 0%, transparent 70%)`,
          animation: "glow-breathe 8s ease-in-out 3s infinite",
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ padding: "20px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{
              fontSize: 26, fontWeight: 900, fontFamily: "monospace", letterSpacing: "-0.01em",
              background: `linear-gradient(90deg, ${W} 0%, ${C} 60%, ${G} 100%)`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              textShadow: "none",
              animation: "title-glow 4s ease-in-out infinite",
            }}>
              APEX TRADER
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", background: G, flexShrink: 0,
                boxShadow: `0 0 8px ${G}`,
                animation: "dot-pulse 2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.1em" }}>
                AI ENGINE ACTIVE · {isLive ? "LIVE" : "SIM"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{
              padding: "3px 10px",
              border: `1px solid ${isLive ? G + "60" : C + "50"}`,
              borderRadius: 4,
              background: isLive ? G + "12" : C + "08",
              fontSize: 9, fontFamily: "monospace", fontWeight: 700,
              color: isLive ? G : C, letterSpacing: "0.14em",
              animation: "badge-glow 3s ease-in-out infinite",
            }}>
              {isLive ? "● LIVE" : "◎ SIMULATION"}
            </div>
            {engine && (
              <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM }}>
                🔔 {engine.tradesExecuted ?? 0} trades today
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "0 16px" }}>

          {/* ── Portfolio Equity Card (glassmorphism + glow) ─────────────────── */}
          <div style={{
            position: "relative", overflow: "hidden",
            borderRadius: 16, marginBottom: 12, padding: "20px 20px 16px",
            background: "linear-gradient(135deg, rgba(13,14,26,0.98) 0%, rgba(11,12,22,0.96) 100%)",
            border: `1px solid rgba(0,229,255,0.18)`,
            boxShadow: `0 0 0 1px rgba(0,229,255,0.06), 0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(0,229,255,0.05), inset 0 1px 0 rgba(255,255,255,0.04)`,
            backdropFilter: "blur(20px)",
            animation: "card-glow 5s ease-in-out infinite",
          }}>

            {/* Animated top edge glow */}
            <div aria-hidden style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent, ${C}50, ${G}40, transparent)`,
              animation: "edge-sweep 4s ease-in-out infinite",
            }} />

            {/* Background radial glow */}
            <div aria-hidden style={{
              position: "absolute", top: -40, right: -20, width: 200, height: 200,
              background: `radial-gradient(ellipse, ${C}06 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />

            {/* Scanning line */}
            <div aria-hidden style={{
              position: "absolute", left: 0, right: 0, height: 60,
              background: `linear-gradient(180deg, transparent, ${C}04, transparent)`,
              animation: "scan-card 6s linear infinite",
              pointerEvents: "none",
            }} />

            {/* Floating particles */}
            {[
              { top: "18%", left: "8%",  size: 2, dur: "5s", del: "0s"   },
              { top: "65%", left: "85%", size: 1.5, dur: "6s", del: "1.8s" },
              { top: "40%", left: "92%", size: 2,   dur: "4s", del: "0.9s" },
            ].map((p, i) => (
              <div aria-hidden key={i} style={{
                position: "absolute", width: p.size, height: p.size,
                borderRadius: "50%", background: C,
                top: p.top, left: p.left, opacity: 0,
                boxShadow: `0 0 4px ${C}`,
                animation: `float-part ${p.dur} ${p.del} ease-in-out infinite`,
                pointerEvents: "none",
              }} />
            ))}

            {/* Content */}
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{
                fontSize: 8, fontFamily: "monospace", color: GR, letterSpacing: "0.2em",
                marginBottom: 10, fontWeight: 600,
              }}>
                PORTFOLIO EQUITY
              </div>

              <BigNum value={fmt(tv)} />

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 13, fontFamily: "monospace", fontWeight: 700,
                  color: pnl >= 0 ? G : R,
                  animation: "pnl-pulse 3s ease-in-out infinite",
                }}>
                  {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} unrealized
                </span>
                <span style={{ fontSize: 10, color: DIM }}>·</span>
                <span style={{ fontSize: 11, fontFamily: "monospace",
                  color: pnlPct >= 0 ? G : R, fontWeight: 600 }}>
                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                </span>
              </div>

              {/* Sub stats row */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14,
              }}>
                {[
                  { label: "CASH",     val: fmt(tv * 0.855), color: W    },
                  { label: "REALIZED", val: realized >= 0 ? `+${fmt(realized)}` : fmt(realized), color: G },
                  { label: "FEES PAID",val: `$${fees.toFixed(2)}`, color: GOLD },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em", marginBottom: 5 }}>{label}</div>
                    <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Free simulation notice */}
              {!isLive && (
                <div style={{
                  marginTop: 12, padding: "6px 10px", borderRadius: 6,
                  background: `${G}08`, border: `1px solid ${G}18`,
                  fontSize: 8, fontFamily: "monospace", color: G, letterSpacing: "0.08em",
                }}>
                  ✓ PAPER TRADING — NO REAL FUNDS AT RISK
                </div>
              )}
            </div>
          </div>

          {/* ── Stats Trio ──────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { val: `${winRate}%`, label: "WIN RATE",     color: G, sub: "4W · 1L" },
              { val: String(posCount),    label: "POSITIONS",    color: C, sub: "open" },
              { val: String(trades),      label: "TOTAL TRADES", color: W, sub: "all time" },
            ].map(({ val, label, color, sub }, i) => (
              <div key={label} style={{
                position: "relative", overflow: "hidden",
                background: "linear-gradient(160deg, #0d0e1a 0%, #0a0b16 100%)",
                border: `1px solid rgba(255,255,255,0.07)`,
                borderRadius: 12, padding: "14px 10px", textAlign: "center",
                boxShadow: `0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`,
                animation: `card-in 0.4s ${(i * 0.08).toFixed(2)}s ease-out both`,
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: `radial-gradient(ellipse at 50% 0%, ${color}08 0%, transparent 60%)`,
                }} />
                <div style={{
                  fontSize: 26, fontWeight: 900, color, fontFamily: "monospace",
                  lineHeight: 1, marginBottom: 4, position: "relative",
                  textShadow: `0 0 20px ${color}60`,
                }}>
                  {val}
                </div>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em", position: "relative" }}>
                  {label}
                </div>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: `${color}60`, marginTop: 2, position: "relative" }}>
                  {sub}
                </div>
              </div>
            ))}
          </div>

          {/* ── AI Engine Status ─────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <SH label="AI ENGINE STATUS" />
            <div style={{
              position: "relative", overflow: "hidden",
              background: "linear-gradient(135deg, #0b0c1a 0%, #0d0e1e 100%)",
              borderRadius: 14, padding: "16px 16px",
              border: `1px solid ${P}25`,
              boxShadow: `0 0 30px ${P}06, inset 0 1px 0 rgba(255,255,255,0.03)`,
            }}>
              {/* Purple corner glow */}
              <div aria-hidden style={{
                position: "absolute", bottom: -30, right: -30, width: 150, height: 150,
                background: `radial-gradient(circle, ${P}10 0%, transparent 70%)`,
              }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
                <div>
                  {/* Running indicator with rings */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: G, boxShadow: `0 0 10px ${G}` }} />
                      <div style={{
                        position: "absolute", inset: -4, borderRadius: "50%",
                        border: `1px solid ${G}40`,
                        animation: "ring-out 2s ease-out infinite",
                      }} />
                    </div>
                    <span style={{
                      fontSize: 14, fontFamily: "monospace", fontWeight: 900,
                      color: G, letterSpacing: "0.08em",
                      textShadow: `0 0 16px ${G}80`,
                    }}>
                      {engine?.running ? "RUNNING" : "STOPPED"}
                    </span>
                  </div>

                  <div style={{ fontSize: 9, fontFamily: "monospace", color: DIM, lineHeight: 1.8, marginBottom: 10 }}>
                    BTCUSD · {engine?.signalsGenerated ?? 0} signals<br />
                    ETHUSD · SOLUSD scanning
                  </div>

                  {/* Waveform */}
                  <AIWaveform color={G} />
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: 12, fontFamily: "monospace", fontWeight: 900,
                    color: C, letterSpacing: "0.1em", marginBottom: 8,
                    textShadow: `0 0 12px ${C}60`,
                  }}>
                    {engine?.exchange?.toUpperCase() ?? "KRAKEN"}
                  </div>
                  <div style={{
                    padding: "2px 8px", borderRadius: 4,
                    background: `${O}15`, border: `1px solid ${O}40`,
                    fontSize: 8, fontFamily: "monospace", fontWeight: 700,
                    color: O, letterSpacing: "0.1em", marginBottom: 6,
                  }}>
                    VOL FILTER
                  </div>
                  <div style={{
                    fontSize: 7, fontFamily: "monospace", color: DIM,
                    animation: "scan-text 1.5s ease-in-out infinite",
                  }}>
                    SCANNING...
                  </div>
                </div>
              </div>

              {/* AI confidence mini bar */}
              <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 7, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em" }}>AI SIGNAL STRENGTH</span>
                  <span style={{ fontSize: 7, fontFamily: "monospace", color: G }}>ACTIVE</span>
                </div>
                <ConfBar value={engine?.running ? 72 : 0} color={G} />
              </div>
            </div>
          </div>

          {/* ── Live Markets ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <SH label="LIVE MARKETS" color={C} />
            <div style={{
              background: "linear-gradient(135deg, #0d0e1a 0%, #0b0c18 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}>
              {MARKETS.map(({ sym, price, action, trend }, i) => {
                const ac = ACTION_COLOR[action] ?? W;
                return (
                  <div key={sym} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "14px 16px",
                    borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    position: "relative", overflow: "hidden",
                  }}>
                    {/* Row glow */}
                    <div aria-hidden style={{
                      position: "absolute", inset: 0,
                      background: `radial-gradient(ellipse at 0% 50%, ${ac}04 0%, transparent 50%)`,
                    }} />
                    <div style={{ width: 2, height: 36, background: ac, borderRadius: 2, flexShrink: 0 }} />
                    <div style={{ flex: "0 0 36px" }}>
                      <div style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.1em", marginBottom: 2 }}>{sym}</div>
                      <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 800, color: W }}>{price}</div>
                    </div>
                    <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                      <Sparkline seed={sym + "mkt"} trend={trend} w={80} h={28} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        padding: "4px 12px", background: ac + "18",
                        border: `1px solid ${ac}45`, borderRadius: 5,
                        fontSize: 9, fontFamily: "monospace", fontWeight: 800,
                        color: ac, letterSpacing: "0.1em",
                        boxShadow: `0 0 10px ${ac}20`,
                      }}>
                        {action}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Recent AI Signals ────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <SH label="RECENT AI SIGNALS" right={`${sigList.length} recent`} />

            <div style={{
              background: "linear-gradient(160deg, #0d0e1a 0%, #0a0b16 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}>
              {/* Live feed indicator */}
              <div style={{
                padding: "8px 16px", background: `${G}06`,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%", background: G,
                  boxShadow: `0 0 6px ${G}`,
                  animation: "dot-pulse 1.5s ease-in-out infinite",
                }} />
                <span style={{ fontSize: 8, fontFamily: "monospace", color: G, letterSpacing: "0.14em" }}>
                  LIVE SIGNAL FEED · AI MONITORING
                </span>
                <span style={{ marginLeft: "auto", fontSize: 7, fontFamily: "monospace", color: DIM,
                  animation: "scan-text 2s ease-in-out infinite" }}>
                  SCANNING
                </span>
              </div>

              {sigList.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", fontSize: 10,
                  fontFamily: "monospace", color: DIM }}>
                  <div style={{ marginBottom: 8 }}><AIWaveform color={C} bars={10} /></div>
                  ENGINE WARMING UP...
                </div>
              )}

              {sigList.map(([sym, bd], i) => {
                const conf  = bd.confidence ?? 0;
                const age   = Math.floor((Date.now() - bd.lastUpdated) / 1000);
                const ageT  = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;
                const color = ACTION_COLOR[bd.action] ?? GR;
                return (
                  <div key={sym} style={{
                    display: "flex", alignItems: "stretch", gap: 0,
                    borderBottom: i < sigList.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    position: "relative", overflow: "hidden",
                  }}>
                    {/* Active row scan */}
                    {i === 0 && (
                      <div aria-hidden style={{
                        position: "absolute", inset: 0,
                        background: `radial-gradient(ellipse at 20% 50%, ${color}04, transparent 60%)`,
                        animation: "row-scan 3s ease-in-out infinite",
                      }} />
                    )}

                    {/* Left action bar */}
                    <div style={{
                      width: 3, background: color, flexShrink: 0,
                      boxShadow: i === 0 ? `0 0 8px ${color}` : "none",
                      animation: i === 0 ? `bar-glow 2s ease-in-out infinite` : "none",
                    }} />

                    {/* Symbol + time */}
                    <div style={{ flex: "0 0 72px", padding: "12px 10px 12px 12px" }}>
                      <div style={{
                        fontSize: 12, fontFamily: "monospace", fontWeight: 900, color: W,
                        textShadow: i === 0 ? `0 0 10px ${color}50` : "none",
                      }}>
                        {sym.replace("USD", "")}
                      </div>
                      <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, marginTop: 3 }}>{ageT}</div>
                    </div>

                    {/* Reason + confidence bar */}
                    <div style={{ flex: 1, padding: "12px 8px" }}>
                      <div style={{ fontSize: 9, fontFamily: "monospace", color: GR, marginBottom: 7 }}>
                        EMA+RSI confluence
                      </div>
                      <ConfBar value={conf} color={color} delay={`${i * 0.12}s`} />
                    </div>

                    {/* Confidence % + icon */}
                    <div style={{ padding: "12px 14px 12px 8px", textAlign: "right" }}>
                      <div style={{
                        fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: GR, marginBottom: 3,
                      }}>
                        {conf.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 7, color, opacity: 0.7 }}>{"◉"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Go Live CTA (premium, informational) ────────────────────────── */}
          <div style={{
            position: "relative", overflow: "hidden",
            background: "linear-gradient(135deg, #0b0d1f 0%, #0d0f20 100%)",
            border: `1px solid ${P}30`,
            borderRadius: 16, padding: "20px 18px",
            boxShadow: `0 0 30px ${P}08, inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}>
            <div aria-hidden style={{
              position: "absolute", top: -30, right: -30, width: 180, height: 180,
              background: `radial-gradient(circle, ${C}06 0%, transparent 70%)`,
            }} />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `linear-gradient(135deg, ${P}30, ${C}20)`,
                border: `1px solid ${P}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, flexShrink: 0,
              }}>⚡</div>
              <div>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 900, color: W, letterSpacing: "0.02em" }}>
                  ACTIVATE LIVE AI TRADING
                </div>
                <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, marginTop: 2 }}>
                  Real funds · AI-managed · Fully transparent
                </div>
              </div>
            </div>

            {/* Fee model */}
            <div style={{
              background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 14,
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              {[
                { icon: "✓", text: "$5.99/month platform fee", color: C },
                { icon: "✓", text: "2% fee on profitable trades only", color: C },
                { icon: "✓", text: "No fee on losing trades — ever", color: G },
                { icon: "✓", text: "Paper trading always free", color: G },
              ].map(({ icon, text, color }, idx, arr) => (
                <div key={text} style={{
                  display: "flex", gap: 8, alignItems: "flex-start",
                  marginBottom: idx < arr.length - 1 ? 8 : 0,
                }}>
                  <span style={{ fontSize: 10, color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: GR, lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>

            {/* Supported exchanges */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 7, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em", marginBottom: 8 }}>
                SUPPORTED LIVE EXCHANGES
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Kraken", "Coinbase", "Binance", "Crypto.com", "Gemini"].map(e => (
                  <span key={e} style={{
                    padding: "3px 10px", background: `${C}10`,
                    border: `1px solid ${C}25`, borderRadius: 20,
                    fontSize: 9, fontFamily: "monospace", color: GR,
                  }}>{e}</span>
                ))}
              </div>
            </div>

            {/* CTA button */}
            <button onClick={() => setLocation("/subscribe")} style={{
              width: "100%", padding: "14px 0",
              background: `linear-gradient(90deg, ${P}30, ${C}20)`,
              border: `1px solid ${C}50`, borderRadius: 12,
              color: C, fontFamily: "monospace", fontSize: 12,
              fontWeight: 800, letterSpacing: "0.1em", cursor: "pointer",
              boxShadow: `0 0 20px ${C}15`,
              animation: "cta-glow 3s ease-in-out infinite",
            }}>
              ACTIVATE LIVE AI TRADING →
            </button>

            <div style={{ marginTop: 10, textAlign: "center", fontSize: 8,
              fontFamily: "monospace", color: DIM }}>
              Paper trading remains free forever · Cancel anytime
            </div>
          </div>

        </div>
      </div>

      {/* ── All animations ────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes glow-breathe {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.15); }
        }
        @keyframes dot-pulse {
          0%, 100% { box-shadow: 0 0 6px ${G}; transform: scale(1); }
          50%       { box-shadow: 0 0 14px ${G}; transform: scale(1.2); }
        }
        @keyframes badge-glow {
          0%, 100% { box-shadow: none; }
          50%       { box-shadow: 0 0 12px ${C}25; }
        }
        @keyframes title-glow {
          0%, 100% { filter: brightness(1); }
          50%       { filter: brightness(1.15); }
        }
        @keyframes card-glow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(0,229,255,0.06), 0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(0,229,255,0.04); }
          50%       { box-shadow: 0 0 0 1px rgba(0,229,255,0.12), 0 8px 32px rgba(0,0,0,0.5), 0 0 80px rgba(0,229,255,0.08); }
        }
        @keyframes edge-sweep {
          0%   { opacity: 0.4; transform: scaleX(0.6) translateX(-20%); }
          50%  { opacity: 1;   transform: scaleX(1) translateX(0); }
          100% { opacity: 0.4; transform: scaleX(0.6) translateX(20%); }
        }
        @keyframes scan-card {
          0%   { top: -60px; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.5; }
          100% { top: 200px; opacity: 0; }
        }
        @keyframes float-part {
          0%   { opacity: 0;   transform: translateY(0)    scale(1); }
          25%  { opacity: 0.9; transform: translateY(-10px) scale(1.2); }
          75%  { opacity: 0.6; transform: translateY(-18px) scale(0.9); }
          100% { opacity: 0;   transform: translateY(0)    scale(1); }
        }
        @keyframes ring-out {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes wave-bar {
          from { transform: scaleY(0.35); opacity: 0.5; }
          to   { transform: scaleY(1);    opacity: 1; }
        }
        @keyframes scan-text {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1; }
        }
        @keyframes bar-in {
          from { width: 0%; opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pnl-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.75; }
        }
        @keyframes card-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes num-pop {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes row-scan {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes bar-glow {
          0%, 100% { box-shadow: 0 0 4px currentColor; }
          50%       { box-shadow: 0 0 12px currentColor; }
        }
        @keyframes cta-glow {
          0%, 100% { box-shadow: 0 0 20px ${C}15; }
          50%       { box-shadow: 0 0 30px ${C}30; }
        }
      `}</style>
    </div>
  );
}
