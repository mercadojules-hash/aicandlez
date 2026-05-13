import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Shield,
  SlidersHorizontal,
  Bell,
  Globe,
  Save,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Link2,
  Link2Off,
  Loader2,
  FlaskConical,
  Star,
  X,
  Eye,
  EyeOff,
  TriangleAlert,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserSettings {
  id: string;
  userId: string;
  aiPersonality: string;
  minConfidence: number;
  riskLevel: string;
  positionSizeUSD: number;
  maxTradesPerDay: number;
  maxActivePositions: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  autoMode: boolean;
  tradingMode: string;
  volumeFilter: boolean;
  require1HTrend: boolean;
  preferredExchange: string;
  notificationsTradeExec: boolean;
  notificationsSignals: boolean;
  notificationsRiskAlerts: boolean;
  timezone: string;
  currency: string;
}

interface ExchangeMeta {
  name: string;
  url: string;
  logo: string;
  requiresPassphrase: boolean;
  requiredPerms: string;
  warnings: string[];
}

interface ExchangeConnection {
  id: string;
  exchange: string;
  label: string;
  status: string;
  isDefault: boolean;
  tradingMode: string;
  permissions: { read: boolean; trade: boolean; withdraw: boolean } | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  meta: ExchangeMeta | null;
}

interface ExchangeEntry {
  exchange: string;
  connected: boolean;
  connection: ExchangeConnection | null;
  meta: ExchangeMeta | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchSettings(): Promise<UserSettings> {
  const r = await fetch("/api/user/settings");
  if (!r.ok) throw new Error("Failed to load settings");
  return r.json();
}

async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const r = await fetch("/api/user/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("Failed to save settings");
  return r.json();
}

async function fetchExchanges(): Promise<{ exchanges: ExchangeEntry[] }> {
  const r = await fetch("/api/user/exchanges");
  if (!r.ok) throw new Error("Failed to load exchange connections");
  return r.json();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_PERSONALITIES = [
  { value: "conservative", label: "Conservative", desc: "Lower risk, fewer signals, higher confidence threshold", color: "#00ff8a" },
  { value: "balanced",     label: "Balanced",     desc: "Default: balanced risk/reward, standard filters",     color: "#00aaff" },
  { value: "aggressive",   label: "Aggressive",   desc: "Higher position sizes, lower confidence threshold",   color: "#cc55ff" },
];

const RISK_LEVELS = [
  { value: "low",      label: "Low",      desc: "≤1% stop loss, smaller positions",  color: "#00ff8a" },
  { value: "moderate", label: "Moderate", desc: "2% stop loss, standard positions",  color: "#00aaff" },
  { value: "high",     label: "High",     desc: "≤4% stop loss, larger positions",   color: "#ff6600" },
];

const EXCHANGES = ["Kraken", "Binance", "Coinbase"];
const TIMEZONES = ["UTC", "US/Eastern", "US/Pacific", "Europe/London", "Asia/Tokyo", "Asia/Singapore"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY"];

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, color = "#00aaff", children, defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  color?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: "#0D2035", background: "#010C18" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
        style={{ background: "#020E1C" }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color, filter: `drop-shadow(0 0 6px ${color}60)` }} />
        <span className="font-mono text-[11px] font-bold tracking-[0.2em] flex-1" style={{ color: "#7ab8cc" }}>
          {title}
        </span>
        {open
          ? <ChevronUp className="w-3 h-3" style={{ color: "#3a5a70" }} />
          : <ChevronDown className="w-3 h-3" style={{ color: "#3a5a70" }} />
        }
      </button>
      {open && <div className="px-4 py-4 grid gap-4">{children}</div>}
    </div>
  );
}

function ToggleSwitch({
  value, onChange, label, desc,
}: { value: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-mono text-[10px] font-medium" style={{ color: "#7ab8cc" }}>{label}</div>
        {desc && <div className="font-mono text-[9px]" style={{ color: "#3a5a70" }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="shrink-0 w-9 h-5 rounded-full relative transition-colors"
        style={{
          background: value ? "#00aaff30" : "#0D2035",
          border: `1px solid ${value ? "#00aaff60" : "#1a3a50"}`,
        }}
      >
        <span
          className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all"
          style={{
            left: value ? "calc(100% - 18px)" : "2px",
            background: value ? "#00aaff" : "#2a4a60",
            boxShadow: value ? "0 0 6px #00aaff80" : "none",
          }}
        />
      </button>
    </div>
  );
}

function NumberInput({
  label, value, onChange, min, max, step = 1, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div>
      <label className="font-mono text-[9px] font-medium tracking-wider block mb-1" style={{ color: "#4a6a80" }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-24 px-2 py-1.5 rounded border font-mono text-[11px] text-right focus:outline-none"
          style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#EAF2FF" }}
          onFocus={e => (e.target.style.borderColor = "#00aaff60")}
          onBlur={e =>  (e.target.style.borderColor = "#1a3a50")}
        />
        {suffix && <span className="font-mono text-[9px]" style={{ color: "#4a6a80" }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SelectInput({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="font-mono text-[9px] font-medium tracking-wider block mb-1" style={{ color: "#4a6a80" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 rounded border font-mono text-[11px] focus:outline-none"
        style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#EAF2FF" }}
        onFocus={e => (e.target.style.borderColor = "#00aaff60")}
        onBlur={e =>  (e.target.style.borderColor = "#1a3a50")}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── Connect Modal ─────────────────────────────────────────────────────────────

function ConnectModal({
  entry,
  onClose,
  onSuccess,
}: {
  entry: ExchangeEntry;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [apiKey,     setApiKey]     = useState("");
  const [apiSecret,  setApiSecret]  = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [label,      setLabel]      = useState("Default");
  const [showKey,    setShowKey]    = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const needsPassphrase = entry.meta?.requiresPassphrase ?? false;

  async function handleConnect() {
    if (!acknowledged) { setError("Please acknowledge the safety warning before connecting."); return; }
    if (!apiKey.trim() || !apiSecret.trim()) { setError("API Key and Secret are required."); return; }
    if (needsPassphrase && !passphrase.trim()) { setError(`${entry.exchange} requires a passphrase.`); return; }

    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/user/exchanges/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange:    entry.exchange,
          apiKey:      apiKey.trim(),
          apiSecret:   apiSecret.trim(),
          passphrase:  passphrase.trim() || undefined,
          label:       label.trim() || "Default",
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? "Connection failed. Check your credentials and try again.");
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded border p-5 grid gap-4"
        style={{ background: "#010C18", borderColor: "#1a3a50" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[13px] font-bold" style={{ color: "#EAF2FF" }}>
              CONNECT {entry.exchange.toUpperCase()}
            </div>
            <div className="font-mono text-[9px] mt-0.5" style={{ color: "#3a5a70" }}>
              Credentials are encrypted and never exposed after saving.
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "#3a5a70" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Required permissions notice */}
        {entry.meta && (
          <div className="px-3 py-2 rounded border" style={{ background: "#020E1C", borderColor: "#1a3a50" }}>
            <div className="font-mono text-[9px] font-bold mb-1" style={{ color: "#00aaff" }}>
              REQUIRED API PERMISSIONS
            </div>
            <div className="font-mono text-[9px]" style={{ color: "#7ab8cc" }}>
              {entry.meta.requiredPerms}
            </div>
          </div>
        )}

        {/* Safety warnings */}
        {entry.meta?.warnings && (
          <div className="px-3 py-2 rounded border grid gap-1" style={{ background: "#0d0508", borderColor: "#ff445530" }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <TriangleAlert className="w-3 h-3 shrink-0" style={{ color: "#ff8844" }} />
              <span className="font-mono text-[9px] font-bold" style={{ color: "#ff8844" }}>SAFETY RULES</span>
            </div>
            {entry.meta.warnings.map((w, i) => (
              <div key={i} className="font-mono text-[9px]" style={{ color: "#cc6644" }}>• {w}</div>
            ))}
          </div>
        )}

        {/* Label */}
        <div>
          <label className="font-mono text-[9px] font-medium tracking-wider block mb-1" style={{ color: "#4a6a80" }}>
            LABEL (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Main Account"
            className="w-full px-2 py-1.5 rounded border font-mono text-[11px] focus:outline-none"
            style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#EAF2FF" }}
            onFocus={e => (e.target.style.borderColor = "#00aaff60")}
            onBlur={e  => (e.target.style.borderColor = "#1a3a50")}
          />
        </div>

        {/* API Key */}
        <div>
          <label className="font-mono text-[9px] font-medium tracking-wider block mb-1" style={{ color: "#4a6a80" }}>
            API KEY
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste API key..."
              autoComplete="off"
              className="w-full px-2 py-1.5 pr-8 rounded border font-mono text-[11px] focus:outline-none"
              style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#EAF2FF" }}
              onFocus={e => (e.target.style.borderColor = "#00aaff60")}
              onBlur={e  => (e.target.style.borderColor = "#1a3a50")}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "#3a5a70" }}
            >
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* API Secret */}
        <div>
          <label className="font-mono text-[9px] font-medium tracking-wider block mb-1" style={{ color: "#4a6a80" }}>
            API SECRET
          </label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              placeholder="Paste API secret..."
              autoComplete="off"
              className="w-full px-2 py-1.5 pr-8 rounded border font-mono text-[11px] focus:outline-none"
              style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#EAF2FF" }}
              onFocus={e => (e.target.style.borderColor = "#00aaff60")}
              onBlur={e  => (e.target.style.borderColor = "#1a3a50")}
            />
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "#3a5a70" }}
            >
              {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Passphrase (OKX, KuCoin) */}
        {needsPassphrase && (
          <div>
            <label className="font-mono text-[9px] font-medium tracking-wider block mb-1" style={{ color: "#4a6a80" }}>
              PASSPHRASE <span style={{ color: "#ff8844" }}>(required)</span>
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder="Passphrase set when creating the key..."
              autoComplete="off"
              className="w-full px-2 py-1.5 rounded border font-mono text-[11px] focus:outline-none"
              style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#EAF2FF" }}
              onFocus={e => (e.target.style.borderColor = "#00aaff60")}
              onBlur={e  => (e.target.style.borderColor = "#1a3a50")}
            />
          </div>
        )}

        {/* Acknowledgement */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={e => setAcknowledged(e.target.checked)}
            className="mt-0.5 accent-current shrink-0"
            style={{ accentColor: "#00aaff" }}
          />
          <span className="font-mono text-[9px] leading-relaxed" style={{ color: "#4a6a80" }}>
            I confirm this API key has <strong style={{ color: "#EAF2FF" }}>no withdrawal permissions</strong> enabled.
            I understand this is a read + trade key only.
          </span>
        </label>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-1.5 px-3 py-2 rounded border" style={{ background: "#1a050a", borderColor: "#ff445530" }}>
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#ff4455" }} />
            <span className="font-mono text-[9px]" style={{ color: "#ff4455" }}>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded border font-mono text-[10px]"
            style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#4a6a80" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="flex-1 py-2 rounded font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
            style={{
              background: "#00aaff18",
              border: "1px solid #00aaff60",
              color: "#00aaff",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Testing...</> : <><Link2 className="w-3 h-3" /> Connect</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Exchange Card ─────────────────────────────────────────────────────────────

function ExchangeCard({
  entry,
  onConnect,
  onDisconnect,
  onTest,
  onSetDefault,
  onSetMode,
}: {
  entry: ExchangeEntry;
  onConnect:    () => void;
  onDisconnect: () => void;
  onTest:       () => void;
  onSetDefault: () => void;
  onSetMode:    (mode: "paper" | "live") => void;
}) {
  const conn = entry.connection;
  const isConnected = entry.connected && conn?.status === "active";
  const isError     = entry.connected && conn?.status === "error";

  const statusColor = isConnected ? "#00ff8a" : isError ? "#ff4455" : "#3a5a70";
  const statusLabel = isConnected ? "CONNECTED" : isError ? "ERROR" : "NOT CONNECTED";

  return (
    <div
      className="rounded border p-3 grid gap-2.5 transition-all"
      style={{
        background:   isConnected ? "#020E1C" : "#010C18",
        borderColor:  isConnected ? "#00ff8a18" : isError ? "#ff445518" : "#0D2035",
        boxShadow:    isConnected ? "0 0 12px #00ff8a06" : "none",
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: statusColor, boxShadow: isConnected ? `0 0 6px ${statusColor}` : "none" }}
          />
          <span className="font-mono text-[11px] font-bold" style={{ color: isConnected ? "#EAF2FF" : "#7ab8cc" }}>
            {entry.exchange}
          </span>
          {conn?.isDefault && (
            <span
              className="font-mono text-[8px] px-1.5 py-0.5 rounded"
              style={{ background: "#00aaff18", color: "#00aaff", border: "1px solid #00aaff30" }}
            >
              DEFAULT
            </span>
          )}
        </div>
        <span className="font-mono text-[8px]" style={{ color: statusColor }}>{statusLabel}</span>
      </div>

      {/* Connection details */}
      {isConnected && conn && (
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="font-mono text-[8px] mb-0.5" style={{ color: "#3a5a70" }}>MODE</div>
            <div
              className="font-mono text-[9px] font-bold"
              style={{ color: conn.tradingMode === "live" ? "#ff8844" : "#00aaff" }}
            >
              {conn.tradingMode.toUpperCase()}
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[8px] mb-0.5" style={{ color: "#3a5a70" }}>READ</div>
            <div className="font-mono text-[9px] font-bold" style={{ color: conn.permissions?.read ? "#00ff8a" : "#ff4455" }}>
              {conn.permissions?.read ? "YES" : "NO"}
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[8px] mb-0.5" style={{ color: "#3a5a70" }}>TRADE</div>
            <div className="font-mono text-[9px] font-bold" style={{ color: conn.permissions?.trade ? "#00ff8a" : "#ff4455" }}>
              {conn.permissions?.trade ? "YES" : "NO"}
            </div>
          </div>
        </div>
      )}

      {/* Last verified */}
      {conn?.lastVerifiedAt && (
        <div className="font-mono text-[8px]" style={{ color: "#3a5a70" }}>
          Last verified: {new Date(conn.lastVerifiedAt).toLocaleString()}
        </div>
      )}

      {/* Error message */}
      {isError && conn?.lastError && (
        <div className="font-mono text-[8px] px-2 py-1.5 rounded" style={{ background: "#1a050a", color: "#ff4455" }}>
          {conn.lastError}
        </div>
      )}

      {/* Paper/Live toggle — only for connected */}
      {isConnected && conn && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSetMode("paper")}
            className="flex-1 py-1 rounded font-mono text-[8px] font-bold transition-all"
            style={{
              background: conn.tradingMode === "paper" ? "#00aaff18" : "#010C18",
              border: `1px solid ${conn.tradingMode === "paper" ? "#00aaff40" : "#1a3a50"}`,
              color: conn.tradingMode === "paper" ? "#00aaff" : "#3a5a70",
            }}
          >
            PAPER
          </button>
          <button
            onClick={() => {
              if (!confirm("Enable LIVE trading mode? Your actual funds will be at risk. Make sure your API key has no withdrawal permissions.")) return;
              onSetMode("live");
            }}
            className="flex-1 py-1 rounded font-mono text-[8px] font-bold transition-all"
            style={{
              background: conn.tradingMode === "live" ? "#ff884418" : "#010C18",
              border: `1px solid ${conn.tradingMode === "live" ? "#ff884440" : "#1a3a50"}`,
              color: conn.tradingMode === "live" ? "#ff8844" : "#3a5a70",
            }}
          >
            LIVE
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {!entry.connected ? (
          <button
            onClick={onConnect}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded font-mono text-[9px] font-bold transition-all"
            style={{ background: "#00aaff14", border: "1px solid #00aaff40", color: "#00aaff" }}
          >
            <Link2 className="w-3 h-3" /> Connect
          </button>
        ) : (
          <>
            <button
              onClick={onTest}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded font-mono text-[9px] transition-all"
              style={{ background: "#020E1C", border: "1px solid #1a3a50", color: "#4a6a80" }}
              title="Test connection health"
            >
              <FlaskConical className="w-3 h-3" /> Test
            </button>
            {!conn?.isDefault && (
              <button
                onClick={onSetDefault}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded font-mono text-[9px] transition-all"
                style={{ background: "#020E1C", border: "1px solid #1a3a50", color: "#4a6a80" }}
                title="Set as default exchange"
              >
                <Star className="w-3 h-3" /> Default
              </button>
            )}
            <button
              onClick={() => {
                if (!confirm(`Disconnect ${entry.exchange}? Your encrypted API keys will be permanently deleted.`)) return;
                onDisconnect();
              }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded font-mono text-[9px] transition-all"
              style={{ background: "#1a050a", border: "1px solid #ff445520", color: "#ff4455" }}
              title="Disconnect and delete credentials"
            >
              <Link2Off className="w-3 h-3" /> Disconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Exchange Connections Section ──────────────────────────────────────────────

function ExchangeConnectionsSection() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-exchanges"],
    queryFn: fetchExchanges,
  });

  const [connectingExchange, setConnectingExchange] = useState<ExchangeEntry | null>(null);
  const [testingExchange, setTestingExchange]       = useState<string | null>(null);
  const [actionExchange, setActionExchange]         = useState<string | null>(null);

  async function handleDisconnect(exchange: string) {
    setActionExchange(exchange);
    try {
      await fetch(`/api/user/exchanges/${exchange}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["user-exchanges"] });
    } finally {
      setActionExchange(null);
    }
  }

  async function handleTest(exchange: string) {
    setTestingExchange(exchange);
    try {
      await fetch(`/api/user/exchanges/${exchange}/test`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["user-exchanges"] });
    } finally {
      setTestingExchange(null);
    }
  }

  async function handleSetDefault(exchange: string) {
    await fetch(`/api/user/exchanges/${exchange}/default`, { method: "POST" });
    await qc.invalidateQueries({ queryKey: ["user-exchanges"] });
  }

  async function handleSetMode(exchange: string, mode: "paper" | "live") {
    await fetch(`/api/user/exchanges/${exchange}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, acknowledged: mode === "live" ? true : undefined }),
    });
    await qc.invalidateQueries({ queryKey: ["user-exchanges"] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: "#3a5a70" }}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="font-mono text-[9px]">Loading exchange connections...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-4">
        <AlertTriangle className="w-3 h-3" style={{ color: "#ff4455" }} />
        <span className="font-mono text-[9px]" style={{ color: "#ff4455" }}>
          Failed to load exchange connections.
        </span>
        <button
          onClick={() => refetch()}
          className="font-mono text-[9px]"
          style={{ color: "#00aaff" }}
        >
          Retry
        </button>
      </div>
    );
  }

  const exchanges = data?.exchanges ?? [];
  const connectedCount = exchanges.filter(e => e.connected).length;

  return (
    <div className="grid gap-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px]" style={{ color: "#3a5a70" }}>
          {connectedCount} of {exchanges.length} exchanges connected
        </span>
        {connectedCount > 0 && (
          <span
            className="font-mono text-[8px] px-2 py-0.5 rounded"
            style={{ background: "#00ff8a0c", color: "#00ff8a", border: "1px solid #00ff8a20" }}
          >
            {connectedCount} ACTIVE
          </span>
        )}
      </div>

      {/* Safety note */}
      <div className="px-3 py-2 rounded border" style={{ background: "#0a0508", borderColor: "#ff884420" }}>
        <div className="flex items-center gap-1.5 mb-1">
          <TriangleAlert className="w-3 h-3 shrink-0" style={{ color: "#ff8844" }} />
          <span className="font-mono text-[9px] font-bold" style={{ color: "#ff8844" }}>
            WITHDRAWAL PERMISSIONS ARE NEVER REQUESTED
          </span>
        </div>
        <p className="font-mono text-[8px] leading-relaxed" style={{ color: "#8a5a40" }}>
          Create API keys with <strong style={{ color: "#ff8844" }}>trading permissions only</strong>. Never enable
          withdrawals. Apex Trader does not support or request withdrawal access.
          Live trading defaults to disabled — you must explicitly enable it per connection.
        </p>
      </div>

      {/* Exchange cards grid */}
      <div className="grid gap-2">
        {exchanges.map(entry => (
          <ExchangeCard
            key={entry.exchange}
            entry={entry}
            onConnect={() => setConnectingExchange(entry)}
            onDisconnect={() => handleDisconnect(entry.exchange)}
            onTest={() => handleTest(entry.exchange)}
            onSetDefault={() => handleSetDefault(entry.exchange)}
            onSetMode={mode => handleSetMode(entry.exchange, mode)}
          />
        ))}
      </div>

      {/* Testing / action status */}
      {(testingExchange || actionExchange) && (
        <div className="flex items-center gap-2" style={{ color: "#3a5a70" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="font-mono text-[9px]">
            {testingExchange ? `Testing ${testingExchange}...` : `Updating ${actionExchange}...`}
          </span>
        </div>
      )}

      {/* Connect modal */}
      {connectingExchange && (
        <ConnectModal
          entry={connectingExchange}
          onClose={() => setConnectingExchange(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["user-exchanges"] })}
        />
      )}
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<UserSettings>({
    queryKey: ["user-settings"],
    queryFn: fetchSettings,
  });

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (updated) => {
      qc.setQueryData(["user-settings"], updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const [draft, setDraft] = useState<Partial<UserSettings>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
  };

  const handleReset = () => { if (data) setDraft(data); };
  const handleSave  = () => { mutation.mutate(draft as Partial<UserSettings>); };

  const merged: Partial<UserSettings> = { ...data, ...draft };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#060810" }}>
        <div className="font-mono text-[11px] animate-pulse" style={{ color: "#3a5a70" }}>
          LOADING SETTINGS...
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-2" style={{ background: "#060810" }}>
        <AlertTriangle className="w-4 h-4" style={{ color: "#ff4455" }} />
        <span className="font-mono text-[11px]" style={{ color: "#ff4455" }}>
          Failed to load settings. Make sure you are signed in.
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "#060810" }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-mono text-[16px] font-bold tracking-[0.25em]" style={{ color: "#EAF2FF" }}>
              ACCOUNT SETTINGS
            </h1>
            <p className="font-mono text-[9px] mt-0.5" style={{ color: "#3a5a70" }}>
              Personalise your trading engine, risk profile, and notifications
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[10px] transition-colors"
              style={{ background: "#010C18", borderColor: "#1a3a50", color: "#4a6a80" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#7a9eb8")}
              onMouseLeave={e => (e.currentTarget.style.color = "#4a6a80")}
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded font-mono text-[10px] font-bold transition-all"
              style={{
                background: saved ? "#00ff8a18" : mutation.isPending ? "#00aaff10" : "#00aaff20",
                border: `1px solid ${saved ? "#00ff8a60" : "#00aaff60"}`,
                color: saved ? "#00ff8a" : "#00aaff",
                boxShadow: saved ? "0 0 12px #00ff8a18" : mutation.isPending ? "none" : "0 0 12px #00aaff12",
              }}
            >
              {saved
                ? <><CheckCircle className="w-3 h-3" /> Saved</>
                : mutation.isPending
                ? <><Save className="w-3 h-3 animate-spin" /> Saving...</>
                : <><Save className="w-3 h-3" /> Save Changes</>
              }
            </button>
          </div>
        </div>

        {mutation.isError && (
          <div className="mb-4 px-3 py-2 rounded border flex items-center gap-2"
            style={{ background: "#1a050a", borderColor: "#ff445530" }}>
            <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: "#ff4455" }} />
            <span className="font-mono text-[9px]" style={{ color: "#ff4455" }}>
              Failed to save settings. Please try again.
            </span>
          </div>
        )}

        <div className="grid gap-3">

          {/* ── Exchange Connections ───────────────────────────────────── */}
          <Section title="EXCHANGE CONNECTIONS" icon={Link2} color="#00aaff" defaultOpen={true}>
            <ExchangeConnectionsSection />
          </Section>

          {/* ── AI Configuration ──────────────────────────────────────── */}
          <Section title="AI CONFIGURATION" icon={Brain} color="#cc55ff">
            <div>
              <div className="font-mono text-[9px] font-medium tracking-wider mb-2" style={{ color: "#4a6a80" }}>
                AI PERSONALITY
              </div>
              <div className="grid grid-cols-3 gap-2">
                {AI_PERSONALITIES.map(p => (
                  <button
                    key={p.value}
                    onClick={() => set("aiPersonality", p.value)}
                    className="flex flex-col gap-1 p-2.5 rounded border text-left transition-all"
                    style={{
                      background: merged.aiPersonality === p.value ? `${p.color}0c` : "#020E1C",
                      borderColor: merged.aiPersonality === p.value ? `${p.color}50` : "#0D2035",
                      boxShadow:   merged.aiPersonality === p.value ? `0 0 12px ${p.color}12` : "none",
                    }}
                  >
                    <span className="font-mono text-[10px] font-bold"
                      style={{ color: merged.aiPersonality === p.value ? p.color : "#4a6a80" }}>
                      {p.label}
                    </span>
                    <span className="font-mono text-[8px] leading-tight" style={{ color: "#3a5a70" }}>
                      {p.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <NumberInput
              label="MIN CONFIDENCE THRESHOLD (%)"
              value={merged.minConfidence ?? 60}
              onChange={v => set("minConfidence", v)}
              min={20} max={95} step={5} suffix="%"
            />
          </Section>

          {/* ── Risk Management ───────────────────────────────────────── */}
          <Section title="RISK MANAGEMENT" icon={Shield} color="#ff8844">
            <div>
              <div className="font-mono text-[9px] font-medium tracking-wider mb-2" style={{ color: "#4a6a80" }}>
                RISK LEVEL
              </div>
              <div className="grid grid-cols-3 gap-2">
                {RISK_LEVELS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => set("riskLevel", r.value)}
                    className="flex flex-col gap-1 p-2.5 rounded border text-left transition-all"
                    style={{
                      background: merged.riskLevel === r.value ? `${r.color}0c` : "#020E1C",
                      borderColor: merged.riskLevel === r.value ? `${r.color}50` : "#0D2035",
                    }}
                  >
                    <span className="font-mono text-[10px] font-bold"
                      style={{ color: merged.riskLevel === r.value ? r.color : "#4a6a80" }}>
                      {r.label}
                    </span>
                    <span className="font-mono text-[8px] leading-tight" style={{ color: "#3a5a70" }}>
                      {r.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumberInput label="POSITION SIZE (USD)" value={merged.positionSizeUSD ?? 20} onChange={v => set("positionSizeUSD", v)} min={5} max={100000} step={5} suffix="USD" />
              <NumberInput label="MAX TRADES / DAY" value={merged.maxTradesPerDay ?? 5} onChange={v => set("maxTradesPerDay", Math.round(v))} min={0} max={100} step={1} suffix="trades" />
              <NumberInput label="MAX ACTIVE POSITIONS" value={merged.maxActivePositions ?? 3} onChange={v => set("maxActivePositions", Math.round(v))} min={1} max={20} step={1} suffix="positions" />
              <NumberInput label="STOP LOSS" value={merged.stopLossPercent ?? 2} onChange={v => set("stopLossPercent", v)} min={0.1} max={20} step={0.1} suffix="%" />
              <NumberInput label="TAKE PROFIT" value={merged.takeProfitPercent ?? 4} onChange={v => set("takeProfitPercent", v)} min={0.1} max={50} step={0.1} suffix="%" />
            </div>

            <div className="grid gap-3">
              <ToggleSwitch value={merged.autoMode ?? false} onChange={v => set("autoMode", v)} label="AUTO TRADING MODE" desc="Engine automatically executes qualifying signals in your sim account" />
            </div>
          </Section>

          {/* ── Signal Filters ────────────────────────────────────────── */}
          <Section title="SIGNAL FILTERS" icon={SlidersHorizontal} color="#00aaff">
            <div className="grid gap-3">
              <ToggleSwitch value={merged.volumeFilter ?? true} onChange={v => set("volumeFilter", v)} label="VOLUME CONFIRMATION" desc="Only trade when current 5m volume ≥ 85% of 20-bar rolling average" />
              <ToggleSwitch value={merged.require1HTrend ?? false} onChange={v => set("require1HTrend", v)} label="1H TREND ALIGNMENT" desc="Require 1H EMA9 to align with signal direction before executing" />
            </div>
            <SelectInput label="PREFERRED EXCHANGE" value={merged.preferredExchange ?? "Kraken"} options={EXCHANGES} onChange={v => set("preferredExchange", v)} />
          </Section>

          {/* ── Notifications ─────────────────────────────────────────── */}
          <Section title="NOTIFICATIONS" icon={Bell} color="#00eeff" defaultOpen={false}>
            <div className="grid gap-3">
              <ToggleSwitch value={merged.notificationsTradeExec ?? true} onChange={v => set("notificationsTradeExec", v)} label="TRADE EXECUTIONS" desc="Alert when a trade is opened or closed in your account" />
              <ToggleSwitch value={merged.notificationsSignals ?? false} onChange={v => set("notificationsSignals", v)} label="AI SIGNALS" desc="Alert when the engine generates a BUY or SELL signal" />
              <ToggleSwitch value={merged.notificationsRiskAlerts ?? true} onChange={v => set("notificationsRiskAlerts", v)} label="RISK ALERTS" desc="Alert for kill switch activations and drawdown limit breaches" />
            </div>
          </Section>

          {/* ── Preferences ───────────────────────────────────────────── */}
          <Section title="PREFERENCES" icon={Globe} color="#00ff8a" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-4">
              <SelectInput label="TIMEZONE" value={merged.timezone ?? "UTC"} options={TIMEZONES} onChange={v => set("timezone", v)} />
              <SelectInput label="DISPLAY CURRENCY" value={merged.currency ?? "USD"} options={CURRENCIES} onChange={v => set("currency", v)} />
            </div>
          </Section>
        </div>

        {/* Footer note */}
        <div className="mt-4 px-3 py-2 rounded border" style={{ borderColor: "#0D2035", background: "#010C18" }}>
          <p className="font-mono text-[8px]" style={{ color: "#3a5a70" }}>
            Settings are persisted per-account. Changes to AI personality and risk level apply to new signals only.
            Active positions are not affected by changes to stop loss or take profit defaults.
          </p>
        </div>

      </div>
    </div>
  );
}
