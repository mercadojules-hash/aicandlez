/**
 * PositionsRow — Active Positions (left) + Closed Positions / Trade History (right).
 * Hedge-fund blotter aesthetic. Live PnL, AI confidence, trailing stop, long/short.
 */

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { Trade, SimPosition } from "../types";
import { N } from "./theme";
import { CRYPTO_20, EQUITIES_20 } from "./tickers";
import { useLiveCandles } from "./useLiveCandles";
import {
  resolveFeeLeg, extractBaseAsset, feeVariancePct, FEE_VARIANCE_THRESHOLD_PCT,
  type FeeLeg,
} from "@/lib/brokerFees";

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
      <div className="blotter-scroll" style={{ maxHeight: 560 }}>
        {rows.length === 0 ? (
          <EmptyState label="No active positions" />
        ) : rows.map(r => (
          <ActivePositionRow
            key={r.id}
            id={r.id}
            symbol={r.symbol}
            side={r.side}
            qty={r.qty}
            entry={r.entry}
            sl={r.sl}
            tp={r.tp}
            pnl={r.pnl}
            pnlPct={r.pnlPct}
            ageLabel={ageMs(r.age)}
            conf={r.conf}
            trail={r.trail}
          />
        ))}
      </div>
    </Panel>
  );
}

/* ── ACTIVE POSITION ROW (SignalRow-style 2-line layout) ─────────────────── */

interface ActivePositionRowProps {
  id:       string;
  symbol:   string;
  side:     "LONG" | "SHORT";
  qty:      number;
  entry:    number;
  sl:       number | null;
  tp:       number | null;
  pnl:      number;
  pnlPct:   number;
  ageLabel: string;
  conf:     number;
  trail:    boolean;
}

function ActivePositionRow(p: ActivePositionRowProps) {
  const { points, livePrice, summary, state } = useLiveCandles({
    symbol: p.symbol, limit: 40, timeframe: "15m",
  });

  const last     = livePrice ?? summary.last ?? p.entry;
  const dirColor = p.side === "LONG" ? N.LONG : N.SHORT;
  const dirGlow  = p.side === "LONG" ? N.LONG_GLOW : N.SHORT_GLOW;
  const pnlPos   = p.pnl >= 0;
  const tickerCo = TICKER_COLOR[p.symbol] ?? N.BRAND;
  const confColor = p.conf >= 78 ? N.BRAND : p.conf >= 62 ? N.BRAND_DEEP : N.WARN;

  const rowBg      = `linear-gradient(90deg, ${dirColor}0F 0%, ${N.SURFACE_1} 32%)`;
  const rowBgHover = `linear-gradient(90deg, ${dirColor}1A 0%, ${N.SURFACE_2} 38%)`;

  const closes = points.map(pt => pt.close);
  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 1;
  const pad = (max - min) * 0.18 || 1;

  const RING = 52, STROKE = 4.5;
  const radius = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (p.conf / 100) * circ;

  return (
    <div
      className="grid items-center transition-colors"
      style={{
        gridTemplateColumns: "260px 1fr 84px",
        gap: 10,
        padding: "10px 12px 10px 14px",
        minHeight: 76,
        borderBottom: `1px solid ${N.BORDER}`,
        background: rowBg,
        fontFamily: N.FONT_MONO,
        boxShadow: `inset 5px 0 0 0 ${dirColor}, inset 5px 0 14px 0 ${dirColor}28`,
        position: "relative",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = rowBgHover)}
      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
    >
      {/* LEFT — header (side · ticker · trail) over (entry · last · qty) */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-extrabold tracking-[0.22em] px-2 py-0.5 rounded"
            style={{
              color: dirColor,
              background: `${dirColor}1c`,
              border: `1px solid ${dirColor}70`,
              boxShadow: `0 0 5px ${dirColor}40`,
            }}>
            {p.side}
          </span>
          <span style={{
            width: 4, height: 14, background: tickerCo, borderRadius: 1,
            boxShadow: `0 0 4px ${tickerCo}80`,
          }} />
          <span className="text-[14px] font-extrabold tracking-wide" style={{ color: N.TEXT_0 }}>
            {p.symbol.replace("USD", "")}
          </span>
          {p.trail && (
            <span className="text-[8px] font-bold tracking-[0.18em] px-1.5 py-0.5 rounded"
              style={{
                color: N.BRAND_BRT, background: `${N.BRAND_BRT}14`,
                border: `1px solid ${N.BRAND_BRT}55`,
                boxShadow: `0 0 4px ${N.BRAND_BRT}40`,
              }}>
              TRAIL · ON
            </span>
          )}
          <span className="text-[8px] tracking-[0.18em] ml-auto" style={{ color: N.TEXT_3 }}>
            {p.ageLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <DataCell label="ENTRY" value={`$${fmtPrice(p.entry)}`} color={N.TEXT_0} />
          <DataCell label="STOP"  value={p.sl != null ? `$${fmtPrice(p.sl)}` : "—"} color={N.SHORT} />
          <DataCell label="TARGET" value={p.tp != null ? `$${fmtPrice(p.tp)}` : "—"} color={N.LONG} />
        </div>
      </div>

      {/* CENTER — sparkline + last/pnl row 1, actions row 2 */}
      <div className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, height: 34 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <YAxis hide domain={[min - pad, max + pad]} />
                <Line type="monotone" dataKey="close" stroke={dirColor} strokeWidth={1.6}
                  dot={false} isAnimationActive={false}
                  style={{ filter: `drop-shadow(0 0 3px ${dirColor}90)` }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col items-end" style={{ minWidth: 110 }}>
            <span className="text-[7.5px] font-bold tracking-[0.18em]" style={{ color: N.TEXT_3 }}>LAST · PNL</span>
            <span className="text-[12px] font-extrabold tabular-nums"
              style={{
                color: N.TEXT_0, lineHeight: 1.05,
                textShadow: state === "live" ? `0 0 3px ${dirGlow}` : "none",
              }}>
              ${fmtPrice(last)}
            </span>
            <span className="text-[11px] font-extrabold tabular-nums"
              style={{
                color: pnlPos ? N.LONG : N.SHORT,
                textShadow: `0 0 4px ${pnlPos ? N.LONG_GLOW : N.SHORT_GLOW}`,
              }}>
              {fmtUsd(p.pnl)}
              <span className="text-[9px] ml-1" style={{ opacity: 0.85 }}>
                ({pnlPos ? "+" : ""}{p.pnlPct.toFixed(2)}%)
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <span className="text-[8px] font-bold tracking-[0.18em] mr-1" style={{ color: N.TEXT_3 }}>
            QTY {p.qty.toFixed(p.qty >= 1 ? 2 : 4)}
          </span>
          <ActionBtn label="PAUSE" color={N.WARN} />
          <ActionBtn label="CLOSE" color={N.SHORT} />
        </div>
      </div>

      {/* RIGHT — AI confidence ring */}
      <div style={{
        background: "#000",
        border: `1px solid ${confColor}40`,
        borderRadius: 4,
        padding: "6px 6px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        boxShadow: `inset 0 0 7px ${confColor}10, 0 0 5px ${confColor}10`,
      }}>
        <span className="text-[7.5px] font-bold tracking-[0.18em]" style={{ color: N.TEXT_3 }}>AI CONF</span>
        <div style={{ position: "relative", width: RING, height: RING }}>
          <svg width={RING} height={RING}>
            <circle cx={RING / 2} cy={RING / 2} r={radius}
              fill="none" stroke={N.BORDER} strokeWidth={STROKE} />
            <circle cx={RING / 2} cy={RING / 2} r={radius}
              fill="none" stroke={confColor} strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              style={{
                filter: `drop-shadow(0 0 4px ${confColor}90)`,
                transition: "stroke-dasharray 0.45s ease",
              }} />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-[12px] font-extrabold tabular-nums"
            style={{
              color: confColor,
              fontFamily: N.FONT_MONO,
              textShadow: `0 0 4px ${confColor}80`,
            }}>
            {p.conf}
          </span>
        </div>
      </div>
    </div>
  );
}

function DataCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[7.5px] font-bold tracking-[0.18em]" style={{ color: N.TEXT_3 }}>{label}</span>
      <span className="text-[11px] font-extrabold tabular-nums" style={{ color, lineHeight: 1.05 }}>
        {value}
      </span>
    </div>
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

  // Cross-tenant audit: count rows where the broker's reported commission
  // drifted >FEE_VARIANCE_THRESHOLD_PCT from the catalog estimate so the
  // operator gets a single banner number for adapter-regression triage.
  const variantRows = sorted.reduce((acc, t) => {
    const base  = extractBaseAsset(t.symbol);
    const exit  = t.exitPrice ?? undefined;
    const entry = resolveFeeLeg(t.entryFeeBroker, t.entryFeeBrokerCurrency, t.entryFee, exit, base);
    const exitL = resolveFeeLeg(t.exitFeeBroker,  t.exitFeeBrokerCurrency,  t.exitFee,  exit, base);
    const v1 = feeVariancePct(entry);
    const v2 = feeVariancePct(exitL);
    const hot = (v1 != null && Math.abs(v1) > FEE_VARIANCE_THRESHOLD_PCT)
             || (v2 != null && Math.abs(v2) > FEE_VARIANCE_THRESHOLD_PCT);
    return acc + (hot ? 1 : 0);
  }, 0);

  return (
    <Panel
      label="CLOSED POSITIONS"
      sub={`${total} EXECUTED · REALIZED PNL · AI EXECUTION LOG`}
      brand={N.BRAND_BRT}
      right={
        <div className="flex gap-3 text-[8.5px] font-bold tracking-[0.16em]" style={{ color: N.TEXT_2 }}>
          <span>WIN&nbsp;<span style={{ color: N.LONG }}>{wr.toFixed(1)}%</span></span>
          <span>NET&nbsp;<span style={{ color: sum >= 0 ? N.LONG : N.SHORT }}>{fmtUsd(sum)}</span></span>
          {variantRows > 0 && (
            <span
              title={`${variantRows} row(s) where broker commission drifted >${FEE_VARIANCE_THRESHOLD_PCT}% from the catalog estimate — possible adapter regression.`}
              style={{
                color: N.WARN,
                padding: "0 6px",
                border: `1px solid ${N.WARN}55`,
                borderRadius: 2,
              }}
            >
              FEE Δ {variantRows}
            </span>
          )}
        </div>
      }
    >
      <div className="grid text-[8.5px] font-bold tracking-[0.14em] px-3 py-1.5"
        style={{
          gridTemplateColumns: "70px 56px 1fr 1fr 1fr 90px 90px",
          color: N.TEXT_3,
          borderBottom: `1px solid ${N.BORDER}`,
          background: N.SURFACE_1,
        }}>
        <div>SYMBOL</div>
        <div>SIDE</div>
        <div className="text-right">ENTRY</div>
        <div className="text-right">EXIT</div>
        <div className="text-right">PNL</div>
        <div className="text-right">FEES</div>
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
          const tickerColor = TICKER_COLOR[t.symbol] ?? N.BRAND;
          const ts = new Date(t.closedAt ?? t.timestamp);
          const tsLabel = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
          const reason = t.reason
            ? t.reason.length > 18 ? t.reason.slice(0, 18) + "…" : t.reason
            : pnlOk ? "TP HIT" : "SL HIT";

          // Broker-vs-estimate fee resolution — mirrors customer trade
          // receipt + AdminTradeHistoryPanel on /portal so the same trade
          // shows the same commission everywhere it appears.
          const exitPx   = t.exitPrice ?? undefined;
          const baseAsset = extractBaseAsset(t.symbol);
          const entryLeg = resolveFeeLeg(
            t.entryFeeBroker, t.entryFeeBrokerCurrency, t.entryFee,
            exitPx, baseAsset,
          );
          const exitLeg  = resolveFeeLeg(
            t.exitFeeBroker,  t.exitFeeBrokerCurrency,  t.exitFee,
            exitPx, baseAsset,
          );
          const fees = entryLeg.usd + exitLeg.usd;
          const bothActual   = entryLeg.displayFromBroker && exitLeg.displayFromBroker;
          const anyBroker    = entryLeg.fromBroker || exitLeg.fromBroker;
          const feePillLabel = bothActual ? "ACTUAL" : "EST.";
          // Variance — flag when the broker drifts >threshold from the
          // catalog estimate so operators can spot adapter regressions.
          const v1 = feeVariancePct(entryLeg);
          const v2 = feeVariancePct(exitLeg);
          const maxVarPct = Math.max(
            v1 != null ? Math.abs(v1) : 0,
            v2 != null ? Math.abs(v2) : 0,
          );
          const hotVariance = maxVarPct > FEE_VARIANCE_THRESHOLD_PCT;
          const feeColor = hotVariance ? N.WARN : (anyBroker ? N.BRAND : N.TEXT_2);

          const fmtLegTitle = (legName: string, leg: FeeLeg): string | null => {
            if (leg.fromBroker) {
              const ccy = leg.brokerCcy && !leg.brokerIsUsd ? ` ${leg.brokerCcy}` : "";
              const dp  = leg.brokerIsUsd ? 2 : ((leg.brokerAmount ?? 0) < 1 ? 6 : 4);
              const sym = leg.brokerIsUsd ? "$" : "";
              let line  = `${legName}: ${sym}${(leg.brokerAmount ?? 0).toFixed(dp)}${ccy} · charged by broker`;
              const v   = feeVariancePct(leg);
              if (v != null && Math.abs(v) > FEE_VARIANCE_THRESHOLD_PCT && leg.estimate != null) {
                line += `  ⚠  drift ${v >= 0 ? "+" : ""}${v.toFixed(1)}% vs $${leg.estimate.toFixed(2)} est.`;
              }
              return line;
            }
            if (leg.estimate != null) {
              return `${legName}: $${leg.estimate.toFixed(2)} (est. — broker did not report)`;
            }
            return null;
          };
          const tooltipLines: string[] = [];
          const openTip  = fmtLegTitle("Opening commission", entryLeg);
          const closeTip = fmtLegTitle("Closing commission", exitLeg);
          if (openTip)  tooltipLines.push(openTip);
          if (closeTip) tooltipLines.push(closeTip);
          if (fees > 0) tooltipLines.push(`Net of fees: ${fmtUsd(pnl - fees)}`);
          if (t.exchange) tooltipLines.push(`Exchange: ${String(t.exchange).toUpperCase()}`);
          const feeTooltip = tooltipLines.join("\n");

          return (
            <div
              key={t.id}
              className="grid items-center px-3 py-1.5 transition-colors"
              style={{
                gridTemplateColumns: "70px 56px 1fr 1fr 1fr 90px 90px",
                borderBottom: `1px solid ${N.BORDER}`,
                background: hotVariance ? `${N.WARN}0A` : N.SURFACE_1,
                fontFamily: N.FONT_MONO,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = N.SURFACE_2)}
              onMouseLeave={e => (e.currentTarget.style.background = hotVariance ? `${N.WARN}0A` : N.SURFACE_1)}
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
                           textShadow: pnlOk ? `0 0 4px ${N.LONG_GLOW}` : `0 0 6px ${N.SHORT_GLOW}` }}>
                  {fmtUsd(pnl)}
                </div>
                <div className="text-[8px] tabular-nums" style={{ color: pnlOk ? N.LONG : N.SHORT, opacity: 0.8 }}>
                  {pnlOk ? "+" : ""}{pct.toFixed(2)}%
                </div>
              </div>
              <div
                className="text-right"
                title={feeTooltip || undefined}
                style={{ cursor: feeTooltip ? "help" : "default" }}
              >
                {(fees > 0 || anyBroker) ? (
                  <>
                    <div className="text-[10px] tabular-nums font-bold"
                         style={{ color: feeColor }}>
                      −${fees.toFixed(2)}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <span style={{
                        padding: "0 4px",
                        fontSize: 7, fontWeight: 800, letterSpacing: "0.10em",
                        color: bothActual ? N.BRAND : N.TEXT_3,
                        border: `1px solid ${bothActual ? N.BRAND : N.TEXT_3}55`,
                        borderRadius: 2,
                      }}>{feePillLabel}</span>
                      {hotVariance && (
                        <span style={{
                          padding: "0 4px",
                          fontSize: 7, fontWeight: 800, letterSpacing: "0.10em",
                          color: N.WARN,
                          border: `1px solid ${N.WARN}80`,
                          borderRadius: 2,
                        }}>
                          Δ{maxVarPct >= 0 ? "+" : ""}{maxVarPct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[9px] tabular-nums" style={{ color: N.TEXT_3 }}>—</div>
                )}
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
              boxShadow: `0 0 4px ${brand}, 0 0 9px ${brand}40`,
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
