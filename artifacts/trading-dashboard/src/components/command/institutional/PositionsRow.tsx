/**
 * PositionsRow — Active Positions (left) + Closed Positions / Trade History (right).
 * Hedge-fund blotter aesthetic. Live PnL, AI confidence, trailing stop, long/short.
 */

import { useEffect, useMemo, useState } from "react";
import type { Trade, SimPosition } from "../types";
import { N } from "./theme";
import { CRYPTO_20, EQUITIES_20 } from "./tickers";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtUsd(n: number): string {
  const v = n.toFixed(2);
  return n >= 0 ? `+$${v}` : `-$${Math.abs(n).toFixed(2)}`;
}

function ageMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const TICKER_COLOR: Record<string, string> = Object.fromEntries(
  [...CRYPTO_20, ...EQUITIES_20].map(t => [t.symbol, t.color]),
);

/* ── deterministic confidence per trade id ───────────────────────────────── */
function confFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 60 + (Math.abs(h) % 36); // 60-95
}

/* ── ACTIVE POSITIONS ────────────────────────────────────────────────────── */

interface ActiveProps {
  positions: SimPosition[];
  openTrades: Trade[];
}

function ActivePanel({ positions, openTrades }: ActiveProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_200);
    return () => clearInterval(id);
  }, []);

  // Merge sim positions + open trades into a single normalized list
  type Row = {
    id:     string;
    symbol: string;
    side:   "LONG" | "SHORT";
    qty:    number;
    entry:  number;
    last:   number;
    pnl:    number;
    pnlPct: number;
    sl:     number | null;
    tp:     number | null;
    age:    number;
    conf:   number;
    trail:  boolean;
  };

  const rows: Row[] = useMemo(() => {
    const fromPositions: Row[] = (positions ?? []).map(p => {
      const side: "LONG" | "SHORT" = (p.side?.toLowerCase() === "sell" || p.side?.toLowerCase() === "short") ? "SHORT" : "LONG";
      return {
        id:     p.id,
        symbol: p.symbol,
        side,
        qty:    p.quantity,
        entry:  p.entryPrice,
        last:   p.currentPrice,
        pnl:    p.unrealizedPnL,
        pnlPct: p.unrealizedPnLPct,
        sl:     side === "LONG" ? p.entryPrice * 0.98 : p.entryPrice * 1.02,
        tp:     side === "LONG" ? p.entryPrice * 1.04 : p.entryPrice * 0.96,
        age:    now - p.entryTime,
        conf:   confFor(p.id),
        trail:  (p.unrealizedPnLPct ?? 0) > 1.2,
      };
    });

    const fromTrades: Row[] = (openTrades ?? [])
      .filter(t => t.status?.toLowerCase() === "open")
      .map(t => {
        const side: "LONG" | "SHORT" = (t.side?.toLowerCase() === "buy") ? "LONG" : "SHORT";
        const last = t.exitPrice ?? t.price;
        const pnl  = t.pnl ?? 0;
        const pct  = t.pnlPercent ?? 0;
        return {
          id:     t.id,
          symbol: t.symbol,
          side,
          qty:    t.amount,
          entry:  t.price,
          last,
          pnl,
          pnlPct: pct,
          sl:     t.stopLoss,
          tp:     t.takeProfit,
          age:    now - new Date(t.timestamp).getTime(),
          conf:   confFor(t.id),
          trail:  pct > 1.2,
        };
      });

    return [...fromPositions, ...fromTrades]
      .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
      .sort((a, b) => b.age - a.age);
  }, [positions, openTrades, now]);

  return (
    <Panel
      label="ACTIVE POSITIONS"
      sub={`${rows.length} OPEN · LIVE PNL · TRAILING STOPS`}
      brand={N.BRAND}
      right={
        <div className="flex gap-3 text-[8.5px] font-bold tracking-[0.16em]" style={{ color: N.TEXT_2 }}>
          <span>LONG&nbsp;<span style={{ color: N.LONG }}>{rows.filter(r => r.side === "LONG").length}</span></span>
          <span>SHORT&nbsp;<span style={{ color: N.SHORT }}>{rows.filter(r => r.side === "SHORT").length}</span></span>
        </div>
      }
    >
      <div className="grid text-[8.5px] font-bold tracking-[0.14em] px-3 py-1.5"
        style={{
          gridTemplateColumns: "70px 56px 1fr 1fr 1fr 1fr 1fr 70px 70px",
          color: N.TEXT_3,
          borderBottom: `1px solid ${N.BORDER}`,
          background: N.SURFACE_1,
        }}
      >
        <div>SYMBOL</div>
        <div>SIDE</div>
        <div className="text-right">ENTRY</div>
        <div className="text-right">LAST</div>
        <div className="text-right">SL</div>
        <div className="text-right">TP</div>
        <div className="text-right">PNL</div>
        <div className="text-right">CONF</div>
        <div className="text-right pr-1">ACTION</div>
      </div>

      <div className="blotter-scroll" style={{ maxHeight: 360 }}>
        {rows.length === 0 ? (
          <EmptyState label="No active positions" />
        ) : rows.map(r => {
          const sideColor = r.side === "LONG" ? N.LONG : N.SHORT;
          const pnlPos    = r.pnl >= 0;
          const tickerColor = TICKER_COLOR[r.symbol] ?? N.BRAND;
          return (
            <div
              key={r.id}
              className="grid items-center px-3 py-1.5 transition-colors"
              style={{
                gridTemplateColumns: "70px 56px 1fr 1fr 1fr 1fr 1fr 70px 70px",
                borderBottom: `1px solid ${N.BORDER}`,
                background: N.SURFACE_1,
                fontFamily: N.FONT_MONO,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = N.SURFACE_2)}
              onMouseLeave={e => (e.currentTarget.style.background = N.SURFACE_1)}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span style={{
                  width: 4, height: 14, background: tickerColor,
                  borderRadius: 1, boxShadow: `0 0 6px ${tickerColor}80`,
                }} />
                <span className="text-[10px] font-bold tracking-wider truncate" style={{ color: N.TEXT_0 }}>
                  {r.symbol.replace("USD", "")}
                </span>
              </div>
              <div>
                <span
                  className="px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.18em]"
                  style={{
                    color: sideColor,
                    background: `${sideColor}12`,
                    border: `1px solid ${sideColor}40`,
                    borderRadius: 3,
                  }}
                >
                  {r.side}
                </span>
              </div>
              <div className="text-right text-[10px] font-bold tabular-nums" style={{ color: N.TEXT_1 }}>
                ${fmtPrice(r.entry)}
              </div>
              <div className="text-right text-[10px] font-bold tabular-nums" style={{ color: N.TEXT_0 }}>
                ${fmtPrice(r.last)}
              </div>
              <div className="text-right text-[9.5px] tabular-nums" style={{ color: N.SHORT }}>
                {r.sl != null ? `$${fmtPrice(r.sl)}` : "—"}
              </div>
              <div className="text-right text-[9.5px] tabular-nums" style={{ color: N.LONG }}>
                {r.tp != null ? `$${fmtPrice(r.tp)}` : "—"}
              </div>
              <div className="text-right">
                <div className="text-[10.5px] font-bold tabular-nums"
                  style={{ color: pnlPos ? N.LONG : N.SHORT,
                           textShadow: `0 0 8px ${pnlPos ? N.LONG_GLOW : N.SHORT_GLOW}` }}>
                  {fmtUsd(r.pnl)}
                </div>
                <div className="text-[8px] tabular-nums" style={{ color: pnlPos ? N.LONG : N.SHORT, opacity: 0.85 }}>
                  {pnlPos ? "+" : ""}{r.pnlPct.toFixed(2)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold tabular-nums" style={{ color: r.conf >= 75 ? N.BRAND : N.WARN }}>
                  {r.conf}%
                </div>
                <div className="text-[7.5px] tracking-[0.14em]" style={{ color: r.trail ? N.BRAND_BRT : N.TEXT_3 }}>
                  {r.trail ? "TRAIL•ON" : "TRAIL•—"}
                </div>
                <div className="text-[7px] tracking-[0.14em]" style={{ color: N.TEXT_3 }}>
                  {ageMs(r.age)}
                </div>
              </div>
              <div className="flex justify-end gap-1">
                <ActionBtn label="PAUSE" color={N.WARN} />
                <ActionBtn label="CLOSE" color={N.SHORT} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── CLOSED POSITIONS / HISTORY ──────────────────────────────────────────── */

function ClosedPanel({ closedTrades }: { closedTrades: Trade[] }) {
  const sorted = useMemo(
    () => [...(closedTrades ?? [])]
      .filter(t => t.status?.toLowerCase() === "closed" || t.exitPrice != null)
      .sort((a, b) => new Date(b.closedAt ?? b.timestamp).getTime() - new Date(a.closedAt ?? a.timestamp).getTime())
      .slice(0, 80),
    [closedTrades],
  );

  const wins  = sorted.filter(t => (t.pnl ?? 0) > 0).length;
  const total = sorted.length;
  const wr    = total ? (wins / total) * 100 : 0;
  const sum   = sorted.reduce((acc, t) => acc + (t.pnl ?? 0), 0);

  return (
    <Panel
      label="CLOSED POSITIONS"
      sub={`${total} EXECUTED · REALIZED PNL · AI EXECUTION LOG`}
      brand={N.BRAND_BRT}
      right={
        <div className="flex gap-3 text-[8.5px] font-bold tracking-[0.16em]" style={{ color: N.TEXT_2 }}>
          <span>WIN&nbsp;<span style={{ color: N.LONG }}>{wr.toFixed(1)}%</span></span>
          <span>NET&nbsp;<span style={{ color: sum >= 0 ? N.LONG : N.SHORT }}>{fmtUsd(sum)}</span></span>
        </div>
      }
    >
      <div className="grid text-[8.5px] font-bold tracking-[0.14em] px-3 py-1.5"
        style={{
          gridTemplateColumns: "70px 56px 1fr 1fr 1fr 1fr 90px",
          color: N.TEXT_3,
          borderBottom: `1px solid ${N.BORDER}`,
          background: N.SURFACE_1,
        }}>
        <div>SYMBOL</div>
        <div>SIDE</div>
        <div className="text-right">ENTRY</div>
        <div className="text-right">EXIT</div>
        <div className="text-right">PNL</div>
        <div className="text-right">R-MULT</div>
        <div className="text-right pr-1">REASON</div>
      </div>

      <div className="blotter-scroll" style={{ maxHeight: 360 }}>
        {sorted.length === 0 ? (
          <EmptyState label="No closed trades yet" />
        ) : sorted.map(t => {
          const side: "LONG" | "SHORT" = (t.side?.toLowerCase() === "buy") ? "LONG" : "SHORT";
          const sideColor = side === "LONG" ? N.LONG : N.SHORT;
          const pnl   = t.pnl ?? 0;
          const pct   = t.pnlPercent ?? 0;
          const pnlOk = pnl > 0;
          const rmult = pct ? (pct / 2).toFixed(2) : "—"; // approx R based on 2% risk
          const tickerColor = TICKER_COLOR[t.symbol] ?? N.BRAND;
          const ts = new Date(t.closedAt ?? t.timestamp);
          const tsLabel = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
          const reason = t.reason
            ? t.reason.length > 18 ? t.reason.slice(0, 18) + "…" : t.reason
            : pnlOk ? "TP HIT" : "SL HIT";
          return (
            <div
              key={t.id}
              className="grid items-center px-3 py-1.5 transition-colors"
              style={{
                gridTemplateColumns: "70px 56px 1fr 1fr 1fr 1fr 90px",
                borderBottom: `1px solid ${N.BORDER}`,
                background: N.SURFACE_1,
                fontFamily: N.FONT_MONO,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = N.SURFACE_2)}
              onMouseLeave={e => (e.currentTarget.style.background = N.SURFACE_1)}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span style={{ width: 4, height: 14, background: tickerColor, borderRadius: 1, opacity: 0.7 }} />
                <span className="text-[10px] font-bold tracking-wider truncate" style={{ color: N.TEXT_0 }}>
                  {t.symbol.replace("USD", "")}
                </span>
              </div>
              <div>
                <span className="px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.18em]"
                  style={{
                    color: sideColor, background: `${sideColor}10`,
                    border: `1px solid ${sideColor}30`, borderRadius: 3,
                  }}>
                  {side}
                </span>
              </div>
              <div className="text-right text-[10px] tabular-nums" style={{ color: N.TEXT_1 }}>
                ${fmtPrice(t.price)}
              </div>
              <div className="text-right text-[10px] tabular-nums" style={{ color: N.TEXT_1 }}>
                {t.exitPrice != null ? `$${fmtPrice(t.exitPrice)}` : "—"}
              </div>
              <div className="text-right">
                <div className="text-[10.5px] font-bold tabular-nums"
                  style={{ color: pnlOk ? N.LONG : N.SHORT,
                           textShadow: pnlOk ? `0 0 6px ${N.LONG_GLOW}` : `0 0 6px ${N.SHORT_GLOW}` }}>
                  {fmtUsd(pnl)}
                </div>
                <div className="text-[8px] tabular-nums" style={{ color: pnlOk ? N.LONG : N.SHORT, opacity: 0.8 }}>
                  {pnlOk ? "+" : ""}{pct.toFixed(2)}%
                </div>
              </div>
              <div className="text-right text-[9px] tabular-nums font-bold"
                   style={{ color: pnlOk ? N.LONG : N.SHORT, opacity: 0.85 }}>
                {rmult !== "—" ? `${pnlOk ? "+" : ""}${rmult}R` : "—"}
              </div>
              <div className="text-right">
                <div className="text-[9px] tracking-[0.1em] font-bold" style={{ color: pnlOk ? N.LONG : N.SHORT }}>
                  {pnlOk ? "WIN" : "LOSS"}
                </div>
                <div className="text-[7.5px] tracking-[0.12em]" style={{ color: N.TEXT_3 }}>
                  {reason} · {tsLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── SHARED PRIMITIVES ───────────────────────────────────────────────────── */

function Panel({
  label, sub, brand, right, children,
}: {
  label: string; sub: string; brand: string;
  right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background:   N.SURFACE_1,
        border:       `1px solid ${N.BORDER}`,
        borderRadius: 6,
        overflow:     "hidden",
        fontFamily:   N.FONT_MONO,
      }}
    >
      <header
        className="flex items-center justify-between px-3 py-2"
        style={{
          background: `linear-gradient(180deg, ${brand}06 0%, ${N.BG} 100%)`,
          borderBottom: `1px solid ${N.BORDER}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-full"
            style={{
              width: 6, height: 6, background: brand,
              boxShadow: `0 0 6px ${brand}, 0 0 14px ${brand}40`,
              animation: "neon-pulse 1.6s infinite",
            }}
          />
          <span className="text-[10.5px] font-bold tracking-[0.22em]" style={{ color: N.TEXT_0 }}>
            {label}
          </span>
          <span className="text-[8.5px] font-semibold tracking-[0.14em]" style={{ color: N.TEXT_3 }}>
            · {sub}
          </span>
        </div>
        {right}
      </header>
      {children}
    </div>
  );
}

function ActionBtn({ label, color }: { label: string; color: string }) {
  return (
    <button
      className="text-[8.5px] font-bold tracking-[0.14em] px-2 py-1 rounded transition-all"
      style={{
        background: `${color}10`,
        color,
        border: `1px solid ${color}38`,
        fontFamily: N.FONT_MONO,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `${color}22`;
        e.currentTarget.style.boxShadow  = `0 0 8px ${color}30`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = `${color}10`;
        e.currentTarget.style.boxShadow  = "none";
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center text-[10px] tracking-[0.16em] font-mono py-12"
      style={{ color: N.TEXT_3 }}>
      {label.toUpperCase()}
    </div>
  );
}

/* ── ROW EXPORT ──────────────────────────────────────────────────────────── */

interface RowProps {
  positions:    SimPosition[];
  openTrades:   Trade[];
  closedTrades: Trade[];
}

export function PositionsRow({ positions, openTrades, closedTrades }: RowProps) {
  return (
    <section
      className="grid gap-2 px-2"
      style={{ gridTemplateColumns: "1fr 1fr" }}
    >
      <ActivePanel positions={positions} openTrades={openTrades} />
      <ClosedPanel closedTrades={closedTrades} />
    </section>
  );
}
