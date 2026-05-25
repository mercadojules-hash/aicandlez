/**
 * CRM Phase A3 — /admin/sessions
 *
 * Real session rows from `user_sessions` (Phase A3 backend). Each row
 * represents one Clerk session and exposes a revoke control that
 * marks the row revoked locally (rejected on the next request by
 * `requireAuth`) and best-effort revokes the Clerk session JWT too.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, Loader2, RefreshCw, AlertTriangle, Search, ShieldOff } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

type SessionStatus = "active" | "idle" | "offline" | "revoked";

interface SessionRow {
  id:               string;
  clerkSessionId:   string | null;
  clerkUserId:      string;
  email:            string | null;
  plan:             string | null;
  role:             string | null;
  ipAddress:        string | null;
  userAgent:        string | null;
  firstSeenAt:      string;
  lastSeenAt:       string;
  revokedAt:        string | null;
  revokedByAdminId: string | null;
  revokeReason:     string | null;
  status:           SessionStatus;
}

interface SessionsResponse {
  sessions: SessionRow[];
  counts:   { total: number; active: number; idle: number; offline: number; revoked: number };
  timestamp: number;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function shortUa(ua: string | null): string {
  if (!ua) return "—";
  const lower = ua.toLowerCase();
  let os = "Other";
  if (lower.includes("iphone") || lower.includes("ipad"))      os = "iOS";
  else if (lower.includes("android"))                          os = "Android";
  else if (lower.includes("mac os") || lower.includes("macintosh")) os = "macOS";
  else if (lower.includes("windows"))                          os = "Windows";
  else if (lower.includes("linux"))                            os = "Linux";
  let br = "";
  if (lower.includes("edg/"))            br = "Edge";
  else if (lower.includes("chrome/"))    br = "Chrome";
  else if (lower.includes("firefox/"))   br = "Firefox";
  else if (lower.includes("safari/"))    br = "Safari";
  return br ? `${br} · ${os}` : os;
}

function statusColor(s: SessionStatus): string {
  return s === "active"  ? "#00ff8a"
       : s === "idle"    ? "#ffaa00"
       : s === "revoked" ? "#ff3355"
       :                   "#4a6a80";
}

export default function AdminSessions() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<SessionStatus | "all">("active");
  const [q, setQ] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<SessionsResponse>({
    queryKey: ["admin-sessions", filter],
    queryFn: async () => {
      const res = await authFetch(`/api/admin/sessions?filter=all&pageSize=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<SessionsResponse>;
    },
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  const sessions = data?.sessions ?? [];
  const counts   = data?.counts ?? { total: 0, active: 0, idle: 0, offline: 0, revoked: 0 };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return sessions.filter(s => {
      if (filter !== "all" && s.status !== filter) return false;
      if (ql) {
        const hay = `${s.email ?? ""} ${s.clerkUserId} ${s.ipAddress ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [sessions, filter, q]);

  const revoke = useMutation({
    mutationFn: async (args: { sessionRowId: string; note: string }) => {
      const res = await authFetch(`/api/admin/sessions/${args.sessionRowId}/revoke`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ note: args.note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
  });

  const handleRevoke = (row: SessionRow) => {
    const note = window.prompt(
      `Revoke session for ${row.email ?? row.clerkUserId}?\n\nThis force-signs them out on the next request.\n\nOperator note (required):`,
      "",
    );
    if (!note || !note.trim()) return;
    revoke.mutate({ sessionRowId: row.id, note: note.trim() });
  };

  return (
    <div className="min-h-screen" style={{ background: "#060810", color: "#EAF2FF" }}>
      <div className="border-b px-6 py-4 flex items-center gap-4" style={{ background: "#000", borderColor: "#0d1e2e" }}>
        <div className="p-2 rounded" style={{ background: "#ff884412", border: "1px solid #ff884430" }}>
          <Radio className="w-4 h-4" style={{ color: "#ff8844", filter: "drop-shadow(0 0 4px #ff8844)" }} />
        </div>
        <div>
          <div className="text-[10px] font-mono font-bold tracking-[0.3em]" style={{ color: "#ff884480" }}>
            CRM · LIVE SESSIONS
          </div>
          <div className="text-[18px] font-bold font-mono tracking-[0.1em]">
            ACTIVE USER SESSIONS
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold"
          style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
        {/* ── Counters ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          {(["active", "idle", "offline", "revoked"] as const).map(k => {
            const c = statusColor(k);
            return (
              <div key={k} className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 4px ${c}` }} />
                  <span className="text-[9px] font-mono font-bold tracking-[0.2em] uppercase" style={{ color: c }}>
                    {k}
                  </span>
                </div>
                <div className="text-[28px] font-bold font-mono tabular-nums" style={{ color: c }}>
                  {counts[k]}
                </div>
                <div className="text-[8px] font-mono mt-1" style={{ color: "#4a6a80" }}>
                  {k === "active"  ? "Last seen < 2 min"
                  : k === "idle"   ? "Last seen < 30 min"
                  : k === "offline"? "Older or never"
                  :                  "Operator-revoked"}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Filter / Search bar ───────────────────────────────────────── */}
        <div className="rounded border overflow-hidden" style={{ borderColor: "#0d1e2e" }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: "#000", borderColor: "#0d1e2e" }}>
            <span className="text-[11px] font-bold font-mono tracking-[0.15em]">SESSION STREAM</span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded font-bold"
              style={{ background: "#ff884410", color: "#ff884480", border: "1px solid #ff884420" }}>
              {filtered.length} ROWS
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              {(["all", "active", "idle", "offline", "revoked"] as const).map(k => (
                <button key={k} onClick={() => setFilter(k)}
                  className="px-2.5 py-1 rounded font-mono text-[8px] font-bold border uppercase"
                  style={filter === k
                    ? { background: "#ff884414", color: "#ff8844", borderColor: "#ff884440" }
                    : { background: "transparent", color: "#4a6a80", borderColor: "#1a2a36" }}>
                  {k}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded border"
              style={{ background: "#010C18", borderColor: "#1a2a36" }}>
              <Search className="w-3 h-3" style={{ color: "#4a6a80" }} />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search email / ip / id…"
                className="bg-transparent font-mono text-[9px] outline-none w-48"
                style={{ color: "#EAF2FF" }} />
            </div>
          </div>

          <div className="overflow-x-auto" style={{ background: "#010C18" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #0d1e2e", background: "#000" }}>
                  {["STATUS", "USER", "PLAN", "DEVICE", "IP", "FIRST SEEN", "LAST SEEN", ""].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left">
                      <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="w-5 h-5 inline-block animate-spin" style={{ color: "#ff8844" }} />
                  </td></tr>
                )}
                {isError && !isLoading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center">
                    <AlertTriangle className="w-5 h-5 inline-block" style={{ color: "#ff3355" }} />
                    <div className="text-[10px] font-mono mt-2" style={{ color: "#ff3355" }}>Failed to load sessions.</div>
                  </td></tr>
                )}
                {!isLoading && !isError && filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center">
                    <div className="text-[10px] font-mono" style={{ color: "#4a6a80" }}>No sessions match this filter.</div>
                  </td></tr>
                )}
                {filtered.map((s, i) => {
                  const c = statusColor(s.status);
                  const revoked = s.status === "revoked";
                  return (
                    <tr key={s.id} className="border-b transition-all"
                      style={{ borderColor: "#0a1520", background: i % 2 === 0 ? "#010C18" : "#020E1E" }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full"
                            style={{ background: c, boxShadow: `0 0 4px ${c}` }} />
                          <span className="text-[8px] font-bold font-mono uppercase" style={{ color: c }}>
                            {s.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[10px] font-bold font-mono truncate" style={{ color: "#EAF2FF", maxWidth: 220 }}>
                          {s.email ?? "(unknown)"}
                        </div>
                        <div className="text-[8px] font-mono truncate" style={{ color: "#3a5a70", maxWidth: 240 }}>
                          {s.clerkUserId}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[8px] font-bold font-mono uppercase"
                          style={{ color: s.plan === "pro" ? "#cc55ff" : s.plan === "starter" ? "#00aaff" : "#4a6a80" }}>
                          {s.plan ?? "free"}
                        </span>
                        {s.role && s.role !== "user" && (
                          <span className="ml-1.5 text-[7px] font-bold font-mono px-1 py-0.5 rounded uppercase"
                            style={{ background: "#ff884414", color: "#ff8844", border: "1px solid #ff884430" }}>
                            {s.role}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[9px] font-mono" style={{ color: "#9FB3C8" }}>
                          {shortUa(s.userAgent)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[9px] font-mono" style={{ color: s.ipAddress ? "#7a9eb8" : "#3a5a70" }}>
                          {s.ipAddress ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono" style={{ color: "#9FB3C8" }}>
                          {fmtAgo(s.firstSeenAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono" style={{ color: revoked ? "#ff335580" : "#9FB3C8" }}>
                          {revoked
                            ? `revoked ${fmtAgo(s.revokedAt)}`
                            : fmtAgo(s.lastSeenAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {revoked ? (
                          <span className="text-[8px] font-mono uppercase" style={{ color: "#ff335580" }}>
                            revoked
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRevoke(s)}
                            disabled={revoke.isPending}
                            className="flex items-center gap-1 px-2 py-1 rounded border font-mono text-[8px] font-bold uppercase"
                            style={{
                              background:  "#ff335514",
                              borderColor: "#ff335530",
                              color:       "#ff3355",
                              opacity:     revoke.isPending ? 0.4 : 1,
                            }}>
                            <ShieldOff className="w-3 h-3" /> Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {revoke.isError && (
          <div className="rounded border p-3 text-[10px] font-mono"
            style={{ background: "#ff335508", borderColor: "#ff335530", color: "#ff3355" }}>
            Revoke failed: {(revoke.error as Error)?.message ?? "unknown error"}
          </div>
        )}
      </div>
    </div>
  );
}
