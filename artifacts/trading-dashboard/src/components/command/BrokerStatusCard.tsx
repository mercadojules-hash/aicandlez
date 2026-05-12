import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Wifi, WifiOff } from "lucide-react";
import type { ExchangeStatus } from "./types";

interface Props { exchangeStatus: ExchangeStatus | undefined }

const ALL_EXCHANGES = [
  "Kraken", "Binance", "Coinbase", "OKX", "Bybit",
  "Bitfinex", "Gate.io", "KuCoin", "Huobi", "MEXC", "Phemex",
];

export function BrokerStatusCard({ exchangeStatus }: Props) {
  const qc   = useQueryClient();
  const name = (exchangeStatus?.exchangeName ?? "Kraken").toUpperCase();
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

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#141414" }}>
        <Landmark className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.18em] font-mono" style={{ color: "#00eeff" }}>
          BROKER / EXCHANGE
        </span>
        <span
          className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded font-mono"
          style={live
            ? { background: "#ff336610", color: "#ff3366", border: "1px solid #ff336628" }
            : { background: "#ffb80010", color: "#ffb800", border: "1px solid #ffb80028" }
          }
        >
          {name.slice(0, 8)} {live ? "LIVE" : "SIM"}
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
              <span style={{ color: "#1e2a35" }} className="uppercase tracking-wide">{label}</span>
              <span className="flex items-center gap-1.5 font-bold" style={{ color }}>
                {Icon && <Icon className="w-3 h-3" />}
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Exchange selector */}
        <div className="mb-4">
          <div className="text-[8px] uppercase tracking-[0.2em] mb-2 font-mono" style={{ color: "#1a2a35" }}>
            SWITCH EXCHANGE
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_EXCHANGES.map((ex) => {
              const isActive = name === ex.toUpperCase() || name === ex.toUpperCase().replace(".", "");
              return (
                <button
                  key={ex}
                  onClick={() => handleSelectExchange(ex)}
                  className="text-[8px] font-bold px-2 py-1 rounded font-mono tracking-wide transition-all"
                  style={isActive
                    ? {
                        background: "#00eeff18",
                        color: "#00eeff",
                        border: "1px solid #00eeff40",
                        boxShadow: "0 0 8px #00eeff20",
                      }
                    : {
                        background: "#050505",
                        color: "#1e3040",
                        border: "1px solid #181818",
                      }
                  }
                >
                  {ex.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Balances */}
        {bal && (
          <div>
            <div className="text-[8px] uppercase tracking-[0.2em] mb-2 font-mono" style={{ color: "#1a2a35" }}>
              {name.slice(0, 8)} BALANCE (SIMULATED)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "USD", value: `$${bal.USD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "#00eeff" },
                { label: "BTC", value: bal.BTC.toFixed(4),                                                   color: "#ffaa00" },
                { label: "ETH", value: bal.ETH.toFixed(4),                                                   color: "#7b68ee" },
                { label: "SOL", value: bal.SOL.toFixed(4),                                                   color: "#a855f7" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex justify-between rounded px-2.5 py-2 text-[10px] font-mono"
                  style={{ background: "#050505", border: "1px solid #181818" }}
                >
                  <span style={{ color: "#1e3040" }}>{label}</span>
                  <span className="font-bold" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
