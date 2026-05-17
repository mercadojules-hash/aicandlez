import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings2, X, Zap, ShieldAlert, DollarSign, Repeat2,
  CheckCircle2, Loader2, AlertTriangle, SlidersHorizontal,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppSettings {
  allocation:       number;
  maxTradesPerDay:  number;
  minConfidence:    number;
  autoMode:         boolean;
  stopLossPercent:  number;
  takeProfitPercent: number;
  killSwitch:       boolean;
}

// ── Local storage cache key ───────────────────────────────────────────────────

const STORAGE_KEY = "ac_settings_cache_v1";

function loadCache(): Partial<AppSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCache(s: Partial<AppSettings>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskLabel(conf: number) {
  if (conf >= 75) return { label: "Low Risk",    color: "text-emerald-400", level: "low"    };
  if (conf >= 60) return { label: "Medium Risk", color: "text-amber-400",   level: "medium" };
  return               { label: "High Risk",    color: "text-red-400",     level: "high"   };
}

// ── Row components ────────────────────────────────────────────────────────────

function SettingRow({ label, sub, children }: {
  label: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border/20 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground/50 mt-0.5">{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted/40"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

const TRADE_PRESETS = [3, 5, 10] as const;

function TradeCapSelector({ value, onChange }: {
  value: number; onChange: (v: number) => void;
}) {
  const [custom, setCustom] = useState(!TRADE_PRESETS.includes(value as any));
  const [inputVal, setInputVal] = useState(String(value));

  return (
    <div className="flex items-center gap-1.5">
      {TRADE_PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => { setCustom(false); onChange(p); }}
          className={`w-10 h-8 rounded-lg text-xs font-bold border transition-colors ${
            !custom && value === p
              ? "bg-primary/20 border-primary/50 text-primary"
              : "bg-muted/20 border-border/30 text-muted-foreground hover:border-border"
          }`}
        >
          {p}
        </button>
      ))}
      <div className="relative">
        <input
          type="number"
          min={1} max={50}
          className={`w-14 h-8 px-2 rounded-lg text-xs font-mono border text-center bg-muted/20 outline-none transition-colors ${
            custom
              ? "border-primary/50 text-primary"
              : "border-border/30 text-muted-foreground focus:border-primary/40"
          }`}
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            const n = parseInt(e.target.value);
            if (!isNaN(n) && n > 0) { setCustom(true); onChange(n); }
          }}
          placeholder="..."
        />
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export function SettingsDrawer() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const drawerRef = useRef<HTMLDivElement>(null);

  const { data: remoteSettings, isLoading } = useQuery<AppSettings>({
    queryKey:  ["settings"],
    queryFn:   () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 30_000,
  });

  // Merge remote with local cache (local wins if remote not yet loaded)
  const [local, setLocal] = useState<Partial<AppSettings>>(loadCache);

  useEffect(() => {
    if (remoteSettings) {
      const merged = { ...remoteSettings, ...loadCache() };
      setLocal(merged);
      saveCache(merged);
    }
  }, [remoteSettings]);

  const settings = { ...remoteSettings, ...local } as AppSettings;

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (patch: Partial<AppSettings>) =>
      fetch("/api/settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
      saveTimer.current = setTimeout(() => setSaveState("idle"), 2000);
    },
    onError: () => {
      setSaveState("error");
      saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    },
  });

  const update = useCallback((patch: Partial<AppSettings>) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      saveCache(next);
      return next;
    });
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    mutation.mutate(patch);
  }, [mutation]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const risk = riskLabel(settings.minConfidence ?? 80);

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={`fixed bottom-4 right-4 z-[9990] w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all
          ${open
            ? "bg-primary text-primary-foreground rotate-45"
            : "bg-card border border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        title="Settings"
      >
        <Settings2 className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[9989] bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      )}

      {/* Drawer — slides up on mobile, appears right on desktop */}
      {open && (
        <div
          ref={drawerRef}
          className="fixed z-[9991] bg-card border border-border/50 shadow-2xl
            bottom-0 left-0 right-0 rounded-t-2xl p-5 pb-8
            sm:bottom-16 sm:right-4 sm:left-auto sm:w-[360px] sm:rounded-2xl sm:pb-5"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm flex-1">Control Panel</h2>
            {saveState === "saving" && <Loader2 className="w-3.5 h-3.5 text-muted-foreground/50 animate-spin" />}
            {saveState === "saved"  && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            {saveState === "error"  && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
            <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground/40 hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground/40 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-0">
              {/* Auto-trading toggle */}
              <SettingRow
                label="Auto-Trading"
                sub={settings.autoMode ? "Engine executes signals automatically" : "Manual mode — signals only, no auto-trades"}
              >
                <Toggle
                  value={settings.autoMode ?? false}
                  onChange={(v) => update({ autoMode: v })}
                />
              </SettingRow>

              {/* Max trades per day */}
              <SettingRow
                label="Max Trades / Day"
                sub="Engine stops after this many trades today"
              >
                <TradeCapSelector
                  value={settings.maxTradesPerDay ?? 5}
                  onChange={(v) => update({ maxTradesPerDay: v })}
                />
              </SettingRow>

              {/* Position size */}
              <SettingRow
                label="Position Size"
                sub="USD allocation per trade (% of sim balance)"
              >
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <input
                    type="number" min={1} max={100}
                    className="w-20 h-8 px-2 rounded-lg text-xs font-mono border border-border/40 bg-muted/20 text-right outline-none focus:border-primary/40"
                    value={settings.allocation ?? 20}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) update({ allocation: v });
                    }}
                  />
                  <span className="text-xs text-muted-foreground/50">%</span>
                </div>
              </SettingRow>

              {/* Risk level (min confidence) */}
              <SettingRow
                label="Min Confidence Threshold"
                sub={`Current: ${risk.label} — signal must exceed this to trade`}
              >
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-bold ${risk.color}`}>{settings.minConfidence ?? 80}%</span>
                  <input
                    type="range" min={35} max={95} step={5}
                    className="w-28 accent-primary h-1.5"
                    value={settings.minConfidence ?? 80}
                    onChange={(e) => update({ minConfidence: parseInt(e.target.value) })}
                  />
                  <div className="flex justify-between w-28 text-[9px] text-muted-foreground/30">
                    <span>Aggressive</span>
                    <span>Safe</span>
                  </div>
                </div>
              </SettingRow>

              {/* Stop loss */}
              <SettingRow label="Stop Loss" sub="Automatic exit if trade drops this far">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={0.5} max={20} step={0.5}
                    className="w-16 h-8 px-2 rounded-lg text-xs font-mono border border-border/40 bg-muted/20 text-right outline-none focus:border-primary/40"
                    value={settings.stopLossPercent ?? 2}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) update({ stopLossPercent: v });
                    }}
                  />
                  <span className="text-xs text-muted-foreground/50">%</span>
                </div>
              </SettingRow>

              {/* Take profit */}
              <SettingRow label="Take Profit" sub="Automatic exit at this gain">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={1} max={50} step={0.5}
                    className="w-16 h-8 px-2 rounded-lg text-xs font-mono border border-border/40 bg-muted/20 text-right outline-none focus:border-primary/40"
                    value={settings.takeProfitPercent ?? 4}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) update({ takeProfitPercent: v });
                    }}
                  />
                  <span className="text-xs text-muted-foreground/50">%</span>
                </div>
              </SettingRow>
            </div>
          )}

          {/* Status bar */}
          <div className="mt-5 pt-4 border-t border-border/20 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${settings.autoMode ? "bg-emerald-500 animate-pulse" : "bg-muted/50"}`} />
            <span className="text-[11px] text-muted-foreground/60">
              {settings.autoMode ? "Auto-trading active" : "Auto-trading disabled"} · Max {settings.maxTradesPerDay ?? 5}/day · {settings.allocation ?? 20}% position
            </span>
          </div>
        </div>
      )}
    </>
  );
}
