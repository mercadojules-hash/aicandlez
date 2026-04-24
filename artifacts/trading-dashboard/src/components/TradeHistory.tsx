import { useGetTrades, useCloseTrade, getGetTradesQueryKey, getGetPortfolioQueryKey, getGetOpenTradesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { History, X } from "lucide-react";
import { format } from "date-fns";

export function TradeHistory() {
  const queryClient = useQueryClient();
  const { data: trades, isLoading } = useGetTrades({
    query: {
      queryKey: getGetTradesQueryKey(),
      refetchInterval: 10000,
    }
  });
  const closeTrade = useCloseTrade();

  const handleClose = (id: string) => {
    closeTrade.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTradesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOpenTradesQueryKey() });
        }
      }
    );
  };

  const recentTrades = trades?.slice(0, 8) ?? [];

  return (
    <Card className="border-border/50 bg-[#0B0F14]/80 backdrop-blur flex flex-col h-full overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/50 shrink-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="w-4 h-4 text-secondary" />
          Recent Trades
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : recentTrades.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            No trades yet
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {recentTrades.map((trade) => (
              <div key={trade.id} className="flex items-center justify-between px-4 py-2 text-xs hover:bg-muted/10 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] font-bold px-1.5 py-0 ${
                      trade.side === "BUY"
                        ? "border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/10"
                        : "border-destructive/40 text-destructive bg-destructive/10"
                    }`}
                  >
                    {trade.side}
                  </Badge>
                  <span className="font-mono truncate text-muted-foreground">{trade.symbol}</span>
                </div>

                <div className="flex items-center gap-3 ml-2">
                  {trade.pnl != null ? (
                    <span className={`font-mono font-bold ${trade.pnl >= 0 ? "text-[#00ff88]" : "text-destructive"}`}>
                      {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-mono">---</span>
                  )}

                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${
                      trade.status === "open"
                        ? "border-primary/40 text-primary bg-primary/10"
                        : trade.status === "closed"
                        ? "border-border/50 text-muted-foreground"
                        : "border-destructive/40 text-destructive"
                    }`}
                  >
                    {trade.status}
                  </Badge>

                  {trade.status === "open" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => handleClose(trade.id)}
                      disabled={closeTrade.isPending}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
