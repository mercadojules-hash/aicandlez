/**
 * AI Intelligence Center — cinematic top-of-portal telemetry row.
 *
 * Layout: radar scanner (left) + a horizontal strip of diverse institutional
 * micro-visualizations. Lightweight pure-SVG + CSS-keyframe animations, no
 * external chart libs. Designed to read as a Bloomberg × hedge-fund AI
 * command surface — never arcade-like.
 *
 * Tiles:
 *   • RadarScanner       — concentric rings + rotating sweep + asset blips
 *   • ConfidenceDial     — radial AI confidence ring (animated arc + center value)
 *   • SentimentMeter     — semicircle gauge with needle
 *   • VolatilityGauge    — vertical column with breathing band
 *   • HeatmapMini        — 6×4 grid of intensity cells
 *   • MomentumOsc        — sine-wave oscillator sparkline
 *   • OrderFlowPulse     — bid/ask bar columns
 */

import { useEffect, useId, useState } from "react";
import { N } from "./theme";

/* ── shared inline keyframes (scoped via unique class names) ───────────── */
// Slower, lower-amplitude motion + a prefers-reduced-motion guard that
// collapses everything to its rest state — institutional aesthetic over
// arcade motion.
const KEYFRAMES = `
@keyframes warroom-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes warroom-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 0.95; } }
@keyframes warroom-pulse-soft { 0%,100% { opacity: 0.6; } 50% { opacity: 0.9; } }
@keyframes warroom-bar-breathe { 0%,100% { transform: scaleY(0.7); } 50% { transform: scaleY(1); } }
@keyframes warroom-arc-glow { 0%,100% { filter: drop-shadow(0 0 3px ${N.BRAND}70); } 50% { filter: drop-shadow(0 0 6px ${N.BRAND}90); } }
@keyframes warroom-needle { 0%,100% { transform: rotate(-22deg); } 50% { transform: rotate(20deg); } }
@keyframes warroom-cell-flicker { 0%,100% { opacity: var(--base); } 50% { opacity: calc(var(--base) + 0.22); } }
@keyframes warroom-osc-drift { from { transform: translateX(0); } to { transform: translateX(-40px); } }
@keyframes warroom-blip { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.2); opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .warroom-anim, .warroom-anim * { animation: none !important; transition: none !important; }
}
`;

/* ─────────────────────────────────────────────────────────────────────── */

interface TileProps {
  label:  string;
  sub?:   string;
  children: React.ReactNode;
  width?:   number;
  accent?:  string;
}

function Tile({ label, sub, children, width = 168, accent = N.BRAND }: TileProps) {
  return (
    <div
      style={{
        background:   N.SURFACE_1,
        border:       `1px solid ${N.BORDER}`,
        borderRadius: 6,
        width,
        flex:         `0 0 ${width}px`,
        overflow:     "hidden",
        fontFamily:   N.FONT_MONO,
        position:     "relative",
      }}
    >
      <div
        style={{
          padding:    "6px 10px",
          borderBottom: `1px solid ${N.BORDER}`,
          background: `linear-gradient(180deg, ${accent}10 0%, ${N.BG} 100%)`,
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.20em", color: N.TEXT_0 }}>
          {label}
        </span>
        {sub && (
          <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.16em", color: N.TEXT_3 }}>
            {sub}
          </span>
        )}
      </div>
      <div style={{ padding: 8, height: 140, position: "relative" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Radar Scanner ─────────────────────────────────────────────────────── */

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

function RadarScanner() {
  const size = 220;
  const cx   = size / 2;
  const cy   = size / 2;
  const R    = size / 2 - 8;
  const sweepId = useId();

  return (
    <div
      style={{
        background:   N.SURFACE_1,
        border:       `1px solid ${N.BORDER}`,
        borderRadius: 6,
        width:        size + 24,
        flex:         `0 0 ${size + 24}px`,
        padding:      12,
        position:     "relative",
        fontFamily:   N.FONT_MONO,
        overflow:     "hidden",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: N.BRAND,
              boxShadow: `0 0 8px ${N.BRAND}, 0 0 18px ${N.BRAND}80`,
              animation: "warroom-pulse 1.4s infinite",
            }}
          />
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", color: N.TEXT_0 }}>
            AI RADAR
          </span>
        </div>
        <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.18em", color: N.TEXT_3 }}>
          MULTI-ASSET · LIVE
        </span>
      </div>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        role="img" aria-label="AI radar scanner showing multi-asset blips"
        style={{ display: "block" }}>
        {/* concentric rings */}
        {[0.28, 0.5, 0.74, 1].map((f, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={R * f}
            fill="none"
            stroke={i === 3 ? N.BRAND : N.BORDER_HI}
            strokeOpacity={i === 3 ? 0.55 : 0.45}
            strokeWidth={i === 3 ? 1 : 0.6}
          />
        ))}
        {/* cross hairs */}
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke={N.BORDER_HI} strokeWidth={0.5} />
        <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke={N.BORDER_HI} strokeWidth={0.5} />

        {/* rotating sweep */}
        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: "warroom-sweep 5.5s linear infinite",
          }}
        >
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

        {/* center medallion */}
        <circle cx={cx} cy={cy} r={5} fill={N.BRAND} opacity={0.9}
          style={{ animation: "warroom-pulse 2.2s infinite", transformOrigin: `${cx}px ${cy}px` }} />
        <circle cx={cx} cy={cy} r={2} fill={N.TEXT_0} />

        {/* asset blips */}
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
                fontSize={7}
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
        display: "flex", justifyContent: "space-between",
        marginTop: 6, fontSize: 7.5, letterSpacing: "0.16em",
        color: N.TEXT_2, fontWeight: 700,
      }}>
        <span>SCAN · 360°</span>
        <span style={{ color: N.BRAND }}>{BLIPS.length} TGT</span>
      </div>
    </div>
  );
}

/* ── Confidence radial dial ────────────────────────────────────────────── */

function ConfidenceDial() {
  const [pct, setPct] = useState(74);
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const next = p + (Math.random() - 0.4) * 4;
        return Math.max(58, Math.min(92, next));
      });
    }, 1800);
    return () => clearInterval(id);
  }, []);
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <Tile label="AI CONFIDENCE" sub="ROLLING">
      <svg width={120} height={120} viewBox="0 0 120 120" style={{ display: "block", margin: "0 auto" }}>
        <circle cx={60} cy={60} r={r} fill="none" stroke={N.BORDER_HI} strokeWidth={6} />
        <circle
          cx={60} cy={60} r={r}
          fill="none"
          stroke={N.BRAND}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 60 60)"
          style={{
            transition: "stroke-dasharray 800ms ease",
            animation: "warroom-arc-glow 2.4s ease-in-out infinite",
          }}
        />
        <text x={60} y={58} textAnchor="middle" fontSize={22} fontWeight={800}
          fill={N.TEXT_0} fontFamily={N.FONT_MONO} style={{ letterSpacing: "0.02em" }}>
          {Math.round(pct)}
        </text>
        <text x={60} y={74} textAnchor="middle" fontSize={9}
          fill={N.BRAND} fontFamily={N.FONT_MONO} style={{ letterSpacing: "0.18em", fontWeight: 700 }}>
          STRONG
        </text>
      </svg>
    </Tile>
  );
}

/* ── Sentiment semicircle meter ────────────────────────────────────────── */

function SentimentMeter() {
  const gradId = useId();
  return (
    <Tile label="SENTIMENT" sub="X-ASSET">
      <svg width={150} height={120} viewBox="0 0 150 120"
        role="img" aria-label="Cross-asset sentiment meter"
        style={{ display: "block", margin: "0 auto" }}>
        {/* gradient arc */}
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={N.SHORT} />
            <stop offset="50%"  stopColor={N.WARN} />
            <stop offset="100%" stopColor={N.LONG} />
          </linearGradient>
        </defs>
        <path d="M 18 88 A 57 57 0 0 1 132 88"
          fill="none" stroke={`url(#${gradId})`} strokeWidth={9} strokeLinecap="round" opacity={0.8} />
        <path d="M 18 88 A 57 57 0 0 1 132 88"
          fill="none" stroke={N.BORDER_HI} strokeWidth={1} />
        {/* needle */}
        <g style={{
          transformOrigin: "75px 88px",
          animation: "warroom-needle 6s ease-in-out infinite",
        }}>
          <line x1={75} y1={88} x2={75} y2={36} stroke={N.TEXT_0} strokeWidth={2} strokeLinecap="round" />
          <circle cx={75} cy={88} r={4} fill={N.BRAND} stroke={N.TEXT_0} strokeWidth={1} />
        </g>
        {/* labels */}
        <text x={18} y={108} fontSize={8} fill={N.SHORT} fontFamily={N.FONT_MONO}
          style={{ letterSpacing: "0.14em", fontWeight: 700 }}>BEAR</text>
        <text x={62} y={108} fontSize={8} fill={N.WARN} fontFamily={N.FONT_MONO}
          style={{ letterSpacing: "0.14em", fontWeight: 700 }}>NEUTRAL</text>
        <text x={118} y={108} fontSize={8} fill={N.LONG} fontFamily={N.FONT_MONO}
          style={{ letterSpacing: "0.14em", fontWeight: 700 }}>BULL</text>
      </svg>
    </Tile>
  );
}

/* ── Volatility breathing column ───────────────────────────────────────── */

function VolatilityGauge() {
  const bars = 5;
  return (
    <Tile label="VOLATILITY" sub="15M ATR" width={130}>
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        gap: 6, height: "100%", paddingBottom: 6,
      }}>
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: `${30 + i * 14}%`,
              background: `linear-gradient(180deg, ${N.BRAND} 0%, ${N.BRAND_DEEP} 100%)`,
              opacity: 0.85,
              borderRadius: 2,
              boxShadow: `0 0 6px ${N.BRAND}60`,
              transformOrigin: "bottom",
              animation: `warroom-bar-breathe ${1.6 + i * 0.18}s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
      </div>
      <div style={{
        position: "absolute", left: 8, right: 8, bottom: 6,
        fontSize: 8, color: N.BRAND, fontWeight: 800, letterSpacing: "0.20em",
        textAlign: "center",
      }}>
        ELEVATED · 2.4σ
      </div>
    </Tile>
  );
}

/* ── Mini heatmap ──────────────────────────────────────────────────────── */

function HeatmapMini() {
  const cols = 8;
  const rows = 5;
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    // Deterministic pseudo-random — same on every render
    const v = (Math.sin(i * 9.713 + 1.31) + 1) / 2;
    return v;
  });
  return (
    <Tile label="ASSET HEAT" sub={`${cols * rows} CELLS`} width={172}>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 3,
        height: "100%",
      }}>
        {cells.map((v, i) => {
          const isLong = v > 0.55;
          const intensity = Math.abs(v - 0.5) * 2;
          const color = isLong ? N.LONG : N.SHORT;
          return (
            <div
              key={i}
              style={{
                background: color,
                opacity: 0.18 + intensity * 0.65,
                borderRadius: 1.5,
                ["--base" as never]: 0.18 + intensity * 0.55,
                animation: `warroom-cell-flicker ${2.6 + (i % 5) * 0.4}s ease-in-out ${(i % 7) * 0.18}s infinite`,
              }}
            />
          );
        })}
      </div>
    </Tile>
  );
}

/* ── Momentum oscillator sparkline ─────────────────────────────────────── */

function MomentumOsc() {
  // sine + a smaller harmonic, sampled to form a wide path that drifts left
  const pts: string[] = [];
  const W = 240; const H = 100;
  for (let i = 0; i <= 48; i++) {
    const x = (i / 48) * W;
    const t = i / 48;
    const y = H / 2 + Math.sin(t * Math.PI * 4) * 22 + Math.sin(t * Math.PI * 9 + 1) * 8;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const d = `M ${pts.join(" L ")}`;
  return (
    <Tile label="MOMENTUM" sub="OSC · 14P" width={172}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W / 2} ${H}`} preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}>
        <line x1={0} y1={H / 2} x2={W / 2} y2={H / 2} stroke={N.BORDER_HI} strokeWidth={0.5} strokeDasharray="2,3" />
        <g style={{ animation: "warroom-osc-drift 6s linear infinite" }}>
          <path d={d}
            fill="none"
            stroke={N.BRAND}
            strokeWidth={1.4}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${N.BRAND}80)` }}
          />
        </g>
        <text x={4} y={11} fontSize={7.5} fill={N.TEXT_3} fontFamily={N.FONT_MONO}
          style={{ letterSpacing: "0.18em", fontWeight: 700 }}>+1σ</text>
        <text x={4} y={H - 3} fontSize={7.5} fill={N.TEXT_3} fontFamily={N.FONT_MONO}
          style={{ letterSpacing: "0.18em", fontWeight: 700 }}>−1σ</text>
      </svg>
    </Tile>
  );
}

/* ── Order-flow pulse ──────────────────────────────────────────────────── */

function OrderFlowPulse() {
  const bars = 14;
  return (
    <Tile label="ORDER FLOW" sub="BID · ASK" width={156}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 2, height: "100%",
      }}>
        {Array.from({ length: bars }).map((_, i) => {
          const seed = Math.sin(i * 7.317) * 0.5 + 0.5;
          const bid = 24 + seed * 38;
          const ask = 24 + (1 - seed) * 38;
          return (
            <div key={i} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              height: "100%", justifyContent: "center",
            }}>
              <div style={{
                width: 4, height: bid,
                background: N.LONG, opacity: 0.85,
                boxShadow: `0 0 4px ${N.LONG_GLOW}`,
                animation: `warroom-pulse-soft ${1.8 + (i % 4) * 0.22}s ease-in-out ${i * 0.06}s infinite`,
              }} />
              <div style={{ width: 4, height: 1, background: N.BORDER_HI }} />
              <div style={{
                width: 4, height: ask,
                background: N.SHORT, opacity: 0.85,
                boxShadow: `0 0 4px ${N.SHORT_GLOW}`,
                animation: `warroom-pulse-soft ${1.8 + (i % 5) * 0.2}s ease-in-out ${i * 0.07 + 0.4}s infinite`,
              }} />
            </div>
          );
        })}
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

      {/* Telemetry strip */}
      <div
        style={{
          padding: 10,
          display: "flex",
          alignItems: "stretch",
          gap: 10,
          overflowX: "auto",
        }}
      >
        <RadarScanner />
        <ConfidenceDial />
        <SentimentMeter />
        <VolatilityGauge />
        <HeatmapMini />
        <MomentumOsc />
        <OrderFlowPulse />
      </div>
    </section>
  );
}
