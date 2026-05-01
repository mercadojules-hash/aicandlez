import { useEffect, useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  Circle,
  Clock,
  Cpu,
  Database,
  Globe,
  Layers,
  Radio,
  Server,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { MODULE_LIST } from "@/components/Layout";

// ── Types ─────────────────────────────────────────────────────────────────────
interface HealthResult { ok: boolean; latencyMs: number | null; }

// ── Module 1: Dashboard shell ─────────────────────────────────────────────────
export default function Dashboard() {
  const [apiHealth, setApiHealth]   = useState<HealthResult>({ ok: false, latencyMs: null });
  const [uptime, setUptime]         = useState(0);
  const [now, setNow]               = useState(() => new Date());

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Uptime counter
  useEffect(() => {
    const t = setInterval(() => setUptime((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // API health ping
  useEffect(() => {
    const ping = async () => {
      const start = performance.now();
      try {
        const res = await fetch("/api/healthz", { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          setApiHealth({ ok: true, latencyMs: Math.round(performance.now() - start) });
        } else {
          setApiHealth({ ok: false, latencyMs: null });
        }
      } catch {
        setApiHealth({ ok: false, latencyMs: null });
      }
    };
    ping();
    const t = setInterval(ping, 10000);
    return () => clearInterval(t);
  }, []);

  const activeModules  = MODULE_LIST.filter((m) => m.status === "active").length;
  const pendingModules = MODULE_LIST.filter((m) => m.status === "pending").length;

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">

      {/* ── System header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-primary tracking-widest uppercase">ApexTrader · Hybrid AI Trading System</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">System Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Module 1 of 14 · Foundation & Shell · All systems nominal</p>
        </div>
        <div className="text-right font-mono text-xs text-muted-foreground">
          <div className="text-lg font-bold text-foreground tabular-nums">
            {now.toLocaleTimeString("en-US", { hour12: false })}
          </div>
          <div>{now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          <div className="text-muted-foreground/50">UPTIME {formatUptime(uptime)}</div>
        </div>
      </div>

      {/* ── System health cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HealthCard icon={<Server className="w-4 h-4" />} label="API Server"   ok={apiHealth.ok}   value={apiHealth.ok ? `${apiHealth.latencyMs}ms` : "offline"} />
        <HealthCard icon={<Radio    className="w-4 h-4" />} label="WebSocket"  ok={false}           value="Module 3"    dim />
        <HealthCard icon={<Database className="w-4 h-4" />} label="Data Feed"  ok={true}            value="Kraken · Live" />
        <HealthCard icon={<Brain    className="w-4 h-4" />} label="AI Engine"  ok={false}           value="Module 4"    dim />
      </div>

      {/* ── Progress overview ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Modules Active"  value={`${activeModules}/14`}   icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} color="green"  />
        <StatCard label="Modules Pending" value={`${pendingModules}/14`}  icon={<Clock        className="w-4 h-4 text-yellow-400" />} color="yellow" />
        <StatCard label="Build Phase"     value="2 · Data Engine"         icon={<Layers       className="w-4 h-4 text-primary"    />} color="blue"   />
        <StatCard label="System Status"   value="Data Feed Online"        icon={<Activity     className="w-4 h-4 text-primary"    />} color="blue"   />
      </div>

      {/* ── Body grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* Module roadmap */}
        <div className="border border-border/40 rounded-xl bg-card/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="w-4 h-4 text-primary" />
              Build Roadmap — 14 Modules
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400/80 inline-block" />Active</span>
              <span className="ml-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-border inline-block" />Pending</span>
            </div>
          </div>
          <div className="divide-y divide-border/20">
            {MODULE_LIST.map((mod, idx) => {
              const Icon = mod.icon;
              const isActive = mod.status === "active";
              return (
                <div key={mod.id} className={`flex items-center gap-3 px-4 py-2.5 ${isActive ? "bg-primary/5" : ""}`}>
                  {/* Timeline dot + line */}
                  <div className="flex flex-col items-center self-stretch w-5 shrink-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${isActive ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-border"}`} />
                    {idx < MODULE_LIST.length - 1 && (
                      <div className="w-px flex-1 bg-border/30 mt-1" />
                    )}
                  </div>
                  {/* Icon */}
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isActive ? "bg-primary/10" : "bg-card/50"}`}>
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-primary" : "text-muted-foreground/30"}`} />
                  </div>
                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground/40"}`}>
                      <span className="font-mono text-[10px] text-muted-foreground/30 mr-1">{String(mod.id).padStart(2, "0")}.</span>
                      {mod.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground/30 truncate">{mod.sublabel}</div>
                  </div>
                  {/* Status */}
                  <div className={`text-[10px] font-mono shrink-0 px-2 py-0.5 rounded border ${
                    isActive
                      ? "text-green-400 border-green-400/30 bg-green-400/5"
                      : "text-muted-foreground/20 border-border/20"
                  }`}>
                    {isActive ? "ACTIVE" : "PENDING"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* API server detail */}
          <div className="border border-border/40 rounded-xl bg-card/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 text-sm font-semibold">
              <Server className="w-4 h-4 text-primary" />
              Backend — API Server
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              <InfoRow label="Status"   value={apiHealth.ok ? "Online" : "Offline"} ok={apiHealth.ok} />
              <InfoRow label="Latency"  value={apiHealth.ok && apiHealth.latencyMs != null ? `${apiHealth.latencyMs} ms` : "—"} />
              <InfoRow label="Base URL" value="/api" />
              <InfoRow label="Health"   value="/api/health" />
              <InfoRow label="Auth"     value="None (Module 1)" dim />
              <div className="mt-2 pt-2 border-t border-border/30">
                <p className="text-[10px] font-mono text-muted-foreground/40 leading-relaxed">
                  Routes registered: /health · /signals · /trades · /portfolio · /settings · /logs · /backtest · /candles
                </p>
              </div>
            </div>
          </div>

          {/* System architecture */}
          <div className="border border-border/40 rounded-xl bg-card/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 text-sm font-semibold">
              <Globe className="w-4 h-4 text-primary" />
              Architecture
            </div>
            <div className="p-4 flex flex-col gap-1.5 text-[11px] font-mono text-muted-foreground">
              <ArchRow icon={<TrendingUp className="w-3 h-3" />} label="Frontend"  value="React + Vite + Tailwind"  ok />
              <ArchRow icon={<Server     className="w-3 h-3" />} label="Backend"   value="Express · Node.js"         ok />
              <ArchRow icon={<Radio      className="w-3 h-3" />} label="Realtime"  value="WebSocket (Module 3)"      />
              <ArchRow icon={<Database   className="w-3 h-3" />} label="Data"      value="Kraken API · Live"          ok />
              <ArchRow icon={<Brain      className="w-3 h-3" />} label="AI"        value="LLM Engine (Module 4)"     />
              <ArchRow icon={<Shield     className="w-3 h-3" />} label="Risk"      value="Risk Engine (Module 5)"    />
              <ArchRow icon={<Zap        className="w-3 h-3" />} label="Execution" value="Live Broker (Module 13)"   />
            </div>
          </div>

          {/* What's next */}
          <div className="border border-primary/20 rounded-xl bg-primary/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-primary/20 flex items-center gap-2 text-sm font-semibold text-primary">
              <Zap className="w-4 h-4" />
              Next: Module 3 · Indicators
            </div>
            <div className="p-4 flex flex-col gap-1.5 text-[11px] text-muted-foreground">
              {["RSI, MACD, Bollinger Bands", "EMA 20 / EMA 50 crossover detection", "Volume-weighted indicators", "Real-time indicator overlay on candles", "Signal strength scoring"].map((item) => (
                <div key={item} className="flex items-start gap-1.5">
                  <Circle className="w-2.5 h-2.5 mt-0.5 shrink-0 text-primary/50" />
                  {item}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthCard({ icon, label, ok, value, dim }: { icon: React.ReactNode; label: string; ok: boolean; value: string; dim?: boolean }) {
  return (
    <div className={`border rounded-xl p-3 flex items-center gap-3 ${ok ? "border-green-400/20 bg-green-400/5" : "border-border/40 bg-card/30"}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ok ? "bg-green-400/10 text-green-400" : "bg-card text-muted-foreground/30"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className={`text-[10px] font-mono ${ok ? "text-green-400/70" : "text-muted-foreground/40"}`}>{label}</div>
        <div className={`text-sm font-bold truncate ${ok ? "text-green-400" : dim ? "text-muted-foreground/25 text-xs" : "text-muted-foreground/40"}`}>{value}</div>
      </div>
      <div className={`ml-auto w-2 h-2 rounded-full shrink-0 ${ok ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-muted-foreground/20"}`} />
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    green:  "border-green-400/20  bg-green-400/5",
    yellow: "border-yellow-400/20 bg-yellow-400/5",
    blue:   "border-primary/20    bg-primary/5",
  };
  return (
    <div className={`border rounded-xl p-3 ${colorMap[color] ?? "border-border/40 bg-card/30"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="text-sm font-bold truncate">{value}</div>
    </div>
  );
}

function InfoRow({ label, value, ok, dim }: { label: string; value: string; ok?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground/50 font-mono">{label}</span>
      <span className={ok === true ? "text-green-400" : ok === false ? "text-destructive/60" : dim ? "text-muted-foreground/30" : "text-muted-foreground font-mono"}>
        {value}
      </span>
    </div>
  );
}

function ArchRow({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={ok ? "text-primary" : "text-muted-foreground/20"}>{icon}</span>
      <span className="text-muted-foreground/50 w-16 shrink-0">{label}</span>
      <span className={ok ? "text-muted-foreground" : "text-muted-foreground/25"}>{value}</span>
    </div>
  );
}

function formatUptime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
