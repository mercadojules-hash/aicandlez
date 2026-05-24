import { authFetch } from "@/lib/authFetch";
import { useState, useEffect, useCallback } from "react";
import {
  Shield, RefreshCw, AlertTriangle, CheckCircle2,
  TrendingDown, Zap, Settings2, Activity, Siren,
  DollarSign, BarChart3, Clock, Lock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RiskConfig {
  totalCapitalUSD: number;
  allocationPct: number;
  maxTradeSizeUSD: number;
  dailyLossLimitPct: number;
  maxTradesPerDay: number;   // 0 = unlimited
  killSwitchActive: boolean;
}

interface RiskStatus {
  maxPositionSizeUSD: number;
  tradesUsedToday: number;
  tradesRemainingToday: number;  // -1 = unlimited
  unlimitedDailyTrades: boolean;
  dailyPnL: number;
  dailyPnLPct: number;
  dailyLossLimitUSD: number;
  dailyLossUsedUSD: number;
  dailyLossUsedPct: number;
  dailyLossRemainingUSD: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  haltReason: string | null;
  lastReset: string;
}

interface ValidateResult {
  allowed: boolean;
  violations: string[];
  maxAllowedSizeUSD: number;
  checks: {
    killSwitch: { pass: boolean; reason: string };
    positionSize: { pass: boolean; reason: string };
    dailyTrades: { pass: boolean; reason: string };
    dailyLoss: { pass: boolean; reason: string };
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function usd(n: number, decimals = 0) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function pct(n: number, d = 1) { return n.toFixed(d) + "%"; }

const RISK_LEVEL_COLORS: Record<string, string> = {
  LOW:      "text-emerald-400",
  MEDIUM:   "text-yellow-400",
  HIGH:     "text-orange-400",
  CRITICAL: "text-red-400",
};
const RISK_LEVEL_BG: Record<string, string> = {
  LOW:      "bg-emerald-400/10 border-emerald-400/20",
  MEDIUM:   "bg-yellow-400/10 border-yellow-400/20",
  HIGH:     "bg-orange-400/10 border-orange-400/20",
  CRITICAL: "bg-red-400/10 border-red-400/20",
};

// ── Usage Bar ─────────────────────────────────────────────────────────────────

function UsageBar({ usedPct, label, used, total, color, unlimited = false }: {
  usedPct: number; label: string; used: string; total: string; color: string; unlimited?: boolean;
}) {
  const filled = Math.min(100, Math.max(0, unlimited ? 0 : usedPct));
  const segments = 20;
  const filledCount = Math.round((filled / 100) * segments);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-muted-foreground/70 font-medium">{label}</span>
        <span className="font-mono text-muted-foreground/50">
          {unlimited ? `${used} / ∞` : `${used} / ${total}`}
        </span>
      </div>
      <div className="flex gap-0.5 mb-1.5">
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} className={`flex-1 h-2 rounded-sm transition-all ${
            unlimited
              ? "bg-primary/20"
              : i < filledCount ? color : "bg-border/20"
          }`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/40">
        {unlimited
          ? <><span>Unlimited</span><span>No daily cap</span></>
          : <><span>{pct(filled, 1)} used</span><span>{pct(100 - filled, 1)} remaining</span></>
        }
      </div>
    </div>
  );
}

// ── Slider ────────────────────────────────────────────────────────────────────

function RiskSlider({
  label, value, min, max, step, unit, onChange, description,
}: {
  label: string; value: number; min: number; max: number; step: number;
  unit: string; onChange: (v: number) => void; description?: string;
}) {
  const pctFilled = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm font-bold font-mono text-primary">
          {unit === "$" ? usd(value) : `${value}${unit}`}
        </span>
      </div>
      <div className="relative mb-1.5">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) ${pctFilled}%, hsl(var(--border)) ${pctFilled}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/40">
        <span>{unit === "$" ? usd(min) : `${min}${unit}`}</span>
        <span>{unit === "$" ? usd(max) : `${max}${unit}`}</span>
      </div>
      {description && <p className="text-xs text-muted-foreground/50 mt-1.5">{description}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RiskManagement() {
  const [config, setConfig]   = useState<RiskConfig | null>(null);
  const [status, setStatus]   = useState<RiskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);
  const [dirty,   setDirty]   = useState(false);

  const [draft, setDraft] = useState<RiskConfig | null>(null);

  const [validateSize, setValidateSize] = useState(2500);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [validating, setValidating]        = useState(false);

  const fetchConfig = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/risk/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { config: RiskConfig; status: RiskStatus } = await res.json();
      setConfig(data.config);
      setStatus(data.status);
      if (!draft || !dirty) setDraft(data.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [draft, dirty]);

  useEffect(() => { fetchConfig(); }, []);

  function patchDraft(patch: Partial<RiskConfig>) {
    setDraft((d) => d ? { ...d, ...patch } : null);
    setDirty(true);
    setSaved(false);
  }

  async function saveConfig() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/risk/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { config: RiskConfig; status: RiskStatus } = await res.json();
      setConfig(data.config);
      setStatus(data.status);
      setDraft(data.config);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleKillSwitch() {
    try {
      const res = await authFetch("/api/risk/kill-switch", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { killSwitchActive: boolean; status: RiskStatus } = await res.json();
      setConfig((c) => c ? { ...c, killSwitchActive: data.killSwitchActive } : null);
      setDraft((d) => d ? { ...d, killSwitchActive: data.killSwitchActive } : null);
      setStatus(data.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runValidation() {
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await authFetch("/api/risk/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizeUSD: validateSize }),
      });
      setValidateResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  }

  const unlimited       = status?.unlimitedDailyTrades ?? (config?.maxTradesPerDay === 0);
  const riskLevelColor  = status ? RISK_LEVEL_COLORS[status.riskLevel] ?? "text-foreground" : "text-muted-foreground";
  const riskLevelBg     = status ? RISK_LEVEL_BG[status.riskLevel]    ?? "bg-card border-border/40" : "bg-card border-border/40";
  const killActive      = config?.killSwitchActive ?? false;

  // Trades today display helpers
  const tradesTodayValue = status
    ? unlimited
      ? `${status.tradesUsedToday} / ∞`
      : `${status.tradesUsedToday} / ${config?.maxTradesPerDay}`
    : "—";
  const tradesTodaySub = status
    ? unlimited
      ? "Unlimited daily trades"
      : `${status.tradesRemainingToday} remaining`
    : "loading…";
  const tradesTodayColor = status && !unlimited && status.tradesRemainingToday === 0
    ? "text-red-400"
    : "text-yellow-400";

  return (
    <div className="flex flex-col gap-5 max-w-[1100px]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-primary tracking-widest uppercase">Module 05 · Risk Management</span>
          </div>
          <h1 className="text-xl font-bold">Risk Management System</h1>
          <p className="text-sm text-muted-foreground">Position limits · Daily loss guard · Pre-trade validation · Kill switch</p>
        </div>
        <button onClick={() => fetchConfig(true)} disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border/40 hover:bg-card transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-red-900/40 bg-red-950/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Kill switch */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${killActive ? "border-red-400/40 bg-red-400/10" : "border-border/40 bg-card/30"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${killActive ? "bg-red-400/20" : "bg-card"}`}>
            <Siren className={`w-5 h-5 ${killActive ? "text-red-400 animate-pulse" : "text-muted-foreground/40"}`} />
          </div>
          <div>
            <div className={`font-bold text-sm ${killActive ? "text-red-400" : "text-foreground"}`}>
              Kill Switch — {killActive ? "ACTIVE · ALL TRADING HALTED" : "Inactive"}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {killActive ? "Click deactivate to resume trading operations." : "Instantly halts all trade validation and execution."}
            </p>
          </div>
        </div>
        <button onClick={toggleKillSwitch}
          className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
            killActive
              ? "bg-red-400/20 border border-red-400/50 text-red-400 hover:bg-red-400/30"
              : "bg-card border border-border/40 text-muted-foreground hover:text-foreground hover:border-red-400/40 hover:text-red-400"
          }`}>
          {killActive ? "DEACTIVATE" : "ACTIVATE"}
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <DollarSign className="w-4 h-4" />,
            label: "Max Position Size",
            value: status ? usd(status.maxPositionSizeUSD) : "—",
            sub: status ? `${pct(config?.allocationPct ?? 0)} of capital` : "loading…",
            color: "text-primary",
          },
          {
            icon: <BarChart3 className="w-4 h-4" />,
            label: "Trades Today",
            value: tradesTodayValue,
            sub: tradesTodaySub,
            color: tradesTodayColor,
          },
          {
            icon: <TrendingDown className="w-4 h-4" />,
            label: "Daily P&L",
            value: status ? `${status.dailyPnL >= 0 ? "+" : ""}${usd(status.dailyPnL)}` : "—",
            sub: status ? `${status.dailyPnL >= 0 ? "+" : ""}${pct(status.dailyPnLPct, 2)} today` : "loading…",
            color: status && status.dailyPnL >= 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            icon: <Activity className="w-4 h-4" />,
            label: "Risk Level",
            value: status?.riskLevel ?? "—",
            sub: status?.haltReason ?? "Within all limits",
            color: riskLevelColor,
          },
        ].map(({ icon, label, value, sub, color }) => (
          <div key={label} className={`border rounded-xl p-4 ${riskLevelBg}`}>
            <div className="flex items-center gap-1.5 text-muted-foreground/60 mb-2 text-xs">
              {icon}{label}
            </div>
            {loading && !status
              ? <div className="h-6 bg-border/20 rounded animate-pulse mb-1" />
              : <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            }
            <div className="text-xs text-muted-foreground/50 truncate">{sub}</div>
          </div>
        ))}
      </div>

      {/* Config + Status grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* Configuration panel */}
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-sm font-semibold">Risk Configuration</span>
            </div>
            {dirty && !saved && (
              <span className="text-[10px] font-mono text-yellow-400 border border-yellow-400/20 bg-yellow-400/5 px-2 py-0.5 rounded">
                Unsaved changes
              </span>
            )}
          </div>

          <div className="p-5 flex flex-col gap-6">
            {loading || !draft ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-border/10 rounded animate-pulse" />)
            ) : (
              <>
                {/* Capital */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">Total Capital</label>
                    <input
                      type="number" min={1000} step={1000}
                      value={draft.totalCapitalUSD}
                      onChange={(e) => patchDraft({ totalCapitalUSD: Number(e.target.value) })}
                      className="w-32 bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm font-mono text-right focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/50">Total portfolio capital available for the system</p>
                </div>

                <RiskSlider
                  label="Allocation per Trade"
                  value={draft.allocationPct}
                  min={1} max={50} step={1} unit="%"
                  onChange={(v) => patchDraft({ allocationPct: v })}
                  description={`Each trade uses up to ${pct(draft.allocationPct)} of capital = ${usd((draft.allocationPct / 100) * draft.totalCapitalUSD)}`}
                />

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">Max Trade Size</label>
                    <input
                      type="number" min={100} step={100}
                      value={draft.maxTradeSizeUSD}
                      onChange={(e) => patchDraft({ maxTradeSizeUSD: Number(e.target.value) })}
                      className="w-32 bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm font-mono text-right focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/50">
                    Hard cap per trade — effective max is <span className="text-primary font-mono">{usd(Math.min(draft.maxTradeSizeUSD, (draft.allocationPct / 100) * draft.totalCapitalUSD))}</span>
                  </p>
                </div>

                <RiskSlider
                  label="Daily Loss Limit"
                  value={draft.dailyLossLimitPct}
                  min={1} max={20} step={0.5} unit="%"
                  onChange={(v) => patchDraft({ dailyLossLimitPct: v })}
                  description={`Trading halts if daily losses exceed ${pct(draft.dailyLossLimitPct)} = ${usd((draft.dailyLossLimitPct / 100) * draft.totalCapitalUSD)}`}
                />

                {/* Max Trades / Day — 0 = unlimited */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">Max Trades / Day</label>
                    <div className="flex items-center gap-2">
                      {draft.maxTradesPerDay === 0 && (
                        <span className="text-[10px] font-mono text-primary border border-primary/20 bg-primary/5 px-2 py-0.5 rounded">
                          UNLIMITED
                        </span>
                      )}
                      <input
                        type="number" min={0} max={1000} step={1}
                        value={draft.maxTradesPerDay}
                        onChange={(e) => patchDraft({ maxTradesPerDay: Number(e.target.value) })}
                        className="w-32 bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm font-mono text-right focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground/50">
                    Maximum trades allowed per calendar day · <span className="text-primary font-mono">0 = unlimited</span>
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="px-5 pb-5 flex items-center gap-3">
            <button
              onClick={saveConfig}
              disabled={saving || !dirty || loading}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                dirty && !saving
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-primary/20 text-primary/40 cursor-not-allowed"
              }`}
            >
              {saving ? "Saving…" : saved ? "✓ Saved" : "Save Configuration"}
            </button>
            {dirty && (
              <button
                onClick={() => { setDraft(config); setDirty(false); }}
                className="px-4 py-2.5 rounded-lg text-sm border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Right column: status + validator */}
        <div className="flex flex-col gap-4">

          {/* Live usage */}
          <div className="bg-card border border-border/40 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-sm font-semibold">Today's Usage</span>
            </div>
            {loading || !status || !config
              ? <div className="h-24 bg-border/10 rounded animate-pulse" />
              : (
                <>
                  <UsageBar
                    label="Trade Count"
                    usedPct={unlimited ? 0 : (status.tradesUsedToday / config.maxTradesPerDay) * 100}
                    used={String(status.tradesUsedToday)}
                    total={String(config.maxTradesPerDay)}
                    color="bg-cyan-400"
                    unlimited={unlimited}
                  />
                  <UsageBar
                    label="Daily Loss Budget"
                    usedPct={status.dailyLossUsedPct}
                    used={usd(status.dailyLossUsedUSD)}
                    total={usd(status.dailyLossLimitUSD)}
                    color={status.dailyLossUsedPct > 70 ? "bg-red-400" : status.dailyLossUsedPct > 40 ? "bg-orange-400" : "bg-emerald-400"}
                  />
                  <div className="pt-2 border-t border-border/20 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground/50 font-mono flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Resets at midnight
                    </span>
                    <span className={`font-bold ${riskLevelColor}`}>{status.riskLevel} RISK</span>
                  </div>
                </>
              )
            }
          </div>

          {/* Trade validator */}
          <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
              <Zap className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-sm font-semibold">Pre-trade Validator</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground/70 mb-1.5 block">Hypothetical trade size (USD)</label>
                <div className="flex gap-2">
                  <input
                    type="number" min={100} step={100}
                    value={validateSize}
                    onChange={(e) => { setValidateSize(Number(e.target.value)); setValidateResult(null); }}
                    className="flex-1 bg-background border border-border/50 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={runValidation}
                    disabled={validating}
                    className="px-4 py-2 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-40"
                  >
                    {validating ? "…" : "Validate"}
                  </button>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[500, 1000, 2500, 5000, 10000].map((v) => (
                    <button key={v} onClick={() => { setValidateSize(v); setValidateResult(null); }}
                      className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${validateSize === v ? "border-primary/50 text-primary bg-primary/10" : "border-border/30 text-muted-foreground/50 hover:text-foreground"}`}>
                      {usd(v, 0)}
                    </button>
                  ))}
                </div>
              </div>

              {validateResult && (
                <div className={`rounded-lg border p-3 ${validateResult.allowed ? "border-emerald-400/20 bg-emerald-400/5" : "border-red-400/20 bg-red-400/5"}`}>
                  <div className={`flex items-center gap-2 font-bold text-sm mb-2 ${validateResult.allowed ? "text-emerald-400" : "text-red-400"}`}>
                    {validateResult.allowed
                      ? <><CheckCircle2 className="w-4 h-4" /> TRADE ALLOWED</>
                      : <><AlertTriangle className="w-4 h-4" /> TRADE BLOCKED</>
                    }
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {Object.entries(validateResult.checks).map(([key, check]) => (
                      <div key={key} className="flex items-start gap-2 text-xs">
                        <span className={`mt-0.5 shrink-0 ${check.pass ? "text-emerald-400" : "text-red-400"}`}>
                          {check.pass ? "✓" : "✗"}
                        </span>
                        <span className={check.pass ? "text-muted-foreground/70" : "text-red-300"}>{check.reason}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/20 text-xs font-mono text-muted-foreground/50">
                    Max allowed: <span className="text-foreground">{usd(validateResult.maxAllowedSizeUSD)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground/40 pt-1 border-t border-border/20">
                <Lock className="w-3 h-3 shrink-0" />
                Validation only — no trades are placed. Execution in Module 13.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
