import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, Play, ArrowDownUp, AlertCircle, Percent, DollarSign, Activity } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRunBacktest } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  symbol: z.string().min(1),
  days: z.coerce.number().min(1).max(365),
  allocation: z.coerce.number().min(10),
  stopLossPercent: z.coerce.number().min(0.1).max(50),
  takeProfitPercent: z.coerce.number().min(0.1).max(100),
  minConfidence: z.coerce.number().min(1).max(100),
});

export default function Backtest() {
  const runBacktest = useRunBacktest();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      symbol: "BTCUSDT",
      days: 30,
      allocation: 1000,
      stopLossPercent: 2,
      takeProfitPercent: 5,
      minConfidence: 75,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    runBacktest.mutate({ data: values });
  }

  const result = runBacktest.data;
  const isLoading = runBacktest.isPending;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <Card className="w-full md:w-80 shrink-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Play className="w-4 h-4 text-primary" />
                Run Simulation
              </CardTitle>
              <CardDescription>Test strategy against historical data</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Symbol</Label>
                  <Select 
                    value={form.watch("symbol")} 
                    onValueChange={(val) => form.setValue("symbol", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select symbol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BTCUSDT">BTC/USDT</SelectItem>
                      <SelectItem value="ETHUSDT">ETH/USDT</SelectItem>
                      <SelectItem value="SOLUSDT">SOL/USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Duration (Days)</Label>
                  <Select 
                    value={form.watch("days").toString()} 
                    onValueChange={(val) => form.setValue("days", Number(val))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 Days</SelectItem>
                      <SelectItem value="14">14 Days</SelectItem>
                      <SelectItem value="30">30 Days</SelectItem>
                      <SelectItem value="90">90 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Initial Allocation ($)</Label>
                  <Input type="number" {...form.register("allocation")} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Stop Loss (%)</Label>
                    <Input type="number" step="0.1" {...form.register("stopLossPercent")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Take Profit (%)</Label>
                    <Input type="number" step="0.1" {...form.register("takeProfitPercent")} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Min Confidence (%)</Label>
                  <Input type="number" {...form.register("minConfidence")} />
                </div>

                <Button type="submit" className="w-full font-bold mt-2" disabled={isLoading}>
                  {isLoading ? "Running..." : "RUN BACKTEST"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex-1 space-y-6 w-full">
            {result ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard 
                    title="Win Rate" 
                    value={`${result.winRate.toFixed(1)}%`} 
                    subtext={`${result.wins}W / ${result.losses}L`} 
                    trend={result.winRate > 50 ? "up" : "down"}
                  />
                  <StatCard 
                    title="Total Profit" 
                    value={`$${result.totalProfit.toFixed(2)}`} 
                    subtext={`${result.totalProfitPercent > 0 ? '+' : ''}${result.totalProfitPercent.toFixed(2)}%`}
                    trend={result.totalProfit > 0 ? "up" : "down"}
                  />
                  <StatCard 
                    title="Max Drawdown" 
                    value={`${result.maxDrawdown.toFixed(2)}%`} 
                    trend="down"
                    alert={result.maxDrawdown > 20}
                  />
                  <StatCard 
                    title="Total Trades" 
                    value={result.totalTrades.toString()} 
                  />
                </div>

                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-sm font-medium">Trade History ({result.symbol})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Side</TableHead>
                            <TableHead className="text-right">Entry</TableHead>
                            <TableHead className="text-right">Exit</TableHead>
                            <TableHead className="text-right">PnL</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.trades.map((trade) => (
                            <TableRow key={trade.id}>
                              <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(trade.timestamp), "MM/dd HH:mm")}
                              </TableCell>
                              <TableCell>
                                <span className={`font-bold text-xs ${trade.side === "BUY" ? "text-success" : "text-destructive"}`}>
                                  {trade.side}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">${trade.price.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {trade.pnl != null ? (
                                  <span className={trade.pnl >= 0 ? "text-success" : "text-destructive"}>
                                    {trade.pnl > 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                                  </span>
                                ) : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${
                                  trade.status === 'open' ? 'border-primary text-primary' : 
                                  trade.pnl && trade.pnl > 0 ? 'border-success/50 text-success' : 'border-destructive/50 text-destructive'
                                }`}>
                                  {trade.status.toUpperCase()}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {result.trades.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                No trades generated in this period. Try adjusting parameters.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center border border-border/50 border-dashed rounded-xl bg-card/20 text-muted-foreground">
                <Activity className="w-12 h-12 mb-4 opacity-20" />
                <p>Run a backtest to see historical performance</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtext, trend, alert }: { title: string, value: string, subtext?: string, trend?: "up"|"down", alert?: boolean }) {
  return (
    <Card className={`overflow-hidden relative ${alert ? 'border-destructive/50' : ''}`}>
      {alert && <div className="absolute top-0 right-0 w-full h-1 bg-destructive" />}
      <CardContent className="p-4 flex flex-col gap-1">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</span>
        <div className="flex items-end gap-2 mt-1">
          <span className={`text-2xl font-bold font-mono tracking-tight ${
            trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : ''
          }`}>
            {value}
          </span>
        </div>
        {subtext && (
          <span className="text-xs text-muted-foreground font-mono mt-1">{subtext}</span>
        )}
      </CardContent>
    </Card>
  );
}