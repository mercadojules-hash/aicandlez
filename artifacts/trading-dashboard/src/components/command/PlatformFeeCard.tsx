import { DollarSign } from "lucide-react";
import type { FeeSummary } from "./types";

interface Props { feeSummary: FeeSummary | undefined }

export function PlatformFeeCard({ feeSummary }: Props) {
  const total = feeSummary?.totalFeesCollected ?? 0;
  const count = feeSummary?.tradeCount ?? 0;
  const rate  = feeSummary?.feeRatePct ?? 3;

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <DollarSign className="w-3.5 h-3.5 text-[#00eeff]" />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">PLATFORM FEES</span>
        <span
          className="ml-auto text-[7px] font-bold px-1.5 py-0.5 rounded font-mono"
          style={{ background: "#ffb80010", color: "#ffb800", border: "1px solid #ffb80025" }}
        >
          {rate}% · SIM ONLY
        </span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="text-center bg-[#050e1a] rounded p-2.5 border border-[#0A1820]">
            <div
              className="text-[15px] font-bold font-mono"
              style={{ color: "#00ff88", textShadow: "0 0 12px #00ff8860" }}
            >
              ${total.toFixed(2)}
            </div>
            <div className="text-[7px] text-[#0E2235] uppercase tracking-widest mt-0.5">FEES COLLECTED</div>
          </div>
          <div className="text-center bg-[#050e1a] rounded p-2.5 border border-[#0A1820]">
            <div
              className="text-[15px] font-bold font-mono text-[#00eeff]"
              style={{ textShadow: "0 0 12px #00eeff60" }}
            >
              {count}
            </div>
            <div className="text-[7px] text-[#0E2235] uppercase tracking-widest mt-0.5">FEE EVENTS</div>
          </div>
        </div>

        {(feeSummary?.recentFees?.length ?? 0) > 0 && (
          <div>
            <div className="text-[7px] text-[#0E2235] uppercase tracking-[0.2em] mb-1.5">RECENT</div>
            <div className="space-y-1">
              {feeSummary!.recentFees.slice(0, 4).map((f) => (
                <div key={f.id} className="flex items-center justify-between text-[8px] font-mono">
                  <span className="text-[#1e4060]">{f.symbol} {f.side.toUpperCase()}</span>
                  <span style={{ color: "#00ff88" }}>+${f.feeUSD.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 text-center text-[7px] text-[#0A1820] font-mono border border-[#0A1820] rounded py-1">
          SIMULATED · NO REAL WALLET TRANSFERS · {rate}% PER TRADE
        </div>
      </div>
    </div>
  );
}
