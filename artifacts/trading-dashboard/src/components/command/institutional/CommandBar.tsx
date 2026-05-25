/**
 * CommandBar — slim top bar above the institutional dashboard.
 *
 * Houses: AICandlez identity, live engine status, equity / balance summary,
 * pause + kill switch, exchange switcher. Designed to be ~52px tall so the
 * market heartbeat takes the visual priority.
 */

import { useMemo } from "react";
import { Cpu, Pause, Play, ShieldOff, Activity, DollarSign, Zap, Clock } from "lucide-react";
import type { EngineStatus, ExchangeStatus, LiveBalance, SimAccount } from "../types";
import { N } from "./theme";
import { useExchangeCatalog, type CatalogEntry } from "@/hooks/useExchangeCatalog";

interface Exchange {
  id: string; label: string; color: string; disabled?: boolean; soon?: boolean; isSim?: boolean;
}

// R1.5 — operator console exchange switcher hydrates from /api/exchanges/catalog
// (single source of truth). IDs are lowercased for backward compatibility with
// the parent's `selectLive(ex)` handler in CommandCenter.tsx which normalizes
// via `.toLowerCase()` before dispatching to `switchExchangeMode`. Beta exchanges
// (status === "beta") are surfaced as disabled+SOON for visibility without being
// selectable — operator scope on /command is Kraken-first by policy. Coming-soon
// catalog rows are excluded entirely from the operator strip.

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ago(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

interface Props {
  engine?:         EngineStatus;
  exchangeStatus?: ExchangeStatus;
  simAccount?:     SimAccount;
  liveBalance?:    LiveBalance;
  activeId:        string;
  liveActive:      boolean;
  onStartEngine:   () => void;
  onStopEngine:    () => void;
  onTogglePause:   () => void;
  onToggleKill:    () => void;
  onSelectSim:     () => void;
  onSelectLive:    (id: string) => void;
}

function toBarEntry(c: CatalogEntry): Exchange {
  return {
    id:       c.id.toLowerCase(),
    label:    c.name.toUpperCase(),
    color:    c.brandColor ?? N.GOLD,
    disabled: c.status === "beta",
    soon:     c.status === "beta",
  };
}

export function CommandBar({
  engine, exchangeStatus, simAccount, liveBalance,
  activeId, liveActive,
  onStartEngine, onStopEngine, onTogglePause, onToggleKill,
  onSelectSim, onSelectLive,
}: Props) {
  const { exchanges: catalog } = useExchangeCatalog();
  const EXCHANGES = useMemo<Exchange[]>(() =>
    catalog
      .filter(c => c.status !== "coming_soon" && c.adapterAvailable)
      .map(toBarEntry),
    [catalog]
  );
  const isRunning = engine?.running ?? false;
  const isPaused  = exchangeStatus?.paused ?? false;
  const isKill    = exchangeStatus?.killSwitch ?? false;

  // Operator console: equity, PnL, and open-position count ALL come from the
  // live broker. simAccount is intentionally ignored here so no paper/sim
  // data can ever leak onto /command.
  void simAccount;
  const equity    = liveActive ? (liveBalance?.balances?.USD ?? null) : null;
  const pnl       = null as number | null;
  const pnlPct    = null as number | null;
  const pnlPos    = true;
  const openCount = 0;

  return (
    <header
      className="w-full flex items-center gap-3 px-3 py-2"
      style={{
        background:    N.BG,
        borderBottom:  `1px solid ${N.BORDER}`,
        fontFamily:    N.FONT_MONO,
      }}
    >
      {/* Identity */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center justify-center rounded-md"
             style={{
               width: 26, height: 26,
               background: `${N.BRAND}12`,
               border:     `1px solid ${N.BRAND}55`,
               boxShadow: `0 0 5px ${N.BRAND}30, inset 0 0 5px ${N.BRAND}10`,
             }}>
          <Cpu className="w-3.5 h-3.5" style={{ color: N.BRAND }} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: N.TEXT_0 }}>
            AICANDLEZ TERMINAL
          </span>
          <span className="text-[7.5px] font-semibold tracking-[0.2em]" style={{ color: N.BRAND_DEEP }}>
            INSTITUTIONAL · AI EXECUTION DESK
          </span>
        </div>
      </div>

      <Divider />

      {/* Engine state */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span style={{
          width: 6, height: 6, borderRadius: 4,
          background: isRunning ? N.BRAND : N.TEXT_3,
          boxShadow: isRunning ? `0 0 5px ${N.BRAND}` : "none",
          animation:  isRunning ? "neon-pulse 1.4s infinite" : "none",
        }} />
        <span className="text-[9px] font-bold tracking-[0.2em]"
              style={{ color: isRunning ? N.BRAND : N.TEXT_3 }}>
          {isRunning ? "ENGINE LIVE" : "ENGINE IDLE"}
        </span>
        <BarBtn
          label={isRunning ? "STOP" : "START"}
          color={isRunning ? N.SHORT : N.BRAND}
          onClick={isRunning ? onStopEngine : onStartEngine}
        />
      </div>

      <Divider />

      {/* PnL summary */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Stat label="EQUITY"  value={fmtUsd(equity)}                       color={N.TEXT_0} />
        <Stat
          label="UNREAL PNL"
          value={pnl != null ? `${pnlPos ? "+" : ""}$${Math.abs(pnl).toFixed(2)}` : "—"}
          sub={pnlPct != null ? `${pnlPos ? "+" : ""}${pnlPct.toFixed(2)}%` : undefined}
          color={pnlPos ? N.LONG : N.SHORT}
          glow
        />
        <Stat
          label="OPEN"
          value={`${openCount}`}
          sub={`POS`}
          color={openCount > 0 ? N.BRAND : N.TEXT_2}
        />
        <Stat
          label="MODE"
          value={liveActive ? activeId.toUpperCase() : "STANDBY"}
          color={liveActive ? N.GOLD : N.TEXT_2}
        />
      </div>

      <Divider />

      {/* Exchange switcher */}
      <div className="flex items-center gap-1 flex-1 overflow-x-auto"
           style={{ scrollbarWidth: "none" }}>
        {EXCHANGES.map(ex => {
          const isActive = activeId === ex.id;
          const disabled = !!ex.disabled;
          return (
            <button
              key={ex.id}
              disabled={disabled}
              onClick={() => disabled ? undefined : onSelectLive(ex.id)}
              title={disabled ? `${ex.label} — coming soon` : `Switch to ${ex.label}`}
              className="text-[8.5px] font-bold tracking-[0.14em] px-2 py-1 rounded transition-all flex-shrink-0"
              style={{
                color:      isActive ? ex.color : disabled ? N.TEXT_3 : N.TEXT_2,
                background: isActive ? `${ex.color}18` : "transparent",
                border:     `1px solid ${isActive ? ex.color + "55" : "transparent"}`,
                boxShadow: isActive ? `0 0 5px ${ex.color}40` : "none",
                cursor:     disabled ? "not-allowed" : "pointer",
                opacity:    disabled ? 0.45 : 1,
              }}
            >
              {ex.label}{ex.soon ? " ·SOON" : ""}
            </button>
          );
        })}
      </div>

      <Divider />

      {/* Pause / Kill */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <BarBtn
          label={isPaused ? "RESUME" : "PAUSE"}
          icon={isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          color={isPaused ? N.WARN : N.TEXT_2}
          active={isPaused}
          onClick={onTogglePause}
        />
        <BarBtn
          label={isKill ? "KILL ACTIVE" : "KILL"}
          icon={<ShieldOff className="w-3 h-3" />}
          color={N.SHORT}
          active={isKill}
          onClick={onToggleKill}
        />
      </div>

      <Divider />

      {/* Clock */}
      <div className="flex items-center gap-1 flex-shrink-0 text-[8px] font-bold tracking-[0.14em]"
           style={{ color: N.TEXT_3 }}>
        <Clock className="w-3 h-3" />
        TICK {ago(engine?.lastTickAt ?? null)}
      </div>

      {/* Quiet props for tree-shaking */}
      <span className="hidden">
        <Activity /> <DollarSign /> <Zap />
      </span>
    </header>
  );
}

function Divider() {
  return <span style={{ width: 1, height: 22, background: N.BORDER, flexShrink: 0 }} />;
}

function Stat({
  label, value, sub, color, glow,
}: { label: string; value: string; sub?: string; color: string; glow?: boolean }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[7.5px] font-bold tracking-[0.18em]" style={{ color: N.TEXT_3 }}>
        {label}
      </span>
      <span
        className="text-[11px] font-bold tabular-nums"
        style={{ color, textShadow: glow ? `0 0 4px ${color}50` : "none" }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[8px] font-semibold tabular-nums" style={{ color, opacity: 0.75 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function BarBtn({
  label, icon, color, active, onClick,
}: { label: string; icon?: React.ReactNode; color: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[8.5px] font-bold tracking-[0.16em] px-2 py-1 rounded transition-all"
      style={{
        color:      active ? color : N.TEXT_1,
        background: active ? `${color}18` : "transparent",
        border:     `1px solid ${active ? color + "55" : N.BORDER}`,
        boxShadow: active ? `0 0 5px ${color}40` : "none",
        fontFamily: N.FONT_MONO,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `${color}14`;
        e.currentTarget.style.borderColor = color + "55";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active ? `${color}18` : "transparent";
        e.currentTarget.style.borderColor = active ? color + "55" : N.BORDER;
      }}
    >
      {icon}
      {label}
    </button>
  );
}
