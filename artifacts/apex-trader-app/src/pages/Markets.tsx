import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SignalBreakdown } from "@/lib/api";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "#00ff88";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#3a3f5c";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

const ACTION_COLOR: Record<string, string> = {
  BUY:  "rgba(0,210,100,0.82)",
  SELL: "rgba(230,70,70,0.82)",
  HOLD: "rgba(0,185,215,0.70)",
};
const ACTION_BG: Record<string, string> = {
  BUY:  "rgba(0,210,100,0.07)",
  SELL: "rgba(230,70,70,0.07)",
  HOLD: "rgba(0,185,215,0.06)",
};
const ACTION_BORDER: Record<string, string> = {
  BUY:  "rgba(0,210,100,0.22)",
  SELL: "rgba(230,70,70,0.22)",
  HOLD: "rgba(0,185,215,0.18)",
};

// ── Bezier sparkline ────────────────────────────────────────────────────────────
function seededPts(seed: string, action: string): number[] {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0;
  const rand = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  const trend = action === "BUY" ? 1.1 : action === "SELL" ? -1.1 : 0.05;
  const pts: number[] = [];
  let v = 48;
  for (let i = 0; i < 20; i++) {
    v = Math.max(8, Math.min(92, v + (rand() - 0.5) * 13 + trend));
    pts.push(v);
  }
  return pts;
}

function bezierPath(pts: number[], w: number, h: number): string {
  if (pts.length < 2) return "";
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const pad = h * 0.08;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(p => h - pad - ((p - min) / range) * (h - pad * 2));
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = ((xs[i - 1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cx} ${ys[i-1].toFixed(1)} ${cx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return d;
}

function MiniSpark({ sym, action, w = 72, h = 28 }: { sym: string; action: string; w?: number; h?: number }) {
  const pts = seededPts(sym, action);
  const d   = bezierPath(pts, w, h);
  const col = ACTION_COLOR[action] ?? GR;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow: "visible", flexShrink: 0 }}>
      <path d={d} fill="none" stroke={col} strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Extended mock market data ────────────────────────────────────────────────────
type AssetMeta = { price: string; change: string; vol: string; action: string; confidence: number; volConf: boolean };
const MOCK_ASSETS: Record<string, AssetMeta> = {
  BNBUSD:   { price:"$594.20",  change:"-1.23%", vol:"$86B",  action:"SELL", confidence:63, volConf:true  },
  XRPUSD:   { price:"$0.6240",  change:"+3.12%", vol:"$35B",  action:"BUY",  confidence:71, volConf:true  },
  ADAUSD:   { price:"$0.4510",  change:"+1.45%", vol:"$12B",  action:"BUY",  confidence:54, volConf:false },
  AVAXUSD:  { price:"$37.80",   change:"+4.21%", vol:"$28B",  action:"BUY",  confidence:74, volConf:true  },
  DOTUSD:   { price:"$8.92",    change:"-0.88%", vol:"$15B",  action:"HOLD", confidence:49, volConf:false },
  LINKUSD:  { price:"$17.45",   change:"+2.55%", vol:"$22B",  action:"BUY",  confidence:68, volConf:true  },
  MATICUSD: { price:"$0.8810",  change:"+1.78%", vol:"$18B",  action:"BUY",  confidence:61, volConf:true  },
  DOGEUSD:  { price:"$0.1430",  change:"-2.11%", vol:"$31B",  action:"SELL", confidence:66, volConf:true  },
  LTCUSD:   { price:"$89.20",   change:"+0.94%", vol:"$12B",  action:"HOLD", confidence:52, volConf:false },
  ATOMUSD:  { price:"$9.74",    change:"-1.55%", vol:"$9B",   action:"SELL", confidence:58, volConf:true  },
  UNIUSD:   { price:"$10.85",   change:"+3.88%", vol:"$14B",  action:"BUY",  confidence:67, volConf:true  },
  AAVEUSD:  { price:"$98.40",   change:"-0.62%", vol:"$8B",   action:"HOLD", confidence:51, volConf:false },
  INJUSD:   { price:"$32.20",   change:"+5.44%", vol:"$11B",  action:"BUY",  confidence:76, volConf:true  },
  NEARUSD:  { price:"$7.18",    change:"+2.94%", vol:"$10B",  action:"BUY",  confidence:65, volConf:true  },
  FILUSD:   { price:"$6.84",    change:"-1.98%", vol:"$7B",   action:"SELL", confidence:60, volConf:true  },
};

const LIVE_META: Record<string, Partial<AssetMeta>> = {
  BTCUSD: { price:"$68,450", change:"+2.34%", vol:"$132B" },
  ETHUSD: { price:"$3,524",  change:"+1.87%", vol:"$421B" },
  SOLUSD: { price:"$188.40", change:"-0.42%", vol:"$84B"  },
};

type Filter = "ALL" | "BUY" | "SELL" | "HIGH_CONF";

// ── Compact asset row ────────────────────────────────────────────────────────────
function AssetRow({ sym, bd, meta }: { sym: string; bd: SignalBreakdown; meta: Partial<AssetMeta> }) {
  const action  = bd.action;
  const col     = ACTION_COLOR[action] ?? GR;
  const chUp    = (meta.change ?? "").startsWith("+");
  const chCol   = chUp ? "rgba(0,210,100,0.82)" : "rgba(230,70,70,0.80)";
  const label   = sym.replace("USD", "");
  const confPct = bd.confidence;

  return (
    <div style={{ background: CARD, borderRadius: 11, overflow: "hidden",
      border: `1px solid ${ACTION_BORDER[action] ?? E}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>

        {/* Col 1 — Symbol + volume */}
        <div style={{ width: 52, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: W,
            letterSpacing: "-0.01em" }}>{label}</div>
          <div style={{ fontSize: 7, fontFamily: SANS, color: DIM, marginTop: 2 }}>
            {meta.vol ?? "—"}
          </div>
        </div>

        {/* Col 2 — Price + change */}
        <div style={{ width: 76, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 600, color: W }}>
            {meta.price ?? "—"}
          </div>
          <div style={{ fontSize: 9, fontFamily: MONO, fontWeight: 500,
            color: chCol, marginTop: 2 }}>
            {meta.change ?? ""}
          </div>
        </div>

        {/* Col 3 — Sparkline (flex fills remaining space) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center",
          alignItems: "center", opacity: 0.80 }}>
          <MiniSpark sym={sym} action={action}/>
        </div>

        {/* Col 4 — Action badge + confidence */}
        <div style={{ flexShrink: 0, textAlign: "right", minWidth: 60 }}>
          <div style={{ display: "inline-block", padding: "2px 9px",
            background: ACTION_BG[action],
            border: `1px solid ${ACTION_BORDER[action] ?? E}`,
            borderRadius: 4,
            fontSize: 8, fontFamily: SANS, fontWeight: 700,
            color: col, letterSpacing: "0.07em" }}>
            {action}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end",
            gap: 5, marginTop: 4 }}>
            {bd.volumeConfirmed && (
              <span style={{ fontSize: 7, fontFamily: SANS, color: "rgba(0,210,100,0.65)",
                letterSpacing: "0.05em" }}>VOL✓</span>
            )}
            <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, color: col }}>
              {confPct}%
            </span>
          </div>
        </div>
      </div>

      {/* Confidence bar — 2px strip at card bottom */}
      <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
        <div style={{ height: "100%", width: `${confPct}%`,
          background: col, opacity: 0.55,
          transition: "width 0.5s ease" }}/>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function Markets() {
  const [filter, setFilter] = useState<Filter>("ALL");

  const { data, isLoading } = useQuery<{
    breakdowns: Record<string, SignalBreakdown>;
    signalFilter: { volumeFilter: boolean; require1HTrend: boolean };
  }>({
    queryKey:        ["mobile-signals"],
    queryFn:         () => api.get("/mobile/signals"),
    refetchInterval: 5_000,
  });

  // Merge live engine signals + extended mock assets
  const allBreakdowns: Record<string, SignalBreakdown> = {
    ...(data?.breakdowns ?? {}),
    ...Object.entries(MOCK_ASSETS).reduce((acc, [sym, m]) => {
      if (!data?.breakdowns?.[sym]) {
        acc[sym] = {
          symbol: sym, action: m.action, confidence: m.confidence,
          mtfConfirmed: m.volConf, volumeConfirmed: m.volConf,
          marketCondition: "neutral", trend1H: "neutral",
          blockReason: null, lastUpdated: Date.now(),
        };
      }
      return acc;
    }, {} as Record<string, SignalBreakdown>),
  };

  const entries   = Object.entries(allBreakdowns);
  const buys      = entries.filter(([, b]) => b.action === "BUY").length;
  const sells     = entries.filter(([, b]) => b.action === "SELL").length;
  const holds     = entries.filter(([, b]) => b.action === "HOLD").length;
  const highConf  = entries.filter(([, b]) => b.confidence >= 65).length;
  const regime    = buys > sells + 2 ? "BULLISH" : sells > buys + 2 ? "BEARISH" : "MIXED";
  const regimeCol = regime === "BULLISH" ? "rgba(0,210,100,0.82)" : regime === "BEARISH" ? "rgba(230,70,70,0.82)" : "rgba(0,185,215,0.70)";

  const strongest = entries.length
    ? entries.reduce((best, curr) => curr[1].confidence > best[1].confidence ? curr : best, entries[0])
    : null;

  const filtered = entries.filter(([, b]) => {
    if (filter === "BUY")       return b.action === "BUY";
    if (filter === "SELL")      return b.action === "SELL";
    if (filter === "HIGH_CONF") return b.confidence >= 65;
    return true;
  });

  // Sort: high confidence first
  filtered.sort((a, b) => b[1].confidence - a[1].confidence);

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 28 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px 14px",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: W, fontFamily: SANS,
            letterSpacing: "-0.01em" }}>
            AI Scanner
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%",
              background: "rgba(0,210,100,0.90)", flexShrink: 0,
              animation: "dot-pulse 2.5s ease-in-out infinite" }}/>
            <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 500, color: GR,
              letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
              Live · {entries.length} Assets
            </span>
          </div>
        </div>

        {/* Regime badge */}
        <div style={{
          padding: "3px 11px", borderRadius: 4, marginTop: 4,
          background: regime === "BULLISH" ? "rgba(0,210,100,0.07)"
                    : regime === "BEARISH" ? "rgba(230,70,70,0.07)"
                    : "rgba(0,185,215,0.06)",
          border: `1px solid ${regime === "BULLISH" ? "rgba(0,210,100,0.25)"
                              : regime === "BEARISH" ? "rgba(230,70,70,0.25)"
                              : "rgba(0,185,215,0.22)"}`,
          fontSize: 9, fontFamily: SANS, fontWeight: 600,
          color: regimeCol, letterSpacing: "0.06em",
        }}>
          {regime}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Market intelligence panel ────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${E}`,
          borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>

          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
            borderBottom: `1px solid rgba(255,255,255,0.05)`, paddingBottom: 12, marginBottom: 12 }}>
            {([
              { val: buys,     label: "Buying",   color: "rgba(0,210,100,0.82)"  },
              { val: sells,    label: "Selling",  color: "rgba(230,70,70,0.82)"  },
              { val: holds,    label: "Hold",     color: "rgba(0,185,215,0.70)"  },
              { val: highConf, label: "High Conf",color: "rgba(255,255,255,0.80)"},
            ] as { val:number; label:string; color:string }[]).map(({ val, label, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontFamily: MONO, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 7, fontFamily: SANS, color: GR,
                  letterSpacing: "0.08em", marginTop: 2,
                  textTransform: "uppercase" as const }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Strongest setup + AI pulse */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 7, fontFamily: SANS, fontWeight: 500, color: DIM,
                letterSpacing: "0.12em", textTransform: "uppercase" as const,
                marginBottom: 3 }}>Strongest Setup</div>
              {strongest ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: W }}>
                    {strongest[0].replace("USD", "")}
                  </span>
                  <span style={{ fontSize: 8, fontFamily: SANS, fontWeight: 600,
                    color: ACTION_COLOR[strongest[1].action],
                    padding: "1px 7px",
                    background: ACTION_BG[strongest[1].action],
                    border: `1px solid ${ACTION_BORDER[strongest[1].action]}`,
                    borderRadius: 3 }}>
                    {strongest[1].action}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600,
                    color: ACTION_COLOR[strongest[1].action] }}>
                    {strongest[1].confidence}%
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 11, fontFamily: MONO, color: DIM }}>—</span>
              )}
            </div>

            {/* AI pulse indicator */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 7, fontFamily: SANS, fontWeight: 500, color: DIM,
                letterSpacing: "0.12em", textTransform: "uppercase" as const,
                marginBottom: 3 }}>AI Sentiment</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%",
                  background: regimeCol, opacity: 0.85,
                  animation: "dot-pulse 2s ease-in-out 0.8s infinite" }}/>
                <span style={{ fontSize: 10, fontFamily: SANS, fontWeight: 600,
                  color: regimeCol }}>
                  {regime === "BULLISH" ? "Risk On" : regime === "BEARISH" ? "Risk Off" : "Neutral"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter tabs ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" as const }}>
          {([
            ["ALL",       `All (${entries.length})`],
            ["BUY",       `Buy (${buys})`],
            ["SELL",      `Sell (${sells})`],
            ["HIGH_CONF", `High Conf (${highConf})`],
          ] as [Filter, string][]).map(([key, label]) => {
            const active = filter === key;
            return (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding: "6px 14px",
                background: active ? "rgba(0,229,255,0.08)" : "rgba(255,255,255,0.03)",
                border:   `1px solid ${active ? "rgba(0,229,255,0.28)" : "rgba(255,255,255,0.10)"}`,
                borderRadius: 20,
                color:    active ? C : GR,
                fontFamily: SANS, fontSize: 10, fontWeight: active ? 600 : 400,
                letterSpacing: "0.03em", cursor: "pointer",
                transition: "all 0.15s ease",
              }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Scanning indicator ───────────────────────────────────────────── */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "24px 0",
            fontFamily: SANS, fontSize: 10, color: GR, letterSpacing: "0.08em" }}>
            Scanning markets…
          </div>
        )}

        {/* ── Asset rows ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(([sym, bd]) => {
            const meta: Partial<AssetMeta> = { ...LIVE_META[sym], ...MOCK_ASSETS[sym] };
            return <AssetRow key={sym} sym={sym} bd={bd} meta={meta}/>;
          })}
        </div>

        {filtered.length === 0 && !isLoading && (
          <div style={{ textAlign: "center", padding: "28px 0",
            fontFamily: SANS, fontSize: 10, color: GR, letterSpacing: "0.06em" }}>
            No signals match this filter
          </div>
        )}

        {/* ── Footer note ──────────────────────────────────────────────────── */}
        <div style={{ marginTop: 16, padding: "11px 14px", background: CARD,
          border: `1px solid ${E}`, borderRadius: 8,
          fontSize: 8, fontFamily: SANS, color: GR, lineHeight: 1.7 }}>
          Paper trading is always free. Live execution requires a Starter subscription ($5.99/mo + 2% on wins).
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.4; transform: scale(0.80); }
        }
      `}</style>
    </div>
  );
}
