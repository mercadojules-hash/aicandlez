import { DollarSign } from "lucide-react";
import type { FeeSummary } from "./types";

interface Props { feeSummary: FeeSummary | undefined }

export function PlatformFeeCard({ feeSummary }: Props) {
  const total = feeSummary?.totalFeesCollected ?? 0;
  const count = feeSummary?.tradeCount ?? 0;
  const rate  = feeSummary?.feeRatePct ?? 3;

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#141414" }}>
        <DollarSign className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.18em] font-mono" style={{ color: "#00eeff" }}>
          PLATFORM FEES
        </span>
        <span
          className="ml-auto text-[8px] font-bold px-2 py-0.5 rounded font-mono"
          style={{ background: "#ffb80010", color: "#ffb800", border: "1px solid #ffb80025" }}
        >
          {rate}% · SIM
        </span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { val: `$${total.toFixed(2)}`, lbl: "FEES COLLECTED", color: "#00ff88" },
            { val: String(count),          lbl: "FEE EVENTS",     color: "#00eeff" },
          ].map(({ val, lbl, color }) => (
            <div
              key={lbl}
              className="text-center rounded p-3"
              style={{ background: "#050505", border: "1px solid #181818" }}
            >
              <div
                className="text-[16px] font-bold font-mono tabular-nums"
                style={{ color, textShadow: `0 0 7px ${color}50` }}
              >
                {val}
              </div>
              <div className="text-[7px] uppercase tracking-widest mt-0.5 font-mono"
                style={{ color: "#1a2a35" }}>
                {lbl}
              </div>
            </div>
          ))}
        </div>

        {(feeSummary?.recentFees?.length ?? 0) > 0 && (
          <div className="mb-3">
            <div className="text-[8px] uppercase tracking-[0.2em] mb-1.5 font-mono"
              style={{ color: "#1a2a35" }}>
              RECENT
            </div>
            <div className="space-y-1.5">
              {feeSummary!.recentFees.slice(0, 4).map((f) => (
                <div key={f.id} className="flex items-center justify-between text-[9px] font-mono">
                  <span style={{ color: "#1e3040" }}>{f.symbol} {f.side.toUpperCase()}</span>
                  <span style={{ color: "#00ff88" }}>+${f.feeUSD.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="text-center text-[7px] font-mono rounded py-1.5"
          style={{ color: "#0d1a22", background: "#030303", border: "1px solid #141414" }}
        >
          SIMULATED · NO REAL WALLET TRANSFERS · {rate}% PER TRADE
        </div>
      </div>
    </div>
  );
}
