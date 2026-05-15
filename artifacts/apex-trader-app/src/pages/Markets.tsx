import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SignalBreakdown } from "@/lib/api";

const S = "#0d0e1a", B = "#1c1f32", C = "#00e5ff", G = "#00ff88",
      P = "#9b5cf5", R = "#ff3355", W = "#ffffff", GR = "#8892a4", DIM = "#3a3f5c";

const ACTION_COLOR: Record<string, string> = { BUY: G, SELL: R, HOLD: C };

// ── Mini sparkline (deterministic seeded) ──────────────────────────────────────
function Sparkline({ seed, action, w = 80, h = 36 }: { seed: string; action: string; w?: number; h?: number }) {
  const color  = ACTION_COLOR[action] ?? GR;
  const trend  = action === "BUY" ? 1.4 : action === "SELL" ? -1.4 : 0.1;

  let s = 5381;
  for (let i = 0; i < seed.length; i++) { s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0; }
  const rand = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };

  const pts: number[] = [];
  let v = 50;
  for (let i = 0; i < 22; i++) {
    v = Math.max(8, Math.min(92, v + (rand() - 0.5) * 14 + trend));
    pts.push(v);
  }

  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const coords = pts.map((p, i) =>
    `${((i / 21) * w).toFixed(1)},${(h - 4 - ((p - min) / range) * (h - 8)).toFixed(1)}`
  ).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <polyline points={coords} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mock extra assets to supplement engine signals ─────────────────────────────
const MOCK_ASSETS: Record<string, { price: string; change: string; vol: string; action: string; confidence: number; volConf: boolean }> = {
  BNBUSD:  { price: "$594.00", change: "-1.23%", vol: "86B", action: "SELL", confidence: 63, volConf: true  },
  XRPUSD:  { price: "$0.6240", change: "+3.12%", vol: "35B", action: "BUY",  confidence: 71, volConf: true  },
  ADAUSD:  { price: "$0.4510", change: "+1.45%", vol: "12B", action: "BUY",  confidence: 54, volConf: false },
};

const PRICE_MAP: Record<string, { price: string; change: string; vol: string }> = {
  BTCUSD: { price: "$68.1K", change: "+2.34%", vol: "132T" },
  ETHUSD: { price: "$3.5K",  change: "+1.87%", vol: "421B" },
  SOLUSD: { price: "$188.00",change: "-0.42%", vol: "84B"  },
};

type Filter = "ALL" | "BUY" | "SELL" | "HIGH_CONF";

export default function Markets() {
  const [filter, setFilter] = useState<Filter>("ALL");

  const { data, isLoading } = useQuery<{ breakdowns: Record<string, SignalBreakdown>; signalFilter: { volumeFilter: boolean; require1HTrend: boolean } }>({
    queryKey:        ["mobile-signals"],
    queryFn:         () => api.get("/mobile/signals"),
    refetchInterval: 5_000,
  });

  // Merge engine signals + mock extras
  const allBreakdowns: Record<string, SignalBreakdown> = {
    ...(data?.breakdowns ?? {}),
    ...Object.entries(MOCK_ASSETS).reduce((acc, [sym, m]) => {
      if (!data?.breakdowns?.[sym]) {
        acc[sym] = { symbol: sym, action: m.action, confidence: m.confidence,
          mtfConfirmed: m.volConf, volumeConfirmed: m.volConf,
          marketCondition: "neutral", trend1H: "neutral",
          blockReason: null, lastUpdated: Date.now() };
      }
      return acc;
    }, {} as Record<string, SignalBreakdown>),
  };

  const entries = Object.entries(allBreakdowns);
  const buys    = entries.filter(([, b]) => b.action === "BUY").length;
  const holds   = entries.filter(([, b]) => b.action === "HOLD").length;
  const sells   = entries.filter(([, b]) => b.action === "SELL").length;
  const bullish = buys > sells ? "BULLISH" : sells > buys ? "BEARISH" : "MIXED";
  const bullCol = bullish === "BULLISH" ? G : bullish === "BEARISH" ? R : C;

  const filtered = entries.filter(([, b]) => {
    if (filter === "BUY")       return b.action === "BUY";
    if (filter === "SELL")      return b.action === "SELL";
    if (filter === "HIGH_CONF") return b.confidence >= 65;
    return true;
  });

  return (
    <div className="page-enter" style={{ background: "#080810", minHeight: "100%", paddingBottom: 24 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: W, fontFamily: "monospace", letterSpacing: "-0.02em" }}>
            AI SCANNER
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C, boxShadow: `0 0 8px ${C}`, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontFamily: "monospace", color: GR, letterSpacing: "0.1em" }}>LIVE SIGNAL ANALYSIS</span>
          </div>
        </div>
        <div style={{ padding: "4px 12px", background: bullCol+"20",
          border: `1px solid ${bullCol}60`, borderRadius: 6, marginTop: 4,
          fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: bullCol, letterSpacing: "0.1em" }}>
          {bullish}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Summary counts ──────────────────────────────────────────────── */}
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 12,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 14 }}>
          {[
            { n: buys,  label: "BUY",  color: G },
            { n: holds, label: "HOLD", color: C },
            { n: sells, label: "SELL", color: R },
          ].map(({ n, label, color }, i) => (
            <div key={label} style={{ textAlign: "center", padding: "14px 0",
              borderRight: i < 2 ? `1px solid ${B}` : "none" }}>
              <div style={{ fontSize: 28, fontFamily: "monospace", fontWeight: 900, color }}>{n}</div>
              <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([
            ["ALL",       `ALL (${entries.length})`],
            ["BUY",       `BUY (${buys})`],
            ["SELL",      `SELL (${sells})`],
            ["HIGH_CONF", "HIGH CONF"],
          ] as [Filter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding:  "5px 12px",
              background: filter === key ? C+"20" : "transparent",
              border:   `1px solid ${filter === key ? C+"70" : B}`,
              borderRadius: 20,
              color:    filter === key ? C : DIM,
              fontFamily: "monospace", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.08em", cursor: "pointer",
              transition: "all 0.15s ease",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Signal cards ────────────────────────────────────────────────── */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace", fontSize: 10, color: DIM }}>
            SCANNING MARKETS...
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(([sym, bd]) => {
            const color  = ACTION_COLOR[bd.action] ?? GR;
            const meta   = PRICE_MAP[sym] ?? MOCK_ASSETS[sym];
            const price  = meta?.price  ?? "—";
            const change = meta?.change ?? "";
            const vol    = (meta as { vol?: string })?.vol ?? "";
            const chUp   = change.startsWith("+");

            return (
              <div key={sym} style={{ background: S, border: `1px solid ${color}25`,
                borderRadius: 14, padding: "14px 16px",
                boxShadow: `0 0 20px ${color}05` }}>

                {/* Top row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 900, color: W }}>
                      {sym.replace("USD", "")}
                    </div>
                    <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, marginTop: 2 }}>{vol}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: W }}>{price}</div>
                    <div style={{ fontSize: 10, fontFamily: "monospace",
                      color: chUp ? G : R, fontWeight: 600, marginTop: 2 }}>{change}</div>
                  </div>
                  {/* Sparkline */}
                  <div style={{ flexShrink: 0 }}>
                    <Sparkline seed={sym} action={bd.action} />
                  </div>
                  {/* Action badge + confidence */}
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ padding: "4px 10px", background: color+"20",
                      border: `1px solid ${color}60`, borderRadius: 6,
                      fontSize: 10, fontFamily: "monospace", fontWeight: 800,
                      color, letterSpacing: "0.08em", marginBottom: 4 }}>
                      {bd.action}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: GR }}>
                      {bd.confidence}%
                    </div>
                  </div>
                </div>

                {/* Confidence bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 8, fontFamily: "monospace", color: DIM, letterSpacing: "0.1em" }}>
                      AI CONFIDENCE
                    </span>
                    {bd.volumeConfirmed && (
                      <span style={{ fontSize: 7, fontFamily: "monospace", fontWeight: 700,
                        color: G, padding: "1px 6px", background: G+"12",
                        border: `1px solid ${G}30`, borderRadius: 3 }}>
                        VOL ✓
                      </span>
                    )}
                  </div>
                  <div style={{ height: 3, background: "#1a1d2e", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${bd.confidence}%`, background: color,
                      borderRadius: 2, boxShadow: `0 0 6px ${color}60`,
                      transition: "width 0.4s ease" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && !isLoading && (
          <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace", fontSize: 10, color: DIM }}>
            NO SIGNALS MATCH FILTER
          </div>
        )}

        <div style={{ marginTop: 16, padding: "10px 14px", background: S,
          border: `1px solid ${B}`, borderRadius: 8,
          fontSize: 8, fontFamily: "monospace", color: DIM, lineHeight: 1.7 }}>
          Paper trading is always free. Live execution requires a Starter subscription ($5.99/mo).
        </div>
      </div>
    </div>
  );
}
