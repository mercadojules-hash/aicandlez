import { useQuery, useMutation } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { api, type Subscription, type ConsentStatus } from "@/lib/api";
import { PERFORMANCE_FEE_LABEL } from "@/lib/fees";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
        letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8,
        paddingLeft: 2 }}>
        {title}
      </div>
      <div style={{ background: "#050d18", border: "1px solid #0d2035",
        borderRadius: 12, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, color = "#e8f4ff", last }: {
  label: string; value: React.ReactNode; color?: string; last?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 16px", borderBottom: last ? "none" : "1px solid #081420" }}>
      <span style={{ fontSize: 11, fontFamily: "monospace", color: "#4a7090" }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

export default function Account() {
  const { signOut }    = useClerk();
  const { user }       = useUser();

  const { data: sub } = useQuery<Subscription>({
    queryKey: ["subscription"],
    queryFn:  () => api.get("/billing/subscription"),
    staleTime: 60_000,
  });

  const { data: consentData } = useQuery<ConsentStatus>({
    queryKey: ["consent-status"],
    queryFn:  () => api.get("/user/consent/status"),
    staleTime: 60_000,
  });

  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal", {
      returnUrl: `${window.location.origin}/aicandlez-app/account`,
    }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const planColor: Record<string, string> = {
    starter: "#00aaff",
    pro:     "#a855f7",
    free:    "#3a6080",
  };

  const plan  = sub?.plan ?? "free";
  const color = planColor[plan] ?? "#3a6080";

  const initials = user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "A";

  return (
    <div style={{ padding: "0 0 24px" }} className="page-enter">

      {/* Profile hero */}
      <div style={{
        background:  "linear-gradient(180deg, #050d18 0%, #030810 100%)",
        borderBottom: "1px solid #0d2035",
        padding:     "24px 20px 20px",
        marginBottom: 16,
        display:     "flex",
        alignItems:  "center",
        gap:         16,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "#00aaff18", border: "2px solid #00aaff40",
          display:    "flex", alignItems: "center", justifyContent: "center",
          fontSize:   20, fontFamily: "monospace", fontWeight: 800, color: "#00aaff",
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700,
            color: "#e8f4ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.fullName ?? user?.firstName ?? "Trader"}
          </div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#3a6080", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.emailAddresses?.[0]?.emailAddress ?? ""}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{
              padding: "2px 10px",
              background: color + "18",
              border: `1px solid ${color}50`,
              borderRadius: 4,
              color,
              fontSize: 9,
              fontWeight: 800,
              fontFamily: "monospace",
              letterSpacing: "0.12em",
            }}>
              {plan.toUpperCase()}
            </span>
            <span style={{
              fontSize: 9, fontFamily: "monospace",
              color: sub?.planStatus === "active" ? "#00ff8a" : "#ffaa00",
              letterSpacing: "0.08em",
            }}>
              {sub?.planStatus?.toUpperCase() ?? "FREE TIER"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* Subscription */}
        <Section title="SUBSCRIPTION">
          <Row label="Plan"
            value={<span style={{ padding: "2px 8px", background: color+"18",
              border: `1px solid ${color}40`, borderRadius: 4, color,
              fontSize: 9, fontWeight: 800, letterSpacing: "0.1em" }}>{plan.toUpperCase()}</span>}
          />
          <Row label="Live Trading"
            value={sub?.limits?.liveTrading ? "ENABLED" : "LOCKED"}
            color={sub?.limits?.liveTrading ? "#00ff8a" : "#ff4466"}
          />
          <Row label="Max Exchanges" value={String(sub?.limits?.exchanges ?? 1)} />
          <Row label="Max Positions"  value={String(sub?.limits?.positions  ?? 3)} last={plan === "free"} />
          {plan !== "free" && (
            <div style={{ padding: "12px 16px" }}>
              <button
                disabled={portal.isPending}
                onClick={() => portal.mutate()}
                style={{
                  width: "100%", padding: "11px 0",
                  background: "#00aaff10", border: "1px solid #00aaff30",
                  borderRadius: 8, color: "#00aaff",
                  fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.1em", cursor: portal.isPending ? "wait" : "pointer",
                }}>
                {portal.isPending ? "OPENING..." : "MANAGE BILLING →"}
              </button>
            </div>
          )}
        </Section>

        {/* Active features */}
        {sub?.features && sub.features.length > 0 && (
          <Section title="ACTIVE FEATURES">
            {sub.features.map((f, i) => (
              <div key={f} style={{ display: "flex", gap: 10, alignItems: "center",
                padding: "10px 16px",
                borderBottom: i < sub.features.length - 1 ? "1px solid #081420" : "none" }}>
                <span style={{ color: "#00ff8a", fontSize: 10, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 11, fontFamily: "system-ui, sans-serif", color: "#6090b0" }}>{f}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Legal */}
        <Section title="LEGAL AGREEMENTS">
          <Row label="Performance Fee Consent"
            value={consentData?.hasConsented ? "ACCEPTED" : "PENDING"}
            color={consentData?.hasConsented ? "#00ff8a" : "#ffaa00"}
          />
          {consentData?.consentedAt && (
            <Row label="Consented"
              value={new Date(consentData.consentedAt).toLocaleDateString()}
              color="#3a6080"
            />
          )}
          <Row label="Performance Fee"      value={`${PERFORMANCE_FEE_LABEL} on profits only`} color="#ffaa00" />
          <Row label="Withdrawal Perms"     value="NEVER REQUESTED"            color="#00ff8a" last />
        </Section>

        {/* Account info */}
        <Section title="ACCOUNT">
          <Row label="User ID"
            value={<span style={{ fontSize: 9, color: "#2a4060" }}>{user?.id?.slice(0, 18)}…</span>}
            last
          />
        </Section>

        {/* Sign out */}
        <button
          onClick={() => signOut()}
          style={{
            width: "100%", padding: "13px 0", marginTop: 8,
            background: "transparent", border: "1px solid #ff444428",
            borderRadius: 10, color: "#ff4466",
            fontFamily: "monospace", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.1em", cursor: "pointer",
            transition: "all 0.15s ease",
          }}>
          SIGN OUT
        </button>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 8,
          fontFamily: "monospace", color: "#1a3040", letterSpacing: "0.08em",
          lineHeight: 1.8 }}>
          AICANDLEZ · PAPER TRADING ACTIVE — LIVE TRADING LOCKED{"\n"}
          WITHDRAWAL PERMISSIONS ARE NEVER REQUESTED
        </div>
      </div>
    </div>
  );
}
