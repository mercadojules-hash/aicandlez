import { useBrokerConnection, type BrokerStatus } from "@/contexts/BrokerConnectionContext";

const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "#00ff88";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";

interface StatusConfig {
  label:      string;
  sub:        string;
  dot:        string;
  dotGlow:    string;
  border:     string;
  bg:         string;
  btnLabel?:  string;
  btnColor?:  string;
  btnBorder?: string;
}

const CONFIG: Record<BrokerStatus, StatusConfig> = {
  idle: {
    label:     "No Trading Account",
    sub:       "Connect your AI trading account to begin",
    dot:       "rgba(100,115,133,0.70)",
    dotGlow:   "none",
    border:    E,
    bg:        CARD,
    btnLabel:  "Connect Account",
    btnColor:  C,
    btnBorder: "rgba(0,229,255,0.35)",
  },
  onboarding: {
    label:     "Onboarding in Progress",
    sub:       "Completing your account setup with Alpaca",
    dot:       "rgba(255,148,0,0.90)",
    dotGlow:   "0 0 6px rgba(255,148,0,0.55)",
    border:    "rgba(255,148,0,0.18)",
    bg:        "rgba(255,148,0,0.04)",
    btnLabel:  "Continue Setup",
    btnColor:  "#ff9400",
    btnBorder: "rgba(255,148,0,0.35)",
  },
  pending_verification: {
    label:     "Identity Verification Pending",
    sub:       "Alpaca is reviewing your application (1–2 days)",
    dot:       "rgba(255,210,0,0.90)",
    dotGlow:   "0 0 6px rgba(255,210,0,0.55)",
    border:    "rgba(255,210,0,0.18)",
    bg:        "rgba(255,210,0,0.03)",
  },
  paper_active: {
    label:     "Paper Trading Active",
    sub:       "AI is analyzing and executing simulated trades",
    dot:       "rgba(0,255,136,0.92)",
    dotGlow:   "0 0 7px rgba(0,255,136,0.60)",
    border:    "rgba(0,255,136,0.20)",
    bg:        "rgba(0,255,136,0.04)",
  },
  live_active: {
    label:     "Live Trading Active",
    sub:       "AI executing real trades via your Alpaca account",
    dot:       "rgba(0,255,136,0.95)",
    dotGlow:   "0 0 9px rgba(0,255,136,0.70)",
    border:    "rgba(0,255,136,0.28)",
    bg:        "rgba(0,255,136,0.06)",
  },
  rejected: {
    label:     "Application Not Approved",
    sub:       "Contact support to resolve your account status",
    dot:       "rgba(255,51,85,0.88)",
    dotGlow:   "0 0 6px rgba(255,51,85,0.55)",
    border:    "rgba(255,51,85,0.18)",
    bg:        "rgba(255,51,85,0.04)",
    btnLabel:  "Contact Support",
    btnColor:  R,
    btnBorder: "rgba(255,51,85,0.35)",
  },
};

interface BrokerStatusCardProps {
  compact?: boolean;
}

export function BrokerStatusCard({ compact = false }: BrokerStatusCardProps) {
  const { status, accountNumber, openOnboarding } = useBrokerConnection();
  const cfg = CONFIG[status];
  const isActive = status === "paper_active" || status === "live_active";
  const isPending = status === "pending_verification";

  return (
    <div style={{
      background:   cfg.bg,
      border:       `1px solid ${cfg.border}`,
      borderRadius: compact ? 10 : 12,
      padding:      compact ? "12px 14px" : "14px 16px",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {/* Status dot */}
        <div style={{ position:"relative", flexShrink:0 }}>
          <div style={{
            width:8, height:8, borderRadius:"50%",
            background: cfg.dot,
            boxShadow: cfg.dotGlow,
            animation: (isActive || isPending) ? "dot-pulse 2.5s ease-in-out infinite" : undefined,
          }}/>
        </div>

        {/* Label + sub */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontSize: compact ? 10 : 11,
            fontFamily: SANS, fontWeight:600, color:W,
            letterSpacing:"0.01em",
          }}>
            {cfg.label}
          </div>
          {!compact && (
            <div style={{
              fontSize:9, fontFamily:SANS, color:GR, marginTop:2, lineHeight:1.5,
            }}>
              {cfg.sub}
            </div>
          )}
          {accountNumber && isActive && (
            <div style={{
              fontSize:8, fontFamily:MONO, color: G,
              marginTop:3, letterSpacing:"0.06em",
            }}>
              {accountNumber}
            </div>
          )}
        </div>

        {/* Action button */}
        {cfg.btnLabel && (
          <button
            onClick={status === "idle" || status === "onboarding" ? openOnboarding : undefined}
            style={{
              flexShrink:0,
              padding:"6px 13px",
              background:"transparent",
              border:`1px solid ${cfg.btnBorder}`,
              borderRadius:6, color:cfg.btnColor,
              fontFamily:SANS, fontSize:9, fontWeight:700,
              letterSpacing:"0.06em", cursor:"pointer",
              whiteSpace:"nowrap" as const,
            }}
          >
            {cfg.btnLabel}
          </button>
        )}
      </div>

      {/* Alpaca badge — only on active states */}
      {isActive && (
        <div style={{
          marginTop:10, paddingTop:8,
          borderTop:"1px solid rgba(255,255,255,0.05)",
          display:"flex", alignItems:"center", gap:6,
        }}>
          <div style={{
            padding:"2px 8px",
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.09)",
            borderRadius:4,
            fontSize:7, fontFamily:SANS, fontWeight:600,
            color:"rgba(136,146,164,0.65)", letterSpacing:"0.12em",
            textTransform:"uppercase" as const,
          }}>
            Powered by Alpaca
          </div>
          <div style={{ fontSize:8, fontFamily:SANS, color:"rgba(136,146,164,0.45)" }}>
            Sandbox · Paper Mode
          </div>
        </div>
      )}

      <style>{`
        @keyframes dot-pulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:0.5;transform:scale(1.3)}
        }
      `}</style>
    </div>
  );
}
