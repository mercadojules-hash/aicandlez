import { useGetPortfolio, getGetPortfolioQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

export function PortfolioPanel() {
  const { data: portfolio, isLoading } = useGetPortfolio({
    query: {
      queryKey: getGetPortfolioQueryKey(),
      refetchInterval: 10000,
    }
  });

  if (isLoading || !portfolio) {
    return (
      <Card className="border-border/50 bg-[#0B0F14]/80 backdrop-blur flex flex-col h-full">
        <CardContent className="flex items-center justify-center flex-1">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  const isPnlPositive = portfolio.totalPnl >= 0;
  const isTodayPositive = portfolio.todayPnl >= 0;

  return (
    <Card className="border-border/50 bg-[#0B0F14]/80 backdrop-blur flex flex-col h-full">
      <CardHeader className="py-3 px-4 border-b border-border/50 shrink-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          Portfolio
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-2xl font-bold font-mono">${portfolio.balance.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground font-mono">Balance</div>
          </div>
          <div className={`text-right ${isPnlPositive ? "text-[#00ff88]" : "text-destructive"}`}>
            <div className="font-mono font-bold text-sm flex items-center gap-1 justify-end">
              {isPnlPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {isPnlPositive ? "+" : ""}{portfolio.totalPnl.toFixed(2)}
            </div>
            <div className="text-xs">
              ({isPnlPositive ? "+" : ""}{portfolio.totalPnlPercent.toFixed(2)}%)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/20 border border-border/30 rounded p-2">
            <div className="text-muted-foreground">Today PnL</div>
            <div className={`font-bold font-mono mt-0.5 ${isTodayPositive ? "text-[#00ff88]" : "text-destructive"}`}>
              {isTodayPositive ? "+" : ""}{portfolio.todayPnl.toFixed(4)}
            </div>
          </div>
          <div className="bg-muted/20 border border-border/30 rounded p-2">
            <div className="text-muted-foreground">Win Rate</div>
            <div className="font-bold font-mono mt-0.5 text-primary">{portfolio.winRate.toFixed(1)}%</div>
          </div>
          <div className="bg-muted/20 border border-border/30 rounded p-2">
            <div className="text-muted-foreground">Open Pos.</div>
            <div className="font-bold font-mono mt-0.5">{portfolio.openPositions}</div>
          </div>
          <div className="bg-muted/20 border border-border/30 rounded p-2">
            <div className="text-muted-foreground">Total Trades</div>
            <div className="font-bold font-mono mt-0.5">{portfolio.totalTrades}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
