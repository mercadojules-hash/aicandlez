import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import type { Trade } from "./types";
import { SYMBOL_COLOR } from "./types";
import { fmtPrice } from "./helpers";

interface Props { trades: Trade[] | undefined }

function msToAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function ConfBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="rounded-sm overflow-hidden" style={{ width: 48, height: 3, background: "#0a0a0a" }}>
        <div className="h-full rounded-sm" style={{ width: `${Math.min(100, pct)}%`, background: color, opacity: 0.8, transition: "width 0.4s" }} />
      </div>
      <span className="text-[9px] font-mono tabular-nums" style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

export function ActiveTradesPanel({ trades }: Props) {
  const now   = Date.now();
  const all   = trades ?? [];
  const active = all.filter((t) => t.status === "open");
  const recent = all.filter((t) => t.status !== "open").slice(0, 10);

  // Simulated copy-trader counts per trade
  const [copyMap, setCopyMap] = useState<Record<string, number>>({});
  useEffect(() => {
    const map: Record<string, number> = {};
    active.forEach((t) => { map[t.id] = Math.floor(Math.random() * 8) + 1; });
    setCopyMap(map);
  }, [active.length]);

  // Simulated AI confidence per trade
  const [confMap, setConfMap] = useState<Record<string, number>>({});
  useEffect(() => {
    setConfMap((prev) => {
      const next = { ...prev };
      active.forEach((t) => {
        if (!next[t.id]) next[t.id] = 55 + Math.random() * 40;
        else next[t.id] = Math.max(10, Math.min(100, next[t.id] + (Math.random() - 0.46) * 3));
      });
      return next;
    });
    const id = setInterval(() => {
      setConfMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = Math.max(10, Math.min(100, next[k] + (Math.random() - 0.46) * 2));
        });
        return next;
      });
    }, 2500);
    return () => clearInterval(id);
  }, [active.length]);

  // Footer totals
  const totalPnl = [...active, ...recent].reduce((s, t) => s + (t.pnl ?? 0), 0);
  const closedWins = recent.filter((t) => (t.pnl ?? 0) > 0).length;
  const closedWinRate = recent.length ? (closedWins / recent.length) * 100 : 0;
  const exposure = active.reduce((s, t) => s + ((t.amount ?? 0) * t.price), 0);

  const colStyle: React.CSSProperties = {
    background: "#000000", border: "1px solid #1c1c1c", borderRadius: 6, padding: "4px 10px", textAlign: "center",
  };

  function TradeRow({ t, isOpen }: { t: Trade; isOpen: boolean }) {
    const sym      = t.symbol.replace("USD", "");
    const color    = SYMBOL_COLOR[t.symbol] ?? "#4a8fa8";
    const pnl      = t.pnl ?? 0;
    const sideUp   = t.side === "BUY" || t.side === "buy";
    const sideColor = sideUp ? "#00ff8a" : "#ff3355";
    const age      = isOpen ? msToAge(now - new Date(t.timestamp).getTime()) : null;
    const conf     = confMap[t.id] ?? 65;
    const confColor = conf >= 70 ? "#00ff8a" : conf >= 50 ? "#ffaa00" : "#ff3355";
    const copyCount = copyMap[t.id] ?? 0;
    const riskScore = conf >= 70 ? "LOW" : conf >= 50 ? "MED" : "HIGH";
    const riskColor = riskScore === "LOW" ? "#00ff8a" : riskScore === "MED" ? "#ffaa00" : "#ff3355";
    const ts = new Date(t.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

    return (
      <div
        className="grid gap-3 px-4 py-2.5 border-b items-center"
        style={{
          gridTemplateColumns: "28px 72px 52px 70px 72px 72px 70px 80px 48px 52px",
          borderBottomColor: "#080808",
          background: isOpen ? "#020202" : "#000000",
          borderLeft: `2.5px solid ${isOpen ? color + "50" : "#141414"}`,
        }}
      >
        {/* PAIR */}
        <div className="w-7 h-7 rounded text-[8px] font-bold flex items-center justify-center shrink-0"
          style={{ background: color + "10", color, border: `1px solid ${color}1e` }}>
          {sym.slice(0, 3)}
        </div>

        {/* PAIR + timestamp */}
        <div className="min-w-0">
          <div className="text-[10px] font-bold font-mono" style={{ color }}>{sym}/USD</div>
          <div className="text-[8px] font-mono" style={{ color: "#1e3040" }}>{ts}</div>
        </div>

        {/* SIDE */}
        <div>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide"
            style={{ background: sideColor + "14", color: sideColor, border: `1px solid ${sideColor}28` }}
          >
            {sideUp ? "LONG" : "SHORT"}
          </span>
        </div>

        {/* SIZE */}
        <div>
          <div className="text-[10px] font-mono tabular-nums" style={{ color: "#4a7a90" }}>
            {t.amount != null ? t.amount.toFixed(3) : "—"} {sym}
          </div>
        </div>

        {/* ENTRY */}
        <div>
          <div className="text-[10px] font-mono tabular-nums font-bold" style={{ color: "#3a6a80" }}>
            ${fmtPrice(t.price)}
          </div>
        </div>

        {/* CURRENT (simulated drift) */}
        <div>
          <div className="text-[10px] font-mono tabular-nums font-bold" style={{ color: "#4a8fa8" }}>
            ${fmtPrice(t.price * (1 + (Math.random() - 0.5) * 0.002))}
          </div>
        </div>

        {/* PnL */}
        <div>
          {isOpen ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono"
              style={{ background: "#00eeff08", color: "#00eeff", border: "1px solid #00eeff1a" }}>
              OPEN
            </span>
          ) : (
            <div>
              <div className="text-[11px] font-bold font-mono tabular-nums"
                style={{ color: pnl >= 0 ? "#00ff8a" : "#ff3355" }}>
                {pnl >= 0 ? "+" : ""}{pnl.toFixed(3)}
              </div>
              {t.pnlPercent != null && (
                <div className="text-[8px] font-mono tabular-nums"
                  style={{ color: t.pnlPercent >= 0 ? "#00ff8a70" : "#ff335570" }}>
                  {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI CONF bar */}
        <div>
          <ConfBar pct={conf} color={confColor} />
        </div>

        {/* AGE */}
        <div>
          <div className="text-[9px] font-mono tabular-nums" style={{ color: "#2a4a60" }}>
            {age ?? "—"}
          </div>
        </div>

        {/* RISK + copy */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[7px] font-bold font-mono px-1 py-0.5 rounded text-center"
            style={{ background: riskColor + "10", color: riskColor, border: `1px solid ${riskColor}20` }}>
            {riskScore}
          </span>
          {isOpen && copyCount > 0 && (
            <span className="text-[7px] font-mono text-center" style={{ color: "#1e3040" }}>
              👥{copyCount}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#000000", border: "1px solid #1c1c1c" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0"
        style={{ borderBottomColor: "#141414", background: "#000000" }}>
        <Zap className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00eeff" }}>
          ACTIVE TRADES
        </span>
        <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded font-mono"
          style={active.length > 0
            ? { background: "#00ff8a0d", color: "#00ff8a", border: "1px solid #00ff8a28" }
            : { background: "#000000",   color: "#1a2a35", border: "1px solid #181818"  }}>
          {active.length}
        </span>
        {active.length > 0 && (
          <span className="flex items-center gap-1.5 ml-1">
            <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
            <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE BLOTTER</span>
          </span>
        )}
        <span className="ml-auto text-[9px] font-mono" style={{ color: "#1e3040" }}>View All →</span>
      </div>

      {/* Column headers */}
      <div className="grid gap-3 px-4 py-1.5 border-b"
        style={{
          gridTemplateColumns: "28px 72px 52px 70px 72px 72px 70px 80px 48px 52px",
          borderBottomColor: "#141414", background: "#030303",
        }}>
        {["", "PAIR", "SIDE", "SIZE", "ENTRY", "CURRENT", "PnL", "AI CONF", "AGE", "RISK"].map((h) => (
          <div key={h} className="text-[8px] font-bold font-mono tracking-[0.12em]" style={{ color: "#1e3040" }}>{h}</div>
        ))}
      </div>

      {/* Active rows */}
      {active.length === 0 ? (
        <div className="py-8 text-center text-[11px] font-mono" style={{ color: "#0e1a22" }}>
          NO OPEN POSITIONS
        </div>
      ) : (
        <div className="blotter-scroll" style={{ maxHeight: 380, overflowY: "auto" }}>
          {active.slice(0, 40).map((t) => <TradeRow key={t.id} t={t} isOpen />)}
        </div>
      )}

      {/* Recently Closed section */}
      {recent.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-4 py-2 border-t border-b"
            style={{ borderColor: "#141414", background: "#030303" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#1e3040" }} />
            <span className="text-[9px] font-bold font-mono tracking-[0.18em]" style={{ color: "#1e3040" }}>
              RECENTLY CLOSED
            </span>
            <span className="text-[8px] font-mono ml-auto" style={{ color: "#1e3040" }}>
              {recent.length} trades
            </span>
          </div>
          <div className="blotter-scroll" style={{ maxHeight: 200, overflowY: "auto" }}>
            {recent.map((t) => <TradeRow key={t.id} t={t} isOpen={false} />)}
          </div>
        </>
      )}

      {/* Footer totals */}
      <div className="px-4 py-2.5 border-t flex items-center gap-4 flex-wrap"
        style={{ borderTopColor: "#141414", background: "#000000" }}>
        {[
          { label: "OPEN POSITIONS", value: active.length.toString(),                                    color: "#00f0ff" },
          { label: "TOTAL PnL",      value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`, color: totalPnl >= 0 ? "#00ff8a" : "#ff3355" },
          { label: "WIN RATE",       value: `${closedWinRate.toFixed(1)}%`,                             color: closedWinRate >= 50 ? "#00ff8a" : "#ffaa00" },
          { label: "EXPOSURE",       value: `$${exposure.toFixed(0)}`,                                  color: "#ffb800" },
        ].map(({ label, value, color }) => (
          <div key={label} style={colStyle}>
            <div className="text-[12px] font-bold font-mono tabular-nums" style={{ color }}>{value}</div>
            <div className="text-[7px] font-mono tracking-[0.12em]" style={{ color: "#1e3040" }}>{label}</div>
          </div>
        ))}
        <span className="cursor-blink ml-auto" />
      </div>
    </div>
  );
}
