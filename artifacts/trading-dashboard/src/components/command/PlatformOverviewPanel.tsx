import { useEffect, useState } from "react";
import type { SimAccount } from "./types";

interface Segment { label: string; value: string; color: string; pct: number }

function DonutChart({ segments, centerValue, centerLabel }: {
  segments: Segment[];
  centerValue: string;
  centerLabel: string;
}) {
  const r  = 76;
  const cx = 96;
  const cy = 96;
  const sw = 20;
  const c  = 2 * Math.PI * r;

  let off = 0;
  const slices = segments.map((seg) => {
    const dash  = (seg.pct / 100) * c;
    const slice = { ...seg, dash, gap: c - dash, offset: off };
    off += dash;
    return slice;
  });

  return (
    <div className="relative flex-shrink-0" style={{ width: 192, height: 192 }}>
      <svg width={192} height={192} viewBox="0 0 192 192" style={{ position: "absolute", inset: 0 }}>
        <circle cx={cx} cy={cy} r={r + sw / 2 + 4} fill="none" stroke="#00f0ff04" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0d0d0d" strokeWidth={sw} />
        {slices.map((s) => (
          <circle
            key={s.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={sw}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
            transform="rotate(-90)"
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              filter: `drop-shadow(0 0 4px ${s.color}90)`,
              opacity: 0.92,
            }}
          />
        ))}
        <circle cx={cx} cy={cy} r={r - sw / 2 - 2} fill="none" stroke="#0d0d0d" strokeWidth={1} />
      </svg>
      <div className="absolute flex flex-col items-center justify-center"
        style={{ inset: 0, marginLeft: 28, marginRight: 28, marginTop: 36, marginBottom: 36 }}>
        <div className="text-[20px] font-bold font-mono tabular-nums leading-none"
          style={{ color: "#00f0ff", textShadow: "0 0 16px #00f0ff60" }}>
          {centerValue}
        </div>
        <div className="text-[7px] font-mono tracking-[0.18em] mt-1 font-medium" style={{ color: "#9FB3C8" }}>
          {centerLabel}
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <span className="live-dot" style={{ width: 4, height: 4 }} />
          <span className="text-[7px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </div>
      </div>
    </div>
  );
}

interface VolumeRow { rank: number; symbol: string; volume: string; color: string; pct: number }

interface Props { simAccount?: SimAccount }

export function PlatformOverviewPanel({ simAccount }: Props) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 2000); return () => clearInterval(t); }, []);

  const equity   = simAccount?.equity ?? 0;
  const cash     = simAccount?.account?.cashBalance ?? 0;
  const realized = simAccount?.account?.totalRealized ?? 0;
  const posCount = simAccount?.positionCount ?? 0;

  const cashPct     = equity > 0 ? Math.round((cash / equity) * 100)    : 85;
  const posPct      = equity > 0 ? Math.round(((equity - cash) / equity) * 100) : 12;
  const realPct     = Math.max(0, Math.min(10, Math.abs(realized / (equity || 1)) * 100));
  const restPct     = Math.max(0, 100 - cashPct - posPct - realPct);

  const centerValue = equity > 0
    ? `$${(equity / 1000).toFixed(equity >= 100_000 ? 0 : 1)}K`
    : "SIM";
  const centerLabel = equity > 0 ? "SIM EQUITY" : "SIMULATION";

  const segments: Segment[] = simAccount ? [
    { label: "Cash Balance",   value: `$${cash.toFixed(2)}`,        pct: cashPct,  color: "#00aaff" },
    { label: "Open Positions", value: `${posCount} pos`,            pct: posPct,   color: "#00ff8a" },
    { label: "Realized P&L",   value: `${realized >= 0 ? "+" : ""}$${realized.toFixed(2)}`, pct: Math.max(realPct, 3), color: realized >= 0 ? "#7b68ee" : "#ff3355" },
    { label: "Reserve",        value: `${restPct}%`,                pct: Math.max(restPct, 0), color: "#2a3a50" },
  ] : [
    { label: "Cash Balance",   value: "—", pct: 85, color: "#00aaff" },
    { label: "Open Positions", value: "—", pct: 12, color: "#00ff8a" },
    { label: "Realized P&L",   value: "—", pct:  3, color: "#7b68ee" },
  ];

  void tick;

  /* TOP 10 assets by volume */
  const topAssets: VolumeRow[] = [
    { rank:  1, symbol: "BTC/USDT",  volume: "$1.02M", color: "#F7931A", pct: 100 },
    { rank:  2, symbol: "ETH/USDT",  volume: "$620K",  color: "#627EEA", pct: 61  },
    { rank:  3, symbol: "SOL/USDT",  volume: "$310K",  color: "#9945FF", pct: 30  },
    { rank:  4, symbol: "XRP/USDT",  volume: "$210K",  color: "#00AAE4", pct: 21  },
    { rank:  5, symbol: "DOGE/USDT", volume: "$128K",  color: "#C2A633", pct: 13  },
    { rank:  6, symbol: "AVAX/USDT", volume: "$97K",   color: "#E84142", pct: 10  },
    { rank:  7, symbol: "LINK/USDT", volume: "$74K",   color: "#2A5ADA", pct:  7  },
    { rank:  8, symbol: "ADA/USDT",  volume: "$61K",   color: "#0033AD", pct:  6  },
    { rank:  9, symbol: "BNB/USDT",  volume: "$48K",   color: "#F0B90B", pct:  5  },
    { rank: 10, symbol: "MATIC/USDT",volume: "$32K",   color: "#8247E5", pct:  3  },
  ];

  return (
    <div className="terminal-card h-full flex flex-col">
      <div className="panel-header">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: "#00aaff", boxShadow: "0 0 5px #00aaff" }} />
        <span className="panel-header-title" style={{ color: "#00aaff" }}>PLATFORM OVERVIEW</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
          <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        {/* Donut */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <DonutChart segments={segments} centerValue={centerValue} centerLabel={centerLabel} />
        </div>

        {/* Legend — tighter spacing */}
        <div className="px-3 space-y-0.5 pb-2 flex-shrink-0">
          {segments.map((seg) => (
            <div key={seg.label}
              className="flex items-center gap-2 px-2 py-0.5 rounded"
              style={{ background: `${seg.color}0a`, border: `1px solid ${seg.color}14` }}>
              <div className="w-1 h-3.5 rounded-full flex-shrink-0"
                style={{ background: seg.color, boxShadow: `0 0 3px ${seg.color}60` }} />
              <span className="text-[9px] font-mono flex-1 font-medium" style={{ color: "#C7D4E2" }}>
                {seg.label}
              </span>
              <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color: seg.color }}>
                {seg.value}
              </span>
              <span className="text-[8px] font-mono w-7 text-right font-medium" style={{ color: "#9FB3C8" }}>
                {seg.pct}%
              </span>
            </div>
          ))}
        </div>

        <div className="neon-divider mx-3 mb-2 flex-shrink-0" />

        {/* TOP 10 assets — fills remaining space */}
        <div className="px-3 pb-2 flex-1 overflow-y-auto feed-scroll min-h-0">
          <div className="text-[8px] font-mono tracking-[0.18em] mb-1.5 font-semibold uppercase"
            style={{ color: "#9FB3C8" }}>
            Top Assets by Volume (24H)
          </div>
          <div className="space-y-1">
            {topAssets.map((a) => (
              <div key={a.symbol} className="flex items-center gap-2">
                <span className="text-[8px] font-mono w-4 text-right flex-shrink-0 font-medium"
                  style={{ color: "#4a6a80" }}>{a.rank}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-bold font-mono" style={{ color: a.color }}>
                      {a.symbol}
                    </span>
                    <span className="text-[9px] font-bold font-mono tabular-nums"
                      style={{ color: "#EAF2FF" }}>{a.volume}</span>
                  </div>
                  <div className="rounded-sm overflow-hidden" style={{ height: 2, background: "#0d0d0d" }}>
                    <div className="h-full rounded-sm"
                      style={{ width: `${a.pct}%`, background: a.color, opacity: 0.5 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
