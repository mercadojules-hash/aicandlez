/**
 * PLATFORM ADMIN — /admin/metrics
 *
 * Dedicated platform-wide vitals dashboard for operators. Distinct from
 * /command (engine-internal cockpit) — this page exists to answer
 * "how is the business doing right now?" in one screen.
 *
 * Data sources (all real, no placeholders):
 *   /api/admin/top-telemetry      — 15-metric vitals strip
 *   /api/admin/platform-overview  — user/trade/fee/AI aggregates
 */
import { useQuery } from "@tanstack/react-query";
import { Activity, DollarSign, Loader2, RefreshCw, Users, TrendingUp, Brain, Shield, Zap, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

interface TopTelemetry {
  activeUsersNow:           number | null;
  totalRegisteredUsers:     number | null;
  totalUserTrades:          number | null;
  tradesToday:              number | null;
  platformPnlUsd:           number | null;
  feesCollectedUsd:         number | null;
  activeExchangeConnections: number | null;
  activeAiExecutions:       number | null;
  liveSubscriptions:        number | null;
  monthlyRevenueUsd:        number | null;
  failedTrades:             number | null;
  systemUptimeSec:          number | null;
  websocketStatus:          string | null;
  queueThroughputPerMin:    number | null;
  apiLatencyMs:             number | null;
}

interface PlatformOverview {
  users?: { total: number; online: number };
  trades?: { today: number; wins: number; volume: number; pnl: number };
  fees?: { total: number };
  ai?: { signals: number; executed: number; confidence: number };
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

function fmtUptime(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec)) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AdminPlatformMetrics() {
  const top = useQuery<TopTelemetry>({
    queryKey: ["admin-top-telemetry-page"],
    queryFn: async () => {
      const r = await authFetch("/api/admin/top-telemetry");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<TopTelemetry>;
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const over = useQuery<PlatformOverview>({
    queryKey: ["admin-platform-overview"],
    queryFn: async () => {
      const r = await authFetch("/api/admin/platform-overview");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<PlatformOverview>;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const isLoading = top.isLoading || over.isLoading;
  const isError   = top.isError;   // platform-overview is non-critical
  const refresh = () => { void top.refetch(); void over.refetch(); };

  const t = top.data;
  const o = over.data;

  return (
    <div className="min-h-full p-4 md:p-6" style={{ background: "#000508" }}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4" style={{ color: "#00f0ff" }} />
          <h1 className="font-mono text-[13px] font-bold tracking-[0.18em]" style={{ color: "#EAF2FF" }}>
            PLATFORM METRICS
          </h1>
          <span className="text-[9px] font-mono tracking-[0.2em] uppercase" style={{ color: "#3a5a70" }}>
            Operator vitals · real-time
          </span>
        </div>
        <button onClick={refresh} disabled={top.isFetching || over.isFetching}
          className="flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-mono"
          style={{ borderColor: "#0E2235", color: "#7a9eb8", background: "#010C18" }}>
          {(top.isFetching || over.isFetching) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          REFRESH
        </button>
      </header>

      {isError && (
        <div className="mb-4 p-3 rounded border flex items-center gap-2"
          style={{ background: "#1a0808", borderColor: "#ff335540", color: "#ff3355" }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="text-[10px] font-mono">FAILED TO LOAD TELEMETRY</span>
        </div>
      )}

      {/* USERS */}
      <Section title="USERS" icon={Users} accent="#00aaff">
        <Cell label="LIVE NOW"               value={fmtNum(t?.activeUsersNow)}             accent="#00ff8a" pulse />
        <Cell label="REGISTERED"             value={fmtNum(t?.totalRegisteredUsers)}       accent="#00aaff" />
        <Cell label="LIVE SUBSCRIPTIONS"     value={fmtNum(t?.liveSubscriptions)}          accent="#cc55ff" />
        <Cell label="ACTIVE EXCHANGE CONNS"  value={fmtNum(t?.activeExchangeConnections)}  accent="#00aaff" />
      </Section>

      {/* TRADING */}
      <Section title="TRADING" icon={TrendingUp} accent="#00ff8a">
        <Cell label="TRADES / TODAY"         value={fmtNum(t?.tradesToday)}                accent="#00aaff" />
        <Cell label="TRADES / LIFETIME"      value={fmtNum(t?.totalUserTrades)}            accent="#7a9eb8" />
        <Cell label="DAILY VOLUME"           value={fmtUsd(o?.trades?.volume)}             accent="#00aaff" />
        <Cell label="FAILED TRADES / 24H"    value={fmtNum(t?.failedTrades)}
              accent={(t?.failedTrades ?? 0) > 5 ? "#ff3355" : "#7a9eb8"} />
      </Section>

      {/* PnL & REVENUE */}
      <Section title="PnL & REVENUE" icon={DollarSign} accent="#ffaa00">
        <Cell label="PLATFORM PnL"           value={fmtUsd(t?.platformPnlUsd)}
              accent={(t?.platformPnlUsd ?? 0) >= 0 ? "#00ff8a" : "#ff3355"} />
        <Cell label="FEES COLLECTED"         value={fmtUsd(t?.feesCollectedUsd)}           accent="#ffaa00" />
        <Cell label="MRR"                    value={fmtUsd(t?.monthlyRevenueUsd)}          accent="#ffaa00" />
        <Cell label="AVG WIN RATE"           value={o?.trades?.wins && o?.trades?.today
                ? `${((o.trades.wins / Math.max(1, o.trades.today)) * 100).toFixed(1)}%` : "—"}
              accent="#00ff8a" />
      </Section>

      {/* AI ENGINE */}
      <Section title="AI ENGINE" icon={Brain} accent="#cc55ff">
        <Cell label="ACTIVE AI EXECUTIONS"   value={fmtNum(t?.activeAiExecutions)}         accent="#cc55ff" pulse />
        <Cell label="SIGNALS EMITTED"        value={fmtNum(o?.ai?.signals)}                accent="#cc55ff" />
        <Cell label="SIGNALS EXECUTED"       value={fmtNum(o?.ai?.executed)}               accent="#00ff8a" />
        <Cell label="AVG CONFIDENCE"         value={o?.ai?.confidence
                ? `${o.ai.confidence.toFixed(1)}` : "—"}                                   accent="#cc55ff" />
      </Section>

      {/* SYSTEM HEALTH */}
      <Section title="SYSTEM HEALTH" icon={Shield} accent="#00f0ff">
        <Cell label="UPTIME"                 value={fmtUptime(t?.systemUptimeSec)}         accent="#00ff8a" />
        <Cell label="API LATENCY"            value={t?.apiLatencyMs != null
                ? `${t.apiLatencyMs.toFixed(0)}ms` : "—"}
              accent={(t?.apiLatencyMs ?? 0) > 500 ? "#ff8844" : "#00ff8a"} />
        <Cell label="QUEUE / MIN"            value={fmtNum(t?.queueThroughputPerMin)}      accent="#00aaff" />
        <Cell label="WEBSOCKET"              value={t?.websocketStatus ?? "—"}
              accent={t?.websocketStatus === "OK" ? "#00ff8a" : "#ff8844"} />
      </Section>

      {isLoading && !t && (
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: "#3a5a70" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-[10px] font-mono">LOADING TELEMETRY…</span>
        </div>
      )}

      <footer className="flex items-center gap-2 mt-3 text-[8px] font-mono tracking-[0.2em]"
        style={{ color: "#3a5a70" }}>
        <Zap className="w-2.5 h-2.5" />
        REAL-TIME · AUTO-REFRESH 10S · NO PLACEHOLDER DATA
      </footer>
    </div>
  );
}

function Section({ title, icon: Icon, accent, children }: {
  title: string; icon: React.ElementType; accent: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3 h-3" style={{ color: accent }} />
        <h2 className="font-mono text-[10px] font-bold tracking-[0.25em]" style={{ color: accent }}>{title}</h2>
        <div className="flex-1 h-px" style={{ background: `${accent}22` }} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>
    </section>
  );
}

function Cell({ label, value, accent, pulse }: { label: string; value: string; accent: string; pulse?: boolean }) {
  return (
    <div className="rounded border px-3 py-2 relative"
      style={{
        background: "#010C18",
        borderColor: "#0E2235",
        boxShadow: pulse ? `inset 0 0 0 1px ${accent}20` : undefined,
      }}>
      <div className="text-[8px] font-bold font-mono tracking-[0.25em] mb-0.5" style={{ color: "#3a5a70" }}>{label}</div>
      <div className="font-mono text-[18px] font-bold tabular-nums" style={{ color: accent }}>{value}</div>
      {pulse && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full live-dot"
          style={{ background: accent, boxShadow: `0 0 4px ${accent}` }} />
      )}
    </div>
  );
}
