import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

interface ExchangeInfo {
  exchange:    string;
  name:        string;
  connected:   boolean;
  isDefault:   boolean;
  tradingMode: string;
  status:      string;
  permissions: { read: boolean; trade: boolean; withdraw: boolean };
  lastVerifiedAt?: string;
}

interface ExchangeListResponse {
  exchanges: ExchangeInfo[];
}

const LOGO: Record<string, string> = {
  kraken:    "K",
  binance:   "B",
  coinbase:  "C",
  bybit:     "By",
  okx:       "O",
  kucoin:    "Ku",
  cryptocom: "ᶜ",
  gemini:    "G",
};

const COMING_SOON = ["bybit", "okx", "kucoin", "gate", "bitget", "mexc", "alpaca"];

export default function Exchanges() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<ExchangeListResponse>({
    queryKey:        ["user-exchanges"],
    queryFn:         () => api.get("/user/exchanges"),
    refetchInterval: 30_000,
  });

  const exchanges = data?.exchanges ?? [];

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setLocation("/live")}
          style={{ background: "none", border: "none", cursor: "pointer",
            fontFamily: "monospace", fontSize: 9, color: "#2a4060",
            letterSpacing: "0.1em", padding: "0 0 8px 0" }}>
          ← BACK TO LIVE
        </button>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Exchange Connections
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          marginTop: 4, letterSpacing: "0.08em" }}>
          API keys are encrypted at rest. Withdrawal permissions are NEVER requested.
        </div>
      </div>

      {/* Safety banner */}
      <div style={{ background: "#00ff8a08", border: "1px solid #00ff8a20",
        borderRadius: 8, padding: "10px 14px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>🔒</span>
        <span style={{ fontSize: 9, fontFamily: "monospace", color: "#00ff8a",
          fontWeight: 700, letterSpacing: "0.08em" }}>
          WITHDRAWAL PERMISSIONS ARE NEVER REQUESTED OR STORED
        </span>
      </div>

      {isLoading && (
        <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace",
          fontSize: 11, color: "#2a4060" }}>LOADING EXCHANGES...</div>
      )}

      {exchanges.map(ex => {
        const isComingSoon = COMING_SOON.includes(ex.exchange);
        const logo         = LOGO[ex.exchange] ?? ex.exchange[0].toUpperCase();

        return (
          <div key={ex.exchange} style={{
            background:   "#050d18",
            border:       `1px solid ${ex.connected ? "#00aaff30" : "#0d2035"}`,
            borderRadius: 10,
            padding:      "14px 16px",
            marginBottom: 10,
            opacity:      isComingSoon ? 0.5 : 1,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: ex.connected ? 10 : 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: "#00aaff10", border: "1px solid #00aaff20",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "#00aaff", flexShrink: 0,
              }}>
                {logo}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
                  {ex.name}
                </div>
                {isComingSoon ? (
                  <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
                    letterSpacing: "0.1em", marginTop: 2 }}>COMING SOON</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: ex.connected ? (ex.status === "active" ? "#00ff8a" : "#ffaa00") : "#2a4060",
                      boxShadow:  ex.connected ? "0 0 5px #00ff8a" : "none",
                    }} />
                    <span style={{ fontSize: 8, fontFamily: "monospace",
                      color: ex.connected ? "#3a6080" : "#1e3a50",
                      letterSpacing: "0.1em" }}>
                      {ex.connected ? ex.status.toUpperCase() : "NOT CONNECTED"}
                    </span>
                    {ex.isDefault && (
                      <span style={{ padding: "1px 6px", background: "#00aaff12",
                        border: "1px solid #00aaff30", borderRadius: 3,
                        fontSize: 7, fontFamily: "monospace", color: "#00aaff",
                        letterSpacing: "0.1em" }}>DEFAULT</span>
                    )}
                  </div>
                )}
              </div>

              {!isComingSoon && !ex.connected && (
                <button style={{
                  padding: "6px 14px",
                  background: "#00aaff12", border: "1px solid #00aaff40",
                  borderRadius: 6,
                  color: "#00aaff", fontFamily: "monospace",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  cursor: "pointer", flexShrink: 0,
                }}>
                  CONNECT
                </button>
              )}
            </div>

            {ex.connected && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ex.permissions.read  && <Tag label="READ"  color="#00aaff" />}
                {ex.permissions.trade && <Tag label="TRADE" color="#00ff8a" />}
                <Tag label={`NO WITHDRAW`} color="#00ff8a" />
                <Tag label={ex.tradingMode === "live" ? "⚡ LIVE" : "📄 PAPER"}
                  color={ex.tradingMode === "live" ? "#00ff8a" : "#ffaa00"} />
                {ex.lastVerifiedAt && (
                  <Tag label={`✓ ${new Date(ex.lastVerifiedAt).toLocaleDateString()}`} color="#2a4060" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: "2px 8px",
      background: color + "12",
      border: `1px solid ${color}35`,
      borderRadius: 4,
      fontSize: 8,
      fontFamily: "monospace",
      fontWeight: 700,
      color,
      letterSpacing: "0.08em",
    }}>
      {label}
    </span>
  );
}
