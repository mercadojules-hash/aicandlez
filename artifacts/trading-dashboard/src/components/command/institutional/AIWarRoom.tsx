/**
 * AI Intelligence Center — top-of-portal telemetry row.
 *
 * Design contract (locked, Bloomberg-precision pass):
 *   • Six identical 1:1 square tiles, perfectly aligned in a single row.
 *   • Identical inner padding, identical header bar height.
 *   • AI Confidence is first and stripped to ONLY a centered ring + number
 *     (no subsystem bars, no extra captions).
 *   • AI Radar is mathematically centered inside its tile.
 *   • Every animation runs on a similar ~3s cadence so the surface feels
 *     like one synchronized institutional system.
 *   • All motion respects `prefers-reduced-motion`.
 */

import { useEffect, useId, useState } from "react";
import { N } from "./theme";

/* ── shared inline keyframes (unified cadence) ─────────────────────────── */
const KEYFRAMES = `
@keyframes warroom-sweep        { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes warroom-sweep-rev    { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes warroom-pulse        { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
@keyframes warroom-arc-glow     { 0%,100% { filter: drop-shadow(0 0 3px ${N.BRAND}90); } 50% { filter: drop-shadow(0 0 9px ${N.BRAND}); } }
@keyframes warroom-bloom        { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.65; transform: scale(1.04); } }
@keyframes warroom-needle       { 0%,100% { transform: rotate(-22deg); } 50% { transform: rotate(20deg); } }
@keyframes warroom-blip         { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes warroom-bar          { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes warroom-fill         { from { transform: scaleX(0); } to { transform: scaleX(1); } }

@media (prefers-reduced-motion: reduce) {
  .warroom-anim, .warroom-anim * { animation: none !important; transition: none !important; }
}
`;

const TILE   = 220;          // strict 1:1 square
const HEAD_H = 30;           // identical header bar height
const PAD    = 12;           // identical inner padding
const BODY   = TILE - HEAD_H; // 190 — usable body square

/* ── Generic Tile ──────────────────────────────────────────────────────── */

function Tile({
  label, sub, accent = N.BRAND, children,
}: {
  label: string;
  sub?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background:   N.SURFACE_1,
        border:       `1px solid ${N.BORDER}`,
        borderRadius: 6,
        width:        TILE,
        height:       TILE,
        flex:         `0 0 ${TILE}px`,
        overflow:     "hidden",
        fontFamily:   N.FONT_MONO,
        display:      "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height:       HEAD_H,
          padding:      "0 10px",
          borderBottom: `1px solid ${N.BORDER}`,
          background:   `linear-gradient(180deg, ${accent}14 0%, ${N.BG} 100%)`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          flexShrink:   0,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.20em", color: N.TEXT_0 }}>
          {label}
        </span>
        {sub && (
          <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.16em", color: N.TEXT_3 }}>
            {sub}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          padding: PAD,
          position: "relative",
          minHeight: 0,
          display: "flex",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. AI CONFIDENCE — minimalist: ring + number only
 * ──────────────────────────────────────────────────────────────────────── */

function ConfidenceCore() {
  const arcGrad   = useId();
  const bloomGrad = useId();
  const [pct, setPct] = useState(78);
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const next = p + (Math.random() - 0.42) * 3;
        return Math.max(64, Math.min(92, next));
      });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Multi-layer ring sized to fill the body square with breathing margin.
  const DIM    = BODY - PAD;            // 178
  const VB     = 200;                   // SVG viewBox
  const cx     = VB / 2;
  const cy     = VB / 2;

  // Layer radii (outer → inner): segmented telemetry ring, thick gradient
  // arc (the value), faint inner accent.
  const rSeg   = (VB / 2) - 10;          // outermost segmented ring
  const rArc   = rSeg - 12;              // thick value arc
  const rAcc   = rArc - 10;              // faint inner accent
  const STROKE = 11;                     // thicker, more premium
  const c      = 2 * Math.PI * rArc;
  const dash   = (pct / 100) * c;

  return (
    <Tile label="AI CONFIDENCE" sub="ROLLING">
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <svg
          width={DIM} height={DIM} viewBox={`0 0 ${VB} ${VB}`}
          role="img" aria-label={`AI confidence ${Math.round(pct)} percent`}
          style={{ display: "block" }}
        >
          <defs>
            {/* Gradient arc — deep emerald → brand → bright lime sweep */}
            <linearGradient id={arcGrad} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor={N.BRAND_DEEP} />
              <stop offset="55%"  stopColor={N.BRAND} />
              <stop offset="100%" stopColor={N.BRAND_BRT} />
            </linearGradient>
            {/* Soft radial bloom behind the value */}
            <radialGradient id={bloomGrad} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={N.BRAND}     stopOpacity={0.28} />
              <stop offset="70%"  stopColor={N.BRAND}     stopOpacity={0.06} />
              <stop offset="100%" stopColor={N.BRAND}     stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Layered glow bloom */}
          <circle cx={cx} cy={cy} r={rArc + 4} fill={`url(#${bloomGrad})`}
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              animation: "warroom-bloom 6s ease-in-out infinite",
            }}
          />

          {/* Outer segmented telemetry ring — slowly rotating */}
          <g style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: "warroom-sweep 60s linear infinite",
          }}>
            {Array.from({ length: 48 }).map((_, i) => {
              const a  = (i / 48) * Math.PI * 2 - Math.PI / 2;
              const r1 = rSeg - 2;
              const r2 = rSeg + (i % 6 === 0 ? 5 : 2);
              const isMajor = i % 12 === 0;
              return (
                <line
                  key={i}
                  x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1}
                  x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2}
                  stroke={isMajor ? N.BRAND : N.BORDER_HI}
                  strokeWidth={isMajor ? 1.6 : 0.7}
                  strokeOpacity={isMajor ? 1 : 0.55}
                />
              );
            })}
          </g>

          {/* Thin outer guide circle */}
          <circle cx={cx} cy={cy} r={rSeg} fill="none"
            stroke={N.BORDER_HI} strokeWidth={0.5} strokeOpacity={0.5} />

          {/* Background track for value arc */}
          <circle cx={cx} cy={cy} r={rArc}
            fill="none" stroke={N.SURFACE_3} strokeWidth={STROKE} opacity={0.9} />
          <circle cx={cx} cy={cy} r={rArc}
            fill="none" stroke={N.BORDER_HI} strokeWidth={1} strokeOpacity={0.5} />

          {/* Active gradient arc — premium thickness + glow */}
          <circle
            cx={cx} cy={cy} r={rArc}
            fill="none"
            stroke={`url(#${arcGrad})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: "stroke-dasharray 900ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              animation: "warroom-arc-glow 3s ease-in-out infinite",
            }}
          />

          {/* Counter-rotating accent flecks (subtle premium motion) */}
          <g style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: "warroom-sweep-rev 18s linear infinite",
          }}>
            {[0, 90, 180, 270].map((deg) => {
              const a = (deg * Math.PI) / 180;
              return (
                <circle
                  key={deg}
                  cx={cx + Math.cos(a) * rArc}
                  cy={cy + Math.sin(a) * rArc}
                  r={1.6}
                  fill={N.TEXT_0}
                  opacity={0.7}
                />
              );
            })}
          </g>

          {/* Faint inner accent ring */}
          <circle cx={cx} cy={cy} r={rAcc}
            fill="none" stroke={N.BRAND} strokeWidth={0.6} strokeOpacity={0.25}
            strokeDasharray="2 4" />

          {/* Center number — large, dominant, ultra-readable */}
          <text
            x={cx} y={cy + 20}
            textAnchor="middle"
            fontSize={64} fontWeight={800}
            fill={N.TEXT_0} fontFamily={N.FONT_MONO}
            style={{ letterSpacing: "0.01em" }}
          >
            {Math.round(pct)}
          </text>
        </svg>
      </div>
    </Tile>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. AI RADAR — perfectly centered
 * ──────────────────────────────────────────────────────────────────────── */

interface Blip { angle: number; r: number; color: string; label: string }
const BLIPS: Blip[] = [
  { angle:   8, r: 0.78, color: N.BRAND,     label: "BTC" },
  { angle:  62, r: 0.54, color: N.BRAND_BRT, label: "ETH" },
  { angle: 118, r: 0.86, color: N.LONG,      label: "SOL" },
  { angle: 175, r: 0.42, color: N.BRAND,     label: "NVDA" },
  { angle: 224, r: 0.66, color: N.BRAND_VIV, label: "TSLA" },
  { angle: 286, r: 0.32, color: N.SHORT,     label: "SPY" },
  { angle: 332, r: 0.72, color: N.LONG,      label: "AVAX" },
];

function RadarTile() {
  const sweepId = useId();
  // The body region is BODY tall — pick a square that fits with PAD inside.
  const DIM = BODY - PAD;           // 178
  const VB  = 200;                  // square viewBox
  const cx  = VB / 2;
  const cy  = VB / 2;
  const R   = VB / 2 - 14;

  return (
    <Tile label="AI RADAR" sub="MULTI-ASSET">
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={DIM} height={DIM} viewBox={`0 0 ${VB} ${VB}`}
          role="img" aria-label="AI radar scanner showing multi-asset blips"
          style={{ display: "block" }}
        >
          {/* concentric rings */}
          {[0.28, 0.5, 0.74, 1].map((f, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={R * f}
              fill="none"
              stroke={i === 3 ? N.BRAND : N.BORDER_HI}
              strokeOpacity={i === 3 ? 0.55 : 0.4}
              strokeWidth={i === 3 ? 1 : 0.6}
            />
          ))}
          {/* crosshair */}
          <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke={N.BORDER_HI} strokeWidth={0.5} />
          <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke={N.BORDER_HI} strokeWidth={0.5} />

          {/* sweep */}
          <g style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: "warroom-sweep 6s linear infinite",
          }}>
            <defs>
              <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={N.BRAND} stopOpacity={0.45} />
                <stop offset="100%" stopColor={N.BRAND} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path
              d={`M ${cx} ${cy} L ${cx + R} ${cy} A ${R} ${R} 0 0 0 ${cx + R * Math.cos(-Math.PI / 4)} ${cy + R * Math.sin(-Math.PI / 4)} Z`}
              fill={`url(#${sweepId})`}
            />
            <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke={N.BRAND} strokeWidth={1.1} strokeOpacity={0.9} />
          </g>

          {/* center */}
          <circle cx={cx} cy={cy} r={4.5} fill={N.BRAND} opacity={0.9}
            style={{ animation: "warroom-pulse 3s infinite", transformOrigin: `${cx}px ${cy}px` }} />
          <circle cx={cx} cy={cy} r={1.8} fill={N.TEXT_0} />

          {/* blips */}
          {BLIPS.map((b, i) => {
            const rad = (b.angle * Math.PI) / 180;
            const x = cx + R * b.r * Math.cos(rad);
            const y = cy + R * b.r * Math.sin(rad);
            return (
              <g key={i}>
                <circle
                  cx={x} cy={y} r={2.8}
                  fill={b.color}
                  style={{
                    animation: `warroom-blip 3s ${(i * 0.4) % 3}s infinite`,
                    transformOrigin: `${x}px ${y}px`,
                    filter: `drop-shadow(0 0 4px ${b.color})`,
                  }}
                />
                <text
                  x={x + 5} y={y + 2.5}
                  fontSize={6.5}
                  fontWeight={700}
                  fill={N.TEXT_1}
                  style={{ letterSpacing: "0.06em", fontFamily: N.FONT_MONO }}
                >
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Tile>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. SIGNAL PIPELINE
 * ──────────────────────────────────────────────────────────────────────── */

function SignalPipeline() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const noise = (base: number, amp: number, i: number) =>
    Math.round(base + Math.sin(tick * 0.6 + i) * amp);
  const stages = [
    { label: "SCAN",     n: noise(847, 24, 0), color: N.BRAND      },
    { label: "RANK",     n: noise(312, 12, 1), color: N.BRAND_BRT  },
    { label: "VALIDATE", n: noise( 58,  4, 2), color: N.BRAND_DEEP },
    { label: "EXECUTE",  n: noise( 12,  2, 3), color: N.BRAND_VIV  },
  ];
  const max = stages[0].n;

  return (
    <Tile label="SIGNAL PIPELINE" sub="FUNNEL">
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "space-between",
      }}>
        {stages.map((s, i) => {
          const w = Math.max(8, (s.n / max) * 100);
          return (
            <div key={s.label}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                marginBottom: 3,
              }}>
                <span style={{
                  fontSize: 8.5, fontWeight: 800, letterSpacing: "0.18em",
                  color: N.TEXT_1,
                }}>{s.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  color: s.color, textShadow: `0 0 4px ${s.color}60`,
                }}>{s.n}</span>
              </div>
              <div style={{
                height: 5, background: N.SURFACE_3,
                border: `1px solid ${N.BORDER_HI}`, borderRadius: 2,
                overflow: "hidden", position: "relative",
              }}>
                <div style={{
                  width: `${w}%`, height: "100%",
                  background: `linear-gradient(90deg, ${s.color}, ${s.color}80)`,
                  boxShadow: `0 0 4px ${s.color}90`,
                  transition: "width 900ms ease",
                  animation: `warroom-bar 3s ${i * 0.18}s ease-in-out infinite`,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </Tile>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. RISK EXPOSURE
 * ──────────────────────────────────────────────────────────────────────── */

const EXPOSURE = [
  { sym: "BTC",  pct: 28, side: "LONG"  as const },
  { sym: "ETH",  pct: 19, side: "LONG"  as const },
  { sym: "SOL",  pct: 14, side: "LONG"  as const },
  { sym: "NVDA", pct: 11, side: "LONG"  as const },
  { sym: "SPY",  pct:  9, side: "SHORT" as const },
  { sym: "AVAX", pct:  7, side: "LONG"  as const },
];

function RiskExposure() {
  return (
    <Tile label="RISK EXPOSURE" sub="NET 88%">
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "space-between",
      }}>
        {EXPOSURE.map((e) => {
          const color = e.side === "LONG" ? N.LONG : N.SHORT;
          return (
            <div key={e.sym} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 36, fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
                color: N.TEXT_0, flexShrink: 0,
              }}>{e.sym}</span>
              <span style={{
                width: 28, fontSize: 7, fontWeight: 800, letterSpacing: "0.16em",
                color, flexShrink: 0,
              }}>{e.side}</span>
              <div style={{
                flex: 1, height: 5,
                background: N.SURFACE_3,
                border: `1px solid ${N.BORDER_HI}`,
                borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${Math.min(e.pct * 3.2, 100)}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}80)`,
                  boxShadow: `0 0 3px ${color}70`,
                  transformOrigin: "left",
                  animation: "warroom-fill 1.2s ease-out",
                }} />
              </div>
              <span style={{
                fontSize: 10, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                color, width: 28, textAlign: "right", flexShrink: 0,
              }}>
                {e.pct}%
              </span>
            </div>
          );
        })}
      </div>
    </Tile>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. AI THROUGHPUT
 * ──────────────────────────────────────────────────────────────────────── */

function AIThroughput() {
  const [sigs, setSigs]       = useState(847);
  const [latency, setLatency] = useState(14);
  useEffect(() => {
    const id = setInterval(() => {
      setSigs((n) => Math.max(800, Math.min(890, n + Math.round((Math.random() - 0.5) * 12))));
      setLatency((n) => Math.max(11, Math.min(22, n + Math.round((Math.random() - 0.5) * 2))));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <Tile label="AI THROUGHPUT" sub="LIVE">
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "space-between",
      }}>
        <StatRow label="SIGS / HR"   value={sigs.toString()}  color={N.BRAND}     />
        <StatRow label="LATENCY"     value={`${latency} ms`}  color={N.BRAND_BRT} />
        <StatRow label="UPTIME"      value="99.97%"           color={N.LONG}      />
        <StatRow label="MODELS"      value="12 / 12"          color={N.BRAND_VIV} />
        <StatRow label="QUEUE"       value="3.2k"             color={N.TEXT_0}    />
      </div>
    </Tile>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "2px 0",
      borderBottom: `1px solid ${N.BORDER}`,
    }}>
      <span style={{
        fontSize: 8.5, fontWeight: 800, letterSpacing: "0.18em",
        color: N.TEXT_2,
      }}>{label}</span>
      <span style={{
        fontSize: 11.5, fontWeight: 800, fontVariantNumeric: "tabular-nums",
        color, textShadow: `0 0 3px ${color}70`,
        transition: "color 600ms ease",
      }}>{value}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. SENTIMENT
 * ──────────────────────────────────────────────────────────────────────── */

function SentimentTile() {
  const gradId = useId();
  return (
    <Tile label="SENTIMENT" sub="X-ASSET">
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", justifyContent: "center", flex: 1, alignItems: "center" }}>
          <svg
            width="100%" height="100%" viewBox="0 0 150 95"
            role="img" aria-label="Cross-asset sentiment meter"
            preserveAspectRatio="xMidYMid meet"
            style={{ maxHeight: 90 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={N.SHORT} />
                <stop offset="50%"  stopColor={N.WARN} />
                <stop offset="100%" stopColor={N.LONG} />
              </linearGradient>
            </defs>
            <path d="M 18 78 A 57 57 0 0 1 132 78"
              fill="none" stroke={`url(#${gradId})`} strokeWidth={8} strokeLinecap="round" opacity={0.85} />
            <g style={{
              transformOrigin: "75px 78px",
              animation: "warroom-needle 6s ease-in-out infinite",
            }}>
              <line x1={75} y1={78} x2={75} y2={28} stroke={N.TEXT_0} strokeWidth={2} strokeLinecap="round" />
              <circle cx={75} cy={78} r={4} fill={N.BRAND} stroke={N.TEXT_0} strokeWidth={1} />
            </g>
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <StatRow label="CRYPTO"    value="BULL 68"  color={N.LONG}  />
          <StatRow label="EQUITY"    value="NEUTRAL"  color={N.WARN}  />
          <StatRow label="COMPOSITE" value="62"       color={N.BRAND} />
        </div>
      </div>
    </Tile>
  );
}

/* ── Public component ──────────────────────────────────────────────────── */

export function AIWarRoom() {
  return (
    <section
      className="warroom-anim"
      style={{
        background:   N.BG,
        borderTop:    `1px solid ${N.BORDER}`,
        borderBottom: `1px solid ${N.BORDER}`,
        fontFamily:   N.FONT_MONO,
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Header bar */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: `1px solid ${N.BORDER}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: N.BRAND,
            boxShadow: `0 0 5px ${N.BRAND}, 0 0 12px ${N.BRAND}50`,
            animation: "warroom-pulse 3s infinite",
          }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: N.TEXT_0 }}>
            AI INTELLIGENCE CENTER
          </span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", color: N.TEXT_3 }}>
            · LIVE TELEMETRY · MULTI-SYSTEM
          </span>
        </div>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.18em", color: N.TEXT_2 }}>
          SCANNING · RANKING · EXECUTING
        </span>
      </div>

      {/* Telemetry strip — six identical 1:1 square tiles, centered.
          The inner row uses `margin: 0 auto` so it sits dead-centre on wide
          viewports while still scrolling horizontally on narrow ones. */}
      <div
        style={{
          padding: 12,
          overflowX: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            gap: 12,
            margin: "0 auto",
            width: "fit-content",
            minWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <ConfidenceCore />
          <RadarTile />
          <SignalPipeline />
          <RiskExposure />
          <AIThroughput />
          <SentimentTile />
        </div>
      </div>
    </section>
  );
}
