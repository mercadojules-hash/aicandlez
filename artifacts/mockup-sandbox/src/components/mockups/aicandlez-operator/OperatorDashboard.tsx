import {
  LayoutDashboard,
  Radio,
  Cpu,
  Flame,
  Star,
  Wallet,
  ListOrdered,
  FileText,
  ShieldCheck,
  LineChart,
  Globe2,
  Newspaper,
  Bell,
  TrendingUp,
  Settings,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Circle,
  Zap,
} from "lucide-react";

const BRAND = "#7CFF00";
const EMERALD = "#00C853";
const RED = "#FF3B3B";
const RED_SOFT = "#FF6B6B";
const HAIR = "rgba(124,255,0,0.10)";
const HAIR_STRONG = "rgba(124,255,0,0.18)";
const BG_0 = "#000000";
const BG_1 = "#050A07";
const BG_2 = "#0A1410";
const BG_3 = "#0F1F18";
const TXT_MUTED = "rgba(255,255,255,0.65)";
const TXT_DIM = "rgba(255,255,255,0.40)";

type Spark = number[];
type Signal = {
  symbol: string;
  klass: "CRYPTO" | "EQUITY";
  dir: "LONG" | "SHORT";
  price: string;
  chg: number;
  vol: string;
  conf: number;
  spark: Spark;
  mtf: ("g" | "a" | "r")[];
  rr: number;
  entry: string;
  sl: string;
  tp: string;
};

const sp = (seed: number, dir: 1 | -1 = 1): Spark => {
  const out: number[] = [];
  let v = 50 + (seed % 10);
  for (let i = 0; i < 48; i++) {
    const n = Math.sin(i / 3 + seed) * 6 + Math.cos(i / 1.7 + seed * 0.7) * 3;
    v += n * 0.4 + dir * 0.35 + (Math.sin(i * 0.9 + seed) > 0.6 ? 1.2 : -0.4);
    out.push(v);
  }
  return out;
};

const SIGNALS: Signal[] = [
  { symbol: "BTC",  klass: "CRYPTO", dir: "LONG",  price: "67,482.10", chg:  1.82, vol: "$48.7M", conf: 91, spark: sp(1, 1),  mtf: ["g","g","g"], rr: 2.8, entry: "67,210", sl: "66,640", tp: "68,820" },
  { symbol: "ETH",  klass: "CRYPTO", dir: "LONG",  price:  "3,584.22", chg:  2.41, vol: "$22.1M", conf: 87, spark: sp(2, 1),  mtf: ["g","g","a"], rr: 2.4, entry:  "3,562", sl:  "3,512", tp:  "3,694" },
  { symbol: "SOL",  klass: "CRYPTO", dir: "SHORT", price:    "182.44", chg: -1.94, vol: "$12.4M", conf: 84, spark: sp(3,-1), mtf: ["r","r","a"], rr: 2.2, entry:    "182.8", sl:    "186.1", tp:    "175.4" },
  { symbol: "NVDA", klass: "EQUITY", dir: "LONG",  price:    "138.62", chg:  0.94, vol:  "$8.2M", conf: 82, spark: sp(4, 1),  mtf: ["g","a","g"], rr: 2.6, entry:    "138.2", sl:    "136.5", tp:    "142.1" },
  { symbol: "XRP",  klass: "CRYPTO", dir: "LONG",  price:      "0.6128", chg:  3.12, vol:  "$6.1M", conf: 79, spark: sp(5, 1),  mtf: ["g","g","g"], rr: 2.1, entry:    "0.6112", sl:    "0.6028", tp:    "0.6310" },
  { symbol: "ARB",  klass: "CRYPTO", dir: "LONG",  price:      "0.8412", chg:  4.18, vol:  "$5.2M", conf: 88, spark: sp(6, 1),  mtf: ["g","g","g"], rr: 2.9, entry:    "0.8392", sl:    "0.8214", tp:    "0.8915" },
  { symbol: "AVAX", klass: "CRYPTO", dir: "SHORT", price:     "32.18", chg: -2.21, vol:  "$4.8M", conf: 76, spark: sp(7,-1), mtf: ["r","a","r"], rr: 2.0, entry:     "32.30", sl:     "33.12", tp:     "30.40" },
  { symbol: "LINK", klass: "CRYPTO", dir: "LONG",  price:     "14.87", chg:  1.42, vol:  "$3.9M", conf: 74, spark: sp(8, 1),  mtf: ["g","a","g"], rr: 2.3, entry:     "14.82", sl:     "14.48", tp:     "15.62" },
  { symbol: "DOGE", klass: "CRYPTO", dir: "SHORT", price:      "0.1284", chg: -1.06, vol:  "$3.4M", conf: 68, spark: sp(9,-1), mtf: ["a","r","r"], rr: 1.9, entry:    "0.1288", sl:    "0.1320", tp:    "0.1220" },
  { symbol: "POL",  klass: "CRYPTO", dir: "LONG",  price:      "0.4912", chg:  2.84, vol:  "$2.8M", conf: 81, spark: sp(10,1), mtf: ["g","g","a"], rr: 2.5, entry:    "0.4898", sl:    "0.4810", tp:    "0.5120" },
  { symbol: "OP",   klass: "CRYPTO", dir: "LONG",  price:      "1.7842", chg:  3.42, vol:  "$2.4M", conf: 77, spark: sp(11,1), mtf: ["g","g","g"], rr: 2.4, entry:    "1.7780", sl:    "1.7420", tp:    "1.8620" },
  { symbol: "ATOM", klass: "CRYPTO", dir: "SHORT", price:      "6.412", chg: -1.78, vol:  "$1.9M", conf: 72, spark: sp(12,-1),mtf: ["r","a","r"], rr: 2.0, entry:    "6.420", sl:    "6.602", tp:    "6.082" },
  { symbol: "APT",  klass: "CRYPTO", dir: "LONG",  price:      "8.214", chg:  2.12, vol:  "$1.7M", conf: 74, spark: sp(13,1), mtf: ["g","a","g"], rr: 2.3, entry:    "8.198", sl:    "8.044", tp:    "8.520" },
  { symbol: "NEAR", klass: "CRYPTO", dir: "LONG",  price:      "5.412", chg:  1.62, vol:  "$1.6M", conf: 71, spark: sp(14,1), mtf: ["g","g","a"], rr: 2.2, entry:    "5.402", sl:    "5.288", tp:    "5.620" },
  { symbol: "WIF",  klass: "CRYPTO", dir: "SHORT", price:      "1.842", chg: -3.18, vol:  "$1.5M", conf: 69, spark: sp(15,-1),mtf: ["r","r","a"], rr: 1.8, entry:    "1.848", sl:    "1.912", tp:    "1.712" },
  { symbol: "PEPE", klass: "CRYPTO", dir: "LONG",  price: "0.00001284", chg:  5.42, vol:  "$1.4M", conf: 78, spark: sp(16,1), mtf: ["g","g","g"], rr: 2.7, entry: "0.00001270", sl: "0.00001212", tp: "0.00001420" },
  { symbol: "FIL",  klass: "CRYPTO", dir: "LONG",  price:      "4.728", chg:  0.84, vol:  "$1.2M", conf: 66, spark: sp(17,1), mtf: ["g","a","a"], rr: 2.1, entry:    "4.720", sl:    "4.622", tp:    "4.910" },
  { symbol: "AAPL", klass: "EQUITY", dir: "SHORT", price:    "228.42", chg: -0.62, vol:  "$1.2M", conf: 65, spark: sp(18,-1),mtf: ["r","a","a"], rr: 1.9, entry:    "228.7", sl:    "231.0", tp:    "223.4" },
];

const TOP_MOVERS = [
  { sym: "PEPE", chg:  5.42 },
  { sym: "ARB",  chg:  4.18 },
  { sym: "OP",   chg:  3.42 },
  { sym: "XRP",  chg:  3.12 },
  { sym: "WIF",  chg: -3.18 },
  { sym: "AVAX", chg: -2.21 },
  { sym: "SOL",  chg: -1.94 },
  { sym: "ATOM", chg: -1.78 },
];

const REASONING = [
  { ts: "14:22:08", text: "BTC funding flipped negative on Binance perps — LONG bias confirmed, executor armed @ 67,210." },
  { ts: "14:21:42", text: "SOL — momentum decay on 15m, structural lower-high. Opened SHORT 0.42 BTC notional." },
  { ts: "14:20:55", text: "Risk gate: AVAX vol expansion above 4.2σ. Reducing size to 0.5x baseline." },
  { ts: "14:19:31", text: "ARB L2 rotation volume +218% vs 30d avg. Upgraded conviction 79 → 88." },
];

const EXCHANGES = [
  { name: "Kraken",   lat:  42, ok: true,  ws: "WS",    fills: 18 },
  { name: "Coinbase", lat:  38, ok: true,  ws: "WS",    fills: 24 },
  { name: "Binance",  lat:  51, ok: true,  ws: "WS",    fills: 41 },
  { name: "Bybit",    lat:  47, ok: true,  ws: "WS",    fills:  9 },
  { name: "OKX",      lat: 112, ok: false, ws: "REST",  fills:  3 },
];

const NAV = [
  { label: "Dashboard",          icon: LayoutDashboard },
  { label: "Live Trading",       icon: Radio },
  { label: "AI Engine",          icon: Cpu },
  { label: "Top Opportunities",  icon: Flame, active: true },
  { label: "Watchlist",          icon: Star },
  { label: "Positions",          icon: Wallet },
  { label: "Orders",             icon: ListOrdered },
  { label: "Paper Trading",      icon: FileText },
  { label: "Risk Management",    icon: ShieldCheck },
  { label: "AI Analytics",       icon: LineChart },
  { label: "Market Intelligence",icon: Globe2 },
  { label: "News & Sentiment",   icon: Newspaper },
  { label: "Alerts",             icon: Bell },
  { label: "Performance",        icon: TrendingUp },
  { label: "Settings",           icon: Settings },
];

// ─── small visual atoms ────────────────────────────────────────────────────────

function Sparkline({ data, dir }: { data: Spark; dir: "LONG" | "SHORT" }) {
  const w = 240;
  const h = 44;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  const color = dir === "LONG" ? BRAND : RED_SOFT;
  const fillId = `f-${dir}-${data[0].toFixed(2).replace(".","")}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${fillId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.25" />
    </svg>
  );
}

function ConfRing({ value, dir }: { value: number; dir: "LONG" | "SHORT" }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  const color = dir === "LONG" ? BRAND : RED_SOFT;
  return (
    <div className="relative" style={{ width: 44, height: 44 }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="22" cy="22" r={r}
          fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums" style={{ color: "white" }}>
        {value}
      </div>
    </div>
  );
}

function MtfDots({ mtf }: { mtf: ("g" | "a" | "r")[] }) {
  const labels = ["5m", "15m", "1H"];
  const c = (k: string) => (k === "g" ? BRAND : k === "r" ? RED_SOFT : "#E2C800");
  return (
    <div className="flex items-center gap-2">
      {mtf.map((k, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: TXT_DIM }}>{labels[i]}</span>
          <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: c(k), boxShadow: `0 0 6px ${c(k)}` }} />
        </div>
      ))}
    </div>
  );
}

function Pill({ children, color, bg, border }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.14em] rounded-sm"
      style={{ color, background: bg, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}

// ─── signal card ───────────────────────────────────────────────────────────────

function SignalCard({ s }: { s: Signal }) {
  const isLong = s.dir === "LONG";
  const accent = isLong ? BRAND : RED_SOFT;
  const chgColor = s.chg >= 0 ? BRAND : RED_SOFT;
  return (
    <div
      className="relative flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${BG_2} 0%, ${BG_1} 100%)`,
        border: `1px solid ${HAIR}`,
        borderLeft: `2px solid ${accent}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.02)`,
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold tracking-tight text-white">{s.symbol}</span>
          <Pill
            color={s.klass === "CRYPTO" ? BRAND : "#9FD8FF"}
            bg={s.klass === "CRYPTO" ? "rgba(124,255,0,0.06)" : "rgba(159,216,255,0.06)"}
            border={s.klass === "CRYPTO" ? HAIR_STRONG : "rgba(159,216,255,0.18)"}
          >
            {s.klass}
          </Pill>
        </div>
        <Pill color={accent} bg={isLong ? "rgba(124,255,0,0.08)" : "rgba(255,107,107,0.08)"} border={isLong ? HAIR_STRONG : "rgba(255,107,107,0.22)"}>
          <span className="flex items-center gap-1">
            {isLong ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
            {s.dir}
          </span>
        </Pill>
      </div>

      {/* price */}
      <div className="px-3 flex items-baseline justify-between">
        <span className="text-[20px] font-semibold tracking-tight text-white tabular-nums">{s.price}</span>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: chgColor }}>
          {s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%
        </span>
      </div>

      {/* sparkline */}
      <div className="px-2 pt-1.5">
        <Sparkline data={s.spark} dir={s.dir} />
      </div>

      {/* conf + MTF */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: `1px solid ${HAIR}` }}>
        <div className="flex items-center gap-2">
          <ConfRing value={s.conf} dir={s.dir} />
          <div className="flex flex-col leading-tight">
            <span className="text-[8px] uppercase tracking-[0.16em]" style={{ color: TXT_DIM }}>Conf</span>
            <span className="text-[10px] font-medium" style={{ color: TXT_MUTED }}>{s.conf}/100</span>
          </div>
        </div>
        <MtfDots mtf={s.mtf} />
      </div>

      {/* footer */}
      <div className="px-3 py-2 grid grid-cols-3 gap-1 text-[9px]" style={{ borderTop: `1px solid ${HAIR}`, background: "rgba(0,0,0,0.25)" }}>
        <div className="flex flex-col">
          <span className="uppercase tracking-[0.14em]" style={{ color: TXT_DIM }}>Vol</span>
          <span className="text-white tabular-nums">{s.vol}</span>
        </div>
        <div className="flex flex-col">
          <span className="uppercase tracking-[0.14em]" style={{ color: TXT_DIM }}>RR</span>
          <span className="text-white tabular-nums">{s.rr.toFixed(1)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="uppercase tracking-[0.14em]" style={{ color: TXT_DIM }}>Entry</span>
          <span className="text-white tabular-nums">{s.entry}</span>
        </div>
        <div className="flex flex-col">
          <span className="uppercase tracking-[0.14em]" style={{ color: RED_SOFT, opacity: 0.7 }}>SL</span>
          <span className="text-white tabular-nums">{s.sl}</span>
        </div>
        <div className="flex flex-col">
          <span className="uppercase tracking-[0.14em]" style={{ color: BRAND, opacity: 0.7 }}>TP</span>
          <span className="text-white tabular-nums">{s.tp}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="uppercase tracking-[0.14em]" style={{ color: TXT_DIM }}>Edge</span>
          <span className="tabular-nums" style={{ color: accent }}>+{(s.conf * 0.018).toFixed(2)}σ</span>
        </div>
      </div>
    </div>
  );
}

// ─── right panels ──────────────────────────────────────────────────────────────

function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
      <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: TXT_MUTED }}>{title}</span>
      {right}
    </div>
  );
}

function TopMovers() {
  return (
    <div style={{ background: BG_2, border: `1px solid ${HAIR}` }}>
      <PanelHeader title="Top Movers · 1H" right={<span className="text-[9px] tabular-nums" style={{ color: TXT_DIM }}>n=24</span>} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2.5">
        {TOP_MOVERS.map((m) => {
          const up = m.chg >= 0;
          return (
            <div key={m.sym} className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-white">{m.sym}</span>
              <span className="tabular-nums" style={{ color: up ? BRAND : RED_SOFT }}>
                {up ? "+" : ""}{m.chg.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AIReasoning() {
  return (
    <div style={{ background: BG_2, border: `1px solid ${HAIR}` }}>
      <PanelHeader
        title="AI Reasoning"
        right={
          <span className="flex items-center gap-1.5 text-[9px]" style={{ color: BRAND }}>
            <span className="inline-block rounded-full animate-pulse" style={{ width: 6, height: 6, background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
            STREAM
          </span>
        }
      />
      <div className="px-3 py-2 space-y-2.5">
        {REASONING.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-[9px] tabular-nums shrink-0 pt-0.5" style={{ color: TXT_DIM }}>{r.ts}</span>
            <p className="text-[11px] leading-snug" style={{ color: TXT_MUTED }}>{r.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskHeatmap() {
  const labels = ["BTC","ETH","SOL","ARB","NVDA","XRP","AVAX","LINK","DOGE","OP","POL","WIF"];
  const seed = (i: number) => {
    const v = (Math.sin(i * 1.7) * 50 + 50);
    return v;
  };
  const cell = (v: number) => {
    if (v > 70) return RED;
    if (v > 55) return RED_SOFT;
    if (v > 40) return "#E2C800";
    if (v > 25) return EMERALD;
    return BRAND;
  };
  return (
    <div style={{ background: BG_2, border: `1px solid ${HAIR}` }}>
      <PanelHeader title="Risk Heatmap · 24h VaR" right={<span className="text-[9px]" style={{ color: TXT_DIM }}>$ at risk</span>} />
      <div className="grid grid-cols-4 gap-[3px] p-3">
        {labels.map((l, i) => {
          const v = seed(i);
          return (
            <div
              key={l}
              className="flex flex-col items-center justify-center py-2"
              style={{
                background: `${cell(v)}26`,
                border: `1px solid ${cell(v)}55`,
              }}
            >
              <span className="text-[10px] font-semibold text-white">{l}</span>
              <span className="text-[9px] tabular-nums" style={{ color: TXT_MUTED }}>{v.toFixed(0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExchangeTopology() {
  return (
    <div style={{ background: BG_2, border: `1px solid ${HAIR}` }}>
      <PanelHeader title="Exchange Topology" right={<span className="text-[9px]" style={{ color: TXT_DIM }}>5 venues</span>} />
      <div className="px-3 py-2 space-y-1.5">
        {EXCHANGES.map((e) => (
          <div key={e.name} className="grid grid-cols-12 items-center text-[10px] gap-2">
            <div className="col-span-1">
              <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: e.ok ? BRAND : RED, boxShadow: `0 0 6px ${e.ok ? BRAND : RED}` }} />
            </div>
            <span className="col-span-4 text-white font-medium">{e.name}</span>
            <span className="col-span-2 text-center tabular-nums" style={{ color: TXT_MUTED }}>{e.ws}</span>
            <span className="col-span-2 text-right tabular-nums" style={{ color: e.lat > 80 ? RED_SOFT : TXT_MUTED }}>{e.lat}ms</span>
            <span className="col-span-3 text-right tabular-nums" style={{ color: TXT_MUTED }}>{e.fills} fills</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside
      className="flex flex-col shrink-0"
      style={{ width: 228, background: BG_1, borderRight: `1px solid ${HAIR}` }}
    >
      {/* logo */}
      <div className="px-4 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
        <div className="relative flex items-center justify-center" style={{ width: 26, height: 26 }}>
          <div className="absolute inset-0 rounded-sm" style={{ background: `${BRAND}22`, border: `1px solid ${HAIR_STRONG}` }} />
          <Zap size={14} style={{ color: BRAND }} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-bold tracking-tight text-white">AICandlez</span>
          <span className="text-[8px] uppercase tracking-[0.22em]" style={{ color: BRAND }}>Operator</span>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-[2px]">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = n.active;
          return (
            <div
              key={n.label}
              className="relative flex items-center gap-2.5 px-2.5 py-[7px] cursor-default"
              style={{
                background: active ? "rgba(124,255,0,0.06)" : "transparent",
                borderLeft: active ? `2px solid ${BRAND}` : `2px solid transparent`,
                boxShadow: active ? `inset 0 0 12px rgba(124,255,0,0.10)` : "none",
              }}
            >
              <Icon size={13} style={{ color: active ? BRAND : TXT_MUTED }} />
              <span className="text-[11.5px]" style={{ color: active ? "white" : TXT_MUTED, fontWeight: active ? 600 : 400 }}>
                {n.label}
              </span>
            </div>
          );
        })}
      </nav>

      {/* engine status */}
      <div className="m-2 p-2.5" style={{ background: BG_3, border: `1px solid ${HAIR_STRONG}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block rounded-full animate-pulse" style={{ width: 7, height: 7, background: BRAND, boxShadow: `0 0 8px ${BRAND}` }} />
            <span className="text-[9px] uppercase tracking-[0.18em] font-semibold" style={{ color: BRAND }}>Engine Active</span>
          </div>
          <Activity size={11} style={{ color: BRAND }} />
        </div>
        <div className="grid grid-cols-2 gap-y-1 text-[9.5px]">
          <span className="uppercase tracking-[0.12em]" style={{ color: TXT_DIM }}>Uptime</span>
          <span className="text-right tabular-nums text-white">42d 11h</span>
          <span className="uppercase tracking-[0.12em]" style={{ color: TXT_DIM }}>Sym/sec</span>
          <span className="text-right tabular-nums text-white">187</span>
          <span className="uppercase tracking-[0.12em]" style={{ color: TXT_DIM }}>Last tick</span>
          <span className="text-right tabular-nums text-white">14:22:09</span>
        </div>
      </div>
    </aside>
  );
}

// ─── top bar ───────────────────────────────────────────────────────────────────

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 h-full" style={{ borderRight: `1px solid ${HAIR}` }}>
      <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: TXT_DIM }}>{label}</span>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: color || "white" }}>{value}</span>
    </div>
  );
}

function TopBar() {
  return (
    <div
      className="h-10 flex items-center justify-between shrink-0"
      style={{ background: BG_1, borderBottom: `1px solid ${HAIR}` }}
    >
      <div className="flex items-center h-full">
        <div className="flex items-center gap-1.5 px-3 h-full" style={{ borderRight: `1px solid ${HAIR}` }}>
          <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: TXT_DIM }}>Engine</span>
          <span className="inline-block rounded-full animate-pulse" style={{ width: 6, height: 6, background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
          <span className="text-[11px] font-semibold" style={{ color: BRAND }}>ACTIVE</span>
        </div>
        <Kpi label="Open Live" value="3 / 3" />
        <Kpi label="Sig/min" value="14.2" />
        <Kpi label="BTC" value="$67,482" color={BRAND} />
        <Kpi label="ETH" value="$3,584" color={BRAND} />
        <Kpi label="SOL" value="$182.44" color={RED_SOFT} />
        <Kpi label="Vol 24h" value="$2.41B" />
        <Kpi label="Global P&L" value="+$8,412.20" color={BRAND} />
      </div>
      <div className="flex items-center gap-3 px-4 h-full">
        <span className="text-[10px] tabular-nums" style={{ color: TXT_DIM }}>2024-11-14  14:22:09 UTC</span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: BRAND }}>
          <Circle size={6} fill={BRAND} stroke="none" /> LIVE
        </span>
      </div>
    </div>
  );
}

// ─── bottom status bar ─────────────────────────────────────────────────────────

function BottomStatus() {
  const Seg = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex items-center gap-1.5 px-3 h-full" style={{ borderRight: `1px solid ${HAIR}` }}>
      <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: TXT_DIM }}>{label}</span>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: color || "white" }}>{value}</span>
    </div>
  );
  return (
    <div
      className="h-9 flex items-center shrink-0"
      style={{ background: BG_1, borderTop: `1px solid ${HAIR_STRONG}` }}
    >
      <div className="flex items-center gap-2 px-3 h-full" style={{ borderRight: `1px solid ${HAIR}` }}>
        <span className="inline-block rounded-full animate-pulse" style={{ width: 7, height: 7, background: BRAND, boxShadow: `0 0 8px ${BRAND}` }} />
        <span className="text-[10px] uppercase tracking-[0.22em] font-semibold" style={{ color: BRAND }}>AI Executor</span>
        <Pill color={BRAND} bg="rgba(124,255,0,0.08)" border={HAIR_STRONG}>LIVE</Pill>
      </div>
      <Seg label="Open" value="3" />
      <Seg label="Last Fill" value="BTC LONG +0.42%" color={BRAND} />
      <Seg label="Queue" value="0" />
      <Seg label="Latency" value="142ms" />
      <Seg label="Slippage" value="0.04%" />
      <Seg label="Fees 24h" value="$184.20" />
      <Seg label="Risk Budget" value="62%" color={BRAND} />
      <div className="flex-1" />
      <div className="px-4 flex items-center gap-3 h-full">
        <span className="text-[10px]" style={{ color: TXT_DIM }}>Build 2.14.7 · region us-east-1 · ws stable</span>
      </div>
    </div>
  );
}

// ─── root ──────────────────────────────────────────────────────────────────────

export default function OperatorDashboard() {
  return (
    <div
      className="flex flex-col"
      style={{
        height: "100vh",
        minHeight: 900,
        width: "100%",
        background: BG_0,
        color: "white",
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
        fontFeatureSettings: '"ss01","tnum"',
      }}
    >
      {/* subtle scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(124,255,0,0.015) 0px, rgba(124,255,0,0.015) 1px, transparent 1px, transparent 3px)",
        }}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar />

        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />

          <div className="flex flex-1 min-h-0">
            {/* center grid */}
            <div className="flex-1 overflow-y-auto p-3" style={{ background: BG_0 }}>
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <Flame size={13} style={{ color: BRAND }} />
                  <span className="text-[11px] uppercase tracking-[0.20em] font-semibold text-white">Top Opportunities</span>
                  <span className="text-[10px]" style={{ color: TXT_DIM }}>· ranked by composite edge · live</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: TXT_MUTED }}>
                  <span>{SIGNALS.length} signals</span>
                  <span style={{ color: TXT_DIM }}>·</span>
                  <span>{SIGNALS.filter(s => s.dir === "LONG").length} LONG / {SIGNALS.filter(s => s.dir === "SHORT").length} SHORT</span>
                  <span style={{ color: TXT_DIM }}>·</span>
                  <span>{SIGNALS.filter(s => s.klass === "EQUITY").length} equity</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SIGNALS.map((s) => (
                  <SignalCard key={s.symbol} s={s} />
                ))}
              </div>
            </div>

            {/* right rail */}
            <aside
              className="shrink-0 overflow-y-auto p-3 space-y-3"
              style={{ width: 320, background: BG_1, borderLeft: `1px solid ${HAIR}` }}
            >
              <TopMovers />
              <AIReasoning />
              <RiskHeatmap />
              <ExchangeTopology />
            </aside>
          </div>

          <BottomStatus />
        </div>
      </div>
    </div>
  );
}
