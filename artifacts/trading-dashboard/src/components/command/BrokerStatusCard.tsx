import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Wifi, WifiOff } from "lucide-react";
import type { ExchangeStatus } from "./types";

interface Props { exchangeStatus: ExchangeStatus | undefined }

export function BrokerStatusCard({ exchangeStatus }: Props) {
  const qc   = useQueryClient();
  const name = (exchangeStatus?.exchangeName ?? "Exchange").toUpperCase();
  const mode = exchangeStatus?.mode ?? "simulation";
  const live = mode === "live";
  const bal  = exchangeStatus?.simBalances;

  const handleSelectExchange = async (exName: string) => {
    await fetch("/api/exchange/select", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: exName }),
      cache:   "no-store",
    });
    qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] });
  };

  const EXCHANGES = ["Kraken", "Binance", "Coinbase", "OKX", "Bybit"];

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <Landmark className="w-3.5 h-3.5 text-[#00eeff]" />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">BROKER / EXCHANGE</span>
        <span
          className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
          style={live
            ? { background: "#ff336610", color: "#ff3366", border: "1px solid #ff336630" }
            : { background: "#ffb80010", color: "#ffb800", border: "1px solid #ffb80030" }
          }
        >
          {name} {live ? "LIVE" : "SIM"}
        </span>
      </div>

      <div className="p-3">
        {/* Status rows */}
        <div className="space-y-1.5 mb-3 text-[8px] font-mono">
          {[
            {
              label: "CONNECTION",
              value: exchangeStatus?.apiConfigured ? "CONFIGURED" : "SIMULATION ONLY",
              color: exchangeStatus?.apiConfigured ? "#00ff88" : "#1e4060",
              icon: exchangeStatus?.apiConfigured ? Wifi : WifiOff,
            },
            {
              label: "KILL SWITCH",
              value: exchangeStatus?.killSwitch ? "ACTIVE" : "SAFE",
              color: exchangeStatus?.killSwitch ? "#ff3366" : "#00ff88",
            },
            {
              label: "ORDERS TODAY",
              value: String(exchangeStatus?.ordersToday ?? 0),
              color: "#4a8fa8",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[#0E2235] uppercase tracking-wide">{label}</span>
              <span style={{ color }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Exchange selector */}
        <div className="mb-3">
          <div className="text-[7px] text-[#0E2235] uppercase tracking-[0.2em] mb-1.5">SWITCH EXCHANGE</div>
          <div className="flex flex-wrap gap-1">
            {EXCHANGES.map((ex) => (
              <button
                key={ex}
                onClick={() => handleSelectExchange(ex)}
                className="text-[7px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide transition-colors"
                style={name === ex.toUpperCase()
                  ? { background: "#00eeff15", color: "#00eeff", border: "1px solid #00eeff35" }
                  : { background: "#050e1a", color: "#1e4060", border: "1px solid #0A1820" }
                }
              >
                {ex.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Simulated balances */}
        {bal && (
          <div>
            <div className="text-[7px] text-[#0E2235] uppercase tracking-[0.2em] mb-1.5">
              {name} BALANCE (SIMULATED)
            </div>
            <div className="grid grid-cols-2 gap-1 text-[8px] font-mono">
              {[
                { label: "USD", value: `$${bal.USD.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                { label: "BTC", value: bal.BTC.toFixed(4) },
                { label: "ETH", value: bal.ETH.toFixed(4) },
                { label: "SOL", value: bal.SOL.toFixed(4) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between bg-[#050e1a] rounded px-2 py-1 border border-[#0A1820]">
                  <span className="text-[#0E2235]">{label}</span>
                  <span className="text-[#00eeff80]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
