import { ASSETS } from "./types";
import type { SymBreakdown } from "./types";
import { MiniChart } from "./MiniChart";
import { LayoutGrid } from "lucide-react";

interface Props {
  breakdowns: SymBreakdown[];
}

export function CryptoChartGrid({ breakdowns }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Crypto Chart Grid</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-1">15m · EMA9/21 · volume overlay</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
