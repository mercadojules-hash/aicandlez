import { useEffect, useRef, useState } from "react";

interface UserSegment { label: string; value: number; color: string; pct: number; icon: string }

function DonutChart({
  segments, total, pulse,
}: { segments: UserSegment[]; total: number; pulse: number }) {
  const r   = 76;
  const cx  = 96;
  const cy  = 96;
  const sw  = 20;
  const c   = 2 * Math.PI * r;

  let off = 0;
  const slices = segments.map((seg) => {
    const dash  = (seg.pct / 100) * c;
    const slice = { ...seg, dash, gap: c - dash, offset: off };
    off += dash;
    return slice;
  });

  return (
    <div className="relative" style={{ width: 192, height: 192 }}>
      <svg width={192} height={192} viewBox="0 0 192 192" style={{ position: "absolute", inset: 0 }}>
        {/* Outer glow ring */}
        <circle cx={cx} cy={cy} r={r + sw / 2 + 4} fill="none" stroke="#00f0ff04" strokeWidth={2} />
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0d0d0d" strokeWidth={sw} />
        {/* Segments */}
        {slices.map((s, i) => (
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
              filter: `drop-shadow(0 0 ${i === 0 ? 6 : 3}px ${s.color})`,
              opacity: 0.9,
              transition: "opacity 0.3s",
            }}
          />
        ))}
        {/* Inner track */}
        <circle cx={cx} cy={cy} r={r - sw / 2 - 2} fill="none" stroke="#0a0a0a" strokeWidth={1} />
      </svg>

      {/* Center content */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ inset: 0, marginLeft: 36, marginRight: 36, marginTop: 36, marginBottom: 36 }}
      >
        <div
          className="text-[32px] font-bold font-mono tabular-nums leading-none"
          style={{
            color: "#00f0ff",
            textShadow: "0 0 20px #00f0ff80, 0 0 40px #00f0ff40",
            animation: pulse % 2 === 0 ? "pnl-glow-green 3s ease-in-out infinite" : undefined,
          }}
        >
          {total.toLocaleString()}
        </div>
        <div className="text-[7px] font-mono tracking-[0.2em] mt-1" style={{ color: "#1e3040" }}>
          TOTAL USERS
        </div>
        <div className="flex items-center gap-1 mt-2">
          <span className="live-dot" style={{ width: 4, height: 4 }} />
          <span className="text-[7px] font-mono" style={{ color: "#00ff8a" }}>LIVE</span>
        </div>
      </div>
    </div>
  );
}

interface VolumeRow { rank: number; symbol: string; volume: string; color: string; pct: number }

export function PlatformOverviewPanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1800); return () => clearInterval(t); }, []);

  const total = 1248 + Math.floor(tick / 4);
  const segments: UserSegment[] = [
    { label: "Live Traders",  value: 386 + (tick % 5),  pct: 31, color: "#00ff8a", icon: "▲" },
    { label: "Paper Traders", value: 680 + (tick % 3),  pct: 54, color: "#00aaff", icon: "◈" },
    { label: "AI Bots",       value: 156 + (tick % 7),  pct: 12, color: "#7b68ee", icon: "◆" },
    { label: "Inactive",      value: 26  + (tick % 2),  pct:  3, color: "#1e3040", icon: "○" },
  ];

  const topAssets: VolumeRow[] = [
    { rank: 1, symbol: "BTC/USDT",  volume: "$1.02M", color: "#ffaa00", pct: 100 },
    { rank: 2, symbol: "ETH/USDT",  volume: "$620K",  color: "#7b68ee", pct: 61  },
    { rank: 3, symbol: "SOL/USDT",  volume: "$310K",  color: "#a855f7", pct: 30  },
    { rank: 4, symbol: "XRP/USDT",  volume: "$210K",  color: "#00aaff", pct: 21  },
    { rank: 5, symbol: "DOGE/USDT", volume: "$128K",  color: "#ffb800", pct: 13  },
  ];

  return (
    <div className="terminal-card h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00aaff", boxShadow: "0 0 6px #00aaff" }} />
        <span className="panel-header-title" style={{ color: "#00aaff" }}>PLATFORM OVERVIEW</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
          <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      <div className="flex flex-col gap-0 flex-1">
        {/* Donut centered */}
        <div className="flex justify-center pt-3 pb-1">
          <DonutChart segments={segments} total={total} pulse={tick} />
        </div>

        {/* Legend — each segment with animated count */}
        <div className="px-3 space-y-1 pb-2">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2 py-1 px-2 rounded"
              style={{ background: `${seg.color}08`, border: `1px solid ${seg.color}12` }}>
              <div className="w-1 h-5 rounded-full shrink-0" style={{ background: seg.color, boxShadow: `0 0 4px ${seg.color}80` }} />
              <span className="text-[9px] font-mono flex-1" style={{ color: seg.color + "aa" }}>{seg.label}</span>
              <span className="text-[14px] font-bold font-mono tabular-nums" style={{ color: seg.color, textShadow: `0 0 8px ${seg.color}50` }}>
                {seg.value.toLocaleString()}
              </span>
              <span className="text-[8px] font-mono w-7 text-right" style={{ color: "#1e3040" }}>{seg.pct}%</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="neon-divider mx-3 mb-2" />

        {/* Top assets */}
        <div className="px-3 pb-3">
          <div className="text-[7px] font-mono tracking-[0.2em] mb-2" style={{ color: "#1e3040" }}>
            TOP ASSETS BY VOLUME (24H)
          </div>
          <div className="space-y-1.5">
            {topAssets.map((a) => (
              <div key={a.symbol} className="flex items-center gap-2">
                <span className="text-[8px] font-mono w-3 text-right shrink-0" style={{ color: "#1e3040" }}>{a.rank}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-bold font-mono" style={{ color: a.color }}>{a.symbol}</span>
                    <span className="text-[9px] font-bold font-mono tabular-nums" style={{ color: "#4a7a90" }}>{a.volume}</span>
                  </div>
                  <div className="rounded-sm overflow-hidden" style={{ height: 2, background: "#0a0a0a" }}>
                    <div className="h-full rounded-sm"
                      style={{ width: `${a.pct}%`, background: a.color, opacity: 0.6, boxShadow: `0 0 4px ${a.color}60` }} />
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
