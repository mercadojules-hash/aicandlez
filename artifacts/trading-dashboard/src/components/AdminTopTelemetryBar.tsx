/**
 * AdminTopTelemetryBar
 *
 * Always-on horizontal operator strip rendered directly under the
 * trading-dashboard top header for admin/super-admin users. Surfaces
 * 15 real-time metrics in a single scrollable line so an operator
 * never loses sight of platform health while navigating modules.
 *
 * Data source: GET /api/admin/top-telemetry (real DB + engine state,
 * never simulated). Polls every 5s. If the request fails or returns
 * `null` for a field, the cell renders an em-dash so mock/missing data
 * is visually distinct from live values.
 *
 * Also surfaces a Back-Fill health indicator (GET /api/admin/backfill-status):
 * when the most-recent nightly broker order-ID back-fill run had
 * `ok === false` or any `errored > 0`, a red, pulsing "BACK-FILL" tile
 * appears. Clicking it opens a modal with the captured error and the
 * per-side rollup so the operator doesn't have to navigate to the
 * /syscheck panel just to triage. The indicator clears automatically
 * the next time a healthy run lands.
 *
 * Admin-only at render time (Layout gates on `useUserRole().isAdmin`);
 * backend mirrors this with requireRole(["admin","super-admin"]).
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, X, CheckCircle2, Mail, MailX } from "lucide-react";

import { authFetch } from "../lib/authFetch";
interface TopTelemetry {
  activeUsersNow:            number;
  totalRegisteredUsers:      number;
  totalUserTrades:           number;
  tradesToday:               number;
  platformPnlUsd:            number;
  feesCollectedUsd:          number;
  activeExchangeConnections: number;
  activeAiExecutions:        number;
  liveSubscriptions:         number;
  monthlyRevenueUsd:         number;
  failedTrades:              number;
  systemUptimeSec:           number;
  websocketStatus:           "online" | "offline";
  queueThroughputPerMin:     number;
  apiLatencyMs:              number;
  engineRunning:              boolean;
  operatorEmailConfigured:    boolean;
  lastOperatorEmailSuccessAt: number | null;
  timestamp:                  number;
}

// ── Back-fill status (mirror artifacts/api-server/src/lib/backfillScheduler.ts) ──

interface BackfillSideSummary {
  totalCandidates: number;
  matched:         number;
  unmatched:       number;
  ambiguous:       number;
  errored:         number;
}
interface BackfillRunRecord {
  startedAt:  number;
  finishedAt: number;
  durationMs: number;
  ok:         boolean;
  closeSide:  BackfillSideSummary | null;
  openSide:   BackfillSideSummary | null;
  error:      string | null;
}
interface BackfillStatus {
  enabled:   boolean;
  inFlight:  boolean;
  nextRunAt: number | null;
  lastRun:   BackfillRunRecord | null;
  history:   BackfillRunRecord[];
}

// Resolve API base URL. In production trade./admintrade. is served by a
// static host while /api lives on api.aicandlez.com — so we must use the
// cross-origin VITE_API_BASE_URL. In dev it falls back to same-origin so
// the local reverse proxy handles routing.
const API_BASE = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  (import.meta.env.BASE_URL ?? "/")
).replace(/\/$/, "");

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs  = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtInt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  const m = Math.floor((sec %  3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ago(ts: number | null | undefined): string {
  if (!ts) return "never";
  const ms = Date.now() - ts;
  if (ms < 0)          return "just now";
  if (ms < 60_000)     return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000)  return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function Cell({
  label, value, tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warn" | "accent";
}) {
  const color =
    tone === "positive" ? "#00ff8a" :
    tone === "negative" ? "#ff3355" :
    tone === "warn"     ? "#ffaa00" :
    tone === "accent"   ? "#00f0ff" :
                          "#EAF2FF";
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 shrink-0 border-r min-w-[88px]"
         style={{ borderRightColor: "#0d1e2e" }}>
      <div className="text-[14px] font-bold font-mono tabular-nums leading-none"
           style={{ color }}>
        {value}
      </div>
      <div className="text-[8px] font-mono uppercase tracking-[0.12em] font-medium"
           style={{ color: "#5a7a90" }}>
        {label}
      </div>
    </div>
  );
}

/** Compute whether the latest back-fill run is unhealthy. */
function backfillIsUnhealthy(s: BackfillStatus | undefined): boolean {
  const last = s?.lastRun;
  if (!last) return false;
  if (last.ok === false) return true;
  if ((last.closeSide?.errored ?? 0) > 0) return true;
  if ((last.openSide?.errored  ?? 0) > 0) return true;
  return false;
}

function BackfillFailureModal({
  status, onClose,
}: {
  status: BackfillStatus;
  onClose: () => void;
}) {
  const last = status.lastRun;
  const closeErr = last?.closeSide?.errored ?? 0;
  const openErr  = last?.openSide?.errored  ?? 0;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0, 5, 10, 0.78)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Back-fill failure details"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border bg-card p-5 flex flex-col gap-4"
        style={{ borderColor: "#ff335555", boxShadow: "0 0 32px #ff335530" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ff5566" }} />
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: "#ff8899" }}>
              Nightly back-fill {last?.ok === false ? "FAILED" : "completed with errors"}
            </div>
            <div className="text-[11px] font-mono mt-0.5" style={{ color: "#7ab8cc" }}>
              {last ? `Last run ${ago(last.startedAt)} · duration ${last.durationMs}ms` : "No runs recorded"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted/30 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {last?.error && (
          <div
            className="rounded-lg px-3 py-2 text-xs font-mono break-all"
            style={{ background: "#ff335515", border: "1px solid #ff335540", color: "#ffb0b8" }}
          >
            {last.error}
          </div>
        )}

        {last && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">
                Close side
              </div>
              {last.closeSide ? (
                <div className="text-xs font-mono space-y-0.5">
                  <div>Matched   <span className="text-emerald-400">{last.closeSide.matched}</span></div>
                  <div>Unmatched <span className="text-amber-300">{last.closeSide.unmatched}</span></div>
                  <div>Ambiguous <span className="text-amber-300">{last.closeSide.ambiguous}</span></div>
                  <div>Errored   <span style={{ color: closeErr > 0 ? "#ff5566" : "#9fb8c8" }}>{last.closeSide.errored}</span></div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/60">No data captured.</div>
              )}
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">
                Open side
              </div>
              {last.openSide ? (
                <div className="text-xs font-mono space-y-0.5">
                  <div>Matched   <span className="text-emerald-400">{last.openSide.matched}</span></div>
                  <div>Unmatched <span className="text-amber-300">{last.openSide.unmatched}</span></div>
                  <div>Ambiguous <span className="text-amber-300">{last.openSide.ambiguous}</span></div>
                  <div>Errored   <span style={{ color: openErr > 0 ? "#ff5566" : "#9fb8c8" }}>{last.openSide.errored}</span></div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/60">No data captured.</div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" />
            Indicator clears automatically when the next healthy run lands.
          </div>
          <a
            href="/syscheck"
            className="text-[11px] font-mono px-2.5 py-1 rounded-lg border border-border/40 bg-card hover:border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Open full panel →
          </a>
        </div>
      </div>
    </div>
  );
}

export function AdminTopTelemetryBar() {
  const { data, isError } = useQuery<TopTelemetry>({
    queryKey: ["adminTopTelemetry"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/api/admin/top-telemetry`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<TopTelemetry>;
    },
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
    retry: 1,
  });

  const { data: backfill } = useQuery<BackfillStatus>({
    queryKey: ["adminTopTelemetry:backfill"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/api/admin/backfill-status`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<BackfillStatus>;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    retry: 1,
  });

  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const backfillBad = backfillIsUnhealthy(backfill);

  // Operator email transport test state. Kept ultra-light — no toast lib
  // dependency, just inline status text the operator sees for ~6s.
  const [emailTestState, setEmailTestState] =
    useState<"idle" | "sending" | "sent" | "error">("idle");
  const triggerEmailTest = async () => {
    if (emailTestState === "sending") return;
    setEmailTestState("sending");
    try {
      const res = await authFetch(`${API_BASE}/api/admin/operator-email-test`, {
        method:      "POST",
        credentials: "include",
      });
      setEmailTestState(res.ok ? "sent" : "error");
    } catch {
      setEmailTestState("error");
    }
    setTimeout(() => setEmailTestState("idle"), 6_000);
  };
  const emailConfigured  = data?.operatorEmailConfigured === true;
  const lastEmailOkAt    = data?.lastOperatorEmailSuccessAt ?? null;
  const lastEmailOkLabel = lastEmailOkAt ? ago(lastEmailOkAt) : "never";

  const dash = "—";
  const v = (n: number | undefined, fmt: (x: number) => string): string =>
    typeof n === "number" && Number.isFinite(n) ? fmt(n) : dash;

  // Live tone signals
  const pnlTone     = (data?.platformPnlUsd ?? 0) >= 0 ? "positive" : "negative";
  const wsTone      = data?.websocketStatus === "online" ? "positive" : "negative";
  const latencyTone =
    typeof data?.apiLatencyMs === "number"
      ? data.apiLatencyMs < 50 ? "positive"
      : data.apiLatencyMs < 200 ? "warn"
      : "negative"
      : "neutral";
  const failedTone  = (data?.failedTrades ?? 0) > 0 ? "warn" : "neutral";

  return (
    <>
      <div
        className="h-10 shrink-0 border-b flex items-center overflow-x-auto whitespace-nowrap sticky top-10 z-40"
        style={{
          background:        "linear-gradient(180deg, #000508 0%, #000a14 100%)",
          borderBottomColor: "#0D2035",
          boxShadow:         "0 1px 0 #00eeff08, 0 2px 8px #00000060",
        }}
        role="status"
        aria-label="Operator telemetry"
      >
        {/* Leading status dot + label */}
        <div className="flex items-center gap-2 px-3 shrink-0 border-r"
             style={{ borderRightColor: "#0d1e2e" }}>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background:  isError ? "#ff3355" : data?.engineRunning ? "#00ff8a" : "#ffaa00",
              boxShadow:   isError ? "0 0 6px #ff335580" : "0 0 6px #00ff8a80",
            }}
          />
          <span className="text-[9px] font-bold font-mono uppercase tracking-[0.18em]"
                style={{ color: isError ? "#ff5566" : "#7ab8cc" }}>
            {isError ? "Telemetry offline" : "Operator · Live"}
          </span>
        </div>

        {/* Back-fill failure indicator — only renders when unhealthy. */}
        {backfillBad && backfill && (
          <button
            type="button"
            onClick={() => setShowBackfillModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-r transition-colors"
            style={{
              borderRightColor: "#0d1e2e",
              background:       "#ff335518",
            }}
            title="Nightly back-fill is unhealthy — click for details"
            aria-label="Back-fill failure — open details"
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "#ff3355", boxShadow: "0 0 8px #ff3355cc" }}
            />
            <div className="flex flex-col gap-0.5 leading-none text-left">
              <div className="text-[12px] font-bold font-mono tabular-nums"
                   style={{ color: "#ff5566" }}>
                {backfill.lastRun?.ok === false
                  ? "FAILED"
                  : `${(backfill.lastRun?.closeSide?.errored ?? 0) + (backfill.lastRun?.openSide?.errored ?? 0)} err`}
              </div>
              <div className="text-[8px] font-mono uppercase tracking-[0.12em] font-medium"
                   style={{ color: "#ff99a8" }}>
                Back-Fill
              </div>
            </div>
          </button>
        )}

        {/* Operator email transport pill — green when all three env vars
            are set, red otherwise. Click to fire a real test alert through
            sendOperatorAlert (dedupeKey: operator-email-test). */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-r"
          style={{
            borderRightColor: "#0d1e2e",
            background:       emailConfigured ? "#00ff8a10" : "#ff335518",
          }}
          title={
            emailConfigured
              ? `Operator email transport configured (RESEND_API_KEY + FROM + TO set). Last successful delivery: ${lastEmailOkLabel}.`
              : "Operator email NOT configured — alerts log only. Set RESEND_API_KEY, OPERATOR_ALERT_EMAIL_FROM, OPERATOR_ALERT_EMAIL_TO."
          }
        >
          {emailConfigured
            ? <Mail  className="w-3 h-3 shrink-0" style={{ color: "#00ff8a" }} />
            : <MailX className="w-3 h-3 shrink-0" style={{ color: "#ff5566" }} />}
          <div className="flex flex-col gap-0.5 leading-none">
            <div
              className="text-[11px] font-bold font-mono tabular-nums"
              style={{ color: emailConfigured ? "#00ff8a" : "#ff5566" }}
            >
              {emailConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
            </div>
            <div
              className="text-[8px] font-mono uppercase tracking-[0.12em] font-medium"
              style={{ color: emailConfigured ? "#7ad9a8" : "#ff99a8" }}
            >
              Operator Email
            </div>
          </div>
          {emailConfigured && (
            <div
              className="flex flex-col gap-0.5 leading-none pl-2 ml-1 border-l"
              style={{ borderLeftColor: "#0d1e2e" }}
              title={`Last successful operator-email delivery: ${lastEmailOkLabel}`}
            >
              <div
                className="text-[11px] font-bold font-mono tabular-nums"
                style={{ color: lastEmailOkAt ? "#7ad9a8" : "#ffaa00" }}
              >
                {lastEmailOkLabel}
              </div>
              <div
                className="text-[8px] font-mono uppercase tracking-[0.12em] font-medium"
                style={{ color: "#5a7a90" }}
              >
                Last Delivery
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={triggerEmailTest}
            disabled={emailTestState === "sending"}
            className="text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border ml-1 transition-colors disabled:opacity-50"
            style={{
              borderColor:
                emailTestState === "error" ? "#ff3355" :
                emailTestState === "sent"  ? "#00ff8a" :
                                             "#0d1e2e",
              color:
                emailTestState === "error" ? "#ff5566" :
                emailTestState === "sent"  ? "#00ff8a" :
                                             "#7ab8cc",
            }}
            aria-label="Send test operator alert"
            title="Fire a test operator alert (sendOperatorAlert, dedupeKey: operator-email-test). Check server logs and on-call inbox."
          >
            {emailTestState === "sending" ? "Sending…" :
             emailTestState === "sent"    ? "Sent ✓"   :
             emailTestState === "error"   ? "Failed"   :
                                            "Test"}
          </button>
        </div>

        <Cell label="Active Now"    value={v(data?.activeUsersNow,            fmtInt)}  tone="accent"   />
        <Cell label="Total Users"   value={v(data?.totalRegisteredUsers,      fmtInt)}                  />
        <Cell label="Total Trades"  value={v(data?.totalUserTrades,           fmtInt)}                  />
        <Cell label="Trades 24h"    value={v(data?.tradesToday,               fmtInt)}                  />
        <Cell label="Platform PnL"  value={v(data?.platformPnlUsd,            fmtUsd)}  tone={pnlTone}  />
        <Cell label="Fees"          value={v(data?.feesCollectedUsd,          fmtUsd)}  tone="warn"     />
        <Cell label="Connections"   value={v(data?.activeExchangeConnections, fmtInt)}  tone="accent"   />
        <Cell label="AI Execs"      value={v(data?.activeAiExecutions,        fmtInt)}                  />
        <Cell label="Live Subs"     value={v(data?.liveSubscriptions,         fmtInt)}  tone="positive" />
        <Cell label="MRR"           value={v(data?.monthlyRevenueUsd,         fmtUsd)}  tone="warn"     />
        <Cell label="Failed"        value={v(data?.failedTrades,              fmtInt)}  tone={failedTone}/>
        <Cell label="Uptime"        value={v(data?.systemUptimeSec,           fmtUptime)}               />
        <Cell label="WS"            value={data?.websocketStatus
                                             ? data.websocketStatus.toUpperCase()
                                             : dash} tone={wsTone}                                     />
        <Cell label="Queue/min"     value={v(data?.queueThroughputPerMin,     n => n.toFixed(1))}       />
        <Cell label="API Latency"   value={v(data?.apiLatencyMs,              n => `${Math.round(n)}ms`)}
                                                                                        tone={latencyTone}/>
      </div>

      {showBackfillModal && backfill && (
        <BackfillFailureModal status={backfill} onClose={() => setShowBackfillModal(false)} />
      )}
    </>
  );
}
