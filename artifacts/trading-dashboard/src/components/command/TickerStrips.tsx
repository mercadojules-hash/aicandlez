import { useQueries } from "@tanstack/react-query";
import type { EngineStatus } from "./types";
import { ASSETS } from "./types";
import { fmtPrice } from "./helpers";

interface Candle { time: number; close: number; volume: number; }

const MACRO_ITEMS = [
  { label: "GOLD",       value: "3,318.40",  chg: "+0.42%" },
  { label: "OIL",        value: "78.22",     chg: "+1.18%" },
  { label: "DXY",        value: "104.73",    chg: "-0.21%" },
  { label: "VIX",        value: "17.84",     chg: "+5.63%" },
  { label: "FED RATE",   value: "5.25%",     chg: "HOLD"   },
  { label: "SPX",        value: "5,214",     chg: "-0.30%" },
  { label: "NDX",        value: "18,129",    chg: "+0.12%" },
  { label: "10Y YIELD",  value: "4.31%",     chg: "+0.08%" },
  { label: "SILVER",     value: "31.88",     chg: "+1.24%" },
  { label: "EUR/USD",    value: "1.0872",    chg: "-0.15%" },
  { label: "BTC DOMIN",  value: "55.2%",     chg: "+0.8%"  },
  { label: "FEAR/GREED", value: "46",        chg: "NEUTRAL"},
  { label: "COPPER",     value: "4.72",      chg: "-0.33%" },
  { label: "NATURAL GAS",value: "2.18",      chg: "+2.14%" },
];

const EQUITIES = [
  { label: "SPY",  value: "521.40",  chg: "-0.30%" },
  { label: "QQQ",  value: "441.82",  chg: "+0.12%" },
  { label: "AAPL", value: "187.44",  chg: "+0.54%" },
  { label: "MSFT", value: "415.30",  chg: "-0.22%" },
  { label: "NVDA", value: "875.48",  chg: "+2.11%" },
  { label: "TSLA", value: "174.21",  chg: "-1.34%" },
  { label: "META", value: "508.62",  chg: "+0.87%" },
  { label: "GOOG", value: "175.33",  chg: "+0.34%" },
  { label: "AMZN", value: "191.22",  chg: "+0.65%" },
  { label: "COIN", value: "223.40",  chg: "+3.21%" },
  { label: "MSTR", value: "1,430",   chg: "+2.88%" },
  { label: "RIOT", value: "9.42",    chg: "+4.51%" },
  { label: "HOOD", value: "22.84",   chg: "+1.62%" },
  { label: "CME",  value: "232.10",  chg: "+0.44%" },
];

/* ── Single ticker item ───────────────────────────────────────────────────── */
function Chip({
  label, value, chg, labelColor, large,
}: {
  label: string; value: string; chg?: string; labelColor?: string; large?: boolean;
}) {
  const isPos = chg?.startsWith("+");
  const isNeg = chg?.startsWith("-");
  return (
    <span className="inline-flex items-baseline gap-1.5 mx-4 shrink-0">
      <span
        className={`${large ? "text-[11px]" : "text-[10px]"} font-bold tracking-[0.12em] uppercase`}
        style={{ color: labelColor ?? "#2a5a78" }}
      >
        {label}
      </span>
      <span
        className={`${large ? "text-[14px]" : "text-[13px]"} font-bold font-mono`}
        style={{ color: "#c0eeff" }}
      >
        {value}
      </span>
      {chg && (
        <span
          className={`${large ? "text-[12px]" : "text-[11px]"} font-mono font-bold`}
          style={{
            color: isPos ? "#00ff8a" : isNeg ? "#ff3366" : "#ffb800",
            textShadow: isPos ? "0 0 8px #00ff8a80" : isNeg ? "0 0 8px #ff336680" : "0 0 8px #ffb80080",
          }}
        >
          {chg}
        </span>
      )}
      <span className="text-[#0D2035] ml-2 text-[10px]">│</span>
    </span>
  );
}

/* ── Scrolling ticker row ─────────────────────────────────────────────────── */
function Row({
  prefix, speed, color, live, items, rowBg, height,
}: {
  prefix: string;
  speed: "fast" | "normal" | "slow" | "xslow";
  color?: string;
  live?: boolean;
  items: React.ReactNode[];
  rowBg?: string;
  height?: number;
}) {
  const animClass =
    speed === "fast"  ? "ticker-content-fast"  :
    speed === "slow"  ? "ticker-content-slow"   :
    speed === "xslow" ? "ticker-content-xslow"  : "ticker-content";

  const set1 = items.map((item, i) => <span key={`a${i}`}>{item}</span>);
  const set2 = items.map((item, i) => <span key={`b${i}`}>{item}</span>);

  const h = height ?? 40;

  return (
    <div
      className="flex items-center border-b border-[#0C1E2C] overflow-hidden"
      style={{ height: h, background: rowBg ?? "#000000" }}
    >
      {/* Row label */}
      <div
        className="shrink-0 flex items-center gap-2 border-r border-[#141414] px-3 h-full"
        style={{ minWidth: 80, background: "#000000" }}
      >
        {live && (
          <span className="live-dot live-dot-cyan" style={{ width: 6, height: 6 }} />
        )}
        <span
          className="text-[9px] font-bold tracking-[0.2em] uppercase"
          style={{ color: color ?? "#00f0ff60" }}
        >
          {prefix}
        </span>
      </div>

      {/* Scrolling content */}
      <div className="ticker-wrap flex-1 h-full flex items-center pl-2">
        <div className={animClass}>
          {set1}
          {set2}
        </div>
      </div>
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */
interface Props { engine: EngineStatus | undefined }

export function TickerStrips({ engine }: Props) {
  const queries = useQueries({
    queries: ASSETS.map((a) => ({
      queryKey:        ["ticker-candle", a.symbol],
      queryFn:         () =>
        fetch(`/api/candles?symbol=${a.symbol}&timeframe=15m&limit=3`, { cache: "no-store" })
          .then((r) => r.ok ? r.json() as Promise<Candle[]> : []),
      refetchInterval: 60_000,
      staleTime: 0,
    })),
  });

  /* ── AI signal items ──────────────────────────────────────────────────── */
  const signalLog = engine?.recentSignalLog ?? [];
  const aiItems: React.ReactNode[] = signalLog.length
    ? signalLog.map((s, i) => {
        const sym  = s.symbol.replace("USD", "");
        const exec = s.executedAs;
        const blk  = s.blockReason && s.blockReason !== "None";
        const tag  = exec ? "✓ EXECUTED" : blk ? "FILTERED" : "SIGNAL";
        const c    = exec ? "#00ff8a" : blk ? "#ffb800" : "#00f0ff";
        const dCol = s.decision === "BUY" ? "#00ff8a" : s.decision === "SELL" ? "#ff3366" : "#3a6a80";
        return (
          <span key={i} className="inline-flex items-center gap-2 mx-5 shrink-0">
            <span className="text-[10px] font-bold tracking-widest" style={{ color: c + "80" }}>
              [{tag}]
            </span>
            <span className="text-[13px] font-bold" style={{ color: c }}>
              {sym}
            </span>
            <span className="text-[13px] font-bold" style={{ color: dCol, textShadow: `0 0 8px ${dCol}80` }}>
              {s.decision}
            </span>
            <span className="text-[12px] font-mono" style={{ color: "#c0eeff90" }}>
              {s.confidence.toFixed(0)}%
            </span>
            <span className="text-[#0D2035] ml-3 text-[11px]">·</span>
          </span>
        );
      })
    : [
        <span key="init" className="inline-flex items-center mx-5 gap-2">
          <span className="text-[12px] font-mono" style={{ color: "#00f0ff50" }}>
            AI SYSTEM LIVE
          </span>
          <span className="text-[12px] font-mono text-[#1a3a50] animate-pulse">
            SCANNING MARKETS · CALIBRATING INDICATORS · LOADING SIGNALS
          </span>
          <span className="text-[#0D2035] mx-4">·</span>
        </span>,
      ];

  /* ── Crypto live price items ──────────────────────────────────────────── */
  const cryptoItems: React.ReactNode[] = ASSETS.map((a, i) => {
    const candles = queries[i].data ?? [];
    const last    = candles[candles.length - 1];
    const first   = candles[0];
    const price   = last ? `$${fmtPrice(last.close)}` : "—";
    const pct     = last && first && first.close
      ? (((last.close - first.close) / first.close) * 100) : null;
    const chg = pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : undefined;
    return <Chip key={a.symbol} label={a.label} value={price} chg={chg} labelColor={a.color} large />;
  });

  /* ── Macro items ──────────────────────────────────────────────────────── */
  const macroItems: React.ReactNode[] = MACRO_ITEMS.map((m) => (
    <Chip key={m.label} label={m.label} value={m.value} chg={m.chg} labelColor="#7788aa" />
  ));

  /* ── Equities items ───────────────────────────────────────────────────── */
  const equitiesItems: React.ReactNode[] = EQUITIES.map((e) => (
    <Chip key={e.label} label={e.label} value={e.value} chg={e.chg} labelColor="#8866cc" />
  ));

  return (
    <div style={{ borderBottom: "1px solid #0C1E2C" }}>
      <Row
        prefix="LIVE AI"
        speed="fast"
        color="#00f0ff"
        live
        height={44}
        rowBg="linear-gradient(90deg, #010D1C 0%, #000812 50%, #010D1C 100%)"
        items={aiItems}
      />
      <Row
        prefix="CRYPTO"
        speed="normal"
        color="#00ff8a"
        live
        height={42}
        items={cryptoItems}
      />
      <Row
        prefix="MACRO"
        speed="xslow"
        color="#ffb80080"
        height={38}
        items={macroItems}
      />
      <Row
        prefix="EQUITIES"
        speed="slow"
        color="#c855f780"
        height={38}
        items={equitiesItems}
      />
    </div>
  );
}
