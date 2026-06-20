import { useCallback, useMemo, useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  History,
  LineChart,
  LogOut,
  Loader2,
  PauseCircle,
  Radio,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import { API_BASE_URL } from "@/lib/authFetch";
import { toast } from "@/hooks/use-toast";
import { useLiveCandles, type LivePoint } from "@/components/command/institutional/useLiveCandles";
import { useUserRole } from "@/hooks/useUserRole";
import { useRuntimeState } from "@/hooks/useRuntimeState";

type ApiInit = RequestInit & { expectsJson?: boolean };

interface PlannedTradeRow {
  id: string;
  userId: string;
  planType?: string | null;
  symbol: string;
  buyTargetPrice: number | null;
  sellTargetPrice: number | null;
  targetProfitUSD?: number | null;
  positionSizeUSD: number;
  status: string;
  enteredPositionId?: string | null;
  targetPositionId?: string | null;
  completedTradeId?: string | null;
  lastError?: string | null;
  createdAt?: string | Date | null;
  completedAt?: number | null;
  lastCheckedAt?: number | null;
}

interface PlannedTradesResponse {
  plannedTrades: PlannedTradeRow[];
}

interface UserDetailResponse {
  positions: Array<Record<string, unknown>>;
  closedTrades: Array<Record<string, unknown>>;
  simAccount?: Record<string, unknown> | null;
  aggregates?: Record<string, unknown> | null;
}

interface EngineSymbolBreakdown {
  symbol: string;
  agreedAction?: string | null;
  displayConfidence?: number | null;
  avgConfidence?: number | null;
  executionEligible?: boolean;
  executionBlockReason?: string | null;
  blockReason?: string | null;
  marketCondition?: string | null;
  trend1H?: string | null;
}

interface EngineStatusResponse {
  running: boolean;
  killSwitch: boolean;
  executionActive: boolean;
  testMode: boolean;
  symbolBreakdowns?: Record<string, EngineSymbolBreakdown>;
}

interface AssetSpec {
  symbol: string;
  label: string;
  accent: string;
  anchor: number;
}

const OPERATOR_ASSETS: AssetSpec[] = [
  { symbol: "BTCUSD", label: "BTC", accent: "#00e5ff", anchor: 64_000 },
  { symbol: "ETHUSD", label: "ETH", accent: "#66ff66", anchor: 1_750 },
  { symbol: "SOLUSD", label: "SOL", accent: "#ffaa00", anchor: 72 },
  { symbol: "INJUSD", label: "INJ", accent: "#cc55ff", anchor: 5 },
  { symbol: "LINKUSD", label: "LINK", accent: "#5ad7ff", anchor: 8 },
  { symbol: "XRPUSD", label: "XRP", accent: "#ff6680", anchor: 1.15 },
  { symbol: "AAVEUSD", label: "AAVE", accent: "#b5f56a", anchor: 120 },
  { symbol: "COMPUSD", label: "COMP", accent: "#ffcf5a", anchor: 38 },
  { symbol: "DOGEUSD", label: "DOGE", accent: "#d6c15d", anchor: 0.14 },
  { symbol: "ADAUSD", label: "ADA", accent: "#7aa7ff", anchor: 0.4 },
  { symbol: "AVAXUSD", label: "AVAX", accent: "#ff5f5f", anchor: 18 },
  { symbol: "ATOMUSD", label: "ATOM", accent: "#a78bfa", anchor: 3.5 },
];

const WORKSTATION_EMAILS = new Set(["teedelgado@gmail.com", "info@mixtapepsd.com"]);

const T = {
  bg: "#000508",
  panel: "#020b14",
  panel2: "#06111d",
  border: "rgba(255,255,255,0.09)",
  text: "#e8fff0",
  muted: "#8aa59a",
  faint: "#4d655d",
  green: "#66ff66",
  red: "#ff4d6d",
  amber: "#ffaa00",
  cyan: "#00e5ff",
  font: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

const ROUND_TRIP_FEE_RATE = 0.004;
const ACTIVE_PLAN_STATUSES = new Set(["Waiting", "Triggering Buy", "Sell Armed", "Selling"]);

function useOperatorApi() {
  const { getToken } = useAuth();
  return useCallback(async (path: string, init: ApiInit = {}) => {
    const token = await getToken().catch(() => null);
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/json");
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    if (typeof init.body === "string" && init.body.length > 0 && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const url = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
    return fetch(url, { ...init, credentials: "include", headers });
  }, [getToken]);
}

async function readJson<TBody>(res: Response): Promise<TBody> {
  const text = await res.text();
  const json = text ? JSON.parse(text) as TBody : ({} as TBody);
  if (!res.ok) {
    const error = typeof json === "object" && json && "error" in json
      ? String((json as { error?: unknown }).error)
      : `HTTP ${res.status}`;
    throw new Error(error);
  }
  return json;
}

function n(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function maybeNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : null;
}

function money(value: unknown, decimals = 2): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  if (Math.abs(x) >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (Math.abs(x) >= 1_000) return `$${(x / 1_000).toFixed(1)}K`;
  return `$${x.toFixed(decimals)}`;
}

function moneyFull(value: unknown, decimals = 2): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  return `$${x.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function signedMoney(value: unknown): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  return `${x >= 0 ? "+" : "-"}${money(Math.abs(x), 2)}`;
}

function pct(value: unknown, decimals = 2): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  return `${x >= 0 ? "+" : ""}${x.toFixed(decimals)}%`;
}

function price(value: unknown): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  if (Math.abs(x) >= 100) return `$${x.toFixed(2)}`;
  if (Math.abs(x) >= 1) return `$${x.toFixed(4)}`;
  return `$${x.toFixed(6)}`;
}

function age(ms: unknown): string {
  const ts = maybeNum(ms);
  if (!ts) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function openAge(row: Record<string, unknown>): string {
  const raw = field(row, "entry_time", "entryTime")
    ?? field(row, "opened_at", "openedAt")
    ?? field(row, "created_at", "createdAt");
  const direct = maybeNum(raw);
  if (direct != null) return age(direct > 10_000_000_000 ? direct : direct * 1000);
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? age(parsed) : "—";
  }
  return "—";
}

function field(row: Record<string, unknown>, snake: string, camel?: string): unknown {
  return row[snake] ?? (camel ? row[camel] : undefined);
}

function rowSymbol(row: Record<string, unknown>): string {
  return String(field(row, "symbol") ?? "").toUpperCase();
}

function rowId(row: Record<string, unknown>, fallback: string): string {
  return String(field(row, "id") ?? fallback);
}

function planState(status: string): string {
  switch (status) {
    case "Waiting": return "WAITING_FOR_BUY";
    case "Triggering Buy": return "BUY EXECUTED";
    case "Sell Armed": return "WAITING_FOR_SELL";
    case "Selling": return "SELL EXECUTING";
    case "Completed": return "COMPLETED";
    case "Cancelled": return "CANCELLED";
    case "Failed": return "FAILED";
    case "Expired": return "FAILED";
    default: return status.toUpperCase();
  }
}

function statusColor(status: string): string {
  const s = planState(status);
  if (s === "COMPLETED") return T.green;
  if (s === "CANCELLED") return T.faint;
  if (s === "FAILED") return T.red;
  if (s === "WAITING_FOR_SELL" || s === "SELL EXECUTING") return T.amber;
  return T.cyan;
}

function confidenceOf(b?: EngineSymbolBreakdown): number | null {
  return maybeNum(b?.displayConfidence ?? b?.avgConfidence);
}

function trendOf(b: EngineSymbolBreakdown | undefined, pctChange?: number | null): string {
  const raw = String(b?.trend1H ?? b?.marketCondition ?? b?.agreedAction ?? "").toUpperCase();
  if (raw.includes("BULL") || raw.includes("UP") || raw === "BUY") return "UP";
  if (raw.includes("BEAR") || raw.includes("DOWN") || raw === "SELL") return "DOWN";
  if (pctChange != null && Math.abs(pctChange) >= 0.05) return pctChange >= 0 ? "UP" : "DOWN";
  return "FLAT";
}

function trendColor(trend: string): string {
  if (trend === "UP") return T.green;
  if (trend === "DOWN") return T.red;
  return T.amber;
}

function activePlan(plan: PlannedTradeRow | undefined): boolean {
  return !!plan && ACTIVE_PLAN_STATUSES.has(plan.status);
}

function expectedProfitUSD(buy: unknown, sell: unknown, size: unknown): number | null {
  const b = maybeNum(buy);
  const s = maybeNum(sell);
  const z = maybeNum(size);
  if (b == null || s == null || z == null || b <= 0 || z <= 0) return null;
  return z * ((s - b) / b);
}

function estimatedFeesUSD(size: unknown): number | null {
  const z = maybeNum(size);
  if (z == null || z <= 0) return null;
  return z * ROUND_TRIP_FEE_RATE;
}

function expectedReturnPct(buy: unknown, sell: unknown): number | null {
  const b = maybeNum(buy);
  const s = maybeNum(sell);
  if (b == null || s == null || b <= 0) return null;
  return ((s - b) / b) * 100;
}

function distanceText(current: unknown, target: unknown): string {
  const c = maybeNum(current);
  const t = maybeNum(target);
  if (c == null || t == null || c <= 0) return "—";
  const delta = t - c;
  return `${signedMoney(delta)} · ${pct((delta / c) * 100)}`;
}

function rowTimeMs(row: Record<string, unknown>): number | null {
  const raw = field(row, "exit_time", "exitTime") ?? field(row, "created_at", "createdAt");
  const direct = maybeNum(raw);
  if (direct != null) return direct > 10_000_000_000 ? direct : direct * 1000;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function todayRealizedPnl(rows: Array<Record<string, unknown>>): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return rows.reduce((sum, row) => {
    const ts = rowTimeMs(row);
    if (ts == null || ts < start.getTime()) return sum;
    return sum + n(field(row, "realized_pnl", "realizedPnl"));
  }, 0);
}

function positionSize(row: Record<string, unknown>): number {
  return n(field(row, "size_usd", "sizeUSD") ?? field(row, "capital_invested", "capitalInvested"));
}

function StrikeLine({ points, color }: { points: LivePoint[]; color: string }) {
  const { path, fillPath, up } = useMemo(() => {
    const w = 520;
    const h = 154;
    const source = points.length > 1 ? points.slice(-80) : [];
    if (!source.length) return { path: "", fillPath: "", up: true };
    const values = source.map((p) => p.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(1, max * 0.01);
    const coords = source.map((p, i) => {
      const x = (i / Math.max(1, source.length - 1)) * w;
      const y = h - ((p.close - min) / range) * h;
      return [x, y] as const;
    });
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const fill = `${line} L${w},${h} L0,${h} Z`;
    return { path: line, fillPath: fill, up: values[values.length - 1] >= values[0] };
  }, [points]);

  return (
    <svg viewBox="0 0 520 154" preserveAspectRatio="none" style={{ width: "100%", height: 154, display: "block" }}>
      <defs>
        <linearGradient id={`fill-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="520" height="154" fill="rgba(0,0,0,0.18)" />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="0" x2="520" y1={20 + i * 34} y2={20 + i * 34} stroke="rgba(255,255,255,0.045)" />
      ))}
      {fillPath && <path d={fillPath} fill={`url(#fill-${color.replace(/[^a-z0-9]/gi, "")})`} />}
      {path && <path d={path} fill="none" stroke={up ? color : T.red} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
      {path && <circle cx="510" cy="76" r="3.5" fill={up ? color : T.red} opacity="0.9" />}
    </svg>
  );
}

function Metric({ label, value, color = T.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: T.faint, fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" }}>{label}</div>
      <div style={{ color, fontSize: 13, fontWeight: 900, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function SummaryMetric({ label, value, color = T.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 96 }}>
      <div style={{ color: T.faint, fontSize: 9, fontWeight: 900, letterSpacing: "0.11em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ color, fontSize: 15, fontWeight: 950, marginTop: 3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function SummaryBar({
  displayName,
  accountName,
  availableCash,
  investedCapital,
  availableCapital,
  accountValue,
  openPositions,
  plannedTradesCount,
  todayPnl,
  openPnl,
  tradeSize,
  maxHoldLabel,
  engine,
  onSignOut,
}: {
  displayName: string;
  accountName: string;
  availableCash: number | null;
  investedCapital: number;
  availableCapital: number | null;
  accountValue: number | null;
  openPositions: number;
  plannedTradesCount: number;
  todayPnl: number | null;
  openPnl: number | null;
  tradeSize: number | null;
  maxHoldLabel: string;
  engine: EngineStatusResponse | undefined;
  onSignOut: () => void;
}) {
  const aiLive = !!engine?.running && !engine.killSwitch;
  return (
    <section style={{
      borderBottom: `1px solid ${T.border}`,
      background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.014))",
      padding: "10px 16px",
      display: "grid",
      gridTemplateColumns: "minmax(190px, 0.42fr) minmax(0, 1fr)",
      gap: 14,
      alignItems: "center",
    }}>
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <div style={{ color: T.text, fontSize: 13, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
        <div style={{ color: T.muted, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{accountName}</div>
        <button type="button" onClick={onSignOut} style={{
          justifySelf: "start",
          height: 24,
          border: `1px solid ${T.border}`,
          background: "rgba(255,255,255,0.035)",
          color: T.faint,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px",
          fontFamily: T.font,
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.10em",
          cursor: "pointer",
        }}>
          <LogOut size={11} /> SIGN OUT
        </button>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", overflowX: "auto", minWidth: 0 }}>
        <SummaryMetric label="AVAILABLE CASH" value={moneyFull(availableCash, 0)} color={T.green} />
        <SummaryMetric label="INVESTED" value={moneyFull(investedCapital, 0)} />
        <SummaryMetric label="AVAILABLE CAPITAL" value={moneyFull(availableCapital, 0)} color={T.cyan} />
        <SummaryMetric label="ACCOUNT VALUE" value={moneyFull(accountValue, 0)} />
        <SummaryMetric label="OPEN POSITIONS" value={String(openPositions)} color={openPositions > 0 ? T.amber : T.faint} />
        <SummaryMetric label="PLANNED TRADES" value={String(plannedTradesCount)} color={plannedTradesCount > 0 ? T.cyan : T.faint} />
        <SummaryMetric label="TODAY P/L" value={signedMoney(todayPnl)} color={(todayPnl ?? 0) >= 0 ? T.green : T.red} />
        <SummaryMetric label="OPEN P/L" value={signedMoney(openPnl)} color={(openPnl ?? 0) >= 0 ? T.green : T.red} />
        <SummaryMetric label="TRADE SIZE" value={moneyFull(tradeSize, 0)} />
        <SummaryMetric label="MAX HOLD" value={maxHoldLabel} color={T.amber} />
        <SummaryMetric label="AI STATUS" value={aiLive ? "LIVE" : "IDLE"} color={aiLive ? T.green : T.faint} />
        <SummaryMetric label="KILL SWITCH" value={engine?.killSwitch ? "ACTIVE" : "CLEAR"} color={engine?.killSwitch ? T.red : T.cyan} />
      </div>
    </section>
  );
}

function RadarTile({ asset, breakdown }: { asset: AssetSpec; breakdown?: EngineSymbolBreakdown }) {
  const { livePrice, summary, state } = useLiveCandles({
    symbol: asset.symbol,
    syntheticAnchor: asset.anchor,
    limit: 48,
    timeframe: "5m",
    pollMs: 20_000,
  });
  const confidence = confidenceOf(breakdown);
  const trend = trendOf(breakdown, summary.pct);
  return (
    <div style={{
      minWidth: 106,
      border: `1px solid ${T.border}`,
      background: `${asset.accent}0e`,
      padding: "8px 8px",
      display: "grid",
      gap: 5,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ color: asset.accent, fontSize: 12, fontWeight: 950, letterSpacing: "0.06em" }}>{asset.label}</span>
        <span style={{ color: T.faint, fontSize: 8, fontWeight: 900, letterSpacing: "0.10em" }}>{state.toUpperCase()}</span>
      </div>
      <div style={{ color: T.text, fontSize: 13, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{price(livePrice)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 9, fontWeight: 900 }}>
        <span style={{ color: summary.up ? T.green : T.red }}>{pct(summary.pct)}</span>
        <span style={{ color: confidence == null ? T.faint : asset.accent }}>{confidence == null ? "AI —" : `${confidence.toFixed(0)}%`}</span>
        <span style={{ color: trendColor(trend) }}>{trend}</span>
      </div>
    </div>
  );
}

function MarketRadar({ engine }: { engine: EngineStatusResponse | undefined }) {
  return (
    <section style={{
      borderBottom: `1px solid ${T.border}`,
      background: "#00070d",
      padding: "10px 14px",
      display: "grid",
      gridTemplateColumns: "104px minmax(0, 1fr)",
      gap: 8,
      alignItems: "stretch",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.text, fontSize: 11, fontWeight: 950, letterSpacing: "0.12em" }}>
        <LineChart size={14} color={T.cyan} />
        MARKET RADAR
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", minWidth: 0 }}>
        {OPERATOR_ASSETS.map((asset) => (
          <RadarTile key={asset.symbol} asset={asset} breakdown={engine?.symbolBreakdowns?.[asset.symbol]} />
        ))}
      </div>
    </section>
  );
}

function OperatorWorkstationCard({
  asset,
  position,
  plan,
  breakdown,
  onArm,
  onCancel,
  busy,
}: {
  asset: AssetSpec;
  position: Record<string, unknown> | undefined;
  plan: PlannedTradeRow | undefined;
  breakdown: EngineSymbolBreakdown | undefined;
  onArm: (input: { symbol: string; buyTargetPrice: number; sellTargetPrice: number | null; positionSizeUSD: number }) => void;
  onCancel: (id: string) => void;
  busy: boolean;
}) {
  const { points, livePrice, state, summary } = useLiveCandles({
    symbol: asset.symbol,
    syntheticAnchor: asset.anchor,
    limit: 96,
    timeframe: "5m",
    pollMs: 15_000,
  });
  const current = maybeNum(field(position ?? {}, "current_price", "currentPrice")) ?? livePrice;
  const entry = maybeNum(field(position ?? {}, "entry_price", "entryPrice"));
  const pnl = maybeNum(field(position ?? {}, "unrealized_pnl", "unrealizedPnl"));
  const pnlPct = maybeNum(field(position ?? {}, "unrealized_pnl_pct", "unrealizedPnlPct"));
  const aiConfidence = confidenceOf(breakdown);
  const trend = trendOf(breakdown, summary.pct);
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [size, setSize] = useState("10");
  const canArm = maybeNum(buy) != null && maybeNum(size) != null && !busy;
  const plannedBuy = plan?.buyTargetPrice ?? maybeNum(buy);
  const plannedSell = plan?.sellTargetPrice ?? maybeNum(sell);
  const plannedSize = plan?.positionSizeUSD ?? maybeNum(size);
  const grossProfit = expectedProfitUSD(plannedBuy, plannedSell, plannedSize);
  const fees = estimatedFeesUSD(plannedSize);
  const netProfit = grossProfit == null ? null : grossProfit - (fees ?? 0);
  const expectedReturn = expectedReturnPct(plannedBuy, plannedSell);
  const liveMode = !!position;
  const targetPrice = plannedSell ?? maybeNum(field(position ?? {}, "manual_exit_target_price", "manualExitTargetPrice"));

  return (
    <section style={{
      border: `1px solid ${plan ? statusColor(plan.status) : "rgba(255,255,255,0.10)"}`,
      background: `linear-gradient(180deg, ${asset.accent}12 0%, rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.28) 100%)`,
      minHeight: 410,
      display: "grid",
      gridTemplateRows: "auto auto 1fr auto",
    }}>
      <div style={{ padding: "12px 13px 8px", display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: asset.accent, fontSize: 24, fontWeight: 950, letterSpacing: "0.08em" }}>{asset.label}</div>
          <div style={{ color: liveMode ? T.green : T.faint, fontSize: 10, fontWeight: 800, letterSpacing: "0.14em" }}>{asset.symbol} · {liveMode ? "LIVE POSITION" : state.toUpperCase()}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: T.text, fontSize: 22, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{price(current)}</div>
          <div style={{ color: summary.up ? T.green : T.red, fontSize: 11, fontWeight: 800 }}>{pct(summary.pct)}</div>
        </div>
      </div>

      <StrikeLine points={points} color={asset.accent} />

      <div style={{ padding: "10px 13px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <Metric label={liveMode ? "ENTRY PRICE" : "BUY TARGET"} value={price(liveMode ? entry : plannedBuy)} />
        <Metric label={liveMode ? "CURRENT P/L $" : "SELL TARGET"} value={liveMode ? signedMoney(pnl) : price(plannedSell)} color={liveMode ? (pnl ?? 0) >= 0 ? T.green : T.red : T.text} />
        <Metric label={liveMode ? "CURRENT P/L %" : "SIZE"} value={liveMode ? pct(pnlPct) : moneyFull(plannedSize, 0)} color={liveMode ? (pnlPct ?? 0) >= 0 ? T.green : T.red : T.text} />
        <Metric label="AI CONF" value={aiConfidence == null ? "—" : `${aiConfidence.toFixed(1)}%`} color={asset.accent} />
        <Metric label="TREND" value={trend} color={trendColor(trend)} />
        <Metric label={liveMode ? "DISTANCE TO TARGET" : "PLAN STATUS"} value={liveMode ? distanceText(current, targetPrice) : plan ? planState(plan.status) : "READY"} color={liveMode ? T.amber : plan ? statusColor(plan.status) : T.faint} />
        {!liveMode && <Metric label="EXPECTED PROFIT" value={signedMoney(netProfit)} color={(netProfit ?? 0) >= 0 ? T.green : T.red} />}
        {!liveMode && <Metric label="EXPECTED RETURN" value={expectedReturn == null ? "—" : pct(expectedReturn)} color={(expectedReturn ?? 0) >= 0 ? T.green : T.red} />}
        {!liveMode && <Metric label="ESTIMATED FEES" value={moneyFull(fees, 2)} color={T.faint} />}
        {!liveMode && <Metric label="DISTANCE TO BUY" value={distanceText(current, plannedBuy)} color={T.cyan} />}
        {!liveMode && <Metric label="DISTANCE TO SELL" value={distanceText(current, plannedSell)} color={T.amber} />}
      </div>

      <div style={{ padding: "10px 13px 13px", borderTop: `1px solid ${T.border}`, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, color: T.faint, fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>
          <span>EXPECTED {signedMoney(grossProfit)}</span>
          <span>FEES {moneyFull(fees, 2)}</span>
          <span>NET {signedMoney(netProfit)}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.82fr", gap: 8 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: T.faint, fontSize: 9, fontWeight: 900, letterSpacing: "0.12em" }}>BUY TARGET PRICE</span>
            <input value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="69150" inputMode="decimal" style={inputStyle()} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: T.faint, fontSize: 9, fontWeight: 900, letterSpacing: "0.12em" }}>SELL TARGET PRICE</span>
            <input value={sell} onChange={(e) => setSell(e.target.value)} placeholder="69650" inputMode="decimal" style={inputStyle()} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: T.faint, fontSize: 9, fontWeight: 900, letterSpacing: "0.12em" }}>POSITION SIZE ($)</span>
            <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="100" inputMode="decimal" style={inputStyle()} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: activePlan(plan) ? "1fr 120px" : "1fr", gap: 8 }}>
          <button
            type="button"
            disabled={!canArm}
            onClick={() => {
              const buyTargetPrice = maybeNum(buy);
              const sellTargetPrice = maybeNum(sell);
              const positionSizeUSD = maybeNum(size);
              if (buyTargetPrice == null || positionSizeUSD == null) return;
              onArm({ symbol: asset.symbol, buyTargetPrice, sellTargetPrice, positionSizeUSD });
            }}
            style={buttonStyle(asset.accent, !canArm)}
          >
            {busy ? "ARMING..." : "ARM TRADE"}
          </button>
          {plan && activePlan(plan) && (
            <button type="button" disabled={busy} onClick={() => onCancel(plan.id)} style={buttonStyle(T.red, busy)}>
              CANCEL TRADE
            </button>
          )}
        </div>
        {plan?.lastError && (
          <div style={{ color: T.red, fontSize: 10, fontWeight: 800 }}>{plan.lastError}</div>
        )}
      </div>
    </section>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    height: 34,
    minWidth: 0,
    background: "#00070d",
    border: `1px solid ${T.border}`,
    color: T.text,
    fontFamily: T.font,
    fontSize: 12,
    fontWeight: 800,
    padding: "0 9px",
    outline: "none",
    borderRadius: 2,
  };
}

function buttonStyle(color: string, disabled = false): React.CSSProperties {
  return {
    height: 36,
    border: `1px solid ${color}88`,
    background: disabled ? "rgba(255,255,255,0.035)" : `${color}1f`,
    color: disabled ? T.faint : color,
    fontFamily: T.font,
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.12em",
    borderRadius: 2,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function LiveTradeRow({
  row,
  sellTarget,
  onManualSell,
  onArmSellTarget,
  onCancelTarget,
  busy,
}: {
  row: Record<string, unknown>;
  sellTarget?: PlannedTradeRow;
  onManualSell: (row: Record<string, unknown>) => void;
  onArmSellTarget: (row: Record<string, unknown>, targetPrice: number) => void;
  onCancelTarget: (id: string) => void;
  busy: boolean;
}) {
  const [target, setTarget] = useState("");
  const symbol = rowSymbol(row);
  const id = rowId(row, symbol);
  const pnl = maybeNum(field(row, "unrealized_pnl", "unrealizedPnl"));
  const pnlPct = maybeNum(field(row, "unrealized_pnl_pct", "unrealizedPnlPct"));
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: "9px 0", display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 1fr 0.8fr", gap: 8, alignItems: "end" }}>
        <RailValue label="SYMBOL" value={symbol} color={T.text} strong />
        <RailValue label="ENTRY" value={price(field(row, "entry_price", "entryPrice"))} />
        <RailValue label="CURRENT" value={price(field(row, "current_price", "currentPrice"))} />
        <RailValue label="P/L" value={`${signedMoney(pnl)} ${pct(pnlPct)}`} color={(pnl ?? 0) >= 0 ? T.green : T.red} />
        <RailValue label="TIME" value={openAge(row)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 72px 62px", gap: 7, alignItems: "center" }}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={sellTarget ? `Target ${price(sellTarget.sellTargetPrice)}` : "Sell target price"}
          style={{ ...inputStyle(), height: 30, fontSize: 10 }}
        />
        {sellTarget && !["Completed", "Cancelled", "Expired", "Failed"].includes(sellTarget.status) ? (
          <button type="button" disabled={busy} onClick={() => onCancelTarget(sellTarget.id)} style={buttonStyle(T.red, busy)}>CANCEL</button>
        ) : (
          <button
            type="button"
            disabled={busy || maybeNum(target) == null}
            onClick={() => {
              const targetPrice = maybeNum(target);
              if (targetPrice != null) onArmSellTarget(row, targetPrice);
            }}
            style={buttonStyle(T.amber, busy || maybeNum(target) == null)}
          >
            TARGET
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => onManualSell(row)} style={buttonStyle(T.red, busy)}>SELL</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, color: T.faint, fontSize: 9 }}>
        <span>Retention {retention(row)}</span>
        <span>Max Hold {maxHold(row)}</span>
        <span>{sellTarget ? planState(sellTarget.status) : String(field(row, "exit_mode_status") ?? "MONITORING")}</span>
      </div>
    </div>
  );
}

function RailValue({ label, value, color = T.muted, strong = false }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: T.faint, fontSize: 8, fontWeight: 900, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ color, fontSize: strong ? 14 : 12, fontWeight: strong ? 950 : 850, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function PlannedTradeRowView({ row, onCancelTarget, busy }: { row: PlannedTradeRow; onCancelTarget: (id: string) => void; busy: boolean }) {
  const net = (() => {
    const gross = expectedProfitUSD(row.buyTargetPrice, row.sellTargetPrice, row.positionSizeUSD);
    if (gross == null) return null;
    return gross - (estimatedFeesUSD(row.positionSizeUSD) ?? 0);
  })();
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: "9px 0", display: "grid", gap: 7 }}>
      <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr 0.9fr", gap: 8, alignItems: "center" }}>
        <span style={{ color: T.text, fontWeight: 950 }}>{row.symbol}</span>
        <span>BUY {price(row.buyTargetPrice)}</span>
        <span>SELL {price(row.sellTargetPrice)}</span>
        <span>{moneyFull(row.positionSizeUSD, 0)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 86px", gap: 8, alignItems: "center" }}>
        <div style={{ color: statusColor(row.status), fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>
          STATUS {planState(row.status)} · NET {signedMoney(net)}
        </div>
        {activePlan(row) && (
          <button type="button" disabled={busy} onClick={() => onCancelTarget(row.id)} style={buttonStyle(T.red, busy)}>CANCEL</button>
        )}
      </div>
      {row.lastError && <div style={{ color: T.red, fontSize: 9, fontWeight: 800 }}>{row.lastError}</div>}
    </div>
  );
}

function retention(row: Record<string, unknown>): string {
  const pnl = maybeNum(field(row, "unrealized_pnl", "unrealizedPnl"));
  const peak = maybeNum(field(row, "peak_profit_usd", "peakProfitUsd"));
  if (pnl == null || peak == null || peak <= 0) return "—";
  return `${Math.max(0, Math.min(100, (pnl / peak) * 100)).toFixed(0)}%`;
}

function maxHold(row: Record<string, unknown>): string {
  const exitRules = field(row, "exit_rules", "exitRules");
  if (!exitRules || typeof exitRules !== "object") return "—";
  const mh = (exitRules as Record<string, unknown>)["max_hold"];
  if (!mh || typeof mh !== "object") return "—";
  const max = maybeNum((mh as Record<string, unknown>)["max_minutes"]);
  const left = maybeNum((mh as Record<string, unknown>)["remaining_minutes"]);
  if (max == null) return "—";
  return `${Math.round(max / 60)}h${left != null ? ` · ${Math.round(left)}m left` : ""}`;
}

function HistoryRow({ row }: { row: Record<string, unknown> }) {
  const pnl = maybeNum(field(row, "realized_pnl", "realizedPnl"));
  const reason = String(field(row, "close_reason", "closeReason") ?? "—");
  const reasonColor = exitReasonColor(reason, pnl);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.75fr 0.8fr 0.8fr 0.8fr 1fr", gap: 8, borderTop: `1px solid ${T.border}`, padding: "8px 0" }}>
      <span style={{ color: T.text, fontWeight: 900 }}>{rowSymbol(row)}</span>
      <span>{price(field(row, "entry_price", "entryPrice"))}</span>
      <span>{price(field(row, "exit_price", "exitPrice"))}</span>
      <span style={{ color: reasonColor }}>{signedMoney(pnl)}</span>
      <span style={{ color: reasonColor }}>{reason}</span>
    </div>
  );
}

function exitReasonColor(reason: string, pnl: number | null): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes("max") && normalized.includes("hold")) return T.amber;
  if (normalized.includes("manual")) return T.cyan;
  return (pnl ?? 0) >= 0 ? T.green : T.red;
}

function SidePanel({
  positions,
  closedTrades,
  plannedTrades,
  onManualSell,
  onArmSellTarget,
  onCancelTarget,
  busy,
}: {
  positions: Array<Record<string, unknown>>;
  closedTrades: Array<Record<string, unknown>>;
  plannedTrades: PlannedTradeRow[];
  onManualSell: (row: Record<string, unknown>) => void;
  onArmSellTarget: (row: Record<string, unknown>, targetPrice: number) => void;
  onCancelTarget: (id: string) => void;
  busy: boolean;
}) {
  const sellTargets = plannedTrades.filter((p) => p.planType === "SELL_TARGET");
  const activePlans = plannedTrades.filter(activePlan);
  const findTarget = (row: Record<string, unknown>) => {
    const id = rowId(row, "");
    return sellTargets.find((p) => p.targetPositionId === id || p.enteredPositionId === id);
  };
  if (positions.length === 0 && activePlans.length === 0 && closedTrades.length === 0) return null;

  return (
    <aside style={{ display: "grid", gap: 12, alignSelf: "start", minHeight: 0 }}>
      {positions.length > 0 && (
        <section style={panelStyle()}>
          <PanelTitle icon={Activity} title="LIVE TRADES" sub={`${positions.length} open`} />
          <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 690 }}>
            {positions.map((row, i) => (
              <LiveTradeRow
                key={rowId(row, String(i))}
                row={row}
                sellTarget={findTarget(row)}
                onManualSell={onManualSell}
                onArmSellTarget={onArmSellTarget}
                onCancelTarget={onCancelTarget}
                busy={busy}
              />
            ))}
          </div>
        </section>
      )}
      {activePlans.length > 0 && (
        <section style={panelStyle()}>
          <PanelTitle icon={Target} title="PLANNED TRADES" sub={`${activePlans.length} armed`} />
          <div style={{ color: T.faint, fontSize: 9, display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr 0.9fr", gap: 8, paddingBottom: 6 }}>
            <span>SYMBOL</span><span>BUY TARGET</span><span>SELL TARGET</span><span>SIZE</span>
          </div>
          <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 230 }}>
            {activePlans.map((row) => (
              <PlannedTradeRowView key={row.id} row={row} onCancelTarget={onCancelTarget} busy={busy} />
            ))}
          </div>
        </section>
      )}
      {closedTrades.length > 0 && (
        <section style={panelStyle()}>
          <PanelTitle icon={History} title="TRADE HISTORY" sub={`${closedTrades.length} recent`} />
          <div style={{ color: T.faint, fontSize: 9, display: "grid", gridTemplateColumns: "0.75fr 0.8fr 0.8fr 0.8fr 1fr", gap: 8, paddingBottom: 6 }}>
            <span>SYMBOL</span><span>ENTRY</span><span>EXIT</span><span>PROFIT</span><span>REASON</span>
          </div>
          <div style={{ overflowY: "auto", minHeight: 0, height: 390 }}>
            {closedTrades.slice(0, 30).map((row, i) => (
              <HistoryRow key={rowId(row, String(i))} row={row} />
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

function PanelTitle({ icon: Icon, title, sub }: { icon: typeof Activity; title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={15} color={T.cyan} />
        <span style={{ color: T.text, fontWeight: 950, letterSpacing: "0.12em", fontSize: 12 }}>{title}</span>
      </div>
      {sub && <span style={{ color: T.faint, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em" }}>{sub}</span>}
    </div>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    border: `1px solid ${T.border}`,
    background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))",
    padding: 12,
    minHeight: 0,
    overflow: "hidden",
  };
}

export default function OperatorWorkstation() {
  const api = useOperatorApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { email, isSuperAdmin } = useUserRole();
  const runtimeQuery = useRuntimeState();
  const userId = user?.id ?? null;
  const normalizedEmail = (email ?? user?.primaryEmailAddress?.emailAddress ?? "").toLowerCase();
  const isPersonalOperator = WORKSTATION_EMAILS.has(normalizedEmail);

  const detailQuery = useQuery<UserDetailResponse>({
    queryKey: ["operator-workstation-detail", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await api(`/api/admin/users/${encodeURIComponent(userId!)}`, { cache: "no-store" });
      return readJson<UserDetailResponse>(res);
    },
    refetchInterval: 8_000,
  });

  const plannedQuery = useQuery<PlannedTradesResponse>({
    queryKey: ["operator-workstation-planned", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await api("/api/admin/planned-trades?limit=100", { cache: "no-store" });
      return readJson<PlannedTradesResponse>(res);
    },
    refetchInterval: 5_000,
  });

  const engineQuery = useQuery<EngineStatusResponse>({
    queryKey: ["operator-workstation-engine"],
    queryFn: async () => {
      const res = await api("/api/engine/status", { cache: "no-store" });
      return readJson<EngineStatusResponse>(res);
    },
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["operator-workstation-detail", userId] });
    void qc.invalidateQueries({ queryKey: ["operator-workstation-planned", userId] });
  };

  const armPlannedBuy = useMutation({
    mutationFn: async (input: { symbol: string; buyTargetPrice: number; sellTargetPrice: number | null; positionSizeUSD: number }) => {
      if (!userId) throw new Error("Operator user id unavailable");
      const res = await api(`/api/admin/users/${encodeURIComponent(userId)}/planned-buys`, {
        method: "POST",
        body: JSON.stringify({
          symbol: input.symbol,
          buyTargetPrice: input.buyTargetPrice,
          sellTargetPrice: input.sellTargetPrice,
          positionSizeUSD: input.positionSizeUSD,
          note: "Operator workstation planned buy",
        }),
      });
      return readJson<{ plannedTrade: PlannedTradeRow }>(res);
    },
    onSuccess: () => {
      toast({ title: "Planned trade armed", description: "Buy target is being monitored." });
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Planned trade failed", description: err.message, variant: "destructive" }),
  });

  const cancelPlan = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/api/admin/planned-trades/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      return readJson<{ ok: boolean }>(res);
    },
    onSuccess: () => {
      toast({ title: "Plan cancelled", description: "The planned trade is no longer active." });
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  const armSellTarget = useMutation({
    mutationFn: async (input: { position: Record<string, unknown>; targetPrice: number }) => {
      if (!userId) throw new Error("Operator user id unavailable");
      const res = await api(`/api/admin/users/${encodeURIComponent(userId)}/sell-targets`, {
        method: "POST",
        body: JSON.stringify({
          positionId: rowId(input.position, ""),
          targetPrice: input.targetPrice,
          note: "Operator workstation sell target",
        }),
      });
      return readJson<{ plannedTrade: PlannedTradeRow }>(res);
    },
    onSuccess: () => {
      toast({ title: "Sell target armed", description: "Position target is now monitored." });
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Sell target failed", description: err.message, variant: "destructive" }),
  });

  const manualSell = useMutation({
    mutationFn: async (position: Record<string, unknown>) => {
      if (!userId) throw new Error("Operator user id unavailable");
      const res = await api(`/api/admin/users/${encodeURIComponent(userId)}/manual-sell`, {
        method: "POST",
        body: JSON.stringify({
          positionId: rowId(position, ""),
          symbol: rowSymbol(position),
          note: "Manual sell from operator workstation",
        }),
      });
      return readJson<{ ok: boolean }>(res);
    },
    onSuccess: () => {
      toast({ title: "Manual sell submitted", description: "Position close requested." });
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Manual sell failed", description: err.message, variant: "destructive" }),
  });

  const positions = detailQuery.data?.positions ?? [];
  const closedTrades = useMemo(() => {
    return [...(detailQuery.data?.closedTrades ?? [])].sort((a, b) => (rowTimeMs(b) ?? 0) - (rowTimeMs(a) ?? 0));
  }, [detailQuery.data?.closedTrades]);
  const simAccount = detailQuery.data?.simAccount ?? null;
  const plannedTrades = (plannedQuery.data?.plannedTrades ?? []).filter((p) => !userId || p.userId === userId);
  const activePlannedTrades = plannedTrades.filter(activePlan);
  const plannedBySymbol = (symbol: string) => plannedTrades.find((p) =>
    p.symbol === symbol &&
    (p.planType ?? "PLANNED_BUY") === "PLANNED_BUY" &&
    activePlan(p)
  );
  const positionBySymbol = (symbol: string) => positions.find((p) => rowSymbol(p) === symbol);
  const busy = armPlannedBuy.isPending || cancelPlan.isPending || armSellTarget.isPending || manualSell.isPending;
  const engine = engineQuery.data;
  const runtime = runtimeQuery.data;
  const activeConn = runtime?.connectedExchanges.find((c) => c.exchange === runtime.activeExchange) ?? runtime?.connectedExchanges[0];
  const liveCash = activeConn?.usdBreakdown
    ? n(activeConn.usdBreakdown.cash) + n(activeConn.usdBreakdown.stablecoin)
    : null;
  const simCash = maybeNum(field(simAccount ?? {}, "cash_balance", "cashBalance"));
  const availableCash = liveCash ?? simCash;
  const investedCapital = positions.reduce((sum, row) => sum + positionSize(row), 0);
  const openPnl = positions.reduce((sum, row) => sum + n(field(row, "unrealized_pnl", "unrealizedPnl")), 0);
  const reservedPlannedCapital = activePlannedTrades.reduce((sum, row) => sum + n(row.positionSizeUSD), 0);
  const availableCapital = availableCash == null ? null : Math.max(0, availableCash - reservedPlannedCapital);
  const accountValue = maybeNum(activeConn?.usdBreakdown?.accountValue)
    ?? maybeNum(activeConn?.usdBreakdown?.total)
    ?? maybeNum(activeConn?.totalEquityUSD)
    ?? (availableCash == null ? null : availableCash + investedCapital + openPnl);
  const todayPnl = todayRealizedPnl(closedTrades);
  const tradeSize = activePlannedTrades[0]?.positionSizeUSD ?? 100;
  const maxHoldLabel = positions.map(maxHold).find((v) => v !== "—") ?? "3H";
  const displayName = user?.fullName ?? user?.firstName ?? (normalizedEmail || "Operator");
  const accountName = normalizedEmail || "AICandlez operator account";
  const hasRailActivity = positions.length > 0 || activePlannedTrades.length > 0 || closedTrades.length > 0;

  return (
    <div style={{ minHeight: "100dvh", background: T.bg, color: T.muted, fontFamily: T.font, display: "grid", gridTemplateRows: "auto auto auto 1fr" }}>
      <header style={{
        borderBottom: `1px solid ${T.border}`,
        background: "linear-gradient(180deg, #030d16 0%, #000508 100%)",
        padding: "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Crosshair size={21} color={T.green} />
          <div>
            <div style={{ color: T.text, fontSize: 17, fontWeight: 950, letterSpacing: "0.18em" }}>OPERATOR TRADING WORKSTATION</div>
            <div style={{ color: T.faint, fontSize: 10, fontWeight: 800, letterSpacing: "0.10em" }}>{normalizedEmail || "operator"} · active trading · planned execution</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!isPersonalOperator && isSuperAdmin && <TopPill icon={AlertTriangle} label="SUPER-ADMIN PREVIEW" color={T.amber} />}
          <TopPill icon={engine?.running ? CheckCircle2 : PauseCircle} label={engine?.running ? "ENGINE LIVE" : "ENGINE —"} color={engine?.running ? T.green : T.faint} />
          <TopPill icon={engine?.killSwitch ? AlertTriangle : Radio} label={engine?.killSwitch ? "KILL ACTIVE" : "KILL CLEAR"} color={engine?.killSwitch ? T.red : T.cyan} />
          <TopPill icon={engine?.testMode ? Loader2 : Zap} label={engine?.testMode ? "TEST MODE" : "LIVE MODE"} color={engine?.testMode ? T.amber : T.green} />
        </div>
      </header>
      <SummaryBar
        displayName={displayName}
        accountName={accountName}
        availableCash={availableCash}
        investedCapital={investedCapital}
        availableCapital={availableCapital}
        accountValue={accountValue}
        openPositions={positions.length}
        plannedTradesCount={activePlannedTrades.length}
        todayPnl={todayPnl}
        openPnl={openPnl}
        tradeSize={tradeSize}
        maxHoldLabel={maxHoldLabel}
        engine={engine}
        onSignOut={() => void signOut({ redirectUrl: "/" })}
      />
      <MarketRadar engine={engine} />

      <main style={{ padding: 14, display: "grid", gridTemplateColumns: hasRailActivity ? "minmax(680px, 1fr) minmax(390px, 0.36fr)" : "minmax(680px, 1fr)", gap: 14, minHeight: 0 }}>
        <section style={{ minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(320px, 1fr))", gap: 12 }}>
            {OPERATOR_ASSETS.map((asset) => (
              <OperatorWorkstationCard
                key={asset.symbol}
                asset={asset}
                position={positionBySymbol(asset.symbol)}
                plan={plannedBySymbol(asset.symbol)}
                breakdown={engine?.symbolBreakdowns?.[asset.symbol]}
                onArm={(input) => armPlannedBuy.mutate(input)}
                onCancel={(id) => cancelPlan.mutate(id)}
                busy={busy}
              />
            ))}
          </div>
        </section>

        {hasRailActivity && (
          <SidePanel
            positions={positions}
            closedTrades={closedTrades}
            plannedTrades={plannedTrades}
            onManualSell={(row) => manualSell.mutate(row)}
            onArmSellTarget={(row, targetPrice) => armSellTarget.mutate({ position: row, targetPrice })}
            onCancelTarget={(id) => cancelPlan.mutate(id)}
            busy={busy}
          />
        )}
      </main>
    </div>
  );
}

function TopPill({ icon: Icon, label, color }: { icon: typeof Activity; label: string; color: string }) {
  return (
    <div style={{
      height: 28,
      display: "flex",
      alignItems: "center",
      gap: 6,
      border: `1px solid ${color}55`,
      background: `${color}12`,
      color,
      padding: "0 9px",
      fontSize: 10,
      fontWeight: 900,
      letterSpacing: "0.10em",
    }}>
      <Icon size={12} />
      {label}
    </div>
  );
}
