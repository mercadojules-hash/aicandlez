import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, Banknote, CheckCircle2, Gift, RefreshCw, Search,
  ShieldCheck, Wallet, X,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Phase F — Admin Billing Console
// ─────────────────────────────────────────────────────────────────────────────
//
// Operator surface for the Phase A–C billing stack. Consumes the read-only
// admin endpoints (GET /api/admin/billing/hold_queue, GET
// /api/admin/users/:id/billing) and the three already-shipped operator
// actions (add_credits, waive_fees, restore_billing). All mutations require
// a non-empty `note` (server validates).
//
// Strict invariants preserved:
//   - Read-only views never call mutate.
//   - waive_fees and restore_billing are super-admin only (UI hides buttons).
//   - No Kraken/queue/loop/auth surface touched.
//   - No customer-portal surface here — admin domain only.
// ─────────────────────────────────────────────────────────────────────────────

interface HoldRow {
  userId:      string;
  email:       string | null;
  plan:        string;
  status:      string;
  reason:      string | null;
  since:       string;
  outstanding: number;
  credits:     number;
}
interface HoldQueueResponse {
  count: number;
  holds: HoldRow[];
}
interface BillingHealth {
  userId:        string;
  plan:          string;
  threshold:     number | null;
  outstanding:   number;
  credits:       number;
  netOwed:       number;
  shouldHold:    boolean;
  currentStatus: string;
  reason:        string;
}
interface FeeRow {
  id:               string;
  tradeId:          string | null;
  symbol:           string | null;
  realizedPnl:      number | string;
  feeAmountUsd:     number | string;
  settlementStatus: string;
  isPaper:          boolean;
  createdAt:        string;
}
interface CreditTxRow {
  id:                    string;
  amountUsd:             number | string;
  type:                  string;
  balanceAfter:          number | string;
  note:                  string | null;
  stripePaymentIntentId: string | null;
  actorAdminId:          string | null;
  createdAt:             string;
}
interface BillingDetail {
  health:         BillingHealth;
  recentFees:     FeeRow[];
  recentCreditTx: CreditTxRow[];
}

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : typeof v === "number" ? v : parseFloat(v) || 0;

// ── Auth-wrapped fetch (mirrors Admin.tsx pattern) ──────────────────────────
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

// ── Hooks ───────────────────────────────────────────────────────────────────
function useHoldQueue() {
  const authFetch = useAuthFetch();
  return useQuery<HoldQueueResponse>({
    queryKey: ["billing-hold-queue"],
    queryFn: async () => {
      const res = await authFetch("/api/admin/billing/hold_queue");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<HoldQueueResponse>;
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

function useBillingDetail(userId: string | null) {
  const authFetch = useAuthFetch();
  return useQuery<BillingDetail>({
    queryKey: ["billing-detail", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await authFetch(`/api/admin/users/${encodeURIComponent(userId!)}/billing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<BillingDetail>;
    },
    staleTime: 5_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat tile
// ─────────────────────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, accent, sub }: {
  icon: React.ElementType; label: string; value: string; accent: string; sub?: string;
}) {
  return (
    <div className="rounded border p-4 flex flex-col gap-2"
      style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
      <div className="flex items-center justify-between">
        <div className="p-1.5 rounded" style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: accent, filter: `drop-shadow(0 0 6px ${accent})` }} />
        </div>
      </div>
      <div>
        <div className="text-[22px] font-bold font-mono tabular-nums leading-none" style={{ color: accent }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// User action drawer
// ─────────────────────────────────────────────────────────────────────────────
type ActionPanel = "add_credits" | "waive_fees" | "restore" | null;

function BillingActionDrawer({ userId, onClose, isSuperAdmin }: {
  userId: string | null;
  onClose: () => void;
  isSuperAdmin: boolean;
}) {
  const authFetch = useAuthFetch();
  const qc        = useQueryClient();
  const { data, isLoading, error, refetch } = useBillingDetail(userId);
  const [panel, setPanel] = useState<ActionPanel>(null);
  const [note, setNote]   = useState("");
  const [amount, setAmount] = useState<string>("25");

  const mutation = useMutation({
    mutationFn: async (args: { path: string; body: Record<string, unknown> }) => {
      const res = await authFetch(`/api/admin/users/${encodeURIComponent(userId!)}/${args.path}`, {
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
    onSuccess: () => {
      setPanel(null);
      setNote("");
      setAmount("25");
      void refetch();
      void qc.invalidateQueries({ queryKey: ["billing-hold-queue"] });
      toast({ title: "Action applied", description: "Audit row written." });
    },
    onError: (err) => {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (!userId) return null;
  const h = data?.health;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[480px] h-full overflow-y-auto border-l"
        style={{ background: "#01060C", borderColor: "#0d1e2e" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b"
          style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4" style={{ color: "#66FF66" }} />
            <div className="text-[11px] font-mono font-bold tracking-[0.18em] uppercase"
              style={{ color: "#9FB3C8" }}>
              Billing — {userId.slice(0, 16)}…
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: "#9FB3C8" }} />
          </button>
        </div>

        {isLoading && (
          // P2-AD-03 — skeleton in place of plain "Loading…" text.
          <div className="p-5 space-y-5 animate-pulse">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((k) => (
                <div key={k} className="rounded border p-4 h-[88px]"
                  style={{ background: "#010C18", borderColor: "#0d1e2e" }} />
              ))}
            </div>
            <div className="space-y-2">
              {[0, 1, 2].map((k) => (
                <div key={k} className="rounded border h-[44px]"
                  style={{ background: "#010C18", borderColor: "#0d1e2e" }} />
              ))}
            </div>
            <div className="rounded border h-[140px]"
              style={{ background: "#010C18", borderColor: "#0d1e2e" }} />
          </div>
        )}
        {error && (
          // P2-AD-03 — retry button on error.
          <div className="m-5 p-4 rounded border text-[11px] font-mono"
            style={{ background: "rgba(255,90,90,0.06)", borderColor: "rgba(255,90,90,0.32)", color: "#FF8A8A" }}>
            <div className="mb-3">
              Failed to load: {error instanceof Error ? error.message : "unknown"}
            </div>
            <button
              onClick={() => void refetch()}
              className="px-3 py-1.5 rounded border font-mono text-[10px] uppercase tracking-wider flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,90,90,0.32)", color: "#FF8A8A" }}
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {h && (
          <div className="p-5 space-y-5">
            {/* Health snapshot */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Wallet} label="Credits"     value={`$${h.credits.toFixed(2)}`}     accent="#66FF66" />
              <StatTile icon={AlertTriangle} label="Outstanding" value={`$${h.outstanding.toFixed(2)}`} accent="#FFC75A" />
              <StatTile icon={Activity} label="Net Owed"   value={`$${h.netOwed.toFixed(2)}`}     accent={h.netOwed > 0 ? "#FFC75A" : "#9FB3C8"} />
              <StatTile icon={ShieldCheck} label="Status" value={h.currentStatus.toUpperCase()}
                accent={h.currentStatus === "billing_hold" ? "#FF5577" : h.currentStatus === "active" ? "#66FF66" : "#9FB3C8"}
                sub={h.threshold !== null ? `Threshold $${h.threshold.toFixed(2)}` : "No threshold"} />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setPanel("add_credits")}
                className="flex items-center justify-between px-4 py-3 rounded border font-mono text-[11px] uppercase tracking-wider"
                style={{ background: "rgba(102,255,102,0.06)", borderColor: "rgba(102,255,102,0.32)", color: "#66FF66" }}
              >
                <span className="flex items-center gap-2"><Gift className="w-3.5 h-3.5" /> Add Credits</span>
                <span style={{ color: "#9FB3C8" }}>Operator</span>
              </button>
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => setPanel("waive_fees")}
                    className="flex items-center justify-between px-4 py-3 rounded border font-mono text-[11px] uppercase tracking-wider"
                    style={{ background: "rgba(255,199,90,0.06)", borderColor: "rgba(255,199,90,0.32)", color: "#FFC75A" }}
                  >
                    <span className="flex items-center gap-2"><Banknote className="w-3.5 h-3.5" /> Waive Outstanding Fees</span>
                    <span style={{ color: "#9FB3C8" }}>Super-Admin</span>
                  </button>
                  <button
                    onClick={() => setPanel("restore")}
                    disabled={h.currentStatus !== "billing_hold"}
                    className="flex items-center justify-between px-4 py-3 rounded border font-mono text-[11px] uppercase tracking-wider disabled:opacity-40"
                    style={{ background: "rgba(102,200,255,0.06)", borderColor: "rgba(102,200,255,0.32)", color: "#66C8FF" }}
                  >
                    <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" /> Force Restore Billing</span>
                    <span style={{ color: "#9FB3C8" }}>Super-Admin</span>
                  </button>
                </>
              )}
            </div>

            {/* Action form */}
            {panel && (
              <div className="rounded border p-4 space-y-3"
                style={{ background: "#01060C", borderColor: "#0d1e2e" }}>
                <div className="text-[10px] font-mono font-bold tracking-widest uppercase"
                  style={{ color: "#66FF66" }}>
                  {panel === "add_credits"  ? "Add credits" :
                   panel === "waive_fees"   ? "Waive all pending fees" :
                   "Force restore billing"}
                </div>
                {panel === "add_credits" && (
                  <input
                    type="number" min={0.01} step={0.01} value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="USD amount"
                    className="w-full px-3 py-2 rounded border bg-black/40 font-mono text-[12px]"
                    style={{ borderColor: "#0d1e2e", color: "#E8F5EC" }}
                  />
                )}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Audit note (required)"
                  rows={3}
                  className="w-full px-3 py-2 rounded border bg-black/40 font-mono text-[11px]"
                  style={{ borderColor: "#0d1e2e", color: "#E8F5EC" }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPanel(null); setNote(""); }}
                    className="flex-1 px-3 py-2 rounded border font-mono text-[10px] uppercase tracking-wider"
                    style={{ background: "transparent", borderColor: "#0d1e2e", color: "#9FB3C8" }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={
                      mutation.isPending ||
                      !note.trim() ||
                      (panel === "add_credits" && (!parseFloat(amount) || parseFloat(amount) <= 0))
                    }
                    onClick={() => {
                      if (panel === "add_credits") {
                        mutation.mutate({
                          path: "add_credits",
                          body: { amount: parseFloat(amount), type: "adjustment", note: note.trim() },
                        });
                      } else if (panel === "waive_fees") {
                        mutation.mutate({ path: "waive_fees", body: { note: note.trim() } });
                      } else {
                        mutation.mutate({ path: "restore_billing", body: { note: note.trim() } });
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded font-mono text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
                    style={{ background: "#66FF66", color: "#000" }}
                  >
                    {mutation.isPending ? "Working…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}

            {/* Recent credit transactions */}
            <div>
              <div className="text-[9px] font-mono font-bold tracking-widest uppercase mb-2"
                style={{ color: "#9FB3C8" }}>
                Recent Credit Ledger ({data?.recentCreditTx.length ?? 0})
              </div>
              <div className="rounded border overflow-hidden"
                style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
                {(data?.recentCreditTx ?? []).length === 0 ? (
                  <div className="p-4 text-[10px] font-mono text-center" style={{ color: "#4a6a80" }}>
                    No credit transactions
                  </div>
                ) : (
                  <table className="w-full text-[10px] font-mono">
                    <thead style={{ background: "#01060C", color: "#4a6a80" }}>
                      <tr>
                        <th className="text-left px-3 py-2">When</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-right px-3 py-2">Amount</th>
                        <th className="text-right px-3 py-2">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.recentCreditTx.slice(0, 10).map((t) => (
                        <tr key={t.id} className="border-t" style={{ borderColor: "#0d1e2e", color: "#E8F5EC" }}>
                          <td className="px-3 py-2">{new Date(t.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2" style={{ color: "#66FF66" }}>{t.type}</td>
                          <td className="px-3 py-2 text-right">+${num(t.amountUsd).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">${num(t.balanceAfter).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Recent fees */}
            <div>
              <div className="text-[9px] font-mono font-bold tracking-widest uppercase mb-2"
                style={{ color: "#9FB3C8" }}>
                Recent Fees ({data?.recentFees.length ?? 0})
              </div>
              <div className="rounded border overflow-hidden"
                style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
                {(data?.recentFees ?? []).length === 0 ? (
                  <div className="p-4 text-[10px] font-mono text-center" style={{ color: "#4a6a80" }}>
                    No fees recorded
                  </div>
                ) : (
                  <table className="w-full text-[10px] font-mono">
                    <thead style={{ background: "#01060C", color: "#4a6a80" }}>
                      <tr>
                        <th className="text-left px-3 py-2">When</th>
                        <th className="text-left px-3 py-2">Symbol</th>
                        <th className="text-right px-3 py-2">PnL</th>
                        <th className="text-right px-3 py-2">Fee</th>
                        <th className="text-left px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.recentFees.slice(0, 10).map((f) => (
                        <tr key={f.id} className="border-t" style={{ borderColor: "#0d1e2e", color: "#E8F5EC" }}>
                          <td className="px-3 py-2">{new Date(f.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2">{f.symbol ?? "—"}</td>
                          <td className="px-3 py-2 text-right" style={{ color: num(f.realizedPnl) >= 0 ? "#66FF66" : "#FF5577" }}>
                            {num(f.realizedPnl) >= 0 ? "+" : ""}${num(f.realizedPnl).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">${num(f.feeAmountUsd).toFixed(2)}</td>
                          <td className="px-3 py-2"
                            style={{
                              color: f.settlementStatus === "settled" ? "#66FF66" :
                                     f.settlementStatus === "waived"  ? "#9FB3C8" :
                                     "#FFC75A",
                            }}>
                            {f.settlementStatus}{f.isPaper ? " (paper)" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function BillingAdmin() {
  const { isSuperAdmin } = useUserRole();
  const queue = useHoldQueue();
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [manualLookup, setManualLookup] = useState("");

  // P2-AD-05 — Cross-nav landing target. Other admin pages
  // (e.g. CommandCenter → OperatorTelemetryGrid) link here as
  // /admin/billing?user=<clerkUserId> to open the drawer directly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const u  = qs.get("user")?.trim();
    if (!u) return;
    if (!/^(user|clerk)_[A-Za-z0-9]{20,}$/.test(u)) return;
    setSelectedUserId(u);
    // Strip the param so navigating around the drawer doesn't re-trigger.
    const url = new URL(window.location.href);
    url.searchParams.delete("user");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const filteredHolds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return queue.data?.holds ?? [];
    return (queue.data?.holds ?? []).filter((r) =>
      (r.email ?? "").toLowerCase().includes(q) ||
      r.userId.toLowerCase().includes(q),
    );
  }, [queue.data, query]);

  const totals = useMemo(() => {
    const holds = queue.data?.holds ?? [];
    return {
      held:           holds.length,
      totalOutstanding: holds.reduce((s, r) => s + (r.outstanding ?? 0), 0),
      totalCredits:     holds.reduce((s, r) => s + (r.credits ?? 0), 0),
    };
  }, [queue.data]);

  return (
    <div className="min-h-screen" style={{ background: "#000" }}>
      <div className="px-6 py-5 border-b" style={{ borderColor: "#0d1e2e" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold tracking-[0.22em] uppercase"
              style={{ color: "#66FF66" }}>
              Phase F · Admin Billing Console
            </div>
            <div className="text-[22px] font-bold mt-1" style={{ color: "#E8F5EC" }}>
              Billing Operations
            </div>
            <div className="text-[11px] mt-1 font-mono" style={{ color: "#9FB3C8" }}>
              BILLING_HOLD queue · prepaid credits · fee ledger · waive / restore
            </div>
          </div>
          <button
            onClick={() => queue.refetch()}
            className="px-3 py-2 rounded border font-mono text-[10px] uppercase tracking-wider flex items-center gap-2"
            style={{ background: "rgba(102,255,102,0.06)", borderColor: "rgba(102,255,102,0.32)", color: "#66FF66" }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-3 px-6 py-5">
        <StatTile icon={AlertTriangle} label="On Hold" value={String(totals.held)} accent="#FF5577" />
        <StatTile icon={Banknote} label="Total Outstanding (held)" value={`$${totals.totalOutstanding.toFixed(2)}`} accent="#FFC75A" />
        <StatTile icon={Wallet} label="Total Credits (held)" value={`$${totals.totalCredits.toFixed(2)}`} accent="#66FF66" />
      </div>

      {/* Lookup any user (not just held) */}
      <div className="px-6 pb-3 flex items-end gap-2">
        <div className="flex-1">
          <div className="text-[9px] font-mono font-bold tracking-widest uppercase mb-1"
            style={{ color: "#9FB3C8" }}>Open Any User</div>
          <input
            value={manualLookup}
            onChange={(e) => setManualLookup(e.target.value)}
            placeholder="user_xxx clerk id"
            className="w-full px-3 py-2 rounded border bg-black/40 font-mono text-[11px]"
            style={{ borderColor: "#0d1e2e", color: "#E8F5EC" }}
          />
        </div>
        <button
          onClick={() => {
            // P2-AD-02 — validate Clerk id shape before firing the API call.
            // Clerk Backend ids are `user_<base62>` (typical length ≥ 25).
            // Accept both `user_` and legacy `clerk_` prefixes defensively.
            const v = manualLookup.trim();
            if (!v) return;
            const ok = /^(user|clerk)_[A-Za-z0-9]{20,}$/.test(v);
            if (!ok) {
              toast({
                title:       "Invalid Clerk user id",
                description: "Expected format: user_xxxxxxxxxxxxxxxxxxxx (Clerk backend id).",
                variant:     "destructive",
              });
              return;
            }
            setSelectedUserId(v);
          }}
          className="px-4 py-2 rounded font-mono text-[10px] uppercase tracking-wider font-bold"
          style={{ background: "#66FF66", color: "#000" }}
        >
          Open
        </button>
      </div>

      {/* Hold queue */}
      <div className="px-6 pb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono font-bold tracking-widest uppercase"
            style={{ color: "#9FB3C8" }}>
            Billing-Hold Queue · {filteredHolds.length} of {totals.held}
          </div>
          <div className="relative w-72">
            <Search className="absolute left-2 top-2.5 w-3.5 h-3.5" style={{ color: "#4a6a80" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter by email / id"
              className="w-full pl-8 pr-3 py-2 rounded border bg-black/40 font-mono text-[11px]"
              style={{ borderColor: "#0d1e2e", color: "#E8F5EC" }}
            />
          </div>
        </div>

        <div className="rounded border overflow-hidden"
          style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
          {queue.isLoading && (
            <div className="p-8 text-center text-[11px] font-mono" style={{ color: "#4a6a80" }}>
              Loading queue…
            </div>
          )}
          {!queue.isLoading && filteredHolds.length === 0 && (
            // P2-AD-01 — friendly empty state with status graphic for the
            // healthy zero-holds case; keep terse copy for filter misses.
            totals.held === 0 ? (
              <div className="px-6 py-12 flex flex-col items-center text-center gap-3">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{
                    background:   "rgba(102,255,102,0.08)",
                    border:       "1px solid rgba(102,255,102,0.35)",
                    boxShadow:    "0 0 24px rgba(102,255,102,0.18)",
                  }}
                >
                  <CheckCircle2 className="w-7 h-7" style={{ color: "#66FF66" }} />
                </div>
                <div className="text-[13px] font-bold font-mono tracking-wider uppercase"
                  style={{ color: "#66FF66" }}>
                  All Clear
                </div>
                <div className="max-w-[420px] text-[11px] font-mono leading-relaxed"
                  style={{ color: "#9FB3C8" }}>
                  No customers are currently on a billing hold. This is a
                  healthy state — fees are settling, credits are covering,
                  and live execution is unblocked across the platform.
                </div>
                <div className="text-[9px] font-mono tracking-widest uppercase mt-1"
                  style={{ color: "#4a6a80" }}>
                  Queue auto-refreshes every 15s
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-[11px] font-mono" style={{ color: "#4a6a80" }}>
                No matches for current filter.
              </div>
            )
          )}
          {filteredHolds.length > 0 && (
            <table className="w-full text-[11px] font-mono">
              <thead style={{ background: "#01060C", color: "#4a6a80" }}>
                <tr>
                  <th className="text-left px-3 py-2">Held Since</th>
                  <th className="text-left px-3 py-2">User</th>
                  <th className="text-left px-3 py-2">Plan</th>
                  <th className="text-right px-3 py-2">Outstanding</th>
                  <th className="text-right px-3 py-2">Credits</th>
                  <th className="text-left px-3 py-2">Reason</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredHolds.map((r) => (
                  <tr key={r.userId} className="border-t" style={{ borderColor: "#0d1e2e", color: "#E8F5EC" }}>
                    <td className="px-3 py-2">{new Date(r.since).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div>{r.email ?? <span style={{ color: "#4a6a80" }}>—</span>}</div>
                      <div className="text-[9px]" style={{ color: "#4a6a80" }}>{r.userId.slice(0, 18)}…</div>
                    </td>
                    <td className="px-3 py-2 uppercase" style={{ color: "#66FF66" }}>{r.plan}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "#FFC75A" }}>
                      ${(r.outstanding ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: "#66FF66" }}>
                      ${(r.credits ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-[10px]" style={{ color: "#9FB3C8" }}>{r.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setSelectedUserId(r.userId)}
                        className="px-3 py-1 rounded border font-mono text-[9px] uppercase tracking-wider"
                        style={{ background: "rgba(102,255,102,0.06)", borderColor: "rgba(102,255,102,0.32)", color: "#66FF66" }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <BillingActionDrawer
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
