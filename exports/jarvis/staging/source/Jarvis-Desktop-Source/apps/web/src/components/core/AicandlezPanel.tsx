import React from "react";
import { LineChart, BarChart2, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAicandlezLive } from "@/hooks/useJarvisApi";
import { cn } from "@/lib/utils";

export default function AicandlezPanel({ className }: { className?: string }) {
  const { data: feed, isLoading } = useAicandlezLive();

  const m = feed?.metrics;
  const degraded = feed?.degraded ?? false;

  const fmtCurrency = (val: number | null | undefined) => 
    val === null || val === undefined ? "—" : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const fmtPct = (val: number | null | undefined) => 
    val === null || val === undefined ? "—" : `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
  
  const fmtNum = (val: number | null | undefined) => 
    val === null || val === undefined ? "—" : val.toString();

  return (
    <Card className={cn("flex flex-col border-border/40 bg-card/40 backdrop-blur-md overflow-hidden", className)}>
      <div className="flex h-10 items-center justify-between border-b border-border/40 bg-muted/20 px-4">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          <LineChart className="h-3.5 w-3.5" />
          AICandlez Live
        </div>
        {!isLoading && feed && (
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "h-2 w-2 rounded-full shadow-[0_0_5px_currentColor]",
              degraded ? "bg-amber-500 text-amber-500" : "bg-emerald-500 text-emerald-500"
            )} />
            <span className={cn(
              "text-[9px] uppercase tracking-widest font-mono",
              degraded ? "text-amber-500" : "text-emerald-500"
            )}>
              {degraded ? "DEGRADED" : "LIVE"}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 p-4 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-2 gap-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          </div>
        ) : !feed ? (
          <div className="text-center text-xs font-mono text-muted-foreground">Data unavailable</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 p-3 border border-border/40 bg-background/30 rounded-md">
                <span className="text-[10px] uppercase font-mono text-muted-foreground">Equity</span>
                <span className="text-xl font-medium font-mono">{fmtCurrency(m?.equityUSD)}</span>
              </div>
              <div className="flex flex-col gap-1 p-3 border border-border/40 bg-background/30 rounded-md">
                <span className="text-[10px] uppercase font-mono text-muted-foreground">Cash Balance</span>
                <span className="text-xl font-medium font-mono">{fmtCurrency(m?.cashUSD)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1 p-2 border border-border/30 bg-background/20 rounded-md">
                <span className="text-[9px] uppercase font-mono text-muted-foreground">ROI</span>
                <span className={cn(
                  "text-xs font-mono font-medium",
                  (m?.roiPct ?? 0) > 0 ? "text-emerald-500" : (m?.roiPct ?? 0) < 0 ? "text-destructive" : ""
                )}>{fmtPct(m?.roiPct)}</span>
              </div>
              <div className="flex flex-col gap-1 p-2 border border-border/30 bg-background/20 rounded-md">
                <span className="text-[9px] uppercase font-mono text-muted-foreground">Active Trades</span>
                <span className="text-xs font-mono font-medium">{fmtNum(m?.activeTrades)}</span>
              </div>
              <div className="flex flex-col gap-1 p-2 border border-border/30 bg-background/20 rounded-md">
                <span className="text-[9px] uppercase font-mono text-muted-foreground">Win Rate</span>
                <span className="text-xs font-mono font-medium">{fmtPct(m?.winRate)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] uppercase font-mono text-muted-foreground">Recent Executions</div>
              <div className="space-y-2">
                {feed.recentCloses.length === 0 ? (
                  <div className="text-xs text-muted-foreground font-mono">No recent closes.</div>
                ) : (
                  feed.recentCloses.slice(0, 3).map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between p-2 text-xs border border-border/30 bg-background/20 rounded-md font-mono">
                      <div className="flex items-center gap-2">
                        {trade.side.toUpperCase() === "LONG" ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <span>{trade.symbol}</span>
                      </div>
                      <span className={cn(
                        trade.realizedPnL > 0 ? "text-emerald-500" : trade.realizedPnL < 0 ? "text-destructive" : ""
                      )}>
                        {fmtCurrency(trade.realizedPnL)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
