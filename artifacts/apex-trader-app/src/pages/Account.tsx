import { useQuery, useMutation } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { api, type Subscription, type ConsentStatus } from "@/lib/api";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ background: "#050d18", border: "1px solid #0d2035", borderRadius: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, color = "#e8f4ff" }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 16px", borderBottom: "1px solid #0a1a28" }}>
      <span style={{ fontSize: 11, fontFamily: "monospace", color: "#3a6080" }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

export default function Account() {
  const { signOut }    = useAuth();
  const { user }       = useUser();

  const { data: sub } = useQuery<Subscription>({
    queryKey: ["subscription"],
    queryFn:  () => api.get("/billing/subscription"),
  });

  const { data: consentData } = useQuery<ConsentStatus>({
    queryKey: ["consent-status"],
    queryFn:  () => api.get("/user/consent/status"),
  });

  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal", {
      returnUrl: `${window.location.origin}/apex-trader-app/account`,
    }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const planColor: Record<string, string> = {
    starter: "#00aaff",
    pro:     "#a855f7",
    free:    "#2a4060",
  };

  const plan   = sub?.plan ?? "free";
  const color  = planColor[plan] ?? "#2a4060";

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
          APEX TRADER
        </div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Account
        </div>
      </div>

      {/* Profile */}
      <Section title="PROFILE">
        <Row label="Email"  value={user?.emailAddresses?.[0]?.emailAddress ?? "—"} />
        <Row label="Name"   value={user?.fullName ?? user?.firstName ?? "—"} />
        <Row label="User ID" value={user?.id?.slice(0, 16) + "…" ?? "—"} color="#3a6080" />
      </Section>

      {/* Subscription */}
      <Section title="SUBSCRIPTION">
        <Row label="Current Plan" value={
          <span style={{
            padding: "2px 10px",
            background: color + "18",
            border: `1px solid ${color}50`,
            borderRadius: 4,
            color,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.1em",
          }}>
            {plan.toUpperCase()}
          </span>
        } />
        <Row label="Status"
          value={sub?.planStatus?.toUpperCase() ?? "FREE"}
          color={sub?.planStatus === "active" ? "#00ff8a" : "#ffaa00"}
        />
        <Row label="Live Trading" value={sub?.limits?.liveTrading ? "ENABLED" : "LOCKED"}
          color={sub?.limits?.liveTrading ? "#00ff8a" : "#ff4466"} />
        <Row label="Max Exchanges"
          value={String(sub?.limits?.exchanges ?? 1)} />
        <Row label="Max Positions"
          value={String(sub?.limits?.positions ?? 3)} />

        {plan !== "free" && (
          <div style={{ padding: "12px 16px" }}>
            <button
              disabled={portal.isPending}
              onClick={() => portal.mutate()}
              style={{
                width: "100%", padding: "11px 0",
                background: "#00aaff10",
                border: "1px solid #00aaff30",
                borderRadius: 8,
                color: "#00aaff",
                fontFamily: "monospace",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                cursor: portal.isPending ? "wait" : "pointer",
              }}>
              {portal.isPending ? "OPENING..." : "MANAGE BILLING →"}
            </button>
          </div>
        )}
      </Section>

      {/* Features */}
      {sub?.features && sub.features.length > 0 && (
        <Section title="ACTIVE FEATURES">
          {sub.features.map(f => (
            <div key={f} style={{ display: "flex", gap: 10, alignItems: "center",
              padding: "10px 16px", borderBottom: "1px solid #0a1a28" }}>
              <span style={{ color: "#00ff8a", fontSize: 10 }}>✓</span>
              <span style={{ fontSize: 11, fontFamily: "system-ui, sans-serif", color: "#6090b0" }}>
                {f}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Consent record */}
      <Section title="LEGAL AGREEMENTS">
        <Row label="Performance Fee Consent"
          value={consentData?.hasConsented ? "ACCEPTED" : "PENDING"}
          color={consentData?.hasConsented ? "#00ff8a" : "#ffaa00"}
        />
        {consentData?.consentedAt && (
          <Row label="Consented At"
            value={new Date(consentData.consentedAt).toLocaleDateString()}
            color="#3a6080"
          />
        )}
        <Row label="Fee Rate" value="2% on profitable trades" color="#ffaa00" />
        <Row label="Withdrawal Permissions" value="NEVER REQUESTED" color="#00ff8a" />
      </Section>

      {/* Sign out */}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => signOut()}
          style={{
            width: "100%", padding: "12px 0",
            background: "transparent",
            border: "1px solid #ff444430",
            borderRadius: 8,
            color: "#ff4466",
            fontFamily: "monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}>
          SIGN OUT
        </button>
      </div>
    </div>
  );
}
