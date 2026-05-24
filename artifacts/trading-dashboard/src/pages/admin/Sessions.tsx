/**
 * CRM Phase A — /admin/sessions
 *
 * Live Sessions surface. Foundation page for the Phase A3 sessions /
 * device-tracking infrastructure. Today it surfaces the operator-grade
 * "who is online right now" view derived from the lastActivityAt
 * heuristic baked into adminUserTelemetry (sessionStatus ∈
 * active|idle|offline). Real session rows (sessionId, IP, UA, revoke)
 * land in A3 against the `user_sessions` table — UI shape lives here
 * already so the swap-in is data-only.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Radio, Loader2, RefreshCw, AlertTriangle, Search } from "lucide-react";

interface SessionUserRow {
  clerkUserId: string;
  email: string;
  plan: string;
  adminStatus: string;
  sessionStatus: "active" | "idle" | "offline";
  lastActivityAt: number | null;
  activeExchange: { name: string; mode: string } | null;
  aiUsage24h: number;
  exchangesConnected: number;
  hasLiveExchange: boolean;
  onlineNow: boolean;
}

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

function fmtAgo(ms: number | null): string {
  if (!ms) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function sessionColor(s: SessionUserRow["sessionStatus"]) {
  return s === "active" ? "#00ff8a" : s === "idle" ? "#ffaa00" : "#4a6a80";
}

export default function AdminSessions() {
  const authFetch = useAuthFetch();
  const [filter, setFilter] = useState<"all" | "active" | "idle" | "offline">("active");
  const [q, setQ] = useState("");

  const { data: users = [], isLoading, isError, refetch } = useQuery<SessionUserRow[]>({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      // Backend caps pageSize at 200; requesting more silently truncates.
      const res = await authFetch(`/api/admin/users?pageSize=200&sort=lastActivityAt&dir=desc`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { users?: SessionUserRow[] };
      return body.users ?? [];
    },
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return users.filter(u => {
      if (filter !== "all" && u.sessionStatus !== filter) return false;
      if (ql && !u.email.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [users, filter, q]);

  const counts = useMemo(() => ({
    active:  users.filter(u => u.sessionStatus === "active").length,
    idle:    users.filter(u => u.sessionStatus === "idle").length,
    offline: users.filter(u => u.sessionStatus === "offline").length,
  }), [users]);

  return (
    <div className="min-h-screen" style={{ background: "#060810", color: "#EAF2FF" }}>
      <div className="border-b px-6 py-4 flex items-center gap-4" style={{ background: "#000", borderColor: "#0d1e2e" }}>
        <div className="p-2 rounded" style={{ background: "#ff884412", border: "1px solid #ff884430" }}>
          <Radio className="w-4 h-4" style={{ color: "#ff8844", filter: "drop-shadow(0 0 6px #ff8844)" }} />
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
        <div className="grid grid-cols-3 gap-3">
          {(["active", "idle", "offline"] as const).map(k => {
            const c = sessionColor(k);
            return (
              <div key={k} className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                  <span className="text-[9px] font-mono font-bold tracking-[0.2em] uppercase" style={{ color: c }}>
                    {k}
                  </span>
                </div>
                <div className="text-[28px] font-bold font-mono tabular-nums" style={{ color: c }}>
                  {counts[k]}
                </div>
                <div className="text-[8px] font-mono mt-1" style={{ color: "#4a6a80" }}>
                  {k === "active"  ? "Last activity < 2 min"  : k === "idle" ? "Last activity < 30 min" : "Older or never"}
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
              {(["all", "active", "idle", "offline"] as const).map(k => (
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
                placeholder="Search email…"
                className="bg-transparent font-mono text-[9px] outline-none w-36"
                style={{ color: "#EAF2FF" }} />
            </div>
          </div>

          <div className="overflow-x-auto" style={{ background: "#010C18" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #0d1e2e", background: "#000" }}>
                  {["SESSION", "USER", "PLAN", "ADMIN STATUS", "ACTIVE EXCHANGE", "EXCHANGES", "AI USAGE 24H", "LAST ACTIVITY"].map(h => (
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
                {filtered.map((u, i) => {
                  const c = sessionColor(u.sessionStatus);
                  return (
                    <tr key={u.clerkUserId} className="border-b transition-all"
                      style={{ borderColor: "#0a1520", background: i % 2 === 0 ? "#010C18" : "#020E1E" }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full"
                            style={{ background: c, boxShadow: `0 0 4px ${c}` }} />
                          <span className="text-[8px] font-bold font-mono uppercase" style={{ color: c }}>
                            {u.sessionStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[10px] font-bold font-mono truncate" style={{ color: "#EAF2FF", maxWidth: 220 }}>
                          {u.email}
                        </div>
                        <div className="text-[8px] font-mono truncate" style={{ color: "#3a5a70", maxWidth: 240 }}>
                          {u.clerkUserId}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[8px] font-bold font-mono uppercase" style={{ color: u.plan === "pro" ? "#cc55ff" : u.plan === "starter" ? "#00aaff" : "#4a6a80" }}>
                          {u.plan || "free"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[8px] font-bold font-mono uppercase" style={{ color: u.adminStatus === "active" ? "#00ff8a" : "#ff8844" }}>
                          {u.adminStatus}
                        </span>
                      </td>
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
                        ) : <span className="text-[10px] font-mono" style={{ color: "#3a5a70" }}>—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.hasLiveExchange ? "#ff8844" : "#00aaff" }}>
                          {u.exchangesConnected}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.aiUsage24h > 0 ? "#7b68ee" : "#3a5a70" }}>
                          {u.aiUsage24h}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono" style={{ color: "#9FB3C8" }}>
                          {fmtAgo(u.lastActivityAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Foundation note ─────────────────────────────────────────── */}
        <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#1a2a36" }}>
          <div className="text-[9px] font-mono font-bold tracking-[0.2em] mb-2" style={{ color: "#ff884480" }}>
            FOUNDATION NOTE — PHASE A3
          </div>
          <div className="text-[10px] font-mono leading-relaxed" style={{ color: "#7a9eb8" }}>
            Session status here is derived from the user's <code>lastActivityAt</code> heuristic
            (active &lt; 2 min · idle &lt; 30 min · offline ≥ 30 min). Real per-session rows —
            sessionId, IP address, device/UA, revocation — land in CRM Phase A3 against the
            new <code style={{ color: "#ff8844" }}>user_sessions</code> table. The UI shape and
            filter primitives are committed today so the A3 swap-in is data-only.
          </div>
        </div>
      </div>
    </div>
  );
}
