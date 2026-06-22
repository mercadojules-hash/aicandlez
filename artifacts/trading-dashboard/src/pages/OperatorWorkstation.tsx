import { useCallback, useEffect, useMemo, useState } from "react";
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
  Plus,
  Radio,
  Search,
  ShoppingCart,
  Star,
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

interface MarketTicker {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  lastUpdated: number;
}

interface MarketTickerResponse {
  symbol: string;
  ticker: MarketTicker;
  source: string;
  timestamp?: number;
}

interface MarketFeedHealthResponse {
  symbol: string;
  source: string;
  tickerLastUpdated: number | null;
  tickerAgeSeconds: number | null;
  timestamp: number;
  error?: string;
}

interface OperatorBuyPreview {
  ok: boolean;
  symbol: string;
  quoteId: string;
  price: number;
  bid: number;
  ask: number;
  createdAt: number;
  expiresAt: number;
  effectiveSizeUSD: number;
  sizeUSD: number;
  estimatedQuantity: number | null;
}

interface AssetSpec {
  symbol: string;
  label: string;
  accent: string;
  anchor: number;
}

interface BuyNowConfirmInput {
  symbol: string;
  sellTargetPrice: number | null;
  positionSizeUSD: number;
  confidence: number | null;
}

interface BuyNowSubmitInput extends BuyNowConfirmInput {
  quoteId: string;
  previewPrice: number;
  quoteExpiresAt: number;
}

const AVAILABLE_OPERATOR_ASSETS: AssetSpec[] = [
  { symbol: "BCHUSD", label: "BCH", accent: "#8dc351", anchor: 420 },
  { symbol: "INJUSD", label: "INJ", accent: "#cc55ff", anchor: 19 },
  { symbol: "SOLUSD", label: "SOL", accent: "#ffaa00", anchor: 86 },
  { symbol: "COMPUSD", label: "COMP", accent: "#ffcf5a", anchor: 56 },
  { symbol: "BTCUSD", label: "BTC", accent: "#00e5ff", anchor: 77_000 },
  { symbol: "ETHUSD", label: "ETH", accent: "#66ff66", anchor: 2_150 },
  { symbol: "LINKUSD", label: "LINK", accent: "#5ad7ff", anchor: 9.7 },
  { symbol: "XRPUSD", label: "XRP", accent: "#ff6680", anchor: 1.35 },
  { symbol: "AAVEUSD", label: "AAVE", accent: "#b5f56a", anchor: 195 },
  { symbol: "DOGEUSD", label: "DOGE", accent: "#d6c15d", anchor: 0.11 },
  { symbol: "ADAUSD", label: "ADA", accent: "#7aa7ff", anchor: 0.25 },
  { symbol: "AVAXUSD", label: "AVAX", accent: "#ff5f5f", anchor: 9.3 },
  { symbol: "ATOMUSD", label: "ATOM", accent: "#a78bfa", anchor: 6.2 },
  { symbol: "DOTUSD", label: "DOT", accent: "#e6007a", anchor: 5.5 },
  { symbol: "MATICUSD", label: "MATIC", accent: "#8247e5", anchor: 0.55 },
  { symbol: "SUIUSD", label: "SUI", accent: "#6fbcf0", anchor: 2.1 },
  { symbol: "ARBUSD", label: "ARB", accent: "#28a0f0", anchor: 0.85 },
  { symbol: "OPUSD", label: "OP", accent: "#ff0420", anchor: 1.5 },
  { symbol: "PEPEUSD", label: "PEPE", accent: "#4fd269", anchor: 0.00001 },
  { symbol: "BONKUSD", label: "BONK", accent: "#ff7a1a", anchor: 0.000022 },
  { symbol: "LTCUSD", label: "LTC", accent: "#b8bfd6", anchor: 85 },
  { symbol: "UNIUSD", label: "UNI", accent: "#ff66c4", anchor: 8.4 },
  { symbol: "NEARUSD", label: "NEAR", accent: "#f5f7f8", anchor: 3.6 },
  { symbol: "APTUSD", label: "APT", accent: "#9af2dd", anchor: 7.1 },
];

const DEFAULT_OPERATOR_SYMBOLS = [
  "BCHUSD", "INJUSD", "SOLUSD", "COMPUSD", "BTCUSD", "ETHUSD",
  "LINKUSD", "XRPUSD", "AAVEUSD", "DOGEUSD", "ADAUSD", "AVAXUSD", "ATOMUSD",
];
const DEFAULT_PINNED_SYMBOLS = ["BCHUSD", "INJUSD", "SOLUSD", "COMPUSD", "BTCUSD", "ETHUSD"];

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

function apiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function useMarketTicker(symbol: string, pollMs = 5_000) {
  return useQuery<MarketTickerResponse>({
    queryKey: ["operator-market-ticker", symbol],
    enabled: !!symbol,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/market-data/${encodeURIComponent(symbol)}?timeframe=5m&limit=2`), {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      return readJson<MarketTickerResponse>(res);
    },
    refetchInterval: pollMs,
  });
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

function feeMoney(value: unknown): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  return `-${moneyFull(Math.abs(x), 2)}`;
}

function pct(value: unknown, decimals = 2): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  return `${x >= 0 ? "+" : ""}${x.toFixed(decimals)}%`;
}

function unsignedPct(value: unknown, decimals = 0): string {
  const x = maybeNum(value);
  if (x == null) return "—";
  return `${x.toFixed(decimals)}%`;
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

function confidenceColor(confidence: number | null): string {
  if (confidence == null) return T.faint;
  if (confidence >= 70) return T.green;
  if (confidence >= 50) return T.amber;
  return T.red;
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

function normalizeAssetSymbol(input: string): string {
  const compact = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";
  if (compact.endsWith("USD")) return compact;
  return `${compact}USD`;
}

function assetAliases(asset: AssetSpec): string[] {
  const base = asset.label.toUpperCase();
  return [
    asset.symbol,
    `${base}USD`,
    `${base}-USD`,
    base,
    asset.label,
    asset.label === "BCH" ? "BITCOIN CASH" : "",
    asset.label === "MATIC" ? "POLYGON" : "",
  ].filter(Boolean);
}

function clockTime(ms: unknown): string {
  const ts = maybeNum(ms);
  if (!ts) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
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

function projectedQuantity(buy: unknown, size: unknown): number | null {
  const b = maybeNum(buy);
  const z = maybeNum(size);
  if (b == null || z == null || b <= 0 || z <= 0) return null;
  return z / b;
}

function quantityText(quantity: number | null, label: string): string {
  if (quantity == null) return "—";
  return `${quantity.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ${label}`;
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

function liveModeMath(current: unknown, entry: unknown, quantity: unknown, side: string): number | null {
  const c = maybeNum(current);
  const e = maybeNum(entry);
  const q = maybeNum(quantity);
  if (c == null || e == null || q == null || e <= 0 || q <= 0) return null;
  const short = side.toUpperCase() === "SELL" || side.toUpperCase() === "SHORT";
  return (short ? e - c : c - e) * q;
}

function liveModePct(current: unknown, entry: unknown, side: string): number | null {
  const c = maybeNum(current);
  const e = maybeNum(entry);
  if (c == null || e == null || e <= 0) return null;
  const short = side.toUpperCase() === "SELL" || side.toUpperCase() === "SHORT";
  return ((short ? e - c : c - e) / e) * 100;
}

function pointTimeLabel(index: number, total: number): string {
  const minutesBack = Math.max(0, total - 1 - index) * 5;
  const ts = Date.now() - minutesBack * 60_000;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(ts));
}

function StrikeLine({ points, color, current }: { points: LivePoint[]; color: string; current: number | null }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const { path, fillPath, up, coords, high, low } = useMemo(() => {
    const w = 520;
    const h = 154;
    const source = points.length > 1 ? points.slice(-80) : [];
    if (!source.length) return { path: "", fillPath: "", up: true, coords: [] as Array<{ x: number; y: number; close: number; index: number }>, high: null as null | { x: number; y: number; close: number }, low: null as null | { x: number; y: number; close: number } };
    const values = source.map((p) => p.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(1, max * 0.01);
    const coords = source.map((p, i) => {
      const x = (i / Math.max(1, source.length - 1)) * w;
      const y = h - ((p.close - min) / range) * h;
      return { x, y, close: p.close, index: i };
    });
    const line = coords.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const fill = `${line} L${w},${h} L0,${h} Z`;
    const highPoint = coords.reduce((best, point) => point.close > best.close ? point : best, coords[0]);
    const lowPoint = coords.reduce((best, point) => point.close < best.close ? point : best, coords[0]);
    return { path: line, fillPath: fill, up: values[values.length - 1] >= values[0], coords, high: highPoint, low: lowPoint };
  }, [points]);
  const hover = hoverIndex == null ? null : coords[hoverIndex] ?? null;
  const diff = hover && current && current > 0 ? ((hover.close - current) / current) * 100 : null;
  const gradientId = `fill-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div
      onMouseMove={(event) => {
        if (!coords.length) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        setHoverIndex(Math.round(ratio * (coords.length - 1)));
      }}
      onMouseLeave={() => setHoverIndex(null)}
      style={{ position: "relative", height: 176, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: "rgba(0,0,0,0.16)" }}
    >
      <svg viewBox="0 0 520 154" preserveAspectRatio="none" style={{ width: "100%", height: 154, display: "block" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="520" height="154" fill="rgba(0,0,0,0.18)" />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" x2="520" y1={20 + i * 34} y2={20 + i * 34} stroke="rgba(255,255,255,0.045)" />
        ))}
        {fillPath && <path d={fillPath} fill={`url(#${gradientId})`} />}
        {path && <path d={path} fill="none" stroke={up ? color : T.red} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
        {high && (
          <g>
            <line x1={Math.max(0, high.x - 8)} x2={Math.min(520, high.x + 8)} y1={high.y} y2={high.y} stroke={T.green} strokeWidth="1.5" />
            <circle cx={high.x} cy={high.y} r="3.8" fill={T.green} stroke="#001106" strokeWidth="1.5" />
          </g>
        )}
        {low && (
          <g>
            <line x1={Math.max(0, low.x - 8)} x2={Math.min(520, low.x + 8)} y1={low.y} y2={low.y} stroke={T.red} strokeWidth="1.5" />
            <circle cx={low.x} cy={low.y} r="3.8" fill={T.red} stroke="#150006" strokeWidth="1.5" />
          </g>
        )}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1="0" y2="154" stroke={T.cyan} strokeWidth="1.2" strokeDasharray="4 4" opacity="0.9" />
            <line x1="0" x2="520" y1={hover.y} y2={hover.y} stroke={T.cyan} strokeWidth="1" strokeDasharray="3 5" opacity="0.65" />
            <circle cx={hover.x} cy={hover.y} r="4.6" fill={T.cyan} stroke="#001116" strokeWidth="1.5" />
          </g>
        )}
        {path && <circle cx="510" cy="76" r="3.5" fill={up ? color : T.red} opacity="0.9" />}
      </svg>
      <div style={{ height: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 10px", alignItems: "center", color: T.faint, fontSize: 9, fontWeight: 900, letterSpacing: "0.04em" }}>
        <span style={{ color: T.green }}>High: {price(high?.close)}</span>
        <span style={{ color: T.red, textAlign: "right" }}>Low: {price(low?.close)}</span>
      </div>
      {hover && (
        <div style={{
          position: "absolute",
          top: 8,
          left: hover.x > 350 ? 12 : Math.min(356, hover.x + 14),
          minWidth: 152,
          border: `1px solid ${T.cyan}88`,
          background: "rgba(0,8,14,0.94)",
          boxShadow: `0 0 18px ${T.cyan}22`,
          padding: "8px 9px",
          color: T.text,
          fontSize: 10,
          fontWeight: 900,
          lineHeight: 1.65,
          pointerEvents: "none",
          zIndex: 3,
        }}>
          <div>Price: {price(hover.close)}</div>
          <div>Time: {pointTimeLabel(hover.index, coords.length)}</div>
          <div>Current: {price(current)}</div>
          <div style={{ color: (diff ?? 0) >= 0 ? T.green : T.red }}>Difference: {pct(diff)}</div>
        </div>
      )}
    </div>
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

function ProjectionValue({ label, value, color = T.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: T.faint, fontSize: 8, fontWeight: 950, letterSpacing: "0.10em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ color, fontSize: 12, fontWeight: 950, marginTop: 4, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
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
  const marketQuery = useMarketTicker(asset.symbol);
  const marketPrice = maybeNum(marketQuery.data?.ticker?.price);
  const current = marketPrice ?? livePrice;
  const priceState = marketPrice != null ? "live" : state;
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
        <span style={{ color: T.faint, fontSize: 8, fontWeight: 900, letterSpacing: "0.10em" }}>{priceState.toUpperCase()}</span>
      </div>
      <div style={{ color: T.text, fontSize: 13, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{price(current)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 9, fontWeight: 900 }}>
        <span style={{ color: summary.up ? T.green : T.red }}>{pct(summary.pct)}</span>
        <span style={{ color: confidence == null ? T.faint : asset.accent }}>{confidence == null ? "AI —" : `${confidence.toFixed(0)}%`}</span>
        <span style={{ color: trendColor(trend) }}>{trend}</span>
      </div>
    </div>
  );
}

function MarketRadar({ assets, engine }: { assets: AssetSpec[]; engine: EngineStatusResponse | undefined }) {
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
        {assets.map((asset) => (
          <RadarTile key={asset.symbol} asset={asset} breakdown={engine?.symbolBreakdowns?.[asset.symbol]} />
        ))}
      </div>
    </section>
  );
}

function AssetControlBar({
  assets,
  selectedSymbols,
  pinnedSymbols,
  search,
  suggestions,
  onSearch,
  onAdd,
  onTogglePin,
}: {
  assets: AssetSpec[];
  selectedSymbols: string[];
  pinnedSymbols: string[];
  search: string;
  suggestions: AssetSpec[];
  onSearch: (value: string) => void;
  onAdd: (asset: AssetSpec) => void;
  onTogglePin: (symbol: string) => void;
}) {
  const selectedSet = new Set(selectedSymbols);
  const pinnedSet = new Set(pinnedSymbols);
  const pinnedAssets = pinnedSymbols
    .map((symbol) => assets.find((asset) => asset.symbol === symbol))
    .filter((asset): asset is AssetSpec => !!asset);

  return (
    <section style={{
      borderBottom: `1px solid ${T.border}`,
      background: "linear-gradient(180deg, rgba(0,229,255,0.045), rgba(0,0,0,0.16))",
      padding: "10px 14px",
      display: "grid",
      gridTemplateColumns: "minmax(260px, 0.38fr) minmax(0, 1fr)",
      gap: 10,
      alignItems: "center",
    }}>
      <div style={{ position: "relative", minWidth: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr) 92px", alignItems: "center", border: `1px solid ${T.border}`, background: "#00070d" }}>
          <Search size={14} color={T.cyan} style={{ marginLeft: 8 }} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search Asset Symbol"
            style={{ ...inputStyle(), border: "none", height: 38, paddingLeft: 0 }}
          />
          <button
            type="button"
            disabled={!suggestions[0]}
            onClick={() => suggestions[0] && onAdd(suggestions[0])}
            style={{ ...buttonStyle(T.cyan, !suggestions[0]), height: 38, borderTop: "none", borderRight: "none", borderBottom: "none" }}
          >
            <Plus size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            ADD
          </button>
        </div>
        {search.trim().length > 0 && suggestions.length > 0 && (
          <div style={{
            position: "absolute",
            top: 42,
            left: 0,
            right: 0,
            zIndex: 10,
            border: `1px solid ${T.cyan}66`,
            background: "rgba(0,7,13,0.98)",
            boxShadow: `0 12px 28px ${T.cyan}18`,
            maxHeight: 224,
            overflowY: "auto",
          }}>
            {suggestions.map((asset) => {
              const alreadyAdded = selectedSet.has(asset.symbol);
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  onClick={() => onAdd(asset)}
                  style={{
                    width: "100%",
                    border: "none",
                    borderBottom: `1px solid ${T.border}`,
                    background: alreadyAdded ? "rgba(255,255,255,0.025)" : "transparent",
                    color: T.text,
                    fontFamily: T.font,
                    padding: "8px 10px",
                    display: "grid",
                    gridTemplateColumns: "74px 84px 1fr",
                    gap: 8,
                    alignItems: "center",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: asset.accent, fontSize: 12, fontWeight: 950 }}>{asset.symbol}</span>
                  <span style={{ color: T.muted, fontSize: 10, fontWeight: 900 }}>{asset.label}-USD</span>
                  <span style={{ color: alreadyAdded ? T.green : T.faint, fontSize: 10, fontWeight: 800 }}>
                    {alreadyAdded ? "ADDED" : asset.label === "BCH" ? "Bitcoin Cash" : "Exchange-supported"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", minWidth: 0 }}>
        <span style={{ color: T.faint, fontSize: 9, fontWeight: 950, letterSpacing: "0.12em", whiteSpace: "nowrap" }}>PINNED FIRST</span>
        {pinnedAssets.map((asset) => (
          <button
            key={asset.symbol}
            type="button"
            onClick={() => onTogglePin(asset.symbol)}
            style={{
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: `1px solid ${asset.accent}66`,
              background: `${asset.accent}16`,
              color: asset.accent,
              padding: "0 8px",
              fontFamily: T.font,
              fontSize: 10,
              fontWeight: 950,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Star size={11} fill={pinnedSet.has(asset.symbol) ? asset.accent : "none"} />
            {asset.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function OperatorWorkstationCard({
  asset,
  pinned,
  position,
  plan,
  breakdown,
  onArm,
  onBuyNow,
  onCancel,
  onTogglePin,
  busy,
}: {
  asset: AssetSpec;
  pinned: boolean;
  position: Record<string, unknown> | undefined;
  plan: PlannedTradeRow | undefined;
  breakdown: EngineSymbolBreakdown | undefined;
  onArm: (input: { symbol: string; buyTargetPrice: number; sellTargetPrice: number | null; positionSizeUSD: number }) => void;
  onBuyNow: (input: { symbol: string; sellTargetPrice: number | null; positionSizeUSD: number; confidence: number | null }) => void;
  onCancel: (id: string) => void;
  onTogglePin: (symbol: string) => void;
  busy: boolean;
}) {
  const { points, livePrice, state, summary } = useLiveCandles({
    symbol: asset.symbol,
    syntheticAnchor: asset.anchor,
    limit: 96,
    timeframe: "5m",
    pollMs: 15_000,
  });
  const marketQuery = useMarketTicker(asset.symbol);
  const marketPrice = maybeNum(marketQuery.data?.ticker?.price);
  const current = marketPrice ?? livePrice ?? maybeNum(field(position ?? {}, "current_price", "currentPrice"));
  const entry = maybeNum(field(position ?? {}, "entry_price", "entryPrice"));
  const side = String(field(position ?? {}, "side") ?? "BUY");
  const liveQuantity = maybeNum(field(position ?? {}, "quantity")) ?? (entry && positionSize(position ?? {}) > 0 ? positionSize(position ?? {}) / entry : null);
  const livePnl = liveModeMath(current, entry, liveQuantity, side);
  const pnl = livePnl ?? maybeNum(field(position ?? {}, "unrealized_pnl", "unrealizedPnl"));
  const pnlPct = liveModePct(current, entry, side) ?? maybeNum(field(position ?? {}, "unrealized_pnl_pct", "unrealizedPnlPct"));
  const aiConfidence = confidenceOf(breakdown);
  const trend = trendOf(breakdown, summary.pct);
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [size, setSize] = useState("10");
  const canArm = maybeNum(buy) != null && maybeNum(size) != null && !busy;
  const canBuyNow = maybeNum(size) != null && !busy;
  const plannedBuy = plan?.buyTargetPrice ?? maybeNum(buy);
  const plannedSell = plan?.sellTargetPrice ?? maybeNum(sell);
  const plannedSize = plan?.positionSizeUSD ?? maybeNum(size);
  const quantity = projectedQuantity(plannedBuy, plannedSize);
  const grossProfit = expectedProfitUSD(plannedBuy, plannedSell, plannedSize);
  const fees = estimatedFeesUSD(plannedSize);
  const netProfit = grossProfit == null ? null : grossProfit - (fees ?? 0);
  const expectedReturn = expectedReturnPct(plannedBuy, plannedSell);
  const liveMode = !!position;
  const targetPrice = plannedSell ?? maybeNum(field(position ?? {}, "manual_exit_target_price", "manualExitTargetPrice"));
  const confidenceColorValue = confidenceColor(aiConfidence);

  return (
    <section style={{
      border: `1px solid ${plan ? statusColor(plan.status) : "rgba(255,255,255,0.10)"}`,
      background: `linear-gradient(180deg, ${asset.accent}12 0%, rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.28) 100%)`,
      minHeight: 548,
      display: "grid",
      gridTemplateRows: "auto auto 1fr auto",
    }}>
      <div style={{ padding: "12px 13px 8px", display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              aria-label={pinned ? `Unpin ${asset.label}` : `Pin ${asset.label}`}
              onClick={() => onTogglePin(asset.symbol)}
              style={{
                width: 28,
                height: 28,
                display: "grid",
                placeItems: "center",
                border: `1px solid ${pinned ? asset.accent : T.border}`,
                background: pinned ? `${asset.accent}18` : "rgba(255,255,255,0.025)",
                color: pinned ? asset.accent : T.faint,
                cursor: "pointer",
              }}
            >
              <Star size={14} fill={pinned ? asset.accent : "none"} />
            </button>
            <div style={{ color: asset.accent, fontSize: 24, fontWeight: 950, letterSpacing: "0.08em" }}>{asset.label}</div>
          </div>
          <div style={{ color: liveMode ? T.green : T.faint, fontSize: 10, fontWeight: 800, letterSpacing: "0.14em" }}>{asset.symbol} · {liveMode ? "LIVE POSITION" : marketPrice != null ? "LIVE" : state.toUpperCase()}</div>
        </div>
        <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: T.text, fontSize: 22, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{price(current)}</div>
              <div style={{ color: summary.up ? T.green : T.red, fontSize: 11, fontWeight: 800 }}>{pct(summary.pct)}</div>
            </div>
            <div style={{
              minWidth: 58,
              border: `1px solid ${confidenceColorValue}88`,
              background: `${confidenceColorValue}18`,
              color: confidenceColorValue,
              padding: "5px 7px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 8, fontWeight: 950, letterSpacing: "0.10em" }}>CONF</div>
              <div style={{ fontSize: 14, fontWeight: 950, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{unsignedPct(aiConfidence)}</div>
            </div>
          </div>
        </div>
      </div>

      <StrikeLine points={points} color={asset.accent} current={current} />

      <div style={{ padding: "10px 13px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <Metric label={liveMode ? "ENTRY PRICE" : "BUY TARGET"} value={price(liveMode ? entry : plannedBuy)} />
        <Metric label={liveMode ? "CURRENT P/L $" : "SELL TARGET"} value={liveMode ? signedMoney(pnl) : price(plannedSell)} color={liveMode ? (pnl ?? 0) >= 0 ? T.green : T.red : T.text} />
        <Metric label={liveMode ? "CURRENT P/L %" : "SIZE"} value={liveMode ? pct(pnlPct) : moneyFull(plannedSize, 0)} color={liveMode ? (pnlPct ?? 0) >= 0 ? T.green : T.red : T.text} />
        <Metric label="AI CONF" value={unsignedPct(aiConfidence)} color={confidenceColorValue} />
        <Metric label="TREND" value={trend} color={trendColor(trend)} />
        <Metric label={liveMode ? "DISTANCE TO TARGET" : "PLAN STATUS"} value={liveMode ? distanceText(current, targetPrice) : plan ? planState(plan.status) : "READY"} color={liveMode ? T.amber : plan ? statusColor(plan.status) : T.faint} />
        {!liveMode && <Metric label="EXPECTED PROFIT" value={signedMoney(netProfit)} color={(netProfit ?? 0) >= 0 ? T.green : T.red} />}
        {!liveMode && <Metric label="EXPECTED RETURN" value={expectedReturn == null ? "—" : pct(expectedReturn)} color={(expectedReturn ?? 0) >= 0 ? T.green : T.red} />}
        {!liveMode && <Metric label="ESTIMATED FEES" value={moneyFull(fees, 2)} color={T.faint} />}
        {!liveMode && <Metric label="DISTANCE TO BUY" value={distanceText(current, plannedBuy)} color={T.cyan} />}
        {!liveMode && <Metric label="DISTANCE TO SELL" value={distanceText(current, plannedSell)} color={T.amber} />}
      </div>

      <div style={{ padding: "10px 13px 13px", borderTop: `1px solid ${T.border}`, display: "grid", gap: 8 }}>
        <div style={{
          border: `1px solid ${T.border}`,
          background: "rgba(0,7,13,0.74)",
          padding: "9px 10px",
          display: "grid",
          gridTemplateColumns: "minmax(150px, 1.15fr) repeat(3, minmax(0, 1fr))",
          gap: 10,
          alignItems: "center",
        }}>
          <div>
            <div style={{ color: T.faint, fontSize: 9, fontWeight: 950, letterSpacing: "0.12em" }}>TRADE PROJECTION</div>
            <div style={{
              color: (netProfit ?? 0) >= 0 ? T.green : T.red,
              fontSize: 24,
              fontWeight: 950,
              marginTop: 4,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}>
              {signedMoney(netProfit)}
            </div>
            <div style={{ color: T.faint, fontSize: 9, fontWeight: 900, marginTop: 5 }}>NET PROFIT</div>
          </div>
          <ProjectionValue label="QUANTITY" value={quantityText(quantity, asset.label)} color={T.text} />
          <ProjectionValue label="GROSS PROFIT" value={signedMoney(grossProfit)} color={(grossProfit ?? 0) >= 0 ? T.green : T.red} />
          <ProjectionValue label="EST. FEES" value={feeMoney(fees)} color={T.faint} />
          <ProjectionValue label="RETURN" value={expectedReturn == null ? "—" : pct(expectedReturn)} color={(expectedReturn ?? 0) >= 0 ? T.green : T.red} />
          <ProjectionValue label="CONFIDENCE" value={unsignedPct(aiConfidence)} color={confidenceColorValue} />
          <ProjectionValue label="BUY TARGET" value={price(plannedBuy)} color={T.cyan} />
          <ProjectionValue label="SELL TARGET" value={price(plannedSell)} color={T.amber} />
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
        <div style={{ display: "grid", gridTemplateColumns: activePlan(plan) ? "1fr 1fr 120px" : "1fr 1fr", gap: 8 }}>
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
          <button
            type="button"
            disabled={!canBuyNow}
            onClick={() => {
              const positionSizeUSD = maybeNum(size);
              if (positionSizeUSD == null) return;
              onBuyNow({
                symbol: asset.symbol,
                sellTargetPrice: maybeNum(sell),
                positionSizeUSD,
                confidence: aiConfidence,
              });
            }}
            style={buttonStyle(T.green, !canBuyNow)}
          >
            <ShoppingCart size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
            BUY NOW
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

function BuyNowConfirmModal({
  input,
  userId,
  api,
  pending,
  onCancel,
  onConfirm,
}: {
  input: BuyNowConfirmInput;
  userId: string;
  api: ReturnType<typeof useOperatorApi>;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (preview: OperatorBuyPreview) => void;
}) {
  const asset = AVAILABLE_OPERATOR_ASSETS.find((a) => a.symbol === input.symbol);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const previewQuery = useQuery<OperatorBuyPreview>({
    queryKey: ["operator-buy-preview", userId, input.symbol, input.positionSizeUSD],
    enabled: !!userId,
    queryFn: async () => {
      const res = await api(`/api/admin/users/${encodeURIComponent(userId)}/operator-buy/preview`, {
        method: "POST",
        body: JSON.stringify({
          symbol: input.symbol,
          sizeUSD: input.positionSizeUSD,
          confidence: input.confidence ?? undefined,
          note: "Operator workstation BUY NOW preview",
        }),
      });
      return readJson<OperatorBuyPreview>(res);
    },
    refetchOnWindowFocus: false,
  });
  const preview = previewQuery.data;
  const quoteAge = preview ? Math.max(0, Math.floor((now - preview.createdAt) / 1000)) : null;
  const quoteExpired = preview ? preview.expiresAt <= now : false;
  const estimatedQuantity = preview?.estimatedQuantity ?? projectedQuantity(preview?.price, input.positionSizeUSD);
  const estimatedFee = estimatedFeesUSD(input.positionSizeUSD);
  const estimatedTotalCost = estimatedFee == null ? input.positionSizeUSD : input.positionSizeUSD + estimatedFee;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm BUY NOW"
      onClick={() => {
        if (!pending) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "rgba(0,0,0,0.74)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          border: `1px solid ${T.green}77`,
          background: "#020b08",
          boxShadow: `0 0 34px ${T.green}22`,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ color: T.green, fontSize: 10, fontWeight: 950, letterSpacing: "0.18em" }}>CONFIRM BUY NOW</div>
        <div style={{ color: T.text, fontSize: 16, fontWeight: 950, lineHeight: 1.35 }}>
          Market buy {input.symbol} for {moneyFull(input.positionSizeUSD, 0)}?
        </div>
        <div style={{
          border: `1px solid ${T.green}44`,
          background: "rgba(102,255,102,0.055)",
          padding: "10px 11px",
          display: "grid",
          gap: 9,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <RailValue label="MARKET PRICE" value={price(preview?.price)} color={quoteExpired ? T.red : T.green} strong />
            <RailValue label="INVESTMENT" value={moneyFull(input.positionSizeUSD, 2)} color={T.text} strong />
            <RailValue label="ESTIMATED QUANTITY" value={quantityText(estimatedQuantity, asset?.label ?? input.symbol.replace(/USD$/, ""))} color={T.cyan} />
            <RailValue label="ESTIMATED FEE" value={moneyFull(estimatedFee, 2)} color={T.faint} />
            <RailValue label="ESTIMATED TOTAL COST" value={moneyFull(estimatedTotalCost, 2)} color={T.green} />
            <RailValue label="QUOTE ID" value={preview?.quoteId ? preview.quoteId.slice(0, 8) : previewQuery.isError ? "ERROR" : "LOADING"} color={previewQuery.isError || quoteExpired ? T.red : T.green} />
            <RailValue label="BID / ASK" value={`${price(preview?.bid)} / ${price(preview?.ask)}`} color={T.faint} />
            <RailValue label="QUOTE AGE" value={quoteAge == null ? "—" : `${quoteAge}s`} color={quoteExpired ? T.red : T.green} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <RailValue label="SELL TARGET" value={price(input.sellTargetPrice)} color={T.amber} />
          <RailValue label="CONFIDENCE" value={unsignedPct(input.confidence)} color={confidenceColor(input.confidence)} />
          <RailValue label="LABEL" value="OPERATOR_ENTERED" color={T.cyan} />
          <RailValue label="MODE" value="LIVE MARKET BUY" color={T.green} />
        </div>
        <div style={{ color: T.faint, fontSize: 10, lineHeight: 1.5 }}>
          This BUY requires the displayed quoteId. If the quote expires, execution is rejected before broker submission and the quote must be refreshed.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" disabled={pending} onClick={onCancel} style={buttonStyle(T.faint, pending)}>
            CANCEL
          </button>
          <button type="button" disabled={pending || !preview} onClick={() => preview && onConfirm(preview)} style={buttonStyle(quoteExpired ? T.red : T.green, pending || !preview)}>
            {pending ? "BUYING..." : quoteExpired ? "SUBMIT EXPIRED QUOTE TEST" : "BUY NOW"}
          </button>
        </div>
        {previewQuery.isError && (
          <div style={{ color: T.red, fontSize: 10, fontWeight: 800 }}>
            {(previewQuery.error as Error).message}
          </div>
        )}
      </div>
    </div>
  );
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
  const asset = AVAILABLE_OPERATOR_ASSETS.find((a) => a.symbol === symbol);
  const { livePrice, state, lastUpdated } = useLiveCandles({
    symbol,
    syntheticAnchor: asset?.anchor ?? maybeNum(field(row, "current_price", "currentPrice")) ?? maybeNum(field(row, "entry_price", "entryPrice")) ?? 100,
    limit: 48,
    timeframe: "5m",
    pollMs: 15_000,
  });
  const marketQuery = useMarketTicker(symbol);
  const marketPrice = maybeNum(marketQuery.data?.ticker?.price);
  const entry = maybeNum(field(row, "entry_price", "entryPrice"));
  const current = marketPrice ?? livePrice ?? maybeNum(field(row, "current_price", "currentPrice"));
  const side = String(field(row, "side") ?? "BUY");
  const sizeUsd = positionSize(row);
  const quantity = maybeNum(field(row, "quantity")) ?? (entry && sizeUsd > 0 ? sizeUsd / entry : null);
  const pnl = liveModeMath(current, entry, quantity, side) ?? maybeNum(field(row, "unrealized_pnl", "unrealizedPnl"));
  const pnlPct = liveModePct(current, entry, side) ?? maybeNum(field(row, "unrealized_pnl_pct", "unrealizedPnlPct"));
  const resolvedTarget = sellTarget?.sellTargetPrice ?? maybeNum(field(row, "manual_exit_target_price", "manualExitTargetPrice"));
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: "9px 0", display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 1fr 0.8fr", gap: 8, alignItems: "end" }}>
        <RailValue label="SYMBOL" value={symbol} color={T.text} strong />
        <RailValue label="ENTRY PRICE" value={price(entry)} />
        <RailValue label="CURRENT PRICE" value={price(current)} />
        <RailValue label="P/L" value={`${signedMoney(pnl)} ${pct(pnlPct)}`} color={(pnl ?? 0) >= 0 ? T.green : T.red} />
        <RailValue label="TIME" value={openAge(row)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
        <RailValue label="SELL TARGET" value={price(resolvedTarget)} color={T.amber} />
        <RailValue label="DISTANCE TO TARGET" value={distanceText(current, resolvedTarget)} color={T.cyan} />
        <RailValue label="LAST UPDATE" value={`${clockTime(marketQuery.data?.ticker?.lastUpdated ?? lastUpdated)} · ${marketPrice != null ? "LIVE" : state.toUpperCase()}`} color={marketPrice != null || state === "live" ? T.green : T.amber} />
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
  const gross = expectedProfitUSD(row.buyTargetPrice, row.sellTargetPrice, row.positionSizeUSD);
  const net = (() => {
    if (gross == null) return null;
    return gross - (estimatedFeesUSD(row.positionSizeUSD) ?? 0);
  })();
  const expectedReturn = expectedReturnPct(row.buyTargetPrice, row.sellTargetPrice);
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
          STATUS {planState(row.status)} · EXPECTED PROFIT {signedMoney(net)} · EXPECTED RETURN {expectedReturn == null ? "—" : pct(expectedReturn)}
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
  const operatorStorageKey = `operator-workstation-assets:${userId ?? (normalizedEmail || "anonymous")}`;
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(DEFAULT_OPERATOR_SYMBOLS);
  const [pinnedSymbols, setPinnedSymbols] = useState<string[]>(DEFAULT_PINNED_SYMBOLS);
  const [assetSearch, setAssetSearch] = useState("");
  const [buyNowConfirm, setBuyNowConfirm] = useState<BuyNowConfirmInput | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(operatorStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { selectedSymbols?: unknown; pinnedSymbols?: unknown };
      const selected = Array.isArray(parsed.selectedSymbols)
        ? parsed.selectedSymbols.map(String).filter((s) => AVAILABLE_OPERATOR_ASSETS.some((a) => a.symbol === s))
        : [];
      const pinned = Array.isArray(parsed.pinnedSymbols)
        ? parsed.pinnedSymbols.map(String).filter((s) => AVAILABLE_OPERATOR_ASSETS.some((a) => a.symbol === s))
        : [];
      if (selected.length) setSelectedSymbols(selected);
      if (pinned.length) setPinnedSymbols(pinned);
    } catch {
      /* Keep defaults if local preference data is malformed. */
    }
  }, [operatorStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(operatorStorageKey, JSON.stringify({ selectedSymbols, pinnedSymbols }));
  }, [operatorStorageKey, selectedSymbols, pinnedSymbols]);

  const selectedAssets = useMemo(() => {
    const selected = selectedSymbols
      .map((symbol) => AVAILABLE_OPERATOR_ASSETS.find((asset) => asset.symbol === symbol))
      .filter((asset): asset is AssetSpec => !!asset);
    const pinned = new Set(pinnedSymbols);
    return selected.sort((a, b) => {
      const ai = pinned.has(a.symbol) ? 0 : 1;
      const bi = pinned.has(b.symbol) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return selectedSymbols.indexOf(a.symbol) - selectedSymbols.indexOf(b.symbol);
    });
  }, [pinnedSymbols, selectedSymbols]);

  const assetSuggestions = useMemo(() => {
    const q = assetSearch.trim().toUpperCase();
    if (!q) return AVAILABLE_OPERATOR_ASSETS.slice(0, 8);
    const normalized = normalizeAssetSymbol(q);
    return AVAILABLE_OPERATOR_ASSETS
      .filter((asset) => {
        const aliases = assetAliases(asset);
        return aliases.some((alias) => alias.toUpperCase().includes(q) || alias.toUpperCase().replace(/[^A-Z0-9]/g, "") === normalized);
      })
      .slice(0, 8);
  }, [assetSearch]);

  const addAsset = (asset: AssetSpec) => {
    setSelectedSymbols((prev) => prev.includes(asset.symbol) ? prev : [...prev, asset.symbol]);
    setAssetSearch("");
    toast({ title: `${asset.label} added`, description: "Asset card and Market Radar are now tracking it." });
  };

  const togglePin = (symbol: string) => {
    setPinnedSymbols((prev) => prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [symbol, ...prev]);
    setSelectedSymbols((prev) => prev.includes(symbol) ? prev : [symbol, ...prev]);
  };

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

  const feedHealthQuery = useQuery<MarketFeedHealthResponse>({
    queryKey: ["operator-workstation-market-feed-health", "INJUSD"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/market-data/INJUSD/health"), {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      return readJson<MarketFeedHealthResponse>(res);
    },
    refetchInterval: 5_000,
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

  const buyNow = useMutation({
    mutationFn: async (input: BuyNowSubmitInput) => {
      if (!userId) throw new Error("Operator user id unavailable");
      const buyRes = await api(`/api/admin/users/${encodeURIComponent(userId)}/operator-buy`, {
        method: "POST",
        body: JSON.stringify({
          symbol: input.symbol,
          sizeUSD: input.positionSizeUSD,
          confidence: input.confidence ?? undefined,
          quoteId: input.quoteId,
          note: "Operator workstation BUY NOW",
        }),
      });
      const body = await readJson<{
        ok?: boolean;
        positionId?: string | null;
        exchangeOrderId?: string | null;
        exchange?: string | null;
        fillPrice?: number | null;
        quoteId?: string | null;
        quotePrice?: number | null;
        quoteExpiresAt?: number | null;
        sizeUSD?: number | null;
        effectiveSizeUSD?: number | null;
        dryRun?: boolean;
      }>(buyRes);
      if (input.sellTargetPrice != null && body.positionId) {
        const targetRes = await api(`/api/admin/users/${encodeURIComponent(userId)}/sell-targets`, {
          method: "POST",
          body: JSON.stringify({
            positionId: body.positionId,
            targetPrice: input.sellTargetPrice,
            note: "Operator workstation BUY NOW sell target",
          }),
        });
        await readJson<{ plannedTrade: PlannedTradeRow }>(targetRes);
      }
      return body;
    },
    onSuccess: (body, input) => {
      const asset = AVAILABLE_OPERATOR_ASSETS.find((a) => a.symbol === input.symbol);
      const exchange = body.exchange ? body.exchange.toUpperCase() : "EXCHANGE";
      toast({
        title: `BUY NOW submitted${asset ? ` — ${asset.label}` : ""}`,
        description: [`${moneyFull(body.sizeUSD ?? body.effectiveSizeUSD ?? input.positionSizeUSD, 0)}`, exchange, body.fillPrice ? `@ ${price(body.fillPrice)}` : `quote ${price(input.previewPrice)}`, body.quoteId ? `quote ${body.quoteId.slice(0, 8)}` : null, input.sellTargetPrice != null ? "sell target armed" : null].filter(Boolean).join(" · "),
      });
      setBuyNowConfirm(null);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["runtime-state"] });
    },
    onError: (err: Error) => toast({ title: "BUY NOW failed", description: err.message, variant: "destructive" }),
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
  const busy = armPlannedBuy.isPending || buyNow.isPending || cancelPlan.isPending || armSellTarget.isPending || manualSell.isPending;
  const engine = engineQuery.data;
  const feedAge = maybeNum(feedHealthQuery.data?.tickerAgeSeconds);
  const feedUnavailable = feedHealthQuery.isError || !!feedHealthQuery.data?.error || feedAge == null;
  const feedColor = feedUnavailable || feedAge > 60 ? T.red : feedAge >= 15 ? T.amber : T.green;
  const feedStatus = feedUnavailable ? "UNAVAILABLE" : feedAge > 60 ? "STALE" : "LIVE";
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
    <div style={{ minHeight: "100dvh", background: T.bg, color: T.muted, fontFamily: T.font, display: "grid", gridTemplateRows: "auto auto auto auto 1fr" }}>
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
          <TopPill icon={Radio} label={`MARKET FEED: ${feedStatus}`} color={feedColor} />
          <TopPill icon={Activity} label={`TICKER AGE: ${feedAge == null ? "—" : `${feedAge}s`}`} color={feedColor} />
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
      <AssetControlBar
        assets={AVAILABLE_OPERATOR_ASSETS}
        selectedSymbols={selectedSymbols}
        pinnedSymbols={pinnedSymbols}
        search={assetSearch}
        suggestions={assetSuggestions}
        onSearch={setAssetSearch}
        onAdd={addAsset}
        onTogglePin={togglePin}
      />
      <MarketRadar assets={selectedAssets} engine={engine} />

      <main style={{ padding: 14, display: "grid", gridTemplateColumns: hasRailActivity ? "minmax(680px, 1fr) minmax(390px, 0.36fr)" : "minmax(680px, 1fr)", gap: 14, minHeight: 0 }}>
        <section style={{ minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(320px, 1fr))", gap: 12 }}>
            {selectedAssets.map((asset) => (
              <OperatorWorkstationCard
                key={asset.symbol}
                asset={asset}
                pinned={pinnedSymbols.includes(asset.symbol)}
                position={positionBySymbol(asset.symbol)}
                plan={plannedBySymbol(asset.symbol)}
                breakdown={engine?.symbolBreakdowns?.[asset.symbol]}
                onArm={(input) => armPlannedBuy.mutate(input)}
                onBuyNow={(input) => setBuyNowConfirm(input)}
                onCancel={(id) => cancelPlan.mutate(id)}
                onTogglePin={togglePin}
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
      {buyNowConfirm && (
        <BuyNowConfirmModal
          input={buyNowConfirm}
          userId={userId!}
          api={api}
          pending={buyNow.isPending}
          onCancel={() => setBuyNowConfirm(null)}
          onConfirm={(preview) => buyNow.mutate({
            ...buyNowConfirm,
            quoteId: preview.quoteId,
            previewPrice: preview.price,
            quoteExpiresAt: preview.expiresAt,
          })}
        />
      )}
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
