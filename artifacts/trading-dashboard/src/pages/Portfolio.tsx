import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  BarChart3,
  Settings2,
  Zap,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Link } from "wouter";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PortfolioConfig {
  maxPositions:         number;
  maxExposurePct:       number;
  maxSinglePositionPct: number;
}

interface PositionView {
  id:               string;
  symbol:           string;
  displayName:      string;
  side:             "BUY" | "SELL";
  quantity:         number;
  entryPrice:       number;
  entryTime:        number;
  sizeUSD:          number;
  currentPrice:     number;
  marketValue:      number;
  unrealizedPnL:    number;
  unrealizedPnLPct: number;
  allocationPct:    number;
  isOversized:      boolean;
}

interface AllocationItem {
  label:    string;
  valueUSD: number;
  pct:      number;
  type:     "position" | "cash";
  pnl?:     number;
  pnlPct?:  number;
}

interface PortfolioOverview {
  config: PortfolioConfig;
  portfolio: {
    totalValue:        number;
    cashBalance:       number;
    cashPct:           number;
    positionValue:     number;
    exposurePct:       number;
    totalPnL:          number;
    totalPnLPct:       number;
    unrealizedPnL:     number;
    realizedPnL:       number;
    positionCount:     number;
    capacityRemaining: number;
    positionsFull:     boolean;
    exposureBreached:  boolean;
    startingBalance:   number;
  };
  positions:  PositionView[];
  allocation: AllocationItem[];
  fetchedAt:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ASSET_COLORS: Record<string, { bar: string; text: string; dot: string }> = {
  BTC:  { bar: "bg-amber-500",   text: "text-amber-400",   dot: "bg-amber-400"   },
  ETH:  { bar: "bg-blue-500",    text: "text-blue-400",    dot: "bg-blue-400"    },
  SOL:  { bar: "bg-purple-500",  text: "text-purple-400",  dot: "bg-purple-400"  },
  Cash: { bar: "bg-slate-600",   text: "text-slate-400",   dot: "bg-slate-500"   },
};

function pnlColor(v: number) { return v >= 0 ? "text-emerald-400" : "text-red-400"; }
function pnlSign(v: number)  { return v >= 0 ? "+" : ""; }
function fmtUSD(v: number)   { return `$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`; }
function fmtPct(v: number)   { return `${pnlSign(v)}${v.toFixed(2)}%`; }
function timeAgo(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Config panel (local editable state) ──────────────────────────────────────

function ConfigPanel({ cfg, onSave }: { cfg: PortfolioConfig; onSave: (c: Partial<PortfolioConfig>) => void }) {
  const [maxPos,   setMaxPos]   = useState(cfg.maxPositions);
  const [maxExp,   setMaxExp]   = useState(cfg.maxExposurePct);
  const [maxSingle, setMaxSingle] = useState(cfg.maxSinglePositionPct);
  const dirty = maxPos !== cfg.maxPositions || maxExp !== cfg.maxExposurePct || maxSingle !== cfg.maxSinglePositionPct;

  return (
    <Card className="bg-slate-900 border-slate-700/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-400" /> Portfolio Limits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400 font-medium">Max Positions</span>
            <span className="text-slate-200 font-mono font-bold">{maxPos}</span>
          </div>
          <Slider min={1} max={10} step={1} value={[maxPos]} onValueChange={([v]) => setMaxPos(v!)} className="accent-indigo-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>1</span><span>10</span></div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400 font-medium">Max Total Exposure</span>
            <span className="text-slate-200 font-mono font-bold">{maxExp}%</span>
          </div>
          <Slider min={10} max={100} step={5} value={[maxExp]} onValueChange={([v]) => setMaxExp(v!)} />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>10%</span><span>100%</span></div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400 font-medium">Max Single Position</span>
            <span className="text-slate-200 font-mono font-bold">{maxSingle}%</span>
          </div>
          <Slider min={5} max={100} step={5} value={[maxSingle]} onValueChange={([v]) => setMaxSingle(v!)} />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>5%</span><span>100%</span></div>
        </div>
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => onSave({ maxPositions: maxPos, maxExposurePct: maxExp, maxSinglePositionPct: maxSingle })}
          className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40"
        >
          Apply Limits
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Portfolio() {
  const qc = useQueryClient();

  const { data, isFetching, isError, error, refetch } = useQuery<PortfolioOverview>({
    queryKey:        ["portfolio-overview"],
    queryFn:         async () => {
      const r = await fetch("/api/portfolio/overview");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const configMutation = useMutation({
    mutationFn: async (patch: Partial<PortfolioOverview["config"]>) => {
      const r = await fetch("/api/portfolio/config", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio-overview"] }),
  });

  const p = data?.portfolio;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
            <Layers className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Portfolio Management</h1>
            <p className="text-sm text-slate-400">Allocation · Exposure Tracking · Position Limits</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm" variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-700 text-slate-300 hover:border-indigo-500/50 hover:text-indigo-400 h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Badge variant="outline" className="border-indigo-500/40 text-indigo-300 text-xs px-3 py-1">
            v1.0 · MODULE 10
          </Badge>
        </div>
      </div>

      {isError && (
        <div className="p-4 rounded-xl border border-red-800/50 bg-red-950/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {(error as Error).message}
        </div>
      )}

      {!data && isFetching && (
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
        </div>
      )}

      {data && p && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
          {/* ── Left: Main content ─────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Portfolio Value",
                  value: fmtUSD(p.totalValue),
                  sub:   `Started ${fmtUSD(p.startingBalance)}`,
                  icon:  <Wallet className="w-4 h-4 text-indigo-400" />,
                  color: "text-indigo-300",
                },
                {
                  label: "Total P&L",
                  value: `${pnlSign(p.totalPnL)}${fmtUSD(p.totalPnL)}`,
                  sub:   fmtPct(p.totalPnLPct),
                  icon:  p.totalPnL >= 0
                    ? <TrendingUp   className="w-4 h-4 text-emerald-400" />
                    : <TrendingDown className="w-4 h-4 text-red-400" />,
                  color: pnlColor(p.totalPnL),
                },
                {
                  label: "Exposure",
                  value: `${p.exposurePct.toFixed(1)}%`,
                  sub:   `Max ${data.config.maxExposurePct}%${p.exposureBreached ? " ⚠️" : ""}`,
                  icon:  <BarChart3 className={`w-4 h-4 ${p.exposureBreached ? "text-red-400" : "text-slate-400"}`} />,
                  color: p.exposureBreached ? "text-red-400" : "text-slate-200",
                },
                {
                  label: "Positions",
                  value: `${p.positionCount} / ${data.config.maxPositions}`,
                  sub:   p.positionsFull ? "Full — no new entries" : `${p.capacityRemaining} slot${p.capacityRemaining !== 1 ? "s" : ""} free`,
                  icon:  p.positionsFull
                    ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                    : <CheckCircle2  className="w-4 h-4 text-emerald-400" />,
                  color: p.positionsFull ? "text-amber-400" : "text-emerald-400",
                },
              ].map(card => (
                <Card key={card.label} className="bg-slate-900 border-slate-700/60">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">{card.icon}<span className="text-xs text-slate-400">{card.label}</span></div>
                    <p className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{card.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Allocation breakdown */}
            <Card className="bg-slate-900 border-slate-700/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-400" /> Allocation Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stacked bar */}
                <div className="h-7 rounded-lg overflow-hidden flex gap-0.5">
                  {data.allocation.map(item => {
                    const cols = ASSET_COLORS[item.label] ?? ASSET_COLORS["Cash"]!;
                    return (
                      <div
                        key={item.label}
                        className={`${cols.bar} transition-all duration-700 relative group`}
                        style={{ width: `${Math.max(item.pct, 0.5)}%` }}
                        title={`${item.label}: ${item.pct.toFixed(1)}% · ${fmtUSD(item.valueUSD)}`}
                      >
                        {item.pct > 8 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                            {item.pct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Item list */}
                <div className="space-y-2.5">
                  {data.allocation.map(item => {
                    const cols = ASSET_COLORS[item.label] ?? ASSET_COLORS["Cash"]!;
                    return (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${cols.dot} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={`font-semibold ${cols.text}`}>{item.label}</span>
                            <div className="flex items-center gap-3">
                              {item.pnl !== undefined && (
                                <span className={`font-mono text-[11px] ${pnlColor(item.pnl)}`}>
                                  {pnlSign(item.pnl)}{fmtUSD(item.pnl)} ({fmtPct(item.pnlPct ?? 0)})
                                </span>
                              )}
                              <span className="font-mono text-slate-300">{fmtUSD(item.valueUSD)}</span>
                              <span className="font-mono text-slate-400 w-12 text-right">{item.pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${cols.bar} transition-all duration-700`}
                              style={{ width: `${Math.max(item.pct, 0.5)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* P&L summary row */}
                <div className="flex gap-4 pt-2 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-500">Unrealized </span>
                    <span className={`font-mono font-semibold ${pnlColor(p.unrealizedPnL)}`}>
                      {pnlSign(p.unrealizedPnL)}{fmtUSD(p.unrealizedPnL)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Realized </span>
                    <span className={`font-mono font-semibold ${pnlColor(p.realizedPnL)}`}>
                      {pnlSign(p.realizedPnL)}{fmtUSD(p.realizedPnL)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Cash </span>
                    <span className="font-mono font-semibold text-slate-300">{fmtUSD(p.cashBalance)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Open positions table */}
            <Card className="bg-slate-900 border-slate-700/60">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-slate-400" /> Open Positions
                </CardTitle>
                <Link href="/simulation">
                  <button className="text-xs text-indigo-400 hover:text-indigo-300">Manage in Simulation →</button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {data.positions.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Wallet className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No open positions</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Place trades in the{" "}
                      <Link href="/simulation"><span className="text-indigo-400 hover:underline">Simulation</span></Link>{" "}
                      module to see them here
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800">
                          {["Asset", "Side", "Qty", "Entry", "Current", "Value", "Alloc %", "Unreal. P&L", "Opened"].map(h => (
                            <th key={h} className="text-left text-slate-400 font-medium px-4 py-2.5 whitespace-nowrap first:text-left text-right first-of-type:text-left">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.positions.map(pos => {
                          const cols = ASSET_COLORS[pos.displayName] ?? ASSET_COLORS["Cash"]!;
                          return (
                            <tr key={pos.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${cols.dot}`} />
                                  <span className={`font-semibold ${cols.text}`}>{pos.displayName}</span>
                                  {pos.isOversized && (
                                    <span title="Exceeds max single position size" className="text-amber-400">⚠</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-semibold ${pos.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                                  {pos.side}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-300">
                                {pos.quantity.toFixed(4)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-400">
                                {fmtUSD(pos.entryPrice)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-300">
                                {fmtUSD(pos.currentPrice)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-200 font-semibold">
                                {fmtUSD(pos.marketValue)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-300">
                                {pos.allocationPct.toFixed(1)}%
                              </td>
                              <td className={`px-4 py-3 text-right font-mono font-semibold ${pnlColor(pos.unrealizedPnL)}`}>
                                {pnlSign(pos.unrealizedPnL)}{fmtUSD(pos.unrealizedPnL)}
                                <span className="text-[10px] font-normal ml-1 opacity-70">
                                  ({fmtPct(pos.unrealizedPnLPct)})
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-slate-500 flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" />{timeAgo(pos.entryTime)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Config panel ─────────────────────────────────────────── */}
          <div className="space-y-4">
            <ConfigPanel
              cfg={data.config}
              onSave={patch => configMutation.mutate(patch)}
            />

            {configMutation.isError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                {(configMutation.error as Error).message}
              </p>
            )}
            {configMutation.isSuccess && (
              <p className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 rounded px-3 py-2">
                Limits updated successfully
              </p>
            )}

            {/* Exposure gauge */}
            <Card className="bg-slate-900 border-slate-700/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-400" /> Exposure Gauge
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Total Exposure", value: p.exposurePct, max: data.config.maxExposurePct, bar: "bg-indigo-500" },
                  { label: "Cash Reserve",   value: p.cashPct,     max: 100,                        bar: "bg-slate-500" },
                ].map(g => (
                  <div key={g.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">{g.label}</span>
                      <span className="font-mono text-slate-200">{g.value.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          g.label === "Total Exposure" && p.exposureBreached ? "bg-red-500" : g.bar
                        }`}
                        style={{ width: `${Math.min(g.value, 100)}%` }}
                      />
                    </div>
                    {g.label === "Total Exposure" && (
                      <div
                        className="h-3 border-l-2 border-amber-500/60 mt-[-10px] ml-0 pointer-events-none relative"
                        style={{ marginLeft: `${data.config.maxExposurePct}%` }}
                        title={`Limit: ${data.config.maxExposurePct}%`}
                      />
                    )}
                  </div>
                ))}

                {/* Position capacity */}
                <div className="pt-1 border-t border-slate-800">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Position Slots</span>
                    <span className="font-mono text-slate-200">{p.positionCount}/{data.config.maxPositions}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {Array.from({ length: data.config.maxPositions }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-3 rounded-sm ${i < p.positionCount ? "bg-indigo-500" : "bg-slate-800"}`}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
