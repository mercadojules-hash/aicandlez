/**
 * AI Intelligence Center — cinematic top-of-portal telemetry row.
 *
 * Layout principle (locked):
 *   • AI CONFIDENCE first (largest, 1:1 square — the centrepiece "AI brain")
 *   • AI RADAR second (1:1 square — the multi-asset scan)
 *   • Four supporting 1:1 telemetry squares (Signal Pipeline, Risk Exposure,
 *     AI Throughput, Sentiment) — every value is derived from a plausible
 *     internal state so the surface reads as real quant telemetry, never
 *     decorative motion.
 *
 * All animations honor `prefers-reduced-motion` via the `.warroom-anim`
 * class on the outer section.
 */

import { useEffect, useId, useState } from "react";
import { N } from "./theme";

/* ── shared inline keyframes ───────────────────────────────────────────── */
const KEYFRAMES = `
@keyframes warroom-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes warroom-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 0.95; } }
@keyframes warroom-arc-glow { 0%,100% { filter: drop-shadow(0 0 3px ${N.BRAND}70); } 50% { filter: drop-shadow(0 0 7px ${N.BRAND}aa); } }
@keyframes warroom-needle { 0%,100% { transform: rotate(-22deg); } 50% { transform: rotate(20deg); } }
@keyframes warroom-blip { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.2); opacity: 1; } }
@keyframes warroom-stage-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
@keyframes warroom-bar-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes warroom-tick { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
@keyframes warroom-stat-flicker { 0%,90%,100% { opacity: 1; } 92% { opacity: 0.6; } 95% { opacity: 0.95; } }

@media (prefers-reduced-motion: reduce) {
  .warroom-anim, .warroom-anim * { animation: none !important; transition: none !important; }
}
`;

/* ── Generic Tile ──────────────────────────────────────────────────────── */

interface TileProps {
  label:   string;
  sub?:    string;
  size:    number;
  accent?: string;
  children: React.ReactNode;
}

function Tile({ label, sub, size, accent = N.BRAND, children }: TileProps) {
  return (
    <div
      style={{
        background:   N.SURFACE_1,
        border:       `1px solid ${N.BORDER}`,
        borderRadius: 6,
        width:        size,
        height:       size,
        flex:         `0 0 ${size}px`,
        overflow:     "hidden",
        fontFamily:   N.FONT_MONO,
        display:      "flex",
        flexDirection: "column",
        position:     "relative",
      }}
    >
      <div
        style={{
          padding:      "7px 10px",
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
      <div style={{ flex: 1, padding: 10, position: "relative", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. AI CONFIDENCE  — centrepiece, largest tile
 * ──────────────────────────────────────────────────────────────────────── */

function ConfidenceCore({ size }: { size: number }) {
  const [pct, setPct] = useState(78);
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const next = p + (Math.random() - 0.42) * 3.5;
        return Math.max(62, Math.min(92, next));
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Subsystem bars (deterministic-ish based on pct) so the surface
  // reads as "the AI is broken into ranking components".
  const sub = [
    { label: "TREND",     val: Math.min(96, pct + 8) },
    { label: "MOMENTUM",  val: Math.max(40, pct - 6) },
    { label: "VOLUME",    val: Math.min(94, pct + 2) },
    { label: "SENTIMENT", val: Math.max(48, pct - 12) },
  ];

  const r    = 70;
  const c    = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const dim  = size;

  return (
    <Tile label="AI CONFIDENCE" sub="ROLLING · 5M" size={size}>
      <div style={{
        position: "absolute", inset: 36, display: "flex", flexDirection: "column",
      }}>
        {/* Radial dial */}
        <div style={{ position: "relative", display: "flex", justifyContent: "center", flex: 1, minHeight: 0 }}>
          <svg
            width={dim * 0.62} height={dim * 0.62} viewBox="0 0 180 180"
            role="img" aria-label={`AI confidence ${Math.round(pct)} percent`}
            style={{ display: "block" }}
          >
            <circle cx={90} cy={90} r={r} fill="none" stroke={N.BORDER_HI} strokeWidth={6} />
            <circle
              cx={90} cy={90} r={r}
              fill="none"
              stroke={N.BRAND}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              transform="rotate(-90 90 90)"
              style={{
                transition: "stroke-dasharray 900ms ease",
                animation: "warroom-arc-glow 2.6s ease-in-out infinite",
              }}
            />
            {/* outer faint tick ring */}
            {Array.from({ length: 36 }).map((_, i) => {
              const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
              const r1 = 84, r2 = 88;
              return (
                <line
                  key={i}
                  x1={90 + Math.cos(a) * r1} y1={90 + Math.sin(a) * r1}
                  x2={90 + Math.cos(a) * r2} y2={90 + Math.sin(a) * r2}
                  stroke={i % 9 === 0 ? N.BRAND : N.BORDER_HI}
                  strokeWidth={i % 9 === 0 ? 1.4 : 0.7}
                  strokeOpacity={i % 9 === 0 ? 0.9 : 0.55}
                />
              );
            })}
            <text x={90} y={87} textAnchor="middle" fontSize={42} fontWeight={800}
              fill={N.TEXT_0} fontFamily={N.FONT_MONO} style={{ letterSpacing: "0.02em" }}>
              {Math.round(pct)}
            </text>
            <text x={90} y={106} textAnchor="middle" fontSize={9.5}
              fill={N.BRAND} fontFamily={N.FONT_MONO}
              style={{ letterSpacing: "0.24em", fontWeight: 800 }}>
              {pct >= 80 ? "CONVICTION" : pct >= 70 ? "STRONG" : "BUILDING"}
            </text>
          </svg>
        </div>
        {/* Subsystem bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {sub.map((s) => (
            <SubBar key={s.label} label={s.label} val={s.val} />
          ))}
        </div>
      </div>
    </Tile>
  );
}

function SubBar({ label, val }: { label: string; val: number }) {
  const color = val >= 75 ? N.BRAND : val >= 60 ? N.BRAND_DEEP : N.WARN;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        fontSize: 7.5, fontWeight: 700, letterSpacing: "0.14em",
        color: N.TEXT_2, width: 64, flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 4, background: N.SURFACE_3,
        border: `1px solid ${N.BORDER_HI}`, borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          width: `${val}%`, height: "100%",
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          boxShadow: `0 0 6px ${color}80`,
          transition: "width 800ms ease",
        }} />
      </div>
      <span style={{
        fontSize: 8.5, fontWeight: 800,
        color, fontVariantNumeric: "tabular-nums",
        width: 22, textAlign: "right", flexShrink: 0,
      }}>
        {Math.round(val)}
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. AI RADAR
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

function RadarTile({ size }: { size: number }) {
  const sweepId = useId();
  const cx = size / 2;
  const cy = size / 2 + 6;
  const R  = size / 2 - 26;

  return (
    <Tile label="AI RADAR" sub="MULTI-ASSET · 360°" size={size}>
      <svg
        width="100%" height="100%" viewBox={`0 0 ${size} ${size - 28}`}
        role="img" aria-label="AI radar scanner showing multi-asset blips"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
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
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke={N.BORDER_HI} strokeWidth={0.5} />
        <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke={N.BORDER_HI} strokeWidth={0.5} />

        <g style={{
          transformOrigin: `${cx}px ${cy}px`,
          animation: "warroom-sweep 5.5s linear infinite",
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

        <circle cx={cx} cy={cy} r={5} fill={N.BRAND} opacity={0.9}
          style={{ animation: "warroom-pulse 2.2s infinite", transformOrigin: `${cx}px ${cy}px` }} />
        <circle cx={cx} cy={cy} r={2} fill={N.TEXT_0} />

        {BLIPS.map((b, i) => {
          const rad = (b.angle * Math.PI) / 180;
          const x = cx + R * b.r * Math.cos(rad);
          const y = cy + R * b.r * Math.sin(rad);
          return (
            <g key={i}>
              <circle
                cx={x} cy={y} r={3.2}
                fill={b.color}
                style={{
                  animation: `warroom-blip 2.6s ${i * 0.3}s infinite`,
                  transformOrigin: `${x}px ${y}px`,
                  filter: `drop-shadow(0 0 4px ${b.color})`,
                }}
              />
              <text
                x={x + 6} y={y + 3}
                fontSize={7.5}
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
      <div style={{
        position: "absolute", left: 10, right: 10, bottom: 8,
        display: "flex", justifyContent: "space-between",
        fontSize: 8, letterSpacing: "0.18em", fontWeight: 800,
      }}>
        <span style={{ color: N.TEXT_2 }}>SCAN · 360°</span>
        <span style={{ color: N.BRAND }}>{BLIPS.length} TGT</span>
      </div>
    </Tile>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. SIGNAL PIPELINE — institutional funnel readout
 * ──────────────────────────────────────────────────────────────────────── */

function SignalPipeline({ size }: { size: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1400);
    return () => clearInterval(id);
  }, []);

  // Counts walk gently within plausible institutional bands
  const noise = (base: number, amp: number, i: number) =>
    Math.round(base + Math.sin(tick * 0.6 + i) * amp);
  const stages = [
    { label: "SCAN",     n: noise(847, 24, 0), color: N.BRAND     },
    { label: "RANK",     n: noise(312, 12, 1), color: N.BRAND_BRT },
    { label: "VALIDATE", n: noise( 58,  4, 2), color: N.BRAND_DEEP},
    { label: "EXECUTE",  n: noise( 12,  2, 3), color: N.BRAND_VIV },
  ];
  const max = stages[0].n;

  return (
    <Tile label="SIGNAL PIPELINE" sub="FUNNEL" size={size}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
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
                  boxShadow: `0 0 6px ${s.color}90`,
                  transition: "width 900ms ease",
                }} />
                <div style={{
                  position: "absolute", top: 0, bottom: 0, left: 0,
                  width: `${w}%`, pointerEvents: "none",
                  animation: `warroom-stage-pulse ${2 + i * 0.18}s ease-in-out infinite`,
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
 * 4. RISK EXPOSURE — per-asset allocation
 * ──────────────────────────────────────────────────────────────────────── */

const EXPOSURE = [
  { sym: "BTC",  pct: 28, side: "LONG"  as const },
  { sym: "ETH",  pct: 19, side: "LONG"  as const },
  { sym: "SOL",  pct: 14, side: "LONG"  as const },
  { sym: "NVDA", pct: 11, side: "LONG"  as const },
  { sym: "SPY",  pct:  9, side: "SHORT" as const },
  { sym: "AVAX", pct:  7, side: "LONG"  as const },
];

function RiskExposure({ size }: { size: number }) {
  return (
    <Tile label="RISK EXPOSURE" sub="NET · 88%" size={size}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
        {EXPOSURE.map((e) => {
          const color = e.side === "LONG" ? N.LONG : N.SHORT;
          return (
            <div key={e.sym} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 38, fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
                color: N.TEXT_0, flexShrink: 0,
              }}>{e.sym}</span>
              <span style={{
                width: 30, fontSize: 7, fontWeight: 800, letterSpacing: "0.16em",
                color, flexShrink: 0,
              }}>{e.side}</span>
              <div style={{
                flex: 1, height: 6,
                background: N.SURFACE_3,
                border: `1px solid ${N.BORDER_HI}`,
                borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${e.pct * 3.2}%`,
                  maxWidth: "100%",
                  background: `linear-gradient(90deg, ${color}, ${color}80)`,
                  boxShadow: `0 0 5px ${color}70`,
                  transformOrigin: "left",
                  animation: "warroom-bar-fill 1.2s ease-out",
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
 * 5. AI THROUGHPUT — numerical system status
 * ──────────────────────────────────────────────────────────────────────── */

function AIThroughput({ size }: { size: number }) {
  const [sigs, setSigs] = useState(847);
  const [latency, setLatency] = useState(14);
  useEffect(() => {
    const id = setInterval(() => {
      setSigs((n) => Math.max(800, Math.min(890, n + Math.round((Math.random() - 0.5) * 12))));
      setLatency((n) => Math.max(11, Math.min(22, n + Math.round((Math.random() - 0.5) * 2))));
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <Tile label="AI THROUGHPUT" sub="LIVE STACK" size={size}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <StatRow label="SIGS / HR"   value={sigs.toString()}        color={N.BRAND}      pulse />
        <StatRow label="LATENCY"     value={`${latency} ms`}        color={N.BRAND_BRT}  pulse />
        <StatRow label="UPTIME"      value="99.97%"                  color={N.LONG} />
        <StatRow label="MODELS LIVE" value="12 / 12"                 color={N.BRAND_VIV} />
        <StatRow label="QUEUE DEPTH" value="3.2k"                    color={N.TEXT_0} />
      </div>
    </Tile>
  );
}

function StatRow({
  label, value, color, pulse = false,
}: { label: string; value: string; color: string; pulse?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "3px 0",
      borderBottom: `1px solid ${N.BORDER}`,
    }}>
      <span style={{
        fontSize: 8.5, fontWeight: 800, letterSpacing: "0.18em",
        color: N.TEXT_2,
      }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums",
        color, textShadow: `0 0 5px ${color}70`,
        animation: pulse ? "warroom-stat-flicker 4s steps(1) infinite" : "none",
      }}>{value}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. SENTIMENT — refined semicircle gauge
 * ──────────────────────────────────────────────────────────────────────── */

function SentimentTile({ size }: { size: number }) {
  const gradId = useId();
  // Pretend score we can also render textually so the widget feels measured.
  const score = 62;
  return (
    <Tile label="SENTIMENT" sub="X-ASSET" size={size}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <svg
          width="100%" height="60%" viewBox="0 0 150 100"
          role="img" aria-label="Cross-asset sentiment meter"
          preserveAspectRatio="xMidYMid meet"
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
        <div style={{
          marginTop: "auto", display: "flex", flexDirection: "column", gap: 4,
        }}>
          <StatRow label="CRYPTO"  value="BULL · 68" color={N.LONG} />
          <StatRow label="EQUITY"  value="NEUTRAL"   color={N.WARN} />
          <StatRow label="COMPOSITE" value={`${score}`} color={N.BRAND} />
        </div>
      </div>
    </Tile>
  );
}

/* ── Public component ──────────────────────────────────────────────────── */

export function AIWarRoom() {
  // Centrepiece is +40px on each side; everything else is a strict square.
  const SMALL = 200;
  const LARGE = 240;

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
            boxShadow: `0 0 8px ${N.BRAND}, 0 0 18px ${N.BRAND}50`,
            animation: "warroom-pulse 1.4s infinite",
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

      {/* Telemetry strip — every tile a 1:1 square */}
      <div
        style={{
          padding: 12,
          display: "flex",
          alignItems: "stretch",
          gap: 12,
          overflowX: "auto",
        }}
      >
        <ConfidenceCore size={LARGE} />
        <RadarTile      size={LARGE} />
        <SignalPipeline size={SMALL} />
        <RiskExposure   size={SMALL} />
        <AIThroughput   size={SMALL} />
        <SentimentTile  size={SMALL} />
      </div>
    </section>
  );
}
