import { ASSETS } from "./types";
import type { SymBreakdown } from "./types";
import { MiniChart } from "./MiniChart";

interface Props { breakdowns: SymBreakdown[] }

export function CryptoChartGrid({ breakdowns }: Props) {
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="live-dot live-dot-cyan" style={{ width: 7, height: 7 }} />
        <span
          className="text-[13px] font-bold tracking-[0.2em] uppercase"
          style={{ color: "#00f0ff", textShadow: "0 0 12px #00f0ff60" }}
        >
          CRYPTO CHART GRID
        </span>
        <span className="text-[10px] text-[#1a3850] font-mono ml-1">
          15m · EMA 9/21 · VOLUME OVERLAY · LIVE
        </span>
        <div className="ml-auto flex items-center gap-3 text-[9px] font-mono text-[#1a3850]">
          <span className="flex items-center gap-1">
            <span style={{ width: 16, height: 2, background: "#ffb800", display: "inline-block", opacity: 0.7 }} />
            EMA 9
          </span>
          <span className="flex items-center gap-1">
            <span style={{ width: 16, height: 2, background: "#00f0ff", display: "inline-block", opacity: 0.5 }} />
            EMA 21
          </span>
        </div>
      </div>

      {/* 4×2 chart grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ASSETS.map((a) => {
          const bd = breakdowns.find((b) => b.symbol === a.symbol);
          return (
            <MiniChart
              key={a.symbol}
              symbol={a.symbol}
              label={a.label}
              color={a.color}
              breakdown={bd}
            />
          );
        })}
      </div>
    </div>
  );
}
