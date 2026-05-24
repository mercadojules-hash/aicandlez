import { authFetch } from "@/lib/authFetch";
import { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Radio, RefreshCw, TrendingUp, TrendingDown, Activity, Clock, Layers } from "lucide-react";

const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h"];
const SYMBOL_LABELS: Record<string, string> = {
  BTCUSD: "BTC / USD",
  ETHUSD: "ETH / USD",
  SOLUSD: "SOL / USD",
};
const REFRESH_INTERVAL_MS = 15_000;

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Ticker {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  lastUpdated: number;
}

interface MarketResponse {
  symbol: string;
  timeframe: string;
  ticker: Ticker;
  candles: Candle[];
  count: number;
  source: string;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(symbol: string, price: number) {
  if (symbol === "SOLUSD") return `$${fmt(price, 2)}`;
  if (symbol === "ETHUSD") return `$${fmt(price, 2)}`;
  return `$${fmt(price, 2)}`;
}

function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("en-US", { hour12: false });
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtVolume(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toFixed(4);
}

function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function SparklineChart({ candles, positive }: { candles: Candle[]; positive: boolean }) {
  const data = candles.map((c) => ({ close: c.close }));
  const color = positive ? "#22d3ee" : "#f87171";

  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={["auto", "auto"]} hide />
        <Tooltip
          contentStyle={{ background: "#0f1117", border: "1px solid #1f2937", borderRadius: 6, fontSize: 11 }}
          formatter={(v: number) => [`$${fmt(v, 2)}`, ""]}
          labelFormatter={() => ""}
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={1.5}
          fill="url(#sparkGrad)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function MarketData() {
  const [symbol, setSymbol] = useState("BTCUSD");
  const [timeframe, setTimeframe] = useState("1h");
  const [data, setData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (sym: string, tf: string, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/market-data/${sym}?timeframe=${tf}&limit=100`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json: MarketResponse = await res.json();
      setData(json);
      setLastFetch(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(symbol, timeframe);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(symbol, timeframe, true), REFRESH_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [symbol, timeframe, fetchData]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const ticker = data?.ticker;
  const candles = data?.candles ?? [];
  const positive = (ticker?.changePercent24h ?? 0) >= 0;
  const TrendIcon = positive ? TrendingUp : TrendingDown;
  const trendColor = positive ? "text-cyan-400" : "text-red-400";

  return (
    <div className="flex flex-col gap-5 max-w-[1100px]">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-primary tracking-widest uppercase">Module 02 · Market Data</span>
          </div>
          <h1 className="text-xl font-bold">Live Market Feed</h1>
          <p className="text-sm text-muted-foreground">Real-time OHLCV data · Source: Alpaca Markets</p>
        </div>

        <div className="flex items-center gap-2">
          {lastFetch && (
            <span className="text-xs text-muted-foreground/50 font-mono">
              Updated {timeSince(lastFetch)}
            </span>
          )}
          <button
            onClick={() => fetchData(symbol, timeframe)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border/40 hover:bg-card transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Symbol + Timeframe selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-border/40 overflow-hidden">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`px-4 py-1.5 text-xs font-mono font-semibold transition-colors ${
                symbol === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              {s.replace("USD", "/USD")}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-border/40 overflow-hidden">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                timeframe === tf
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Auto-refresh every 15s
        </div>
      </div>

      {error && (
        <div className="border border-red-900/40 bg-red-950/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Price hero section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main price card */}
        <div className="lg:col-span-2 bg-card border border-border/40 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono mb-1">{SYMBOL_LABELS[symbol]}</div>
              {loading && !ticker ? (
                <div className="h-10 w-48 bg-border/20 rounded animate-pulse" />
              ) : (
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-bold font-mono tracking-tight">
                    {ticker ? fmtPrice(symbol, ticker.price) : "—"}
                  </span>
                  {ticker && (
                    <div className={`flex items-center gap-1 pb-1 ${trendColor}`}>
                      <TrendIcon className="w-4 h-4" />
                      <span className="text-sm font-mono font-semibold">
                        {positive ? "+" : ""}{fmt(ticker.changePercent24h, 2)}%
                      </span>
                      <span className="text-xs opacity-60">24h</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-xs text-muted-foreground/50 font-mono mb-1 flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" />
                {tick > -1 && lastFetch ? timeSince(lastFetch) : "—"}
              </div>
              {ticker && (
                <div className="text-xs font-mono">
                  <span className="text-muted-foreground/50">Bid </span>
                  <span className="text-green-400">${fmt(ticker.bid, 2)}</span>
                  <span className="text-muted-foreground/30 mx-1">·</span>
                  <span className="text-muted-foreground/50">Ask </span>
                  <span className="text-red-400">${fmt(ticker.ask, 2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sparkline */}
          {candles.length > 0 && (
            <SparklineChart candles={candles} positive={positive} />
          )}
          {loading && candles.length === 0 && (
            <div className="h-20 bg-border/10 rounded animate-pulse" />
          )}
        </div>

        {/* Stats column */}
        <div className="flex flex-col gap-3">
          {[
            { label: "24h High", value: ticker ? `$${fmt(ticker.high24h, 2)}` : "—", color: "text-green-400" },
            { label: "24h Low",  value: ticker ? `$${fmt(ticker.low24h, 2)}` : "—",  color: "text-red-400"   },
            { label: "24h Vol",  value: ticker ? fmtVolume(ticker.volume24h) : "—",  color: "text-foreground" },
            { label: "24h Chg",  value: ticker ? `${positive ? "+" : ""}$${fmt(Math.abs(ticker.change24h), 2)}` : "—", color: trendColor },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border/40 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              {loading && !ticker ? (
                <div className="h-4 w-20 bg-border/20 rounded animate-pulse" />
              ) : (
                <span className={`text-sm font-mono font-semibold ${color}`}>{value}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Candles table */}
      <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="text-sm font-semibold">OHLCV Candles</span>
            <span className="text-xs text-muted-foreground/40 font-mono">· {timeframe} · last {candles.length}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40 font-mono">
            <Activity className="w-3 h-3" />
            {symbol.replace("USD", "/USD")} via Alpaca
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border/20">
                {["Time", "Date", "Open", "High", "Low", "Close", "Volume", "Dir"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-muted-foreground/50 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && candles.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/10">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-2.5">
                          <div className="h-3 bg-border/15 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : [...candles].reverse().slice(0, 25).map((c, i) => {
                    const bull = c.close >= c.open;
                    const pct = Math.abs(((c.close - c.open) / c.open) * 100);
                    return (
                      <tr key={c.time} className={`border-b border-border/10 hover:bg-border/5 transition-colors ${i === 0 ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-2 text-muted-foreground/60">{fmtTime(c.time)}</td>
                        <td className="px-4 py-2 text-muted-foreground/40">{fmtDate(c.time)}</td>
                        <td className="px-4 py-2">${fmt(c.open, 2)}</td>
                        <td className="px-4 py-2 text-green-400">${fmt(c.high, 2)}</td>
                        <td className="px-4 py-2 text-red-400">${fmt(c.low, 2)}</td>
                        <td className={`px-4 py-2 font-semibold ${bull ? "text-cyan-400" : "text-red-400"}`}>${fmt(c.close, 2)}</td>
                        <td className="px-4 py-2 text-muted-foreground/70">{fmtVolume(c.volume)}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${bull ? "bg-cyan-400/10 text-cyan-400" : "bg-red-400/10 text-red-400"}`}>
                            {bull ? "▲" : "▼"} {pct.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
