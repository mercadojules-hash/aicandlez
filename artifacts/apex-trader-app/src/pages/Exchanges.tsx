import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "rgba(0,210,100,0.88)";
const W    = "#ffffff";
const GR   = "#8892a4";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

// ── Exchange registry ────────────────────────────────────────────────────────────
type ExchangeEntry = {
  id: string; name: string; logo: string;
  active: boolean; color: string; needsPassphrase: boolean;
};

const ALL_EXCHANGES: ExchangeEntry[] = [
  { id: "kraken",    name: "Kraken",     logo: "K",  active: true,  color: "#7b4fff", needsPassphrase: false },
  { id: "coinbase",  name: "Coinbase",   logo: "C",  active: true,  color: "#0052ff", needsPassphrase: false },
  { id: "binance",   name: "Binance",    logo: "B",  active: true,  color: "#f0b90b", needsPassphrase: false },
  { id: "cryptocom", name: "Crypto.com", logo: "ᶜ",  active: true,  color: "#1a6fdf", needsPassphrase: false },
  { id: "gemini",    name: "Gemini",     logo: "G",  active: true,  color: "#00dcfa", needsPassphrase: false },
  { id: "robinhood", name: "Robinhood",  logo: "R",  active: true,  color: "#00c805", needsPassphrase: false },
  { id: "bybit",     name: "Bybit",      logo: "By", active: false, color: "#ff6b35", needsPassphrase: false },
  { id: "okx",       name: "OKX",        logo: "O",  active: false, color: "#d0d0d0", needsPassphrase: true  },
  { id: "kucoin",    name: "KuCoin",     logo: "Ku", active: false, color: "#00a651", needsPassphrase: true  },
  { id: "gate",      name: "Gate.io",    logo: "Ga", active: false, color: "#00aeff", needsPassphrase: false },
  { id: "bitget",    name: "Bitget",     logo: "Bt", active: false, color: "#00f0aa", needsPassphrase: false },
  { id: "mexc",      name: "MEXC",       logo: "M",  active: false, color: "#28a0f0", needsPassphrase: false },
  { id: "uphold",    name: "Uphold",     logo: "U",  active: false, color: "#00c7d8", needsPassphrase: false },
];

interface ApiExchange {
  exchange: string; name: string; connected: boolean; isDefault: boolean;
  tradingMode: string; status: string;
  permissions: { read: boolean; trade: boolean; withdraw: boolean };
  lastVerifiedAt?: string;
}
interface ExchangeListResponse { exchanges: ApiExchange[] }

// ── Connect modal (bottom sheet) ─────────────────────────────────────────────────
type FormState = { label: string; apiKey: string; apiSecret: string; passphrase: string };
const EMPTY_FORM: FormState = { label: "", apiKey: "", apiSecret: "", passphrase: "" };

function ConnectModal({
  ex, onClose, onConnected,
}: { ex: ExchangeEntry; onClose: () => void; onConnected: () => void }) {
  const [form, setForm]   = useState<FormState>(EMPTY_FORM);
  const [err,  setErr]    = useState("");
  const [show, setShow]   = useState({ key: false, secret: false });

  const mut = useMutation({
    mutationFn: () => api.post("/user/exchanges/connect", {
      exchange:   ex.id,
      label:      form.label || ex.name,
      apiKey:     form.apiKey,
      apiSecret:  form.apiSecret,
      ...(ex.needsPassphrase ? { passphrase: form.passphrase } : {}),
    }),
    onSuccess: () => { onConnected(); },
    onError:   (e: unknown) => {
      setErr(e instanceof Error ? e.message : "Connection failed. Check your credentials and try again.");
    },
  });

  const field = (
    label: string,
    key: keyof FormState,
    placeholder: string,
    masked = false,
    showKey?: "key" | "secret",
  ) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 500, color: GR,
        letterSpacing: "0.10em", textTransform: "uppercase" as const,
        marginBottom: 6 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <input
          type={masked && showKey && !show[showKey] ? "password" : "text"}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          style={{
            width: "100%", boxSizing: "border-box" as const,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8, padding: "11px 14px",
            fontFamily: key === "label" ? SANS : MONO,
            fontSize: 13, color: W,
            outline: "none",
          }}
        />
        {masked && showKey && (
          <button
            onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))}
            style={{ position: "absolute", right: 12, top: "50%",
              transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 10, fontFamily: SANS, color: GR }}>
            {show[showKey] ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        zIndex: 200, display: "flex", alignItems: "flex-end" }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", background: CARD,
          borderRadius: "20px 20px 0 0", padding: "24px 20px 36px",
          border: `1px solid rgba(255,255,255,0.08)`,
          borderBottom: "none",
          maxHeight: "90dvh", overflowY: "auto" as const }}>

        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11,
            background: ex.color + "15", border: `1px solid ${ex.color}35`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontFamily: MONO, fontWeight: 700, color: ex.color,
            flexShrink: 0 }}>
            {ex.logo}
          </div>
          <div>
            <div style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: W }}>
              Connect {ex.name}
            </div>
            <div style={{ fontSize: 9, fontFamily: SANS, color: GR, marginTop: 2 }}>
              API credentials required
            </div>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div style={{ background: "rgba(255,51,85,0.07)",
            border: "1px solid rgba(255,51,85,0.22)", borderRadius: 8,
            padding: "10px 14px", marginBottom: 16,
            fontSize: 10, fontFamily: SANS, color: "rgba(255,100,120,0.90)" }}>
            {err}
          </div>
        )}

        {field("Label (Optional)", "label", ex.name)}
        {field("API Key", "apiKey", "Paste your API key", true, "key")}
        {field("API Secret", "apiSecret", "Paste your API secret", true, "secret")}
        {ex.needsPassphrase && field("Passphrase", "passphrase", "API passphrase")}

        {/* Security note */}
        <div style={{ background: "rgba(0,210,100,0.04)",
          border: "1px solid rgba(0,210,100,0.14)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
            color: "rgba(0,210,100,0.80)", marginBottom: 3 }}>
            Encrypted & Secure Storage
          </div>
          <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.6 }}>
            Your API credentials are encrypted with AES-256-GCM and securely stored.
            Withdrawal permissions are never requested or tested.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "13px 0",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10, color: GR,
            fontFamily: SANS, fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>
            Cancel
          </button>
          <button
            disabled={mut.isPending || !form.apiKey || !form.apiSecret}
            onClick={() => { setErr(""); mut.mutate(); }}
            style={{
              flex: 2, padding: "13px 0",
              background: mut.isPending ? "rgba(0,229,255,0.06)" : "rgba(0,229,255,0.10)",
              border: "1px solid rgba(0,229,255,0.30)",
              borderRadius: 10, color: mut.isPending ? GR : C,
              fontFamily: SANS, fontSize: 13, fontWeight: 600,
              cursor: mut.isPending || !form.apiKey || !form.apiSecret ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}>
            {mut.isPending ? "Connecting…" : "Connect Exchange"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status chip ──────────────────────────────────────────────────────────────────
function StatusChip({ conn }: { conn: ApiExchange | undefined }) {
  if (!conn?.connected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%",
          background: "rgba(255,255,255,0.15)" }}/>
        <span style={{ fontSize: 8, fontFamily: SANS, color: "rgba(136,146,164,0.55)",
          letterSpacing: "0.08em" }}>NOT CONNECTED</span>
      </div>
    );
  }
  const active = conn.status === "active";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%",
        background: active ? "rgba(0,210,100,0.90)" : "rgba(255,170,0,0.80)",
        animation: active ? "dot-pulse 2.5s ease-in-out infinite" : "none" }}/>
      <span style={{ fontSize: 8, fontFamily: SANS,
        color: active ? "rgba(0,210,100,0.80)" : "rgba(255,170,0,0.80)",
        letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
        {conn.status}
      </span>
      {conn.isDefault && (
        <span style={{ marginLeft: 2, padding: "1px 6px",
          background: "rgba(0,229,255,0.07)",
          border: "1px solid rgba(0,229,255,0.18)",
          borderRadius: 3, fontSize: 7, fontFamily: SANS,
          color: "rgba(0,229,255,0.70)", letterSpacing: "0.08em" }}>
          DEFAULT
        </span>
      )}
    </div>
  );
}

// ── Permission tags ──────────────────────────────────────────────────────────────
function PermTag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ padding: "2px 8px",
      background: color + "10", border: `1px solid ${color}28`,
      borderRadius: 4, fontSize: 7, fontFamily: SANS, fontWeight: 600,
      color, letterSpacing: "0.07em" }}>
      {label}
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function Exchanges() {
  const [, setLocation]     = useLocation();
  const qc                  = useQueryClient();
  const [connectTarget, setConnectTarget] = useState<ExchangeEntry | null>(null);

  const { data, isLoading } = useQuery<ExchangeListResponse>({
    queryKey:        ["user-exchanges"],
    queryFn:         () => api.get("/user/exchanges"),
    refetchInterval: 30_000,
    retry:           false,
  });

  const connectionMap = new Map<string, ApiExchange>();
  (data?.exchanges ?? []).forEach(ex => connectionMap.set(ex.exchange, ex));

  const active = ALL_EXCHANGES.filter(e => e.active);
  const coming = ALL_EXCHANGES.filter(e => !e.active);

  const onConnected = () => {
    setConnectTarget(null);
    qc.invalidateQueries({ queryKey: ["user-exchanges"] });
  };

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 32 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px 14px",
        borderBottom: `1px solid ${E}` }}>
        <button onClick={() => setLocation("/profile")} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: SANS, fontSize: 10, fontWeight: 500,
          color: GR, letterSpacing: "0.04em",
          padding: "0 0 10px 0", display: "block",
        }}>
          ← Profile
        </button>
        <div style={{ fontSize: 22, fontFamily: SANS, fontWeight: 700, color: W }}>
          Exchange Hub
        </div>
        <div style={{ fontSize: 9, fontFamily: SANS, color: GR, marginTop: 4 }}>
          Connect your exchange accounts to enable live trading
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* ── Security banner ──────────────────────────────────────────────── */}
        <div style={{ background: "rgba(0,210,100,0.04)",
          border: "1px solid rgba(0,210,100,0.14)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 20,
          display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 22, height: 22, borderRadius: 6,
            background: "rgba(0,210,100,0.10)",
            border: "1px solid rgba(0,210,100,0.20)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginTop: 1 }}>
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <path d="M5.5 1L1 2.8V6.5C1 9 3 11.2 5.5 12C8 11.2 10 9 10 6.5V2.8L5.5 1Z"
                stroke="rgba(0,210,100,0.80)" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
              color: "rgba(0,210,100,0.85)", letterSpacing: "0.06em",
              marginBottom: 3 }}>
              Withdrawal permissions are never requested
            </div>
            <div style={{ fontSize: 8, fontFamily: SANS, color: GR, lineHeight: 1.6 }}>
              Only read and trade access is used. Your funds remain fully in your control.
            </div>
          </div>
        </div>

        {/* ── Active exchanges ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 2, height: 13, background: "rgba(0,229,255,0.40)",
            borderRadius: 2, flexShrink: 0 }}/>
          <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
            color: "rgba(255,255,255,0.50)", letterSpacing: "0.18em",
            textTransform: "uppercase" as const }}>
            Live Trading · 6 Exchanges
          </span>
        </div>

        {isLoading && (
          <div style={{ textAlign: "center", padding: "20px 0",
            fontFamily: SANS, fontSize: 10, color: GR }}>
            Loading connections…
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 28 }}>
          {active.map(ex => {
            const conn = connectionMap.get(ex.id);
            return (
              <div key={ex.id} style={{ background: CARD,
                border: `1px solid ${conn?.connected ? ex.color + "28" : E}`,
                borderRadius: 12, padding: "14px 16px",
                transition: "border-color 0.2s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Logo */}
                  <div style={{ width: 42, height: 42, borderRadius: 10,
                    background: ex.color + "12",
                    border: `1px solid ${ex.color}25`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, fontFamily: MONO, fontWeight: 700,
                    color: ex.color, flexShrink: 0 }}>
                    {ex.logo}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 600, color: W,
                      marginBottom: 4 }}>
                      {ex.name}
                    </div>
                    <StatusChip conn={conn}/>
                  </div>

                  {/* Action button */}
                  {!conn?.connected ? (
                    <button onClick={() => setConnectTarget(ex)} style={{
                      padding: "7px 16px", flexShrink: 0,
                      background: ex.color + "10",
                      border: `1px solid ${ex.color}35`,
                      borderRadius: 8, color: ex.color,
                      fontFamily: SANS, fontSize: 10, fontWeight: 600,
                      letterSpacing: "0.04em", cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}>
                      Connect
                    </button>
                  ) : (
                    <div style={{ flexShrink: 0, padding: "5px 11px",
                      background: conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.08)" : "rgba(255,170,0,0.08)",
                      border: `1px solid ${conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.22)" : "rgba(255,170,0,0.22)"}`,
                      borderRadius: 6,
                      fontSize: 8, fontFamily: SANS, fontWeight: 600,
                      color: conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.88)" : "rgba(255,170,0,0.88)",
                      letterSpacing: "0.05em" }}>
                      {conn.tradingMode === "live" ? "Live" : "Paper"}
                    </div>
                  )}
                </div>

                {/* Permissions */}
                {conn?.connected && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 10 }}>
                    {conn.permissions.read  && <PermTag label="Read"         color="rgba(0,185,215,0.80)"/>}
                    {conn.permissions.trade && <PermTag label="Trade"        color="rgba(0,210,100,0.80)"/>}
                    <PermTag label="No Withdraw"   color="rgba(136,146,164,0.60)"/>
                    {conn.lastVerifiedAt && (
                      <PermTag
                        label={`Verified ${new Date(conn.lastVerifiedAt).toLocaleDateString()}`}
                        color="rgba(136,146,164,0.55)"/>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Coming soon ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 2, height: 13, background: "rgba(255,255,255,0.15)",
            borderRadius: 2, flexShrink: 0 }}/>
          <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
            color: "rgba(255,255,255,0.35)", letterSpacing: "0.18em",
            textTransform: "uppercase" as const }}>
            Coming Soon
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {coming.map(ex => (
            <div key={ex.id} style={{ background: CARD, border: `1px solid ${E}`,
              borderRadius: 10, padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8,
                background: ex.color + "10",
                border: `1px solid ${ex.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontFamily: MONO, fontWeight: 700,
                color: ex.color + "90", flexShrink: 0 }}>
                {ex.logo}
              </div>
              <div>
                <div style={{ fontSize: 12, fontFamily: SANS, fontWeight: 500,
                  color: "rgba(255,255,255,0.60)" }}>
                  {ex.name}
                </div>
                <div style={{ fontSize: 7, fontFamily: SANS, color: GR,
                  letterSpacing: "0.09em", marginTop: 2,
                  textTransform: "uppercase" as const }}>
                  Coming soon
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer note ──────────────────────────────────────────────────── */}
        <div style={{ padding: "12px 16px", background: CARD,
          border: `1px solid ${E}`, borderRadius: 8 }}>
          <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.8 }}>
            Paper simulation works with all exchanges. Live trading is currently
            available on Kraken, Coinbase, Binance, Crypto.com, Gemini, and Robinhood.
          </div>
        </div>
      </div>

      {/* ── Connect modal ────────────────────────────────────────────────────── */}
      {connectTarget && (
        <ConnectModal
          ex={connectTarget}
          onClose={() => setConnectTarget(null)}
          onConnected={onConnected}
        />
      )}

      <style>{`
        @keyframes dot-pulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.4; transform: scale(0.80); }
        }
        input::placeholder { color: rgba(136,146,164,0.45); }
        input:focus { border-color: rgba(0,229,255,0.30) !important; }
      `}</style>
    </div>
  );
}
