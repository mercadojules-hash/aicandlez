import { useQueries } from "@tanstack/react-query";
import type { EngineStatus } from "./types";
import { ASSETS } from "./types";
import { fmtPrice } from "./helpers";

interface Candle { time: number; close: number; volume: number; }

const MACRO_ITEMS = [
  { label: "GOLD",      value: "3,318.40",  chg: "+0.42%" },
  { label: "OIL",       value: "78.22",     chg: "+1.18%" },
  { label: "DXY",       value: "104.73",    chg: "-0.21%" },
  { label: "VIX",       value: "17.84",     chg: "+5.63%" },
  { label: "FED RATE",  value: "5.25%",     chg: "HOLD"   },
  { label: "SPX",       value: "5,214",     chg: "-0.30%" },
  { label: "NDX",       value: "18,129",    chg: "+0.12%" },
  { label: "TNX",       value: "4.31%",     chg: "+0.08%" },
  { label: "SILVER",    value: "31.88",     chg: "+1.24%" },
  { label: "EUR/USD",   value: "1.0872",    chg: "-0.15%" },
  { label: "BTC DOMIN", value: "55.2%",     chg: "+0.8%"  },
  { label: "FEAR/GREED",value: "46",        chg: "NEUTRAL"},
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
];

/* ── Single item in a ticker row ─────────────────────────────────────────── */
function Chip({
  label, value, chg, labelColor,
}: {
  label: string; value: string; chg?: string; labelColor?: string;
}) {
  const isPos = chg?.startsWith("+");
  const isNeg = chg?.startsWith("-");
  return (
    <span className="inline-flex items-center gap-1.5 mx-3 shrink-0">
      <span className="text-[8px] font-bold tracking-[0.15em] uppercase"
        style={{ color: labelColor ?? "#2a5a78" }}>
        {label}
      </span>
      <span className="text-[10px] font-bold font-mono text-foreground/80">{value}</span>
      {chg && (
        <span className={`text-[9px] font-mono ${
          isPos ? "text-emerald-400" : isNeg ? "text-red-400" : "text-amber-400/70"
        }`}>{chg}</span>
      )}
      <span className="text-[#0D2035] ml-1">│</span>
    </span>
  );
}

/* ── A single scrolling row ──────────────────────────────────────────────── */
function Row({
  prefix, speed, color, live, items,
}: {
  prefix: string;
  speed: "fast" | "normal" | "slow";
  color?: string;
  live?: boolean;
  items: React.ReactNode[];
}) {
  const animClass =
    speed === "fast"   ? "ticker-content-fast" :
    speed === "slow"   ? "ticker-content-slow"  : "ticker-content";

  /* Duplicate items but give each set a unique index prefix to avoid key collisions */
  const set1 = items.map((item, i) => <span key={`a${i}`}>{item}</span>);
  const set2 = items.map((item, i) => <span key={`b${i}`}>{item}</span>);

  return (
    <div className="flex items-center h-7 border-b border-[#0C1E2E] overflow-hidden">
      {/* Label */}
      <div className="shrink-0 px-2.5 flex items-center gap-1.5 border-r border-[#0C1E2E] min-w-[68px] h-full bg-[#000508]">
        {live && (
          <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
        )}
        <span className="text-[7px] font-bold tracking-[0.18em] uppercase" style={{ color: color ?? "#00eeff60" }}>
          {prefix}
        </span>
      </div>

      {/* Scrolling content */}
      <div className="ticker-wrap flex-1 h-full flex items-center">
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
      queryKey:       ["ticker-candle", a.symbol],
      queryFn:        () =>
        fetch(`/api/candles?symbol=${a.symbol}&timeframe=15m&limit=3`, { cache: "no-store" })
          .then((r) => r.ok ? r.json() as Promise<Candle[]> : []),
      refetchInterval: 90_000,
      staleTime: 0,
    })),
  });

  /* ── AI ticker items ──────────────────────────────────────────────────── */
  const signalLog = engine?.recentSignalLog ?? [];
  const aiItems: React.ReactNode[] =
    signalLog.length
      ? signalLog.map((s, i) => {
          const tag = s.executedAs ? "✓ EXEC" : s.blockReason ? "BLOCKED" : "SIGNAL";
          const sym = s.symbol.replace("USD", "");
          const c   = s.executedAs ? "#00ff88" : s.blockReason ? "#ff336670" : "#00eeff70";
          return (
            <span key={i} className="inline-flex items-center mx-4 gap-1.5">
              <span className="text-[9px] font-mono" style={{ color: c }}>
                {sym} → {s.decision} {s.confidence.toFixed(0)}% [{tag}]
              </span>
              <span className="text-[#0D2035] mx-2">·</span>
            </span>
          );
        })
      : [
          <span key="init" className="inline-flex items-center mx-4">
            <span className="text-[9px] font-mono text-[#1a3a50] animate-pulse">
              AI SYSTEM INITIALIZING — SCANNING MARKETS — CALIBRATING INDICATORS
            </span>
            <span className="text-[#0D2035] mx-4">·</span>
          </span>,
        ];

  /* ── Crypto ticker items ──────────────────────────────────────────────── */
  const cryptoItems: React.ReactNode[] = ASSETS.map((a, i) => {
    const candles = queries[i].data ?? [];
    const last    = candles[candles.length - 1];
    const first   = candles[0];
    const price   = last ? `$${fmtPrice(last.close)}` : "—";
    const pct     = last && first && first.close
      ? (((last.close - first.close) / first.close) * 100) : null;
    const chg     = pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : undefined;
    return (
      <Chip key={a.symbol} label={a.label} value={price} chg={chg} labelColor={a.color} />
    );
  });

  /* ── Macro ticker items ───────────────────────────────────────────────── */
  const macroItems: React.ReactNode[] = MACRO_ITEMS.map((m) => (
    <Chip key={m.label} label={m.label} value={m.value} chg={m.chg} labelColor="#8888aa" />
  ));

  /* ── Equities ticker items ────────────────────────────────────────────── */
  const equitiesItems: React.ReactNode[] = EQUITIES.map((e) => (
    <Chip key={e.label} label={e.label} value={e.value} chg={e.chg} labelColor="#8066cc" />
  ));

  return (
    <div className="border-b border-[#0C1E2E] bg-[#000508]">
      <Row prefix="LIVE AI"   speed="fast"   color="#00eeff80" live  items={aiItems}       />
      <Row prefix="CRYPTO"    speed="normal"  color="#00ff8870" live  items={cryptoItems}   />
      <Row prefix="MACRO"     speed="slow"    color="#ffb80060"       items={macroItems}    />
      <Row prefix="EQUITIES"  speed="normal"  color="#a855f760"       items={equitiesItems} />
    </div>
  );
}
