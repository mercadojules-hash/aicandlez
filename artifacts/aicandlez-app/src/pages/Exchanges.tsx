import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type Subscription } from "@/lib/api";
import { useDisclaimerGate } from "@/hooks/useDisclaimerGate";
import { useUserRole } from "@/hooks/useUserRole";
import { useExchangeCatalog } from "@/hooks/useExchangeCatalog";

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

// R1.5 — exchange tile list hydrates from /api/exchanges/catalog via
// `useExchangeCatalog`. Every entry's sigil/brandColor/apiKeyGuide
// originates from the backend registry (single source of truth). Live +
// beta rows render as active connect targets; coming_soon rows render
// as disabled cards via `comingSoonEntries`. The `active` boolean below
// is preserved on the local mapped shape for compatibility with the
// existing `ALL_EXCHANGES.filter(e => e.active)` logic.

function fromCatalog(c: {
  id: string; name: string; status: string; adapterAvailable: boolean;
  requiresPassphrase: boolean; sigil?: string; brandColor?: string; apiKeyGuide?: string;
}): ExchangeEntry {
  const connectable = c.status !== "coming_soon" && c.adapterAvailable;
  return {
    id:    c.id,
    name:  c.name,
    logo:  c.sigil ?? c.name.charAt(0).toUpperCase(),
    active: connectable,
    color: c.brandColor ?? "#00aaff",
    needsPassphrase: c.requiresPassphrase,
    apiGuide: c.apiKeyGuide,
  };
}

// Exchanges that ship a no-risk demo-trading surface we can opt into at
// connect time. Bitget reuses the production REST host gated by the
// `PAPTRADING: 1` header, so toggling demoMode tells the backend to
// persist demoMode=true and pass it to every BitgetAdapter instantiation.
const DEMO_TRADING_EXCHANGES = new Set<string>(["Bitget"]);

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
  const [demoMode, setDemoMode] = useState(false);
  const demoSupported = DEMO_TRADING_EXCHANGES.has(ex.id);

  const { gate: disclaimerGate, modal: disclaimerModal } = useDisclaimerGate();

  const mut = useMutation({
    mutationFn: () => api.post("/user/exchanges/connect", {
      exchange:  ex.id,
      label:     form.label || ex.name,
      apiKey:    form.apiKey,
      apiSecret: form.apiSecret,
      ...(ex.needsPassphrase ? { passphrase: form.passphrase } : {}),
      ...(demoSupported ? { demoMode } : {}),
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

        {/* Demo-trading toggle (Bitget today). Routes signed calls to the
            exchange's demo wallet on the production host via PAPTRADING:1 —
            real broker round-trip, no real funds at risk. */}
        {demoSupported && (
          <button
            type="button"
            onClick={() => setDemoMode(v => !v)}
            aria-pressed={demoMode}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "12px 14px", marginBottom: 16, cursor: "pointer",
              background: demoMode ? "rgba(102,255,102,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${demoMode ? "rgba(102,255,102,0.45)" : "rgba(255,255,255,0.10)"}`,
              borderRadius: 10, textAlign: "left",
              boxShadow: demoMode ? "0 0 16px rgba(102,255,102,0.18)" : "none",
              transition: "all 0.15s ease",
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, fontFamily: SANS, fontWeight: 700,
                color: demoMode ? "#66FF66" : "rgba(255,255,255,0.80)",
                letterSpacing: "0.14em", marginBottom: 3,
              }}>
                DEMO TRADING
              </div>
              <div style={{ fontSize: 10.5, fontFamily: SANS, color: GR, lineHeight: 1.5 }}>
                Practice on {ex.name}'s demo wallet — real broker, no real funds.
              </div>
            </div>
            <div style={{
              width: 34, height: 20, borderRadius: 999, flexShrink: 0,
              background: demoMode ? "#66FF66" : "rgba(255,255,255,0.10)",
              position: "relative",
              transition: "background 0.15s ease",
            }}>
              <div style={{
                position: "absolute", top: 2, left: demoMode ? 16 : 2,
                width: 16, height: 16, borderRadius: "50%",
                background: demoMode ? "#001b06" : "#ffffff",
                transition: "left 0.15s ease",
              }}/>
            </div>
          </button>
        )}

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
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%",
          background: "rgba(255,255,255,0.18)" }}/>
        <span style={{ fontSize: 10, fontFamily: SANS, fontWeight: 700,
          color: "rgba(136,146,164,0.70)", letterSpacing: "0.12em" }}>
          NOT CONNECTED
        </span>
      </div>
    );
  }
  const active = conn.status === "active";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%",
        background: active ? "rgba(102,255,102,1)" : "rgba(255,170,0,0.85)",
        boxShadow: active
          ? "0 0 10px rgba(102,255,102,0.85), 0 0 18px rgba(102,255,102,0.45)"
          : "0 0 6px rgba(255,170,0,0.55)",
        animation: active ? "dot-pulse 2.5s ease-in-out infinite" : "none" }}/>
      <span style={{ fontSize: 12, fontFamily: SANS, fontWeight: 900,
        color: active ? "#A8FFB0" : "rgba(255,170,0,0.95)",
        letterSpacing: "0.18em", textTransform: "uppercase" as const,
        textShadow: active
          ? "0 0 10px rgba(102,255,102,0.85), 0 0 22px rgba(102,255,102,0.45)"
          : "none" }}>
        {active ? "CONNECTED" : conn.status}
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
  const [showMembershipGate, setShowMembershipGate] = useState(false);

  const { data, isLoading } = useQuery<ExchangeListResponse>({
    queryKey:        ["user-exchanges"],
    queryFn:         () => api.get("/user/exchanges"),
    refetchInterval: 30_000,
    retry:           false,
  });

  // ── Membership gating ────────────────────────────────────────────────────
  // Live exchange connectivity is a paid feature. Free users can browse the
  // catalogue but cannot store API credentials. Backend also enforces this
  // (requirePlan("starter") on /user/exchanges/connect — never rely on UI
  // alone). We treat any non-"starter"/"pro" plan as locked, BUT
  // admin/super-admin always bypass the modal so operators on a "free" plan
  // can still onboard exchanges (matches the backend requirePlan bypass).
  const { data: sub } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get("/billing/subscription"),
    staleTime: 30_000,
    retry:     false,
  });
  // Role is resolved via `useUserRole()` — the single Bearer-capable source of
  // truth. Avoid duplicate /auth/me queries that bypass the Bearer fallback
  // (cookie-only fetches silently 401 on Safari ITP cross-subdomain and would
  // demote operators to a paid-gate state on this page).
  const { isAdmin: isOperator } = useUserRole();
  const isPaid     = sub?.plan === "starter" || sub?.plan === "pro";
  const canConnect = isOperator || isPaid;

  const handleConnectClick = (ex: ExchangeEntry) => {
    if (!canConnect) {
      setShowMembershipGate(true);
      return;
    }
    setConnectTarget(ex);
  };

  const connectionMap = new Map<string, ApiExchange>();
  (data?.exchanges ?? []).forEach(ex => connectionMap.set(ex.exchange, ex));

  // R1.5 — exchange list hydrated from /api/exchanges/catalog. `active`
  // = catalog rows whose adapter is implemented and status != coming_soon.
  // `coming` = catalog rows with status === "coming_soon" (Robinhood,
  // dYdX, Hyperliquid). Single registry, both lenses.
  const { exchanges: catalog } = useExchangeCatalog();
  const allExchanges = useMemo<ExchangeEntry[]>(() => catalog.map(fromCatalog), [catalog]);
  const active = allExchanges.filter(e => e.active);
  const coming = allExchanges.filter(e => !e.active);

  const onConnected = () => {
    setConnectTarget(null);
    qc.invalidateQueries({ queryKey: ["user-exchanges"] });
  };

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 32 }}>

      {/* ── Membership gate modal (free users) ──────────────────────────────── */}
      {showMembershipGate && (
        <div onClick={() => setShowMembershipGate(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 220,
          display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", background: CARD, borderRadius: "20px 20px 0 0",
            border: "1px solid rgba(102,255,102,0.18)", borderBottom: "none",
            padding: "28px 22px 36px", maxHeight: "82dvh", overflowY: "auto" as const,
          }}>
            <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 700,
              color: "#66FF66", letterSpacing: "0.16em", marginBottom: 8 }}>
              MEMBERSHIP REQUIRED
            </div>
            <div style={{ fontSize: 19, fontFamily: SANS, fontWeight: 700,
              color: W, lineHeight: 1.25, marginBottom: 10 }}>
              Live exchange access is a paid feature
            </div>
            <div style={{ fontSize: 12, fontFamily: SANS, color: GR,
              lineHeight: 1.6, marginBottom: 22 }}>
              Connecting a real exchange account requires an active AICandlez
              membership. Upgrade to AI Trading or AI Trading Pro to unlock
              live execution on Kraken, Coinbase, Binance, and more.
              Withdrawal permissions are never requested.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowMembershipGate(false)} style={{
                flex: 1, padding: "13px 0", background: "transparent",
                border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10,
                color: GR, fontFamily: SANS, fontSize: 13, fontWeight: 500,
                cursor: "pointer" }}>
                Not now
              </button>
              <button onClick={() => { setShowMembershipGate(false); setLocation("/subscribe"); }}
                style={{
                  flex: 2, padding: "13px 0",
                  background: "rgba(102,255,102,0.14)",
                  border: "1px solid rgba(102,255,102,0.45)",
                  borderRadius: 10, color: "#66FF66",
                  fontFamily: SANS, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.04em" }}>
                View Membership Plans
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div key={ex.id} style={{
                background: conn?.connected
                  ? `linear-gradient(160deg, ${ex.color}10 0%, ${CARD} 65%)`
                  : CARD,
                border: `1.5px solid ${conn?.connected ? ex.color + "66" : E}`,
                borderRadius: 14, padding: "16px 18px",
                boxShadow: conn?.connected
                  ? `0 0 24px ${ex.color}28, 0 0 0 1px ${ex.color}22 inset`
                  : "none",
                transition: "all 0.2s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 11,
                    background: conn?.connected ? ex.color + "1f" : ex.color + "12",
                    border: `1px solid ${ex.color}${conn?.connected ? "55" : "25"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, fontFamily: MONO, fontWeight: 800,
                    color: ex.color, flexShrink: 0,
                    boxShadow: conn?.connected ? `0 0 14px ${ex.color}40` : "none" }}>
                    {ex.logo}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 21, fontFamily: SANS, fontWeight: 900,
                      color: conn?.connected ? "#FFFFFF" : W, marginBottom: 6,
                      letterSpacing: -0.35,
                      textShadow: conn?.connected
                        ? `0 0 16px ${ex.color}, 0 0 32px ${ex.color}70`
                        : `0 0 10px ${ex.color}30` }}>
                      {ex.name}
                    </div>
                    <StatusChip conn={conn}/>
                  </div>

                  {!conn?.connected ? (
                    <button onClick={() => handleConnectClick(ex)} style={{
                      padding: "8px 18px", flexShrink: 0,
                      background: ex.color + "10",
                      border: `1px solid ${ex.color}35`,
                      borderRadius: 8, color: ex.color,
                      fontFamily: SANS, fontSize: 11, fontWeight: 700,
                      letterSpacing: 0.2,
                      cursor: "pointer", transition: "all 0.15s ease" }}>
                      Connect
                    </button>
                  ) : (
                    <div style={{ flexShrink: 0, padding: "6px 13px",
                      background: conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.14)" : "rgba(255,170,0,0.10)",
                      border: `1px solid ${conn.tradingMode === "live"
                        ? "rgba(0,210,100,0.50)" : "rgba(255,170,0,0.28)"}`,
                      borderRadius: 7, fontSize: 9.5, fontFamily: MONO, fontWeight: 800,
                      color: conn.tradingMode === "live"
                        ? "rgba(0,255,120,0.96)" : "rgba(255,170,0,0.92)",
                      letterSpacing: "0.16em", textTransform: "uppercase" as const,
                      boxShadow: conn.tradingMode === "live"
                        ? `0 0 12px rgba(0,210,100,0.40)` : "none" }}>
                      {conn.tradingMode === "live" ? "LIVE" : "PAPER"}
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
