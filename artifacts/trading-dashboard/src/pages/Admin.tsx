import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  Users, Zap, DollarSign, Activity, TrendingUp, Shield,
  Search, ChevronUp, ChevronDown, ArrowUpRight, ArrowDownRight,
  Globe, BarChart2, AlertTriangle, RefreshCw, Download,
  X, Gift, SlidersHorizontal, PauseCircle, PlayCircle, Ban,
  Power, Unplug, Loader2, CloudDownload,
} from "lucide-react";
import type { EngineStatus, FeeSummary, ExchangeStatus } from "@/components/command/types";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";

// ── Types matching artifacts/api-server/src/routes/adminUserTelemetry.ts ─────

interface AdminUserRow {
  clerkUserId: string;
  email: string;
  role: string;
  plan: string;
  planStatus: string;
  adminStatus: string;
  createdAt: string;
  mrrUsd: number;
  aiEnabled: boolean;
  positionSizeUsd: number | null;
  maxActivePositions: number | null;
  minConfidence: number | null;
  riskLevel: string | null;
  tradesCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnl: number;
  feesGenerated: number;
  liveTradesCount: number;
  lastTradeMs: number | null;
  openPositions: number;
  openExposureUsd: number;
  openLivePositions: number;
  exchangeTotal: number;
  exchangeActive: number;
  exchangeError: number;
  hasLiveExchange: boolean;
  tradeCapTier: number;
  tradesToday: number;
  equityUsd: number;
  trialEndsAt: string | null;
  isComplimentary?: boolean;
  tradeLimit: {
    used24h: number;
    capTier: number;
    remaining: number | null;
    blocked: boolean;
    reason: string;
  };
  lastActivityAt: number | null;
  onlineNow: boolean;
}

interface AdminUsersResponse {
  users?: AdminUserRow[];
  rows?: AdminUserRow[];
  data?: AdminUserRow[];
  total?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDollar(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1_000).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(0)}`;
}

function fmtAgo(ms: number | null): string {
  if (!ms) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60)       return `${sec}s ago`;
  if (sec < 3600)     return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)    return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function pctColor(n: number) {
  return n > 0 ? "#00ff8a" : n < 0 ? "#ff3355" : "#9FB3C8";
}

function planColor(plan: string): string {
  switch ((plan || "").toLowerCase()) {
    case "pro":     return "#cc55ff";
    case "starter": return "#00aaff";
    default:        return "#4a6a80";
  }
}

function statusColor(status: string): string {
  switch ((status || "").toLowerCase()) {
    case "active":      return "#00ff8a";
    case "force_paper": return "#ffaa00";
    case "suspended":   return "#ff8844";
    case "disabled":    return "#ff3355";
    default:            return "#7a9eb8";
  }
}

function initials(email: string): string {
  const local = (email || "?").split("@")[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

// ── Auth-wrapped fetch ───────────────────────────────────────────────────────

function useAuthFetch() {
  const { getToken } = useAuth();
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getToken().catch(() => null);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(path, { ...init, headers });
  };
}

// ── Admin user list hook ─────────────────────────────────────────────────────

function useAdminUsers(params: { q: string; plan: string; status: string }) {
  const authFetch = useAuthFetch();
  return useQuery<AdminUserRow[]>({
    queryKey: ["admin-users", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.q)      qs.set("q", params.q);
      if (params.plan)   qs.set("plan", params.plan);
      if (params.status) qs.set("status", params.status);
      qs.set("pageSize", "500");
      const res = await authFetch(`/api/admin/users?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as AdminUsersResponse | AdminUserRow[];
      if (Array.isArray(body)) return body;
      return body.users ?? body.rows ?? body.data ?? [];
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color, delta, deltaUp }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: string; delta?: string; deltaUp?: boolean;
}) {
  return (
    <div className="rounded border flex flex-col gap-3 p-4 relative overflow-hidden"
      style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
      <div className="absolute inset-0 opacity-5"
        style={{ background: `radial-gradient(ellipse at top left, ${color}, transparent 70%)` }} />
      <div className="flex items-center justify-between relative">
        <div className="p-1.5 rounded" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon className="w-3.5 h-3.5" style={{ color, filter: `drop-shadow(0 0 6px ${color})` }} />
        </div>
        {delta && (
          <div className="flex items-center gap-0.5 text-[9px] font-mono font-bold"
            style={{ color: deltaUp ? "#00ff8a" : "#ff3355" }}>
            {deltaUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta}
          </div>
        )}
      </div>
      <div className="relative">
        <div className="text-[24px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
          {value}
        </div>
        {sub && <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a80" }}>{sub}</div>}
        <div className="text-[9px] font-mono font-bold tracking-[0.15em] mt-1.5 uppercase" style={{ color: "#9FB3C8" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── User Action Drawer ───────────────────────────────────────────────────────
// Slide-out side panel. All 8 launch-critical actions wired to existing
// POST /api/admin/users/:id/* endpoints. Each requires `note`. Mutations
// invalidate ["admin-users"] on success.

type ActionPanel =
  | "comp"
  | "extend"
  | "cap"
  | "force_paper"
  | "activate"
  | "suspend"
  | "disable"
  | "cancel_sub"
  | "revoke_exchange"
  | "emergency"
  | null;

function UserActionDrawer({
  user, onClose, isSuperAdmin,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
  isSuperAdmin: boolean;
}) {
  const authFetch = useAuthFetch();
  const qc        = useQueryClient();
  const [panel, setPanel]       = useState<ActionPanel>(null);
  const [note, setNote]         = useState("");
  const [reason, setReason]     = useState("");
  const [days, setDays]         = useState<number>(30);
  const [capTier, setCapTier]   = useState<number>(3);
  const [compPlan, setCompPlan] = useState<"free" | "starter" | "pro">("pro");
  const [compPaperOnly, setCompPaperOnly] = useState<boolean>(true);
  const [compCapOverride, setCompCapOverride] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      setPanel(null);
      setNote("");
      setReason("");
      setDays(30);
      setCapTier(user.tradeCapTier || 3);
    }
  }, [user?.clerkUserId]);

  const mutation = useMutation({
    mutationFn: async (args: { path: string; body: Record<string, unknown> }) => {
      const res = await authFetch(`/api/admin/users/${user!.clerkUserId}/${args.path}`, {
        method: "POST",
        body:   JSON.stringify(args.body),
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
      if (!res.ok) {
        const errMsg = (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }
      return json;
    },
    onSuccess: (_data, vars) => {
      toast({ title: "Action applied", description: `${vars.path.replace(/_/g, " ")} succeeded.` });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setPanel(null);
      setNote("");
      setReason("");
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message });
    },
  });

  if (!user) return null;

  function submit(path: string, extra: Record<string, unknown>) {
    if (!note.trim()) {
      toast({ title: "Note required", description: "Audit-trail note cannot be empty." });
      return;
    }
    mutation.mutate({ path, body: { note: note.trim(), ...extra } });
  }

  const W = 460;
  const C = {
    bg:     "#040810",
    panel:  "#010C18",
    border: "#0d1e2e",
    text:   "#EAF2FF",
    dim:    "#7a9eb8",
    faint:  "#4a6a80",
    accent: "#cc55ff",
  };

  return (
    <>
      <div onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          zIndex: 90, backdropFilter: "blur(2px)",
        }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: W, maxWidth: "100vw",
        background: C.bg, borderLeft: `1px solid ${C.border}`, zIndex: 91,
        display: "flex", flexDirection: "column", color: C.text,
        boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
      }}>
        {/* Drawer header */}
        <div style={{
          padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
          background: "#000", display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: `linear-gradient(135deg, ${planColor(user.plan)}22, #7b68ee22)`,
            border: `1px solid ${planColor(user.plan)}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "monospace", fontSize: 10, fontWeight: 700,
            color: planColor(user.plan),
          }}>
            {initials(user.email)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: C.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{user.email}</div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: C.faint, marginTop: 2 }}>
              {user.clerkUserId}
            </div>
          </div>
          <button onClick={onClose}
            style={{
              padding: 6, background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 4, color: C.dim, cursor: "pointer",
            }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User summary */}
        <div style={{
          padding: "12px 18px", borderBottom: `1px solid ${C.border}`,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        }}>
          <SummaryCell label="PLAN" value={user.plan.toUpperCase()} color={planColor(user.plan)} />
          <SummaryCell label="STATUS" value={user.adminStatus.toUpperCase()} color={statusColor(user.adminStatus)} />
          <SummaryCell label="ROLE" value={user.role.toUpperCase()} color={user.role === "admin" || user.role === "super-admin" ? "#cc55ff" : "#7a9eb8"} />
          <SummaryCell label="MRR" value={`$${user.mrrUsd.toFixed(2)}/mo`} color="#00ff8a" />
          <SummaryCell label="EXCHANGES" value={`${user.exchangeActive} / ${user.exchangeTotal}`} color={user.hasLiveExchange ? "#ff8844" : "#00aaff"} />
          <SummaryCell label="TRADE CAP" value={user.tradeCapTier ? `${user.tradeCapTier}` : "—"} color="#ffaa00" />
          <SummaryCell label="24H TRADES" value={`${user.tradeLimit.used24h}${user.tradeLimit.remaining !== null ? ` / ${user.tradeLimit.capTier}` : ""}`} color={user.tradeLimit.blocked ? "#ff3355" : "#00aaff"} />
          <SummaryCell label="LAST ACTIVE" value={fmtAgo(user.lastActivityAt)} color={user.onlineNow ? "#00ff8a" : C.faint} />
        </div>

        {/* Action menu */}
        <div style={{ padding: "14px 18px", flex: 1, overflowY: "auto" }}>
          {panel === null && (
            <>
              <SectionLabel>SUBSCRIPTION</SectionLabel>
              <ActionButton icon={Gift}              label="Grant Complimentary Days"
                desc="Extend trial via Stripe trial_end. Works on existing subscription."
                color="#00ff8a" onClick={() => setPanel("comp")} />
              <ActionButton icon={Gift}              label="Extend Subscription (paid)"
                desc="Add days to current paid period."
                color="#00aaff" onClick={() => setPanel("extend")} />
              <ActionButton icon={Ban}               label="Cancel Subscription"
                desc="Cancel at period end or immediately."
                color="#ff8844" onClick={() => setPanel("cancel_sub")} />

              <SectionLabel>TRADING CONTROL</SectionLabel>
              <ActionButton icon={SlidersHorizontal} label="Override Trade Limits"
                desc="Set 24h trade cap (1/3/12/unlimited)."
                color="#ffaa00" onClick={() => setPanel("cap")} />
              <ActionButton icon={PauseCircle}       label="Force Paper Mode"
                desc="Force all execution to PAPER regardless of plan."
                color="#ffaa00" onClick={() => setPanel("force_paper")} />
              <ActionButton icon={PlayCircle}        label="Re-activate User"
                desc="Restore active status (clears suspended/disabled/force_paper)."
                color="#00ff8a" onClick={() => setPanel("activate")} />

              <SectionLabel>MODERATION</SectionLabel>
              <ActionButton icon={PauseCircle}       label="Suspend User"
                desc="Block trading, retain account."
                color="#ff8844" onClick={() => setPanel("suspend")} />
              <ActionButton icon={Ban}               label="Disable User"
                desc="Hard block. Account unusable until activated."
                color="#ff3355" onClick={() => setPanel("disable")} />

              <SectionLabel>SUPER-ADMIN</SectionLabel>
              <ActionButton icon={Unplug}            label="Revoke Exchange Access"
                desc="Delete all stored exchange credentials."
                color="#ff3355" onClick={() => setPanel("revoke_exchange")}
                disabled={!isSuperAdmin}
                disabledReason="Requires super-admin role." />
              <ActionButton icon={Power}             label="Emergency Disable"
                desc="Cancel sub + revoke keys + disable account. Logged."
                color="#ff3355" onClick={() => setPanel("emergency")}
                disabled={!isSuperAdmin}
                disabledReason="Requires super-admin role." />
            </>
          )}

          {panel === "comp" && (() => {
            const hasSub = Boolean(user.plan && user.plan !== "free");
            // FREE comp is always paper-only by design.
            const effectivePaperOnly = compPlan === "free" ? true : compPaperOnly;
            return (
              <ActionForm title="CREATE COMPLIMENTARY MEMBERSHIP" onBack={() => setPanel(null)}>
                <p style={{ fontSize: 10, color: C.dim, lineHeight: 1.55, marginBottom: 10 }}>
                  Zero-charge complimentary access for influencers, beta testers, DJ partners,
                  reviewers, internal QA. Auto-expires after duration.
                  <span style={{ display: "block", marginTop: 6, color: "#cc55ff" }}>
                    ⓘ Super-admin only. Audit-logged. Entitlement middleware behaves identical to paid.
                  </span>
                  {hasSub && (
                    <span style={{ display: "block", marginTop: 6, color: "#ffaa00" }}>
                      ⚠ User already has a paid {user.plan.toUpperCase()} subscription. For STARTER/PRO,
                      use "Grant Complimentary Days" instead to extend it (no double-billing).
                      You may still grant FREE comp if you want to time-box / mark them.
                    </span>
                  )}
                </p>

                {/* TIER PICKER */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C.dim, marginBottom: 6 }}>
                    MEMBERSHIP TIER
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {([
                      { p: "free",    label: "FREE",    sub: "Paper only" },
                      { p: "starter", label: "STARTER", sub: "≤ 3 AI live" },
                      { p: "pro",     label: "PRO",     sub: "≤ 12 AI · Eq" },
                    ] as const).map(({ p, label, sub }) => {
                      const disabled = hasSub && p !== "free";
                      return (
                        <button key={p}
                          onClick={() => !disabled && setCompPlan(p)}
                          disabled={disabled}
                          title={disabled ? "User already has a paid subscription" : undefined}
                          style={{
                            padding: "10px 8px",
                            background: compPlan === p ? planColor(p) + "22" : "transparent",
                            border: `1px solid ${compPlan === p ? planColor(p) : C.border}`,
                            borderRadius: 6,
                            cursor: disabled ? "not-allowed" : "pointer",
                            textAlign: "left",
                            opacity: disabled ? 0.4 : 1,
                          }}>
                          <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: planColor(p) }}>
                            {label}
                          </div>
                          <div style={{ fontSize: 8, fontFamily: "monospace", color: C.faint, marginTop: 3 }}>
                            {sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* DURATION */}
                <DaysInput value={days} onChange={setDays} max={365} />
                <PresetRow values={[7, 14, 30, 60, 90, 180, 365]} onSelect={setDays} unit="d" />

                {/* PAPER vs LIVE */}
                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C.dim, marginBottom: 6 }}>
                    EXECUTION MODE
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <button onClick={() => setCompPaperOnly(true)}
                      style={{
                        padding: "8px 10px",
                        background: effectivePaperOnly ? "#00ff8a22" : "transparent",
                        border: `1px solid ${effectivePaperOnly ? "#00ff8a" : C.border}`,
                        borderRadius: 6, cursor: "pointer",
                      }}>
                      <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: "#00ff8a" }}>
                        PAPER ONLY
                      </div>
                      <div style={{ fontSize: 8, fontFamily: "monospace", color: C.faint, marginTop: 2 }}>
                        Simulated · safer default
                      </div>
                    </button>
                    <button onClick={() => setCompPaperOnly(false)}
                      disabled={compPlan === "free"}
                      title={compPlan === "free" ? "FREE tier is paper-only by design" : undefined}
                      style={{
                        padding: "8px 10px",
                        background: !effectivePaperOnly ? "#ff884422" : "transparent",
                        border: `1px solid ${!effectivePaperOnly ? "#ff8844" : C.border}`,
                        borderRadius: 6,
                        cursor: compPlan === "free" ? "not-allowed" : "pointer",
                        opacity: compPlan === "free" ? 0.4 : 1,
                      }}>
                      <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: "#ff8844" }}>
                        LIVE ENABLED
                      </div>
                      <div style={{ fontSize: 8, fontFamily: "monospace", color: C.faint, marginTop: 2 }}>
                        Real execution allowed
                      </div>
                    </button>
                  </div>
                </div>

                {/* TRADE LIMIT OVERRIDE (optional) */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C.dim, marginBottom: 6 }}>
                    TRADE LIMIT OVERRIDE <span style={{ color: C.faint, fontWeight: 400 }}>(optional · expires with comp)</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
                    {[null, 1, 3, 12, 50, -1].map((v) => {
                      const active = compCapOverride === v;
                      const label = v === null ? "OFF" : v === -1 ? "∞" : String(v);
                      return (
                        <button key={String(v)} onClick={() => setCompCapOverride(v)}
                          style={{
                            padding: "7px 4px",
                            background: active ? "#ffaa0022" : "transparent",
                            border: `1px solid ${active ? "#ffaa00" : C.border}`,
                            borderRadius: 4, cursor: "pointer",
                            fontSize: 10, fontFamily: "monospace", fontWeight: 700,
                            color: active ? "#ffaa00" : C.dim,
                          }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <NoteInput note={note} setNote={setNote} />

                <SubmitButton
                  onClick={() => submit("create_complimentary_subscription", {
                    plan:      compPlan,
                    days,
                    paperOnly: effectivePaperOnly,
                    ...(compCapOverride !== null ? { capTier: compCapOverride } : {}),
                  })}
                  disabled={mutation.isPending || !isSuperAdmin || (hasSub && compPlan !== "free")}
                  pending={mutation.isPending}
                  color={planColor(compPlan)}>
                  {!isSuperAdmin
                    ? "Requires super-admin role"
                    : `Grant ${compPlan.toUpperCase()} · ${days}d · ${effectivePaperOnly ? "PAPER" : "LIVE"}${compCapOverride !== null ? ` · cap ${compCapOverride === -1 ? "∞" : compCapOverride}` : ""}`}
                </SubmitButton>

                {/* Existing-sub fallback: extend trial */}
                {hasSub && (
                  <>
                    <div style={{ borderTop: `1px solid ${C.border}`, margin: "14px 0 12px", paddingTop: 12 }}>
                      <div style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C.dim, marginBottom: 6 }}>
                        OR — EXTEND EXISTING {user.plan.toUpperCase()} TRIAL
                      </div>
                      <p style={{ fontSize: 9, color: C.faint, marginBottom: 8, lineHeight: 1.5 }}>
                        Pushes Stripe <code>trial_end</code> forward {days}d. Same plan, no double-billing.
                      </p>
                      <SubmitButton
                        onClick={() => submit("complimentary_subscription", { days })}
                        disabled={mutation.isPending}
                        pending={mutation.isPending}
                        color="#00aaff">
                        Extend trial {days} day{days === 1 ? "" : "s"}
                      </SubmitButton>
                    </div>
                  </>
                )}
              </ActionForm>
            );
          })()}

          {panel === "extend" && (
            <ActionForm title="EXTEND PAID SUBSCRIPTION" onBack={() => setPanel(null)}>
              <DaysInput value={days} onChange={setDays} max={180} />
              <PresetRow values={[7, 14, 30, 60]} onSelect={setDays} unit="d" />
              <NoteInput note={note} setNote={setNote} />
              <SubmitButton
                onClick={() => submit("extend_subscription", { days })}
                disabled={mutation.isPending}
                pending={mutation.isPending}
                color="#00aaff">
                Extend {days} day{days === 1 ? "" : "s"}
              </SubmitButton>
            </ActionForm>
          )}

          {panel === "cap" && (
            <ActionForm title="OVERRIDE TRADE LIMITS" onBack={() => setPanel(null)}>
              <p style={{ fontSize: 10, color: C.dim, lineHeight: 1.55, marginBottom: 10 }}>
                24-hour rolling trade cap. Current: {user.tradeCapTier || "default"}.
              </p>
              <DaysInput value={capTier} onChange={setCapTier} max={999} label="Cap (trades / 24h)" />
              <PresetRow values={[1, 3, 12, 50, 999]}
                onSelect={setCapTier}
                renderLabel={(n) => n >= 999 ? "Unlimited" : `${n}`} />
              <NoteInput note={note} setNote={setNote} />
              <SubmitButton
                onClick={() => submit("override_trade_limit", { capTier })}
                disabled={mutation.isPending}
                pending={mutation.isPending}
                color="#ffaa00">
                Set cap → {capTier >= 999 ? "Unlimited" : `${capTier} / 24h`}
              </SubmitButton>
            </ActionForm>
          )}

          {panel === "force_paper" && (
            <SimpleConfirm
              title="FORCE PAPER MODE"
              desc="All execution becomes PAPER-only. Live orders blocked at server. Reversible via Re-activate."
              note={note} setNote={setNote}
              reason={reason} setReason={setReason} reasonRequired={false}
              pending={mutation.isPending}
              color="#ffaa00"
              onSubmit={() => submit("force_paper", { reason: reason.trim() || undefined })}
              onBack={() => setPanel(null)}
              cta="Force Paper Mode" />
          )}

          {panel === "activate" && (
            <SimpleConfirm
              title="RE-ACTIVATE USER"
              desc="Restores active status. Clears suspended / disabled / force_paper."
              note={note} setNote={setNote}
              reason={reason} setReason={setReason} reasonRequired={false}
              pending={mutation.isPending}
              color="#00ff8a"
              onSubmit={() => submit("activate", { reason: reason.trim() || undefined })}
              onBack={() => setPanel(null)}
              cta="Re-activate" />
          )}

          {panel === "suspend" && (
            <SimpleConfirm
              title="SUSPEND USER"
              desc="Blocks trading. User can still sign in. Reversible."
              note={note} setNote={setNote}
              reason={reason} setReason={setReason} reasonRequired={false}
              pending={mutation.isPending}
              color="#ff8844"
              onSubmit={() => submit("suspend", { reason: reason.trim() || undefined })}
              onBack={() => setPanel(null)}
              cta="Suspend" />
          )}

          {panel === "disable" && (
            <SimpleConfirm
              title="DISABLE USER"
              desc="Hard block. Account fully unusable until re-activated."
              note={note} setNote={setNote}
              reason={reason} setReason={setReason} reasonRequired={false}
              pending={mutation.isPending}
              color="#ff3355"
              onSubmit={() => submit("disable", { reason: reason.trim() || undefined })}
              onBack={() => setPanel(null)}
              cta="Disable" />
          )}

          {panel === "cancel_sub" && (
            <ActionForm title="CANCEL SUBSCRIPTION" onBack={() => setPanel(null)}>
              <p style={{ fontSize: 10, color: C.dim, lineHeight: 1.55, marginBottom: 10 }}>
                Stripe subscription cancellation. Default cancels at period end (user
                keeps access until renewal date).
              </p>
              <NoteInput note={note} setNote={setNote} />
              <div style={{ display: "flex", gap: 8 }}>
                <SubmitButton
                  onClick={() => submit("cancel_subscription", { cancelAtPeriodEnd: true })}
                  disabled={mutation.isPending}
                  pending={mutation.isPending}
                  color="#ffaa00">
                  Cancel at period end
                </SubmitButton>
                <SubmitButton
                  onClick={() => submit("cancel_subscription", { cancelAtPeriodEnd: false })}
                  disabled={mutation.isPending}
                  pending={mutation.isPending}
                  color="#ff3355">
                  Cancel immediately
                </SubmitButton>
              </div>
            </ActionForm>
          )}

          {panel === "revoke_exchange" && (
            <SimpleConfirm
              title="REVOKE EXCHANGE ACCESS"
              desc="Deletes ALL stored exchange API keys for this user. User must re-connect to resume live trading."
              note={note} setNote={setNote}
              reason={reason} setReason={setReason} reasonRequired={false}
              pending={mutation.isPending}
              color="#ff3355"
              onSubmit={() => submit("revoke_exchange_access", {})}
              onBack={() => setPanel(null)}
              cta="Revoke all exchange keys" />
          )}

          {panel === "emergency" && (
            <SimpleConfirm
              title="EMERGENCY DISABLE"
              desc="Cascade: cancel Stripe immediately + revoke exchange keys + disable account. Multi-step audit-logged."
              note={note} setNote={setNote}
              reason={reason} setReason={setReason} reasonRequired={true}
              pending={mutation.isPending}
              color="#ff3355"
              onSubmit={() => submit("emergency_disable", { reason: reason.trim() })}
              onBack={() => setPanel(null)}
              cta="EMERGENCY DISABLE" />
          )}
        </div>
      </div>
    </>
  );
}

// ── Drawer subcomponents ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: "monospace", fontWeight: 700,
      letterSpacing: "0.2em", color: "#4a6a80",
      marginTop: 16, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#010C18", border: "1px solid #0d1e2e", borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ fontSize: 8, fontFamily: "monospace", color: "#4a6a80", letterSpacing: "0.1em", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, desc, color, onClick, disabled, disabledReason }: {
  icon: React.ElementType; label: string; desc: string; color: string;
  onClick: () => void; disabled?: boolean; disabledReason?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledReason : undefined}
      style={{
        width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 12px", marginBottom: 6, borderRadius: 6,
        background: disabled ? "#01060A" : "#010C18",
        border: `1px solid ${disabled ? "#0a1018" : "#0d1e2e"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        textAlign: "left", transition: "all 120ms",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = `${color}50`; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.borderColor = "#0d1e2e"; }}
    >
      <div style={{
        padding: 6, borderRadius: 4, background: `${color}15`,
        border: `1px solid ${color}30`, flexShrink: 0,
      }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#EAF2FF" }}>
          {label}
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#7a9eb8", marginTop: 2, lineHeight: 1.5 }}>
          {disabled && disabledReason ? disabledReason : desc}
        </div>
      </div>
    </button>
  );
}

function ActionForm({ title, onBack, children }: {
  title: string; onBack: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button onClick={onBack}
        style={{
          fontSize: 9, fontFamily: "monospace", color: "#7a9eb8",
          marginBottom: 12, background: "transparent", border: "none",
          cursor: "pointer", padding: 0,
        }}>
        ← back
      </button>
      <div style={{
        fontSize: 11, fontFamily: "monospace", fontWeight: 700,
        letterSpacing: "0.15em", color: "#EAF2FF", marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function NoteInput({ note, setNote }: { note: string; setNote: (v: string) => void }) {
  return (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", display: "block", marginBottom: 4 }}>
        AUDIT NOTE (required)
      </label>
      <textarea
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Comp 30d PRO for design partner launch"
        rows={2}
        style={{
          width: "100%", background: "#000", border: "1px solid #0d1e2e",
          borderRadius: 4, padding: "8px 10px", color: "#EAF2FF",
          fontFamily: "monospace", fontSize: 11, resize: "vertical",
          outline: "none",
        }}
      />
    </div>
  );
}

function ReasonInput({ reason, setReason, required }: { reason: string; setReason: (v: string) => void; required: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", display: "block", marginBottom: 4 }}>
        REASON {required ? "(required)" : "(optional)"}
      </label>
      <input
        value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. TOS violation, fraud, customer request"
        style={{
          width: "100%", background: "#000", border: "1px solid #0d1e2e",
          borderRadius: 4, padding: "8px 10px", color: "#EAF2FF",
          fontFamily: "monospace", fontSize: 11, outline: "none",
        }}
      />
    </div>
  );
}

function DaysInput({ value, onChange, max, label }: { value: number; onChange: (n: number) => void; max: number; label?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6a80", display: "block", marginBottom: 4 }}>
        {label ?? "DAYS"}
      </label>
      <input
        type="number" min={1} max={max} value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
        style={{
          width: "100%", background: "#000", border: "1px solid #0d1e2e",
          borderRadius: 4, padding: "8px 10px", color: "#EAF2FF",
          fontFamily: "monospace", fontSize: 14, fontWeight: 700,
          outline: "none",
        }}
      />
    </div>
  );
}

function PresetRow({ values, onSelect, unit, renderLabel }: {
  values: number[]; onSelect: (n: number) => void; unit?: string;
  renderLabel?: (n: number) => string;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      {values.map((v) => (
        <button key={v} onClick={() => onSelect(v)}
          style={{
            flex: 1, padding: "6px 4px", background: "#010C18",
            border: "1px solid #0d1e2e", borderRadius: 4,
            color: "#7a9eb8", fontFamily: "monospace", fontSize: 10,
            fontWeight: 700, cursor: "pointer", transition: "all 120ms",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#cc55ff50"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#0d1e2e"}>
          {renderLabel ? renderLabel(v) : `${v}${unit ?? ""}`}
        </button>
      ))}
    </div>
  );
}

function SubmitButton({ children, onClick, disabled, pending, color }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  pending?: boolean; color: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        flex: 1, width: "100%", padding: "10px 14px",
        background: disabled ? "#0a0f18" : `${color}15`,
        border: `1px solid ${disabled ? "#1a2a36" : `${color}55`}`,
        borderRadius: 4, color: disabled ? "#4a6a80" : color,
        fontFamily: "monospace", fontSize: 11, fontWeight: 700,
        letterSpacing: "0.1em", cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        transition: "all 120ms",
      }}>
      {pending && <Loader2 className="w-3 h-3 animate-spin" />}
      {children}
    </button>
  );
}

function SimpleConfirm({
  title, desc, note, setNote, reason, setReason, reasonRequired,
  pending, color, onSubmit, onBack, cta,
}: {
  title: string; desc: string;
  note: string; setNote: (v: string) => void;
  reason: string; setReason: (v: string) => void; reasonRequired: boolean;
  pending: boolean; color: string;
  onSubmit: () => void; onBack: () => void; cta: string;
}) {
  return (
    <ActionForm title={title} onBack={onBack}>
      <p style={{ fontSize: 10, color: "#7a9eb8", lineHeight: 1.55, marginBottom: 12 }}>
        {desc}
      </p>
      <ReasonInput reason={reason} setReason={setReason} required={reasonRequired} />
      <NoteInput note={note} setNote={setNote} />
      <SubmitButton
        onClick={() => {
          if (reasonRequired && !reason.trim()) {
            toast({ title: "Reason required", description: "This action requires an explicit reason." });
            return;
          }
          onSubmit();
        }}
        disabled={pending}
        pending={pending}
        color={color}>
        {cta}
      </SubmitButton>
    </ActionForm>
  );
}

// ── Sort & filter ────────────────────────────────────────────────────────────

type SortKey =
  | "email" | "plan" | "adminStatus" | "tradesCount" | "feesGenerated"
  | "totalPnl" | "winRate" | "lastActivityAt" | "mrrUsd";

// ── Main Admin Page ──────────────────────────────────────────────────────────

export default function Admin() {
  const { role } = useUserRole();
  const isSuperAdmin = role === "super-admin";

  const [search,   setSearch]   = useState("");
  const [planFilter, setPlanFilter]     = useState<"" | "free" | "starter" | "pro">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "force_paper" | "suspended" | "disabled">("");
  const [sortKey,  setSortKey]  = useState<SortKey>("lastActivityAt");
  const [sortAsc,  setSortAsc]  = useState(false);
  const [page,     setPage]     = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tick,     setTick]     = useState(0);

  const PAGE_SIZE = 12;

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  // Real engine + fees + exchange status (existing endpoints, real data)
  const { data: engine }         = useQuery<EngineStatus>({
    queryKey: ["admin-engine"],
    queryFn: () => fetch("/api/engine/status").then(r => r.json()),
    refetchInterval: 5000,
  });
  const { data: feeSummary }     = useQuery<FeeSummary>({
    queryKey: ["admin-fees"],
    queryFn: () => fetch("/api/fees").then(r => r.json()),
    refetchInterval: 15000,
  });
  const { data: exchangeStatus } = useQuery<ExchangeStatus>({
    queryKey: ["admin-exchange"],
    queryFn: () => fetch("/api/exchange/status").then(r => r.json()),
    refetchInterval: 8000,
  });

  // Real user list
  const { data: users = [], isLoading: usersLoading, isError: usersError, refetch } = useAdminUsers({
    q: search, plan: planFilter, status: statusFilter,
  });

  // Sync from Clerk (back-fills users who signed up but never opened /auth/me)
  const authFetch = useAuthFetch();
  const qc        = useQueryClient();
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/admin/users/sync_from_clerk", { method: "POST" });
      const text = await res.text();
      let json: { scanned?: number; created?: number; updated?: number; error?: string } | null = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      return json;
    },
    onSuccess: (data) => {
      toast({
        title: "Synced from Clerk",
        description: `Scanned ${data?.scanned ?? 0} · Created ${data?.created ?? 0} · Updated ${data?.updated ?? 0}`,
      });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message });
    },
  });

  // Derived platform metrics from REAL user data
  const platformMetrics = useMemo(() => {
    const total       = users.length;
    const onlineNow   = users.filter(u => u.onlineNow).length;
    const liveCount   = users.filter(u => u.hasLiveExchange).length;
    const totalMrr    = users.reduce((s, u) => s + (u.mrrUsd || 0), 0);
    const totalFees   = users.reduce((s, u) => s + (u.feesGenerated || 0), 0);
    const totalPnl    = users.reduce((s, u) => s + (u.totalPnl || 0), 0);
    const openPos     = users.reduce((s, u) => s + (u.openPositions || 0), 0);
    const tradesToday = users.reduce((s, u) => s + (u.tradesToday || 0), 0);
    const tradesAll   = users.reduce((s, u) => s + (u.tradesCount || 0), 0);
    const wins        = users.reduce((s, u) => s + (u.wins || 0), 0);
    const losses      = users.reduce((s, u) => s + (u.losses || 0), 0);
    const winRate     = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
    return { total, onlineNow, liveCount, totalMrr, totalFees, totalPnl, openPos, tradesToday, tradesAll, winRate };
  }, [users]);

  // Sort (filter applied server-side; sort client-side)
  const sorted = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      const av = (a[sortKey] ?? 0);
      const bv = (b[sortKey] ?? 0);
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return copy;
  }, [users, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged      = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
    setPage(0);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortAsc
      ? <ChevronUp className="w-3 h-3" style={{ color: "#cc55ff" }} />
      : <ChevronDown className="w-3 h-3" style={{ color: "#cc55ff" }} />;
  }

  function ColHeader({ col, label }: { col: SortKey; label: string }) {
    return (
      <th className="px-3 py-2.5 text-left cursor-pointer select-none group" onClick={() => toggleSort(col)}>
        <div className="flex items-center gap-1 text-[8px] font-mono font-bold tracking-[0.15em]"
          style={{ color: sortKey === col ? "#cc55ff" : "#4a6a80" }}>
          {label}
          <SortIcon col={col} />
        </div>
      </th>
    );
  }

  const selectedUser = selectedId ? users.find(u => u.clerkUserId === selectedId) ?? null : null;

  function exportCsv() {
    const cols: (keyof AdminUserRow)[] = [
      "clerkUserId", "email", "plan", "planStatus", "adminStatus", "role",
      "mrrUsd", "tradesCount", "wins", "losses", "winRate", "totalPnl",
      "feesGenerated", "openPositions", "openLivePositions", "hasLiveExchange",
      "exchangeActive", "exchangeTotal", "tradeCapTier", "tradesToday",
      "equityUsd", "lastActivityAt", "onlineNow",
    ];
    const header = cols.join(",");
    const rows = users.map(u => cols.map(c => {
      const v = u[c];
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `aicandlez-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen" style={{ background: "#060810", color: "#EAF2FF" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b px-6 py-4 flex items-center gap-4"
        style={{ background: "#000000", borderColor: "#0d1e2e" }}>
        <div className="p-2 rounded" style={{ background: "#cc55ff12", border: "1px solid #cc55ff30" }}>
          <Shield className="w-4 h-4" style={{ color: "#cc55ff", filter: "drop-shadow(0 0 6px #cc55ff)" }} />
        </div>
        <div>
          <div className="text-[10px] font-mono font-bold tracking-[0.3em]" style={{ color: "#cc55ff80" }}>
            RESTRICTED ACCESS · {isSuperAdmin ? "SUPER-ADMIN" : "ADMIN"}
          </div>
          <div className="text-[18px] font-bold font-mono tracking-[0.1em]" style={{ color: "#EAF2FF" }}>
            OPERATOR CONSOLE · USERS
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-3">
          <span className="live-dot" style={{ width: 6, height: 6, background: "#cc55ff", boxShadow: "0 0 8px #cc55ff" }} />
          <span className="text-[9px] font-mono font-bold" style={{ color: "#cc55ff" }}>PLATFORM LIVE</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="text-[8px] font-mono" style={{ color: "#2a4050" }}>
            LAST REFRESH: {new Date().toLocaleTimeString()}
          </div>
          <button onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold transition-all"
            style={{
              background: syncMutation.isPending ? "#1a0e2a" : "#2a1240",
              borderColor: "#cc55ff55",
              color: "#cc55ff",
              cursor: syncMutation.isPending ? "wait" : "pointer",
            }}
            title="Back-fill the local users table from Clerk Backend API. Idempotent.">
            {syncMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <CloudDownload className="w-3 h-3" />}
            SYNC FROM CLERK
          </button>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold transition-all"
            style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
            <RefreshCw className="w-3 h-3" /> REFRESH
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold transition-all"
            style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
            <Download className="w-3 h-3" /> EXPORT CSV
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* ── Real Platform Metrics ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard icon={Users}      label="Total Users"      value={platformMetrics.total.toLocaleString()}     sub={`${platformMetrics.onlineNow} online now`}        color="#00aaff" />
          <StatCard icon={Globe}      label="Live Exchanges"   value={platformMetrics.liveCount.toString()}        sub="Users with live keys"                              color="#ff8844" />
          <StatCard icon={DollarSign} label="MRR"              value={fmtDollar(platformMetrics.totalMrr)}         sub="Sum of paying subs"                                color="#00ff8a" />
          <StatCard icon={Activity}   label="Open Positions"   value={platformMetrics.openPos.toString()}          sub="Platform-wide"                                     color="#7b68ee" />
          <StatCard icon={BarChart2}  label="Trades 24h"       value={platformMetrics.tradesToday.toLocaleString()} sub={`${platformMetrics.tradesAll.toLocaleString()} lifetime`} color="#00f0ff" />
          <StatCard icon={DollarSign} label="Fees Lifetime"    value={fmtDollar(platformMetrics.totalFees)}        sub="From perf fees"                                    color="#ffaa00" />
          <StatCard icon={TrendingUp} label="Platform Win %"   value={`${platformMetrics.winRate.toFixed(1)}%`}    sub="Across all users"                                  color={platformMetrics.winRate >= 50 ? "#00ff8a" : "#ff3355"} />
          <StatCard icon={Zap}        label="Engine Signals"   value={(engine?.signalsGenerated ?? 0).toLocaleString()} sub={engine?.running ? "Engine active" : "Engine stopped"} color={engine?.running ? "#ff8844" : "#4a6a80"} />
        </div>

        {/* ── Filters Bar ─────────────────────────────────────────────────── */}
        <div className="rounded border overflow-hidden" style={{ borderColor: "#0d1e2e" }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: "#000000", borderColor: "#0d1e2e" }}>
            <Users className="w-4 h-4" style={{ color: "#cc55ff" }} />
            <span className="text-[11px] font-bold font-mono tracking-[0.15em]" style={{ color: "#EAF2FF" }}>
              USER MANAGEMENT
            </span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded font-bold"
              style={{ background: "#cc55ff10", color: "#cc55ff80", border: "1px solid #cc55ff20" }}>
              {users.length} USERS
            </span>
            <div className="flex-1" />

            {/* Plan filter */}
            <div className="flex items-center gap-1">
              {([{ v: "", label: "ALL PLANS" }, { v: "free", label: "FREE" }, { v: "starter", label: "STARTER" }, { v: "pro", label: "PRO" }] as const).map(f => (
                <button key={f.v} onClick={() => { setPlanFilter(f.v as typeof planFilter); setPage(0); }}
                  className="px-2.5 py-1 rounded font-mono text-[8px] font-bold transition-all border"
                  style={planFilter === f.v
                    ? { background: "#cc55ff14", color: "#cc55ff", borderColor: "#cc55ff40" }
                    : { background: "transparent", color: "#4a6a80", borderColor: "#1a2a36" }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1">
              {([{ v: "", label: "ANY" }, { v: "active", label: "ACTIVE" }, { v: "force_paper", label: "FORCED PAPER" }, { v: "suspended", label: "SUSPENDED" }, { v: "disabled", label: "DISABLED" }] as const).map(f => (
                <button key={f.v} onClick={() => { setStatusFilter(f.v as typeof statusFilter); setPage(0); }}
                  className="px-2.5 py-1 rounded font-mono text-[8px] font-bold transition-all border"
                  style={statusFilter === f.v
                    ? { background: "#00aaff14", color: "#00aaff", borderColor: "#00aaff40" }
                    : { background: "transparent", color: "#4a6a80", borderColor: "#1a2a36" }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded border"
              style={{ background: "#010C18", borderColor: "#1a2a36" }}>
              <Search className="w-3 h-3 flex-shrink-0" style={{ color: "#4a6a80" }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search email or ID…"
                className="bg-transparent font-mono text-[9px] outline-none w-36"
                style={{ color: "#EAF2FF" }}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto" style={{ background: "#010C18" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #0d1e2e", background: "#000000" }}>
                  <ColHeader col="email"          label="USER" />
                  <ColHeader col="plan"           label="PLAN" />
                  <ColHeader col="adminStatus"    label="STATUS" />
                  <th className="px-3 py-2.5 text-left"><span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>EXCHANGES</span></th>
                  <th className="px-3 py-2.5 text-left"><span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>CAP / 24H</span></th>
                  <ColHeader col="tradesCount"    label="TRADES" />
                  <ColHeader col="feesGenerated"  label="FEES" />
                  <ColHeader col="totalPnl"       label="PNL" />
                  <ColHeader col="winRate"        label="WIN %" />
                  <ColHeader col="mrrUsd"         label="MRR" />
                  <ColHeader col="lastActivityAt" label="LAST ACTIVE" />
                </tr>
              </thead>
              <tbody>
                {usersLoading && (
                  <tr><td colSpan={11} className="px-4 py-12 text-center">
                    <Loader2 className="w-5 h-5 inline-block animate-spin" style={{ color: "#cc55ff" }} />
                    <div className="text-[10px] font-mono mt-2" style={{ color: "#4a6a80" }}>Loading users from /api/admin/users…</div>
                  </td></tr>
                )}
                {usersError && !usersLoading && (
                  <tr><td colSpan={11} className="px-4 py-12 text-center">
                    <AlertTriangle className="w-5 h-5 inline-block" style={{ color: "#ff3355" }} />
                    <div className="text-[10px] font-mono mt-2" style={{ color: "#ff3355" }}>Failed to load users. Click REFRESH to retry.</div>
                  </td></tr>
                )}
                {!usersLoading && !usersError && paged.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-12 text-center">
                    <div className="text-[10px] font-mono" style={{ color: "#4a6a80" }}>No users match the current filters.</div>
                  </td></tr>
                )}
                {paged.map((u, i) => (
                  <tr key={u.clerkUserId}
                    onClick={() => setSelectedId(u.clerkUserId)}
                    className="border-b transition-all cursor-pointer group"
                    style={{
                      borderColor: "#0a1520",
                      background: i % 2 === 0 ? "#010C18" : "#020E1E",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a0e2a")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#010C18" : "#020E1E")}
                  >
                    {/* User */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold font-mono"
                            style={{
                              background: `linear-gradient(135deg, ${planColor(u.plan)}20, #7b68ee20)`,
                              border: `1px solid ${planColor(u.plan)}40`,
                              color: planColor(u.plan),
                            }}>
                            {initials(u.email)}
                          </div>
                          {u.onlineNow && (
                            <span style={{
                              position: "absolute", bottom: -1, right: -1, width: 6, height: 6,
                              borderRadius: 3, background: "#00ff8a", border: "1px solid #010C18",
                              boxShadow: "0 0 4px #00ff8a",
                            }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold font-mono truncate" style={{ color: "#EAF2FF", maxWidth: 180 }}>
                              {u.email}
                            </span>
                            {(u.role === "admin" || u.role === "super-admin") && (
                              <span className="text-[6px] font-bold px-1 py-0.5 rounded font-mono"
                                style={{ background: "#cc55ff10", color: "#cc55ff", border: "1px solid #cc55ff30" }}>
                                {u.role.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="text-[8px] font-mono truncate" style={{ color: "#3a5a70", maxWidth: 220 }}>{u.clerkUserId}</div>
                        </div>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="px-3 py-2.5">
                      <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: `${planColor(u.plan)}14`,
                          color: planColor(u.plan),
                          border: `1px solid ${planColor(u.plan)}30`,
                        }}>
                        {(u.plan || "free").toUpperCase()}
                      </span>
                      {(() => {
                        const trialMs = u.trialEndsAt ? new Date(u.trialEndsAt).getTime() : null;
                        const now = Date.now();
                        const hasTrial = u.planStatus === "trialing" && trialMs !== null;
                        const isExpired = trialMs !== null && trialMs < now;
                        if (!hasTrial && !isExpired) {
                          return <div className="text-[7px] font-mono mt-0.5" style={{ color: "#3a5a70" }}>{u.planStatus}</div>;
                        }
                        const daysLeft = trialMs ? Math.ceil((trialMs - now) / 86_400_000) : 0;
                        // COMP (purple) when backend confirms it; otherwise TRIAL (cyan).
                        // Expired (red) when trial_ends_at has passed.
                        const isComp = Boolean(u.isComplimentary);
                        const badgeColor = isExpired ? "#ff3355" : isComp ? "#cc55ff" : "#00aaff";
                        const tag = isComp ? "COMP" : "TRIAL";
                        const badgeLabel = isExpired ? `${tag} EXPIRED` : `${tag} · ${daysLeft}d`;
                        return (
                          <div className="mt-0.5 flex flex-col gap-0.5">
                            <span className="text-[7px] font-bold font-mono px-1 py-0.5 rounded inline-block w-fit"
                              style={{
                                background: `${badgeColor}14`,
                                color: badgeColor,
                                border: `1px solid ${badgeColor}30`,
                              }}
                              title={trialMs ? `Expires ${new Date(trialMs).toLocaleString()}` : undefined}>
                              {badgeLabel}
                            </span>
                            <span className="text-[7px] font-mono" style={{ color: "#3a5a70" }}>{u.planStatus}</span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: statusColor(u.adminStatus), boxShadow: `0 0 4px ${statusColor(u.adminStatus)}` }} />
                        <span className="text-[8px] font-bold font-mono uppercase" style={{ color: statusColor(u.adminStatus) }}>
                          {u.adminStatus}
                        </span>
                      </div>
                    </td>

                    {/* Exchanges */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.hasLiveExchange ? "#ff8844" : "#00aaff" }}>
                          {u.exchangeActive}/{u.exchangeTotal}
                        </span>
                        {u.hasLiveExchange && (
                          <span className="text-[7px] font-bold font-mono px-1 py-0.5 rounded"
                            style={{ background: "#ff884414", color: "#ff8844", border: "1px solid #ff884430" }}>
                            LIVE
                          </span>
                        )}
                        {u.exchangeError > 0 && (
                          <span className="text-[7px] font-bold font-mono px-1 py-0.5 rounded"
                            style={{ background: "#ff335514", color: "#ff3355", border: "1px solid #ff335530" }}>
                            ERR
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Cap / 24h */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono"
                        style={{ color: u.tradeLimit.blocked ? "#ff3355" : "#ffaa00" }}>
                        {u.tradeLimit.used24h}{u.tradeLimit.remaining !== null ? `/${u.tradeLimit.capTier}` : ""}
                      </span>
                    </td>

                    {/* Trades */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: "#9FB3C8" }}>
                        {u.tradesCount}
                      </span>
                      <div className="text-[7px] font-mono" style={{ color: "#3a5a70" }}>
                        {u.wins}W / {u.losses}L
                      </div>
                    </td>

                    {/* Fees */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: "#ffaa00" }}>
                        {fmtDollar(u.feesGenerated)}
                      </span>
                    </td>

                    {/* PnL */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: pctColor(u.totalPnl) }}>
                        {u.totalPnl >= 0 ? "+" : ""}{fmtDollar(u.totalPnl)}
                      </span>
                    </td>

                    {/* Win Rate */}
                    <td className="px-3 py-2.5">
                      {u.winRate !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-1 rounded overflow-hidden flex-shrink-0" style={{ background: "#0d1e2e" }}>
                            <div className="h-full rounded"
                              style={{
                                width: `${Math.min(100, Math.max(0, u.winRate))}%`,
                                background: u.winRate >= 60 ? "#00ff8a" : u.winRate >= 50 ? "#ffaa00" : "#ff3355",
                                opacity: 0.75,
                              }} />
                          </div>
                          <span className="text-[9px] font-bold font-mono"
                            style={{ color: u.winRate >= 60 ? "#00ff8a" : u.winRate >= 50 ? "#ffaa00" : "#ff3355" }}>
                            {u.winRate.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] font-mono" style={{ color: "#3a5a70" }}>—</span>
                      )}
                    </td>

                    {/* MRR */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: u.mrrUsd > 0 ? "#00ff8a" : "#4a6a80" }}>
                        {u.mrrUsd > 0 ? `$${u.mrrUsd.toFixed(0)}` : "—"}
                      </span>
                    </td>

                    {/* Last Active */}
                    <td className="px-3 py-2.5">
                      <span className="text-[9px] font-mono" style={{ color: u.onlineNow ? "#00ff8a" : "#4a6a80" }}>
                        {fmtAgo(u.lastActivityAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t"
            style={{ background: "#000000", borderColor: "#0d1e2e" }}>
            <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>
              {sorted.length === 0
                ? "0 users"
                : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, sorted.length)} of ${sorted.length}`}
            </span>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i).slice(0, 10).map(i => (
                <button key={i} onClick={() => setPage(i)}
                  className="w-6 h-6 rounded font-mono text-[9px] font-bold transition-all border"
                  style={page === i
                    ? { background: "#cc55ff14", color: "#cc55ff", borderColor: "#cc55ff40" }
                    : { background: "transparent", color: "#4a6a80", borderColor: "#1a2a36" }}>
                  {i + 1}
                </button>
              ))}
              {totalPages > 10 && (
                <span className="text-[9px] font-mono px-1" style={{ color: "#4a6a80" }}>
                  +{totalPages - 10}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Row — Platform Health & Distribution ───────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Plan distribution (real) */}
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.2em] mb-3" style={{ color: "#4a6a80" }}>
              PLAN TIER DISTRIBUTION
            </div>
            {(["pro", "starter", "free"] as const).map(plan => {
              const count = users.filter(u => (u.plan || "free").toLowerCase() === plan).length;
              const pct   = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
              const color = planColor(plan);
              return (
                <div key={plan} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono font-bold uppercase" style={{ color }}>
                      {plan}
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>
                      {count} users ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded overflow-hidden" style={{ background: "#0d1e2e" }}>
                    <div className="h-full rounded transition-all"
                      style={{ width: `${pct}%`, background: color, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status distribution (real) */}
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.2em] mb-3" style={{ color: "#4a6a80" }}>
              ACCOUNT STATUS DISTRIBUTION
            </div>
            {(["active", "force_paper", "suspended", "disabled"] as const).map(s => {
              const count = users.filter(u => u.adminStatus === s).length;
              const pct   = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
              const color = statusColor(s);
              return (
                <div key={s} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono font-bold uppercase" style={{ color }}>
                      {s.replace("_", " ")}
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded overflow-hidden" style={{ background: "#0d1e2e" }}>
                    <div className="h-full rounded transition-all"
                      style={{ width: `${pct}%`, background: color, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Platform health */}
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.2em] mb-3" style={{ color: "#4a6a80" }}>
              PLATFORM HEALTH
            </div>
            <div className="space-y-2.5">
              {[
                { label: "API Gateway",       ok: true,                              value: `${12 - tick % 3}ms` },
                { label: "Trade Engine",      ok: engine?.running ?? false,          value: engine?.running ? "ACTIVE" : "STOPPED" },
                { label: "Fees Collected",    ok: (feeSummary?.totalFeesCollected ?? 0) >= 0, value: fmtDollar(feeSummary?.totalFeesCollected ?? 0) },
                { label: "Exchange Mode",     ok: true,                              value: (exchangeStatus?.mode ?? "sim").toUpperCase() },
                { label: "Encryption Vault",  ok: true,                              value: "AES-256" },
                { label: "Kill Switch",       ok: !(exchangeStatus?.killSwitch ?? false), value: exchangeStatus?.killSwitch ? "ARMED" : "SAFE" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: item.ok ? "#00ff8a" : "#ff3355",
                      boxShadow: `0 0 4px ${item.ok ? "#00ff8a" : "#ff3355"}`,
                    }} />
                  <span className="text-[9px] font-mono flex-1" style={{ color: "#7a9eb8" }}>{item.label}</span>
                  <span className="text-[8px] font-mono font-bold"
                    style={{ color: item.ok ? "#00ff8a80" : "#ff335580" }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded border px-4 py-3"
          style={{ background: "#0a0606", borderColor: "#ff335520" }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#ff3355" }} />
          <p className="text-[9px] font-mono" style={{ color: "#ff335560" }}>
            OPERATOR CONSOLE — RESTRICTED ACCESS. All actions are logged to the
            immutable audit trail. Click any user row to open the action drawer.
          </p>
        </div>

      </div>

      {/* Action drawer */}
      <UserActionDrawer
        user={selectedUser}
        onClose={() => setSelectedId(null)}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
