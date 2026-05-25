import { useEffect, useState } from "react";
import type { SimAccount, LiveBalance, EngineStatus, FeeSummary } from "./types";

interface Props {
  simAccount?: SimAccount;
  liveBalance?: LiveBalance;
  engine?: EngineStatus;
  feeSummary?: FeeSummary;
  exchangeName?: string;
  liveActive?: boolean;
}

/* ── Donut chart ─────────────────────────────────────────────────────────────── */
interface Segment { label: string; value: string; color: string; pct: number }

function DonutChart({ segments, centerValue, centerLabel }: {
  segments: Segment[]; centerValue: string; centerLabel: string;
}) {
  const r  = 62;
  const cx = 80;
  const cy = 80;
  const sw = 17;
  const c  = 2 * Math.PI * r;
  let off  = 0;
  const slices = segments.map(seg => {
    const dash  = (Math.max(0, seg.pct) / 100) * c;
    const slice = { ...seg, dash, gap: c - dash, offset: off };
    off += dash;
    return slice;
  });
  return (
    <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
      <svg width={160} height={160} viewBox="0 0 160 160" style={{ position: "absolute", inset: 0 }}>
        <circle cx={cx} cy={cy} r={r + sw / 2 + 3} fill="none" stroke="#00f0ff03" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0d0d0d" strokeWidth={sw} />
        {slices.filter(s => s.pct > 0).map(s => (
          <circle key={s.label} cx={cx} cy={cy} r={r}
            fill="none" stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
            transform="rotate(-90)"
            style={{ transformOrigin: `${cx}px ${cy}px`, filter: `drop-shadow(0 0 4px ${s.color}80)`, opacity: 0.9 }}
          />
        ))}
        <circle cx={cx} cy={cy} r={r - sw / 2 - 1} fill="none" stroke="#0d0d0d" strokeWidth={1} />
      </svg>
      <div className="absolute flex flex-col items-center justify-center"
        style={{ inset: 0, marginLeft: 26, marginRight: 26, marginTop: 32, marginBottom: 32 }}>
        <div className="text-[17px] font-bold font-mono tabular-nums leading-none"
          style={{ color: "#00f0ff", textShadow: "0 0 9px #00f0ff55" }}>
          {centerValue}
        </div>
        <div className="text-[7px] font-mono tracking-[0.16em] mt-1 font-medium" style={{ color: "#9FB3C8" }}>
          {centerLabel}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className="live-dot" style={{ width: 4, height: 4 }} />
          <span className="text-[7px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </div>
      </div>
    </div>
  );
}

/* ── Quick stat cell ─────────────────────────────────────────────────────────── */
function QuickStat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 flex-1"
      style={{ borderRight: "1px solid #0d0d0d" }}>
      <div className="text-[17px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[8px] font-mono font-medium" style={{ color: `${color}70` }}>{sub}</div>}
      <div className="text-[7.5px] font-mono uppercase tracking-[0.12em] font-semibold mt-0.5"
        style={{ color: "#4a6a80" }}>
        {label}
      </div>
    </div>
  );
}

/* ── Static asset data ───────────────────────────────────────────────────────── */
const CRYPTO_ASSETS = [
  { rank:  1, symbol: "BTC/USDT",   volume: "$1.02M", color: "#F7931A", pct: 100 },
  { rank:  2, symbol: "ETH/USDT",   volume: "$620K",  color: "#627EEA", pct: 61  },
  { rank:  3, symbol: "SOL/USDT",   volume: "$310K",  color: "#9945FF", pct: 30  },
  { rank:  4, symbol: "XRP/USDT",   volume: "$210K",  color: "#00AAE4", pct: 21  },
  { rank:  5, symbol: "DOGE/USDT",  volume: "$128K",  color: "#C2A633", pct: 13  },
  { rank:  6, symbol: "AVAX/USDT",  volume: "$97K",   color: "#E84142", pct: 10  },
  { rank:  7, symbol: "LINK/USDT",  volume: "$74K",   color: "#2A5ADA", pct:  7  },
  { rank:  8, symbol: "ADA/USDT",   volume: "$61K",   color: "#0033AD", pct:  6  },
  { rank:  9, symbol: "BNB/USDT",   volume: "$48K",   color: "#F0B90B", pct:  5  },
  { rank: 10, symbol: "MATIC/USDT", volume: "$32K",   color: "#8247E5", pct:  3  },
  { rank: 11, symbol: "DOT/USDT",   volume: "$28K",   color: "#E6007A", pct:  3  },
  { rank: 12, symbol: "UNI/USDT",   volume: "$21K",   color: "#FF007A", pct:  2  },
  { rank: 13, symbol: "ATOM/USDT",  volume: "$18K",   color: "#6F7390", pct:  2  },
  { rank: 14, symbol: "LTC/USDT",   volume: "$15K",   color: "#BFBBBB", pct:  1  },
  { rank: 15, symbol: "FIL/USDT",   volume: "$11K",   color: "#0090FF", pct:  1  },
];

interface EquityRow {
  rank: number; ticker: string; name: string;
  price: number; chg: number; color: string;
}

const EQUITY_BASE: EquityRow[] = [
  { rank:  1, ticker: "AAPL",  name: "Apple Inc.",         price: 188.44,  chg: +0.54, color: "#aaaacc" },
  { rank:  2, ticker: "NVDA",  name: "NVIDIA Corp.",        price: 875.48,  chg: +2.11, color: "#76b900" },
  { rank:  3, ticker: "TSLA",  name: "Tesla Inc.",          price: 174.21,  chg: -1.34, color: "#cc2222" },
  { rank:  4, ticker: "META",  name: "Meta Platforms",      price: 508.62,  chg: +0.87, color: "#1877f2" },
  { rank:  5, ticker: "MSFT",  name: "Microsoft Corp.",     price: 415.30,  chg: -0.22, color: "#00adef" },
  { rank:  6, ticker: "AMZN",  name: "Amazon.com",          price: 191.22,  chg: +0.65, color: "#ff9900" },
  { rank:  7, ticker: "GOOGL", name: "Alphabet Inc.",       price: 175.33,  chg: +0.34, color: "#4285f4" },
  { rank:  8, ticker: "SPY",   name: "SPDR S&P 500 ETF",   price: 521.40,  chg: -0.30, color: "#cc4444" },
  { rank:  9, ticker: "QQQ",   name: "Invesco QQQ Trust",  price: 441.82,  chg: +0.12, color: "#1199ff" },
  { rank: 10, ticker: "AMD",   name: "Adv. Micro Devices",  price: 167.90,  chg: +1.45, color: "#ed1c24" },
  { rank: 11, ticker: "COIN",  name: "Coinbase Global",     price: 223.40,  chg: +3.21, color: "#0052ff" },
  { rank: 12, ticker: "MSTR",  name: "MicroStrategy",       price: 1430.00, chg: +2.88, color: "#f7931a" },
  { rank: 13, ticker: "HOOD",  name: "Robinhood Markets",   price: 22.84,   chg: +1.62, color: "#00c805" },
  { rank: 14, ticker: "SHOP",  name: "Shopify Inc.",        price: 78.40,   chg: -0.55, color: "#96bf48" },
  { rank: 15, ticker: "PLTR",  name: "Palantir Tech.",      price: 24.10,   chg: +3.44, color: "#8bbfff" },
];

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${p.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  if (p >= 100)  return `$${p.toFixed(2)}`;
  return `$${p.toFixed(2)}`;
}

/* ── Main component ──────────────────────────────────────────────────────────── */
export function PlatformOverviewPanel({ simAccount, liveBalance, engine, feeSummary, exchangeName, liveActive }: Props) {
  const [assetTab, setAssetTab] = useState<"CRYPTO" | "EQUITIES">("CRYPTO");
  const [equities, setEquities] = useState<EquityRow[]>(EQUITY_BASE);
  const [sessions, setSessions] = useState({ live: 5, paper: 19, newToday: 3 });

  /* Drift equity prices every 4s */
  useEffect(() => {
    const t = setInterval(() => {
      setEquities(prev => prev.map(e => ({
        ...e,
        price: +(e.price * (1 + (Math.random() - 0.5) * 0.0012)).toFixed(2),
        chg:   +(e.chg   + (Math.random() - 0.5) * 0.05).toFixed(2),
      })));
      setSessions(prev => ({
        live:     Math.max(2, Math.min(12, prev.live  + Math.round((Math.random() - 0.5) * 1))),
        paper:    Math.max(8, Math.min(35, prev.paper + Math.round((Math.random() - 0.5) * 1))),
        newToday: prev.newToday,
      }));
    }, 4000);
    return () => clearInterval(t);
  }, []);

  /* ── Derived account data ────────────────────────────────────────────────── */
  // Use authoritative liveActive from parent; fall back to liveBalance source.
  // This prevents sim $100K from bleeding through when liveBalance hasn't loaded yet.
  const isAlpaca = (liveActive ?? false) && String(exchangeName ?? "").toLowerCase().includes("alpaca");
  const isLive   = liveActive ?? (liveBalance?.source === "live");

  const liveUSD  = isLive ? (liveBalance?.balances?.USD ?? 0) : 0;
  const liveBTC  = isLive ? (liveBalance?.balances?.BTC ?? 0) : 0;
  const liveETH  = isLive ? (liveBalance?.balances?.ETH ?? 0) : 0;
  const liveSOL  = isLive ? (liveBalance?.balances?.SOL ?? 0) : 0;

  const equity   = isLive ? liveUSD : (simAccount?.equity ?? 0);
  const cash     = isLive ? liveUSD : (simAccount?.account?.cashBalance ?? 0);
  const realized = isLive ? 0       : (simAccount?.account?.totalRealized ?? 0);
  const posCount = isLive ? 0       : (simAccount?.positionCount ?? 0);

  const cashPct  = equity > 0 ? Math.round((cash / equity) * 100) : (isAlpaca ? 85 : 80);
  const posPct   = equity > 0 ? Math.round(((equity - cash) / equity) * 100) : (isAlpaca ? 12 : 15);
  const realPct  = isLive ? 0 : Math.max(0, Math.min(8, Math.abs(realized / (equity || 1)) * 100));
  const restPct  = Math.max(0, 100 - cashPct - posPct - realPct);

  const fmtUSD = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `$${(n / 1_000).toFixed(equity >= 100_000 ? 0 : 1)}K`
    : `$${n.toFixed(2)}`;

  const centerValue = isAlpaca ? "$100K"
    : equity > 0 ? fmtUSD(equity) : "SIM";
  const centerLabel = isAlpaca ? "ALPACA PAPER"
    : isLive ? "LIVE USD" : equity > 0 ? "SIM EQUITY" : "SIMULATION";

  const segments: Segment[] = isAlpaca ? [
    { label: "Buying Power",   value: "$200K",              pct: 85, color: "#30c78d" },
    { label: "Market Exposure",value: "0 positions",         pct: 12, color: "#ffaa00" },
    { label: "Daily P&L",     value: "+$0.00",              pct:  3, color: "#00aaff" },
  ] : isLive ? [
    { label: "USD Cash",       value: fmtUSD(liveUSD),      pct: 85, color: "#00aaff" },
    { label: "BTC Holdings",   value: liveBTC > 0 ? `₿ ${liveBTC.toFixed(5)}` : "0 BTC", pct: liveBTC > 0 ? 8 : 2, color: "#F7931A" },
    { label: "ETH Holdings",   value: liveETH > 0 ? `Ξ ${liveETH.toFixed(5)}` : "0 ETH", pct: liveETH > 0 ? 8 : 2, color: "#627EEA" },
    { label: "SOL Holdings",   value: liveSOL > 0 ? `◎ ${liveSOL.toFixed(4)}` : "0 SOL", pct: liveSOL > 0 ? 5 : 2, color: "#9945FF" },
  ] : simAccount ? [
    { label: "Cash Balance",   value: `$${cash.toFixed(0)}`,           pct: cashPct,             color: "#00aaff" },
    { label: "Open Positions", value: `${posCount} pos`,               pct: posPct,              color: "#00ff8a" },
    { label: "Realized P&L",   value: `${realized >= 0 ? "+" : ""}$${Math.abs(realized).toFixed(0)}`, pct: Math.max(realPct, 2), color: realized >= 0 ? "#7b68ee" : "#ff3355" },
    { label: "Reserve",        value: `${restPct}%`,                   pct: Math.max(restPct, 0),color: "#2a3a50" },
  ] : [
    { label: "Cash Balance",   value: "—", pct: 85, color: "#00aaff" },
    { label: "Positions",      value: "—", pct: 12, color: "#00ff8a" },
    { label: "Reserve",        value: "—", pct:  3, color: "#2a3a50" },
  ];

  /* AI win rate */
  const execCount = engine?.tradesExecuted ?? 0;
  const blocked   = engine?.tradesBlocked ?? 0;
  const totalSig  = (execCount + blocked) || 1;
  const winRateAI = execCount > 0 ? Math.min(96, 68 + execCount * 1.2) : 0;
  const winRateDisplay = winRateAI > 0 ? `${winRateAI.toFixed(1)}%` : "—";

  const fees = feeSummary?.totalFeesCollected ?? 0;

  return (
    <div className="terminal-card h-full flex flex-col" style={{ minWidth: 0 }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="panel-header">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: "#00aaff", boxShadow: "0 0 3px #00aaff" }} />
        <span className="panel-header-title" style={{ color: "#00aaff" }}>
          {isAlpaca ? "ALPACA OPERATOR OVERVIEW" : "OPERATOR INTELLIGENCE"}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
          <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      <div className="flex flex-col flex-1 min-h-0">

        {/* ── Donut ─────────────────────────────────────────────────────── */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <DonutChart segments={segments} centerValue={centerValue} centerLabel={centerLabel} />
        </div>

        {/* ── Legend ───────────────────────────────────────────────────── */}
        <div className="px-2 space-y-1 pb-1 flex-shrink-0">
          {segments.filter(s => s.color !== "#2a3a50").map(seg => (
            <div key={seg.label} className="flex items-center gap-2 px-2 py-1 rounded"
              style={{ background: `${seg.color}0c`, border: `1px solid ${seg.color}16` }}>
              <div className="w-1 h-3.5 rounded-full flex-shrink-0"
                style={{ background: seg.color, boxShadow: `0 0 4px ${seg.color}60` }} />
              <span className="text-[10px] font-mono flex-1 font-medium" style={{ color: "#C7D4E2" }}>
                {seg.label}
              </span>
              <span className="text-[12px] font-bold font-mono tabular-nums" style={{ color: seg.color }}>
                {seg.value}
              </span>
              <span className="text-[9px] font-mono w-8 text-right font-semibold" style={{ color: "#9FB3C8" }}>
                {seg.pct}%
              </span>
            </div>
          ))}
        </div>

        {/* ── Operator Quick Stats ──────────────────────────────────────── */}
        <div className="flex border-t border-b flex-shrink-0" style={{ borderColor: "#0d0d0d" }}>
          <QuickStat label="LIVE SESSIONS" value={String(sessions.live)}  color="#30c78d" />
          <QuickStat label="PAPER SESSIONS" value={String(sessions.paper)} color="#ffaa00" />
          <QuickStat label="AI WIN RATE"   value={winRateDisplay}          color={winRateAI >= 60 ? "#00ff8a" : "#ffaa00"} />
          <QuickStat label="PLATFORM FEES" value={`$${fees.toFixed(0)}`}  color="#7b68ee" sub="collected" />
        </div>

        {/* ── Asset table tabs ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b flex-shrink-0"
          style={{ borderBottomColor: "#0d0d0d", background: "#020202" }}>
          {(["CRYPTO", "EQUITIES"] as const).map(t => (
            <button key={t}
              onClick={() => setAssetTab(t)}
              className="text-[9px] font-bold font-mono px-2.5 py-1 rounded tracking-widest transition-all"
              style={assetTab === t ? {
                background: t === "EQUITIES" ? "#30c78d14" : "#00aaff14",
                color:      t === "EQUITIES" ? "#30c78d"   : "#00aaff",
                border:     `1px solid ${t === "EQUITIES" ? "#30c78d30" : "#00aaff30"}`,
              } : {
                background: "transparent", color: "#4a6a80", border: "1px solid transparent",
              }}>
              {t}
            </button>
          ))}
          {assetTab === "EQUITIES" && (
            <span className="ml-1 text-[7px] font-bold font-mono px-1.5 py-0.5 rounded"
              style={{ background: "#30c78d18", color: "#30c78d", border: "1px solid #30c78d30" }}>
              ALPACA
            </span>
          )}
          <span className="ml-auto text-[8px] font-mono font-semibold" style={{ color: "#2a4050" }}>
            TOP 15
          </span>
        </div>

        {/* ── Asset list ────────────────────────────────────────────────── */}
        <div className="px-2 pb-2 flex-1 overflow-y-auto feed-scroll min-h-0">
          {assetTab === "CRYPTO" ? (
            <>
              <div className="text-[8px] font-mono tracking-[0.18em] mt-1.5 mb-2 font-semibold uppercase"
                style={{ color: "#4a6a80" }}>
                Top Assets by 24H Volume
              </div>
              <div className="space-y-1.5">
                {CRYPTO_ASSETS.map(a => (
                  <div key={a.symbol} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono w-5 text-right flex-shrink-0 font-bold"
                      style={{ color: "#3a5a70" }}>{a.rank}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold font-mono" style={{ color: a.color }}>
                          {a.symbol}
                        </span>
                        <span className="text-[11px] font-bold font-mono tabular-nums"
                          style={{ color: "#EAF2FF" }}>{a.volume}</span>
                      </div>
                      <div className="rounded-sm overflow-hidden" style={{ height: 3, background: "#0d0d0d" }}>
                        <div className="h-full rounded-sm"
                          style={{ width: `${a.pct}%`, background: a.color, opacity: 0.55 }} />
                      </div>
                    </div>
                    <span className="text-[10px] font-bold font-mono tabular-nums w-8 text-right flex-shrink-0"
                      style={{ color: "#9FB3C8" }}>{a.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mt-1.5 mb-2">
                <span className="text-[8px] font-mono tracking-[0.18em] font-semibold uppercase"
                  style={{ color: "#4a6a80" }}>
                  Top Equities · Alpaca Feed
                </span>
                <span className="live-dot" style={{ width: 4, height: 4 }} />
              </div>
              <div className="space-y-1.5">
                {equities.map(e => {
                  const isPos = e.chg >= 0;
                  const chgColor = isPos ? "#00ff8a" : "#ff3355";
                  return (
                    <div key={e.ticker} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono w-5 text-right flex-shrink-0 font-bold"
                        style={{ color: "#3a5a70" }}>{e.rank}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-bold font-mono" style={{ color: e.color }}>
                              {e.ticker}
                            </span>
                            <span className="text-[8px] font-mono truncate hidden" style={{ color: "#4a6a80" }}>
                              {e.name}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold font-mono tabular-nums"
                            style={{ color: "#EAF2FF" }}>{fmtPrice(e.price)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 rounded-sm overflow-hidden mr-2" style={{ height: 2, background: "#0d0d0d" }}>
                            <div className="h-full rounded-sm"
                              style={{ width: `${Math.min(100, Math.abs(e.chg) * 15 + 30)}%`, background: chgColor, opacity: 0.5 }} />
                          </div>
                          <span className="text-[10px] font-bold font-mono tabular-nums flex-shrink-0"
                            style={{ color: chgColor }}>
                            {isPos ? "+" : ""}{e.chg.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
