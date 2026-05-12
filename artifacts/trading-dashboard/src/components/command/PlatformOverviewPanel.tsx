import { useEffect, useState } from "react";

interface UserSegment { label: string; value: number; color: string; pct: number }

function DonutChart({ segments, total }: { segments: UserSegment[]; total: number }) {
  const r = 54;
  const cx = 70;
  const cy = 70;
  const strokeW = 14;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = segments.map((seg) => {
    const dash = (seg.pct / 100) * circumference;
    const gap  = circumference - dash;
    const slice = { ...seg, dash, gap, offset };
    offset += dash;
    return slice;
  });

  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke="#111111" strokeWidth={strokeW}
      />
      {/* Segments */}
      {slices.map((s) => (
        <circle
          key={s.label}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={strokeW}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset}
          strokeLinecap="butt"
          transform="rotate(-90)"
          style={{ transformOrigin: `${cx}px ${cy}px`, opacity: 0.85 }}
        />
      ))}
      {/* Center */}
      <text x={cx} y={cy - 6}  textAnchor="middle" fill="#00f0ff"  fontSize={22} fontWeight="bold" fontFamily="monospace">
        {total.toLocaleString()}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#1e3040" fontSize={7}  fontFamily="monospace" letterSpacing={2}>
        TOTAL USERS
      </text>
    </svg>
  );
}

interface VolumeRow { rank: number; symbol: string; volume: string; color: string }

export function PlatformOverviewPanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 2000); return () => clearInterval(t); }, []);

  const total = 1248 + Math.floor(tick / 3);
  const segments: UserSegment[] = [
    { label: "Live Traders",   value: 386  + (tick % 5), pct: 31, color: "#00ff8a" },
    { label: "Paper Traders",  value: 680  + (tick % 3), pct: 54, color: "#00aaff" },
    { label: "AI Bots Only",   value: 156  + (tick % 7), pct: 12, color: "#7b68ee" },
    { label: "Inactive",       value: 26   + (tick % 2), pct:  3, color: "#1e3040" },
  ];

  const topAssets: VolumeRow[] = [
    { rank: 1, symbol: "BTC/USDT", volume: "$1.02M", color: "#ffaa00" },
    { rank: 2, symbol: "ETH/USDT", volume: "$620K",  color: "#7b68ee" },
    { rank: 3, symbol: "SOL/USDT", volume: "$310K",  color: "#a855f7" },
    { rank: 4, symbol: "XRP/USDT", volume: "$210K",  color: "#00aaff" },
    { rank: 5, symbol: "DOGE/USDT",volume: "$128K",  color: "#ffb800" },
  ];

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#000000", border: "1px solid #1c1c1c" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderBottomColor: "#141414", background: "#000000" }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: "#00aaff", boxShadow: "0 0 6px #00aaff80" }} />
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
          PLATFORM OVERVIEW
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
          <span className="text-[8px] font-mono" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      <div className="p-3">
        <div className="flex gap-4 items-center mb-3">
          {/* Donut */}
          <div className="shrink-0">
            <DonutChart segments={segments} total={total} />
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2 flex-1">
            {segments.map((seg) => (
              <div key={seg.label} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
                  <span className="text-[9px] font-mono" style={{ color: "#3a5060" }}>{seg.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color: seg.color }}>
                    {seg.value.toLocaleString()}
                  </span>
                  <span className="text-[9px] font-mono w-8 text-right" style={{ color: "#1e3040" }}>
                    ({seg.pct}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top assets by volume */}
        <div className="pt-2.5" style={{ borderTop: "1px solid #0a0a0a" }}>
          <div className="text-[8px] font-mono tracking-[0.18em] mb-2" style={{ color: "#1e3040" }}>
            TOP ASSETS BY VOLUME (24H)
          </div>
          <div className="space-y-1.5">
            {topAssets.map((a) => (
              <div key={a.symbol} className="flex items-center gap-2">
                <span className="text-[9px] font-mono w-4 shrink-0 text-right" style={{ color: "#1e3040" }}>
                  {a.rank}
                </span>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.color }} />
                <span className="text-[10px] font-bold font-mono flex-1" style={{ color: a.color }}>
                  {a.symbol}
                </span>
                <span className="text-[10px] font-bold font-mono tabular-nums" style={{ color: "#4a7a90" }}>
                  {a.volume}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
