import { useState, useEffect, useCallback, useRef } from "react";
import {
  FlaskConical, RefreshCw, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, DollarSign, Zap, Clock,
  RotateCcw, Lock, Activity, ChevronRight, X, Minus,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SimPosition {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  entryTime: number;
  sizeUSD: number;
  currentPrice?: number;
  unrealizedPnL?: number;
  unrealizedPnLPct?: number;
  marketValue?: number;
}

interface SimTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  sizeUSD: number;
  realizedPnL: number;
  realizedPnLPct: number;
  durationMs: number;
}

interface AccountSummary {
  account: { startingBalance: number; cashBalance: number; totalRealized: number; totalTrades: number };
  equity: number;
  totalPnL: number;
  totalPnLPct: number;
  unrealizedPnL: number;
  positionCount: number;
  positions: SimPosition[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD"];
const SYMBOL_COLORS: Record<string, string> = { BTCUSD: "#F7931A", ETHUSD: "#627EEA", SOLUSD: "#9945FF" };
const SYMBOL_LABELS: Record<string, string> = { BTCUSD: "Bitcoin", ETHUSD: "Ethereum", SOLUSD: "Solana" };
function shortSym(sym: string) { return sym.replace("USD", ""); }

function usd(n: number, dec = 2) {
  const sign = n < 0 ? "−$" : "$";
  return sign + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pct(n: number, d = 2) {
  return (n >= 0 ? "+" : "") + n.toFixed(d) + "%";
}
function qty(n: number, sym: string) {
  const decimals = sym === "BTC" ? 6 : sym === "ETH" ? 5 : 4;
  return n.toFixed(decimals) + " " + sym;
}
function dur(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function timeAgo(ts: number) {
  return dur(Date.now() - ts) + " ago";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PnLValue({ value, percent, size = "md" }: { value: number; percent?: number; size?: "sm" | "md" | "lg" }) {
  const pos = value >= 0;
  const classes = {
    sm: "text-xs font-mono",
    md: "text-sm font-bold font-mono",
    lg: "text-xl font-bold font-mono",
  }[size];
  return (
    <span className={`${classes} ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? "+" : ""}{usd(value)}
      {percent != null && <span className="ml-1 opacity-70 text-[0.85em]">({pct(percent)})</span>}
    </span>
  );
}

function SideBadge({ side }: { side: "BUY" | "SELL" }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
      side === "BUY" ? "bg-emerald-400/15 text-emerald-400" : "bg-red-400/15 text-red-400"
    }`}>{side}</span>
  );
}

function SymbolDot({ symbol }: { symbol: string }) {
  return <span className="w-2 h-2 rounded-full inline-block mr-1.5" style={{ background: SYMBOL_COLORS[symbol] ?? "#888" }} />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Simulation() {
  const [account, setAccount]   = useState<AccountSummary | null>(null);
  const [trades,  setTrades]    = useState<SimTrade[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [closing, setClosing]   = useState<Record<string, boolean>>({});

  // Order form
  const [symbol,    setSymbol]   = useState("BTCUSD");
  const [side,      setSide]     = useState<"BUY" | "SELL">("BUY");
  const [sizeUSD,   setSizeUSD]  = useState(1000);
  const [placing,   setPlacing]  = useState(false);
  const [orderMsg,  setOrderMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const orderMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAccount = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [accRes, tradesRes] = await Promise.all([
        fetch("/api/simulation/account"),
        fetch("/api/simulation/trades"),
      ]);
      const accData: AccountSummary = await accRes.json();
      const tradesData: { trades: SimTrade[] } = await tradesRes.json();
      setAccount(accData);
      setTrades(tradesData.trades);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => { fetchAccount(); }, []);
  useEffect(() => {
    const t = setInterval(() => fetchAccount(true), 8000);
    return () => clearInterval(t);
  }, [fetchAccount]);

  async function placeOrder() {
    setPlacing(true);
    setOrderMsg(null);
    try {
      const res = await fetch("/api/simulation/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, side, sizeUSD }),
      });
      const data = await res.json();
      if (data.success) {
        setOrderMsg({ ok: true, text: `${side} ${shortSym(symbol)} ${usd(sizeUSD)} @ ${usd(data.position.entryPrice, 2)} — position opened` });
        await fetchAccount(true);
      } else {
        const msg = data.violations?.length
          ? data.violations.join(" · ")
          : (data.error ?? "Order rejected");
        setOrderMsg({ ok: false, text: msg });
      }
    } catch (e) {
      setOrderMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setPlacing(false);
      if (orderMsgTimer.current) clearTimeout(orderMsgTimer.current);
      orderMsgTimer.current = setTimeout(() => setOrderMsg(null), 5000);
    }
  }

  async function closePos(id: string) {
    setClosing((c) => ({ ...c, [id]: true }));
    try {
      const res = await fetch(`/api/simulation/close/${id}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setOrderMsg({ ok: true, text: `Position closed · P&L: ${data.trade.realizedPnL >= 0 ? "+" : ""}${usd(data.trade.realizedPnL)}` });
        await fetchAccount(true);
        if (orderMsgTimer.current) clearTimeout(orderMsgTimer.current);
        orderMsgTimer.current = setTimeout(() => setOrderMsg(null), 5000);
      }
    } catch {}
    setClosing((c) => { const n = { ...c }; delete n[id]; return n; });
  }

  async function reset() {
    if (!confirm("Reset simulation to $100,000? This deletes all positions and history.")) return;
    await fetch("/api/simulation/reset", { method: "POST" });
    setOrderMsg(null);
    await fetchAccount();
  }

  const cash        = account?.account.cashBalance ?? 100_000;
  const equity      = account?.equity ?? 100_000;
  const totalPnL    = account?.totalPnL ?? 0;
  const unrealized  = account?.unrealizedPnL ?? 0;
  const positions   = account?.positions ?? [];
  const maxSize     = Math.min(Math.floor(cash / 100) * 100, 50_000);

  return (
    <div className="flex flex-col gap-5 max-w-[1200px]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-primary tracking-widest uppercase">Module 06 · Simulation</span>
          </div>
          <h1 className="text-xl font-bold">Paper Trading Engine</h1>
          <p className="text-sm text-muted-foreground">Simulated trades · Live prices · Real risk rules · No real money</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchAccount(true)} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border/40 hover:bg-card transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button onClick={reset}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors">
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-red-900/40 bg-red-950/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Order result flash */}
      {orderMsg && (
        <div className={`flex items-center gap-2 border rounded-lg px-4 py-3 text-sm transition-all ${
          orderMsg.ok
            ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300"
            : "border-red-400/30 bg-red-400/5 text-red-300"
        }`}>
          {orderMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {orderMsg.text}
        </div>
      )}

      {/* Account summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <DollarSign className="w-4 h-4" />, label: "Cash Balance",
            value: usd(cash), sub: `of ${usd(account?.account.startingBalance ?? 100_000, 0)} starting`,
            color: "text-foreground",
          },
          {
            icon: <Activity className="w-4 h-4" />, label: "Equity",
            value: usd(equity), sub: `${positions.length} open position${positions.length !== 1 ? "s" : ""}`,
            color: equity >= 100_000 ? "text-emerald-400" : "text-red-400",
          },
          {
            icon: totalPnL >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
            label: "Total P&L",
            value: (totalPnL >= 0 ? "+" : "") + usd(totalPnL),
            sub: pct(account?.totalPnLPct ?? 0) + " vs start",
            color: totalPnL >= 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            icon: <Zap className="w-4 h-4" />, label: "Unrealized P&L",
            value: (unrealized >= 0 ? "+" : "") + usd(unrealized),
            sub: `${account?.account.totalTrades ?? 0} trades closed`,
            color: unrealized >= 0 ? "text-emerald-400" : "text-red-400",
          },
        ].map(({ icon, label, value, sub, color }) => (
          <div key={label} className="bg-card border border-border/40 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground/60 mb-2 text-xs">{icon}{label}</div>
            {loading && !account
              ? <div className="h-6 bg-border/20 rounded animate-pulse mb-1" />
              : <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            }
            <div className="text-xs text-muted-foreground/50">{sub}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* Left: Positions + Order Form */}
        <div className="flex flex-col gap-4">

          {/* Open positions */}
          <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground/50" />
                <span className="text-sm font-semibold">Open Positions</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground/40">{positions.length} active</span>
            </div>

            {positions.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Minus className="w-8 h-8 text-border/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground/40">No open positions</p>
                <p className="text-xs text-muted-foreground/30 mt-1">Place an order below to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/20 text-muted-foreground/40">
                      <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
                      <th className="px-3 py-2.5 text-left font-medium">Side</th>
                      <th className="px-3 py-2.5 text-right font-medium">Entry</th>
                      <th className="px-3 py-2.5 text-right font-medium">Current</th>
                      <th className="px-3 py-2.5 text-right font-medium">Size</th>
                      <th className="px-3 py-2.5 text-right font-medium">Unr. P&L</th>
                      <th className="px-3 py-2.5 text-right font-medium">Age</th>
                      <th className="px-3 py-2.5 text-center font-medium">Close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const pnlPos = (pos.unrealizedPnL ?? 0) >= 0;
                      return (
                        <tr key={pos.id} className={`border-b border-border/10 last:border-0 transition-colors hover:bg-card/50 ${
                          pnlPos ? "bg-emerald-400/[0.02]" : "bg-red-400/[0.02]"
                        }`}>
                          <td className="px-4 py-3 font-mono font-bold">
                            <SymbolDot symbol={pos.symbol} />{shortSym(pos.symbol)}
                          </td>
                          <td className="px-3 py-3"><SideBadge side={pos.side} /></td>
                          <td className="px-3 py-3 text-right font-mono text-muted-foreground/70">{usd(pos.entryPrice)}</td>
                          <td className="px-3 py-3 text-right font-mono">{pos.currentPrice ? usd(pos.currentPrice) : "—"}</td>
                          <td className="px-3 py-3 text-right font-mono text-muted-foreground/70">{usd(pos.sizeUSD, 0)}</td>
                          <td className="px-3 py-3 text-right">
                            {pos.unrealizedPnL != null
                              ? <PnLValue value={pos.unrealizedPnL} percent={pos.unrealizedPnLPct} size="sm" />
                              : <span className="text-muted-foreground/30">—</span>
                            }
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-muted-foreground/40">{timeAgo(pos.entryTime)}</td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => closePos(pos.id)}
                              disabled={!!closing[pos.id]}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 hover:border-red-400/40 hover:text-red-400 transition-colors disabled:opacity-30 mx-auto"
                            >
                              {closing[pos.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Order form */}
          <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-sm font-semibold">New Simulated Order</span>
            </div>
            <div className="p-5 flex flex-col gap-5">

              {/* Symbol selector */}
              <div>
                <label className="text-xs text-muted-foreground/70 mb-2 block">Asset</label>
                <div className="flex gap-2">
                  {SYMBOLS.map((sym) => (
                    <button key={sym} onClick={() => setSymbol(sym)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                        symbol === sym
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border/30 text-muted-foreground/50 hover:text-foreground hover:border-border/60"
                      }`}
                    >
                      <SymbolDot symbol={sym} />{shortSym(sym)}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1.5">{SYMBOL_LABELS[symbol]}</p>
              </div>

              {/* Side selector */}
              <div>
                <label className="text-xs text-muted-foreground/70 mb-2 block">Direction</label>
                <div className="flex gap-2">
                  <button onClick={() => setSide("BUY")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                      side === "BUY"
                        ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400"
                        : "border-border/30 text-muted-foreground/50 hover:text-emerald-400 hover:border-emerald-400/30"
                    }`}>
                    <TrendingUp className="w-3.5 h-3.5" /> BUY / LONG
                  </button>
                  <button onClick={() => setSide("SELL")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                      side === "SELL"
                        ? "border-red-400/50 bg-red-400/10 text-red-400"
                        : "border-border/30 text-muted-foreground/50 hover:text-red-400 hover:border-red-400/30"
                    }`}>
                    <TrendingDown className="w-3.5 h-3.5" /> SELL / SHORT
                  </button>
                </div>
              </div>

              {/* Size slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-muted-foreground/70">Order Size (USD)</label>
                  <input type="number" min={100} max={maxSize} step={100}
                    value={sizeUSD}
                    onChange={(e) => setSizeUSD(Math.min(maxSize, Math.max(100, Number(e.target.value))))}
                    className="w-28 bg-background border border-border/50 rounded-lg px-2 py-1 text-sm font-mono text-right focus:outline-none focus:border-primary/50"
                  />
                </div>
                <input type="range" min={100} max={Math.max(maxSize, 1000)} step={100}
                  value={sizeUSD}
                  onChange={(e) => setSizeUSD(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, hsl(var(--primary)) ${((sizeUSD - 100) / Math.max(maxSize - 100, 1)) * 100}%, hsl(var(--border)) ${((sizeUSD - 100) / Math.max(maxSize - 100, 1)) * 100}%)`,
                  }}
                />
                {/* Quick amounts */}
                <div className="flex gap-1.5 mt-2">
                  {[500, 1000, 2500, 5000, 10000].filter(v => v <= Math.max(maxSize + 1, 1)).map((v) => (
                    <button key={v} onClick={() => setSizeUSD(Math.min(v, maxSize))}
                      className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                        sizeUSD === v ? "border-primary/50 text-primary bg-primary/10" : "border-border/30 text-muted-foreground/50 hover:text-foreground"
                      }`}>
                      {v >= 1000 ? `$${v / 1000}K` : `$${v}`}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1.5">
                  Available cash: <span className="font-mono text-foreground/70">{usd(cash, 0)}</span>
                  {account && <> · Risk cap: <span className="font-mono text-foreground/70">{usd(Math.min(50000, cash), 0)}</span></>}
                </p>
              </div>

              {/* Place button */}
              <button
                onClick={placeOrder}
                disabled={placing || sizeUSD < 100 || sizeUSD > cash}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  placing || sizeUSD > cash
                    ? "opacity-40 cursor-not-allowed bg-primary/20 text-primary/40"
                    : side === "BUY"
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                      : "bg-red-500 hover:bg-red-400 text-white"
                }`}
              >
                {placing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Placing…</> : (
                  <>{side === "BUY" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {side} {shortSym(symbol)} — {usd(sizeUSD, 0)}
                    <ChevronRight className="w-4 h-4 opacity-60" />
                  </>
                )}
              </button>

              {sizeUSD > cash && (
                <p className="text-xs text-red-400 text-center -mt-2">Insufficient cash balance</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Trade history */}
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-sm font-semibold">Trade History</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground/40">{trades.length} closed</span>
          </div>

          {/* Realized P&L summary */}
          {account && account.account.totalTrades > 0 && (
            <div className="px-5 py-3 border-b border-border/20 flex items-center justify-between bg-card/30">
              <span className="text-xs text-muted-foreground/60">Total Realized</span>
              <PnLValue value={account.account.totalRealized} size="md" />
            </div>
          )}

          <div className="flex-1 overflow-y-auto" style={{ maxHeight: "560px" }}>
            {trades.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Clock className="w-8 h-8 text-border/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground/40">No closed trades yet</p>
                <p className="text-xs text-muted-foreground/30 mt-1">Open and close a position to see history</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/10">
                {trades.map((trade) => {
                  const win = trade.realizedPnL >= 0;
                  return (
                    <div key={trade.id} className={`p-4 transition-colors hover:bg-card/50 ${win ? "border-l-2 border-l-emerald-400/40" : "border-l-2 border-l-red-400/40"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm">
                            <SymbolDot symbol={trade.symbol} />{shortSym(trade.symbol)}
                          </span>
                          <SideBadge side={trade.side} />
                        </div>
                        <PnLValue value={trade.realizedPnL} percent={trade.realizedPnLPct} size="sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono text-muted-foreground/50">
                        <span>Entry: <span className="text-foreground/70">{usd(trade.entryPrice)}</span></span>
                        <span>Exit: <span className="text-foreground/70">{usd(trade.exitPrice)}</span></span>
                        <span>Size: <span className="text-foreground/70">{usd(trade.sizeUSD, 0)}</span></span>
                        <span>Qty: <span className="text-foreground/70">{qty(trade.quantity, shortSym(trade.symbol))}</span></span>
                        <span className="col-span-2">Held: <span className="text-foreground/70">{dur(trade.durationMs)}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border/20 shrink-0">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/30">
              <Lock className="w-3 h-3 shrink-0" />
              Simulation only — live prices, no real money
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
