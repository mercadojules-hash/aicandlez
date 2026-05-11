import { DollarSign } from "lucide-react";
import type { FeeSummary } from "./types";

interface Props { feeSummary: FeeSummary | undefined }

export function PlatformFeeCard({ feeSummary }: Props) {
  const total = feeSummary?.totalFeesCollected ?? 0;
  const count = feeSummary?.tradeCount ?? 0;
  const rate  = feeSummary?.feeRatePct ?? 3;

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Platform Fees</h3>
        <span className="ml-auto px-2 py-0.5 rounded text-[9px] font-bold border bg-muted/20 text-muted-foreground/60 border-border/30">
          {rate}% · SIMULATED
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-muted/10 rounded-lg p-3 text-center">
          <div className="text-lg font-bold font-mono text-emerald-400">
            ${total.toFixed(2)}
          </div>
          <div className="text-[9px] text-muted-foreground/50 mt-0.5">Fees collected</div>
        </div>
        <div className="bg-muted/10 rounded-lg p-3 text-center">
          <div className="text-lg font-bold font-mono">{count}</div>
          <div className="text-[9px] text-muted-foreground/50 mt-0.5">Fee events</div>
        </div>
      </div>

      {(feeSummary?.recentFees?.length ?? 0) > 0 && (
        <div className="border-t border-border/20 pt-2.5">
          <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wide mb-1.5">Recent</div>
          <div className="space-y-1">
            {feeSummary!.recentFees.slice(0, 4).map((f) => (
              <div key={f.id} className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground/50">{f.symbol} {f.side.toUpperCase()}</span>
                <span className="text-emerald-400">+${f.feeUSD.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 text-[9px] text-muted-foreground/30 border border-border/20 rounded p-2 text-center">
        Simulated only · No real wallet transfers · {rate}% on each executed trade
      </div>
    </div>
  );
}
