import { useGetLatestSignal, useGenerateSignal, useExecuteTrade, useGetSettings, getGetLatestSignalQueryKey, getGetTradesQueryKey, getGetPortfolioQueryKey, getGetOpenTradesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { ArrowUpRight, ArrowDownRight, Minus, RefreshCw, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

export function SignalPanel({ symbol, timeframe }: { symbol: string, timeframe: string }) {
  const queryClient = useQueryClient();
  
  const { data: signal, isLoading: isSignalLoading } = useGetLatestSignal(
    { symbol, timeframe },
    { query: { queryKey: getGetLatestSignalQueryKey({ symbol, timeframe }), refetchInterval: 10000 } }
  );

  const { data: settings } = useGetSettings();
  const generateSignal = useGenerateSignal();
  const executeTrade = useExecuteTrade();

  const handleGenerate = () => {
    generateSignal.mutate(
      { data: { symbol, timeframe } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLatestSignalQueryKey({ symbol, timeframe }) });
        }
      }
    );
  };

  const handleApprove = () => {
    if (!signal || !settings) return;
    executeTrade.mutate(
      { 
        data: { 
          symbol: signal.symbol, 
          side: signal.action as any, 
          amount: settings.allocation,
          signalId: signal.id,
          stopLoss: signal.price * (1 - (settings.stopLossPercent / 100)),
          takeProfit: signal.price * (1 + (settings.takeProfitPercent / 100)),
          mode: settings.liveTrading ? 'manual' : 'simulated'
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTradesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOpenTradesQueryKey() });
        }
      }
    );
  };

  const actionColor = signal?.action === 'BUY' ? 'text-success border-success/30 bg-success/10' : 
                      signal?.action === 'SELL' ? 'text-destructive border-destructive/30 bg-destructive/10' : 
                      'text-muted-foreground border-border bg-muted/20';

  const trendIcon = signal?.trend === 'bullish' ? <ArrowUpRight className="text-success" /> :
                    signal?.trend === 'bearish' ? <ArrowDownRight className="text-destructive" /> :
                    <Minus className="text-muted-foreground" />;

  return (
    <Card className="flex-1 border-border/50 bg-[#0B0F14]/80 backdrop-blur flex flex-col">
      <CardHeader className="py-3 px-4 border-b border-border/50 shrink-0 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          AI Analysis
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleGenerate} disabled={generateSignal.isPending}>
          <RefreshCw className={`w-3.5 h-3.5 ${generateSignal.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      
      <CardContent className="p-4 flex-1 flex flex-col gap-4">
        {signal ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-2xl font-bold tracking-tighter px-3 py-1 rounded border inline-block ${actionColor}`}>
                  {signal.action}
                </div>
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1 font-mono">
                  {formatDistanceToNow(new Date(signal.timestamp), { addSuffix: true })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-mono">${signal.price.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-1 uppercase font-bold">
                  {trendIcon} {signal.trend}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Confidence</span>
                <span className="font-mono font-bold text-primary">{signal.confidence}%</span>
              </div>
              <Progress value={signal.confidence} className="h-1.5 bg-primary/20" />
            </div>

            <div className="bg-black/30 p-3 rounded text-sm border border-border/30 text-muted-foreground italic line-clamp-3">
              "{signal.reasoning}"
            </div>

            {signal.indicators && (
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {Object.entries(signal.indicators).map(([k, v]) => (
                  <div key={k} className="flex justify-between p-1.5 rounded bg-muted/20 border border-border/30">
                    <span className="uppercase text-muted-foreground">{k}</span>
                    <span className="font-bold">{v.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto pt-4">
              {settings?.autoMode ? (
                <div className="text-center p-3 rounded border border-dashed border-primary/30 text-primary text-xs font-bold uppercase tracking-wider bg-primary/5">
                  Auto Execution Active
                </div>
              ) : (
                <Button 
                  className={`w-full font-bold uppercase tracking-wider ${
                    signal.action === 'BUY' ? 'bg-success hover:bg-success/80 text-success-foreground' :
                    signal.action === 'SELL' ? 'bg-destructive hover:bg-destructive/80 text-destructive-foreground' :
                    'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                  disabled={signal.action === 'HOLD' || executeTrade.isPending}
                  onClick={handleApprove}
                >
                  {executeTrade.isPending ? 'Executing...' : `Approve ${signal.action}`}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-40">
            {isSignalLoading ? (
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-2" />
            ) : (
              <p className="text-sm">No recent signals for {symbol}</p>
            )}
            <Button variant="outline" size="sm" className="mt-4" onClick={handleGenerate}>
              Generate Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}