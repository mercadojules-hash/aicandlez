import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Static exchange registry — all 13 entries, always shown ──────────────────
const ALL_EXCHANGES = [
  // ── ACTIVE — live trading supported ──────────────────────────────────────
  { id: "kraken",    name: "Kraken",     logo: "K",  active: true,  color: "#7b4fff" },
  { id: "coinbase",  name: "Coinbase",   logo: "C",  active: true,  color: "#0052ff" },
  { id: "binance",   name: "Binance",    logo: "B",  active: true,  color: "#f0b90b" },
  { id: "cryptocom", name: "Crypto.com", logo: "ᶜ",  active: true,  color: "#002d74" },
  { id: "gemini",    name: "Gemini",     logo: "G",  active: true,  color: "#00dcfa" },
  // ── COMING SOON — view only, no live trading ──────────────────────────────
  { id: "bybit",     name: "Bybit",      logo: "By", active: false, color: "#ff6b35" },
  { id: "okx",       name: "OKX",        logo: "O",  active: false, color: "#ffffff" },
  { id: "kucoin",    name: "KuCoin",     logo: "Ku", active: false, color: "#00a651" },
  { id: "gate",      name: "Gate.io",    logo: "Ga", active: false, color: "#00aeff" },
  { id: "bitget",    name: "Bitget",     logo: "Bt", active: false, color: "#00f0aa" },
  { id: "mexc",      name: "MEXC",       logo: "M",  active: false, color: "#28a0f0" },
  { id: "robinhood", name: "Robinhood",  logo: "R",  active: false, color: "#00c805" },
  { id: "uphold",    name: "Uphold",     logo: "U",  active: false, color: "#00c7d8" },
];

interface ApiExchange {
  exchange:    string;
  name:        string;
  connected:   boolean;
  isDefault:   boolean;
  tradingMode: string;
  status:      string;
  permissions: { read: boolean; trade: boolean; withdraw: boolean };
  lastVerifiedAt?: string;
}
interface ExchangeListResponse { exchanges: ApiExchange[] }

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: "2px 7px", background: color + "12",
      border: `1px solid ${color}35`, borderRadius: 4,
      fontSize: 8, fontFamily: "monospace", fontWeight: 700,
      color, letterSpacing: "0.08em",
    }}>
      {label}
    </span>
  );
}

export default function Exchanges() {
  const { data, isLoading } = useQuery<ExchangeListResponse>({
    queryKey:        ["user-exchanges"],
    queryFn:         () => api.get("/user/exchanges"),
    refetchInterval: 30_000,
    retry:           false,
  });

  // Build a lookup map: exchange_id → API connection data
  const connectionMap = new Map<string, ApiExchange>();
  (data?.exchanges ?? []).forEach(ex => connectionMap.set(ex.exchange, ex));

  const active  = ALL_EXCHANGES.filter(e => e.active);
  const coming  = ALL_EXCHANGES.filter(e => !e.active);

  return (
    <div style={{ padding: "0 0 24px" }} className="page-enter">

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #050d18 0%, #030810 100%)",
        borderBottom: "1px solid #0d2035",
        padding: "20px 20px 16px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", marginBottom: 4 }}>CONNECTED EXCHANGES</div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Exchange Hub
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          marginTop: 4, letterSpacing: "0.06em" }}>
          API keys are AES-256 encrypted at rest
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* Safety banner */}
        <div style={{ background: "#00ff8a06", border: "1px solid #00ff8a18",
          borderRadius: 10, padding: "10px 14px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 16, flexShrink: 0 }}>🔒</div>
          <div>
            <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700,
              color: "#00ff8a", letterSpacing: "0.08em" }}>
              WITHDRAWAL PERMISSIONS ARE NEVER REQUESTED
            </div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a5040",
              marginTop: 2 }}>
              Only READ + TRADE access is requested from your exchange
            </div>
          </div>
        </div>

        {/* Active exchanges section */}
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.16em", marginBottom: 10, paddingLeft: 2 }}>
          ACTIVE · LIVE TRADING SUPPORTED
        </div>

        {isLoading && (
          <div style={{ textAlign: "center", padding: "20px 0",
            fontFamily: "monospace", fontSize: 9, color: "#2a4060" }}>
            LOADING CONNECTIONS...
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {active.map(ex => {
            const conn = connectionMap.get(ex.id);
            return (
              <div key={ex.id} style={{
                background:   "#050d18",
                border:       `1px solid ${conn?.connected ? ex.color + "30" : "#0d2035"}`,
                borderRadius: 12,
                padding:      "14px 16px",
                transition:   "border-color 0.2s ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Logo */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: ex.color + "15",
                    border:     `1px solid ${ex.color}30`,
                    display:    "flex", alignItems: "center", justifyContent: "center",
                    fontSize:   15, fontWeight: 800, color: ex.color, flexShrink: 0,
                  }}>
                    {ex.logo}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontFamily: "monospace",
                      fontWeight: 700, color: "#e8f4ff" }}>
                      {ex.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background:  conn?.connected ? (conn.status === "active" ? "#00ff8a" : "#ffaa00") : "#1e3a50",
                        boxShadow:   conn?.connected && conn.status === "active" ? "0 0 6px #00ff8a" : "none",
                        flexShrink:  0,
                      }} />
                      <span style={{ fontSize: 8, fontFamily: "monospace",
                        color: conn?.connected ? "#3a6080" : "#1e3a50",
                        letterSpacing: "0.1em" }}>
                        {conn?.connected ? conn.status.toUpperCase() : "NOT CONNECTED"}
                      </span>
                      {conn?.isDefault && (
                        <span style={{ padding: "1px 6px", background: "#00aaff10",
                          border: "1px solid #00aaff25", borderRadius: 3,
                          fontSize: 7, fontFamily: "monospace", color: "#00aaff",
                          letterSpacing: "0.1em" }}>DEFAULT</span>
                      )}
                    </div>
                  </div>

                  {/* Connect / status button */}
                  {!conn?.connected ? (
                    <button style={{
                      padding: "7px 14px", flexShrink: 0,
                      background: ex.color + "12", border: `1px solid ${ex.color}40`,
                      borderRadius: 8, color: ex.color,
                      fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", cursor: "pointer",
                    }}>
                      CONNECT
                    </button>
                  ) : (
                    <div style={{
                      padding: "4px 10px",
                      background: conn.tradingMode === "live" ? "#00ff8a12" : "#ffaa0012",
                      border:     `1px solid ${conn.tradingMode === "live" ? "#00ff8a30" : "#ffaa0030"}`,
                      borderRadius: 6,
                      fontSize:    8, fontFamily: "monospace", fontWeight: 700,
                      color:       conn.tradingMode === "live" ? "#00ff8a" : "#ffaa00",
                      letterSpacing: "0.08em", flexShrink: 0,
                    }}>
                      {conn.tradingMode === "live" ? "⚡ LIVE" : "📄 PAPER"}
                    </div>
                  )}
                </div>

                {/* Permissions row */}
                {conn?.connected && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {conn.permissions.read  && <Tag label="READ"       color="#00aaff" />}
                    {conn.permissions.trade && <Tag label="TRADE"      color="#00ff8a" />}
                    <Tag label="NO WITHDRAW" color="#00ff8a" />
                    {conn.lastVerifiedAt && (
                      <Tag label={`✓ ${new Date(conn.lastVerifiedAt).toLocaleDateString()}`} color="#2a4060" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Coming soon section */}
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
          letterSpacing: "0.16em", marginBottom: 10, paddingLeft: 2 }}>
          COMING SOON · VIEW ONLY
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {coming.map(ex => (
            <div key={ex.id} style={{
              background:   "#050d18",
              border:       "1px solid #0a1825",
              borderRadius: 10,
              padding:      "12px 14px",
              opacity:      0.5,
              display:      "flex",
              alignItems:   "center",
              gap:          10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "#0a1825",
                display:    "flex", alignItems: "center", justifyContent: "center",
                fontSize:   12, fontWeight: 800, color: "#2a4060", flexShrink: 0,
              }}>
                {ex.logo}
              </div>
              <div>
                <div style={{ fontSize: 11, fontFamily: "monospace",
                  fontWeight: 700, color: "#3a5060" }}>
                  {ex.name}
                </div>
                <div style={{ fontSize: 7, fontFamily: "monospace",
                  color: "#1e3a50", letterSpacing: "0.1em", marginTop: 2 }}>
                  COMING SOON
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 14px", background: "#050d18",
          border: "1px solid #0d2035", borderRadius: 8 }}>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
            lineHeight: 1.7, letterSpacing: "0.06em" }}>
            Paper simulation works with all exchanges. Live trading is currently
            available on Kraken, Coinbase, Binance, Crypto.com, and Gemini.
            More exchanges launching soon.
          </div>
        </div>
      </div>
    </div>
  );
}
