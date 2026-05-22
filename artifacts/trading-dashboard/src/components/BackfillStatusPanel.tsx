/**
 * BackfillStatusPanel
 *
 * Operator-facing panel that surfaces the nightly broker order-ID
 * back-fill scheduler. Renders the last-run summary (timestamp, duration,
 * matched / unmatched / ambiguous / errored counts for both open-side and
 * close-side), the next-scheduled-run countdown, and a "Run now" button
 * that triggers an out-of-band run via POST /api/admin/backfill-status/run.
 *
 * Failures render in red with the captured error message so an operator
 * doesn't have to grep server logs to see that a run blew up.
 *
 * Admin-gated: backend routes already enforce requireRole(["admin",
 * "super-admin"]); this panel is only rendered from admin-only surfaces
 * (SystemVerification / /syscheck).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, PlayCircle, CheckCircle2, XCircle, Clock } from "lucide-react";

// ── Types (mirror artifacts/api-server/src/lib/backfillScheduler.ts) ─────

interface PerExchangeStats {
  matched: number; unmatched: number; ambiguous: number;
  skipped: number; errored: number;
}
interface SideSummary {
  totalCandidates: number;
  matched:         number;
  unmatched:       number;
  ambiguous:       number;
  skipped?:        number;
  errored:         number;
  perExchange?:    Record<string, PerExchangeStats>;
}
interface BackfillRunRecord {
  startedAt:  number;
  finishedAt: number;
  durationMs: number;
  ok:         boolean;
  closeSide:  SideSummary | null;
  openSide:   SideSummary | null;
  error:      string | null;
}
interface BackfillStatus {
  enabled:   boolean;
  inFlight:  boolean;
  nextRunAt: number | null;
  lastRun:   BackfillRunRecord | null;
  history:   BackfillRunRecord[];
}

// ── API base (cross-origin in prod, same-origin in dev) ──────────────────

const API_BASE = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  (import.meta.env.BASE_URL ?? "/")
).replace(/\/$/, "");

// ── Helpers ──────────────────────────────────────────────────────────────

function ago(ts: number | null | undefined): string {
  if (!ts) return "never";
  const ms = Date.now() - ts;
  if (ms < 0)        return "just now";
  if (ms < 60_000)   return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function untilStr(ts: number | null | undefined): string {
  if (!ts) return "—";
  const ms = ts - Date.now();
  if (ms <= 0)         return "imminent";
  if (ms < 60_000)     return `in ${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000)  return `in ${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `in ${Math.round(ms / 3_600_000)}h`;
  return `in ${Math.round(ms / 86_400_000)}d`;
}

function durStr(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ── Sub-components ───────────────────────────────────────────────────────

function CountTile({
  label, value, tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "ok" | "warn" | "fail";
}) {
  const color =
    tone === "ok"   ? "text-emerald-400" :
    tone === "warn" ? "text-amber-300"   :
    tone === "fail" ? "text-red-400"     :
                      "text-foreground/80";
  return (
    <div className="flex flex-col gap-0.5 bg-muted/20 border border-border/30 rounded-lg px-3 py-2 min-w-[78px]">
      <div className={`text-base font-mono font-bold tabular-nums leading-none ${color}`}>
        {value}
      </div>
      <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-muted-foreground/60">
        {label}
      </div>
    </div>
  );
}

function SideBlock({ title, side }: { title: string; side: SideSummary | null }) {
  if (!side) {
    return (
      <div className="border border-border/30 rounded-xl p-3 bg-card/40">
        <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mb-2">
          {title}
        </div>
        <div className="text-xs text-muted-foreground/50">No data captured.</div>
      </div>
    );
  }
  return (
    <div className="border border-border/30 rounded-xl p-3 bg-card/40">
      <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mb-2">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        <CountTile label="Candidates" value={side.totalCandidates} />
        <CountTile label="Matched"    value={side.matched}    tone="ok" />
        <CountTile label="Unmatched"  value={side.unmatched}  tone={side.unmatched > 0 ? "warn" : "neutral"} />
        <CountTile label="Ambiguous"  value={side.ambiguous}  tone={side.ambiguous > 0 ? "warn" : "neutral"} />
        <CountTile label="Errored"    value={side.errored}    tone={side.errored   > 0 ? "fail" : "neutral"} />
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────

export function BackfillStatusPanel() {
  const qc = useQueryClient();

  const { data, isLoading, isFetching, refetch, isError } = useQuery<BackfillStatus>({
    queryKey: ["admin-backfill-status"],
    queryFn:  async () => {
      const r = await fetch(`${API_BASE}/api/admin/backfill-status`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<BackfillStatus>;
    },
    refetchInterval: 15_000,
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_BASE}/api/admin/backfill-status/run`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["admin-backfill-status"] });
    },
  });

  const last = data?.lastRun ?? null;
  const okBadge = last
    ? last.ok
      ? { label: "OK",     cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" }
      : { label: "FAILED", cls: "bg-red-500/15 text-red-300 border-red-500/40" }
    : { label: "NO RUNS",  cls: "bg-muted/30 text-muted-foreground border-border/40" };

  const border = last && !last.ok
    ? "border-red-500/40"
    : "border-border/40";

  const isRunning = runNow.isPending || data?.inFlight === true;

  return (
    <div className={`bg-card border ${border} rounded-xl p-4 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Clock className="w-4 h-4 text-muted-foreground/60" />
        <span className="text-sm font-semibold tracking-wide">
          Nightly Broker Back-Fill
        </span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${okBadge.cls}`}>
          {okBadge.label}
        </span>
        {data && !data.enabled && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border bg-muted/30 text-muted-foreground border-border/40">
            SCHEDULER DISABLED
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/40 bg-card text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            title="Refresh status"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => runNow.mutate()}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            title="Trigger an out-of-band back-fill run now"
          >
            <PlayCircle className={`w-3.5 h-3.5 ${isRunning ? "animate-pulse" : ""}`} />
            {isRunning ? "Running…" : "Run now"}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground/60 flex items-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Loading back-fill status…
        </div>
      )}

      {isError && !isLoading && (
        <div className="text-xs text-red-400">
          Failed to load back-fill status — check API connectivity.
        </div>
      )}

      {!isLoading && data && (
        <>
          {/* Run-level metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CountTile
              label="Last run"
              value={last ? ago(last.startedAt) : "—"}
            />
            <CountTile
              label="Duration"
              value={last ? durStr(last.durationMs) : "—"}
            />
            <CountTile
              label="Next run"
              value={data.nextRunAt ? untilStr(data.nextRunAt) : "—"}
            />
            <CountTile
              label="In flight"
              value={data.inFlight ? "YES" : "no"}
              tone={data.inFlight ? "warn" : "neutral"}
            />
          </div>

          {/* Failure detail */}
          {last && !last.ok && last.error && (
            <div className="border border-red-500/40 bg-red-500/10 rounded-lg px-3 py-2 text-xs text-red-300 font-mono break-all flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{last.error}</span>
            </div>
          )}

          {/* Per-side blocks */}
          {last ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <SideBlock title="Close-side reconciliation" side={last.closeSide} />
              <SideBlock title="Open-side reconciliation"  side={last.openSide}  />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground/60">
              No back-fill has run yet on this server. The scheduler runs ~5 minutes after boot and every 24h thereafter, or you can trigger one manually with "Run now".
            </div>
          )}

          {/* Recent history */}
          {data.history.length > 1 && (
            <div className="mt-1">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mb-1.5">
                Recent runs ({data.history.length})
              </div>
              <div className="border border-border/30 rounded-lg overflow-hidden">
                <table className="w-full text-[11px] font-mono">
                  <thead className="bg-muted/30 text-muted-foreground/60">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium">Started</th>
                      <th className="text-left px-2 py-1 font-medium">Duration</th>
                      <th className="text-left px-2 py-1 font-medium">Result</th>
                      <th className="text-right px-2 py-1 font-medium">Close M/U/A/E</th>
                      <th className="text-right px-2 py-1 font-medium">Open M/U/A/E</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.slice(0, 10).map((h, i) => (
                      <tr key={`${h.startedAt}-${i}`} className="border-t border-border/20">
                        <td className="px-2 py-1 text-foreground/80">
                          {ago(h.startedAt)}
                        </td>
                        <td className="px-2 py-1 text-foreground/70">
                          {durStr(h.durationMs)}
                        </td>
                        <td className="px-2 py-1">
                          {h.ok ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> ok
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400">
                              <XCircle className="w-3 h-3" /> fail
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right text-foreground/70">
                          {h.closeSide
                            ? `${h.closeSide.matched}/${h.closeSide.unmatched}/${h.closeSide.ambiguous}/${h.closeSide.errored}`
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right text-foreground/70">
                          {h.openSide
                            ? `${h.openSide.matched}/${h.openSide.unmatched}/${h.openSide.ambiguous}/${h.openSide.errored}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default BackfillStatusPanel;
