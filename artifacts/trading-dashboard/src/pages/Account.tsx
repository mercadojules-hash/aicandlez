import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  TrendingUp, TrendingDown, Activity, Zap, Shield,
  ArrowLeftRight, DollarSign, Award, Clock, BarChart2,
  CheckCircle, XCircle, Settings, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import type { SimAccount, Trade, FeeSummary } from "@/components/command/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserSettings {
  personality:       string;
  riskProfile:       string;
  allocation:        number;
  maxTradesPerDay:   number;
  minConfidence:     number;
  autoMode:          boolean;
  stopLossPercent:   number;
  takeProfitPercent: number;
}

interface ExchangeConnection {
  exchange:       string;
  connected:      boolean;
  status?:        string;
  label?:         string;
  isDefault?:     boolean;
  tradingMode?:   string;
  permissions?:   { read: boolean; trade: boolean };
  lastVerifiedAt?: string;
}

interface ExchangeListResponse {
  exchanges: ExchangeConnection[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDollar(n: number, decimals = 2) {
  const abs = Math.abs(n);
  const str = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(2)}M`
    : abs >= 1_000   ? `$${(abs / 1_000).toFixed(1)}K`
    : `$${abs.toFixed(decimals)}`;
  return n < 0 ? `-${str}` : str;
}

function pctColor(n: number) {
  return n > 0 ? "#00ff8a" : n < 0 ? "#ff3355" : "#9FB3C8";
}

const EXCHANGE_COLORS: Record<string, string> = {
  kraken:    "#5741d9",
  binance:   "#f0b90b",
  coinbase:  "#2775ca",
  bybit:     "#f7a600",
  okx:       "#b0b0b0",
  kucoin:    "#24ae8f",
  cryptocom: "#1199fa",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, color = "#EAF2FF", icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-4 rounded border"
      style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
      {Icon && <Icon className="w-4 h-4 mb-0.5" style={{ color, opacity: 0.6 }} />}
      <div className="text-[22px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[9px] font-mono font-semibold" style={{ color: pctColor(parseFloat(sub) || 0) }}>
        {sub}
      </div>}
      <div className="text-[8px] font-mono uppercase tracking-[0.14em]" style={{ color: "#4a6a80" }}>
        {label}
      </div>
    </div>
  );
}

function SectionHeader({ label, color = "#00aaff" }: { label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1" style={{ background: `${color}20` }} />
      <span className="text-[8px] font-mono font-bold tracking-[0.25em]" style={{ color: `${color}80` }}>
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: `${color}20` }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Account() {
  const { user, isLoaded } = useUser();
  const [imgError, setImgError] = useState(false);

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["account-settings"],
    queryFn:  () => fetch("/api/user/settings").then(r => r.json()),
  });
  const { data: simAccount } = useQuery<SimAccount>({
    queryKey: ["account-sim"],
    queryFn:  () => fetch("/api/simulation/account").then(r => r.json()),
  });
  const { data: trades } = useQuery<Trade[]>({
    queryKey: ["account-trades"],
    queryFn:  () => fetch("/api/trades").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  });
  const { data: feeSummary } = useQuery<FeeSummary>({
    queryKey: ["account-fees"],
    queryFn:  () => fetch("/api/fees").then(r => r.json()),
  });
  const { data: exchangesResp } = useQuery<ExchangeListResponse>({
    queryKey: ["account-exchanges"],
    queryFn:  () => fetch("/api/user/exchanges").then(r => r.json()),
  });

  // Derived stats
  const allTrades   = trades ?? [];
  const closed      = allTrades.filter(t => t.status === "closed");
  const open        = allTrades.filter(t => t.status === "open");
  const wins        = closed.filter(t => (t.pnl ?? 0) > 0);
  const losses      = closed.filter(t => (t.pnl ?? 0) < 0);
  const winRate     = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnL    = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgPnL      = closed.length ? totalPnL / closed.length : 0;
  const equity      = simAccount?.equity ?? simAccount?.account?.cashBalance ?? 0;
  const unrealized  = simAccount?.unrealizedPnL ?? 0;
  const totalFees   = feeSummary?.totalFeesCollected ?? 0;

  const connectedExchanges = (exchangesResp?.exchanges ?? []).filter(e => e.connected);

  const displayName = isLoaded && user
    ? (user.firstName ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}` : user.emailAddresses[0]?.emailAddress ?? "User")
    : "—";
  const email       = user?.emailAddresses[0]?.emailAddress ?? "";
  const avatarUrl   = user?.imageUrl;
  const initials    = (user?.firstName?.[0] ?? email[0] ?? "U").toUpperCase();
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  return (
    <div className="min-h-screen" style={{ background: "#060810", color: "#EAF2FF" }}>

      {/* ── Hero Profile Header ───────────────────────────────────────────── */}
      <div className="border-b relative overflow-hidden"
        style={{ background: "#000000", borderColor: "#0d1e2e" }}>
        {/* Background glow */}
        <div className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(ellipse at 20% 50%, #00aaff08, transparent 60%), radial-gradient(ellipse at 80% 50%, #7b68ee08, transparent 60%)" }} />

        <div className="relative px-6 py-6 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-6">

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-full overflow-hidden relative"
                style={{
                  border:    "2px solid #00aaff50",
                  boxShadow: "0 0 20px #00aaff25, 0 0 40px #00aaff10, 0 0 0 4px #00aaff08",
                }}>
                {avatarUrl && !imgError ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[20px] font-bold font-mono"
                    style={{ background: "linear-gradient(135deg, #00aaff20, #7b68ee20)", color: "#00aaff" }}>
                    {initials}
                  </div>
                )}
              </div>
              {/* Online pulse */}
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: "#060810", border: "1.5px solid #060810" }}>
                <div className="w-2.5 h-2.5 rounded-full live-dot"
                  style={{ background: "#00ff8a", boxShadow: "0 0 8px #00ff8a" }} />
              </div>
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-[22px] font-bold font-mono" style={{ color: "#EAF2FF" }}>
                  {displayName}
                </h1>
                {/* Tier badge */}
                <span className="text-[8px] font-bold px-2 py-1 rounded font-mono tracking-[0.12em]"
                  style={{ background: "#00aaff15", color: "#00aaff", border: "1px solid #00aaff35", boxShadow: "0 0 8px #00aaff15" }}>
                  PRO TRADER
                </span>
                {/* Online */}
                <span className="flex items-center gap-1 text-[8px] font-mono font-bold"
                  style={{ color: "#00ff8a60" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#00ff8a" }} /> ONLINE
                </span>
              </div>
              <div className="text-[11px] font-mono mt-0.5" style={{ color: "#4a6a80" }}>{email}</div>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: "#3a5a70" }}>
                  <Clock className="w-3 h-3" />
                  Member since {memberSince}
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: "#3a5a70" }}>
                  <Shield className="w-3 h-3" />
                  AES-256 encrypted vault
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: "#3a5a70" }}>
                  <Award className="w-3 h-3" />
                  {closed.length} lifetime trades
                </div>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/settings">
                <button className="flex items-center gap-1.5 px-3 py-2 rounded border font-mono text-[9px] font-bold transition-all"
                  style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
                  <Settings className="w-3 h-3" /> Settings
                </button>
              </Link>
              <Link href="/billing">
                <button className="flex items-center gap-1.5 px-3 py-2 rounded border font-mono text-[9px] font-bold transition-all"
                  style={{ background: "#00aaff12", borderColor: "#00aaff35", color: "#00aaff" }}>
                  <DollarSign className="w-3 h-3" /> Billing
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="p-6 max-w-screen-xl mx-auto space-y-6">

        {/* Quick stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatTile icon={DollarSign} label="Account Equity"   value={equity > 0 ? fmtDollar(equity, 0) : "—"}                    color="#EAF2FF" />
          <StatTile icon={TrendingUp} label="Total Realized"   value={closed.length > 0 ? `${totalPnL >= 0 ? "+" : ""}${fmtDollar(totalPnL)}` : "—"} color={pctColor(totalPnL)} />
          <StatTile icon={Activity}   label="Unrealized P&L"   value={unrealized !== 0 ? `${unrealized >= 0 ? "+" : ""}${fmtDollar(unrealized)}` : "—"} color={pctColor(unrealized)} />
          <StatTile icon={BarChart2}  label="Win Rate"         value={closed.length > 0 ? `${winRate.toFixed(1)}%` : "—"}          color={winRate >= 55 ? "#00ff8a" : "#ffaa00"} sub={closed.length > 0 ? `${wins.length}W / ${losses.length}L` : undefined} />
          <StatTile icon={Zap}        label="Total Trades"     value={closed.length.toString()}                                    color="#00f0ff" />
          <StatTile icon={Activity}   label="Open Positions"   value={open.length.toString()}                                      color={open.length > 0 ? "#7b68ee" : "#3a5a70"} />
          <StatTile icon={DollarSign} label="Avg P&L / Trade"  value={closed.length > 0 ? `${avgPnL >= 0 ? "+" : ""}${fmtDollar(avgPnL)}` : "—"} color={pctColor(avgPnL)} />
          <StatTile icon={DollarSign} label="Fees Paid"        value={totalFees > 0 ? fmtDollar(totalFees) : "$0.00"}              color="#ffaa00" />
        </div>

        {/* Three-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── LEFT: Profile + Exchange Connections ──────────────────── */}
          <div className="space-y-4">

            {/* AI Configuration summary */}
            <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
              <SectionHeader label="AI CONFIGURATION" color="#cc55ff" />
              <div className="space-y-2.5">
                {[
                  { label: "Personality",       value: settings?.personality ?? "balanced", color: "#cc55ff" },
                  { label: "Risk Profile",       value: settings?.riskProfile ?? "moderate",color: "#ff8844" },
                  { label: "Min Confidence",     value: `${settings?.minConfidence ?? 45}%`, color: "#00aaff" },
                  { label: "Auto Mode",          value: settings?.autoMode ? "ENABLED" : "DISABLED", color: settings?.autoMode ? "#00ff8a" : "#ff3355" },
                  { label: "Max Trades / Day",   value: String(settings?.maxTradesPerDay ?? 5), color: "#EAF2FF" },
                  { label: "Position Size",      value: `${settings?.allocation ?? 0.01}%`,  color: "#EAF2FF" },
                  { label: "Stop Loss",          value: `${settings?.stopLossPercent ?? 2}%`, color: "#ff3355" },
                  { label: "Take Profit",        value: `${settings?.takeProfitPercent ?? 4}%`,color: "#00ff8a" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-1 border-b"
                    style={{ borderColor: "#0a1520" }}>
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>{label}</span>
                    <span className="text-[9px] font-bold font-mono capitalize" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>
              <Link href="/settings">
                <button className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded border font-mono text-[9px] font-bold transition-all"
                  style={{ background: "#cc55ff08", borderColor: "#cc55ff30", color: "#cc55ff80" }}>
                  <Settings className="w-3 h-3" /> Edit Configuration
                </button>
              </Link>
            </div>

            {/* Exchange Connections */}
            <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
              <SectionHeader label="EXCHANGE CONNECTIONS" color="#00aaff" />
              {connectedExchanges.length === 0 ? (
                <div className="text-center py-4">
                  <ArrowLeftRight className="w-6 h-6 mx-auto mb-2" style={{ color: "#2a4050" }} />
                  <p className="text-[9px] font-mono" style={{ color: "#3a5a70" }}>No exchanges connected</p>
                  <a href="https://app.aicandlez.com/settings/exchanges">
                    <button className="mt-2 px-3 py-1.5 rounded border font-mono text-[8px] font-bold"
                      style={{ borderColor: "#00aaff30", color: "#00aaff60" }}>
                      Connect Exchange
                    </button>
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  {connectedExchanges.map(ex => {
                    const color = EXCHANGE_COLORS[ex.exchange.toLowerCase()] ?? "#4a6a80";
                    return (
                      <div key={ex.exchange}
                        className="flex items-center gap-3 px-3 py-2.5 rounded border"
                        style={{ background: `${color}08`, borderColor: `${color}25` }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold font-mono capitalize" style={{ color }}>
                              {ex.exchange}
                            </span>
                            {ex.isDefault && (
                              <span className="text-[7px] font-bold px-1 py-0.5 rounded font-mono"
                                style={{ background: "#00ff8a10", color: "#00ff8a60", border: "1px solid #00ff8a20" }}>
                                DEFAULT
                              </span>
                            )}
                          </div>
                          {ex.label && (
                            <div className="text-[8px] font-mono" style={{ color: "#4a6a80" }}>{ex.label}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[8px] font-mono font-bold"
                            style={{ color: ex.tradingMode === "live" ? "#ff3355" : "#00aaff80" }}>
                            {(ex.tradingMode ?? "sim").toUpperCase()}
                          </span>
                          {ex.permissions?.read
                            ? <CheckCircle className="w-3 h-3" style={{ color: "#00ff8a80" }} />
                            : <XCircle    className="w-3 h-3" style={{ color: "#ff335580" }} />
                          }
                        </div>
                      </div>
                    );
                  })}
                  <Link href="/settings">
                    <button className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 rounded border font-mono text-[8px] font-bold"
                      style={{ background: "transparent", borderColor: "#1a2a36", color: "#4a6a80" }}>
                      <ExternalLink className="w-3 h-3" /> Manage Connections
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* ─── CENTER: Performance Metrics ───────────────────────────── */}
          <div className="space-y-4">

            {/* Win/Loss breakdown */}
            <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
              <SectionHeader label="TRADING PERFORMANCE" color="#00ff8a" />

              {closed.length === 0 ? (
                <div className="text-center py-6">
                  <BarChart2 className="w-6 h-6 mx-auto mb-2" style={{ color: "#2a4050" }} />
                  <p className="text-[9px] font-mono" style={{ color: "#3a5a70" }}>No completed trades yet</p>
                </div>
              ) : (
                <>
                  {/* Win rate donut-style bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>WIN RATE</span>
                      <span className="text-[16px] font-bold font-mono" style={{ color: winRate >= 55 ? "#00ff8a" : "#ffaa00" }}>
                        {winRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded overflow-hidden" style={{ background: "#0d1e2e" }}>
                      <div className="h-full rounded transition-all"
                        style={{ width: `${winRate}%`, background: `linear-gradient(90deg, ${winRate >= 55 ? "#00ff8a" : "#ffaa00"}, ${winRate >= 55 ? "#00cc6a" : "#ff8800"})` }} />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono mt-1">
                      <span style={{ color: "#00ff8a" }}>{wins.length} wins</span>
                      <span style={{ color: "#ff3355" }}>{losses.length} losses</span>
                    </div>
                  </div>

                  {/* P&L metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Best Trade",   value: fmtDollar(Math.max(...closed.map(t => t.pnl ?? 0))), color: "#00ff8a" },
                      { label: "Worst Trade",  value: fmtDollar(Math.min(...closed.map(t => t.pnl ?? 0))), color: "#ff3355" },
                      { label: "Avg Win",      value: wins.length ? fmtDollar(wins.reduce((s,t) => s + (t.pnl ?? 0), 0) / wins.length) : "—", color: "#00ff8a" },
                      { label: "Avg Loss",     value: losses.length ? fmtDollar(losses.reduce((s,t) => s + (t.pnl ?? 0), 0) / losses.length) : "—", color: "#ff3355" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded p-2.5" style={{ background: "#000a14", border: "1px solid #0d1e2e" }}>
                        <div className="text-[8px] font-mono mb-1" style={{ color: "#4a6a80" }}>{label}</div>
                        <div className="text-[13px] font-bold font-mono" style={{ color }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Profit factor */}
                  <div className="mt-3 flex items-center justify-between px-3 py-2 rounded"
                    style={{ background: "#000a14", border: "1px solid #0d1e2e" }}>
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>PROFIT FACTOR</span>
                    <span className="text-[14px] font-bold font-mono"
                      style={{ color: totalPnL > 0 ? "#00ff8a" : "#ff3355" }}>
                      {wins.length > 0 && losses.length > 0
                        ? (Math.abs(wins.reduce((s, t) => s + (t.pnl ?? 0), 0)) /
                           Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 1))).toFixed(2)
                        : "—"}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Fee history */}
            <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
              <SectionHeader label="FEE SUMMARY" color="#ffaa00" />
              <div className="space-y-2">
                {[
                  { label: "Total Fees Paid",    value: fmtDollar(totalFees),              color: "#ffaa00" },
                  { label: "Trade Count",         value: String(feeSummary?.tradeCount ?? 0), color: "#EAF2FF" },
                  { label: "Fee Rate",            value: `${feeSummary?.feeRatePct?.toFixed(3) ?? "0.100"}%`, color: "#9FB3C8" },
                  { label: "Avg Fee / Trade",     value: feeSummary?.tradeCount ? fmtDollar(totalFees / feeSummary.tradeCount) : "—", color: "#ffaa00" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b"
                    style={{ borderColor: "#0a1520" }}>
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>{label}</span>
                    <span className="text-[10px] font-bold font-mono" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Recent fees */}
              {(feeSummary?.recentFees?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <div className="text-[8px] font-mono tracking-[0.12em] mb-1.5" style={{ color: "#3a5a70" }}>RECENT</div>
                  {feeSummary!.recentFees.slice(0, 4).map(f => (
                    <div key={f.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold font-mono"
                          style={{ color: f.side.toUpperCase() === "BUY" ? "#00ff8a80" : "#ff335580" }}>
                          {f.side.toUpperCase()}
                        </span>
                        <span className="text-[8px] font-mono" style={{ color: "#7a9eb8" }}>{f.symbol}</span>
                      </div>
                      <span className="text-[9px] font-bold font-mono" style={{ color: "#ffaa00" }}>
                        {fmtDollar(f.feeUSD)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT: Recent Trades ───────────────────────────────────── */}
          <div className="space-y-4">

            {/* Open positions */}
            {open.length > 0 && (
              <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
                <SectionHeader label="OPEN POSITIONS" color="#7b68ee" />
                <div className="space-y-2">
                  {open.slice(0, 3).map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded border"
                      style={{ background: "#000a14", borderColor: "#1a2a36" }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold font-mono" style={{ color: "#EAF2FF" }}>
                            {t.symbol}
                          </span>
                          <span className="text-[7px] font-bold px-1 py-0.5 rounded font-mono"
                            style={t.side.toUpperCase() === "BUY"
                              ? { background: "#00ff8a10", color: "#00ff8a", border: "1px solid #00ff8a30" }
                              : { background: "#ff335510", color: "#ff3355", border: "1px solid #ff335530" }}>
                            {t.side.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[8px] font-mono mt-0.5" style={{ color: "#4a6a80" }}>
                          @ ${t.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold font-mono" style={{ color: pctColor(t.pnl ?? 0) }}>
                          {(t.pnl ?? 0) >= 0 ? "+" : ""}{fmtDollar(t.pnl ?? 0)}
                        </div>
                        <div className="text-[8px] font-mono" style={{ color: "#4a6a80" }}>unrealized</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent closed trades */}
            <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
              <SectionHeader label="RECENT TRADES" color="#00f0ff" />
              {closed.length === 0 ? (
                <div className="text-center py-6">
                  <Activity className="w-6 h-6 mx-auto mb-2" style={{ color: "#2a4050" }} />
                  <p className="text-[9px] font-mono" style={{ color: "#3a5a70" }}>No closed trades yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {closed.slice(0, 8).map(t => {
                    const pnl = t.pnl ?? 0;
                    const isWin = pnl > 0;
                    return (
                      <div key={t.id}
                        className="flex items-center gap-3 px-3 py-2 rounded border transition-all"
                        style={{ background: "#000a14", borderColor: "#0d1520" }}>
                        <div className="flex-shrink-0">
                          {isWin
                            ? <TrendingUp   className="w-3 h-3" style={{ color: "#00ff8a" }} />
                            : <TrendingDown className="w-3 h-3" style={{ color: "#ff3355" }} />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold font-mono" style={{ color: "#EAF2FF" }}>{t.symbol}</span>
                            <span className="text-[7px] font-mono"
                              style={{ color: t.side.toUpperCase() === "BUY" ? "#00ff8a60" : "#ff335560" }}>
                              {t.side.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-[7px] font-mono" style={{ color: "#2a4050" }}>
                            {new Date(t.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[9px] font-bold font-mono" style={{ color: pctColor(pnl) }}>
                            {pnl >= 0 ? "+" : ""}{fmtDollar(pnl)}
                          </div>
                          {t.pnlPercent != null && (
                            <div className="text-[7px] font-mono" style={{ color: pctColor(t.pnlPercent) }}>
                              {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {closed.length > 8 && (
                <Link href="/journal">
                  <button className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded border font-mono text-[8px] font-bold"
                    style={{ background: "transparent", borderColor: "#1a2a36", color: "#4a6a80" }}>
                    View All {closed.length} Trades in Journal →
                  </button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
