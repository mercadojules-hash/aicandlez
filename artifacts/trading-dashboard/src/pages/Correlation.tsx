import { authFetch } from "@/lib/authFetch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
  ArrowUpRight,
  Minus,
  Activity,
  Zap,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CorrelationPair {
  asset1:       string;
  asset2:       string;
  correlation:  number;
  absCorr:      number;
  strength:     "HIGH" | "MODERATE" | "LOW";
  direction:    "POSITIVE" | "NEGATIVE";
  bothOpen:     boolean;
  overlapRisk:  boolean;
}

interface CorrelationMatrix {
  pairs:                CorrelationPair[];
  diversificationScore: number;
  overlapWarning:       boolean;
  strongPairs:          string[];
  candles:              number;
  computedAt:           number;
}

interface TrailingStopConfig {
  enabled:           boolean;
  activateAfterPct:  number;
  trailDistancePct:  number;
}

type StopStatus = "NOT_ACTIVATED" | "ACTIVE" | "TRIGGERED";

interface TrailingStopView {
  positionId:        string;
  symbol:            string;
  displayName:       string;
  entryPrice:        number;
  currentPrice:      number;
  highWatermark:     number;
  stopPrice:         number | null;
  distanceToStopPct: number | null;
  gainFromEntryPct:  number;
  activateAt:        number;
  status:            StopStatus;
  activated:         boolean;
  triggered:         boolean;
}

interface OverviewData {
  matrix:           CorrelationMatrix;
  stops:            TrailingStopView[];
  stopsConfig:      TrailingStopConfig;
  triggeredCount:   number;
  triggeredSymbols: string[];
}

// ── Correlation matrix display ────────────────────────────────────────────────

const ASSETS = ["BTC", "ETH", "SOL"] as const;

function getCellColor(val: number | null): string {
  if (val === null) return "";
  const abs = Math.abs(val);
  if (abs >= 0.72) return "bg-red-900/50 border-red-700/40 text-red-300";
  if (abs >= 0.45) return "bg-yellow-900/40 border-yellow-700/40 text-yellow-300";
  return "bg-emerald-900/30 border-emerald-700/40 text-emerald-300";
}

function strengthColor(s: "HIGH" | "MODERATE" | "LOW") {
  return s === "HIGH"     ? "text-red-400 bg-red-900/30 border-red-700/40" :
         s === "MODERATE" ? "text-yellow-400 bg-yellow-900/30 border-yellow-700/40" :
                            "text-emerald-400 bg-emerald-900/30 border-emerald-700/40";
}

function pairCorr(pairs: CorrelationPair[], a: string, b: string): number | null {
  if (a === b) return null;
  const p = pairs.find(p => (p.asset1 === a && p.asset2 === b) || (p.asset1 === b && p.asset2 === a));
  return p?.correlation ?? null;
}

// ── Trailing stop helpers ─────────────────────────────────────────────────────

function stopStatusBadge(status: StopStatus) {
  if (status === "TRIGGERED")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-900/40 text-red-300 border border-red-700/40"><Zap className="w-3 h-3" /> TRIGGERED</span>;
  if (status === "ACTIVE")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 animate-pulse"><ShieldAlert className="w-3 h-3" /> TRAILING ACTIVE</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-800/60 text-slate-400 border border-slate-700/40"><Minus className="w-3 h-3" /> NOT ARMED</span>;
}

function pnlColor(v: number) { return v >= 0 ? "text-emerald-400" : "text-red-400"; }
function fmtPrice(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`; }
function fmtPct(n: number, sign = true) { return `${sign && n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }

// ── Price range bar ───────────────────────────────────────────────────────────

function StopBar({ stop }: { stop: TrailingStopView }) {
  const lo  = Math.min(stop.entryPrice, stop.stopPrice ?? stop.currentPrice, stop.currentPrice) * 0.995;
  const hi  = Math.max(stop.highWatermark, stop.currentPrice) * 1.005;
  const rng = hi - lo;
  if (rng <= 0) return null;

  const pct = (v: number) => ((v - lo) / rng) * 100;

  const entryPct   = pct(stop.entryPrice);
  const currentPct = pct(stop.currentPrice);
  const highPct    = pct(stop.highWatermark);
  const stopPct    = stop.stopPrice !== null ? pct(stop.stopPrice) : null;

  return (
    <div className="mt-3">
      <div className="relative h-5 bg-slate-800 rounded-full overflow-visible">
        {/* Fill from entry to current */}
        <div
          className="absolute h-full rounded-full bg-indigo-900/60"
          style={{ left: `${entryPct}%`, width: `${Math.abs(currentPct - entryPct)}%` }}
        />
        {/* Stop line */}
        {stopPct !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-red-500 z-20"
            style={{ left: `${stopPct}%` }}
            title={`Stop: ${fmtPrice(stop.stopPrice!)}`}
          />
        )}
        {/* High watermark marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-emerald-400/60 z-10"
          style={{ left: `${highPct}%` }}
          title={`High: ${fmtPrice(stop.highWatermark)}`}
        />
        {/* Entry dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-slate-900 z-30"
          style={{ left: `calc(${entryPct}% - 5px)` }}
          title={`Entry: ${fmtPrice(stop.entryPrice)}`}
        />
        {/* Current price dot */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-slate-900 z-30 ${
            stop.status === "TRIGGERED" ? "bg-red-400" : stop.activated ? "bg-emerald-400" : "bg-blue-400"
          }`}
          style={{ left: `calc(${currentPct}% - 6px)` }}
          title={`Current: ${fmtPrice(stop.currentPrice)}`}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-0.5">
        <span>Entry {fmtPrice(stop.entryPrice)}</span>
        {stop.stopPrice && <span className="text-red-500">Stop {fmtPrice(stop.stopPrice)}</span>}
        <span className="text-emerald-600">High {fmtPrice(stop.highWatermark)}</span>
      </div>
    </div>
  );
}

// ── Config panel ──────────────────────────────────────────────────────────────

function StopConfigPanel({ cfg, onSave }: { cfg: TrailingStopConfig; onSave: (p: Partial<TrailingStopConfig>) => void }) {
  const [enabled,         setEnabled]         = useState(cfg.enabled);
  const [activateAfter,   setActivateAfter]   = useState(cfg.activateAfterPct);
  const [trailDist,       setTrailDist]       = useState(cfg.trailDistancePct);
  const dirty = enabled !== cfg.enabled || activateAfter !== cfg.activateAfterPct || trailDist !== cfg.trailDistancePct;

  return (
    <Card className="bg-slate-900 border-slate-700/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-200 flex items-center justify-between">
          <span className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-indigo-400" /> Trailing Stop Config</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{enabled ? "Enabled" : "Disabled"}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Activate After Profit</span>
              <span className="font-mono text-slate-200 font-bold">{activateAfter.toFixed(1)}%</span>
            </div>
            <Slider min={0.5} max={10} step={0.5} value={[activateAfter]} onValueChange={([v]) => setActivateAfter(v!)} />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>0.5%</span><span>10%</span></div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Trail Distance</span>
              <span className="font-mono text-slate-200 font-bold">{trailDist.toFixed(1)}%</span>
            </div>
            <Slider min={0.5} max={10} step={0.5} value={[trailDist]} onValueChange={([v]) => setTrailDist(v!)} />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1"><span>0.5%</span><span>10%</span></div>
          </div>
        </div>

        <div className="text-xs text-slate-500 bg-slate-800/40 rounded-lg p-3 space-y-1">
          <div className="flex gap-1.5 items-start">
            <Info className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />
            <span>Stop arms when unrealized gain ≥ <strong className="text-slate-400">{activateAfter.toFixed(1)}%</strong></span>
          </div>
          <div className="flex gap-1.5 items-start">
            <Info className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />
            <span>Trails <strong className="text-slate-400">{trailDist.toFixed(1)}%</strong> below high watermark</span>
          </div>
          <div className="flex gap-1.5 items-start">
            <Info className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />
            <span>Auto-closes position when price hits stop</span>
          </div>
        </div>

        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => onSave({ enabled, activateAfterPct: activateAfter, trailDistancePct: trailDist })}
          className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40"
        >
          Apply Config
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CorrelationPage() {
  const qc = useQueryClient();

  const { data, isFetching, isError, error, refetch } = useQuery<OverviewData>({
    queryKey:        ["correlation-overview"],
    queryFn:         async () => {
      const r = await authFetch("/api/correlation/overview");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
      return r.json();
    },
    refetchInterval: 20_000,
  });

  const configMutation = useMutation({
    mutationFn: async (patch: Partial<TrailingStopConfig>) => {
      const r = await authFetch("/api/correlation/stops/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["correlation-overview"] }),
  });

  const matrix = data?.matrix;
  const stops  = data?.stops ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Correlation & Trailing Stops</h1>
            <p className="text-sm text-slate-400">Pearson matrix · Overlap detection · Dynamic stop management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}
            className="border-slate-700 text-slate-300 hover:border-indigo-500/50 h-8 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Badge variant="outline" className="border-indigo-500/40 text-indigo-300 text-xs px-3 py-1">
            v1.0 · MODULE 11
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

      {/* Triggered banner */}
      {(data?.triggeredCount ?? 0) > 0 && (
        <div className="p-3 rounded-xl border border-red-700/50 bg-red-950/30 text-red-300 text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 shrink-0" />
          <strong>{data!.triggeredSymbols.join(", ")}</strong> trailing stop triggered and position auto-closed.
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* ── Left: Correlation matrix ───────────────────────────────────── */}
          <div className="space-y-4">
            {/* Overlap warning */}
            {matrix?.overlapWarning ? (
              <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-700/50 bg-amber-950/25 text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Overlap Risk Detected</p>
                  {matrix.strongPairs.map((s, i) => <p key={i} className="text-amber-400/80">{s}</p>)}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-800/40 bg-emerald-950/20 text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                No high-correlation overlap detected across open positions
              </div>
            )}

            <Card className="bg-slate-900 border-slate-700/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-400" /> Correlation Matrix
                  </span>
                  <span className="text-xs text-slate-500 font-normal">{matrix?.candles} hourly candles</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 3×3 heatmap grid */}
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {/* Header row */}
                  <div />
                  {ASSETS.map(a => (
                    <div key={a} className="text-center text-slate-400 font-semibold py-1">{a}</div>
                  ))}
                  {/* Data rows */}
                  {ASSETS.map(row => (
                    <Fragment key={row}>
                      <div className="text-slate-400 font-semibold flex items-center text-right justify-end pr-2">{row}</div>
                      {ASSETS.map(col => {
                        const val = pairCorr(matrix?.pairs ?? [], row, col);
                        const isDiag = row === col;
                        return (
                          <div
                            key={`${row}-${col}`}
                            className={`rounded-lg border p-2 text-center font-mono ${
                              isDiag
                                ? "bg-slate-800/60 border-slate-700/40 text-slate-400"
                                : getCellColor(val)
                            }`}
                          >
                            {isDiag ? "1.00" : val !== null ? val.toFixed(3) : "—"}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>

                {/* Color legend */}
                <div className="flex gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-900/60 border border-emerald-700/40 inline-block" /> LOW &lt;0.45</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-900/50 border border-yellow-700/40 inline-block" /> MODERATE 0.45–0.72</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-900/50 border border-red-700/40 inline-block" /> HIGH &gt;0.72</span>
                </div>
              </CardContent>
            </Card>

            {/* Pair cards */}
            <Card className="bg-slate-900 border-slate-700/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-200">Pair Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {matrix?.pairs.map(pair => (
                  <div key={`${pair.asset1}-${pair.asset2}`} className={`flex items-center justify-between p-3 rounded-lg border ${
                    pair.overlapRisk ? "border-amber-700/50 bg-amber-950/15" : "border-slate-800 bg-slate-800/30"
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-sm font-semibold">
                        <span className="text-slate-200">{pair.asset1}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-200">{pair.asset2}</span>
                      </div>
                      {pair.bothOpen && (
                        <span className="text-[10px] text-amber-400 bg-amber-900/30 border border-amber-700/40 px-1.5 py-0.5 rounded">BOTH OPEN</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold text-slate-100">{pair.correlation.toFixed(3)}</p>
                        <p className="text-[10px] text-slate-500">{pair.direction}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${strengthColor(pair.strength)}`}>
                        {pair.strength}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Diversification score */}
            <Card className="bg-slate-900 border-slate-700/60">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300 font-medium">Diversification Score</span>
                  <span className={`text-xl font-bold font-mono ${
                    (matrix?.diversificationScore ?? 0) >= 50 ? "text-emerald-400" :
                    (matrix?.diversificationScore ?? 0) >= 30 ? "text-yellow-400" : "text-red-400"
                  }`}>{matrix?.diversificationScore ?? 0}<span className="text-sm font-normal text-slate-500">/100</span></span>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      (matrix?.diversificationScore ?? 0) >= 50 ? "bg-emerald-500" :
                      (matrix?.diversificationScore ?? 0) >= 30 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${matrix?.diversificationScore ?? 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Higher scores mean assets move more independently — better for simultaneous positions.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Trailing stops ──────────────────────────────────────── */}
          <div className="space-y-4">
            <StopConfigPanel
              cfg={data.stopsConfig}
              onSave={patch => configMutation.mutate(patch)}
            />

            {configMutation.isError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                {(configMutation.error as Error).message}
              </p>
            )}

            <Card className="bg-slate-900 border-slate-700/60">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-slate-400" /> Position Stops
                </CardTitle>
                <span className="text-xs text-slate-500">{stops.length} position{stops.length !== 1 ? "s" : ""} tracked</span>
              </CardHeader>
              <CardContent>
                {stops.length === 0 ? (
                  <div className="py-8 text-center">
                    <ShieldAlert className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No open positions to track</p>
                    <p className="text-xs text-slate-600 mt-1">Open positions in the Simulation module to see trailing stops here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stops.map(stop => (
                      <div
                        key={stop.positionId}
                        className={`p-4 rounded-xl border ${
                          stop.status === "TRIGGERED"     ? "border-red-700/50 bg-red-950/15" :
                          stop.status === "ACTIVE"         ? "border-emerald-700/40 bg-emerald-950/10" :
                                                            "border-slate-700/50 bg-slate-800/20"
                        }`}
                      >
                        {/* Position header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-slate-100">{stop.displayName}</span>
                              <span className={`text-sm font-mono font-bold ${pnlColor(stop.gainFromEntryPct)}`}>
                                {stop.gainFromEntryPct >= 0 ? "+" : ""}{stop.gainFromEntryPct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Current: <span className="font-mono text-slate-200">{fmtPrice(stop.currentPrice)}</span>
                            </div>
                          </div>
                          {stopStatusBadge(stop.status)}
                        </div>

                        {/* Stop price bar */}
                        <StopBar stop={stop} />

                        {/* Metrics */}
                        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <p className="text-slate-500">Arms at</p>
                            <p className="font-mono text-slate-200 font-semibold">{fmtPrice(stop.activateAt)}</p>
                            <p className="text-slate-600">+{data.stopsConfig.activateAfterPct}% from entry</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <p className="text-slate-500">Stop Price</p>
                            <p className={`font-mono font-semibold ${stop.stopPrice ? "text-red-400" : "text-slate-600"}`}>
                              {stop.stopPrice ? fmtPrice(stop.stopPrice) : "Not set"}
                            </p>
                            {stop.distanceToStopPct !== null && (
                              <p className="text-slate-600">{stop.distanceToStopPct.toFixed(2)}% away</p>
                            )}
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <p className="text-slate-500">High Watermark</p>
                            <p className="font-mono text-emerald-400/80 font-semibold">{fmtPrice(stop.highWatermark)}</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg p-2">
                            <p className="text-slate-500">Entry Price</p>
                            <p className="font-mono text-slate-300 font-semibold">{fmtPrice(stop.entryPrice)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
