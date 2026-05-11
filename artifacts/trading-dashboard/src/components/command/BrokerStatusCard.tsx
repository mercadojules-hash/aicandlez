import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Wifi, WifiOff } from "lucide-react";
import type { ExchangeStatus } from "./types";

interface Props {
  exchangeStatus: ExchangeStatus | undefined;
}

export function BrokerStatusCard({ exchangeStatus }: Props) {
  const qc   = useQueryClient();
  const name = exchangeStatus?.exchangeName ?? "Exchange";
  const mode = exchangeStatus?.mode ?? "simulation";
  const live = mode === "live";
  const sim  = mode === "simulation";

  const bal = exchangeStatus?.simBalances;

  const handleModeToggle = async () => {
    const next = live ? "simulation" : "simulation";
    await fetch("/api/exchange/mode", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ mode: next }),
      cache:   "no-store",
    });
    qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] });
  };

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Landmark className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Broker / Exchange</h3>
        <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-bold border ${
          live
            ? "bg-red-500/15 text-red-400 border-red-500/30"
            : "bg-amber-500/15 text-amber-400 border-amber-500/30"
        }`}>
          {name.toUpperCase()} {live ? "LIVE" : "SIM"}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground/60">Connection</span>
          <span className="flex items-center gap-1">
            {exchangeStatus?.apiConfigured
              ? <><Wifi className="w-3 h-3 text-emerald-400" /> <span className="text-emerald-400">Configured</span></>
              : <><WifiOff className="w-3 h-3 text-muted-foreground/40" /> <span className="text-muted-foreground/50">Simulation only</span></>
            }
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground/60">Kill switch</span>
          <span className={exchangeStatus?.killSwitch ? "text-red-400 font-bold" : "text-emerald-400"}>
            {exchangeStatus?.killSwitch ? "ACTIVE" : "OFF"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground/60">Orders today</span>
          <span className="font-mono">{exchangeStatus?.ordersToday ?? 0}</span>
        </div>
      </div>

      {sim && bal && (
        <div className="border-t border-border/20 pt-2.5">
          <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wide mb-1.5">
            {name} Balance (Simulated)
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
            <div className="flex justify-between"><span className="text-muted-foreground/50">USD</span><span>${bal.USD.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground/50">BTC</span><span>{bal.BTC.toFixed(4)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground/50">ETH</span><span>{bal.ETH.toFixed(4)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground/50">SOL</span><span>{bal.SOL.toFixed(4)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
