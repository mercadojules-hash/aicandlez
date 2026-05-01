import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Scan,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AssetScan {
  symbol:      string;
  displayName: string;
  price:       number;
  change1h:    number;
  change4h:    number;
  change24h:   number;
  ema9:        number;
  ema21:       number;
  rsi:         number;
  trend:       "BULLISH" | "BEARISH" | "NEUTRAL";
  momentum:    "STRONG" | "MODERATE" | "WEAK";
  confidence:  number;
  signal:      "BUY" | "NEUTRAL" | "AVOID";
  rank:        number;
  tradeStatus: "ACTIVE" | "WATCHING" | "SKIP";
  reasons:     string[];
  scannedAt:   number;
}

interface ScanResult {
  assets:      AssetScan[];
  activeCount: number;
  summary:     { buy: number; neutral: number; avoid: number };
  scannedAt:   number;
  cached:      boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ASSET_COLORS: Record<string, string> = {
  BTC: "text-amber-400",
  ETH: "text-blue-400",
  SOL: "text-purple-400",
};

const ASSET_BG: Record<string, string> = {
  BTC: "bg-amber-500/10 border-amber-500/25",
  ETH: "bg-blue-500/10 border-blue-500/25",
  SOL: "bg-purple-500/10 border-purple-500/25",
};

const ASSET_RING: Record<string, string> = {
  BTC: "ring-amber-500/30",
  ETH: "ring-blue-500/30",
  SOL: "ring-purple-500/30",
};

const ASSET_GAUGE: Record<string, string> = {
  BTC: "bg-amber-500",
  ETH: "bg-blue-500",
  SOL: "bg-purple-500",
};

function signalBadge(signal: AssetScan["signal"]) {
  if (signal === "BUY")     return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="w-3 h-3" /> BUY</span>;
  if (signal === "NEUTRAL") return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"><Minus className="w-3 h-3" /> NEUTRAL</span>;
  return                           <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30"><AlertTriangle className="w-3 h-3" /> AVOID</span>;
}

function statusBadge(status: AssetScan["tradeStatus"]) {
  if (status === "ACTIVE")   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 animate-pulse"><Zap className="w-3 h-3" /> ACTIVE</span>;
  if (status === "WATCHING") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-sky-600/20 text-sky-400 border border-sky-500/25"><Clock className="w-3 h-3" /> WATCHING</span>;
  return                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-700/50 text-slate-500 border border-slate-600/30">SKIP</span>;
}

function trendIcon(trend: AssetScan["trend"]) {
  if (trend === "BULLISH") return <TrendingUp  className="w-4 h-4 text-emerald-400" />;
  if (trend === "BEARISH") return <TrendingDown className="w-4 h-4 text-red-400" />;
  return                          <Minus        className="w-4 h-4 text-slate-400" />;
}

function changeColor(v: number) { return v >= 0 ? "text-emerald-400" : "text-red-400"; }
function changeFmt(v: number)   { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }

function confidenceColor(score: number) {
  if (score >= 60) return "text-emerald-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function rsiColor(rsi: number) {
  if (rsi < 40)  return "text-emerald-400";
  if (rsi > 70)  return "text-red-400";
  return "text-slate-300";
}

function rankMedal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  return "🥉";
}

function timeAgo(ts: number) {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 5)  return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

// ── Auto-refresh countdown ────────────────────────────────────────────────────

const REFRESH_SEC = 60;

function useCountdown(active: boolean, resetAt: number) {
  const [secs, setSecs] = useState(REFRESH_SEC);
  useEffect(() => {
    setSecs(REFRESH_SEC);
  }, [resetAt]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSecs(s => (s > 0 ? s - 1 : REFRESH_SEC)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}

// ── Symbol mapping (displayName → API symbol) ──────────────────────────────────

const SYMBOL_TO_API: Record<string, string> = {
  BTC: "BTCUSD",
  ETH: "ETHUSD",
  SOL: "SOLUSD",
};

// ── Mini sparkline chart for each asset card ───────────────────────────────────

interface CandlePoint { time: number; close: number; volume: number }

const CHART_STROKE: Record<string, string> = {
  BTC: "#f59e0b",   // amber-400
  ETH: "#60a5fa",   // blue-400
  SOL: "#a78bfa",   // purple-400
};

const CHART_FILL_UP  = "#10b981";   // emerald (bullish)
const CHART_FILL_DN  = "#ef4444";   // red (bearish)

function AssetMiniChart({ displayName }: { displayName: string }) {
  const apiSymbol = SYMBOL_TO_API[displayName] ?? "BTCUSD";
  const stroke    = CHART_STROKE[displayName] ?? "#64748b";

  const { data: candles, isLoading } = useQuery<CandlePoint[]>({
    queryKey: ["miniChart", apiSymbol],
    queryFn: async () => {
      const r = await fetch(`/api/candles?symbol=${apiSymbol}&timeframe=15m&limit=60`);
      if (!r.ok) throw new Error("candle fetch failed");
      return r.json();
    },
    staleTime:       30_000,
    refetchInterval: 60_000,
  });

  if (isLoading || !candles || candles.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center">
        <div className="w-4 h-4 border border-slate-600 border-t-slate-400 rounded-full animate-spin" />
      </div>
    );
  }

  const first = candles[0]!.close;
  const last  = candles[candles.length - 1]!.close;
  const bullish = last >= first;
  const fillColor = bullish ? CHART_FILL_UP : CHART_FILL_DN;
  const pctChg = ((last - first) / first) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] text-slate-500">15m chart (60 candles)</span>
        <span className={`text-[10px] font-mono font-semibold ${bullish ? "text-emerald-400" : "text-red-400"}`}>
          {bullish ? "+" : ""}{pctChg.toFixed(2)}%
        </span>
      </div>
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={candles} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <defs>
              <linearGradient id={`grad-${displayName}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={fillColor} stopOpacity={0.35} />
                <stop offset="95%" stopColor={fillColor} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const c = payload[0]?.payload as CandlePoint;
                return (
                  <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300">
                    ${c.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={stroke}
              strokeWidth={1.5}
              fill={`url(#grad-${displayName})`}
              dot={false}
              activeDot={{ r: 2, fill: stroke }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AssetScanner() {
  const [resetKey, setResetKey] = useState(0);

  const {
    data,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery<ScanResult>({
    queryKey: ["scanner-scan", resetKey],
    queryFn:  async () => {
      const r = await fetch("/api/scanner/scan", { method: "POST" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(e.error ?? "Scan failed");
      }
      return r.json();
    },
    refetchInterval: REFRESH_SEC * 1000,
    staleTime: 25_000,
  });

  const countdown = useCountdown(!isFetching && !!data, dataUpdatedAt);

  const handleRefresh = useCallback(() => {
    setResetKey(k => k + 1);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Scan className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Asset Scanner</h1>
            <p className="text-sm text-slate-400">BTC · ETH · SOL · Live EMA/RSI Analysis · Max 2 Active Trades</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && !isFetching && (
            <span className="text-xs text-slate-500">
              Auto-refresh in <span className="text-slate-300 font-mono">{countdown}s</span>
              &ensp;·&ensp;Scanned {timeAgo(data.scannedAt)}
              {data.cached && <span className="ml-1 text-slate-600">(cached)</span>}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isFetching}
            className="border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-400 h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Scanning…" : "Refresh Now"}
          </Button>
          <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-xs px-3 py-1">
            v1.0 · MODULE 09
          </Badge>
        </div>
      </div>

      {/* Loading state */}
      {isFetching && !data && (
        <div className="h-64 flex items-center justify-center border border-cyan-700/40 rounded-xl bg-cyan-950/10">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-cyan-300 text-sm font-medium">Scanning BTC · ETH · SOL…</p>
            <p className="text-cyan-600 text-xs mt-1">Fetching 100 candles per asset, computing EMA & RSI</p>
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="p-4 rounded-xl border border-red-800/50 bg-red-950/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {(error as Error).message}
        </div>
      )}

      {/* Summary bar */}
      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Active Trades",  value: `${data.activeCount} / 2`,     icon: <Zap       className="w-4 h-4 text-emerald-400" />, color: "text-emerald-400" },
              { label: "BUY Signals",    value: data.summary.buy,              icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, color: "text-emerald-400" },
              { label: "Neutral",        value: data.summary.neutral,           icon: <Minus     className="w-4 h-4 text-yellow-400"  />, color: "text-yellow-400"  },
              { label: "Avoid",          value: data.summary.avoid,             icon: <AlertTriangle className="w-4 h-4 text-red-400" />, color: "text-red-400"     },
            ].map(card => (
              <Card key={card.label} className="bg-slate-900 border-slate-700/60">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    {card.icon}
                    <span className="text-xs text-slate-400">{card.label}</span>
                  </div>
                  <p className={`text-2xl font-bold font-mono ${card.color}`}>{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Ranked asset cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {data.assets.map(asset => (
              <Card
                key={asset.symbol}
                className={`relative bg-slate-900 border ${ASSET_BG[asset.displayName] ?? "border-slate-700/60"} ${
                  asset.tradeStatus === "ACTIVE" ? `ring-1 ${ASSET_RING[asset.displayName]}` : ""
                }`}
              >
                {asset.tradeStatus === "ACTIVE" && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-t-lg" />
                )}

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold">{rankMedal(asset.rank)}</div>
                      <div>
                        <div className={`text-xl font-bold ${ASSET_COLORS[asset.displayName] ?? "text-slate-100"}`}>
                          {asset.displayName}
                        </div>
                        <div className="text-sm text-slate-400 font-mono">
                          ${asset.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          <span className={`ml-2 ${changeColor(asset.change1h)}`}>{changeFmt(asset.change1h)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 items-end">
                      {signalBadge(asset.signal)}
                      {statusBadge(asset.tradeStatus)}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Mini sparkline chart */}
                  <AssetMiniChart displayName={asset.displayName} />

                  {/* Confidence gauge */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                        <Target className="w-3 h-3" /> Confidence
                      </span>
                      <span className={`text-lg font-bold font-mono ${confidenceColor(asset.confidence)}`}>
                        {asset.confidence}
                        <span className="text-sm font-normal text-slate-500">/100</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${ASSET_GAUGE[asset.displayName] ?? "bg-slate-500"}`}
                        style={{ width: `${asset.confidence}%` }}
                      />
                    </div>
                  </div>

                  {/* Key metrics grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                      <div className="flex justify-center mb-0.5">{trendIcon(asset.trend)}</div>
                      <p className="text-xs text-slate-400">Trend</p>
                      <p className="text-xs font-semibold text-slate-200 mt-0.5">{asset.trend}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                      <Activity className="w-4 h-4 mx-auto mb-0.5 text-slate-400" />
                      <p className="text-xs text-slate-400">RSI</p>
                      <p className={`text-sm font-bold font-mono mt-0.5 ${rsiColor(asset.rsi)}`}>{asset.rsi}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                      <TrendingUp className="w-4 h-4 mx-auto mb-0.5 text-slate-400" />
                      <p className="text-xs text-slate-400">24h</p>
                      <p className={`text-sm font-bold font-mono mt-0.5 ${changeColor(asset.change24h)}`}>
                        {changeFmt(asset.change24h)}
                      </p>
                    </div>
                  </div>

                  {/* EMA row */}
                  <div className="flex gap-2 text-xs">
                    <div className="flex-1 bg-slate-800/40 rounded px-2 py-1.5 text-center">
                      <span className="text-slate-500">EMA 9 </span>
                      <span className="font-mono text-slate-200">${asset.ema9.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex-1 bg-slate-800/40 rounded px-2 py-1.5 text-center">
                      <span className="text-slate-500">EMA 21 </span>
                      <span className="font-mono text-slate-200">${asset.ema21.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex-1 bg-slate-800/40 rounded px-2 py-1.5 text-center">
                      <span className="text-slate-500">4h </span>
                      <span className={`font-mono font-semibold ${changeColor(asset.change4h)}`}>{changeFmt(asset.change4h)}</span>
                    </div>
                  </div>

                  {/* Signal reasons */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Analysis</p>
                    {asset.reasons.slice(0, 4).map((r, i) => {
                      const positive = r.includes("bullish") || r.includes("+") || r.includes("positive") || r.includes("uptrend") || r.includes("oversold");
                      const negative = r.includes("bearish") || r.includes("decline") || r.includes("overbought") || r.includes("selling");
                      return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${positive ? "bg-emerald-400" : negative ? "bg-red-400" : "bg-slate-500"}`} />
                          <span className={positive ? "text-emerald-300/80" : negative ? "text-red-300/80" : "text-slate-400"}>
                            {r}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* CTA */}
                  {asset.tradeStatus === "ACTIVE" && (
                    <Link href="/simulation">
                      <Button className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold mt-1">
                        <Zap className="w-3.5 h-3.5 mr-1.5" /> Open in Simulation
                      </Button>
                    </Link>
                  )}
                  {asset.tradeStatus === "WATCHING" && (
                    <div className="w-full h-8 flex items-center justify-center text-xs text-sky-400/70 border border-sky-700/30 rounded-md bg-sky-950/20">
                      <Clock className="w-3 h-3 mr-1.5" /> Watching — wait for stronger signal
                    </div>
                  )}
                  {asset.tradeStatus === "SKIP" && (
                    <div className="w-full h-8 flex items-center justify-center text-xs text-slate-500 border border-slate-700/30 rounded-md bg-slate-800/30">
                      <AlertTriangle className="w-3 h-3 mr-1.5" /> Skip — conditions unfavorable
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trade limit notice */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2">
            <Zap className="w-3.5 h-3.5 text-emerald-500/50" />
            Max 2 simultaneous ACTIVE trades enforced · Only BUY-signal assets qualify · Ranked by confidence score
          </div>
        </>
      )}
    </div>
  );
}
