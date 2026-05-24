/**
 * CRM Phase A — /admin/activity
 *
 * Platform-wide user activity stream. Ranks users by recent engagement
 * (lastActivityAt + aiUsage24h + tradesToday) so operators can spot
 * who's actually using the system right now. Reads /api/admin/users
 * with sort=lastActivityAt — no new endpoint required.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Activity, Loader2, RefreshCw, AlertTriangle, TrendingUp, Zap } from "lucide-react";

interface ActivityRow {
  clerkUserId: string;
  email: string;
  plan: string;
  adminStatus: string;
  sessionStatus: "active" | "idle" | "offline";
  lastActivityAt: number | null;
  activeExchange: { name: string; mode: string } | null;
  aiUsage24h: number;
  tradesToday: number;
  tradesCount: number;
  totalPnl: number;
  openPositions: number;
  revenueGenerated: number;
  onlineNow: boolean;
}

function useAuthFetch() {
  const { getToken } = useAuth();
  return async (p: string, init: RequestInit = {}) => {
    const t = await getToken().catch(() => null);
    const h: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) };
    if (t) h["Authorization"] = `Bearer ${t}`;
    return fetch(p, { ...init, headers: h });
  };
}

function fmtAgo(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function fmtDollar(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1_000).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(0)}`;
}

function pnlColor(n: number) { return n > 0 ? "#00ff8a" : n < 0 ? "#ff3355" : "#9FB3C8"; }

export default function AdminUserActivity() {
  const authFetch = useAuthFetch();
  const { data: users = [], isLoading, isError, refetch } = useQuery<ActivityRow[]>({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      // Backend caps pageSize at 200; requesting more silently truncates.
      const res = await authFetch(`/api/admin/users?pageSize=200&sort=lastActivityAt&dir=desc`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { users?: ActivityRow[] };
      return body.users ?? [];
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const metrics = useMemo(() => {
    const onlineNow   = users.filter(u => u.onlineNow).length;
    const totalAi24h  = users.reduce((s, u) => s + (u.aiUsage24h || 0), 0);
    const tradesToday = users.reduce((s, u) => s + (u.tradesToday || 0), 0);
    const engagedNow  = users.filter(u => u.aiUsage24h > 0 || u.tradesToday > 0).length;
    return { onlineNow, totalAi24h, tradesToday, engagedNow };
  }, [users]);

  // Engagement score: weighted blend so the "live" feed isn't dominated by
  // stale-but-rich accounts. Recent activity dominates, AI usage adds, trades add.
  const ranked = useMemo(() => {
    const now = Date.now();
    return [...users].sort((a, b) => {
      const score = (u: ActivityRow) => {
        const recencyMins = u.lastActivityAt ? (now - u.lastActivityAt) / 60_000 : 99_999;
        const recencyScore = Math.max(0, 1440 - recencyMins);
        return recencyScore + (u.aiUsage24h || 0) * 5 + (u.tradesToday || 0) * 20;
      };
      return score(b) - score(a);
    });
  }, [users]);

  return (
    <div className="min-h-screen" style={{ background: "#060810", color: "#EAF2FF" }}>
      <div className="border-b px-6 py-4 flex items-center gap-4" style={{ background: "#000", borderColor: "#0d1e2e" }}>
        <div className="p-2 rounded" style={{ background: "#00f0ff12", border: "1px solid #00f0ff30" }}>
          <Activity className="w-4 h-4" style={{ color: "#00f0ff", filter: "drop-shadow(0 0 6px #00f0ff)" }} />
        </div>
        <div>
          <div className="text-[10px] font-mono font-bold tracking-[0.3em]" style={{ color: "#00f0ff80" }}>
            CRM · USER ACTIVITY
          </div>
          <div className="text-[18px] font-bold font-mono tracking-[0.1em]">PLATFORM ACTIVITY STREAM</div>
        </div>
        <div className="flex-1" />
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold"
          style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Online Now",      value: metrics.onlineNow.toString(),                 color: "#00ff8a" },
            { label: "Engaged 24h",     value: metrics.engagedNow.toString(),                color: "#00f0ff" },
            { label: "AI Events 24h",   value: metrics.totalAi24h.toLocaleString(),          color: "#7b68ee" },
            { label: "Trades 24h",      value: metrics.tradesToday.toLocaleString(),         color: "#ff8844" },
          ].map(m => (
            <div key={m.label} className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
              <div className="text-[28px] font-bold font-mono tabular-nums" style={{ color: m.color }}>{m.value}</div>
              <div className="text-[9px] font-mono font-bold tracking-[0.15em] mt-1.5 uppercase" style={{ color: "#9FB3C8" }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded border overflow-hidden" style={{ borderColor: "#0d1e2e" }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: "#000", borderColor: "#0d1e2e" }}>
            <span className="text-[11px] font-bold font-mono tracking-[0.15em]">ENGAGEMENT FEED</span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded font-bold"
              style={{ background: "#00f0ff10", color: "#00f0ff80", border: "1px solid #00f0ff20" }}>
              RANKED BY RECENT ACTIVITY
            </span>
            <div className="flex-1" />
            <span className="text-[8px] font-mono" style={{ color: "#4a6a80" }}>
              Auto-refresh: 10s
            </span>
          </div>

          <div className="overflow-x-auto" style={{ background: "#010C18" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #0d1e2e", background: "#000" }}>
                  {["USER", "SESSION", "PLAN", "EXCHANGE", "AI 24H", "TRADES 24H", "OPEN POS", "PNL", "REVENUE", "LAST ACTIVITY"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left">
                      <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center">
                    <Loader2 className="w-5 h-5 inline-block animate-spin" style={{ color: "#00f0ff" }} />
                  </td></tr>
                )}
                {isError && !isLoading && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center">
                    <AlertTriangle className="w-5 h-5 inline-block" style={{ color: "#ff3355" }} />
                  </td></tr>
                )}
                {ranked.slice(0, 50).map((u, i) => {
                  const sc = u.sessionStatus === "active" ? "#00ff8a" : u.sessionStatus === "idle" ? "#ffaa00" : "#4a6a80";
                  return (
                    <tr key={u.clerkUserId} className="border-b"
                      style={{ borderColor: "#0a1520", background: i % 2 === 0 ? "#010C18" : "#020E1E" }}>
                      <td className="px-3 py-2.5">
                        <div className="text-[10px] font-bold font-mono truncate" style={{ color: "#EAF2FF", maxWidth: 220 }}>
                          {u.email}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc, boxShadow: `0 0 4px ${sc}` }} />
                          <span className="text-[8px] font-bold font-mono uppercase" style={{ color: sc }}>
                            {u.sessionStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[8px] font-bold font-mono uppercase"
                          style={{ color: u.plan === "pro" ? "#cc55ff" : u.plan === "starter" ? "#00aaff" : "#4a6a80" }}>
                          {u.plan || "free"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {u.activeExchange ? (
                          <span className="text-[9px] font-bold font-mono uppercase" style={{ color: "#EAF2FF" }}>
                            {u.activeExchange.name} <span style={{ color: u.activeExchange.mode === "live" ? "#ff8844" : "#00aaff" }}>·{u.activeExchange.mode}</span>
                          </span>
                        ) : <span className="text-[9px] font-mono" style={{ color: "#3a5a70" }}>—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" style={{ color: u.aiUsage24h > 0 ? "#7b68ee" : "#3a5a70" }} />
                          <span className="text-[10px] font-bold font-mono" style={{ color: u.aiUsage24h > 0 ? "#7b68ee" : "#3a5a70" }}>
                            {u.aiUsage24h}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.tradesToday > 0 ? "#ff8844" : "#3a5a70" }}>
                          {u.tradesToday}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.openPositions > 0 ? "#00aaff" : "#3a5a70" }}>
                          {u.openPositions}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {u.totalPnl !== 0 && <TrendingUp className="w-2.5 h-2.5" style={{ color: pnlColor(u.totalPnl) }} />}
                          <span className="text-[10px] font-bold font-mono" style={{ color: pnlColor(u.totalPnl) }}>
                            {fmtDollar(u.totalPnl)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold font-mono" style={{ color: u.revenueGenerated > 0 ? "#00ff8a" : "#3a5a70" }}>
                          {fmtDollar(u.revenueGenerated)}
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
      </div>
    </div>
  );
}
