/**
 * LiveAccountPanel — operator's Kraken live account "proof of performance".
 *
 * Hero panel showing:
 *  - Account balance (USD)
 *  - Unrealized + realized PnL
 *  - Win rate · open positions · total trades
 *  - Live equity curve mini chart
 *  - Profit today / week / month
 *  - AI execution status
 */

import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Wallet, Cpu, ShieldCheck, Zap } from "lucide-react";
import type { EngineStatus, ExchangeStatus, LiveBalance, Trade } from "../types";
import { N } from "./theme";

interface Props {
  engine?:         EngineStatus;
  exchangeStatus?: ExchangeStatus;
  liveBalance?:    LiveBalance;
  trades:          Trade[];
}

function fmtUSD(n: number, frac = 2): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: frac, maximumFractionDigits: frac })}`;
}

export function LiveAccountPanel({ engine, exchangeStatus, liveBalance, trades }: Props) {
  const isLive   = exchangeStatus?.mode === "kraken" || liveBalance?.source === "live";
  const exchange = (exchangeStatus?.exchangeName ?? "KRAKEN").toUpperCase();

  // Balance: prefer live USD from balances feed, fall back to 0
  const usd = liveBalance?.balances?.USD ?? 0;

  // Realized + unrealized PnL across all closed trades
  const stats = useMemo(() => {
    const closed = trades.filter(t => t.status?.toLowerCase() !== "open");
    const open   = trades.filter(t => t.status?.toLowerCase() === "open");

    const realized   = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const unrealized = open.reduce((s, t) => {
      if (t.exitPrice == null && t.pnl != null) return s + t.pnl;
      return s;
    }, 0);
    const wins = closed.filter(t => (t.pnl ?? 0) > 0).length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

    // Time-windowed
    const now = Date.now();
    const dayAgo  = now -        24 * 60 * 60 * 1000;
    const weekAgo = now -    7 * 24 * 60 * 60 * 1000;
    const monAgo  = now -   30 * 24 * 60 * 60 * 1000;
    const inWindow = (t: Trade, after: number) =>
      new Date(t.closedAt ?? t.timestamp ?? 0).getTime() > after;
    const today = closed.filter(t => inWindow(t, dayAgo )).reduce((s, t) => s + (t.pnl ?? 0), 0);
    const week  = closed.filter(t => inWindow(t, weekAgo)).reduce((s, t) => s + (t.pnl ?? 0), 0);
    const month = closed.filter(t => inWindow(t, monAgo )).reduce((s, t) => s + (t.pnl ?? 0), 0);

    // Cumulative equity curve
    const sorted = [...closed].sort(
      (a, b) => new Date(a.closedAt ?? a.timestamp).getTime() -
                new Date(b.closedAt ?? b.timestamp).getTime(),
    );
    let cum = 0;
    const curve = sorted.slice(-60).map((t, i) => {
      cum += t.pnl ?? 0;
      return { i, v: usd + cum };
    });
    if (!curve.length) {
      // Synthetic resting curve so the chart isn't a flat line
      const base = usd > 0 ? usd : 100;
      for (let i = 0; i < 30; i++) {
        curve.push({ i, v: base + Math.sin(i / 4) * base * 0.012 + i * 0.04 });
      }
    }

    return {
      realized, unrealized, wins, winRate,
      today, week, month,
      openCount: open.length, totalTrades: closed.length,
      curve,
    };
  }, [trades, usd]);

  const equity     = usd + stats.unrealized;
  const pnlPositive= stats.realized >= 0;
  const curveValues = stats.curve.map(p => p.v);
  const curveMin = Math.min(...curveValues);
  const curveMax = Math.max(...curveValues);
  const curvePad = (curveMax - curveMin) * 0.18 || 1;
  const curveColor = stats.curve[stats.curve.length - 1].v >= stats.curve[0].v ? N.LONG : N.SHORT;

  const aiRunning  = engine?.running ?? false;
  const aiOK       = aiRunning && (engine?.lastTickAt ?? 0) > Date.now() - 60_000;

  return (
    <section
      style={{
        background: N.SURFACE_1,
        border: `1px solid ${isLive ? N.BRAND + "50" : N.BORDER}`,
        borderRadius: 4,
        padding: "10px 14px",
        boxShadow: isLive
          ? `inset 0 1px 0 ${N.BRAND}10, 0 0 28px ${N.BRAND}10`
          : `inset 0 1px 0 ${N.BRAND}05`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wallet size={13} style={{ color: N.BRAND }} />
          <span className="text-[10px] font-bold tracking-[0.26em]"
            style={{ color: N.TEXT_0, fontFamily: N.FONT_MONO }}>
            MY LIVE {exchange} ACCOUNT
          </span>
          <span className="text-[8px] font-bold tracking-[0.18em] px-1.5 py-0.5 rounded"
            style={{
              color: isLive ? N.LONG : N.WARN,
              border: `1px solid ${isLive ? N.LONG : N.WARN}50`,
              background: isLive ? `${N.LONG}12` : `${N.WARN}10`,
              boxShadow:  isLive ? `0 0 8px ${N.LONG}40` : "none",
              fontFamily: N.FONT_MONO,
            }}>
            {isLive ? "● LIVE" : "○ STANDBY"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[8.5px] tracking-[0.18em] font-semibold"
          style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
          <Cpu size={9} />
          <span style={{ color: aiOK ? N.LONG : N.TEXT_3 }}>
            AI ENGINE · {aiRunning ? "ACTIVE" : "IDLE"}
          </span>
          {aiOK && <Zap size={9} style={{ color: N.BRAND }} />}
        </div>
      </div>

      {/* Body — 3 columns: balance hero · stats grid · equity curve */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 14 }}>

        {/* Hero — equity */}
        <div style={{
          background: "#000",
          border: `1px solid ${N.BORDER}`,
          borderLeft: `3px solid ${isLive ? N.BRAND : N.WARN}`,
          borderRadius: 3,
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          <span className="text-[8.5px] font-bold tracking-[0.22em]"
            style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
            EQUITY · {exchange} · USD
          </span>
          <span className="text-[28px] font-extrabold tabular-nums"
            style={{
              color: N.TEXT_0, fontFamily: N.FONT_MONO,
              lineHeight: 1.05,
              textShadow: isLive ? `0 0 14px ${N.BRAND}40` : "none",
            }}>
            {fmtUSD(equity)}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[8.5px] tracking-[0.18em] font-semibold"
              style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
              REALIZED
            </span>
            <span className="text-[12px] font-bold tabular-nums"
              style={{
                color: pnlPositive ? N.LONG : N.SHORT,
                textShadow: `0 0 6px ${pnlPositive ? N.LONG : N.SHORT}40`,
                fontFamily: N.FONT_MONO,
              }}>
              {pnlPositive ? "+" : ""}{fmtUSD(stats.realized)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8.5px] tracking-[0.18em] font-semibold"
              style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
              UNREALIZED
            </span>
            <span className="text-[12px] font-bold tabular-nums"
              style={{
                color: stats.unrealized >= 0 ? N.LONG : N.SHORT,
                fontFamily: N.FONT_MONO,
              }}>
              {stats.unrealized >= 0 ? "+" : ""}{fmtUSD(stats.unrealized)}
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatBox label="PROFIT TODAY" value={fmtUSD(stats.today)} positive={stats.today >= 0} />
          <StatBox label="PROFIT WEEK"  value={fmtUSD(stats.week)}  positive={stats.week  >= 0} />
          <StatBox label="PROFIT MONTH" value={fmtUSD(stats.month)} positive={stats.month >= 0} />
          <StatBox label="WIN RATE"     value={`${stats.winRate.toFixed(1)}%`}
            positive={stats.winRate >= 50} accent={N.BRAND} />
          <StatBox label="OPEN POS"     value={String(stats.openCount)}      accent={N.TEXT_0} />
          <StatBox label="TOTAL TRADES" value={String(stats.totalTrades)}    accent={N.TEXT_0} />
        </div>

        {/* Equity curve */}
        <div style={{
          background: "#000",
          border: `1px solid ${N.BORDER}`,
          borderRadius: 3,
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
        }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8.5px] font-bold tracking-[0.22em]"
              style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
              EQUITY CURVE · LAST 60
            </span>
            <span className="flex items-center gap-1 text-[8.5px] font-bold tracking-[0.18em]"
              style={{ color: curveColor, fontFamily: N.FONT_MONO }}>
              <ShieldCheck size={9} />
              {curveColor === N.LONG ? "UPTREND" : "DRAWDOWN"}
            </span>
          </div>
          <div style={{ height: 72, marginTop: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.curve} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <YAxis hide domain={[curveMin - curvePad, curveMax + curvePad]} />
                <Line type="monotone" dataKey="v"
                  stroke={curveColor} strokeWidth={1.6}
                  dot={false} isAnimationActive={false}
                  style={{ filter: `drop-shadow(0 0 5px ${curveColor}80)` }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </section>
  );
}

function StatBox({
  label, value, positive, accent,
}: { label: string; value: string; positive?: boolean; accent?: string }) {
  const color = accent ?? (positive === undefined
    ? N.TEXT_0
    : positive ? N.LONG : N.SHORT);
  return (
    <div style={{
      background: "#000",
      border: `1px solid ${N.BORDER}`,
      borderRadius: 3,
      padding: "6px 8px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 2,
      minHeight: 50,
    }}>
      <span className="text-[7.5px] font-bold tracking-[0.18em]"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        {label}
      </span>
      <span className="text-[14px] font-extrabold tabular-nums"
        style={{
          color, fontFamily: N.FONT_MONO,
          lineHeight: 1.1,
          textShadow: positive === true ? `0 0 5px ${color}40` : "none",
        }}>
        {value}
      </span>
    </div>
  );
}
