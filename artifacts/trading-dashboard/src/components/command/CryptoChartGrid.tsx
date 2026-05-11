import { ASSETS } from "./types";
import type { SymBreakdown } from "./types";
import { MiniChart } from "./MiniChart";

interface Props { breakdowns: SymBreakdown[] }

export function CryptoChartGrid({ breakdowns }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
        <span className="text-[9px] font-bold tracking-[0.2em] text-[#00eeff80] uppercase">
          Crypto Chart Grid
        </span>
        <span className="text-[8px] text-[#0E2235] ml-1 font-mono">
          15m · EMA9/21 · volume
        </span>
      </div>
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
