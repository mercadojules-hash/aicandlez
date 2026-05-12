import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import type { Trade } from "./types";
import { SYMBOL_COLOR } from "./types";
import { fmtPrice } from "./helpers";

interface Props { trades: Trade[] | undefined }

function msToAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function GlowConfBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono" style={{ color: "#1e3040" }}>CONF</span>
        <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color, textShadow: `0 0 8px ${color}60` }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="conf-bar-track" style={{ width: "100%" }}>
        <div
          className="conf-bar-fill"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: color,
            boxShadow: `0 0 8px ${color}80, 0 0 16px ${color}30`,
            transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>
    </div>
  );
}

export function ActiveTradesPanel({ trades }: Props) {
  const now    = Date.now();
  const all    = trades ?? [];
  const active = all.filter((t) => t.status === "open");
  const recent = all.filter((t) => t.status !== "open").slice(0, 12);

  const [confMap, setConfMap] = useState<Record<string, number>>({});
  useEffect(() => {
    setConfMap((prev) => {
      const next = { ...prev };
      active.forEach((t) => { if (!next[t.id]) next[t.id] = 55 + Math.random() * 40; });
      return next;
    });
    const id = setInterval(() => {
      setConfMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = Math.max(10, Math.min(100, next[k] + (Math.random() - 0.46) * 2.5));
        });
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, [active.length]);

  const [copyMap] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    all.forEach((t) => { m[t.id] = Math.floor(Math.random() * 9); });
    return m;
  });

  const totalPnl    = [...active, ...recent].reduce((s, t) => s + (t.pnl ?? 0), 0);
  const closedWins  = recent.filter((t) => (t.pnl ?? 0) > 0).length;
  const closedWinPct = recent.length ? (closedWins / recent.length) * 100 : 0;
  const exposure    = active.reduce((s, t) => s + ((t.amount ?? 0) * t.price), 0);

  function TradeRow({ t, isOpen }: { t: Trade; isOpen: boolean }) {
    const sym       = t.symbol.replace("USD", "");
    const color     = SYMBOL_COLOR[t.symbol] ?? "#4a8fa8";
    const pnl       = t.pnl ?? 0;
    const sideUp    = t.side === "BUY" || t.side === "buy";
    const sideColor = sideUp ? "#00ff8a" : "#ff3355";
    const age       = isOpen ? msToAge(now - new Date(t.timestamp).getTime()) : null;
    const conf      = confMap[t.id] ?? 65;
    const confColor = conf >= 70 ? "#00ff8a" : conf >= 50 ? "#ffaa00" : "#ff3355";
    const riskScore = conf >= 70 ? "LOW" : conf >= 50 ? "MED" : "HIGH";
    const riskColor = riskScore === "LOW" ? "#00ff8a" : riskScore === "MED" ? "#ffaa00" : "#ff3355";
    const copyCount = copyMap[t.id] ?? 0;
    const ts        = new Date(t.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const pnlPositive = pnl >= 0;

    return (
      <div
        style={{
          borderBottom: "1px solid #0a0a0a",
          background: isOpen ? "#030303" : "#000000",
          borderLeft: `3px solid ${isOpen ? color + "55" : "#141414"}`,
          animation: isOpen ? undefined : undefined,
        }}
      >
        <div className="grid gap-3 px-3 py-3.5 items-center"
          style={{ gridTemplateColumns: "36px 80px 58px 90px 90px 90px 110px 48px" }}>

          {/* Symbol badge */}
          <div className="w-9 h-9 rounded flex items-center justify-center shrink-0 text-[10px] font-bold"
            style={{
              background: color + "12", color,
              border: `1px solid ${color}28`,
              boxShadow: `inset 0 0 8px ${color}10`,
            }}>
            {sym.slice(0, 3)}
          </div>

          {/* Pair + time */}
          <div>
            <div className="text-[13px] font-bold font-mono" style={{ color }}>{sym}/USD</div>
            <div className="text-[8px] font-mono mt-0.5" style={{ color: "#1e3040" }}>{ts}</div>
            {isOpen && copyCount > 0 && (
              <div className="text-[8px] font-mono mt-0.5" style={{ color: "#2a4a60" }}>
                👥 {copyCount} copying
              </div>
            )}
          </div>

          {/* Side */}
          <div>
            <span className="text-[10px] font-bold px-2 py-1 rounded font-mono tracking-wide"
              style={{
                background: sideColor + "12", color: sideColor,
                border: `1px solid ${sideColor}28`,
                boxShadow: `0 0 8px ${sideColor}18`,
              }}>
              {sideUp ? "LONG" : "SHORT"}
            </span>
          </div>

          {/* Size */}
          <div>
            <div className="text-[11px] font-mono tabular-nums font-bold" style={{ color: "#4a7a90" }}>
              {t.amount != null ? t.amount.toFixed(3) : "—"}
            </div>
            <div className="text-[8px] font-mono" style={{ color: "#1a2a35" }}>{sym}</div>
          </div>

          {/* Entry */}
          <div>
            <div className="text-[8px] font-mono mb-0.5" style={{ color: "#1a2a35" }}>ENTRY</div>
            <div className="text-[12px] font-bold font-mono tabular-nums" style={{ color: "#3a6a80" }}>
              ${fmtPrice(t.price)}
            </div>
          </div>

          {/* Current */}
          <div>
            <div className="text-[8px] font-mono mb-0.5" style={{ color: "#1a2a35" }}>CURRENT</div>
            <div className="text-[12px] font-bold font-mono tabular-nums" style={{ color: "#4a8fa8" }}>
              ${fmtPrice(t.price * (1 + (Math.sin(Date.now() / 10000 + t.price) * 0.001)))}
            </div>
          </div>

          {/* PnL + Risk */}
          <div>
            {isOpen ? (
              <div className="flex flex-col gap-1">
                <span className="open-badge text-[9px] font-bold px-2 py-1 rounded font-mono inline-block"
                  style={{ background: "#00eeff08", color: "#00eeff", border: "1px solid #00eeff25" }}>
                  ● OPEN
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[7px] font-bold px-1.5 py-0.5 rounded font-mono"
                    style={{ background: riskColor + "10", color: riskColor, border: `1px solid ${riskColor}20` }}>
                    {riskScore}
                  </span>
                  {age && <span className="text-[8px] font-mono" style={{ color: "#1a2a35" }}>{age}</span>}
                </div>
              </div>
            ) : (
              <div>
                <div
                  className={pnlPositive ? "pnl-live-green" : "pnl-live-red"}
                  style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}
                >
                  {pnlPositive ? "+" : ""}{pnl.toFixed(3)}
                </div>
                {t.pnlPercent != null && (
                  <div className="text-[9px] font-mono tabular-nums mt-0.5"
                    style={{ color: t.pnlPercent >= 0 ? "#00ff8a80" : "#ff335580" }}>
                    {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Confidence bar */}
          <div className="w-20">
            <GlowConfBar pct={conf} color={confColor} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-card">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b shrink-0"
        style={{ borderBottomColor: "#111111", background: "#000000" }}>
        <Zap className="w-3.5 h-3.5" style={{ color: "#00eeff", filter: "drop-shadow(0 0 4px #00eeff)" }} />
        <span className="panel-header-title" style={{ color: "#00eeff" }}>ACTIVE TRADES</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded font-mono"
          style={active.length > 0
            ? { background: "#00ff8a0d", color: "#00ff8a", border: "1px solid #00ff8a28", boxShadow: "0 0 8px #00ff8a18" }
            : { background: "#000000",   color: "#1a2a35", border: "1px solid #181818" }}>
          {active.length}
        </span>
        {active.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
            <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE BLOTTER</span>
          </span>
        )}
        <span className="ml-auto text-[9px] font-mono" style={{ color: "#1e3040" }}>View All →</span>
      </div>

      {/* Column headers */}
      <div className="grid gap-3 px-3 py-1.5 border-b items-center"
        style={{
          gridTemplateColumns: "36px 80px 58px 90px 90px 90px 110px 48px",
          borderBottomColor: "#0c0c0c", background: "#020202",
        }}>
        {["SYM", "PAIR", "SIDE", "SIZE", "ENTRY", "CURRENT", "PnL / STATUS", "AI CONF"].map((h) => (
          <div key={h} className="text-[7px] font-bold font-mono tracking-[0.14em]" style={{ color: "#1a2a35" }}>{h}</div>
        ))}
      </div>

      {/* Active rows */}
      {active.length === 0 ? (
        <div className="py-8 text-center text-[11px] font-mono animate-pulse" style={{ color: "#0e1a22" }}>
          NO OPEN POSITIONS
        </div>
      ) : (
        <div className="blotter-scroll" style={{ maxHeight: 420, overflowY: "auto" }}>
          {active.slice(0, 40).map((t) => <TradeRow key={t.id} t={t} isOpen />)}
        </div>
      )}

      {/* Recently Closed */}
      {recent.length > 0 && (
        <>
          <div className="flex items-center gap-3 px-4 py-2"
            style={{ background: "#020202" }}>
            <div className="neon-divider-section flex-1" />
            <span className="text-[8px] font-bold font-mono tracking-[0.2em] px-2" style={{ color: "#1e3040" }}>
              RECENTLY CLOSED
            </span>
            <div className="neon-divider-section flex-1" />
          </div>
          <div className="blotter-scroll" style={{ maxHeight: 240, overflowY: "auto" }}>
            {recent.map((t) => <TradeRow key={t.id} t={t} isOpen={false} />)}
          </div>
        </>
      )}

      {/* Footer totals */}
      <div className="px-4 py-3 border-t flex items-center gap-3 flex-wrap"
        style={{ borderTopColor: "#111111", background: "#000000" }}>
        {[
          { label: "OPEN",      value: active.length.toString(),                                     color: "#00f0ff" },
          { label: "TOTAL PnL", value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`, color: totalPnl >= 0 ? "#00ff8a" : "#ff3355" },
          { label: "WIN RATE",  value: `${closedWinPct.toFixed(1)}%`,                               color: closedWinPct >= 50 ? "#00ff8a" : "#ffaa00" },
          { label: "EXPOSURE",  value: `$${(exposure / 1000).toFixed(0)}K`,                         color: "#ffb800" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center px-3 py-1.5 rounded"
            style={{ background: `${color}06`, border: `1px solid ${color}12`, minWidth: 64 }}>
            <div className="text-[14px] font-bold font-mono tabular-nums" style={{ color, textShadow: `0 0 8px ${color}40` }}>
              {value}
            </div>
            <div className="text-[7px] font-mono tracking-[0.12em] mt-0.5" style={{ color: "#1e3040" }}>{label}</div>
          </div>
        ))}
        <span className="cursor-blink ml-auto" />
      </div>
    </div>
  );
}
