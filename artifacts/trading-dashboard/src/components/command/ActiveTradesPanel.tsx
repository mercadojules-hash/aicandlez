import { useEffect, useState } from "react";
import { Zap, Clock } from "lucide-react";
import type { Trade } from "./types";
import { SYMBOL_COLOR } from "./types";
import { fmtPrice } from "./helpers";

interface Props { trades: Trade[] | undefined }

function msToAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function ConfBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[8px] font-mono font-medium" style={{ color: "#9FB3C8" }}>CONF</span>
        <span className="text-[10px] font-bold font-mono tabular-nums" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div style={{ height: 4, background: "#0d0d0d", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, pct)}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

const COL_OPEN   = "36px 70px 52px 80px 80px 80px 90px 52px";
const COL_CLOSED = "36px 70px 52px 80px 80px 80px 90px 52px";

function TradeRow({ t, now, conf, isOpen }: {
  t: Trade; now: number; conf: number; isOpen: boolean;
}) {
  const sym       = t.symbol.replace("USD", "");
  const color     = SYMBOL_COLOR[t.symbol] ?? "#4a8fa8";
  const pnl       = t.pnl ?? 0;
  const sideUp    = t.side === "BUY" || t.side === "buy";
  const sideColor = sideUp ? "#00ff8a" : "#ff3355";
  const confColor = conf >= 70 ? "#00ff8a" : conf >= 50 ? "#ffaa00" : "#ff3355";
  const riskColor = conf >= 70 ? "#00ff8a" : conf >= 50 ? "#ffaa00" : "#ff3355";
  const age       = isOpen ? msToAge(now - new Date(t.timestamp).getTime()) : null;
  const ts        = new Date(t.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const pnlPos = pnl >= 0;

  return (
    <div style={{
      borderBottom: "1px solid #0a0a0a",
      background: isOpen ? "#020202" : "#000000",
      borderLeft: `2px solid ${color}${isOpen ? "55" : "18"}`,
    }}>
      <div className="grid gap-2 px-2.5 py-2.5 items-center"
        style={{ gridTemplateColumns: isOpen ? COL_OPEN : COL_CLOSED }}>

        {/* Symbol badge */}
        <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
          style={{ background: `${color}12`, color, border: `1px solid ${color}20` }}>
          {sym.slice(0, 3)}
        </div>

        {/* Pair + time */}
        <div>
          <div className="text-[11px] font-bold font-mono" style={{ color }}>{sym}/USD</div>
          <div className="text-[8px] font-mono font-medium mt-0.5" style={{ color: "#9FB3C8" }}>{ts}</div>
        </div>

        {/* Side */}
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide"
          style={{ background: `${sideColor}12`, color: sideColor, border: `1px solid ${sideColor}22` }}>
          {sideUp ? "LONG" : "SHORT"}
        </span>

        {/* Size */}
        <div>
          <div className="text-[10px] font-mono tabular-nums font-bold" style={{ color: "#EAF2FF" }}>
            {t.amount != null ? t.amount.toFixed(3) : "—"}
          </div>
          <div className="text-[8px] font-mono font-medium" style={{ color: "#9FB3C8" }}>{sym}</div>
        </div>

        {/* Entry */}
        <div>
          <div className="text-[8px] font-mono font-medium mb-0.5" style={{ color: "#9FB3C8" }}>ENTRY</div>
          <div className="text-[10px] font-bold font-mono tabular-nums" style={{ color: "#C7D4E2" }}>
            ${fmtPrice(t.price)}
          </div>
        </div>

        {/* Current */}
        <div>
          <div className="text-[8px] font-mono font-medium mb-0.5" style={{ color: "#9FB3C8" }}>NOW</div>
          <div className="text-[10px] font-bold font-mono tabular-nums" style={{ color: "#EAF2FF" }}>
            ${fmtPrice(t.price * (1 + Math.sin(Date.now() / 10000 + t.price) * 0.001))}
          </div>
        </div>

        {/* PnL or Status */}
        {isOpen ? (
          <div className="flex flex-col gap-1">
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono inline-block"
              style={{ background: "#00eeff08", color: "#00eeff", border: "1px solid #00eeff20" }}>
              ● OPEN
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[7px] font-bold px-1 py-0.5 rounded font-mono"
                style={{ background: `${riskColor}10`, color: riskColor, border: `1px solid ${riskColor}18` }}>
                {conf >= 70 ? "LOW" : conf >= 50 ? "MED" : "HIGH"}
              </span>
              {age && (
                <span className="flex items-center gap-0.5 text-[8px] font-mono font-medium"
                  style={{ color: "#9FB3C8" }}>
                  <Clock className="w-2.5 h-2.5" />{age}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className={pnlPos ? "pnl-live-green" : "pnl-live-red"}
              style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
              {pnlPos ? "+" : ""}{pnl.toFixed(3)}
            </div>
            {t.pnlPercent != null && (
              <div className="text-[8px] font-mono tabular-nums font-medium mt-0.5"
                style={{ color: t.pnlPercent >= 0 ? "#00ff8a80" : "#ff335570" }}>
                {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
              </div>
            )}
          </div>
        )}

        {/* AI Conf */}
        <div style={{ width: 52 }}>
          <ConfBar pct={conf} color={confColor} />
        </div>
      </div>
    </div>
  );
}

function BlotterHeader({ cols }: { cols: string }) {
  return (
    <div className="grid gap-2 px-2.5 py-1 border-b items-center"
      style={{ gridTemplateColumns: cols, borderBottomColor: "#0d0d0d", background: "#020202" }}>
      {["SYM", "PAIR", "SIDE", "SIZE", "ENTRY", "CURRENT", "PnL / STATUS", "CONF"].map(h => (
        <div key={h} className="text-[7px] font-bold font-mono tracking-[0.12em] font-semibold"
          style={{ color: "#9FB3C8" }}>{h}</div>
      ))}
    </div>
  );
}

export function ActiveTradesPanel({ trades }: Props) {
  const now    = Date.now();
  const all    = trades ?? [];
  const active = all.filter(t => t.status === "open");
  const recent = all.filter(t => t.status !== "open").slice(0, 30);

  const [confMap, setConfMap] = useState<Record<string, number>>({});
  useEffect(() => {
    setConfMap(prev => {
      const next = { ...prev };
      all.forEach(t => { if (!next[t.id]) next[t.id] = 55 + Math.random() * 40; });
      return next;
    });
    const id = setInterval(() => {
      setConfMap(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          next[k] = Math.max(10, Math.min(100, next[k] + (Math.random() - 0.46) * 2));
        });
        return next;
      });
    }, 2500);
    return () => clearInterval(id);
  }, [all.length]);

  const totalPnl    = all.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const closedWins  = recent.filter(t => (t.pnl ?? 0) > 0).length;
  const winPct      = recent.length ? (closedWins / recent.length) * 100 : 0;
  const exposure    = active.reduce((s, t) => s + (t.amount ?? 0) * t.price, 0);

  const FooterStat = ({ label, value, color }: { label: string; value: string; color: string }) => (
    <div className="flex flex-col items-center px-3 py-1.5 rounded"
      style={{ background: `${color}06`, border: `1px solid ${color}10`, minWidth: 64 }}>
      <div className="text-[13px] font-bold font-mono tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[7px] font-mono tracking-[0.1em] mt-0.5 font-semibold" style={{ color: "#9FB3C8" }}>
        {label}
      </div>
    </div>
  );

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {/* ── LEFT: Active Trades ─────────────────────────────────────────── */}
      <div className="terminal-card flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
          style={{ borderBottomColor: "#111111" }}>
          <Zap className="w-3 h-3 flex-shrink-0" style={{ color: "#00eeff" }} />
          <span className="panel-header-title" style={{ color: "#00eeff" }}>ACTIVE TRADES</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ml-1"
            style={active.length > 0
              ? { background: "#00ff8a0a", color: "#00ff8a", border: "1px solid #00ff8a20" }
              : { background: "#0d0d0d",   color: "#9FB3C8", border: "1px solid #181818"  }}>
            {active.length}
          </span>
          {active.length > 0 && (
            <span className="flex items-center gap-1 ml-1">
              <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
              <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE BLOTTER</span>
            </span>
          )}
        </div>

        <BlotterHeader cols={COL_OPEN} />

        {active.length === 0 ? (
          <div className="py-6 text-center text-[10px] font-mono font-medium" style={{ color: "#9FB3C8" }}>
            NO OPEN POSITIONS
          </div>
        ) : (
          <div className="blotter-scroll" style={{ maxHeight: 380, overflowY: "auto" }}>
            {active.slice(0, 30).map(t => (
              <TradeRow key={t.id} t={t} now={now} conf={confMap[t.id] ?? 65} isOpen />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-3 py-2 border-t flex items-center gap-2 flex-wrap"
          style={{ borderTopColor: "#111111", marginTop: "auto" }}>
          <FooterStat label="OPEN"     value={active.length.toString()}                             color="#00f0ff" />
          <FooterStat label="EXPOSURE" value={`$${(exposure / 1000).toFixed(0)}K`}                color="#ffb800" />
          <FooterStat label="TOTAL PnL" value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`}
            color={totalPnl >= 0 ? "#00ff8a" : "#ff3355"} />
          <span className="cursor-blink ml-auto" />
        </div>
      </div>

      {/* ── RIGHT: Recently Closed ──────────────────────────────────────── */}
      <div className="terminal-card flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
          style={{ borderBottomColor: "#111111" }}>
          <span className="panel-header-title" style={{ color: "#9FB3C8" }}>RECENTLY CLOSED</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ml-1"
            style={{ background: "#0d0d0d", color: "#C7D4E2", border: "1px solid #1a1a1a" }}>
            {recent.length}
          </span>
        </div>

        <BlotterHeader cols={COL_CLOSED} />

        {recent.length === 0 ? (
          <div className="py-6 text-center text-[10px] font-mono font-medium" style={{ color: "#9FB3C8" }}>
            NO CLOSED TRADES
          </div>
        ) : (
          <div className="blotter-scroll" style={{ maxHeight: 380, overflowY: "auto" }}>
            {recent.map(t => (
              <TradeRow key={t.id} t={t} now={now} conf={confMap[t.id] ?? 65} isOpen={false} />
            ))}
          </div>
        )}

        <div className="px-3 py-2 border-t flex items-center gap-2 flex-wrap"
          style={{ borderTopColor: "#111111", marginTop: "auto" }}>
          <FooterStat label="CLOSED"   value={recent.length.toString()}   color="#C7D4E2" />
          <FooterStat label="WIN RATE" value={`${winPct.toFixed(1)}%`}    color={winPct >= 50 ? "#00ff8a" : "#ffaa00"} />
          <FooterStat label="NET PnL"  value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`}
            color={totalPnl >= 0 ? "#00ff8a" : "#ff3355"} />
        </div>
      </div>
    </div>
  );
}
