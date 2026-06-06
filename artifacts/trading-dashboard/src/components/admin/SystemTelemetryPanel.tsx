/**
 * SystemTelemetryPanel — ADMIN-only Platform Resource & Billing Telemetry.
 *
 * Mounted below the existing content on /admin/metrics (PlatformMetrics.tsx),
 * which is already `ProtectedAdmin`-gated at the route level. This component
 * ALSO gates on `useUserRole()` (`isAdmin`) as defense-in-depth and renders
 * `null` for non-admins.
 *
 * Sections:
 *   1. Production status / resource usage  (useSystemResources)
 *   2. External deep-links (Replit Usage + Render — authoritative billing)
 *   3. "ESTIMATE ONLY — Not Official Billing" cost form (useCostConfig)
 *   4. Trends — 30 / 90 / YTD usage_daily rows (useUsageHistory)
 *
 * All data is real. Anything unavailable renders a dash — never fake numbers.
 * Styling mirrors PlatformMetrics.tsx (Section / Cell, neon token system).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Activity, Cpu, Database, ExternalLink, Loader2, RefreshCw,
  Server, DollarSign, BarChart3, AlertTriangle, Save,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import {
  useSystemResources,
  useCostConfig,
  useSetCostConfig,
  useUsageHistory,
  type CostConfigInput,
  type SystemResources,
} from "@/hooks/usePlatformTelemetry";

// ─────────────────────────────────────────────────────────────────────────────
// Formatters (mirror PlatformMetrics conventions — dash for unavailable).
// ─────────────────────────────────────────────────────────────────────────────
function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtUsdExact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024)      return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
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

function fmtTimestamp(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const d = typeof v === "number" ? new Date(v) : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SystemTelemetryPanel() {
  const { isAdmin, loading } = useUserRole();

  // Defense-in-depth: render nothing for non-admins (route is already gated).
  if (loading) return null;
  if (!isAdmin) return null;

  return <SystemTelemetryPanelInner />;
}

function SystemTelemetryPanelInner() {
  const sys = useSystemResources();
  const s   = sys.data;

  return (
    <div className="mt-6" style={{ borderTop: "1px solid #0E2235", paddingTop: "1.5rem" }}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Server className="w-4 h-4" style={{ color: "#00f0ff" }} />
          <h1 className="font-mono text-[13px] font-bold tracking-[0.18em]" style={{ color: "#EAF2FF" }}>
            PLATFORM RESOURCE &amp; BILLING TELEMETRY
          </h1>
          <span className="text-[9px] font-mono tracking-[0.2em] uppercase" style={{ color: "#3a5a70" }}>
            Admin only · real prod metrics
          </span>
        </div>
        <button onClick={() => void sys.refetch()} disabled={sys.isFetching}
          className="flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-mono"
          style={{ borderColor: "#0E2235", color: "#7a9eb8", background: "#010C18" }}>
          {sys.isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          REFRESH
        </button>
      </header>

      {sys.isError && (
        <div className="mb-4 p-3 rounded border flex items-center gap-2"
          style={{ background: "#1a0808", borderColor: "#ff335540", color: "#ff3355" }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="text-[10px] font-mono">FAILED TO LOAD SYSTEM RESOURCES</span>
        </div>
      )}

      {/* 1 — PRODUCTION STATUS */}
      <Section title="PRODUCTION STATUS" icon={Activity} accent="#00ff8a">
        <Cell label="UPTIME"        value={fmtUptime(s?.process.uptimeSeconds)}      accent="#00ff8a" />
        <Cell label="NODE UPTIME"   value={fmtUptime(s?.process.nodeUptimeSeconds)}  accent="#7a9eb8" />
        <Cell label="ENGINE"        value={s?.engine ? (s.engine.running ? "RUNNING" : "STOPPED") : "—"}
              accent={s?.engine?.running ? "#00ff8a" : "#ff8844"} pulse={s?.engine?.running} />
        <Cell label="LAST TICK"     value={fmtTimestamp(s?.engine.lastTickAt)}       accent="#00aaff" />
      </Section>

      {/* 2 — RESOURCE USAGE */}
      <Section title="RESOURCE USAGE" icon={Cpu} accent="#00aaff">
        <Cell label="CPU"           value={fmtPct(s?.process.cpuPct)}
              accent={(s?.process.cpuPct ?? 0) > 85 ? "#ff3355" : "#00aaff"} />
        <Cell label="CPU CORES"     value={fmtNum(s?.process.cpuCores)}              accent="#7a9eb8" />
        <Cell label="LOAD AVG 1M"   value={s?.process.loadAvg1m != null ? s.process.loadAvg1m.toFixed(2) : "—"}
              accent="#00aaff" />
        <Cell label="RSS MEMORY"    value={fmtBytes(s?.process.memory.rssBytes)}     accent="#cc55ff" />
        <Cell label="HEAP USED"     value={fmtBytes(s?.process.memory.heapUsedBytes)} accent="#cc55ff" />
        <Cell label="HEAP TOTAL"    value={fmtBytes(s?.process.memory.heapTotalBytes)} accent="#7a9eb8" />
        <Cell label="SYS MEM FREE"  value={fmtBytes(s?.process.systemFreeMemBytes)}  accent="#00aaff" />
        <Cell label="SYS MEM TOTAL" value={fmtBytes(s?.process.systemTotalMemBytes)} accent="#7a9eb8" />
      </Section>

      {/* 3 — STORAGE & COUNTS */}
      <Section title="STORAGE & COUNTS" icon={Database} accent="#ffaa00">
        <Cell label="DB SIZE"          value={fmtBytes(s?.database.sizeBytes)}            accent="#ffaa00" />
        <Cell label="TOTAL USERS"      value={fmtNum(s?.counts.totalUsers)}              accent="#00aaff" />
        <Cell label="OPEN POSITIONS"   value={fmtNum(s?.counts.openPositions)}           accent="#00ff8a" />
        <Cell label="OPEN LIVE POS"    value={fmtNum(s?.counts.openLivePositions)}       accent="#cc55ff" />
        <Cell label="EXCHANGE CONNS"   value={fmtNum(s?.counts.exchangeConnections)}     accent="#00aaff" />
        <Cell label="API REQ / TODAY"  value={fmtNum(s?.usageToday?.apiRequests)}        accent="#7a9eb8" />
        <Cell label="ACTIVE / TODAY"   value={fmtNum(s?.usageToday?.activeUsers)}        accent="#7a9eb8" />
        <Cell label="PEAK RSS / TODAY" value={fmtBytes(s?.usageToday?.peakRssBytes)}     accent="#cc55ff" />
      </Section>

      {sys.isLoading && !s && (
        <div className="flex items-center justify-center py-8 gap-2" style={{ color: "#3a5a70" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-[10px] font-mono">LOADING SYSTEM RESOURCES…</span>
        </div>
      )}

      <DeepLinksSection />
      <CostEstimateSection sys={s} />
      <TrendsSection />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 — External deep-links (authoritative billing sources).
// ─────────────────────────────────────────────────────────────────────────────
function DeepLinksSection() {
  return (
    <Section title="AUTHORITATIVE BILLING SOURCES" icon={ExternalLink} accent="#cc55ff">
      <div className="col-span-2 md:col-span-4 flex flex-col gap-2">
        <p className="text-[9px] font-mono tracking-[0.12em]" style={{ color: "#7a9eb8" }}>
          A running production app cannot read the Replit usage meter, AI credit balance, or
          Render billing API. These dashboards are the authoritative billing source.
        </p>
        <div className="flex flex-wrap gap-2">
          <DeepLink href="https://replit.com/usage" label="REPLIT USAGE DASHBOARD" />
          <DeepLink href="https://dashboard.render.com" label="RENDER DASHBOARD" />
        </div>
      </div>
    </Section>
  );
}

function DeepLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 px-3 py-2 rounded border text-[9px] font-mono font-bold tracking-[0.15em]"
      style={{ borderColor: "#cc55ff40", color: "#cc55ff", background: "#010C18" }}>
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 — "ESTIMATE ONLY — Not Official Billing" cost form + derived estimates.
// ─────────────────────────────────────────────────────────────────────────────
const COST_FIELDS: Array<{ key: keyof CostConfigInput; label: string }> = [
  { key: "monthlyReplitUsd",     label: "REPLIT / MO" },
  { key: "monthlyRenderUsd",     label: "RENDER / MO" },
  { key: "monthlyDbUsd",         label: "DATABASE / MO" },
  { key: "monthlyAiUsd",         label: "AI / MO" },
  { key: "monthlyThirdPartyUsd", label: "THIRD-PARTY / MO" },
];

const EMPTY_COST: CostConfigInput = {
  monthlyReplitUsd: 0,
  monthlyRenderUsd: 0,
  monthlyDbUsd: 0,
  monthlyAiUsd: 0,
  monthlyThirdPartyUsd: 0,
};

function CostEstimateSection({ sys }: { sys: SystemResources | undefined }) {
  const cfg = useCostConfig();
  const { setCostConfig, isPending } = useSetCostConfig();
  const [form, setForm] = useState<CostConfigInput>(EMPTY_COST);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (cfg.data && !dirty) {
      setForm({
        monthlyReplitUsd:     cfg.data.monthlyReplitUsd ?? 0,
        monthlyRenderUsd:     cfg.data.monthlyRenderUsd ?? 0,
        monthlyDbUsd:         cfg.data.monthlyDbUsd ?? 0,
        monthlyAiUsd:         cfg.data.monthlyAiUsd ?? 0,
        monthlyThirdPartyUsd: cfg.data.monthlyThirdPartyUsd ?? 0,
      });
    }
  }, [cfg.data, dirty]);

  const totalMonthly = useMemo(
    () =>
      form.monthlyReplitUsd +
      form.monthlyRenderUsd +
      form.monthlyDbUsd +
      form.monthlyAiUsd +
      form.monthlyThirdPartyUsd,
    [form],
  );

  const totalUsers   = sys?.counts.totalUsers ?? 0;
  const tradesToday  = sys?.usageToday?.trades ?? 0;
  const apiToday     = sys?.usageToday?.apiRequests ?? 0;

  // Estimated monthly extrapolations from today's counters (rough — labelled).
  const tradesMonthly = tradesToday * 30;
  const apiMonthly    = apiToday * 30;

  const costPerUser   = totalUsers   > 0 ? totalMonthly / totalUsers       : null;
  const costPerTrade  = tradesMonthly > 0 ? totalMonthly / tradesMonthly   : null;
  const costPer1kReq  = apiMonthly    > 0 ? (totalMonthly / apiMonthly) * 1000 : null;

  const onChange = (key: keyof CostConfigInput, raw: string) => {
    const n = Number(raw);
    setDirty(true);
    setForm((f) => ({ ...f, [key]: Number.isFinite(n) && n >= 0 ? n : 0 }));
  };

  const onSave = async () => {
    try {
      await setCostConfig(form);
      setDirty(false);
    } catch {
      /* error surfaced via mutation state; form stays dirty for retry */
    }
  };

  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="w-3 h-3" style={{ color: "#ffaa00" }} />
        <h2 className="font-mono text-[10px] font-bold tracking-[0.25em]" style={{ color: "#ffaa00" }}>
          ESTIMATE ONLY — NOT OFFICIAL BILLING
        </h2>
        <div className="flex-1 h-px" style={{ background: "#ffaa0022" }} />
      </div>

      <div className="rounded border p-3" style={{ background: "#010C18", borderColor: "#0E2235" }}>
        <p className="text-[9px] font-mono tracking-[0.12em] mb-3" style={{ color: "#ff8844" }}>
          Manual monthly cost inputs. All figures and derived numbers below are ESTIMATES — refer
          to the authoritative billing dashboards above for actual charges.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          {COST_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[8px] font-bold font-mono tracking-[0.2em]" style={{ color: "#3a5a70" }}>
                {f.label}
              </span>
              <div className="flex items-center rounded border px-2"
                style={{ borderColor: "#0E2235", background: "#000508" }}>
                <span className="text-[11px] font-mono" style={{ color: "#3a5a70" }}>$</span>
                <input
                  type="number" min={0} step="0.01"
                  value={Number.isFinite(form[f.key]) ? form[f.key] : 0}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="w-full bg-transparent py-1.5 px-1 font-mono text-[13px] font-bold tabular-nums outline-none"
                  style={{ color: "#ffaa00" }}
                />
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-bold font-mono tracking-[0.2em]" style={{ color: "#3a5a70" }}>
              TOTAL MONTHLY (EST)
            </span>
            <span className="font-mono text-[18px] font-bold tabular-nums" style={{ color: "#ffaa00" }}>
              {fmtUsdExact(totalMonthly)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {cfg.data?.updatedAt && (
              <span className="text-[8px] font-mono tracking-[0.12em]" style={{ color: "#3a5a70" }}>
                LAST SAVED {fmtTimestamp(cfg.data.updatedAt)}
              </span>
            )}
            <button onClick={() => void onSave()} disabled={isPending || !dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-[9px] font-mono font-bold tracking-[0.15em]"
              style={{
                borderColor: dirty ? "#ffaa0080" : "#0E2235",
                color: dirty ? "#ffaa00" : "#3a5a70",
                background: "#010C18",
                opacity: isPending ? 0.6 : 1,
              }}>
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              SAVE ESTIMATE
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Cell label="COST / USER (EST)"      value={fmtUsdExact(costPerUser)}  accent="#00aaff" />
          <Cell label="COST / TRADE (EST)"     value={fmtUsdExact(costPerTrade)} accent="#00ff8a" />
          <Cell label="COST / 1K REQ (EST)"    value={fmtUsdExact(costPer1kReq)} accent="#cc55ff" />
        </div>
        <p className="text-[8px] font-mono tracking-[0.12em] mt-2" style={{ color: "#3a5a70" }}>
          Per-trade / per-1k-request estimates extrapolate today's counters to a 30-day month and
          are indicative only.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 — Trends: 30 / 90 / YTD usage_daily rows.
// ─────────────────────────────────────────────────────────────────────────────
function ytdDays(): number {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const diff = Math.ceil((now.getTime() - start.getTime()) / (24 * 3600 * 1000));
  return Math.max(1, Math.min(diff, 366));
}

const TREND_OPTIONS: Array<{ key: "30" | "90" | "ytd"; label: string }> = [
  { key: "30",  label: "30D" },
  { key: "90",  label: "90D" },
  { key: "ytd", label: "YTD" },
];

function TrendsSection() {
  const [sel, setSel] = useState<"30" | "90" | "ytd">("30");
  const days = sel === "30" ? 30 : sel === "90" ? 90 : ytdDays();
  const hist = useUsageHistory(days);
  const rows = hist.data?.rows ?? [];

  return (
    <section className="mb-2">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-3 h-3" style={{ color: "#00f0ff" }} />
        <h2 className="font-mono text-[10px] font-bold tracking-[0.25em]" style={{ color: "#00f0ff" }}>
          USAGE & COST TRENDS
        </h2>
        <div className="flex-1 h-px" style={{ background: "#00f0ff22" }} />
        <div className="flex items-center gap-1">
          {TREND_OPTIONS.map((o) => (
            <button key={o.key} onClick={() => setSel(o.key)}
              className="px-2 py-0.5 rounded border text-[9px] font-mono font-bold tracking-[0.15em]"
              style={{
                borderColor: sel === o.key ? "#00f0ff80" : "#0E2235",
                color: sel === o.key ? "#00f0ff" : "#3a5a70",
                background: "#010C18",
              }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border overflow-x-auto" style={{ background: "#010C18", borderColor: "#0E2235" }}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid #0E2235" }}>
              {["DAY", "API REQ", "EXCHANGE", "ACTIVE", "TRADES", "PEAK RSS", "EST $/MO"].map((h, i) => (
                <th key={h}
                  className="text-[8px] font-bold font-mono tracking-[0.2em] px-3 py-2"
                  style={{ color: "#3a5a70", textAlign: i === 0 ? "left" : "right" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center">
                  {hist.isLoading ? (
                    <span className="inline-flex items-center gap-2 text-[10px] font-mono" style={{ color: "#3a5a70" }}>
                      <Loader2 className="w-3 h-3 animate-spin" /> LOADING TRENDS…
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono" style={{ color: "#3a5a70" }}>
                      NO USAGE DATA YET FOR THIS WINDOW
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.day} style={{ borderBottom: "1px solid #0E223544" }}>
                  <Td left accent="#EAF2FF">{r.day}</Td>
                  <Td accent="#7a9eb8">{fmtNum(r.apiRequests)}</Td>
                  <Td accent="#7a9eb8">{fmtNum(r.exchangeCalls)}</Td>
                  <Td accent="#00aaff">{fmtNum(r.activeUsers)}</Td>
                  <Td accent="#00ff8a">{fmtNum(r.trades)}</Td>
                  <Td accent="#cc55ff">{fmtBytes(r.peakRssBytes)}</Td>
                  <Td accent="#ffaa00">{fmtUsd(r.estMonthlyCostUsd)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hist.isError && (
        <p className="text-[9px] font-mono mt-1" style={{ color: "#ff3355" }}>
          FAILED TO LOAD USAGE HISTORY
        </p>
      )}
    </section>
  );
}

function Td({ children, accent, left }: { children: React.ReactNode; accent: string; left?: boolean }) {
  return (
    <td className="font-mono text-[11px] font-bold tabular-nums px-3 py-1.5"
      style={{ color: accent, textAlign: left ? "left" : "right" }}>
      {children}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout primitives — mirror PlatformMetrics.tsx Section / Cell.
// ─────────────────────────────────────────────────────────────────────────────
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
