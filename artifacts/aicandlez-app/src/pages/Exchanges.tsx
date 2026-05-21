import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useDisclaimerGate } from "@/hooks/useDisclaimerGate";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const W    = "#ffffff";
const GR   = "#8892a4";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

// ── Exchange registry ────────────────────────────────────────────────────────────
type ExchangeEntry = {
  id: string; name: string; logo: string;
  active: boolean; color: string; needsPassphrase: boolean;
  apiGuide?: string;
};

const ALL_EXCHANGES: ExchangeEntry[] = [
  { id: "alpaca",    name: "Alpaca",     logo: "A",  active: true,  color: "#ffbe00",
    needsPassphrase: false, apiGuide: "Dashboard → Paper Trading → API Keys → Generate Key" },
  { id: "coinbase",  name: "Coinbase",   logo: "C",  active: true,  color: "#0052ff",
    needsPassphrase: false, apiGuide: "Profile → API → New API Key" },
  { id: "binance",   name: "Binance",    logo: "B",  active: true,  color: "#f0b90b",
    needsPassphrase: false, apiGuide: "Account → API Management → Create API" },
  { id: "cryptocom", name: "Crypto.com", logo: "ᶜ",  active: true,  color: "#1a6fdf",
    needsPassphrase: false, apiGuide: "Settings → API Keys → Create Key" },
  { id: "gemini",    name: "Gemini",     logo: "G",  active: true,  color: "#00dcfa",
    needsPassphrase: false, apiGuide: "Settings → API → Create New Key" },
  { id: "robinhood", name: "Robinhood",  logo: "R",  active: true,  color: "#00c805",
    needsPassphrase: false, apiGuide: "Account → API Credentials" },
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

// ── API onboarding panel ─────────────────────────────────────────────────────────
function ApiOnboardingPanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: CARD, border: `1px solid ${E}`,
      borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      <button
        onClick={() => setExpanded(p => !p)}
        style={{ width: "100%", background: "transparent", border: "none",
          padding: "14px 16px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6,
            background: "rgba(0,229,255,0.08)",
            border: "1px solid rgba(0,229,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <circle cx="5.5" cy="5.5" r="4.5" stroke="rgba(0,229,255,0.70)" strokeWidth="1.2"/>
              <line x1="5.5" y1="4" x2="5.5" y2="7.5" stroke="rgba(0,229,255,0.70)" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="5.5" cy="2.5" r="0.6" fill="rgba(0,229,255,0.70)"/>
            </svg>
          </div>
          <span style={{ fontSize: 12, fontFamily: SANS, fontWeight: 600,
            color: "rgba(255,255,255,0.88)" }}>
            How to connect your exchange
          </span>
        </div>
        <span style={{ fontSize: 11, fontFamily: SANS, color: GR,
          transform: expanded ? "rotate(180deg)" : "none",
          transition: "transform 0.2s ease" }}>
          ▾
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px",
          borderTop: `1px solid ${E}` }}>

          <div style={{ fontSize: 12, fontFamily: SANS, color: "rgba(255,255,255,0.75)",
            lineHeight: 1.75, marginTop: 14, marginBottom: 16 }}>
            To enable live trading, connect your personal exchange account using
            API credentials generated directly from your exchange. Your keys stay
            under your control at all times.
          </div>

          {/* Steps */}
          {[
            { n: "1", text: "Log in to your exchange and go to API Management or Account Settings" },
            { n: "2", text: "Create a new API key — enable Read and Trade permissions only" },
            { n: "3", text: "Never enable Withdrawal permissions — AICandlez does not request them" },
            { n: "4", text: "Copy your API key and secret, then paste them in the Connect form below" },
          ].map(({ n, text }) => (
            <div key={n} style={{ display: "flex", gap: 12, alignItems: "flex-start",
              paddingBottom: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                background: "rgba(0,229,255,0.08)",
                border: "1px solid rgba(0,229,255,0.20)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontFamily: MONO, fontWeight: 700,
                color: "rgba(0,229,255,0.80)" }}>
                {n}
              </div>
              <div style={{ fontSize: 11, fontFamily: SANS,
                color: "rgba(255,255,255,0.70)", lineHeight: 1.6, paddingTop: 2 }}>
                {text}
              </div>
            </div>
          ))}

          {/* Permission pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 4 }}>
            {[
              { label: "✓  Read access",     color: "rgba(0,185,215,0.78)" },
              { label: "✓  Trade access",    color: "rgba(0,210,100,0.78)" },
              { label: "✗  No withdrawals",  color: "rgba(255,180,0,0.72)" },
            ].map(({ label, color }) => (
              <span key={label} style={{
                padding: "4px 10px",
                background: color.replace("0.7", "0.06").replace("0.78", "0.06"),
                border: `1px solid ${color.replace("0.7", "0.18").replace("0.78", "0.18")}`,
                borderRadius: 20, fontSize: 9, fontFamily: SANS, fontWeight: 600, color,
              }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Connect modal ────────────────────────────────────────────────────────────────
type FormState = { label: string; apiKey: string; apiSecret: string; passphrase: string };
const EMPTY_FORM: FormState = { label: "", apiKey: "", apiSecret: "", passphrase: "" };

function ConnectModal({
  ex, onClose, onConnected,
}: { ex: ExchangeEntry; onClose: () => void; onConnected: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [err,  setErr]  = useState("");
  const [show, setShow] = useState({ key: false, secret: false });

  const { gate: disclaimerGate, modal: disclaimerModal } = useDisclaimerGate();

  const mut = useMutation({
    mutationFn: () => api.post("/user/exchanges/connect", {
      exchange:  ex.id,
      label:     form.label || ex.name,
      apiKey:    form.apiKey,
      apiSecret: form.apiSecret,
      ...(ex.needsPassphrase ? { passphrase: form.passphrase } : {}),
    }),
    onSuccess: onConnected,
    onError:   (e: unknown) => setErr(e instanceof Error
      ? e.message : "Connection failed. Check your credentials and try again."),
  });
  const submitConnect = () => disclaimerGate(() => mut.mutate());

  const Field = (
    label:    string,
    key:      keyof FormState,
    ph:       string,
    masked  = false,
    showKey?: "key" | "secret",
  ) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
        color: "rgba(136,146,164,0.90)", letterSpacing: "0.10em",
        textTransform: "uppercase" as const, marginBottom: 6 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <input
          type={masked && showKey && !show[showKey] ? "password" : "text"}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={ph}
          style={{
            width: "100%", boxSizing: "border-box" as const,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8, padding: "11px 14px",
            fontFamily: key === "label" ? SANS : MONO,
            fontSize: 13, color: W, outline: "none",
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
    <>
    {disclaimerModal}
    <div onClick={onClose} style={{ position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.72)", zIndex: 200,
      display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", background: CARD,
        borderRadius: "20px 20px 0 0",
        border: `1px solid rgba(255,255,255,0.09)`,
        borderBottom: "none",
        padding: "24px 20px 40px",
        maxHeight: "88dvh", overflowY: "auto" as const,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11,
            background: ex.color + "12", border: `1px solid ${ex.color}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontFamily: MONO, fontWeight: 700,
            color: ex.color, flexShrink: 0 }}>
            {ex.logo}
          </div>
          <div>
            <div style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: W }}>
              Connect {ex.name}
            </div>
            {ex.apiGuide && (
              <div style={{ fontSize: 9, fontFamily: SANS, color: GR, marginTop: 2 }}>
                {ex.apiGuide}
              </div>
            )}
          </div>
        </div>

        {err && (
          <div style={{ background: "rgba(255,51,85,0.07)",
            border: "1px solid rgba(255,51,85,0.22)", borderRadius: 8,
            padding: "10px 14px", marginBottom: 16,
            fontSize: 10, fontFamily: SANS, color: "rgba(255,100,120,0.90)" }}>
            {err}
          </div>
        )}

        {Field("Label (Optional)", "label", ex.name)}
        {Field("API Key",          "apiKey",    "Paste your API key",    true, "key"   )}
        {Field("API Secret",       "apiSecret", "Paste your API secret", true, "secret")}
        {ex.needsPassphrase && Field("Passphrase", "passphrase", "API passphrase")}

        {/* Security note */}
        <div style={{ background: "rgba(0,210,100,0.04)",
          border: "1px solid rgba(0,210,100,0.14)",
          borderRadius: 8, padding: "11px 14px", marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
            color: "rgba(0,210,100,0.82)", marginBottom: 3 }}>
            Encrypted & Secure Storage
          </div>
          <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.65 }}>
            Your API credentials are encrypted with AES-256-GCM and stored securely.
            Only Read + Trade access is used. Withdrawal permissions are never requested.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "13px 0",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10, color: GR,
            fontFamily: SANS, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            disabled={mut.isPending || !form.apiKey || !form.apiSecret}
            onClick={() => { setErr(""); submitConnect(); }}
            style={{ flex: 2, padding: "13px 0",
              background: mut.isPending ? "rgba(0,229,255,0.05)" : "rgba(0,229,255,0.10)",
              border: "1px solid rgba(0,229,255,0.30)",
              borderRadius: 10, color: mut.isPending ? GR : C,
              fontFamily: SANS, fontSize: 13, fontWeight: 600,
              cursor: mut.isPending || !form.apiKey || !form.apiSecret
                ? "not-allowed" : "pointer",
              transition: "all 0.15s ease" }}>
            {mut.isPending ? "Connecting…" : "Connect Exchange"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ── Status chip ──────────────────────────────────────────────────────────────────
function StatusChip({ conn }: { conn: ApiExchange | undefined }) {
  if (!conn?.connected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%",
          background: "rgba(255,255,255,0.15)" }}/>
        <span style={{ fontSize: 8, fontFamily: SANS,
          color: "rgba(136,146,164,0.55)", letterSpacing: "0.08em" }}>
          NOT CONNECTED
        </span>
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
  const [, setLocation]   = useLocation();
  const qc                = useQueryClient();
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
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${E}` }}>
        <button onClick={() => setLocation("/profile")} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: SANS, fontSize: 10, fontWeight: 500,
          color: GR, padding: "0 0 10px 0", display: "block",
        }}>
          ← Profile
        </button>
        <div style={{ fontSize: 22, fontFamily: SANS, fontWeight: 700, color: W }}>
          Exchange Hub
        </div>
        <div style={{ fontSize: 11, fontFamily: SANS, color: GR, marginTop: 4 }}>
          AI Paper Trading · Alpaca Paper &amp; Live · Simulation Active
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* ── Security banner ──────────────────────────────────────────────── */}
        <div style={{ background: "rgba(0,210,100,0.04)",
          border: "1px solid rgba(0,210,100,0.14)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 16,
          display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 22, height: 22, borderRadius: 6,
            background: "rgba(0,210,100,0.10)",
            border: "1px solid rgba(0,210,100,0.20)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginTop: 1 }}>
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <path d="M5.5 1L1 2.8V6.5C1 9 3 11.2 5.5 12C8 11.2 10 9 10 6.5V2.8L5.5 1Z"
                stroke="rgba(0,210,100,0.82)" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
              color: "rgba(0,210,100,0.85)", letterSpacing: "0.06em", marginBottom: 3 }}>
              Withdrawal permissions are never requested
            </div>
            <div style={{ fontSize: 8, fontFamily: SANS, color: GR, lineHeight: 1.65 }}>
              API keys remain under your control. Only Read + Trade access is used.
              Your funds stay securely in your exchange account.
            </div>
          </div>
        </div>

        {/* ── How to connect (expandable) ──────────────────────────────────── */}
        <ApiOnboardingPanel />

        {/* ── Active exchanges ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 2, height: 13, background: "rgba(0,229,255,0.40)",
            borderRadius: 2, flexShrink: 0 }}/>
          <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
            color: "rgba(255,255,255,0.50)", letterSpacing: "0.18em",
            textTransform: "uppercase" as const }}>
            Alpaca Paper Trading · Live Trading Locked
          </span>
        </div>

        {isLoading && (
          <div style={{ textAlign: "center", padding: "18px 0",
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
                  <div style={{ width: 42, height: 42, borderRadius: 10,
                    background: ex.color + "12", border: `1px solid ${ex.color}25`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, fontFamily: MONO, fontWeight: 700,
                    color: ex.color, flexShrink: 0 }}>
                    {ex.logo}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 600,
                      color: W, marginBottom: 4 }}>
                      {ex.name}
                    </div>
                    <StatusChip conn={conn}/>
                  </div>

                  {!conn?.connected ? (
                    <button onClick={() => setConnectTarget(ex)} style={{
                      padding: "7px 16px", flexShrink: 0,
                      background: ex.color + "10",
                      border: `1px solid ${ex.color}35`,
                      borderRadius: 8, color: ex.color,
                      fontFamily: SANS, fontSize: 10, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.15s ease" }}>
                      Connect
                    </button>
                  ) : (
                    <div style={{ flexShrink: 0, padding: "5px 11px",
                      background: conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.08)" : "rgba(255,170,0,0.08)",
                      border: `1px solid ${conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.22)" : "rgba(255,170,0,0.22)"}`,
                      borderRadius: 6, fontSize: 8, fontFamily: SANS, fontWeight: 600,
                      color: conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.88)" : "rgba(255,170,0,0.88)",
                      letterSpacing: "0.05em" }}>
                      {conn.tradingMode === "live" ? "Live" : "Paper"}
                    </div>
                  )}
                </div>

                {conn?.connected && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 10 }}>
                    {conn.permissions.read  && <PermTag label="Read"         color="rgba(0,185,215,0.80)"/>}
                    {conn.permissions.trade && <PermTag label="Trade"        color="rgba(0,210,100,0.80)"/>}
                    <PermTag label="No Withdraw" color="rgba(136,146,164,0.60)"/>
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
          <div style={{ width: 2, height: 13, background: "rgba(255,255,255,0.18)",
            borderRadius: 2, flexShrink: 0 }}/>
          <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
            color: "rgba(255,255,255,0.38)", letterSpacing: "0.18em",
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
                background: ex.color + "10", border: `1px solid ${ex.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontFamily: MONO, fontWeight: 700,
                color: ex.color + "90", flexShrink: 0 }}>
                {ex.logo}
              </div>
              <div>
                <div style={{ fontSize: 12, fontFamily: SANS, fontWeight: 500,
                  color: "rgba(255,255,255,0.65)" }}>
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
            AI Paper Trading uses the built-in simulation engine — no exchange connection required.
            Alpaca Paper &amp; Live trading is available via your connected Alpaca account.
            Live trading on other exchanges is locked pending your plan activation.
          </div>
        </div>
      </div>

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
        input::placeholder { color: rgba(136,146,164,0.40); }
        input:focus { border-color: rgba(0,229,255,0.30) !important; }
      `}</style>
    </div>
  );
}
