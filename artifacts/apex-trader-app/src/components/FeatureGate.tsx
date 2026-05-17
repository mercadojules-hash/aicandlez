import { useSubscription } from "@/contexts/SubscriptionContext";

const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const C    = "#00e5ff";
const W    = "#ffffff";
const GR   = "#8892a4";

interface FeatureGateProps {
  feature:      string;
  description?: string;
  locked?:      boolean;
  children:     React.ReactNode;
}

export function FeatureGate({ feature, description, locked, children }: FeatureGateProps) {
  const { isPaid, isActive, showPaywall } = useSubscription();

  const isLocked = locked !== undefined ? locked : (!isPaid || !isActive);

  if (!isLocked) return <>{children}</>;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12 }}>
      <div style={{
        filter: "blur(3px)", pointerEvents: "none",
        opacity: 0.35, userSelect: "none",
      }}>
        {children}
      </div>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        gap: 8, padding: "16px 24px",
      }}>
        <div style={{ fontSize: 22, lineHeight: 1 }}>🔒</div>
        <div style={{
          fontSize: 13, fontFamily: SANS, fontWeight: 700,
          color: W, textAlign: "center",
        }}>
          {feature}
        </div>
        <div style={{
          fontSize: 11, fontFamily: SANS, color: GR,
          textAlign: "center", lineHeight: 1.5, maxWidth: 200,
        }}>
          {description ?? "Subscribe to unlock this feature"}
        </div>
        <button
          onClick={() => showPaywall("feature_locked")}
          style={{
            marginTop: 6,
            padding: "9px 24px",
            background: "rgba(0,229,255,0.10)",
            border: `1px solid rgba(0,229,255,0.32)`,
            borderRadius: 8,
            color: C,
            fontSize: 12, fontFamily: SANS, fontWeight: 600,
            letterSpacing: "0.04em",
            cursor: "pointer",
            transition: "background 0.15s",
          }}>
          Unlock — $5.99/mo
        </button>
      </div>
    </div>
  );
}
