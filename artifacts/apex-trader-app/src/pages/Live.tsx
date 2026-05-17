import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { api, type LiveEligibility } from "@/lib/api";

const ACTIVE_EXCHANGES = [
  { id: "alpaca",   name: "Alpaca",   logo: "A", active: true  },
  { id: "coinbase", name: "Coinbase", logo: "C", active: true  },
  { id: "binance",  name: "Binance",  logo: "B", active: true  },
  { id: "cryptocom",name: "Crypto.com",logo: "ᶜ",active: true  },
  { id: "gemini",   name: "Gemini",   logo: "G", active: true  },
];

const COMING_SOON = [
  "Bybit", "OKX", "KuCoin", "Gate.io", "Bitget", "MEXC", "Robinhood", "Uphold",
];

function GlowButton({
  children, onClick, disabled, variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost";
}) {
  const colors = {
    primary: { bg: "#00aaff18", border: "#00aaff60", text: "#00aaff" },
    danger:  { bg: "#ff444415", border: "#ff444440", text: "#ff4466" },
    ghost:   { bg: "transparent", border: "#0d2035",  text: "#2a4060" },
  }[variant];

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width:        "100%",
        padding:      "14px 0",
        background:   disabled ? "#050d18" : colors.bg,
        border:       `1px solid ${disabled ? "#0d2035" : colors.border}`,
        borderRadius: 8,
        color:        disabled ? "#1e3a50" : colors.text,
        fontFamily:   "monospace",
        fontSize:     12,
        fontWeight:   700,
        letterSpacing: "0.1em",
        cursor:       disabled ? "not-allowed" : "pointer",
        transition:   "all 0.15s ease",
      }}>
      {children}
    </button>
  );
}

// ── Screen: requires subscription ─────────────────────────────────────────────
function RequiresSubscriptionScreen() {
  const [, setLocation] = useLocation();
  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", marginBottom: 4 }}>LIVE TRADING</div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Subscription Required
        </div>
      </div>

      <div style={{
        background:   "#050d18",
        border:       "1px solid #00aaff20",
        borderRadius: 12,
        padding:      "20px 18px",
        marginBottom: 20,
        textAlign:    "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>⚡</div>
        <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700,
          color: "#e8f4ff", marginBottom: 8 }}>
          Unlock Live Trading
        </div>
        <div style={{ fontSize: 11, fontFamily: "system-ui, sans-serif", color: "#6090b0",
          lineHeight: 1.6, marginBottom: 18 }}>
          Try AI Paper Trading Free for 7 Days. Subscribe to the Starter plan
          to unlock live trade execution on your connected exchange.
        </div>
        <div style={{ fontSize: 24, fontFamily: "monospace", fontWeight: 800, color: "#00aaff",
          marginBottom: 4 }}>
          $5.99
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.1em", marginBottom: 18 }}>
          PER MONTH + 2% PERFORMANCE FEE ON PROFITS
        </div>
        <GlowButton onClick={() => setLocation("/subscribe")}>
          VIEW PLANS & SUBSCRIBE →
        </GlowButton>
      </div>

      <div style={{ background: "#050d18", border: "1px solid #0d2035",
        borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.14em", marginBottom: 10 }}>WHAT'S INCLUDED</div>
        {[
          "Live trade execution on connected exchange",
          "AI auto-mode with risk management",
          "Up to 5 active exchanges",
          "Real-time signal alerts",
          "Full trade journal & analytics",
          "No withdrawal permissions ever requested",
        ].map(f => (
          <div key={f} style={{ display: "flex", gap: 10, padding: "6px 0",
            borderBottom: "1px solid #0a1a28" }}>
            <span style={{ color: "#00ff8a", fontSize: 10, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 11, fontFamily: "system-ui, sans-serif",
              color: "#6090b0", lineHeight: 1.5 }}>{f}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "10px 14px", background: "#050d18",
        border: "1px solid #0d2035", borderRadius: 6 }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
          letterSpacing: "0.08em", lineHeight: 1.6 }}>
          7-Day Free AI Paper Trading Trial. Observe the AI and practice risk-free
          before unlocking live AI trading.
        </div>
      </div>
    </div>
  );
}

// ── Screen: requires consent ───────────────────────────────────────────────────
function RequiresConsentScreen() {
  const [, setLocation] = useLocation();
  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", marginBottom: 4 }}>LIVE TRADING</div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          One More Step
        </div>
      </div>

      <div style={{
        background:   "#050d18",
        border:       "1px solid #ffaa0040",
        borderRadius: 12,
        padding:      "20px 18px",
        marginBottom: 20,
        textAlign:    "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>📋</div>
        <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700,
          color: "#e8f4ff", marginBottom: 8 }}>
          Review & Accept Terms
        </div>
        <div style={{ fontSize: 11, fontFamily: "system-ui, sans-serif", color: "#6090b0",
          lineHeight: 1.6, marginBottom: 18 }}>
          You're subscribed! Before activating live trading, you need to read and
          accept the performance fee disclosure and risk agreement.
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 20 }}>
          {[
            ["2%", "Performance Fee\non Profitable Trades"],
            ["$0", "Fee on\nLosing Trades"],
            ["0%", "Withdrawal\nPermissions"],
          ].map(([val, label]) => (
            <div key={val} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 800,
                color: "#00aaff" }}>{val}</div>
              <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
                letterSpacing: "0.08em", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        <GlowButton onClick={() => setLocation("/consent")}>
          REVIEW & SIGN DISCLOSURE →
        </GlowButton>
      </div>
    </div>
  );
}

// ── Screen: fully eligible — live controls ─────────────────────────────────────
function LiveActiveScreen({ eligibility }: { eligibility: LiveEligibility }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: status } = useQuery({
    queryKey:        ["mobile-status"],
    queryFn:         () => api.get<{ engine: { mode: string; autoMode: boolean; killSwitch: boolean; paused: boolean; running: boolean; exchange: string } }>("/mobile/status"),
    refetchInterval: 5_000,
  });

  const engine = status?.engine;
  const isLive = engine?.mode === "live";

  const setMode = useMutation({
    mutationFn: (mode: "live" | "paper") =>
      api.post("/mobile/trading-mode", { mode, acknowledged: mode === "live" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-status"] }),
  });

  const toggleAuto = useMutation({
    mutationFn: () =>
      api.post("/simulation/order", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-status"] }),
  });

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%",
            background: isLive ? "#00ff8a" : "#ffaa00",
            boxShadow:  isLive ? "0 0 10px #00ff8a" : "0 0 8px #ffaa00" }} />
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.2em" }}>
            {isLive ? "LIVE MODE ACTIVE" : "PAPER MODE"}
          </div>
        </div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Live Trading
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#3a6080",
          marginTop: 4, letterSpacing: "0.08em" }}>
          {eligibility.plan.toUpperCase()} PLAN · CONSENT ACCEPTED
          {eligibility.consentedAt && (
            <> · {new Date(eligibility.consentedAt).toLocaleDateString()}</>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ background: "#050d18", border: "1px solid #0d2035",
        borderRadius: 10, padding: "16px", marginBottom: 16 }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.14em", marginBottom: 12 }}>TRADING MODE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            disabled={setMode.isPending}
            onClick={() => setMode.mutate("paper")}
            style={{
              padding: "12px 0",
              background: !isLive ? "#ffaa0018" : "transparent",
              border: `1px solid ${!isLive ? "#ffaa0060" : "#0d2035"}`,
              borderRadius: 8,
              color: !isLive ? "#ffaa00" : "#1e3a50",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}>
            📄 PAPER
          </button>
          <button
            disabled={setMode.isPending}
            onClick={() => setMode.mutate("live")}
            style={{
              padding: "12px 0",
              background: isLive ? "#00ff8a18" : "transparent",
              border: `1px solid ${isLive ? "#00ff8a60" : "#0d2035"}`,
              borderRadius: 8,
              color: isLive ? "#00ff8a" : "#1e3a50",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}>
            ⚡ LIVE
          </button>
        </div>

        {isLive && (
          <div style={{ marginTop: 10, padding: "8px 12px",
            background: "#00ff8a08", border: "1px solid #00ff8a20",
            borderRadius: 6, fontSize: 9, fontFamily: "monospace",
            color: "#3a6080", lineHeight: 1.5, letterSpacing: "0.08em" }}>
            LIVE MODE ACTIVE — AI is executing real trades on {engine?.exchange?.toUpperCase()}.
            A 2% performance fee applies to profitable closed positions.
          </div>
        )}
      </div>

      {/* Exchange status */}
      <div style={{ background: "#050d18", border: "1px solid #0d2035",
        borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.14em" }}>CONNECTED EXCHANGES</div>
          <button
            onClick={() => setLocation("/exchanges")}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontFamily: "monospace", fontSize: 8, color: "#00aaff",
              letterSpacing: "0.1em" }}>
            MANAGE →
          </button>
        </div>

        {/* Active exchanges */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {ACTIVE_EXCHANGES.map(ex => (
            <div key={ex.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 10px",
              background: "#00050d",
              border: "1px solid #0d2035",
              borderRadius: 6,
            }}>
              <div style={{ width: 18, height: 18, borderRadius: 4,
                background: "#00aaff18", border: "1px solid #00aaff30",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "#00aaff", flexShrink: 0 }}>
                {ex.logo}
              </div>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "#3a6080", fontWeight: 700 }}>
                {ex.name}
              </span>
            </div>
          ))}
        </div>

        {/* Coming soon */}
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
          letterSpacing: "0.1em", marginBottom: 6 }}>COMING SOON</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {COMING_SOON.map(name => (
            <span key={name} style={{
              padding: "3px 8px",
              background: "#050d18",
              border: "1px solid #0a1a28",
              borderRadius: 4,
              fontSize: 8,
              fontFamily: "monospace",
              color: "#1e3a50",
              letterSpacing: "0.06em",
            }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Safety rail */}
      <div style={{
        padding: "12px 14px",
        background: "#00050d",
        border: "1px solid #00ff8a15",
        borderRadius: 8,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700,
          color: "#00ff8a", letterSpacing: "0.1em", marginBottom: 4 }}>
          🔒 SAFETY GUARANTEES
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            "Withdrawal permissions are NEVER requested from your exchange",
            "Kill switch halts all trading instantly",
            "Daily loss limit enforced by risk engine",
            "No leverage or margin — spot trading only",
          ].map(item => (
            <div key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: "#00ff8a", fontSize: 8, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
                lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Kill switch */}
      <GlowButton variant="danger" onClick={() => api.post("/engine/kill-switch", { active: true })}>
        EMERGENCY KILL SWITCH — HALT ALL TRADING
      </GlowButton>
    </div>
  );
}

// ── Screen: checking eligibility ───────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "60vh", gap: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00aaff",
        animation: "pulse 1s infinite" }} />
      <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
        letterSpacing: "0.2em" }}>CHECKING ELIGIBILITY...</div>
    </div>
  );
}

// ── Main Live page ─────────────────────────────────────────────────────────────
export default function Live() {
  const search      = useSearch();
  const params      = new URLSearchParams(search);
  const fromCheckout = params.get("checkout") === "success";

  const { data, isLoading, isError } = useQuery<LiveEligibility>({
    queryKey:        ["live-eligibility"],
    queryFn:         () => api.get("/mobile/live-trading/eligibility"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingScreen />;

  if (isError || !data) {
    return (
      <div style={{ padding: "40px 16px 80px", textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#ff4466", marginBottom: 12 }}>
          ELIGIBILITY CHECK FAILED
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#2a4060" }}>
          Please sign in and try again.
        </div>
      </div>
    );
  }

  if (fromCheckout && !data.eligible && data.reason === "requires_consent") {
    return <RequiresConsentScreen />;
  }

  if (!data.eligible) {
    if (data.reason === "requires_subscription") return <RequiresSubscriptionScreen />;
    if (data.reason === "requires_consent")      return <RequiresConsentScreen />;
  }

  return <LiveActiveScreen eligibility={data} />;
}
