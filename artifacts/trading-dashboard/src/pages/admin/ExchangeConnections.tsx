/**
 * PLATFORM ADMIN — /admin/exchange-connections
 *
 * Operator-wide aggregate of every customer exchange connection. Read-only
 * institutional view; per-user remediation lives in the User Intelligence
 * Panel drawer (/admin/users → user row → EXCHANGES tab).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, RefreshCw, Search, Shield, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

interface ConnRow {
  id:             string;
  userId:         string;
  email:          string | null;
  role:           string | null;
  exchange:       string;
  label:          string;
  status:         string;
  tradingMode:    string;
  isDefault:      boolean;
  permissionsRead:     boolean | null;
  permissionsTrade:    boolean | null;
  permissionsWithdraw: boolean | null;
  lastVerifiedAt: string | null;
  lastError:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

interface Resp {
  summary: {
    totalConnections:     number;
    usersWithConnections: number;
    usersWithLiveMode:    number;
    byExchange:           Record<string, number>;
    byMode:               Record<string, number>;
    byStatus:             Record<string, number>;
  };
  rows: ConnRow[];
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

function statusColor(s: string): string {
  return s === "active"  ? "#00ff8a"
       : s === "error"   ? "#ff3355"
       : s === "revoked" ? "#ff8844"
       :                   "#4a6a80";
}

export default function AdminExchangeConnections() {
  const [q, setQ]           = useState("");
  const [modeFilter, setMode]       = useState<"all" | "paper" | "live">("all");
  const [statusFilter, setStatus]   = useState<"all" | "active" | "error" | "revoked">("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<Resp>({
    queryKey: ["admin-exchange-connections"],
    queryFn: async () => {
      const r = await authFetch("/api/admin/exchange-connections");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Resp>;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [] as ConnRow[];
    const needle = q.trim().toLowerCase();
    return data.rows.filter(r => {
      if (modeFilter   !== "all" && r.tradingMode !== modeFilter)   return false;
      if (statusFilter !== "all" && r.status      !== statusFilter) return false;
      if (!needle) return true;
      return (r.email?.toLowerCase().includes(needle))
          || r.exchange.toLowerCase().includes(needle)
          || r.userId.toLowerCase().includes(needle);
    });
  }, [data, q, modeFilter, statusFilter]);

  return (
    <div className="min-h-full p-4 md:p-6" style={{ background: "#000508" }}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <ArrowLeftRight className="w-4 h-4" style={{ color: "#00aaff" }} />
          <h1 className="font-mono text-[13px] font-bold tracking-[0.18em]" style={{ color: "#EAF2FF" }}>
            EXCHANGE CONNECTIONS
          </h1>
          <span className="text-[9px] font-mono tracking-[0.2em] uppercase" style={{ color: "#3a5a70" }}>
            Platform-wide aggregate
          </span>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-mono"
          style={{ borderColor: "#0E2235", color: "#7a9eb8", background: "#010C18" }}>
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          REFRESH
        </button>
      </header>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <SummaryCell label="TOTAL"          value={data?.summary.totalConnections ?? 0} accent="#00aaff" />
        <SummaryCell label="USERS"          value={data?.summary.usersWithConnections ?? 0} accent="#00aaff" />
        <SummaryCell label="LIVE MODE USERS" value={data?.summary.usersWithLiveMode ?? 0}   accent="#00ff8a" />
        <SummaryCell label="ACTIVE"         value={data?.summary.byStatus.active ?? 0}     accent="#00ff8a" />
        <SummaryCell label="ERROR"          value={data?.summary.byStatus.error ?? 0}      accent="#ff3355" />
        <SummaryCell label="REVOKED"        value={data?.summary.byStatus.revoked ?? 0}    accent="#ff8844" />
      </div>

      {/* By-exchange breakdown */}
      {data && Object.keys(data.summary.byExchange).length > 0 && (
        <div className="mb-4 p-3 rounded border" style={{ background: "#010C18", borderColor: "#0E2235" }}>
          <div className="text-[8px] font-bold font-mono tracking-[0.25em] mb-2" style={{ color: "#3a5a70" }}>
            BY EXCHANGE
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.summary.byExchange)
              .sort((a, b) => b[1] - a[1])
              .map(([ex, n]) => (
                <span key={ex} className="text-[10px] font-mono px-2 py-1 rounded border"
                  style={{ background: "#010c18", borderColor: "#0E2235", color: "#C7D4E2" }}>
                  <span style={{ color: "#7a9eb8" }}>{ex.toUpperCase()}</span>
                  <span className="ml-1.5" style={{ color: "#00aaff" }}>{n}</span>
                </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded border flex-1 min-w-[200px]"
          style={{ background: "#010C18", borderColor: "#0E2235" }}>
          <Search className="w-3 h-3" style={{ color: "#3a5a70" }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="search email · exchange · user id"
            className="bg-transparent border-none outline-none text-[10px] font-mono flex-1"
            style={{ color: "#EAF2FF" }} />
        </div>
        <FilterChip value={modeFilter}   onChange={(v) => setMode(v as "all"|"paper"|"live")}                   options={["all","paper","live"]}             label="MODE" />
        <FilterChip value={statusFilter} onChange={(v) => setStatus(v as "all"|"active"|"error"|"revoked")}   options={["all","active","error","revoked"]} label="STATUS" />
      </div>

      {/* Table */}
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
                {["USER","EXCHANGE","LABEL","MODE","STATUS","TRADE","WITHDRAW","VERIFIED","UPDATED"].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-[8px] font-bold tracking-[0.18em]"
                    style={{ color: "#3a5a70" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid #0a1820" }}>
                  <td className="px-2 py-2">
                    <div style={{ color: "#EAF2FF" }}>{r.email ?? "—"}</div>
                    <div className="text-[8px]" style={{ color: "#3a5a70" }}>{r.userId.slice(0, 18)}…</div>
                  </td>
                  <td className="px-2 py-2" style={{ color: "#C7D4E2" }}>{r.exchange.toUpperCase()}</td>
                  <td className="px-2 py-2" style={{ color: "#7a9eb8" }}>{r.label}</td>
                  <td className="px-2 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-[0.15em]"
                      style={{
                        background: r.tradingMode === "live" ? "#00ff8a14" : "#7a9eb814",
                        color:      r.tradingMode === "live" ? "#00ff8a"   : "#7a9eb8",
                        border:     `1px solid ${r.tradingMode === "live" ? "#00ff8a40" : "#7a9eb840"}`,
                      }}>{r.tradingMode.toUpperCase()}</span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1" style={{ color: statusColor(r.status) }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor(r.status) }} />
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-2" style={{ color: r.permissionsTrade ? "#00ff8a" : "#4a6a80" }}>
                    {r.permissionsTrade === null ? "—" : r.permissionsTrade ? "YES" : "NO"}
                  </td>
                  <td className="px-2 py-2" style={{ color: r.permissionsWithdraw ? "#ff3355" : "#4a6a80" }}>
                    {r.permissionsWithdraw === null ? "—" : r.permissionsWithdraw ? "YES" : "NO"}
                  </td>
                  <td className="px-2 py-2" style={{ color: "#7a9eb8" }}>{fmtAgo(r.lastVerifiedAt)}</td>
                  <td className="px-2 py-2" style={{ color: "#7a9eb8" }}>{fmtAgo(r.updatedAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-2 py-12 text-center" style={{ color: "#3a5a70" }}>
                    NO CONNECTIONS MATCH FILTER
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <footer className="flex items-center gap-2 mt-3 text-[8px] font-mono tracking-[0.2em]"
        style={{ color: "#3a5a70" }}>
        <Shield className="w-2.5 h-2.5" />
        ADMIN-ONLY · NO RAW CREDENTIALS RETURNED · AUTO-REFRESH 15S
      </footer>
    </div>
  );
}

function SummaryCell({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded border px-3 py-2"
      style={{ background: "#010C18", borderColor: "#0E2235" }}>
      <div className="text-[8px] font-bold font-mono tracking-[0.25em] mb-0.5" style={{ color: "#3a5a70" }}>{label}</div>
      <div className="font-mono text-[18px] font-bold tabular-nums" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function FilterChip({
  value, onChange, options, label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded border"
      style={{ background: "#010C18", borderColor: "#0E2235" }}>
      <span className="text-[8px] font-bold font-mono tracking-[0.18em]" style={{ color: "#3a5a70" }}>{label}</span>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase"
          style={{
            background: value === o ? "#00aaff20" : "transparent",
            color:      value === o ? "#00aaff"   : "#7a9eb8",
          }}>
          {o}
        </button>
      ))}
    </div>
  );
}
