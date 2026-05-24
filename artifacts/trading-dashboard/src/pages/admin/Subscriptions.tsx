/**
 * CRM Phase A — /admin/subscriptions
 *
 * Operator subscription console. Surfaces every user with a non-free
 * plan or active trial/comp, with single-click access to the established
 * subscription action endpoints — audit-logged server-side, role-gated.
 *
 * Endpoint routing (matches adminUserActions.ts contracts exactly):
 *
 *   POST /api/admin/users/:id/complimentary_subscription   (operator)
 *     Body: { note, days }
 *     For users who ALREADY have a Stripe sub — pushes trial_end forward.
 *
 *   POST /api/admin/users/:id/create_complimentary_subscription
 *                                                          (super-admin)
 *     Body: { plan, days, paperOnly, capTier?, note }
 *     For users with NO Stripe sub — creates one in trialing state with
 *     cancel_at_period_end=true (zero surprise billing).
 *
 *   POST /api/admin/users/:id/extend_subscription          (operator)
 *     Body: { note, days }  (days ≤ 180)
 *
 *   POST /api/admin/users/:id/cancel_subscription          (operator)
 *     Body: { note, cancelAtPeriodEnd }
 *
 * The "Grant" action auto-routes to either complimentary_subscription
 * (existing sub → extend by days) or create_complimentary_subscription
 * (no sub → create a tiered comp). Operator only sees the plan-tier
 * picker for the create case.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  DollarSign, Loader2, RefreshCw, AlertTriangle, Search, Gift,
  X, Calendar, Ban,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SubRow {
  clerkUserId: string;
  email: string;
  plan: string;
  planStatus: string;
  adminStatus: string;
  trialEndsAt: string | null;
  isComplimentary?: boolean;
  mrrUsd: number;
  feesGenerated: number;
  revenueGenerated: number;
  tradesCount: number;
  hasLiveExchange: boolean;
  lastActivityAt: number | null;
}

type PlanTier = "starter" | "pro";

function useAuthFetch() {
  const { getToken } = useAuth();
  return async (p: string, init: RequestInit = {}) => {
    const t = await getToken().catch(() => null);
    const h: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) };
    if (t) h["Authorization"] = `Bearer ${t}`;
    return fetch(p, { ...init, headers: h });
  };
}

function fmtDollar(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1_000).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(0)}`;
}

function planColor(p: string) {
  switch ((p || "").toLowerCase()) {
    case "pro":     return "#cc55ff";
    case "starter": return "#00aaff";
    default:        return "#4a6a80";
  }
}

function classifySub(u: SubRow): "comp" | "trial" | "active" | "expired" | "free" {
  const trialMs = u.trialEndsAt ? new Date(u.trialEndsAt).getTime() : null;
  const expired = trialMs !== null && trialMs < Date.now();
  if (u.isComplimentary)                          return expired ? "expired" : "comp";
  if (u.planStatus === "trialing" && trialMs)     return expired ? "expired" : "trial";
  if (u.plan === "starter" || u.plan === "pro")   return "active";
  return "free";
}

export default function AdminSubscriptions() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState<"all" | "comp" | "trial" | "active" | "expired">("all");
  const [actionFor, setActionFor] = useState<{ row: SubRow; kind: "comp" | "extend" | "cancel" } | null>(null);

  const { data: users = [], isLoading, isError, refetch } = useQuery<SubRow[]>({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      // Backend caps pageSize at 200 (parsePositiveInt max). Anything
      // higher silently truncates and produces misleading CRM totals.
      const res = await authFetch(`/api/admin/users?pageSize=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { users?: SubRow[] };
      return body.users ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  // Operator default: hide pure-free, non-trialing rows — they're not
  // billing-actionable. Search/filter respect the search regardless.
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return users.filter(u => {
      if (ql && !u.email.toLowerCase().includes(ql)) return false;
      const cls = classifySub(u);
      if (classFilter !== "all") return cls === classFilter;
      return cls !== "free";
    });
  }, [users, q, classFilter]);

  const metrics = useMemo(() => {
    const active   = users.filter(u => classifySub(u) === "active").length;
    const trialing = users.filter(u => classifySub(u) === "trial").length;
    const comp     = users.filter(u => classifySub(u) === "comp").length;
    const expired  = users.filter(u => classifySub(u) === "expired").length;
    const mrr      = users.reduce((s, u) => s + (u.mrrUsd || 0), 0);
    const revenue  = users.reduce((s, u) => s + (u.revenueGenerated || 0), 0);
    return { active, trialing, comp, expired, mrr, revenue };
  }, [users]);

  return (
    <div className="min-h-screen" style={{ background: "#060810", color: "#EAF2FF" }}>
      <div className="border-b px-6 py-4 flex items-center gap-4" style={{ background: "#000", borderColor: "#0d1e2e" }}>
        <div className="p-2 rounded" style={{ background: "#00ff8a12", border: "1px solid #00ff8a30" }}>
          <DollarSign className="w-4 h-4" style={{ color: "#00ff8a", filter: "drop-shadow(0 0 6px #00ff8a)" }} />
        </div>
        <div>
          <div className="text-[10px] font-mono font-bold tracking-[0.3em]" style={{ color: "#00ff8a80" }}>
            CRM · SUBSCRIPTIONS
          </div>
          <div className="text-[18px] font-bold font-mono tracking-[0.1em]">SUBSCRIPTION OPERATIONS</div>
        </div>
        <div className="flex-1" />
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold"
          style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
        {/* ── Subscription mix ──────────────────────────────────────────── */}
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: "MRR",        value: fmtDollar(metrics.mrr),     color: "#00ff8a", sub: "Sum of paying subs"     },
            { label: "Revenue",    value: fmtDollar(metrics.revenue), color: "#7b68ee", sub: "Fees + MRR"             },
            { label: "Active",     value: metrics.active.toString(),  color: "#00aaff", sub: "Paying subscribers"     },
            { label: "Trialing",   value: metrics.trialing.toString(),color: "#00f0ff", sub: "Paid trials"            },
            { label: "Comp",       value: metrics.comp.toString(),    color: "#cc55ff", sub: "Complimentary"          },
            { label: "Expired",    value: metrics.expired.toString(), color: "#ff3355", sub: "Past trial / comp"      },
          ].map(m => (
            <div key={m.label} className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
              <div className="text-[20px] font-bold font-mono tabular-nums" style={{ color: m.color }}>{m.value}</div>
              <div className="text-[9px] font-mono font-bold tracking-[0.15em] mt-1.5 uppercase" style={{ color: "#9FB3C8" }}>
                {m.label}
              </div>
              <div className="text-[8px] font-mono mt-0.5" style={{ color: "#4a6a80" }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="rounded border overflow-hidden" style={{ borderColor: "#0d1e2e" }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: "#000", borderColor: "#0d1e2e" }}>
            <span className="text-[11px] font-bold font-mono tracking-[0.15em]">SUBSCRIPTION LEDGER</span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded font-bold"
              style={{ background: "#00ff8a10", color: "#00ff8a80", border: "1px solid #00ff8a20" }}>
              {filtered.length} ROWS
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              {(["all", "active", "trial", "comp", "expired"] as const).map(k => (
                <button key={k} onClick={() => setClassFilter(k)}
                  className="px-2.5 py-1 rounded font-mono text-[8px] font-bold border uppercase"
                  style={classFilter === k
                    ? { background: "#00ff8a14", color: "#00ff8a", borderColor: "#00ff8a40" }
                    : { background: "transparent", color: "#4a6a80", borderColor: "#1a2a36" }}>
                  {k}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded border" style={{ background: "#010C18", borderColor: "#1a2a36" }}>
              <Search className="w-3 h-3" style={{ color: "#4a6a80" }} />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search email…"
                className="bg-transparent font-mono text-[9px] outline-none w-36"
                style={{ color: "#EAF2FF" }} />
            </div>
          </div>

          <div className="overflow-x-auto" style={{ background: "#010C18" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #0d1e2e", background: "#000" }}>
                  {["USER", "PLAN", "CLASS", "STATUS", "TRIAL ENDS", "MRR", "REVENUE", "TRADES", "ACTIONS"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left">
                      <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center">
                    <Loader2 className="w-5 h-5 inline-block animate-spin" style={{ color: "#00ff8a" }} />
                  </td></tr>
                )}
                {isError && !isLoading && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center">
                    <AlertTriangle className="w-5 h-5 inline-block" style={{ color: "#ff3355" }} />
                  </td></tr>
                )}
                {!isLoading && !isError && filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center">
                    <div className="text-[10px] font-mono" style={{ color: "#4a6a80" }}>No subscriptions match this filter.</div>
                  </td></tr>
                )}
                {filtered.map((u, i) => {
                  const cls = classifySub(u);
                  const classColor =
                    cls === "active"  ? "#00aaff" :
                    cls === "trial"   ? "#00f0ff" :
                    cls === "comp"    ? "#cc55ff" :
                    cls === "expired" ? "#ff3355" : "#4a6a80";
                  const trialMs = u.trialEndsAt ? new Date(u.trialEndsAt).getTime() : null;
                  return (
                    <tr key={u.clerkUserId} className="border-b"
                      style={{ borderColor: "#0a1520", background: i % 2 === 0 ? "#010C18" : "#020E1E" }}>
                      <td className="px-3 py-2.5">
                        <div className="text-[10px] font-bold font-mono truncate" style={{ color: "#EAF2FF", maxWidth: 240 }}>
                          {u.email}
                        </div>
                        <div className="text-[7px] font-mono truncate" style={{ color: "#3a5a70", maxWidth: 240 }}>{u.clerkUserId}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded uppercase"
                          style={{ background: `${planColor(u.plan)}14`, color: planColor(u.plan), border: `1px solid ${planColor(u.plan)}30` }}>
                          {u.plan || "free"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[8px] font-bold font-mono uppercase" style={{ color: classColor }}>
                          {cls}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[9px] font-mono uppercase" style={{ color: "#9FB3C8" }}>{u.planStatus}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[9px] font-mono" style={{ color: trialMs ? "#EAF2FF" : "#3a5a70" }}>
                          {trialMs ? new Date(trialMs).toLocaleDateString() : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.mrrUsd > 0 ? "#00ff8a" : "#3a5a70" }}>
                          {fmtDollar(u.mrrUsd)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.revenueGenerated > 0 ? "#7b68ee" : "#3a5a70" }}>
                          {fmtDollar(u.revenueGenerated)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono" style={{ color: "#9FB3C8" }}>{u.tradesCount}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setActionFor({ row: u, kind: "comp" })}
                            title="Grant complimentary subscription"
                            className="p-1 rounded border"
                            style={{ background: "#cc55ff14", borderColor: "#cc55ff40", color: "#cc55ff" }}>
                            <Gift className="w-3 h-3" />
                          </button>
                          <button onClick={() => setActionFor({ row: u, kind: "extend" })}
                            title="Extend trial / comp"
                            disabled={!trialMs}
                            className="p-1 rounded border"
                            style={{
                              background: trialMs ? "#00f0ff14" : "#01060A",
                              borderColor: trialMs ? "#00f0ff40" : "#1a2a36",
                              color: trialMs ? "#00f0ff" : "#3a5a70",
                              cursor: trialMs ? "pointer" : "not-allowed",
                            }}>
                            <Calendar className="w-3 h-3" />
                          </button>
                          <button onClick={() => setActionFor({ row: u, kind: "cancel" })}
                            title="Cancel subscription"
                            disabled={cls !== "active" && cls !== "trial"}
                            className="p-1 rounded border"
                            style={{
                              background: (cls === "active" || cls === "trial") ? "#ff334414" : "#01060A",
                              borderColor: (cls === "active" || cls === "trial") ? "#ff334440" : "#1a2a36",
                              color: (cls === "active" || cls === "trial") ? "#ff3344" : "#3a5a70",
                              cursor: (cls === "active" || cls === "trial") ? "pointer" : "not-allowed",
                            }}>
                            <Ban className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {actionFor && (
        <SubscriptionActionModal
          row={actionFor.row}
          kind={actionFor.kind}
          onClose={() => setActionFor(null)}
          onSuccess={() => {
            setActionFor(null);
            qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
            qc.invalidateQueries({ queryKey: ["admin-users"] });
          }}
        />
      )}
    </div>
  );
}

// ── Action modal ─────────────────────────────────────────────────────────────
// Reuses the existing /complimentary_subscription + /cancel_subscription
// endpoints (audit-logged server-side, role-gated). The complimentary
// endpoint is the canonical path for "operator-grants-paid-plan" because
// it's reversible, audit-trail-clean, and doesn't punch through Stripe.

function SubscriptionActionModal({
  row, kind, onClose, onSuccess,
}: {
  row: SubRow;
  kind: "comp" | "extend" | "cancel";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const authFetch = useAuthFetch();
  const [tier,  setTier]  = useState<PlanTier>("starter");
  const [days,  setDays]  = useState<number>(30);
  const [note,  setNote]  = useState<string>("");
  const [cancelAtEnd, setCancelAtEnd] = useState<boolean>(true);

  // Whether the user already has a Stripe subscription. We can't read the
  // raw stripeSubscriptionId from /admin/users today, so we proxy via
  // planStatus + non-zero MRR — anything actively billing in Stripe sets
  // one of these. False ⇒ "no sub", which routes Grant to create_*.
  const hasStripeSub =
    ["active", "trialing", "past_due", "canceled"].includes(row.planStatus) ||
    row.mrrUsd > 0;

  const mutation = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const userId = row.clerkUserId;

      if (kind === "cancel") {
        // POST /cancel_subscription — { note, cancelAtPeriodEnd }
        const res = await authFetch(`/api/admin/users/${userId}/cancel_subscription`, {
          method: "POST",
          body:   JSON.stringify({
            note:              note.trim() || "operator cancel",
            cancelAtPeriodEnd: cancelAtEnd,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        return res.json();
      }

      if (kind === "extend") {
        // POST /extend_subscription — { note, days } (days ≤ 180).
        // Only enabled when hasStripeSub is true; backend will 409 otherwise.
        const res = await authFetch(`/api/admin/users/${userId}/extend_subscription`, {
          method: "POST",
          body:   JSON.stringify({
            note: note.trim() || `extend ${days}d`,
            days: Math.min(180, days),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        return res.json();
      }

      // kind === "comp"
      if (hasStripeSub) {
        // POST /complimentary_subscription — { note, days }.
        // Plan tier is ignored: comp extends the user's *existing* sub.
        // The operator picker for tier in this branch is hidden in the UI.
        const res = await authFetch(`/api/admin/users/${userId}/complimentary_subscription`, {
          method: "POST",
          body:   JSON.stringify({
            note: note.trim() || `comp ${days}d`,
            days,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        return res.json();
      }

      // No Stripe sub → create a fresh tiered comp. Super-admin only;
      // a 403 here surfaces a clear operator error in the toast.
      const res = await authFetch(`/api/admin/users/${userId}/create_complimentary_subscription`, {
        method: "POST",
        body:   JSON.stringify({
          plan:      tier,
          days,
          paperOnly: true,
          note:      note.trim() || `create comp ${days}d ${tier}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        if (res.status === 403) {
          throw new Error("Super-admin role required to create a brand-new complimentary subscription.");
        }
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: kind === "cancel" ? "Subscription cancelled" : kind === "extend" ? "Trial extended" : "Comp granted",
        description: `${row.email} — audit logged.`,
      });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message });
    },
  });

  const title  = kind === "comp"   ? "GRANT COMPLIMENTARY" :
                 kind === "extend" ? "EXTEND TRIAL / COMP" : "CANCEL SUBSCRIPTION";
  const color  = kind === "cancel" ? "#ff3344" : kind === "extend" ? "#00f0ff" : "#cc55ff";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 420, background: "#010C18", border: `1px solid ${color}40`,
        borderRadius: 6, padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: `${color}80`, letterSpacing: "0.2em" }}>
              SUBSCRIPTION OPERATION
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: "#EAF2FF" }}>
              {title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#7a9eb8", cursor: "pointer" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div style={{ background: "#000", border: "1px solid #0d1e2e", borderRadius: 4, padding: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", letterSpacing: "0.1em", marginBottom: 4 }}>
            TARGET USER
          </div>
          <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#EAF2FF" }}>
            {row.email}
          </div>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#3a5a70", marginTop: 2 }}>
            {row.clerkUserId} · {row.plan.toUpperCase()} · {row.planStatus}
          </div>
        </div>

        {/* Plan-tier picker only renders for the create-comp branch
            (user has NO existing Stripe sub). When they already have a sub,
            we just extend by days — Stripe controls the tier. */}
        {kind === "comp" && !hasStripeSub && (
          <>
            <div style={{
              background: "#cc55ff10", border: "1px solid #cc55ff30", borderRadius: 4,
              padding: "8px 10px", marginBottom: 12,
              fontSize: 9, fontFamily: "monospace", color: "#cc55ffcc", lineHeight: 1.5,
            }}>
              No Stripe subscription on file. This creates a new comp sub
              in trialing state with <b>cancel_at_period_end=true</b> (zero
              surprise billing). Super-admin role required.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", display: "block", marginBottom: 6 }}>
                PLAN TIER
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                {(["starter", "pro"] as const).map(t => (
                  <button key={t} onClick={() => setTier(t)}
                    style={{
                      flex: 1, padding: "8px 0",
                      background: tier === t ? `${planColor(t)}20` : "#010C18",
                      border: `1px solid ${tier === t ? planColor(t) : "#0d1e2e"}`,
                      borderRadius: 4, color: tier === t ? planColor(t) : "#7a9eb8",
                      fontFamily: "monospace", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>
                    {t.toUpperCase()} {t === "starter" ? "$39.99" : "$79.99"}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {kind === "comp" && hasStripeSub && (
          <div style={{
            background: "#00aaff10", border: "1px solid #00aaff30", borderRadius: 4,
            padding: "8px 10px", marginBottom: 12,
            fontSize: 9, fontFamily: "monospace", color: "#00aaffcc", lineHeight: 1.5,
          }}>
            Existing Stripe subscription detected. Comp extends the current
            trial_end by the days below — plan tier is preserved.
          </div>
        )}

        {(kind === "comp" || kind === "extend") && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", display: "block", marginBottom: 6 }}>
              DAYS
            </label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[7, 14, 30, 60, 90].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  style={{
                    flex: 1, padding: "6px 0", background: days === d ? `${color}20` : "#010C18",
                    border: `1px solid ${days === d ? color : "#0d1e2e"}`,
                    borderRadius: 4, color: days === d ? color : "#7a9eb8",
                    fontFamily: "monospace", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}>
                  {d}d
                </button>
              ))}
            </div>
            <input type="number" min={1} max={365} value={days}
              onChange={e => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              style={{
                width: "100%", background: "#000", border: "1px solid #0d1e2e",
                borderRadius: 4, padding: "8px 10px", color: "#EAF2FF",
                fontFamily: "monospace", fontSize: 12, fontWeight: 700, outline: "none",
              }} />
          </div>
        )}

        {kind === "cancel" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", display: "block", marginBottom: 6 }}>
              CANCELLATION TIMING
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCancelAtEnd(true)}
                style={{
                  flex: 1, padding: "8px 0", background: cancelAtEnd ? "#ffaa0020" : "#010C18",
                  border: `1px solid ${cancelAtEnd ? "#ffaa00" : "#0d1e2e"}`,
                  borderRadius: 4, color: cancelAtEnd ? "#ffaa00" : "#7a9eb8",
                  fontFamily: "monospace", fontSize: 10, fontWeight: 700, cursor: "pointer",
                }}>
                AT PERIOD END
              </button>
              <button onClick={() => setCancelAtEnd(false)}
                style={{
                  flex: 1, padding: "8px 0", background: !cancelAtEnd ? "#ff334420" : "#010C18",
                  border: `1px solid ${!cancelAtEnd ? "#ff3344" : "#0d1e2e"}`,
                  borderRadius: 4, color: !cancelAtEnd ? "#ff3344" : "#7a9eb8",
                  fontFamily: "monospace", fontSize: 10, fontWeight: 700, cursor: "pointer",
                }}>
                IMMEDIATELY
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", display: "block", marginBottom: 4 }}>
            AUDIT NOTE
          </label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional — defaults to a sensible auto-note."
            rows={2}
            style={{
              width: "100%", background: "#000", border: "1px solid #0d1e2e",
              borderRadius: 4, padding: "8px 10px", color: "#EAF2FF",
              fontFamily: "monospace", fontSize: 11, resize: "vertical", outline: "none",
            }} />
        </div>

        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          style={{
            width: "100%", padding: "10px 14px",
            background: mutation.isPending ? "#0a0f18" : `${color}15`,
            border: `1px solid ${mutation.isPending ? "#1a2a36" : `${color}55`}`,
            borderRadius: 4, color: mutation.isPending ? "#4a6a80" : color,
            fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            cursor: mutation.isPending ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
          {mutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          {kind === "comp"
            ? (hasStripeSub ? `Grant ${days}d comp on existing sub` : `Create ${tier.toUpperCase()} comp for ${days}d`)
            : kind === "extend" ? `Extend by ${Math.min(180, days)}d` :
              cancelAtEnd ? "Cancel at period end" : "Cancel immediately"}
        </button>
      </div>
    </div>
  );
}
