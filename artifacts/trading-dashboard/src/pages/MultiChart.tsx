import { authFetch } from "@/lib/authFetch";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  LayoutGrid, Columns2, AlignJustify, Plus, X, Settings2,
  TrendingUp, TrendingDown, BarChart2, RefreshCw, ChevronDown,
  Layers, Clock, Check,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  time: number; open: number; high: number; low: number;
  close: number; volume: number;
}

interface ChartPoint {
  time: number; label: string;
  open: number; high: number; low: number; close: number;
  volume: number; ema9: number | null; ema21: number | null;
}

interface AssetConfig {
  symbol: string; label: string; color: string; enabled: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PRESET_ASSETS: AssetConfig[] = [
  { symbol: "BTCUSD", label: "BTC",  color: "#F7931A", enabled: true  },
  { symbol: "ETHUSD", label: "ETH",  color: "#627EEA", enabled: true  },
  { symbol: "SOLUSD", label: "SOL",  color: "#9945FF", enabled: true  },
  { symbol: "XRPUSD", label: "XRP",  color: "#00AAE4", enabled: false },
  { symbol: "ADAUSD", label: "ADA",  color: "#0033AD", enabled: false },
  { symbol: "LINKUSD",label: "LINK", color: "#2A5ADA", enabled: false },
  { symbol: "DOTUSD", label: "DOT",  color: "#E6007A", enabled: false },
  { symbol: "AVAXUSD",label: "AVAX", color: "#E84142", enabled: false },
];

const TIMEFRAMES = [
  { value: "5m",  label: "5m"  },
  { value: "15m", label: "15m" },
  { value: "1h",  label: "1H"  },
  { value: "4h",  label: "4H"  },
  { value: "1d",  label: "1D"  },
];

const CANDLE_LIMITS: Record<string, number> = {
  "5m": 120, "15m": 100, "1h": 90, "4h": 80, "1d": 60,
};

const LAYOUTS = [
  { id: "1col", icon: AlignJustify, label: "1 column",  cols: 1 },
  { id: "2col", icon: Columns2,     label: "2 columns", cols: 2 },
  { id: "3col", icon: LayoutGrid,   label: "3 columns", cols: 3 },
] as const;
type LayoutId = "1col" | "2col" | "3col";

const STORAGE_KEY = "multichart_config_v2";

// ── EMA helper ───────────────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): (number | null)[] {
  if (values.length < period) return new Array(values.length).fill(null);
  const k      = 2 / (period + 1);
  const result: (number | null)[] = new Array(period - 1).fill(null);
  let ema      = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function buildChartData(candles: Candle[]): ChartPoint[] {
  const closes = candles.map((c) => c.close);
  const ema9s  = calcEMA(closes, 9);
  const ema21s = calcEMA(closes, 21);
  return candles.map((c, i) => ({
    time:   c.time * 1000,
    label:  formatTime(c.time),
    open:   c.open,
    high:   c.high,
    low:    c.low,
    close:  c.close,
    volume: c.volume,
    ema9:   ema9s[i],
    ema21:  ema21s[i],
  }));
}

function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const da = d.getDate().toString().padStart(2, "0");
  const hr = d.getHours().toString().padStart(2, "0");
  const mn = d.getMinutes().toString().padStart(2, "0");
  return `${mo}/${da} ${hr}:${mn}`;
}

function fmtPrice(v: number) {
  return v >= 10000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
       : v >= 100   ? v.toFixed(2)
       : v.toFixed(4);
}

function fmtVolume(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(2)}K`;
  return v.toFixed(4);
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPoint;
  if (!d) return null;
  const chg = ((d.close - d.open) / d.open) * 100;
  return (
    <div className="bg-card border border-border/60 rounded-lg p-3 shadow-xl text-xs space-y-1.5 min-w-[160px]">
      <div className="text-muted-foreground/70 font-mono text-[10px] pb-1 border-b border-border/30">{label}</div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground/60">O</span><span className="font-mono">{fmtPrice(d.open)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-emerald-400/80">H</span><span className="font-mono text-emerald-400">{fmtPrice(d.high)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-red-400/80">L</span><span className="font-mono text-red-400">{fmtPrice(d.low)}</span></div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground/60">C</span>
        <span className={`font-mono font-bold ${chg >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtPrice(d.close)}</span>
      </div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground/60">Vol</span><span className="font-mono">{fmtVolume(d.volume)}</span></div>
      {d.ema9  != null && <div className="flex justify-between gap-4"><span style={{ color: "#fbbf24" }}>EMA9</span><span className="font-mono">{fmtPrice(d.ema9)}</span></div>}
      {d.ema21 != null && <div className="flex justify-between gap-4"><span style={{ color: "#60a5fa" }}>EMA21</span><span className="font-mono">{fmtPrice(d.ema21)}</span></div>}
    </div>
  );
}

// ── Single asset chart ────────────────────────────────────────────────────────

function AssetChart({
  asset, timeframe, layout, onRemove,
}: {
  asset: AssetConfig; timeframe: string; layout: LayoutId; onRemove: () => void;
}) {
  const limit = CANDLE_LIMITS[timeframe] ?? 100;

  const { data: candles, isLoading, isFetching, refetch } = useQuery<Candle[]>({
    queryKey: ["candles", asset.symbol, timeframe, limit],
    queryFn:  () =>
      authFetch(`/api/candles?symbol=${asset.symbol}&timeframe=${timeframe}&limit=${limit}`)
        .then((r) => r.json()),
    refetchInterval: timeframe === "5m" ? 30_000 : timeframe === "15m" ? 60_000 : 120_000,
    staleTime: 20_000,
  });

  const chartData  = candles ? buildChartData(candles) : [];
  const lastCandle = chartData[chartData.length - 1];
  const firstClose = chartData[0]?.close;
  const lastClose  = lastCandle?.close;
  const pctChange  = firstClose && lastClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
  const isUp       = (pctChange ?? 0) >= 0;

  // Tick reducer: show ~6 ticks
  const tickInterval = Math.max(1, Math.floor(chartData.length / 6));
  const xTicks = chartData
    .filter((_, i) => i % tickInterval === 0 || i === chartData.length - 1)
    .map((d) => d.label);

  const chartHeight = layout === "1col" ? 340 : layout === "2col" ? 280 : 240;

  // Y-axis domain with padding
  const prices = chartData.flatMap((d) => [d.close, d.ema9, d.ema21].filter(Boolean) as number[]);
  const pMin   = prices.length ? Math.min(...prices) : 0;
  const pMax   = prices.length ? Math.max(...prices) : 1;
  const pad    = (pMax - pMin) * 0.04;
  const yDomain: [number, number] = [pMin - pad, pMax + pad];

  const maxVol = chartData.length ? Math.max(...chartData.map((d) => d.volume)) : 1;

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
          style={{ backgroundColor: asset.color + "22", color: asset.color }}
        >
          {asset.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm leading-none">{asset.symbol.replace("USD", "/USD")}</span>
            {pctChange !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded ${
                isUp ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
              }`}>
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isUp ? "+" : ""}{pctChange.toFixed(2)}%
              </span>
            )}
            {isFetching && <RefreshCw className="w-3 h-3 text-muted-foreground/40 animate-spin" />}
          </div>
          {lastClose && (
            <div className="text-xs text-muted-foreground/60 font-mono mt-0.5">
              ${fmtPrice(lastClose)}
            </div>
          )}
        </div>
        {/* Legend pills */}
        <div className="hidden sm:flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: asset.color }} />Price</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded inline-block bg-amber-400" />EMA9</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded inline-block bg-blue-400" />EMA21</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-500/15 text-muted-foreground/40 hover:text-red-400 transition-colors"
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chart */}
      <div className="flex-1 px-1 pt-2 pb-1">
        {isLoading ? (
          <div className="flex items-center justify-center text-muted-foreground/40 text-sm" style={{ height: chartHeight }}>
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground/40 text-sm" style={{ height: chartHeight }}>
            No data for {asset.symbol}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={`grad-${asset.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={asset.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={asset.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />

              <XAxis
                dataKey="label"
                ticks={xTicks}
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                height={22}
              />

              {/* Price Y-axis (left) */}
              <YAxis
                yAxisId="price"
                orientation="left"
                domain={yDomain}
                tickFormatter={(v) => fmtPrice(v)}
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={62}
              />

              {/* Volume Y-axis (right, shrunk to bottom 25%) */}
              <YAxis
                yAxisId="vol"
                orientation="right"
                domain={[0, maxVol * 4.5]}
                tick={false}
                axisLine={false}
                tickLine={false}
                width={0}
              />

              <Tooltip content={<ChartTooltip />} />

              {/* Volume bars */}
              <Bar
                yAxisId="vol"
                dataKey="volume"
                fill={asset.color}
                fillOpacity={0.25}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />

              {/* Price line */}
              <Line
                yAxisId="price"
                dataKey="close"
                stroke={asset.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Price"
              />

              {/* EMA 9 */}
              <Line
                yAxisId="price"
                dataKey="ema9"
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                isAnimationActive={false}
                connectNulls
                name="EMA 9"
              />

              {/* EMA 21 */}
              <Line
                yAxisId="price"
                dataKey="ema21"
                stroke="#60a5fa"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
                name="EMA 21"
              />

              {/* Current price reference line */}
              {lastClose && (
                <ReferenceLine
                  yAxisId="price"
                  y={lastClose}
                  stroke={asset.color}
                  strokeDasharray="2 4"
                  strokeOpacity={0.5}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer stats */}
      {lastCandle && (
        <div className="flex items-center gap-4 px-4 pb-2.5 pt-1 text-[10px] text-muted-foreground/50 font-mono border-t border-border/20 mt-1">
          <span>O <span className="text-foreground/60">{fmtPrice(lastCandle.open)}</span></span>
          <span className="text-emerald-400/70">H {fmtPrice(lastCandle.high)}</span>
          <span className="text-red-400/70">L {fmtPrice(lastCandle.low)}</span>
          <span>C <span className="text-foreground/70">{fmtPrice(lastCandle.close)}</span></span>
          <span className="ml-auto flex items-center gap-1"><BarChart2 className="w-3 h-3" />{fmtVolume(lastCandle.volume)}</span>
        </div>
      )}
    </div>
  );
}

// ── Config panel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  assets, timeframe, layout,
  onToggle, onAdd, onRemove, onTimeframe, onLayout,
}: {
  assets: AssetConfig[]; timeframe: string; layout: LayoutId;
  onToggle: (symbol: string) => void;
  onAdd: (symbol: string, label: string) => void;
  onRemove: (symbol: string) => void;
  onTimeframe: (tf: string) => void;
  onLayout: (l: LayoutId) => void;
}) {
  const [open, setOpen]        = useState(false);
  const [customSym, setCustomSym] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customErr, setCustomErr]  = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAddCustom = () => {
    const sym = customSym.trim().toUpperCase();
    const lbl = customLabel.trim().toUpperCase() || sym.replace("USD", "");
    if (!sym) { setCustomErr("Enter a symbol"); return; }
    if (assets.find((a) => a.symbol === sym)) { setCustomErr("Already exists"); return; }
    setCustomErr("");
    onAdd(sym, lbl);
    setCustomSym("");
    setCustomLabel("");
  };

  const enabledCount = assets.filter((a) => a.enabled).length;

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/40 bg-card text-xs text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        Configure
        <span className="font-bold text-primary">{enabledCount}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border/50 rounded-xl shadow-2xl z-50 p-4 space-y-4">
          {/* Layout */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">Layout</div>
            <div className="flex gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onLayout(l.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] transition-colors ${
                    layout === l.id
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  <l.icon className="w-4 h-4" />
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Timeframe
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => onTimeframe(tf.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                    timeframe === tf.value
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Asset list */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2 flex items-center gap-1.5">
              <Layers className="w-3 h-3" /> Assets
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {assets.map((a) => {
                const isPreset = PRESET_ASSETS.some((p) => p.symbol === a.symbol);
                return (
                  <div key={a.symbol} className="flex items-center gap-2">
                    <button
                      onClick={() => onToggle(a.symbol)}
                      className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-xs transition-colors text-left ${
                        a.enabled
                          ? "border-border/40 bg-muted/10"
                          : "border-border/20 opacity-50 hover:opacity-70"
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ backgroundColor: a.color + "30", color: a.color }}
                      >
                        {a.label}
                      </div>
                      <span className="flex-1">{a.symbol.replace("USD", "/USD")}</span>
                      {a.enabled && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                    {!isPreset && (
                      <button
                        onClick={() => onRemove(a.symbol)}
                        className="p-1.5 rounded-lg border border-border/30 text-muted-foreground/40 hover:text-red-400 hover:border-red-500/30 transition-colors shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add custom symbol */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">Add Custom Asset</div>
            <div className="flex gap-1.5">
              <input
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-border/40 bg-background text-xs placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40"
                placeholder="Symbol (e.g. XMRUSD)"
                value={customSym}
                onChange={(e) => setCustomSym(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
              />
              <input
                className="w-16 px-2 py-1.5 rounded-lg border border-border/40 bg-background text-xs placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40"
                placeholder="Tag"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
              />
              <button
                onClick={handleAddCustom}
                className="px-2.5 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {customErr && <p className="text-[10px] text-red-400 mt-1">{customErr}</p>}
            <p className="text-[10px] text-muted-foreground/40 mt-1.5">
              Use Kraken format: BTCUSD, XRPUSD, XMRUSD, etc.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Persistent state helpers ──────────────────────────────────────────────────

function loadState(): { assets: AssetConfig[]; timeframe: string; layout: LayoutId } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with presets so new presets are always available
      const existingSymbols = new Set<string>(parsed.assets?.map((a: AssetConfig) => a.symbol));
      const merged = [
        ...(parsed.assets ?? []),
        ...PRESET_ASSETS.filter((p) => !existingSymbols.has(p.symbol)),
      ];
      return { assets: merged, timeframe: parsed.timeframe ?? "1h", layout: parsed.layout ?? "3col" };
    }
  } catch {}
  return { assets: PRESET_ASSETS, timeframe: "1h", layout: "3col" };
}

// ── Random color for custom assets ───────────────────────────────────────────

const EXTRA_COLORS = [
  "#10b981","#8b5cf6","#ec4899","#f97316","#06b6d4",
  "#84cc16","#a855f7","#14b8a6","#fb923c","#e879f9",
];
let _colorIdx = 0;
function nextColor() { return EXTRA_COLORS[_colorIdx++ % EXTRA_COLORS.length]; }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MultiChart() {
  const initialState = loadState();
  const [assets,    setAssets]    = useState<AssetConfig[]>(initialState.assets);
  const [timeframe, setTimeframe] = useState<string>(initialState.timeframe);
  const [layout,    setLayout]    = useState<LayoutId>(initialState.layout);

  // Persist whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ assets, timeframe, layout }));
  }, [assets, timeframe, layout]);

  const enabledAssets = assets.filter((a) => a.enabled);

  const handleToggle = useCallback((symbol: string) => {
    setAssets((prev) => prev.map((a) => a.symbol === symbol ? { ...a, enabled: !a.enabled } : a));
  }, []);

  const handleAdd = useCallback((symbol: string, label: string) => {
    const color = nextColor();
    setAssets((prev) => [...prev, { symbol, label, color, enabled: true }]);
  }, []);

  const handleRemove = useCallback((symbol: string) => {
    setAssets((prev) => prev.filter((a) => a.symbol !== symbol));
  }, []);

  const colsClass =
    layout === "1col" ? "grid-cols-1"
    : layout === "2col" ? "grid-cols-1 lg:grid-cols-2"
    : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="p-5 space-y-5 max-w-screen-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <BarChart2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-wide">Multi-Asset Chart</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono border bg-primary/10 text-primary border-primary/30">
              MODULE 18
            </span>
          </div>
          <p className="text-sm text-muted-foreground/60">
            {enabledAssets.length} asset{enabledAssets.length !== 1 ? "s" : ""} · {
              TIMEFRAMES.find((t) => t.value === timeframe)?.label
            } candles · EMA 9/21 trend lines · Volume overlay
          </p>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick timeframe tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border/30 bg-card">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                  timeframe === tf.value
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground/60 hover:text-foreground"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Quick layout tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border/30 bg-card">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLayout(l.id)}
                className={`p-1.5 rounded-md transition-colors ${
                  layout === l.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground/60 hover:text-foreground"
                }`}
                title={l.label}
              >
                <l.icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          <ConfigPanel
            assets={assets}
            timeframe={timeframe}
            layout={layout}
            onToggle={handleToggle}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onTimeframe={setTimeframe}
            onLayout={setLayout}
          />
        </div>
      </div>

      {/* ── Chart grid ── */}
      {enabledAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 border border-border/30 rounded-xl text-muted-foreground/40">
          <BarChart2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">No assets selected — open Configure to enable some</p>
        </div>
      ) : (
        <div className={`grid ${colsClass} gap-4`}>
          {enabledAssets.map((asset) => (
            <AssetChart
              key={asset.symbol}
              asset={asset}
              timeframe={timeframe}
              layout={layout}
              onRemove={() => handleToggle(asset.symbol)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
