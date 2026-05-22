import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  Key,
  Link2,
  Loader2,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldOff,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExchangeStatus {
  mode:                "simulation" | "live";
  killSwitch:          boolean;
  paused:              boolean;
  liveCapable:         boolean;
  apiConfigured:       boolean;
  liveEnabled:         boolean;
  ordersToday:         number;
  lastOrderAt:         number | null;
  simBalances:         Balances;
  exchangeName:        string;
  configuredExchanges: string[];
}
interface Balances { USD: number; BTC: number; ETH: number; SOL: number }
interface RiskGate  { name: string; passed: boolean; detail: string }
interface OrderPreview {
  symbol:        string;
  side:          string;
  orderType:     string;
  volumeBase:    number;
  estimatedFill: number;
  valueUSD:      number;
  feeUSD:        number;
  riskGates:     RiskGate[];
  allowed:       boolean;
  blockedBy:     string[];
}
interface ExchangeOrder {
  id:             string;
  symbol:         string;
  side:           "buy" | "sell";
  orderType:      "market" | "limit";
  volumeBase:     number;
  fillPrice:      number;
  valueUSD:       number;
  feeUSD:         number;
  status:         "filled" | "rejected" | "cancelled" | "open";
  mode:           "simulation" | "live";
  timestamp:      number;
  riskChecks:     RiskGate[];
  rejectionReason?: string;
}

// Per-user encrypted exchange connection (admin's personal Kraken keys)
interface UserExchangeConnection {
  exchange:       string;
  label:          string | null;
  status:         "active" | "inactive" | "error";
  isDefault:      boolean;
  tradingMode:    "paper" | "live";
  permissions:    { read: boolean; trade: boolean; withdraw: false } | null;
  lastVerifiedAt: string | null;
  lastError:      string | null;
}
interface UserExchangeEntry {
  exchange:   string;
  connected:  boolean;
  connection: UserExchangeConnection | null;
  meta: {
    id:                 string;
    name:               string;
    requiresPassphrase: boolean;
  };
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string };
    throw new Error(e.error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function GateBadge({ gate }: { gate: RiskGate }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 px-2 rounded text-[11px] ${gate.passed ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-400"}`}>
      {gate.passed
        ? <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
        : <XCircle      className="w-3 h-3 mt-0.5 shrink-0" />}
      <span className="font-medium">{gate.name}</span>
      <span className="text-muted-foreground ml-auto whitespace-nowrap">{gate.detail}</span>
    </div>
  );
}

function BalanceLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-mono font-semibold text-foreground">{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground ml-1">{sub}</span>}
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: ExchangeOrder }) {
  const statusColor =
    order.status === "filled"   ? "text-green-400"  :
    order.status === "rejected" ? "text-red-400"     :
    order.status === "open"     ? "text-yellow-400"  :
    "text-muted-foreground";
  return (
    <div className="grid grid-cols-[80px_60px_60px_80px_1fr_72px] gap-2 px-3 py-2 text-[11px] border-b border-border/10 hover:bg-card/40 transition-colors">
      <span className="font-mono text-foreground">{order.symbol.replace("USD","")}</span>
      <span className={order.side === "buy" ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
        {order.side.toUpperCase()}
      </span>
      <span className="text-muted-foreground">{order.orderType}</span>
      <span className="font-mono">${order.valueUSD.toLocaleString()}</span>
      <span className="text-muted-foreground truncate">
        {order.status === "rejected" ? (order.rejectionReason?.slice(0, 40) ?? "Rejected") : `@ $${order.fillPrice.toLocaleString()}`}
      </span>
      <span className={`text-right font-medium ${statusColor}`}>{order.status.toUpperCase()}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SYMBOLS    = ["BTCUSD", "ETHUSD", "SOLUSD"] as const;
const ORDER_TYPES = ["market", "limit"] as const;

export default function Exchange() {
  const qc = useQueryClient();

  const { data: status } = useQuery<ExchangeStatus>({
    queryKey: ["exchange-status"],
    queryFn:  () => apiFetch("/api/exchange/status"),
    refetchInterval: 3000,
  });

  const { data: balancesData, refetch: refetchBalances } = useQuery<{ source: string; balances: Balances }>({
    queryKey: ["exchange-balances"],
    queryFn:  () => apiFetch("/api/exchange/balances"),
    refetchInterval: 8000,
  });

  const { data: orders = [], refetch: refetchOrders } = useQuery<ExchangeOrder[]>({
    queryKey: ["exchange-orders"],
    queryFn:  () => apiFetch("/api/exchange/orders?limit=30"),
    refetchInterval: 5000,
  });

  // Admin's per-user exchange connections (encrypted vault). Surfaces the
  // Kraken API key onboarding flow when the operator has not yet connected.
  const { data: userExchData } = useQuery<{ exchanges: UserExchangeEntry[] }>({
    queryKey: ["user-exchanges"],
    queryFn:  () => apiFetch("/api/user/exchanges"),
    refetchInterval: 15_000,
  });
  const krakenConn = userExchData?.exchanges.find(e => e.exchange === "Kraken") ?? null;

  // ── Form state ─────────────────────────────────────────────────────────────
  const [symbol,      setSymbol]      = useState<string>("BTCUSD");
  const [side,        setSide]        = useState<"buy" | "sell">("buy");
  const [orderType,   setOrderType]   = useState<"market" | "limit">("market");
  const [amountUSD,   setAmountUSD]   = useState<string>("500");
  const [limitPrice,  setLimitPrice]  = useState<string>("");
  const [preview,     setPreview]     = useState<OrderPreview | null>(null);
  const [previewErr,  setPreviewErr]  = useState<string | null>(null);
  const [executing,   setExecuting]   = useState(false);
  const [lastResult,  setLastResult]  = useState<ExchangeOrder | null>(null);

  // ── LIVE confirmation modal ────────────────────────────────────────────────
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [confirmText,   setConfirmText]   = useState("");

  // ── Kraken connect modal (admin) ───────────────────────────────────────────
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [kApiKey,    setKApiKey]    = useState("");
  const [kApiSecret, setKApiSecret] = useState("");
  const [connectErr, setConnectErr] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: (vars: { apiKey: string; apiSecret: string }) =>
      apiFetch<{ ok: boolean; connection: UserExchangeConnection | null }>(
        "/api/user/exchanges/connect",
        { method: "POST", body: JSON.stringify({
          exchange: "Kraken",
          apiKey:    vars.apiKey,
          apiSecret: vars.apiSecret,
          label:     "Admin Kraken",
        }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-exchanges"] });
      qc.invalidateQueries({ queryKey: ["exchange-status"] });
      qc.invalidateQueries({ queryKey: ["exchange-balances"] });
      setShowConnectModal(false);
      setKApiKey("");
      setKApiSecret("");
      setConnectErr(null);
    },
    onError: (e: Error) => setConnectErr(e.message),
  });

  const testMutation = useMutation({
    mutationFn: () => apiFetch("/api/user/exchanges/Kraken/test", { method: "POST" }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["user-exchanges"] }),
  });

  // ── Auto-preview debounce ──────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const amt = parseFloat(amountUSD);
    if (!amt || amt <= 0) { setPreview(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setPreviewErr(null);
        const p = await apiFetch<OrderPreview>("/api/exchange/order/preview", {
          method: "POST",
          body: JSON.stringify({
            symbol, side, orderType, amountUSD: amt,
            limitPrice: orderType === "limit" && limitPrice ? parseFloat(limitPrice) : undefined,
          }),
        });
        setPreview(p);
      } catch (e: unknown) {
        setPreviewErr(e instanceof Error ? e.message : "Preview error");
        setPreview(null);
      }
    }, 600);
  }, [symbol, side, orderType, amountUSD, limitPrice]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["exchange-status"] });
    qc.invalidateQueries({ queryKey: ["exchange-orders"] });
    qc.invalidateQueries({ queryKey: ["exchange-balances"] });
  };

  const killMutation = useMutation({
    mutationFn: () => apiFetch("/api/exchange/kill", { method: "POST" }),
    onSuccess:  invalidate,
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiFetch("/api/exchange/pause", { method: "POST" }),
    onSuccess:  invalidate,
  });

  const modeMutation = useMutation({
    mutationFn: (mode: "simulation" | "live") =>
      apiFetch("/api/exchange/mode", { method: "POST", body: JSON.stringify({ mode }) }),
    onSuccess: () => { invalidate(); setShowLiveModal(false); setConfirmText(""); },
    onError:   (e: Error) => alert(`Mode switch failed: ${e.message}`),
  });

  const simResetMutation = useMutation({
    mutationFn: () => apiFetch("/api/exchange/sim/reset", { method: "POST" }),
    onSuccess:  invalidate,
  });

  const handleExecute = async () => {
    const amt = parseFloat(amountUSD);
    if (!amt || !preview) return;
    setExecuting(true);
    setLastResult(null);
    try {
      const result = await apiFetch<ExchangeOrder>("/api/exchange/order/execute", {
        method: "POST",
        body: JSON.stringify({
          symbol, side, orderType, amountUSD: amt,
          limitPrice: orderType === "limit" && limitPrice ? parseFloat(limitPrice) : undefined,
        }),
      });
      setLastResult(result);
      invalidate();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const isKillActive  = status?.killSwitch ?? false;
  const isPaused      = status?.paused ?? false;
  const mode          = status?.mode ?? "simulation";
  const isLive        = mode === "live";
  const balances      = balancesData?.balances ?? status?.simBalances;
  const allGatesPassed = preview?.allowed ?? false;

  const modeBadgeClass = isLive
    ? "bg-red-500/20 text-red-300 border-red-500/40 animate-pulse"
    : "bg-green-500/15 text-green-300 border-green-500/30";

  return (
    <div className="flex flex-col gap-5 p-5 pb-10">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ArrowLeftRight className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Exchange Integration</h1>
            <p className="text-xs text-muted-foreground">Kraken · Paper &amp; live order execution · Risk-gated · Read+Trade only (no withdrawals)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">v1.0 · MODULE 15</span>
          <button onClick={() => { invalidate(); refetchOrders(); refetchBalances(); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border/40 hover:border-primary/40 bg-card/40 hover:bg-card/70 transition-colors text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Control bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* Mode badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${modeBadgeClass}`}>
          {isLive ? <Zap className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
          {mode.toUpperCase()} MODE
        </div>

        {/* Mode toggle */}
        {!isLive ? (
          <button
            onClick={() => setShowLiveModal(true)}
            disabled={!status?.liveCapable}
            title={!status?.liveCapable ? "Set EXCHANGE_LIVE_ENABLED=true and configure API keys" : "Switch to LIVE mode"}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border/40 hover:border-yellow-500/50 bg-card/40 hover:bg-yellow-500/10 transition-colors text-muted-foreground hover:text-yellow-300 disabled:opacity-40 disabled:pointer-events-none">
            <Zap className="w-3.5 h-3.5" /> Go LIVE
          </button>
        ) : (
          <button
            onClick={() => modeMutation.mutate("simulation")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border/40 hover:border-green-500/50 bg-card/40 hover:bg-green-500/10 transition-colors text-muted-foreground hover:text-green-300">
            <Shield className="w-3.5 h-3.5" /> Go SIMULATION
          </button>
        )}

        {/* Kill switch */}
        <button
          onClick={() => killMutation.mutate()}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
            isKillActive
              ? "border-red-500 bg-red-500/20 text-red-300 hover:bg-red-500/30"
              : "border-border/40 hover:border-red-500/60 bg-card/40 hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
          }`}>
          {isKillActive
            ? <><ShieldAlert className="w-3.5 h-3.5" /> KILL ACTIVE — Reset</>
            : <><Power className="w-3.5 h-3.5" /> Kill Switch</>}
        </button>

        {/* Pause */}
        <button
          onClick={() => pauseMutation.mutate()}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            isPaused
              ? "border-yellow-500 bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30"
              : "border-border/40 hover:border-yellow-500/50 bg-card/40 hover:bg-yellow-500/10 text-muted-foreground hover:text-yellow-300"
          }`}>
          {isPaused
            ? <><Play  className="w-3.5 h-3.5" /> Resume</>
            : <><Pause className="w-3.5 h-3.5" /> Pause</>}
        </button>

        {/* Status indicators */}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>Orders today: <strong className="text-foreground">{status?.ordersToday ?? 0}</strong></span>
          {status?.lastOrderAt && (
            <span>Last: <strong className="text-foreground">
              {new Date(status.lastOrderAt).toLocaleTimeString()}
            </strong></span>
          )}
        </div>
      </div>

      {/* ── Kill / Pause banners ─────────────────────────────────────────── */}
      {isKillActive && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-sm font-semibold">
          <ShieldOff className="w-4 h-4 shrink-0" />
          KILL SWITCH ACTIVE — All new orders are blocked. Click "KILL ACTIVE — Reset" above to resume.
        </div>
      )}
      {!isKillActive && isPaused && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-sm font-semibold">
          <Pause className="w-4 h-4 shrink-0" />
          EXCHANGE PAUSED — No new orders will be submitted. Click "Resume" to continue.
        </div>
      )}

      {/* ── Body grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-5">

        {/* ── LEFT: Status + Balances ──────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Connection status (platform-level Kraken via env) */}
          <div className="border border-border/40 rounded-xl bg-card/30 p-4 flex flex-col gap-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform Connection</div>
            {[
              { label: "Exchange",     value: status?.exchangeName ?? "—",                         ok: true },
              { label: "API Keys",     value: status?.apiConfigured ? "Configured" : "Not set",  ok: status?.apiConfigured ?? false },
              { label: "Live Enable",  value: status?.liveEnabled ? "Enabled" : "Disabled",      ok: status?.liveEnabled ?? false },
              { label: "Live Ready",   value: status?.liveCapable  ? "Yes" : "No",               ok: status?.liveCapable  ?? false },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`flex items-center gap-1 font-medium ${row.ok ? "text-green-400" : "text-muted-foreground"}`}>
                  {row.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {row.value}
                </span>
              </div>
            ))}
            {!status?.apiConfigured && (
              <div className="mt-1 text-[10px] text-muted-foreground bg-card/60 rounded-lg p-2 leading-relaxed">
                Add <code className="text-primary">KRAKEN_API_KEY</code> and <code className="text-primary">KRAKEN_API_SECRET</code> to environment secrets,
                then set <code className="text-primary">EXCHANGE_LIVE_ENABLED=true</code> to unlock platform-wide LIVE mode.
              </div>
            )}
          </div>

          {/* ── Admin Kraken Connection (per-user encrypted vault) ─────────── */}
          <div className="border border-primary/30 rounded-xl bg-primary/[0.04] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> My Kraken Keys
              </div>
              {krakenConn?.connected && (
                <span
                  className="text-[11px] px-2.5 py-1 rounded-full bg-green-500/25 text-green-200 border border-green-400/60 font-bold tracking-[0.18em]"
                  style={{ boxShadow: "0 0 14px rgba(102,255,102,0.45), 0 0 0 1px rgba(102,255,102,0.25) inset" }}
                >
                  ● CONNECTED
                </span>
              )}
            </div>

            {krakenConn?.connected && krakenConn.connection ? (
              <>
                <div className="text-[11px] flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Label</span>
                    <span className="font-mono text-foreground">{krakenConn.connection.label ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className={krakenConn.connection.status === "active" ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                      {krakenConn.connection.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trading mode</span>
                    <span className="font-medium text-foreground">{krakenConn.connection.tradingMode.toUpperCase()}</span>
                  </div>
                  {krakenConn.connection.permissions && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Permissions</span>
                      <span className="font-medium text-foreground">
                        {krakenConn.connection.permissions.read  ? "READ " : ""}
                        {krakenConn.connection.permissions.trade ? "TRADE " : ""}
                        <span className="text-red-400">NO-WITHDRAW</span>
                      </span>
                    </div>
                  )}
                  {krakenConn.connection.lastVerifiedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last verified</span>
                      <span className="font-mono text-foreground">
                        {new Date(krakenConn.connection.lastVerifiedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {krakenConn.connection.lastError && (
                    <div className="mt-1 text-[10px] text-red-400 bg-red-500/10 rounded p-2 border border-red-500/20">
                      {krakenConn.connection.lastError}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending}
                    className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-border/40 hover:border-primary/40 bg-card/40 hover:bg-card/70 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center justify-center gap-1.5">
                    {testMutation.isPending
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Testing…</>
                      : <><RefreshCw className="w-3 h-3" /> Re-test</>}
                  </button>
                  <button
                    onClick={() => { setShowConnectModal(true); setConnectErr(null); }}
                    className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-border/40 hover:border-primary/40 bg-card/40 hover:bg-card/70 transition-colors text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5">
                    <Key className="w-3 h-3" /> Rotate Keys
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Connect your personal Kraken API keys (encrypted per-user AES-256-GCM). Read + Trade permissions only — withdrawals are never requested.
                </div>
                <button
                  onClick={() => { setShowConnectModal(true); setConnectErr(null); }}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-primary/40 bg-primary/15 hover:bg-primary/25 text-primary transition-colors flex items-center justify-center gap-2">
                  <Key className="w-3.5 h-3.5" /> Connect Kraken
                </button>
              </>
            )}
          </div>

          {/* Balances */}
          <div className="border border-border/40 rounded-xl bg-card/30 p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Balances
                {balancesData && (
                  <span className="ml-2 text-[10px] normal-case font-normal">
                    ({balancesData.source === "live" ? "live" : "simulated"})
                  </span>
                )}
              </div>
              {mode === "simulation" && (
                <button onClick={() => simResetMutation.mutate()}
                  title="Reset simulation balances"
                  className="p-1 rounded hover:bg-card/60 text-muted-foreground hover:text-foreground transition-colors">
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
            {balances && <>
              <BalanceLine label="USD"
                value={`$${balances.USD.toLocaleString("en-US", { maximumFractionDigits: 2 })}`} />
              <BalanceLine label="BTC"
                value={balances.BTC.toFixed(6)}
                sub={balances.BTC > 0 ? `≈ $${(balances.BTC * (preview?.estimatedFill ?? 0)).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : undefined} />
              <BalanceLine label="ETH" value={balances.ETH.toFixed(4)} />
              <BalanceLine label="SOL" value={balances.SOL.toFixed(2)} />
            </>}
          </div>

          {/* No-withdrawal notice */}
          <div className="rounded-lg border border-border/30 bg-card/20 p-3 text-[10px] text-muted-foreground flex items-start gap-2">
            <Info className="w-3 h-3 shrink-0 mt-0.5 text-primary/60" />
            <span>Withdrawals are <strong className="text-foreground">permanently disabled</strong>. Only spot buy/sell orders are permitted through this interface.</span>
          </div>
        </div>

        {/* ── CENTER: Order Form + Preview ─────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Order form */}
          <div className="border border-border/40 rounded-xl bg-card/30 p-5 flex flex-col gap-4">
            <div className="text-sm font-semibold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-primary" />
              Place Order
            </div>

            {/* Symbol */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Asset</label>
              <div className="flex gap-2">
                {SYMBOLS.map((s) => (
                  <button key={s} onClick={() => setSymbol(s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      symbol === s
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-card/40 border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}>
                    {s.replace("USD", "")}
                  </button>
                ))}
              </div>
            </div>

            {/* Side */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Direction</label>
              <div className="flex gap-2">
                <button onClick={() => setSide("buy")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                    side === "buy"
                      ? "bg-green-500/20 border-green-500/50 text-green-300"
                      : "bg-card/40 border-border/30 text-muted-foreground hover:border-green-500/30 hover:text-green-400"
                  }`}>
                  <ArrowUp className="w-3.5 h-3.5" /> BUY
                </button>
                <button onClick={() => setSide("sell")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                    side === "sell"
                      ? "bg-red-500/20 border-red-500/50 text-red-300"
                      : "bg-card/40 border-border/30 text-muted-foreground hover:border-red-500/30 hover:text-red-400"
                  }`}>
                  <ArrowDown className="w-3.5 h-3.5" /> SELL
                </button>
              </div>
            </div>

            {/* Order type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Order Type</label>
              <div className="flex gap-2">
                {ORDER_TYPES.map((t) => (
                  <button key={t} onClick={() => setOrderType(t)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      orderType === t
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-card/40 border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount USD */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number" min="10" step="50"
                  value={amountUSD}
                  onChange={(e) => setAmountUSD(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-border/40 bg-background text-sm text-foreground focus:outline-none focus:border-primary/50"
                  placeholder="500"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[100, 250, 500, 1000, 2500, 5000].map((v) => (
                  <button key={v} onClick={() => setAmountUSD(String(v))}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      amountUSD === String(v)
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/30 bg-card/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}>
                    ${v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Limit price (conditional) */}
            {orderType === "limit" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium">Limit Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number" min="0" step="1"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-border/40 bg-background text-sm text-foreground focus:outline-none focus:border-primary/50"
                    placeholder="e.g. 65000"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Preview panel */}
          {preview && (
            <div className={`border rounded-xl bg-card/30 p-4 flex flex-col gap-3 ${preview.allowed ? "border-green-500/30" : "border-red-500/30"}`}>
              <div className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                {preview.allowed
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  : <XCircle      className="w-3.5 h-3.5 text-red-400"   />}
                Order Preview
                <span className={`ml-auto text-xs font-bold ${preview.allowed ? "text-green-400" : "text-red-400"}`}>
                  {preview.allowed ? "CLEARED" : "BLOCKED"}
                </span>
              </div>

              {/* Execution details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Symbol",   preview.symbol.replace("USD", "") + "/USD"],
                  ["Side",     preview.side.toUpperCase()],
                  ["Type",     preview.orderType.toUpperCase()],
                  ["Volume",   `${preview.volumeBase.toFixed(6)} ${preview.symbol.replace("USD","")}`],
                  ["Est. Fill", `$${preview.estimatedFill.toLocaleString()}`],
                  ["Value",    `$${preview.valueUSD.toLocaleString()}`],
                  ["Fee (est.)", `$${preview.feeUSD.toFixed(4)}`],
                  ["Mode",     mode.toUpperCase()],
                ].map(([label, val]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold text-foreground">{val}</span>
                  </div>
                ))}
              </div>

              {/* Risk gates */}
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Risk Gates</div>
                {preview.riskGates.map((g) => (
                  <GateBadge key={g.name} gate={g} />
                ))}
              </div>

              {/* Blocked reasons */}
              {!preview.allowed && preview.blockedBy.length > 0 && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-400">
                  <div className="font-semibold mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Order blocked</div>
                  {preview.blockedBy.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px]">
                      <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" /> {r}
                    </div>
                  ))}
                </div>
              )}

              {/* LIVE mode warning */}
              {isLive && preview.allowed && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-2.5 text-xs text-yellow-300 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span><strong>LIVE MODE:</strong> This order will place a real order on {status?.exchangeName ?? "the exchange"} using real funds.</span>
                </div>
              )}

              {/* Execute button */}
              <button
                disabled={!preview.allowed || executing || isKillActive || isPaused}
                onClick={handleExecute}
                className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-colors flex items-center justify-center gap-2 ${
                  preview.allowed && !isKillActive && !isPaused
                    ? isLive
                      ? "bg-red-500/80 hover:bg-red-500 border-red-500/60 text-white"
                      : "bg-primary/80 hover:bg-primary border-primary/60 text-primary-foreground"
                    : "opacity-40 pointer-events-none bg-card border-border/30 text-muted-foreground"
                }`}>
                {executing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Executing…</>
                  : isLive
                    ? `⚡ Execute LIVE Order — ${side.toUpperCase()} ${symbol.replace("USD","")}`
                    : `Execute Simulation — ${side.toUpperCase()} ${symbol.replace("USD","")}`}
              </button>
            </div>
          )}

          {previewErr && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              Preview error: {previewErr}
            </div>
          )}

          {/* Last order result */}
          {lastResult && (
            <div className={`rounded-xl border p-4 text-xs flex flex-col gap-1.5 ${
              lastResult.status === "filled"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              <div className="font-semibold flex items-center gap-2">
                {lastResult.status === "filled"
                  ? <CheckCircle2 className="w-4 h-4" />
                  : <XCircle      className="w-4 h-4" />}
                Order {lastResult.status.toUpperCase()} — {lastResult.id}
              </div>
              {lastResult.status === "filled"
                ? <span>{lastResult.side.toUpperCase()} {lastResult.volumeBase.toFixed(6)} {lastResult.symbol.replace("USD","")} @ ${lastResult.fillPrice.toLocaleString()} = ${lastResult.valueUSD.toLocaleString()}</span>
                : <span>{lastResult.rejectionReason}</span>}
            </div>
          )}
        </div>

        {/* ── RIGHT: Order History ──────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="border border-border/40 rounded-xl bg-card/30 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Order History
              </div>
              <span className="text-xs text-muted-foreground">{orders.length} orders</span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[80px_60px_60px_80px_1fr_72px] gap-2 px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/20 uppercase tracking-wider">
              <span>Asset</span>
              <span>Side</span>
              <span>Type</span>
              <span>Value</span>
              <span>Detail</span>
              <span className="text-right">Status</span>
            </div>

            <div className="overflow-y-auto max-h-[420px]">
              {orders.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No orders yet. Place an order above.
                </div>
              ) : (
                orders.map((o) => <OrderRow key={o.id} order={o} />)
              )}
            </div>
          </div>

          {/* Risk limits summary */}
          <div className="border border-border/40 rounded-xl bg-card/30 p-4 flex flex-col gap-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" /> Risk Limits (Live)
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Max position size</span><span className="text-foreground font-mono">$5,000</span></div>
              <div className="flex justify-between"><span>Max trades / day</span><span className="text-foreground font-mono">10</span></div>
              <div className="flex justify-between"><span>Daily loss limit</span><span className="text-foreground font-mono">5% of capital</span></div>
              <div className="flex justify-between"><span>Withdrawals</span><span className="text-red-400 font-semibold">DISABLED</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── LIVE mode confirmation modal ─────────────────────────────────── */}
      {showLiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-card shadow-2xl p-6 flex flex-col gap-4 mx-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Enable LIVE Trading</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Real orders on {status?.exchangeName ?? "exchange"} · Real funds at risk</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              {[
                { icon: status?.apiConfigured,    label: `${status?.exchangeName ?? "Exchange"} API keys configured` },
                { icon: status?.liveEnabled,      label: "EXCHANGE_LIVE_ENABLED=true" },
                { icon: !isKillActive,            label: "Kill switch is off" },
                { icon: true,                     label: "No withdrawals — spot orders only" },
              ].map(({ icon, label }) => (
                <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${icon ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-400"}`}>
                  {icon ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                  {label}
                </div>
              ))}
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs text-yellow-300">
              <strong>Warning:</strong> In LIVE mode, all executed orders will be real {status?.exchangeName ?? "exchange"} spot orders. Ensure your risk parameters are set correctly. The system will still enforce position limits, kill switches, and daily loss limits.
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">Type <strong className="text-foreground font-mono">CONFIRM</strong> to enable LIVE mode</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRM"
                className="w-full px-3 py-2 rounded-lg border border-border/40 bg-background text-sm text-foreground focus:outline-none focus:border-red-500/50 font-mono"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowLiveModal(false); setConfirmText(""); }}
                className="flex-1 py-2 rounded-lg border border-border/40 bg-card/40 text-sm text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors">
                Cancel
              </button>
              <button
                disabled={confirmText !== "CONFIRM" || !status?.liveCapable || modeMutation.isPending}
                onClick={() => modeMutation.mutate("live")}
                className="flex-1 py-2 rounded-lg border border-red-500/60 bg-red-500/20 text-sm font-bold text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2">
                {modeMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Enabling…</>
                  : <><Zap className="w-4 h-4" /> Enable LIVE</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Kraken connect modal ──────────────────────────────────── */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-primary/40 bg-card shadow-2xl p-6 flex flex-col gap-4 mx-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  {krakenConn?.connected ? "Rotate Kraken Keys" : "Connect Kraken"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Encrypted per-user (AES-256-GCM) · Read + Trade only · Withdrawals never requested
                </p>
              </div>
            </div>

            <div className="bg-card/60 border border-border/30 rounded-lg p-3 text-[11px] text-muted-foreground leading-relaxed">
              Generate a Kraken API key with <strong className="text-foreground">Query Funds</strong> +
                <strong className="text-foreground"> Query Open/Closed Orders</strong> +
                <strong className="text-foreground"> Create &amp; Modify Orders</strong>.
                <span className="block mt-1 text-red-400">
                  Do NOT enable <strong>Withdraw Funds</strong> — we never request it.
                </span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground font-medium">API Key</label>
              <input
                type="text"
                value={kApiKey}
                onChange={(e) => setKApiKey(e.target.value)}
                placeholder="Kraken API Key"
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg border border-border/40 bg-background text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground font-medium">API Secret</label>
              <input
                type="password"
                value={kApiSecret}
                onChange={(e) => setKApiSecret(e.target.value)}
                placeholder="Kraken Private Key"
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg border border-border/40 bg-background text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono"
              />
            </div>

            {connectErr && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-400 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{connectErr}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowConnectModal(false); setKApiKey(""); setKApiSecret(""); setConnectErr(null); }}
                className="flex-1 py-2 rounded-lg border border-border/40 bg-card/40 text-sm text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors">
                Cancel
              </button>
              <button
                disabled={!kApiKey || !kApiSecret || connectMutation.isPending}
                onClick={() => connectMutation.mutate({ apiKey: kApiKey, apiSecret: kApiSecret })}
                className="flex-1 py-2 rounded-lg border border-primary/60 bg-primary/20 text-sm font-bold text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2">
                {connectMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing &amp; encrypting…</>
                  : <><Link2 className="w-4 h-4" /> Connect</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
