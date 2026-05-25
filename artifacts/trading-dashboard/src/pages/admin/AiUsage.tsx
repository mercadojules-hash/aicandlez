/**
 * PLATFORM ADMIN — /admin/ai-usage
 *
 * Aggregate AI execution + signal telemetry across every user. Powers
 * the "AI Usage" sidebar entry under PLATFORM ADMIN.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, RefreshCw, Search, AlertTriangle, Zap } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

interface PerUserRow {
  userId:         string;
  email:          string | null;
  role:           string | null;
  plan:           string | null;
  aiEnabled:      boolean;
  trades24h:      number;
  liveTrades24h:  number;
  paperTrades24h: number;
  tradesLifetime: number;
  pnl24h:         number;
  pnlLifetime:    number;
  lastTradeAt:    string | null;
}

interface Global {
  signalsLifetime:   number;
  signalsLastMinute: number;
  mtfPassRate:       number;
  engineTickCount:   number;
  engineUptimeSec:   number;
  tradesLifetime:    number;
  trades24h:         number;
  liveTrades24h:     number;
  paperTrades24h:    number;
  pnl24h:            number;
  activeTraders24h:  number;
  aiEnabledUsers:    number;
}

interface Resp { global: Global; perUser: PerUserRow[]; timestamp: number }

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export default function AdminAiUsage() {
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState<"all"|"free"|"starter"|"pro">("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<Resp>({
    queryKey: ["admin-ai-usage"],
    queryFn: async () => {
      const r = await authFetch("/api/admin/ai-usage");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Resp>;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [] as PerUserRow[];
    const needle = q.trim().toLowerCase();
    return data.perUser.filter(r => {
      if (planFilter !== "all" && (r.plan ?? "free") !== planFilter) return false;
      if (!needle) return true;
      return (r.email?.toLowerCase().includes(needle))
          || r.userId.toLowerCase().includes(needle);
    });
  }, [data, q, planFilter]);

  const g = data?.global;

  return (
    <div className="min-h-full p-4 md:p-6" style={{ background: "#000508" }}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Brain className="w-4 h-4" style={{ color: "#cc55ff" }} />
          <h1 className="font-mono text-[13px] font-bold tracking-[0.18em]" style={{ color: "#EAF2FF" }}>
            AI USAGE
          </h1>
          <span className="text-[9px] font-mono tracking-[0.2em] uppercase" style={{ color: "#3a5a70" }}>
            Engine throughput · per-user AI activity
          </span>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-mono"
          style={{ borderColor: "#0E2235", color: "#7a9eb8", background: "#010C18" }}>
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          REFRESH
        </button>
      </header>

      {/* Engine telemetry */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Cell label="SIGNALS / LIFETIME"     value={g ? g.signalsLifetime.toLocaleString() : "—"} accent="#cc55ff" />
        <Cell label="SIGNALS / MIN"          value={g ? g.signalsLastMinute.toFixed(1) : "—"}      accent="#00f0ff" />
        <Cell label="MTF PASS RATE"          value={g ? `${(g.mtfPassRate * 100).toFixed(1)}%` : "—"} accent="#00ff8a" />
        <Cell label="ENGINE TICKS"           value={g ? g.engineTickCount.toLocaleString() : "—"} accent="#00aaff" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Cell label="TRADES / 24H"           value={g ? g.trades24h.toLocaleString() : "—"}        accent="#00aaff" />
        <Cell label="LIVE / 24H"             value={g ? g.liveTrades24h.toLocaleString() : "—"}    accent="#00ff8a" />
        <Cell label="PAPER / 24H"            value={g ? g.paperTrades24h.toLocaleString() : "—"}   accent="#7a9eb8" />
        <Cell label="PnL / 24H"              value={g ? fmtUsd(g.pnl24h) : "—"}
              accent={(g?.pnl24h ?? 0) >= 0 ? "#00ff8a" : "#ff3355"} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        <Cell label="ACTIVE TRADERS / 24H"   value={g ? g.activeTraders24h.toLocaleString() : "—"} accent="#00ff8a" />
        <Cell label="AI-ENABLED USERS"       value={g ? g.aiEnabledUsers.toLocaleString() : "—"}   accent="#cc55ff" />
        <Cell label="TRADES / LIFETIME"      value={g ? g.tradesLifetime.toLocaleString() : "—"}   accent="#00aaff" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded border flex-1 min-w-[200px]"
          style={{ background: "#010C18", borderColor: "#0E2235" }}>
          <Search className="w-3 h-3" style={{ color: "#3a5a70" }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="search email · user id"
            className="bg-transparent border-none outline-none text-[10px] font-mono flex-1"
            style={{ color: "#EAF2FF" }} />
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded border"
          style={{ background: "#010C18", borderColor: "#0E2235" }}>
          <span className="text-[8px] font-bold font-mono tracking-[0.18em]" style={{ color: "#3a5a70" }}>PLAN</span>
          {(["all","free","starter","pro"] as const).map(p => (
            <button key={p} onClick={() => setPlanFilter(p)}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase"
              style={{
                background: planFilter === p ? "#cc55ff20" : "transparent",
                color:      planFilter === p ? "#cc55ff"   : "#7a9eb8",
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Per-user table */}
      <div className="rounded border overflow-x-auto" style={{ background: "#010C18", borderColor: "#0E2235" }}>
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2" style={{ color: "#3a5a70" }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-[10px] font-mono">LOADING…</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center py-12 gap-2" style={{ color: "#ff3355" }}>
            <AlertTriangle className="w-3 h-3" />
            <span className="text-[10px] font-mono">FAILED TO LOAD</span>
          </div>
        )}
        {!isLoading && !isError && (
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr style={{ background: "#020e1c", borderBottom: "1px solid #0E2235" }}>
                {["USER","PLAN","AI","24H","LIVE","PAPER","LIFETIME","PnL 24H","PnL LIFETIME","LAST TRADE"].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-[8px] font-bold tracking-[0.18em]"
                    style={{ color: "#3a5a70" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.userId} style={{ borderBottom: "1px solid #0a1820" }}>
                  <td className="px-2 py-2">
                    <div style={{ color: "#EAF2FF" }}>{r.email ?? "—"}</div>
                    <div className="text-[8px]" style={{ color: "#3a5a70" }}>{r.userId.slice(0, 18)}…</div>
                  </td>
                  <td className="px-2 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-[0.15em]"
                      style={{
                        background: r.plan === "pro" ? "#00ff8a14" : r.plan === "starter" ? "#00aaff14" : "#7a9eb814",
                        color:      r.plan === "pro" ? "#00ff8a"   : r.plan === "starter" ? "#00aaff"   : "#7a9eb8",
                        border:     `1px solid ${r.plan === "pro" ? "#00ff8a40" : r.plan === "starter" ? "#00aaff40" : "#7a9eb840"}`,
                      }}>{(r.plan ?? "free").toUpperCase()}</span>
                  </td>
                  <td className="px-2 py-2">
                    {r.aiEnabled
                      ? <Zap className="w-3 h-3" style={{ color: "#cc55ff", filter: "drop-shadow(0 0 3px #cc55ff80)" }} />
                      : <span style={{ color: "#3a5a70" }}>—</span>}
                  </td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: r.trades24h > 0 ? "#00aaff" : "#3a5a70" }}>{r.trades24h}</td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: r.liveTrades24h > 0 ? "#00ff8a" : "#3a5a70" }}>{r.liveTrades24h}</td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: "#7a9eb8" }}>{r.paperTrades24h}</td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: "#C7D4E2" }}>{r.tradesLifetime}</td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: r.pnl24h >= 0 ? "#00ff8a" : "#ff3355" }}>{fmtUsd(r.pnl24h)}</td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: r.pnlLifetime >= 0 ? "#00ff8a" : "#ff3355" }}>{fmtUsd(r.pnlLifetime)}</td>
                  <td className="px-2 py-2" style={{ color: "#7a9eb8" }}>{fmtAgo(r.lastTradeAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-2 py-12 text-center" style={{ color: "#3a5a70" }}>
                    NO USERS WITH AI ACTIVITY MATCH FILTER
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <footer className="mt-3 text-[8px] font-mono tracking-[0.2em]" style={{ color: "#3a5a70" }}>
        TOP 200 USERS BY 24H AI TRADE COUNT · AUTO-REFRESH 15S
      </footer>
    </div>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded border px-3 py-2" style={{ background: "#010C18", borderColor: "#0E2235" }}>
      <div className="text-[8px] font-bold font-mono tracking-[0.25em] mb-0.5" style={{ color: "#3a5a70" }}>{label}</div>
      <div className="font-mono text-[16px] font-bold tabular-nums" style={{ color: accent }}>{value}</div>
    </div>
  );
}
