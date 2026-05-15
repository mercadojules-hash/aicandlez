import { Landmark, Wifi, WifiOff, ArrowUpDown } from "lucide-react";
import type { ExchangeStatus, SimAccount, LiveBalance } from "./types";

interface Props {
  exchangeStatus: ExchangeStatus | undefined;
  simAccount?:    SimAccount     | undefined;
  liveBalance?:   LiveBalance    | undefined;
}

export function BrokerStatusCard({ exchangeStatus, simAccount, liveBalance }: Props) {
  /* ── Authoritative state — no hardcoded fallbacks ─────────────────────── */
  const rawName  = exchangeStatus?.exchangeName;
  const name     = rawName ? rawName.toUpperCase() : "—";
  const mode     = exchangeStatus?.mode ?? "simulation";
  const isLive   = mode === "live";

  /* ── Exchange-scoped balance (strict isolation) ───────────────────────── */
  const liveUSD  = isLive && liveBalance?.source === "live" ? (liveBalance.balances?.USD ?? null) : null;
  const liveBTC  = isLive && liveBalance?.source === "live" ? (liveBalance.balances?.BTC ?? 0) : 0;
  const liveETH  = isLive && liveBalance?.source === "live" ? (liveBalance.balances?.ETH ?? 0) : 0;
  const liveSOL  = isLive && liveBalance?.source === "live" ? (liveBalance.balances?.SOL ?? 0) : 0;

  const simBal  = exchangeStatus?.simBalances;
  const simUSD  = simBal?.USD ?? simAccount?.account?.cashBalance ?? 100_000;
  const simBTC  = simBal?.BTC ?? 0;
  const simETH  = simBal?.ETH ?? 0;
  const simSOL  = simBal?.SOL ?? 0;

  const showUSD  = isLive ? liveUSD  : simUSD;
  const showBTC  = isLive ? liveBTC  : simBTC;
  const showETH  = isLive ? liveETH  : simETH;
  const showSOL  = isLive ? liveSOL  : simSOL;

  const fmtUSD = (n: number | null) =>
    n == null ? "—"
    : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000     ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(0)}`;

  return (
    <div className="terminal-card rounded-lg overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#141414" }}>
        <Landmark className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.18em] font-mono" style={{ color: "#00eeff" }}>
          BROKER / EXCHANGE
        </span>
        <span
          className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded font-mono"
          style={isLive
            ? { background: "#ff336610", color: "#ff3366", border: "1px solid #ff336628" }
            : { background: "#ffb80010", color: "#ffb800", border: "1px solid #ffb80028" }
          }
        >
          {name.slice(0, 8)} {isLive ? "LIVE" : "SIM"}
        </span>
      </div>

      <div className="p-3">

        {/* Status rows */}
        <div className="space-y-2 mb-4">
          {[
            {
              label: "CONNECTION",
              value: exchangeStatus?.apiConfigured ? "CONFIGURED" : "SIMULATION ONLY",
              color: exchangeStatus?.apiConfigured ? "#00ff88" : "#1e4060",
              Icon:  exchangeStatus?.apiConfigured ? Wifi : WifiOff,
            },
            {
              label: "KILL SWITCH",
              value: exchangeStatus?.killSwitch ? "ACTIVE" : "SAFE",
              color: exchangeStatus?.killSwitch ? "#ff3366" : "#00ff88",
              Icon:  null,
            },
            {
              label: "ORDERS TODAY",
              value: String(exchangeStatus?.ordersToday ?? 0),
              color: "#4a8fa8",
              Icon:  null,
            },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="flex items-center justify-between text-[10px] font-mono">
              <span style={{ color: "#2a3a48" }} className="uppercase tracking-wide">{label}</span>
              <span className="flex items-center gap-1.5 font-bold" style={{ color }}>
                {Icon && <Icon className="w-3 h-3" />}
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Exchange switch prompt — directs operator to the correct place */}
        <div className="flex items-center gap-2 mb-4 px-2 py-2 rounded"
          style={{ background: "#00aaff08", border: "1px solid #00aaff15" }}>
          <ArrowUpDown className="w-3 h-3 flex-shrink-0" style={{ color: "#00aaff40" }} />
          <span className="text-[8px] font-mono" style={{ color: "#2a4a60" }}>
            Switch exchange via the EXCHANGE bar at top of Command Center
          </span>
        </div>

        {/* Exchange-scoped balances */}
        <div>
          <div className="text-[8px] uppercase tracking-[0.2em] mb-2 font-mono font-bold"
            style={{ color: isLive ? "#00ff8840" : "#1a2a35" }}>
            {name.slice(0, 8)} BALANCE ({isLive ? "LIVE" : "SIMULATED"})
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "USD", value: fmtUSD(showUSD),             color: "#00eeff" },
              { label: "BTC", value: showBTC != null ? showBTC.toFixed(4) : "—", color: "#ffaa00" },
              { label: "ETH", value: showETH != null ? showETH.toFixed(4) : "—", color: "#7b68ee" },
              { label: "SOL", value: showSOL != null ? showSOL.toFixed(4) : "—", color: "#a855f7" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="flex justify-between rounded px-2.5 py-2 text-[10px] font-mono"
                style={{ background: "#050505", border: "1px solid #181818" }}
              >
                <span style={{ color: "#2a3a48" }}>{label}</span>
                <span className="font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
