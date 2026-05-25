import { authFetch } from "@/lib/authFetch";
import { normalizeAdminActionPayload } from "@/lib/normalizeAdminPayload";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Zap, DollarSign, Activity, TrendingUp, Shield,
  Search, ChevronUp, ChevronDown, ArrowUpRight, ArrowDownRight,
  Globe, BarChart2, AlertTriangle, RefreshCw, Download,
  X, Gift, SlidersHorizontal, PauseCircle, PlayCircle, Ban,
  Power, Unplug, Loader2, CloudDownload,
  UserCircle, Briefcase, History, Cpu,
  Eye, EyeOff, RotateCcw,
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
  // ── CRM Phase A telemetry overlay ────────────────────────────────────
  activeExchange:    { name: string; mode: string } | null;
  exchangesConnected: number;
  aiUsage24h:        number;
  sessionStatus:     "active" | "idle" | "offline";
  revenueGenerated:  number;
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
//
// Historically this file defined a *local* `useAuthFetch` that called
// `fetch(path, ...)` directly. On the production 3-domain split, that
// shadow copy bypassed the `lib/authFetch.ts` cross-origin prefix —
// `/api/admin/users` from admintrade.aicandlez.com was served by the
// static SPA fallback (HTML, status 200), then `res.json()` threw and
// the query silently fell back to `[]`. Symptom: 200 in the network
// tab + empty CRM table. Now every call routes through the shared
// authFetch which prefixes VITE_API_BASE_URL → api.aicandlez.com.

// ── Admin user list hook ─────────────────────────────────────────────────────

function useAdminUsers(params: { q: string; plan: string; status: string }) {
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
          <Icon className="w-3.5 h-3.5" style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
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

// ── User Intelligence Panel (CRM Phase A2) ───────────────────────────────────
// Slide-out operator surface. Layered intelligence over the launch-critical
// action menu: PROFILE / EXCHANGES / TRADING / ACTIONS tabs. Profile shows
// identity + AI settings + revenue attribution. Exchanges shows per-connection
// health (status / last verified / last error / mode / permissions) plus an
// activity timeline derived client-side from `auditTrail` (any admin action
// whose action name mentions "exchange") and `exchangeConnections.updated_at`.
// Trading shows aggregates (PnL, win/loss, win rate, avg confidence, avg
// latency, error events, fees, exposure, open positions, live capital) plus
// the recent positions + closed trades. Actions tab preserves all 10
// audit-logged POST /api/admin/users/:id/* endpoints — wiring unchanged.
//
// Data source: GET /api/admin/users/:id (already aggregates positions +
// closedTrades + exchangeConnections + auditTrail + events + apiErrors +
// tradeLimit + aggregates in a single round-trip).

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

type IntelTab = "profile" | "exchanges" | "trading" | "entitlements" | "actions";

// CRM Phase A4 — per-user exchange visibility / governance.
interface VisibilityRow {
  exchangeId:       string;
  exchangeName:     string;
  status:           "live" | "beta" | "coming_soon";
  catalogDefault:   boolean;
  override:         boolean | null;
  effectiveVisible: boolean;
  note:             string | null;
  updatedAt:        string | null;
  updatedByAdminId: string | null;
}

interface UserDetailExchangeConnection {
  id: string;
  exchange: string;
  label: string | null;
  status: string;
  is_default: boolean;
  trading_mode: string;
  permissions: Record<string, unknown> | null;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface UserDetailAuditAction {
  id: string;
  actor_admin_id: string;
  target_user_id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface UserDetailAggregates {
  tradesCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  realizedPnl: number;
  openPositions: number;
  openLivePositions: number;
  exposureUsd: number;
  feesGenerated: number;
  feeRecords: number;
  profitablePnl: number;
  tradesPerDay: number;
  lifetimeDays: number;
  avgConfidence: number | null;
  avgLatencyMs: number | null;
  errorEventCount: number;
}

interface UserDetailResponse {
  user: {
    clerkUserId: string;
    email: string;
    role: string;
    plan: string;
    planStatus: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    billingEmail: string | null;
    trialEndsAt: string | null;
    createdAt: string;
    updatedAt: string;
    adminStatus: string;
    adminStatusReason: string | null;
    adminStatusSince: string | null;
  };
  settings: Record<string, unknown> | null;
  simAccount: Record<string, unknown> | null;
  positions: Array<Record<string, unknown>>;
  closedTrades: Array<Record<string, unknown>>;
  exchangeConnections: UserDetailExchangeConnection[];
  auditTrail: UserDetailAuditAction[];
  events: Array<Record<string, unknown>>;
  apiErrors: Array<Record<string, unknown>>;
  tradeLimit: {
    used24h: number;
    capTier: number;
    remaining: number | null;
    blocked: boolean;
    reason: string;
  } | null;
  aggregates: UserDetailAggregates;
  timestamp: number;
}

function UserIntelligencePanel({
  user, onClose, isSuperAdmin,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
  isSuperAdmin: boolean;
}) {
  const qc        = useQueryClient();
  const [tab, setTab]           = useState<IntelTab>("profile");
  const [panel, setPanel]       = useState<ActionPanel>(null);
  const [note, setNote]         = useState("");
  const [reason, setReason]     = useState("");
  const [days, setDays]         = useState<number>(30);
  const [capTier, setCapTier]   = useState<number>(3);
  const [compPlan, setCompPlan] = useState<"free" | "starter" | "pro">("pro");
  const [compPaperOnly, setCompPaperOnly] = useState<boolean>(true);
  const [compCapOverride, setCompCapOverride] = useState<number | null>(null);

  // Detail fetch — lazily loads only when a user is opened. Cached per user
  // by react-query; invalidated by any successful mutation below.
  const detailQuery = useQuery<UserDetailResponse>({
    queryKey: ["admin-user-detail", user?.clerkUserId],
    enabled:  Boolean(user?.clerkUserId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await authFetch(`/api/admin/users/${user!.clerkUserId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json() as UserDetailResponse;
    },
  });
  const detail = detailQuery.data ?? null;

  useEffect(() => {
    if (user) {
      setTab("profile");
      setPanel(null);
      setNote("");
      setReason("");
      setDays(30);
      setCapTier(user.tradeCapTier || 3);
    }
  }, [user?.clerkUserId]);

  const mutation = useMutation({
    mutationFn: async (args: { path: string; body: Record<string, unknown> }) => {
      const body = normalizeAdminActionPayload(args.body);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug(
          `[admin-action] POST /api/admin/users/${user!.clerkUserId}/${args.path}`,
          body,
        );
      }
      const res = await authFetch(`/api/admin/users/${user!.clerkUserId}/${args.path}`, {
        method: "POST",
        body:   JSON.stringify(body),
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
      qc.invalidateQueries({ queryKey: ["admin-user-detail", user?.clerkUserId] });
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

  const W = 640;
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
        boxShadow: "-20px 0 60px rgba(0,0,0,0.21)",
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

        {/* Tab strip */}
        <div style={{
          display: "flex", borderBottom: `1px solid ${C.border}`,
          background: "#000814",
        }}>
          {([
            { id: "profile",      label: "PROFILE",      icon: UserCircle },
            { id: "exchanges",    label: "EXCHANGES",    icon: Briefcase },
            { id: "trading",      label: "TRADING",      icon: BarChart2 },
            { id: "entitlements", label: "ENTITLEMENTS", icon: Eye },
            { id: "actions",      label: "ACTIONS",      icon: SlidersHorizontal },
          ] as const).map(t => {
            const active = tab === t.id;
            const Icon   = t.icon;
            return (
              <button key={t.id}
                onClick={() => { setTab(t.id); setPanel(null); }}
                style={{
                  flex: 1, padding: "10px 8px", background: "transparent",
                  border: "none", borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
                  color: active ? C.text : C.dim, cursor: "pointer",
                  fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.1em", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 6, transition: "all 0.15s",
                }}>
                <Icon className="w-3 h-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div style={{ padding: "14px 18px", flex: 1, overflowY: "auto" }}>
          {tab === "profile" && (
            <ProfileTab user={user} detail={detail} loading={detailQuery.isLoading} isSuperAdmin={isSuperAdmin} />
          )}
          {tab === "exchanges" && (
            <ExchangesTab detail={detail} loading={detailQuery.isLoading} />
          )}
          {tab === "trading" && (
            <TradingTab detail={detail} loading={detailQuery.isLoading} />
          )}
          {tab === "entitlements" && (
            <EntitlementsTab clerkUserId={user.clerkUserId} />
          )}
          {tab === "actions" && panel === null && (
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

// ── Intelligence tab subcomponents (CRM Phase A2) ────────────────────────────

const TAB_C = {
  bg:     "#040810",
  panel:  "#010C18",
  border: "#0d1e2e",
  text:   "#EAF2FF",
  dim:    "#7a9eb8",
  faint:  "#4a6a80",
  accent: "#cc55ff",
} as const;

function fmtMs(value: unknown): string {
  if (value == null) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return fmtAgo(n);
}

function fmtIsoAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? fmtAgo(ms) : "—";
}

function MetricCell({
  label, value, color, sub,
}: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{
      background: "#000814", border: `1px solid ${TAB_C.border}`,
      borderRadius: 4, padding: "8px 10px", display: "flex",
      flexDirection: "column", gap: 3, minWidth: 0,
    }}>
      <div style={{
        fontSize: 8, fontFamily: "monospace", fontWeight: 700,
        color: TAB_C.faint, letterSpacing: "0.1em",
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontFamily: "monospace", fontWeight: 700,
        color: color ?? TAB_C.text, lineHeight: 1.2,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: 8, fontFamily: "monospace", color: TAB_C.dim, lineHeight: 1.2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{sub}</div>
      )}
    </div>
  );
}

function TabSectionLabel({ children, icon: Icon }: {
  children: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 9, fontFamily: "monospace", fontWeight: 700,
      color: TAB_C.dim, letterSpacing: "0.15em",
      margin: "14px 0 8px 0", textTransform: "uppercase",
    }}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "16px 12px", textAlign: "center", fontSize: 10,
      fontFamily: "monospace", color: TAB_C.faint,
      background: "#000814", border: `1px dashed ${TAB_C.border}`,
      borderRadius: 4,
    }}>{children}</div>
  );
}

function TabLoading() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 32, color: TAB_C.dim, gap: 8,
    }}>
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span style={{ fontSize: 10, fontFamily: "monospace" }}>LOADING INTELLIGENCE…</span>
    </div>
  );
}

// ── PROFILE TAB ──────────────────────────────────────────────────────────────
// Identity (read-only) + AI engine settings (editable, operator) + revenue /
// billing attribution (editable, super-admin). The editable sections use a
// single shared dirty-state form with explicit SAVE CHANGES / RESET buttons
// at the bottom of each section. Mutations are optimistic with rollback on
// failure (full snapshot restored via setQueryData) and every save writes an
// audit row to `user_admin_actions` server-side.
//
// Read-only telemetry (lifetime rev, MRR, perf fees, equity) stays as a
// metric strip — those are aggregates, not policy.

const EDIT_CELL_BG    = "#000814";
const EDIT_CELL_BG_HI = "#001624";

function FieldShell({
  label, sub, accent, dirty, disabled, children,
}: {
  label:    string;
  sub?:     string;
  accent?:  string;
  dirty?:   boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const borderColor = dirty ? "#ffaa00" : TAB_C.border;
  return (
    <div style={{
      background: dirty ? EDIT_CELL_BG_HI : EDIT_CELL_BG,
      border: `1px solid ${borderColor}`,
      borderRadius: 4, padding: "8px 10px",
      display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
      opacity: disabled ? 0.55 : 1,
      transition: "border-color 120ms ease, background 120ms ease",
    }}>
      <div style={{
        fontSize: 8, fontFamily: "monospace", fontWeight: 700,
        color: accent ?? TAB_C.faint, letterSpacing: "0.1em",
        display: "flex", alignItems: "center", gap: 4,
      }}>
        {label}
        {dirty && <span style={{ color: "#ffaa00", fontSize: 7 }}>●</span>}
      </div>
      {children}
      {sub && <div style={{ fontSize: 7, fontFamily: "monospace", color: TAB_C.dim }}>{sub}</div>}
    </div>
  );
}

function TextField({
  value, onChange, type = "text", disabled, placeholder, color,
}: {
  value:       string;
  onChange:    (v: string) => void;
  type?:       "text" | "number";
  disabled?:   boolean;
  placeholder?: string;
  color?:      string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "transparent", border: "none", outline: "none",
        padding: 0, margin: 0, width: "100%",
        fontSize: 13, fontFamily: "monospace", fontWeight: 700,
        color: color ?? TAB_C.text,
      }}
    />
  );
}

function SelectField<T extends string>({
  value, options, onChange, disabled, color,
}: {
  value:    T;
  options:  ReadonlyArray<{ label: string; value: T; color?: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
  color?:   string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        background: "#000", border: `1px solid ${TAB_C.border}`,
        padding: "2px 4px", margin: 0, width: "100%",
        fontSize: 13, fontFamily: "monospace", fontWeight: 700,
        color: color ?? TAB_C.text, borderRadius: 3,
        cursor: disabled ? "not-allowed" : "pointer",
      }}>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ToggleField({
  value, onChange, disabled, onLabel = "ON", offLabel = "OFF",
}: {
  value:    boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  onLabel?:  string;
  offLabel?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: value ? "#003a1f" : "#1a0508",
        border: `1px solid ${value ? "#00ff8a" : "#ff3355"}55`,
        borderRadius: 3, padding: "3px 8px",
        fontSize: 11, fontFamily: "monospace", fontWeight: 700,
        color: value ? "#00ff8a" : "#ff3355",
        cursor: disabled ? "not-allowed" : "pointer", width: "fit-content",
        transition: "background 120ms ease",
      }}>
      <span style={{
        width: 7, height: 7, borderRadius: 4,
        background: value ? "#00ff8a" : "#ff3355",
        boxShadow: `0 0 4px ${value ? "#00ff8a" : "#ff3355"}`,
      }} />
      {value ? onLabel : offLabel}
    </button>
  );
}

// ── Editable form state shapes ───────────────────────────────────────────────

interface AiSettingsForm {
  autoMode:           boolean;
  riskLevel:          string;
  minConfidence:      number;
  positionSizeUSD:    number;
  maxActivePositions: number;
  tradingMode:        "simulation" | "live";
  preferredExchange:  string;
  volumeFilter:       boolean;
}

interface BillingOverridesForm {
  perfFeeBpsOverride:     number | null;
  feeWaiverActive:        boolean;
  isComplimentaryAccount: boolean;
  isInternalAccount:      boolean;
  revenueShareBps:        number;
  billingOverrideNotes:   string;
}

function pickAiSettings(s: Record<string, unknown> | null): AiSettingsForm {
  const r = s ?? {};
  return {
    autoMode:           r["autoMode"]           === true,
    riskLevel:          (typeof r["riskLevel"]        === "string" ? r["riskLevel"]        : "moderate") as string,
    minConfidence:      typeof r["minConfidence"]     === "number" ? r["minConfidence"]      : 60,
    positionSizeUSD:    typeof r["positionSizeUSD"]   === "number" ? r["positionSizeUSD"]    : 20,
    maxActivePositions: typeof r["maxActivePositions"] === "number" ? r["maxActivePositions"] : 3,
    tradingMode:       (r["tradingMode"] === "live" ? "live" : "simulation") as "simulation" | "live",
    preferredExchange: typeof r["preferredExchange"] === "string" ? r["preferredExchange"] : "Kraken",
    volumeFilter:       r["volumeFilter"] === true,
  };
}

function pickBillingOverrides(u: UserDetailResponse["user"] | null): BillingOverridesForm {
  const r = (u ?? {}) as unknown as Record<string, unknown>;
  return {
    perfFeeBpsOverride:     typeof r["perfFeeBpsOverride"] === "number" ? r["perfFeeBpsOverride"] as number : null,
    feeWaiverActive:        r["feeWaiverActive"] === true,
    isComplimentaryAccount: r["isComplimentaryAccount"] === true,
    isInternalAccount:      r["isInternalAccount"] === true,
    revenueShareBps:        typeof r["revenueShareBps"] === "number" ? r["revenueShareBps"] as number : 0,
    billingOverrideNotes:   typeof r["billingOverrideNotes"] === "string" ? r["billingOverrideNotes"] as string : "",
  };
}

/** Drop keys whose value is `undefined` before serialization. JSON.stringify
 *  silently elides them anyway, but Zod-side parsing of explicitly-missing
 *  optional fields then surfaces as a generic "expected X, received undefined"
 *  if any *required* field was inadvertently undefined too. Stripping in the
 *  mutation layer makes the outbound payload exactly what hit the wire and
 *  prevents controlled-select edge cases (e.g. a Select returning undefined
 *  on first render) from corrupting the body shape. */
function stripUndefined(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a); const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

function SaveResetBar({
  dirty, saving, onSave, onReset, disabled, disabledReason,
}: {
  dirty:    boolean;
  saving:   boolean;
  onSave:   () => void;
  onReset:  () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const canSave = dirty && !saving && !disabled;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "flex-end",
      gap: 8, marginTop: 8,
    }}>
      {disabled && disabledReason && (
        <span style={{
          fontSize: 9, fontFamily: "monospace", color: TAB_C.faint,
          marginRight: "auto",
        }}>{disabledReason}</span>
      )}
      {dirty && !disabled && (
        <span style={{
          fontSize: 9, fontFamily: "monospace", color: "#ffaa00",
          marginRight: "auto",
        }}>● UNSAVED CHANGES</span>
      )}
      <button type="button"
        onClick={onReset}
        disabled={!dirty || saving}
        style={{
          padding: "5px 10px", background: "transparent",
          border: `1px solid ${TAB_C.border}`, borderRadius: 3,
          fontSize: 9, fontFamily: "monospace", fontWeight: 700,
          color: dirty ? TAB_C.dim : TAB_C.faint, letterSpacing: "0.1em",
          cursor: dirty && !saving ? "pointer" : "not-allowed",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
        <RotateCcw className="w-3 h-3" /> RESET
      </button>
      <button type="button"
        onClick={onSave}
        disabled={!canSave}
        style={{
          padding: "5px 12px", background: canSave ? "#003a1f" : "transparent",
          border: `1px solid ${canSave ? "#00ff8a" : TAB_C.border}`, borderRadius: 3,
          fontSize: 9, fontFamily: "monospace", fontWeight: 700,
          color: canSave ? "#00ff8a" : TAB_C.faint, letterSpacing: "0.1em",
          cursor: canSave ? "pointer" : "not-allowed",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        SAVE CHANGES
      </button>
    </div>
  );
}

function NoteRow({
  note, setNote, placeholder, disabled,
}: {
  note: string; setNote: (v: string) => void;
  placeholder: string; disabled?: boolean;
}) {
  return (
    <div style={{
      background: EDIT_CELL_BG, border: `1px solid ${TAB_C.border}`,
      borderRadius: 4, padding: "6px 10px", marginTop: 8,
    }}>
      <div style={{
        fontSize: 8, fontFamily: "monospace", fontWeight: 700,
        color: TAB_C.faint, letterSpacing: "0.1em", marginBottom: 3,
      }}>AUDIT NOTE (REQUIRED)</div>
      <input
        type="text"
        value={note}
        disabled={disabled}
        onChange={(e) => setNote(e.target.value)}
        placeholder={placeholder}
        style={{
          background: "transparent", border: "none", outline: "none",
          padding: 0, margin: 0, width: "100%",
          fontSize: 11, fontFamily: "monospace",
          color: TAB_C.text,
        }} />
    </div>
  );
}

function ProfileTab({ user, detail, loading, isSuperAdmin }: {
  user: AdminUserRow;
  detail: UserDetailResponse | null;
  loading: boolean;
  isSuperAdmin: boolean;
}) {
  const qc = useQueryClient();
  const u  = detail?.user ?? null;

  const sessionColor =
    user.sessionStatus === "active"  ? "#00ff8a" :
    user.sessionStatus === "idle"    ? "#ffaa00" : TAB_C.faint;

  // ── Server snapshots (re-derived whenever detail changes) ────────────────
  const aiServer      = useMemo(() => pickAiSettings(detail?.settings ?? null),       [detail?.settings]);
  const billingServer = useMemo(() => pickBillingOverrides(u),                        [u]);

  // ── Local dirty state ────────────────────────────────────────────────────
  const [aiDraft, setAiDraft]             = useState<AiSettingsForm>(aiServer);
  const [billingDraft, setBillingDraft]   = useState<BillingOverridesForm>(billingServer);
  const [aiNote, setAiNote]               = useState("");
  const [billingNote, setBillingNote]     = useState("");

  // Re-sync drafts ONLY when the operator switches users. Background refetch
  // identity changes on `aiServer` / `billingServer` MUST NOT clobber in-flight
  // unsaved edits. Post-save draft collapse is handled explicitly in each
  // mutation's onSuccess via setAiDraft(data.after) / setBillingDraft(...).
  useEffect(() => {
    setAiDraft(pickAiSettings(detail?.settings ?? null));
    setBillingDraft(pickBillingOverrides(detail?.user ?? null));
    setAiNote("");
    setBillingNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.clerkUserId]);

  const aiDirty      = !shallowEqual(aiDraft as unknown as Record<string, unknown>,           aiServer as unknown as Record<string, unknown>);
  const billingDirty = !shallowEqual(billingDraft as unknown as Record<string, unknown>,      billingServer as unknown as Record<string, unknown>);

  // ── Mutations ────────────────────────────────────────────────────────────
  const detailKey = ["admin-user-detail", user.clerkUserId] as const;
  const listKey   = ["admin-users"] as const;

  const aiMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const cleanBody = stripUndefined(body);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug(
          `[admin-profile] PATCH /api/admin/users/${user.clerkUserId}/ai-settings`,
          cleanBody,
        );
      }
      const res = await authFetch(`/api/admin/users/${user.clerkUserId}/ai-settings`, {
        method: "PATCH",
        body:   JSON.stringify(cleanBody),
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
      if (!res.ok) {
        throw new Error((json as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
      }
      return json as { ok: true; after: Record<string, unknown>; changedFields: string[] };
    },
    onMutate: async (body) => {
      // Optimistic — patch only the fields this mutation touched. Snapshot
      // only the *prior values of those fields* so rollback can't overwrite
      // unrelated concurrent cache updates on the same detail key.
      await qc.cancelQueries({ queryKey: detailKey });
      const prior = qc.getQueryData<UserDetailResponse>(detailKey);
      const patchedKeys = Object.keys(body).filter((k) => k !== "note");
      const priorPatch: Record<string, unknown> = {};
      if (prior) {
        const priorSettings = (prior.settings ?? {}) as Record<string, unknown>;
        for (const k of patchedKeys) priorPatch[k] = priorSettings[k];
        const optimisticSettings: Record<string, unknown> = { ...priorSettings };
        for (const k of patchedKeys) optimisticSettings[k] = (body as Record<string, unknown>)[k];
        qc.setQueryData<UserDetailResponse>(detailKey, {
          ...prior,
          settings: optimisticSettings,
        });
      }
      return { priorPatch, patchedKeys };
    },
    onError: (err: Error, _body, ctx) => {
      // Scoped rollback: restore only the fields we touched.
      const cur = qc.getQueryData<UserDetailResponse>(detailKey);
      if (cur && ctx) {
        const settings = { ...((cur.settings ?? {}) as Record<string, unknown>) };
        for (const k of ctx.patchedKeys) settings[k] = ctx.priorPatch[k];
        qc.setQueryData<UserDetailResponse>(detailKey, { ...cur, settings });
      }
      toast({
        title: "AI settings save failed",
        description: `${err.message} — changes rolled back.`,
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      const n = data.changedFields.length;
      toast({
        title: "AI settings saved",
        description: n === 0
          ? "No changes to apply."
          : `${n} field${n === 1 ? "" : "s"} updated and audit-logged.`,
      });
      // Collapse dirty state to authoritative server `after` payload.
      setAiDraft(pickAiSettings(data.after ?? null));
      setAiNote("");
      qc.invalidateQueries({ queryKey: detailKey });
      qc.invalidateQueries({ queryKey: listKey });
    },
  });

  const billingMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const cleanBody = stripUndefined(body);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug(
          `[admin-profile] PATCH /api/admin/users/${user.clerkUserId}/billing-overrides`,
          cleanBody,
        );
      }
      const res = await authFetch(`/api/admin/users/${user.clerkUserId}/billing-overrides`, {
        method: "PATCH",
        body:   JSON.stringify(cleanBody),
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
      if (!res.ok) {
        throw new Error((json as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
      }
      return json as { ok: true; after: Record<string, unknown>; changedFields: string[] };
    },
    onMutate: async (body) => {
      // Scoped optimistic patch + scoped prior snapshot (see ai mutation
      // for rationale — prevents clobbering concurrent edits on rollback).
      await qc.cancelQueries({ queryKey: detailKey });
      const prior = qc.getQueryData<UserDetailResponse>(detailKey);
      const patchedKeys = Object.keys(body).filter((k) => k !== "note");
      const priorPatch: Record<string, unknown> = {};
      if (prior && prior.user) {
        const priorUserRec = prior.user as unknown as Record<string, unknown>;
        for (const k of patchedKeys) priorPatch[k] = priorUserRec[k];
        const optimisticUser: Record<string, unknown> = { ...priorUserRec };
        for (const k of patchedKeys) optimisticUser[k] = (body as Record<string, unknown>)[k];
        qc.setQueryData<UserDetailResponse>(detailKey, {
          ...prior,
          user: optimisticUser as unknown as UserDetailResponse["user"],
        });
      }
      return { priorPatch, patchedKeys };
    },
    onError: (err: Error, _body, ctx) => {
      const cur = qc.getQueryData<UserDetailResponse>(detailKey);
      if (cur && cur.user && ctx) {
        const userRec = { ...(cur.user as unknown as Record<string, unknown>) };
        for (const k of ctx.patchedKeys) userRec[k] = ctx.priorPatch[k];
        qc.setQueryData<UserDetailResponse>(detailKey, {
          ...cur,
          user: userRec as unknown as UserDetailResponse["user"],
        });
      }
      toast({
        title: "Billing overrides save failed",
        description: `${err.message} — changes rolled back.`,
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      const n = data.changedFields.length;
      toast({
        title: "Billing overrides saved",
        description: n === 0
          ? "No changes to apply."
          : `${n} field${n === 1 ? "" : "s"} updated and audit-logged.`,
      });
      // Collapse dirty state from the server's authoritative `after`.
      setBillingDraft(pickBillingOverrides(data.after as unknown as UserDetailResponse["user"]));
      setBillingNote("");
      qc.invalidateQueries({ queryKey: detailKey });
      qc.invalidateQueries({ queryKey: listKey });
    },
  });

  function submitAi() {
    if (!aiDirty) return;
    if (!aiNote.trim()) {
      toast({ title: "Audit note required", description: "Add a short note before saving AI settings.", variant: "destructive" });
      return;
    }
    // Send only changed fields so we don't clobber server-default semantics.
    const body: Record<string, unknown> = { note: aiNote.trim() };
    const aiDraftRec  = aiDraft  as unknown as Record<string, unknown>;
    const aiServerRec = aiServer as unknown as Record<string, unknown>;
    for (const k of Object.keys(aiDraftRec)) {
      if (aiDraftRec[k] !== aiServerRec[k]) body[k] = aiDraftRec[k];
    }
    aiMutation.mutate(body);
  }
  function submitBilling() {
    if (!billingDirty) return;
    if (!billingNote.trim()) {
      toast({ title: "Audit note required", description: "Add a short note before saving billing overrides.", variant: "destructive" });
      return;
    }
    const body: Record<string, unknown> = { note: billingNote.trim() };
    const bDraftRec  = billingDraft  as unknown as Record<string, unknown>;
    const bServerRec = billingServer as unknown as Record<string, unknown>;
    for (const k of Object.keys(bDraftRec)) {
      if (bDraftRec[k] !== bServerRec[k]) body[k] = bDraftRec[k];
    }
    billingMutation.mutate(body);
  }

  const aiDisabled      = aiMutation.isPending      || loading;
  const billingDisabled = billingMutation.isPending || loading || !isSuperAdmin;

  return (
    <div>
      {/* ── IDENTITY (read-only) ───────────────────────────────────────── */}
      <TabSectionLabel icon={UserCircle}>IDENTITY</TabSectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <MetricCell label="EMAIL"        value={user.email} />
        <MetricCell label="ROLE"         value={user.role.toUpperCase()}
          color={user.role === "super-admin" ? "#cc55ff" : user.role === "admin" ? "#00aaff" : TAB_C.text} />
        <MetricCell label="ACCOUNT AGE"  value={fmtIsoAgo(user.createdAt)} />
        <MetricCell label="SESSION"      value={user.sessionStatus.toUpperCase()} color={sessionColor}
          sub={user.lastActivityAt ? `last ${fmtAgo(user.lastActivityAt)}` : undefined} />
        <MetricCell label="STRIPE CUST"  value={u?.stripeCustomerId ?? "—"} />
        <MetricCell label="BILLING EMAIL" value={u?.billingEmail ?? user.email} />
      </div>

      {/* ── REVENUE ATTRIBUTION (read-only telemetry + editable overrides) ── */}
      <TabSectionLabel icon={DollarSign}>REVENUE ATTRIBUTION</TabSectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <MetricCell label="LIFETIME REV" value={fmtDollar(user.revenueGenerated)} color="#00ff8a" />
        <MetricCell label="MRR"          value={`${fmtDollar(user.mrrUsd)}/mo`}    color={user.mrrUsd > 0 ? "#00ff8a" : TAB_C.dim} />
        <MetricCell label="PERF FEES"    value={fmtDollar(user.feesGenerated)}     color={user.feesGenerated > 0 ? "#00ff8a" : TAB_C.dim} />
        <MetricCell label="EQUITY"       value={fmtDollar(user.equityUsd)} />
        <MetricCell label="TRIAL ENDS"   value={user.trialEndsAt ? fmtIsoAgo(user.trialEndsAt) : "—"} />
        <MetricCell label="DERIVED COMP" value={user.isComplimentary ? "TRIALING" : "—"}
          color={user.isComplimentary ? "#cc55ff" : TAB_C.dim} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
        <FieldShell label="PERF FEE %"
          sub="0–100 (default 3%)"
          dirty={billingDraft.perfFeeBpsOverride !== billingServer.perfFeeBpsOverride}
          disabled={billingDisabled}
          accent="#cc55ff">
          <TextField type="number"
            value={billingDraft.perfFeeBpsOverride == null ? "" : String(billingDraft.perfFeeBpsOverride / 100)}
            disabled={billingDisabled}
            placeholder="3"
            onChange={(v) => {
              if (v.trim() === "") return setBillingDraft({ ...billingDraft, perfFeeBpsOverride: null });
              const n = Number(v); if (!Number.isFinite(n)) return;
              setBillingDraft({ ...billingDraft, perfFeeBpsOverride: Math.round(n * 100) });
            }} />
        </FieldShell>
        <FieldShell label="FEE WAIVER"
          dirty={billingDraft.feeWaiverActive !== billingServer.feeWaiverActive}
          disabled={billingDisabled} accent="#cc55ff">
          <ToggleField value={billingDraft.feeWaiverActive} disabled={billingDisabled}
            onChange={(v) => setBillingDraft({ ...billingDraft, feeWaiverActive: v })}
            onLabel="WAIVED" offLabel="ACTIVE" />
        </FieldShell>
        <FieldShell label="COMPLIMENTARY"
          dirty={billingDraft.isComplimentaryAccount !== billingServer.isComplimentaryAccount}
          disabled={billingDisabled} accent="#cc55ff">
          <ToggleField value={billingDraft.isComplimentaryAccount} disabled={billingDisabled}
            onChange={(v) => setBillingDraft({ ...billingDraft, isComplimentaryAccount: v })}
            onLabel="YES" offLabel="NO" />
        </FieldShell>
        <FieldShell label="INTERNAL ACCT"
          dirty={billingDraft.isInternalAccount !== billingServer.isInternalAccount}
          disabled={billingDisabled} accent="#cc55ff">
          <ToggleField value={billingDraft.isInternalAccount} disabled={billingDisabled}
            onChange={(v) => setBillingDraft({ ...billingDraft, isInternalAccount: v })}
            onLabel="YES" offLabel="NO" />
        </FieldShell>
        <FieldShell label="REV SHARE %"
          sub="0–100"
          dirty={billingDraft.revenueShareBps !== billingServer.revenueShareBps}
          disabled={billingDisabled} accent="#cc55ff">
          <TextField type="number"
            value={String(billingDraft.revenueShareBps / 100)}
            disabled={billingDisabled}
            onChange={(v) => {
              const n = Number(v); if (!Number.isFinite(n)) return;
              setBillingDraft({ ...billingDraft, revenueShareBps: Math.max(0, Math.min(10000, Math.round(n * 100))) });
            }} />
        </FieldShell>
        <FieldShell label="BILLING OVERRIDE"
          dirty={billingDraft.billingOverrideNotes !== billingServer.billingOverrideNotes}
          disabled={billingDisabled} accent="#cc55ff">
          <TextField
            value={billingDraft.billingOverrideNotes}
            disabled={billingDisabled}
            placeholder="(none)"
            onChange={(v) => setBillingDraft({ ...billingDraft, billingOverrideNotes: v })} />
        </FieldShell>
      </div>

      {isSuperAdmin && billingDirty && (
        <NoteRow note={billingNote} setNote={setBillingNote}
          placeholder="Why are you changing billing for this user?"
          disabled={billingMutation.isPending} />
      )}
      <SaveResetBar
        dirty={billingDirty}
        saving={billingMutation.isPending}
        onSave={submitBilling}
        onReset={() => { setBillingDraft(billingServer); setBillingNote(""); }}
        disabled={!isSuperAdmin}
        disabledReason={!isSuperAdmin ? "Super-admin only" : undefined}
      />

      {/* ── AI ENGINE SETTINGS (editable, operator) ───────────────────── */}
      <TabSectionLabel icon={Cpu}>AI ENGINE SETTINGS</TabSectionLabel>
      {loading && !detail ? <TabLoading /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <FieldShell label="AI ENABLED"
              dirty={aiDraft.autoMode !== aiServer.autoMode}
              disabled={aiDisabled}>
              <ToggleField value={aiDraft.autoMode} disabled={aiDisabled}
                onChange={(v) => setAiDraft({ ...aiDraft, autoMode: v })} />
            </FieldShell>
            <FieldShell label="RISK LEVEL"
              dirty={aiDraft.riskLevel !== aiServer.riskLevel}
              disabled={aiDisabled}>
              <SelectField
                value={aiDraft.riskLevel}
                disabled={aiDisabled}
                options={[
                  { label: "CONSERVATIVE", value: "conservative" },
                  { label: "MODERATE",     value: "moderate" },
                  { label: "AGGRESSIVE",   value: "aggressive" },
                ] as const}
                color={aiDraft.riskLevel === "aggressive" ? "#ff8844"
                  : aiDraft.riskLevel === "conservative" ? "#00aaff" : "#ffaa00"}
                onChange={(v) => setAiDraft({ ...aiDraft, riskLevel: v })} />
            </FieldShell>
            <FieldShell label="MIN CONFIDENCE"
              sub="0–100"
              dirty={aiDraft.minConfidence !== aiServer.minConfidence}
              disabled={aiDisabled}>
              <TextField type="number" value={String(aiDraft.minConfidence)}
                disabled={aiDisabled}
                onChange={(v) => {
                  const n = Number(v); if (!Number.isFinite(n)) return;
                  setAiDraft({ ...aiDraft, minConfidence: Math.max(0, Math.min(100, n)) });
                }} />
            </FieldShell>
            <FieldShell label="POS SIZE (USD)"
              dirty={aiDraft.positionSizeUSD !== aiServer.positionSizeUSD}
              disabled={aiDisabled}>
              <TextField type="number" value={String(aiDraft.positionSizeUSD)}
                disabled={aiDisabled}
                onChange={(v) => {
                  const n = Number(v); if (!Number.isFinite(n)) return;
                  setAiDraft({ ...aiDraft, positionSizeUSD: Math.max(1, n) });
                }} />
            </FieldShell>
            <FieldShell label="MAX OPEN POSITIONS"
              dirty={aiDraft.maxActivePositions !== aiServer.maxActivePositions}
              disabled={aiDisabled}>
              <TextField type="number" value={String(aiDraft.maxActivePositions)}
                disabled={aiDisabled}
                onChange={(v) => {
                  const n = Number(v); if (!Number.isFinite(n)) return;
                  setAiDraft({ ...aiDraft, maxActivePositions: Math.max(0, Math.min(100, Math.round(n))) });
                }} />
            </FieldShell>
            <FieldShell label="TRADING MODE"
              dirty={aiDraft.tradingMode !== aiServer.tradingMode}
              disabled={aiDisabled}>
              <SelectField
                value={aiDraft.tradingMode}
                disabled={aiDisabled}
                options={[
                  { label: "SIMULATION", value: "simulation" },
                  { label: "LIVE",       value: "live" },
                ] as const}
                color={aiDraft.tradingMode === "live" ? "#ff8844" : "#00aaff"}
                onChange={(v) => setAiDraft({ ...aiDraft, tradingMode: v })} />
            </FieldShell>
            <FieldShell label="AUTO MODE"
              sub="Alias of AI Enabled (same column)"
              dirty={false}
              disabled={true}>
              <ToggleField value={aiDraft.autoMode} disabled={true}
                onChange={() => { /* mirror only */ }} />
            </FieldShell>
            <FieldShell label="PREF EXCHANGE"
              dirty={aiDraft.preferredExchange !== aiServer.preferredExchange}
              disabled={aiDisabled}>
              <SelectField
                value={aiDraft.preferredExchange}
                disabled={aiDisabled}
                options={[
                  { label: "KRAKEN",   value: "Kraken" },
                  { label: "COINBASE", value: "Coinbase" },
                  { label: "BINANCE",  value: "Binance" },
                  { label: "BYBIT",    value: "Bybit" },
                  { label: "OKX",      value: "OKX" },
                  { label: "KUCOIN",   value: "KuCoin" },
                ] as const}
                onChange={(v) => setAiDraft({ ...aiDraft, preferredExchange: v })} />
            </FieldShell>
            <FieldShell label="VOLUME FILTER"
              dirty={aiDraft.volumeFilter !== aiServer.volumeFilter}
              disabled={aiDisabled}>
              <ToggleField value={aiDraft.volumeFilter} disabled={aiDisabled}
                onChange={(v) => setAiDraft({ ...aiDraft, volumeFilter: v })} />
            </FieldShell>
          </div>

          {aiDirty && (
            <NoteRow note={aiNote} setNote={setAiNote}
              placeholder="Why are you changing AI engine settings for this user?"
              disabled={aiMutation.isPending} />
          )}
          <SaveResetBar
            dirty={aiDirty}
            saving={aiMutation.isPending}
            onSave={submitAi}
            onReset={() => { setAiDraft(aiServer); setAiNote(""); }}
          />
        </>
      )}
    </div>
  );
}

// ── EXCHANGES TAB ────────────────────────────────────────────────────────────
// Per-connection health detail + a connection activity timeline. The
// timeline merges `auditTrail` rows whose action name contains "exchange"
// with each connection's `updated_at` / `last_verified_at` timestamps —
// gives the operator a single "what happened to this user's broker
// surface" view without an extra round-trip.
function ExchangesTab({ detail, loading }: {
  detail: UserDetailResponse | null;
  loading: boolean;
}) {
  const conns = detail?.exchangeConnections ?? [];

  const timeline = useMemo(() => {
    if (!detail) return [] as Array<{ ts: number; kind: string; label: string; color: string; sub?: string }>;
    const items: Array<{ ts: number; kind: string; label: string; color: string; sub?: string }> = [];

    for (const c of conns) {
      const verifiedMs = c.last_verified_at ? Date.parse(c.last_verified_at) : NaN;
      if (Number.isFinite(verifiedMs)) {
        items.push({
          ts: verifiedMs,
          kind: "VERIFY",
          label: `${c.exchange.toUpperCase()} verified`,
          color: c.last_error ? "#ff3355" : "#00ff8a",
          sub: c.last_error ?? `${c.trading_mode} · ${c.status}`,
        });
      }
      const updatedMs = Date.parse(c.updated_at);
      if (Number.isFinite(updatedMs) && updatedMs !== verifiedMs) {
        items.push({
          ts: updatedMs,
          kind: "UPDATE",
          label: `${c.exchange.toUpperCase()} updated`,
          color: TAB_C.dim,
          sub: `mode=${c.trading_mode} · default=${c.is_default ? "yes" : "no"}`,
        });
      }
    }

    for (const a of detail.auditTrail) {
      const action = (a.action ?? "").toLowerCase();
      if (!action.includes("exchange") && action !== "emergency_disable") continue;
      const ts = Date.parse(a.created_at);
      if (!Number.isFinite(ts)) continue;
      items.push({
        ts,
        kind: "ADMIN",
        label: a.action.replace(/_/g, " ").toUpperCase(),
        color: action.includes("revoke") || action === "emergency_disable" ? "#ff3355" : "#cc55ff",
        sub: `by ${a.actor_admin_id}${a.payload?.["note"] ? ` · ${String(a.payload["note"]).slice(0, 60)}` : ""}`,
      });
    }

    return items.sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [detail, conns]);

  return (
    <div>
      <TabSectionLabel icon={Briefcase}>CONNECTED BROKERS</TabSectionLabel>
      {loading && !detail ? <TabLoading /> : conns.length === 0 ? (
        <EmptyState>NO EXCHANGE CONNECTIONS</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conns.map(c => {
            const statusColorVal =
              c.status === "active" || c.status === "verified" ? "#00ff8a" :
              c.status === "error" ? "#ff3355" :
              c.status === "pending" ? "#ffaa00" : TAB_C.dim;
            return (
              <div key={c.id} style={{
                background: "#000814", border: `1px solid ${c.last_error ? "#ff335540" : TAB_C.border}`,
                borderRadius: 4, padding: "10px 12px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 6, gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Globe className="w-3.5 h-3.5" style={{ color: statusColorVal, flexShrink: 0 }} />
                    <div style={{
                      fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: TAB_C.text,
                      textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {c.exchange}{c.label ? ` · ${c.label}` : ""}
                    </div>
                    {c.is_default && (
                      <span style={{
                        fontSize: 7, fontFamily: "monospace", fontWeight: 700,
                        color: "#cc55ff", border: "1px solid #cc55ff40", padding: "1px 4px",
                        borderRadius: 2, letterSpacing: "0.1em",
                      }}>DEFAULT</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 8, fontFamily: "monospace", fontWeight: 700,
                    color: statusColorVal, letterSpacing: "0.1em",
                    padding: "2px 6px", border: `1px solid ${statusColorVal}40`, borderRadius: 2,
                  }}>{c.status.toUpperCase()}</div>
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
                  fontSize: 9, fontFamily: "monospace",
                }}>
                  <div><span style={{ color: TAB_C.faint }}>MODE </span><span style={{
                    color: c.trading_mode === "live" ? "#ff8844" : "#00aaff",
                  }}>{c.trading_mode.toUpperCase()}</span></div>
                  <div><span style={{ color: TAB_C.faint }}>VERIFIED </span>
                    <span style={{ color: TAB_C.text }}>{fmtIsoAgo(c.last_verified_at)}</span></div>
                  <div><span style={{ color: TAB_C.faint }}>ADDED </span>
                    <span style={{ color: TAB_C.text }}>{fmtIsoAgo(c.created_at)}</span></div>
                </div>
                {c.last_error && (
                  <div style={{
                    marginTop: 6, padding: "5px 8px", fontSize: 9, fontFamily: "monospace",
                    color: "#ff8888", background: "#1a0808", borderRadius: 3,
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>⚠ {c.last_error.slice(0, 140)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TabSectionLabel icon={History}>CONNECTION ACTIVITY</TabSectionLabel>
      {loading && !detail ? null : timeline.length === 0 ? (
        <EmptyState>NO BROKER ACTIVITY RECORDED</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {timeline.map((t, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "6px 10px", background: "#000814",
              border: `1px solid ${TAB_C.border}`, borderRadius: 3,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: 3, marginTop: 5,
                background: t.color, boxShadow: `0 0 4px ${t.color}`,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                  color: TAB_C.text,
                }}>
                  <span style={{ color: t.color, fontSize: 7, letterSpacing: "0.1em" }}>{t.kind}</span>
                  <span>{t.label}</span>
                </div>
                {t.sub && (
                  <div style={{
                    fontSize: 8, fontFamily: "monospace", color: TAB_C.dim, marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{t.sub}</div>
                )}
              </div>
              <div style={{
                fontSize: 8, fontFamily: "monospace", color: TAB_C.faint, flexShrink: 0,
              }}>{fmtAgo(t.ts)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ENTITLEMENTS TAB ─────────────────────────────────────────────────────────
// CRM Phase A4 — per-user exchange governance / visibility / entitlements.
// Hydrates from the catalog ∪ this user's override rows; each toggle is
// audit-logged via /api/admin/users/:id/exchange-visibility. Presentational
// only — execution enforcement is intentionally deferred to a later phase.
function EntitlementsTab({ clerkUserId }: { clerkUserId: string }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibilityQuery = useQuery<{ exchanges: VisibilityRow[]; timestamp: number }>({
    queryKey: ["admin-user-exchange-visibility", clerkUserId],
    enabled:  Boolean(clerkUserId),
    staleTime: 10_000,
    queryFn: async () => {
      const res = await authFetch(`/api/admin/users/${clerkUserId}/exchange-visibility`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json() as { exchanges: VisibilityRow[]; timestamp: number };
    },
  });

  const setMutation = useMutation({
    mutationFn: async (args: { exchangeId: string; visible: boolean; note: string }) => {
      const res = await authFetch(`/api/admin/users/${clerkUserId}/exchange-visibility`, {
        method: "POST",
        body:   JSON.stringify(args),
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
      if (!res.ok) {
        throw new Error((json as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
      }
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-exchange-visibility", clerkUserId] });
      qc.invalidateQueries({ queryKey: ["admin-user-detail", clerkUserId] });
      toast({ title: "Visibility updated", description: "Override applied + audit-logged." });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message }),
    onSettled: () => setBusyId(null),
  });

  const clearMutation = useMutation({
    mutationFn: async (args: { exchangeId: string; note: string }) => {
      const res = await authFetch(
        `/api/admin/users/${clerkUserId}/exchange-visibility/${encodeURIComponent(args.exchangeId)}`,
        { method: "DELETE", body: JSON.stringify({ note: args.note }) },
      );
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
      if (!res.ok) {
        throw new Error((json as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
      }
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-exchange-visibility", clerkUserId] });
      qc.invalidateQueries({ queryKey: ["admin-user-detail", clerkUserId] });
      toast({ title: "Override cleared", description: "User reverts to catalog default." });
    },
    onError: (err: Error) => toast({ title: "Clear failed", description: err.message }),
    onSettled: () => setBusyId(null),
  });

  function handleToggle(row: VisibilityRow) {
    const next = !row.effectiveVisible;
    const note = window.prompt(
      `Audit note — ${next ? "show" : "hide"} ${row.exchangeName} for this user:`,
      "",
    );
    if (note === null) return;
    if (!note.trim()) { toast({ title: "Note required", description: "Audit-trail note cannot be empty." }); return; }
    setBusyId(row.exchangeId);
    setMutation.mutate({ exchangeId: row.exchangeId, visible: next, note: note.trim() });
  }

  function handleClear(row: VisibilityRow) {
    const note = window.prompt(`Audit note — clear ${row.exchangeName} override:`, "");
    if (note === null) return;
    if (!note.trim()) { toast({ title: "Note required", description: "Audit-trail note cannot be empty." }); return; }
    setBusyId(row.exchangeId);
    clearMutation.mutate({ exchangeId: row.exchangeId, note: note.trim() });
  }

  const rows = visibilityQuery.data?.exchanges ?? [];
  const overrides = rows.filter(r => r.override !== null).length;

  return (
    <div>
      <TabSectionLabel icon={Eye}>EXCHANGE VISIBILITY</TabSectionLabel>
      <div style={{
        fontSize: 9, fontFamily: "monospace", color: TAB_C.dim,
        padding: "0 2px 10px", lineHeight: 1.5,
      }}>
        Per-user exchange governance. Hidden exchanges are removed from
        this user's connect surfaces (presentational only — execution
        enforcement runs in a later phase). All changes audit-logged.
        <div style={{ marginTop: 4, color: TAB_C.faint }}>
          {overrides > 0
            ? `${overrides} active override${overrides === 1 ? "" : "s"} · catalog drives the rest`
            : "No overrides set — user sees catalog defaults"}
        </div>
      </div>

      {visibilityQuery.isLoading ? <TabLoading /> : rows.length === 0 ? (
        <EmptyState>CATALOG IS EMPTY</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(row => {
            const visible    = row.effectiveVisible;
            const hasOverride = row.override !== null;
            const isBusy     = busyId === row.exchangeId &&
              (setMutation.isPending || clearMutation.isPending);
            const statusColor =
              row.status === "live" ? "#00ff8a" :
              row.status === "beta" ? "#ffaa00" : "#7a9eb8";
            const visColor = visible ? "#00ff8a" : "#ff3355";
            const VisIcon  = visible ? Eye : EyeOff;
            return (
              <div key={row.exchangeId} style={{
                background: "#000814",
                border: `1px solid ${hasOverride ? "#cc55ff40" : TAB_C.border}`,
                borderRadius: 4, padding: "10px 12px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 6, gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <VisIcon className="w-3.5 h-3.5" style={{ color: visColor, flexShrink: 0 }} />
                    <div style={{
                      fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: TAB_C.text,
                      textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>{row.exchangeName}</div>
                    <span style={{
                      fontSize: 7, fontFamily: "monospace", fontWeight: 700,
                      color: statusColor, border: `1px solid ${statusColor}40`,
                      padding: "1px 4px", borderRadius: 2, letterSpacing: "0.1em",
                    }}>{row.status.toUpperCase().replace("_", " ")}</span>
                    {hasOverride && (
                      <span style={{
                        fontSize: 7, fontFamily: "monospace", fontWeight: 700,
                        color: "#cc55ff", border: "1px solid #cc55ff40",
                        padding: "1px 4px", borderRadius: 2, letterSpacing: "0.1em",
                      }}>OVERRIDE</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      disabled={isBusy}
                      onClick={() => handleToggle(row)}
                      style={{
                        fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                        padding: "4px 10px", borderRadius: 3, cursor: isBusy ? "wait" : "pointer",
                        background: visible ? "#1a0808" : "#04140a",
                        border: `1px solid ${visColor}55`, color: visColor,
                        letterSpacing: "0.1em", opacity: isBusy ? 0.5 : 1,
                      }}>
                      {visible ? "HIDE" : "SHOW"}
                    </button>
                    {hasOverride && (
                      <button
                        disabled={isBusy}
                        onClick={() => handleClear(row)}
                        title="Clear override — revert to catalog default"
                        style={{
                          padding: 5, borderRadius: 3, cursor: isBusy ? "wait" : "pointer",
                          background: "transparent", border: `1px solid ${TAB_C.border}`,
                          color: TAB_C.dim, display: "flex", alignItems: "center",
                          opacity: isBusy ? 0.5 : 1,
                        }}>
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
                  fontSize: 9, fontFamily: "monospace",
                }}>
                  <div><span style={{ color: TAB_C.faint }}>DEFAULT </span>
                    <span style={{ color: row.catalogDefault ? "#00ff8a" : "#ff3355" }}>
                      {row.catalogDefault ? "VISIBLE" : "HIDDEN"}
                    </span></div>
                  <div><span style={{ color: TAB_C.faint }}>EFFECTIVE </span>
                    <span style={{ color: visColor }}>
                      {visible ? "VISIBLE" : "HIDDEN"}
                    </span></div>
                  <div><span style={{ color: TAB_C.faint }}>UPDATED </span>
                    <span style={{ color: TAB_C.text }}>
                      {row.updatedAt ? fmtIsoAgo(row.updatedAt) : "—"}
                    </span></div>
                </div>
                {row.note && (
                  <div style={{
                    marginTop: 6, padding: "5px 8px", fontSize: 9, fontFamily: "monospace",
                    color: TAB_C.dim, background: "#040810",
                    border: `1px solid ${TAB_C.border}`, borderRadius: 3,
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    <span style={{ color: TAB_C.faint }}>NOTE </span>
                    {row.note.slice(0, 200)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TRADING TAB ──────────────────────────────────────────────────────────────
// Aggregate engine performance + recent positions + recent closes. Prefers
// detail aggregates when available; falls back to the grid row's totals
// during initial load so the operator never sees an empty surface.
function TradingTab({ detail, loading }: {
  detail: UserDetailResponse | null;
  loading: boolean;
}) {
  const agg = detail?.aggregates ?? null;
  const positions = detail?.positions ?? [];
  const closed    = detail?.closedTrades ?? [];

  return (
    <div>
      <TabSectionLabel icon={TrendingUp}>PERFORMANCE</TabSectionLabel>
      {loading && !detail ? <TabLoading /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <MetricCell label="REALIZED PNL"  value={fmtDollar(agg?.realizedPnl ?? 0)}
            color={pctColor(agg?.realizedPnl ?? 0)} />
          <MetricCell label="WIN RATE"      value={agg?.winRate != null ? `${(agg.winRate * 100).toFixed(1)}%` : "—"}
            color={(agg?.winRate ?? 0) >= 0.5 ? "#00ff8a" : "#ff8844"} />
          <MetricCell label="TRADES"        value={`${agg?.tradesCount ?? 0}`}
            sub={agg ? `${agg.wins}W / ${agg.losses}L` : undefined} />
          <MetricCell label="AVG CONF"      value={agg?.avgConfidence != null ? `${agg.avgConfidence.toFixed(1)}%` : "—"}
            color="#00aaff" />
          <MetricCell label="AVG LATENCY"   value={agg?.avgLatencyMs != null ? `${Math.round(agg.avgLatencyMs)}ms` : "—"} />
          <MetricCell label="ERROR EVENTS"  value={`${agg?.errorEventCount ?? 0}`}
            color={(agg?.errorEventCount ?? 0) > 0 ? "#ff8844" : TAB_C.dim} />
          <MetricCell label="FEES PAID"     value={fmtDollar(agg?.feesGenerated ?? 0)}
            color="#cc55ff" sub={agg ? `${agg.feeRecords} fee events` : undefined} />
          <MetricCell label="TRADES/DAY"    value={agg?.tradesPerDay != null ? agg.tradesPerDay.toFixed(2) : "—"}
            sub={agg ? `${agg.lifetimeDays.toFixed(0)}d lifetime` : undefined} />
          <MetricCell label="PROFITABLE PNL" value={fmtDollar(agg?.profitablePnl ?? 0)} color="#00ff8a" />
        </div>
      )}

      <TabSectionLabel icon={Activity}>OPEN POSITIONS</TabSectionLabel>
      {loading && !detail ? null : positions.length === 0 ? (
        <EmptyState>NO OPEN POSITIONS</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {positions.slice(0, 10).map((p, i) => {
            const live = p["exchange"] != null;
            const side = String(p["side"] ?? "").toUpperCase();
            return (
              <div key={String(p["id"] ?? i)} style={{
                display: "grid", gridTemplateColumns: "auto 60px 1fr auto auto",
                gap: 8, alignItems: "center", padding: "6px 10px",
                background: "#000814", border: `1px solid ${live ? "#ff884440" : TAB_C.border}`,
                borderRadius: 3, fontSize: 9, fontFamily: "monospace",
              }}>
                <span style={{
                  fontWeight: 700, color: side === "LONG" ? "#00ff8a" : "#ff3355",
                  letterSpacing: "0.1em",
                }}>{side}</span>
                <span style={{ color: TAB_C.text, fontWeight: 700 }}>{String(p["symbol"] ?? "—")}</span>
                <span style={{ color: TAB_C.dim }}>
                  {String(p["exchange"] ?? "PAPER").toUpperCase()} · qty {Number(p["quantity"] ?? 0).toFixed(4)}
                </span>
                <span style={{ color: TAB_C.text }}>{fmtDollar(Number(p["size_usd"] ?? 0))}</span>
                <span style={{ color: TAB_C.faint }}>{fmtMs(p["entry_time"])}</span>
              </div>
            );
          })}
        </div>
      )}

      <TabSectionLabel icon={History}>RECENT CLOSED TRADES</TabSectionLabel>
      {loading && !detail ? null : closed.length === 0 ? (
        <EmptyState>NO CLOSED TRADES YET</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {closed.slice(0, 10).map((t, i) => {
            const pnl  = Number(t["realized_pnl"] ?? 0);
            const live = t["exchange"] != null;
            const side = String(t["side"] ?? "").toUpperCase();
            return (
              <div key={String(t["id"] ?? i)} style={{
                display: "grid", gridTemplateColumns: "auto 60px 1fr auto auto",
                gap: 8, alignItems: "center", padding: "6px 10px",
                background: "#000814", border: `1px solid ${TAB_C.border}`,
                borderRadius: 3, fontSize: 9, fontFamily: "monospace",
              }}>
                <span style={{
                  fontWeight: 700, color: side === "LONG" ? "#00ff8a" : "#ff3355",
                  letterSpacing: "0.1em",
                }}>{side}</span>
                <span style={{ color: TAB_C.text, fontWeight: 700 }}>{String(t["symbol"] ?? "—")}</span>
                <span style={{ color: TAB_C.dim }}>
                  {live ? String(t["exchange"]).toUpperCase() : "PAPER"} · {String(t["close_reason"] ?? "exit")}
                </span>
                <span style={{ color: pctColor(pnl), fontWeight: 700 }}>{fmtDollar(pnl)}</span>
                <span style={{ color: TAB_C.faint }}>{fmtMs(t["exit_time"])}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
    queryFn: () => authFetch("/api/engine/status").then(r => r.json()),
    refetchInterval: 5000,
  });
  const { data: feeSummary }     = useQuery<FeeSummary>({
    queryKey: ["admin-fees"],
    queryFn: () => authFetch("/api/fees").then(r => r.json()),
    refetchInterval: 15000,
  });
  const { data: exchangeStatus } = useQuery<ExchangeStatus>({
    queryKey: ["admin-exchange"],
    queryFn: () => authFetch("/api/exchange/status").then(r => r.json()),
    refetchInterval: 8000,
  });

  // Real user list
  const { data: users = [], isLoading: usersLoading, isError: usersError, refetch } = useAdminUsers({
    q: search, plan: planFilter, status: statusFilter,
  });

  // Sync from Clerk (back-fills users who signed up but never opened /auth/me)
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
          <Shield className="w-4 h-4" style={{ color: "#cc55ff", filter: "drop-shadow(0 0 4px #cc55ff)" }} />
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
          <span className="live-dot" style={{ width: 6, height: 6, background: "#cc55ff", boxShadow: "0 0 5px #cc55ff" }} />
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
                  <th className="px-3 py-2.5 text-left"><span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>ACTIVE EXCHANGE</span></th>
                  <th className="px-3 py-2.5 text-left"><span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>CAP / 24H</span></th>
                  <ColHeader col="tradesCount"    label="TRADES" />
                  <ColHeader col="feesGenerated"  label="FEES" />
                  <ColHeader col="totalPnl"       label="PNL" />
                  <ColHeader col="winRate"        label="WIN %" />
                  <ColHeader col="mrrUsd"         label="MRR" />
                  <th className="px-3 py-2.5 text-left"><span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>AI 24H</span></th>
                  <th className="px-3 py-2.5 text-left"><span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>REVENUE</span></th>
                  <th className="px-3 py-2.5 text-left"><span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>SESSION</span></th>
                  <ColHeader col="lastActivityAt" label="LAST ACTIVE" />
                </tr>
              </thead>
              <tbody>
                {usersLoading && (
                  <tr><td colSpan={15} className="px-4 py-12 text-center">
                    <Loader2 className="w-5 h-5 inline-block animate-spin" style={{ color: "#cc55ff" }} />
                    <div className="text-[10px] font-mono mt-2" style={{ color: "#4a6a80" }}>Loading users from /api/admin/users…</div>
                  </td></tr>
                )}
                {usersError && !usersLoading && (
                  <tr><td colSpan={15} className="px-4 py-12 text-center">
                    <AlertTriangle className="w-5 h-5 inline-block" style={{ color: "#ff3355" }} />
                    <div className="text-[10px] font-mono mt-2" style={{ color: "#ff3355" }}>Failed to load users. Click REFRESH to retry.</div>
                  </td></tr>
                )}
                {!usersLoading && !usersError && paged.length === 0 && (
                  <tr><td colSpan={15} className="px-4 py-12 text-center">
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

                    {/* Active Exchange — CRM Phase A */}
                    <td className="px-3 py-2.5">
                      {u.activeExchange ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold font-mono uppercase" style={{ color: "#EAF2FF" }}>
                            {u.activeExchange.name}
                          </span>
                          <span className="text-[7px] font-bold font-mono px-1 py-0.5 rounded uppercase"
                            style={{
                              background: u.activeExchange.mode === "live" ? "#ff884414" : "#00aaff14",
                              color:      u.activeExchange.mode === "live" ? "#ff8844"   : "#00aaff",
                              border:    `1px solid ${u.activeExchange.mode === "live" ? "#ff884430" : "#00aaff30"}`,
                            }}>
                            {u.activeExchange.mode}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] font-mono" style={{ color: "#3a5a70" }}>—</span>
                      )}
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

                    {/* AI Usage 24h — CRM Phase A */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: u.aiUsage24h > 0 ? "#7b68ee" : "#3a5a70" }}>
                        {u.aiUsage24h}
                      </span>
                    </td>

                    {/* Revenue Generated — CRM Phase A (fees + current MRR) */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: u.revenueGenerated > 0 ? "#00ff8a" : "#3a5a70" }}>
                        {u.revenueGenerated > 0 ? fmtDollar(u.revenueGenerated) : "—"}
                      </span>
                    </td>

                    {/* Session Status — CRM Phase A (derived from lastActivityAt) */}
                    <td className="px-3 py-2.5">
                      {(() => {
                        const c = u.sessionStatus === "active" ? "#00ff8a"
                                : u.sessionStatus === "idle"   ? "#ffaa00" : "#4a6a80";
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 4px ${c}` }} />
                            <span className="text-[8px] font-bold font-mono uppercase" style={{ color: c }}>
                              {u.sessionStatus}
                            </span>
                          </div>
                        );
                      })()}
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

      {/* User intelligence panel (CRM Phase A2 — Profile/Exchanges/Trading/Actions) */}
      <UserIntelligencePanel
        user={selectedUser}
        onClose={() => setSelectedId(null)}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
