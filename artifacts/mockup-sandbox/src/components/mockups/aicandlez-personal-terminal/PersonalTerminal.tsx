import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  Crosshair,
  Flame,
  Radio,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

const BRAND = "#66FF66";
const LIME = "#7CFF00";
const EMERALD = "#00C853";
const VIVID = "#39FF14";
const RED = "#FF3B3B";
const RED_SOFT = "#FF6B6B";
const BG_0 = "#000000";
const BG_1 = "#050A07";
const BG_2 = "#0A1410";
const BG_3 = "#0F1F18";
const HAIR_10 = "rgba(124,255,0,0.10)";
const HAIR_18 = "rgba(124,255,0,0.18)";
const HAIR_RED_18 = "rgba(255,59,59,0.18)";
const TXT_85 = "rgba(255,255,255,0.85)";
const TXT_65 = "rgba(255,255,255,0.65)";
const TXT_40 = "rgba(255,255,255,0.40)";
const TXT_25 = "rgba(255,255,255,0.22)";

type Dir = "LONG" | "SHORT";
type Signal = {
  sym: string;
  dir: Dir;
  reason: string;
  tag: string;
  price: string;
  changePct: number;
  conf: number;
  entry: string;
  sl: string;
  tp: string;
  rr: string;
  m5: "up" | "down" | "flat";
  m15: "up" | "down" | "flat";
  h1: "up" | "down" | "flat";
  spark: number[];
};

const LONGS: Signal[] = [
  { sym: "BTC",  dir: "LONG", reason: "BREAKOUT", tag: "MTF aligned · vol surge",   price: "$67,284.10", changePct: 1.92, conf: 91, entry: "67,210", sl: "66,420", tp: "69,180", rr: "2.4R", m5: "up", m15: "up", h1: "up",   spark: [10,11,11,13,12,14,15,14,17,18,20,22,24,26,28,30] },
  { sym: "SOL",  dir: "LONG", reason: "MOMENTUM", tag: "trend continuation",        price: "$172.65",    changePct: 2.27, conf: 87, entry: "171.80", sl: "168.10", tp: "181.40", rr: "2.6R", m5: "up", m15: "up", h1: "up",   spark: [9,10,10,11,12,13,14,13,15,17,18,19,20,22,23,24] },
  { sym: "ETH",  dir: "LONG", reason: "TREND",    tag: "higher highs · clean",       price: "$3,128.44",  changePct: 1.84, conf: 84, entry: "3,118",  sl: "3,070",  tp: "3,260",  rr: "2.0R", m5: "up", m15: "up", h1: "flat", spark: [6,7,7,8,9,8,10,11,12,11,13,14,15,16,17,18] },
  { sym: "INJ",  dir: "LONG", reason: "BREAKOUT", tag: "range expansion",            price: "$28.40",     changePct: 2.71, conf: 82, entry: "28.20",  sl: "27.40",  tp: "30.10",  rr: "2.3R", m5: "up", m15: "up", h1: "flat", spark: [9,10,10,11,12,11,12,13,14,15,16,17,18,19,20,21] },
  { sym: "AVAX", dir: "LONG", reason: "TREND",    tag: "demand zone hold",           price: "$39.27",     changePct: 1.89, conf: 80, entry: "39.10",  sl: "38.20",  tp: "41.40",  rr: "1.9R", m5: "up", m15: "flat","h1": "up", spark: [8,8,9,9,9,10,10,11,11,11,12,12,12,13,13,14] },
  { sym: "LINK", dir: "LONG", reason: "MOMENTUM", tag: "VWAP reclaim",               price: "$19.74",     changePct: 2.12, conf: 79, entry: "19.60",  sl: "19.10",  tp: "20.80",  rr: "2.1R", m5: "up", m15: "up", h1: "flat", spark: [11,11,12,11,12,12,12,12,13,13,13,14,14,14,15,15] },
  { sym: "TIA",  dir: "LONG", reason: "BREAKOUT", tag: "compression release",        price: "$7.82",      changePct: 2.76, conf: 77, entry: "7.78",   sl: "7.52",   tp: "8.40",   rr: "2.2R", m5: "up", m15: "flat","h1": "up", spark: [6,6,7,7,7,7,7,8,8,8,8,8,9,9,9,9] },
  { sym: "SUI",  dir: "LONG", reason: "TREND",    tag: "MA stack bullish",           price: "$2.16",      changePct: 2.37, conf: 76, entry: "2.15",   sl: "2.08",   tp: "2.31",   rr: "1.8R", m5: "up", m15: "up", h1: "flat", spark: [7,7,7,8,8,8,8,9,9,9,9,9,10,10,10,10] },
  { sym: "APT",  dir: "LONG", reason: "REVERSAL", tag: "bull div · RSI 38",          price: "$7.95",      changePct: 2.71, conf: 74, entry: "7.92",   sl: "7.66",   tp: "8.40",   rr: "1.7R", m5: "up", m15: "flat","h1": "flat", spark: [4,4,4,5,5,5,5,5,5,5,5,5,6,6,6,6] },
  { sym: "FET",  dir: "LONG", reason: "MOMENTUM", tag: "narrative bid",              price: "$1.348",     changePct: 3.85, conf: 73, entry: "1.342",  sl: "1.298",  tp: "1.440",  rr: "2.0R", m5: "up", m15: "up", h1: "flat", spark: [6,7,7,7,8,8,8,9,9,9,10,10,10,11,11,11] },
];

const SHORTS: Signal[] = [
  { sym: "WIF",   dir: "SHORT", reason: "DISTRIBUTION", tag: "topping pattern · vol", price: "$2.0840",      changePct: -4.93, conf: 87, entry: "2.0880",   sl: "2.1620", tp: "1.9120", rr: "2.4R", m5: "down", m15: "down", h1: "down", spark: [22,22,21,21,20,21,20,19,20,19,18,19,17,17,16,15] },
  { sym: "PEPE",  dir: "SHORT", reason: "MOMENTUM",     tag: "lower lows · MA cross", price: "$0.00000814",  changePct: -5.57, conf: 85, entry: "0.0000082","sl": "0.0000085", tp: "0.0000074", rr: "2.5R", m5: "down", m15: "down", h1: "down", spark: [24,23,23,22,22,22,21,20,21,20,19,19,18,17,16,15] },
  { sym: "BONK",  dir: "SHORT", reason: "REVERSAL",     tag: "exhaustion top",        price: "$0.00001921",  changePct: -7.11, conf: 83, entry: "0.0000193","sl": "0.0000201","tp": "0.0000172", rr: "2.6R", m5: "down", m15: "down", h1: "flat", spark: [21,20,20,19,19,19,18,18,18,17,17,16,16,15,15,14] },
  { sym: "SHIB",  dir: "SHORT", reason: "TREND",        tag: "channel breakdown",     price: "$0.00001784",  changePct: -3.36, conf: 81, entry: "0.0000179","sl": "0.0000185","tp": "0.0000164", rr: "2.0R", m5: "down", m15: "flat","h1": "down", spark: [19,18,18,18,17,17,17,16,16,16,15,15,14,14,14,13] },
  { sym: "DOGE",  dir: "SHORT", reason: "MOMENTUM",     tag: "rejection at supply",   price: "$0.1842",      changePct: -3.14, conf: 79, entry: "0.1848",   sl: "0.1902","tp": "0.1722","rr": "2.1R", m5: "down","m15": "down","h1": "flat", spark: [20,19,19,18,18,18,17,17,17,16,16,15,15,14,14,13] },
  { sym: "FLOKI", dir: "SHORT", reason: "REVERSAL",     tag: "MACD bearish cross",    price: "$0.0001624",   changePct: -5.14, conf: 78, entry: "0.000163", sl: "0.000170","tp": "0.000148","rr": "2.3R","m5": "down","m15": "down","h1": "flat", spark: [20,19,19,18,18,18,17,17,16,16,15,15,14,14,13,13] },
  { sym: "ORDI",  dir: "SHORT", reason: "TREND",        tag: "bear flag",             price: "$34.18",       changePct: -4.04, conf: 76, entry: "34.30",   sl: "35.40","tp": "31.80","rr": "2.1R","m5": "down","m15": "down","h1": "down", spark: [17,17,16,16,16,15,15,15,14,14,14,13,13,12,12,11] },
  { sym: "NEAR",  dir: "SHORT", reason: "MOMENTUM",     tag: "supply rejection",      price: "$6.28",        changePct: -2.06, conf: 74, entry: "6.30",    sl: "6.48","tp": "5.92","rr": "1.9R","m5": "down","m15": "flat","h1": "down", spark: [18,17,17,17,16,16,16,15,15,15,14,14,14,13,13,12] },
  { sym: "OP",    dir: "SHORT", reason: "TREND",        tag: "MTF bearish",           price: "$1.2747",      changePct: -3.05, conf: 73, entry: "1.278",   sl: "1.318","tp": "1.198","rr": "2.0R","m5": "down","m15": "down","h1": "flat", spark: [16,16,15,15,15,14,14,14,13,13,13,12,12,11,11,10] },
  { sym: "XRP",   dir: "SHORT", reason: "REVERSAL",     tag: "double top",            price: "$0.5184",      changePct: -1.93, conf: 71, entry: "0.520",   sl: "0.534","tp": "0.488","rr": "1.7R","m5": "down","m15": "flat","h1": "flat", spark: [10,10,10,10,9,9,9,9,9,8,8,8,8,7,7,7] },
];

const TICKERS = [
  { sym: "BTC",  price: "67,284", chg: +1.92 },
  { sym: "ETH",  price: "3,128",  chg: +1.84 },
  { sym: "SOL",  price: "172.65", chg: +2.27 },
  { sym: "AVAX", price: "39.27",  chg: +1.89 },
];

const CONVICTION_CHIPS = [
  { sym: "BTC",  dir: "LONG"  as Dir, val: 91 },
  { sym: "WIF",  dir: "SHORT" as Dir, val: 87 },
  { sym: "SOL",  dir: "LONG"  as Dir, val: 84 },
];

const POSITIONS = [
  { sym: "BTC", dir: "LONG"  as Dir, entry: "66,810", cur: "67,284", pnl: +1.42 },
  { sym: "SOL", dir: "LONG"  as Dir, entry: "168.40", cur: "172.65", pnl: +2.51 },
  { sym: "WIF", dir: "SHORT" as Dir, entry: "2.1820", cur: "2.0840", pnl: +4.49 },
];

const BALANCES = [
  { asset: "BTC",  qty: "1.842" },
  { asset: "ETH",  qty: "12.40" },
  { asset: "USDT", qty: "41,820" },
];

const FEED = [
  { t: "14:22:01", msg: "AI RAISED BTC CONVICTION  79→91",  dot: BRAND },
  { t: "14:21:18", msg: "EXECUTED  BTC LONG  @67,287",       dot: EMERALD },
  { t: "14:20:42", msg: "AI DETECTED  WIF SHORT SETUP",      dot: BRAND },
  { t: "14:19:09", msg: "RISK GATE  AVAX vol expansion",     dot: "#FFC83D" },
  { t: "14:17:51", msg: "AI RAISED SOL CONVICTION  76→84",   dot: BRAND },
];

const EQUITY_SPARK = [82,83,84,85,84,86,87,88,90,91,92,94,95,97,99,101,103,104,106,107,108];
const PULSE_WAVE = [40,42,38,46,44,50,48,54,52,58,55,62,60,66,64,70,68,72,69,74,71,76,73,78,75,80,76,82,78,84,80,86];

function Sparkline({
  data, color, w, h, strokeW = 1.8,
}: { data: number[]; color: string; w: number; h: number; strokeW?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  const gid = `spk-${color.replace("#", "")}-${Math.round(data[0] * 1000)}-${data.length}-${w}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.55" />
          <stop offset="60%" stopColor={color} stopOpacity="0.10" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ConvictionRing({
  value, color, size = 64,
}: { value: number; color: string; size?: number }) {
  const stroke = 4;
  const r = (size - stroke - 2) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  const glow = value >= 85 ? 14 : value >= 75 ? 8 : 3;
  return (
    <div className="relative" style={{ width: size, height: size, filter: `drop-shadow(0 0 ${glow}px ${color}AA)` }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 grid place-items-center" style={{ color }}>
        <div className="text-[15px] font-bold tabular-nums leading-none" style={{ letterSpacing: "-0.04em" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function MtfDot({ s, color }: { s: "up" | "down" | "flat"; color: string }) {
  const fill = s === "flat" ? "rgba(255,255,255,0.22)" : color;
  const glow = s === "flat" ? "none" : `0 0 6px ${color}`;
  return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: fill, boxShadow: glow }} />;
}

function SignalCard({ s, top }: { s: Signal; top?: boolean }) {
  const isLong = s.dir === "LONG";
  const color = isLong ? BRAND : RED;
  const colorSoft = isLong ? EMERALD : RED_SOFT;
  const tint = isLong ? "rgba(102,255,102,0.04)" : "rgba(255,59,59,0.035)";
  const borderCol = isLong ? "rgba(102,255,102,0.20)" : "rgba(255,59,59,0.24)";
  const topBorder = isLong ? "rgba(102,255,102,0.55)" : "rgba(255,59,59,0.55)";
  return (
    <div
      className="relative flex flex-col"
      style={{
        background: tint,
        border: `1px solid ${top ? topBorder : borderCol}`,
        boxShadow: top ? `0 0 0 1px ${color}22, 0 0 24px ${color}33 inset` : "none",
        animation: top ? "edgePulse 4s ease-in-out infinite" : undefined,
        transform: top ? "scale(1.005)" : undefined,
        transition: "all 180ms ease",
      }}
    >
      {/* ROW 1 — header */}
      <div className="flex items-center gap-2.5 px-3.5 pt-2.5">
        <div
          className="px-2 py-0.5 text-[10px] font-bold tracking-[0.16em]"
          style={{
            color,
            background: isLong ? "rgba(0,200,83,0.12)" : "rgba(255,59,59,0.10)",
            border: `1px solid ${color}66`,
            boxShadow: `0 0 8px ${color}55 inset`,
          }}
        >
          {s.dir}
        </div>
        <div className="text-[26px] font-bold leading-none text-white" style={{ letterSpacing: "-0.04em" }}>
          {s.sym}
        </div>
        <div className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: TXT_65 }}>
          {s.reason}
        </div>
        <div className="text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
          · {s.tag}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {top && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.18em]"
              style={{ color, border: `1px solid ${color}88`, background: `${color}14` }}
            >
              <Flame size={9} /> TOP SIGNAL
            </div>
          )}
        </div>
      </div>

      {/* ROW 2 — price + sparkline + ring */}
      <div className="flex items-center gap-3 px-3.5 pt-1.5">
        <div className="flex w-[120px] shrink-0 flex-col">
          <div className="text-[20px] font-bold tabular-nums text-white leading-none" style={{ letterSpacing: "-0.03em" }}>
            {s.price}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {isLong ? <TrendingUp size={11} style={{ color }} /> : <TrendingDown size={11} style={{ color }} />}
            <div className="text-[12px] font-bold tabular-nums" style={{ color }}>
              {s.changePct > 0 ? "+" : ""}{s.changePct.toFixed(2)}%
            </div>
            <div className="text-[9px] tracking-[0.14em]" style={{ color: TXT_40 }}>5M</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <Sparkline data={s.spark} color={color} w={260} h={52} strokeW={2} />
        </div>

        <div className="flex flex-col items-center gap-1">
          <ConvictionRing value={s.conf} color={color} size={62} />
          <div className="text-[8.5px] font-semibold tracking-[0.16em]" style={{ color: colorSoft }}>
            CONVICTION
          </div>
        </div>
      </div>

      {/* ROW 3 — micro plan */}
      <div className="mt-2 flex items-center gap-3 px-3.5 pb-2.5 pt-1.5" style={{ borderTop: `1px solid ${borderCol}` }}>
        <div className="flex items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
          ENTRY <span className="font-semibold tabular-nums" style={{ color: TXT_85 }}>{s.entry}</span>
        </div>
        <div className="flex items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
          SL <span className="font-semibold tabular-nums" style={{ color: RED_SOFT }}>{s.sl}</span>
        </div>
        <div className="flex items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
          TP <span className="font-semibold tabular-nums" style={{ color: BRAND }}>{s.tp}</span>
        </div>
        <div className="flex items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
          RR <span className="font-semibold tabular-nums" style={{ color: TXT_85 }}>{s.rr}</span>
        </div>
        <div className="ml-1 flex items-center gap-1.5">
          <span className="text-[8.5px] tracking-[0.14em]" style={{ color: TXT_40 }}>5m</span>
          <MtfDot s={s.m5} color={color} />
          <span className="ml-1 text-[8.5px] tracking-[0.14em]" style={{ color: TXT_40 }}>15m</span>
          <MtfDot s={s.m15} color={color} />
          <span className="ml-1 text-[8.5px] tracking-[0.14em]" style={{ color: TXT_40 }}>1H</span>
          <MtfDot s={s.h1} color={color} />
        </div>
        <button
          className="ml-auto flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-[0.18em]"
          style={{
            color: isLong ? BG_0 : "#fff",
            background: isLong ? color : "rgba(255,59,59,0.92)",
            border: `1px solid ${color}`,
            boxShadow: top ? `0 0 14px ${color}88` : `0 0 6px ${color}55`,
            transition: "all 180ms ease",
          }}
        >
          {isLong ? <Target size={11} strokeWidth={3} /> : <Crosshair size={11} strokeWidth={3} />}
          {isLong ? "BUY" : "SELL"}
        </button>
      </div>
    </div>
  );
}

function ConvictionChip({ sym, dir, val }: { sym: string; dir: Dir; val: number }) {
  const color = dir === "LONG" ? BRAND : RED;
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{
        background: dir === "LONG" ? "rgba(102,255,102,0.06)" : "rgba(255,59,59,0.06)",
        border: `1px solid ${color}55`,
        boxShadow: `0 0 14px ${color}33`,
      }}
    >
      <span className="text-[13px] font-bold text-white" style={{ letterSpacing: "-0.03em" }}>{sym}</span>
      <span className="text-[9.5px] font-bold tracking-[0.16em]" style={{ color }}>{dir}</span>
      <span className="text-[14px] font-bold tabular-nums" style={{ color, letterSpacing: "-0.03em" }}>{val}</span>
    </div>
  );
}

function MiniStat({ label, value, color = "#fff" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
      <div className="text-[8.5px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>{label}</div>
      <div className="text-[15px] font-bold tabular-nums" style={{ color, letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

export default function PersonalTerminal() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = now.toISOString().split("T")[1].split(".")[0] + " UTC";

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background: BG_0,
        color: "white",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
        fontFeatureSettings: '"tnum"',
      }}
    >
      {/* keyframes */}
      <style>{`
        @keyframes pulseOrb {
          0%,100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 14px ${BRAND}, 0 0 28px ${BRAND}66; }
          50%     { transform: scale(1.25); opacity: 1;    box-shadow: 0 0 22px ${BRAND}, 0 0 44px ${BRAND}88; }
        }
        @keyframes edgePulse {
          0%,100% { box-shadow: 0 0 0 1px ${BRAND}22, 0 0 18px ${BRAND}22 inset; }
          50%     { box-shadow: 0 0 0 1px ${BRAND}55, 0 0 36px ${BRAND}44 inset; }
        }
        @keyframes edgePulseRed {
          0%,100% { box-shadow: 0 0 0 1px ${RED}22, 0 0 18px ${RED}22 inset; }
          50%     { box-shadow: 0 0 0 1px ${RED}55, 0 0 36px ${RED}44 inset; }
        }
        @keyframes wavePan {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes feedDot {
          0%,100% { opacity: .55; }
          50%     { opacity: 1; }
        }
      `}</style>

      {/* RADIAL VIGNETTES */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(720px 480px at 0% 0%, rgba(102,255,102,0.06), transparent 60%),
            radial-gradient(820px 520px at 100% 100%, rgba(102,255,102,0.05), transparent 60%),
            radial-gradient(1400px 680px at 50% -10%, rgba(102,255,102,0.04), transparent 70%)
          `,
        }}
      />
      {/* SCANLINES */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(124,255,0,0.035) 0px, rgba(124,255,0,0.035) 1px, transparent 1px, transparent 3px)",
          mixBlendMode: "overlay",
        }}
      />

      <div className="relative z-10">
        {/* TOP BAR */}
        <div
          className="flex h-[56px] items-center gap-5 px-5"
          style={{ background: BG_1, borderBottom: `1px solid ${HAIR_10}` }}
        >
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center" style={{ background: BRAND, color: BG_0, boxShadow: `0 0 14px ${BRAND}88` }}>
              <Zap size={15} strokeWidth={3} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-white text-[15px] font-bold" style={{ letterSpacing: "-0.03em" }}>AICandlez</span>
              <span className="text-[8.5px] font-semibold tracking-[0.22em]" style={{ color: TXT_40 }}>PERSONAL · TERMINAL</span>
            </div>
            <div
              className="ml-2 px-2 py-1 text-[9px] font-bold tracking-[0.20em]"
              style={{ color: BRAND, border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}
            >
              PAPER TRADING
            </div>
          </div>

          {/* center tickers */}
          <div className="mx-auto flex items-center gap-5">
            {TICKERS.map((t) => {
              const up = t.chg >= 0;
              return (
                <div key={t.sym} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-[0.10em] text-white">{t.sym}</span>
                  <span className="text-[12px] font-semibold tabular-nums text-white">{t.price}</span>
                  <span
                    className="px-1.5 py-[1px] text-[9.5px] font-bold tabular-nums"
                    style={{
                      color: up ? BRAND : RED,
                      border: `1px solid ${(up ? BRAND : RED)}55`,
                      background: up ? "rgba(102,255,102,0.06)" : "rgba(255,59,59,0.06)",
                    }}
                  >
                    {up ? "+" : ""}{t.chg.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <Bell size={14} style={{ color: TXT_65 }} />
            <div className="text-[10.5px] tabular-nums tracking-[0.10em]" style={{ color: TXT_65 }}>{clock}</div>
            <div
              className="grid h-7 w-7 place-items-center text-[10px] font-bold"
              style={{ background: BG_3, color: BRAND, border: `1px solid ${HAIR_18}` }}
            >
              JM
            </div>
          </div>
        </div>

        {/* HERO BAND */}
        <div
          className="grid items-stretch"
          style={{ gridTemplateColumns: "3fr 2fr", height: 140, background: BG_1, borderBottom: `1px solid ${HAIR_10}` }}
        >
          {/* AI HUNTING */}
          <div className="relative flex flex-col justify-center gap-2.5 px-6" style={{ borderRight: `1px solid ${HAIR_10}` }}>
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: BRAND, animation: "pulseOrb 2.4s ease-in-out infinite" }}
              />
              <div className="text-[10px] font-bold tracking-[0.30em]" style={{ color: BRAND }}>AI ENGINE · HUNTING</div>
              <div className="flex items-center gap-1 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_40 }}>
                <Bot size={11} /> autonomous
              </div>
            </div>
            <div className="text-[28px] font-bold leading-none text-white" style={{ letterSpacing: "-0.04em" }}>
              Scanning <span style={{ color: BRAND }}>30 markets</span> · last surge{" "}
              <span style={{ color: BRAND }}>BTC 82→91</span>
              <span className="ml-2 text-[14px] font-semibold" style={{ color: TXT_40, letterSpacing: 0 }}>· 3s ago</span>
            </div>
            <div className="flex items-center gap-2">
              {CONVICTION_CHIPS.map((c) => (
                <ConvictionChip key={c.sym} {...c} />
              ))}
              <div className="ml-2 flex items-center gap-1 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_40 }}>
                <Activity size={10} /> live conviction stream
              </div>
            </div>
          </div>

          {/* MARKET PULSE */}
          <div className="relative flex flex-col justify-center gap-2 px-6">
            <div className="flex items-center gap-2">
              <Radio size={11} style={{ color: BRAND }} />
              <div className="text-[10px] font-bold tracking-[0.30em]" style={{ color: TXT_65 }}>MARKET PULSE</div>
            </div>
            <div className="flex items-end gap-3">
              <div className="text-[32px] font-bold leading-none" style={{ color: BRAND, letterSpacing: "-0.05em", textShadow: `0 0 18px ${BRAND}66` }}>
                BULL
              </div>
              <div className="text-[28px] font-bold leading-none text-white tabular-nums" style={{ letterSpacing: "-0.04em" }}>
                · 73
              </div>
              <div className="pb-1 text-[10px] font-semibold tracking-[0.20em]" style={{ color: TXT_65 }}>CONVICTION</div>
            </div>
            <div className="relative h-[42px] w-full overflow-hidden">
              <div className="absolute inset-0 flex" style={{ animation: "wavePan 12s linear infinite", width: "200%" }}>
                <Sparkline data={PULSE_WAVE} color={BRAND} w={600} h={42} strokeW={1.8} />
                <Sparkline data={PULSE_WAVE} color={BRAND} w={600} h={42} strokeW={1.8} />
              </div>
            </div>
          </div>
        </div>

        {/* MAIN — battlefield + right rail */}
        <div className="grid gap-4 px-4 py-4" style={{ gridTemplateColumns: "1fr 340px" }}>
          {/* BATTLEFIELD */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[26px] font-bold text-white" style={{ letterSpacing: "-0.04em" }}>
                  LIVE OPPORTUNITY <span style={{ color: BRAND, textShadow: `0 0 14px ${BRAND}55` }}>BATTLEFIELD</span>
                </div>
                <div className="mt-1 text-[10.5px] tracking-[0.18em]" style={{ color: TXT_40 }}>
                  30 MARKETS · AI-RANKED BY CONVICTION · LIVE EXECUTION ARMED
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9.5px] tracking-[0.18em]" style={{ color: TXT_40 }}>
                <Shield size={11} style={{ color: BRAND }} />
                RISK GATES <span className="font-bold text-white">ACTIVE</span>
                <span className="mx-2" style={{ color: TXT_25 }}>|</span>
                EXEC <span className="font-bold" style={{ color: BRAND }}>ARMED</span>
              </div>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
              {/* LONGS */}
              <div className="flex min-w-0 flex-col gap-2.5">
                <div
                  className="flex items-center gap-2.5 px-3 py-2"
                  style={{ background: "rgba(0,200,83,0.05)", border: `1px solid ${HAIR_18}` }}
                >
                  <div
                    className="grid h-7 min-w-[28px] place-items-center px-1 text-[12px] font-bold"
                    style={{ background: BRAND, color: BG_0, boxShadow: `0 0 12px ${BRAND}88` }}
                  >
                    15
                  </div>
                  <div className="text-[13px] font-bold tracking-[0.18em]" style={{ color: BRAND }}>LONGS · ACTIVE</div>
                  <div className="ml-auto flex items-center gap-1.5 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_65 }}>
                    <TrendingUp size={11} style={{ color: BRAND }} />
                    AI BIAS: <span className="font-bold" style={{ color: BRAND }}>BULLISH</span>
                  </div>
                </div>
                {LONGS.map((s, i) => (
                  <SignalCard key={s.sym} s={s} top={i === 0} />
                ))}
              </div>

              {/* SHORTS */}
              <div className="flex min-w-0 flex-col gap-2.5">
                <div
                  className="flex items-center gap-2.5 px-3 py-2"
                  style={{ background: "rgba(255,59,59,0.05)", border: `1px solid ${HAIR_RED_18}` }}
                >
                  <div
                    className="grid h-7 min-w-[28px] place-items-center px-1 text-[12px] font-bold"
                    style={{ background: RED, color: "#fff", boxShadow: `0 0 12px ${RED}88` }}
                  >
                    15
                  </div>
                  <div className="text-[13px] font-bold tracking-[0.18em]" style={{ color: RED }}>SHORTS · ACTIVE</div>
                  <div className="ml-auto flex items-center gap-1.5 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_65 }}>
                    <TrendingDown size={11} style={{ color: RED }} />
                    AI BIAS: <span className="font-bold" style={{ color: RED }}>BEARISH</span>
                  </div>
                </div>
                {SHORTS.map((s, i) => (
                  <div
                    key={s.sym}
                    style={i === 0 ? { animation: "edgePulseRed 4s ease-in-out infinite" } : undefined}
                  >
                    <SignalCard s={s} top={i === 0} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT RAIL — MY ACCOUNT */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-bold tracking-[0.22em] text-white">MY ACCOUNT</div>
              <div
                className="px-2 py-0.5 text-[9px] font-bold tracking-[0.18em]"
                style={{ color: BRAND, border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}
              >
                PAPER MODE
              </div>
            </div>

            {/* EQUITY HERO */}
            <div
              className="relative flex flex-col gap-2 p-4"
              style={{
                background: `linear-gradient(180deg, rgba(102,255,102,0.06), rgba(102,255,102,0.01)), ${BG_2}`,
                border: `1px solid ${HAIR_18}`,
                boxShadow: `0 0 28px rgba(102,255,102,0.06) inset`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-[8.5px] font-bold tracking-[0.22em]" style={{ color: TXT_40 }}>EQUITY</div>
                <div className="flex items-center gap-1 text-[8.5px] tracking-[0.18em]" style={{ color: BRAND }}>
                  <Bot size={10} /> AI MANAGED
                </div>
              </div>
              <div className="text-[30px] font-bold leading-none tabular-nums text-white" style={{ letterSpacing: "-0.04em" }}>
                $108,420<span style={{ color: TXT_40 }}>.16</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="px-1.5 py-[1px] text-[10px] font-bold tabular-nums"
                  style={{ color: BRAND, border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}
                >
                  +8.42% MTD
                </div>
                <div className="text-[10px] tracking-[0.14em]" style={{ color: TXT_40 }}>since Jun 1</div>
              </div>
              <div className="mt-1">
                <Sparkline data={EQUITY_SPARK} color={BRAND} w={300} h={34} strokeW={1.8} />
              </div>
            </div>

            {/* 2-up stats */}
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="TODAY"    value="+$1,284.50" color={BRAND} />
              <MiniStat label="WIN RATE" value="68%"        color="#fff" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="REALIZED"   value="+$6,310.42" color={BRAND} />
              <MiniStat label="UNREALIZED" value="+$2,109.74" color={BRAND} />
            </div>

            {/* LIVE POSITIONS */}
            <div style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
                <div className="text-[10px] font-bold tracking-[0.22em]" style={{ color: TXT_85 }}>LIVE POSITIONS</div>
                <div className="text-[9px] tracking-[0.18em]" style={{ color: TXT_40 }}>{POSITIONS.length} OPEN</div>
              </div>
              <div className="flex flex-col">
                {POSITIONS.map((p) => {
                  const isL = p.dir === "LONG";
                  const c = isL ? BRAND : RED;
                  return (
                    <div
                      key={p.sym}
                      className="grid items-center gap-2 px-3 py-2"
                      style={{
                        gridTemplateColumns: "56px 1fr 60px",
                        background: isL ? "rgba(102,255,102,0.03)" : "rgba(255,59,59,0.03)",
                        borderTop: `1px solid ${HAIR_10}`,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                        <span className="text-[12px] font-bold text-white" style={{ letterSpacing: "-0.02em" }}>{p.sym}</span>
                      </div>
                      <div className="flex flex-col">
                        <div className="text-[9px] tracking-[0.16em]" style={{ color: c }}>{p.dir}</div>
                        <div className="text-[9.5px] tabular-nums" style={{ color: TXT_40 }}>
                          {p.entry} → <span className="text-white">{p.cur}</span>
                        </div>
                      </div>
                      <div className="text-right text-[12px] font-bold tabular-nums" style={{ color: c }}>
                        +{p.pnl.toFixed(2)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* EXCHANGE BALANCES */}
            <div style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
                  <div className="text-[10px] font-bold tracking-[0.22em]" style={{ color: TXT_85 }}>KRAKEN · CONNECTED</div>
                </div>
                <div className="text-[9px] tracking-[0.18em]" style={{ color: BRAND }}>LIVE</div>
              </div>
              <div className="flex flex-col px-3 py-2 gap-1">
                {BALANCES.map((b) => (
                  <div key={b.asset} className="flex items-center justify-between text-[10.5px]" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    <span style={{ color: TXT_65 }}>{b.asset}</span>
                    <span className="tabular-nums text-white">{b.qty}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI ACTIVITY FEED */}
            <div style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
                <div className="flex items-center gap-1.5">
                  <Radio size={11} style={{ color: BRAND }} />
                  <div className="text-[10px] font-bold tracking-[0.22em]" style={{ color: TXT_85 }}>AI ACTIVITY</div>
                </div>
                <div className="text-[9px] tracking-[0.18em]" style={{ color: TXT_40 }}>LIVE FEED</div>
              </div>
              <div className="flex flex-col">
                {FEED.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5"
                    style={{ borderTop: i === 0 ? "none" : `1px solid ${HAIR_10}` }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: e.dot, boxShadow: `0 0 6px ${e.dot}`, animation: i === 0 ? "feedDot 1.6s ease-in-out infinite" : undefined }}
                    />
                    <span
                      className="text-[9.5px] tabular-nums"
                      style={{ color: TXT_40, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      {e.t}
                    </span>
                    <span className="text-[9.5px] font-semibold tracking-[0.10em]" style={{ color: TXT_85 }}>
                      {e.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* UPGRADE CTA */}
            <button
              className="mt-1 flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold tracking-[0.20em]"
              style={{
                color: BG_0,
                background: `linear-gradient(90deg, ${EMERALD}, ${BRAND}, ${LIME})`,
                boxShadow: `0 0 22px ${BRAND}66`,
                border: `1px solid ${BRAND}`,
              }}
            >
              <Zap size={13} strokeWidth={3} />
              UNLOCK 12 CONCURRENT AI TRADES
            </button>
          </div>
        </div>

        {/* BOTTOM TICKER */}
        <div
          className="flex h-[36px] items-center gap-6 px-5 text-[10px] tracking-[0.20em]"
          style={{ background: BG_1, borderTop: `1px solid ${HAIR_10}`, color: TXT_65 }}
        >
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}`, animation: "pulseOrb 2.4s ease-in-out infinite" }} />
            <span style={{ color: BRAND }} className="font-bold">AI · HUNTING 30 MARKETS</span>
          </div>
          <span style={{ color: TXT_25 }}>·</span>
          <span>SIGNALS/MIN <span className="font-bold text-white tabular-nums">4.2</span></span>
          <span style={{ color: TXT_25 }}>·</span>
          <span>LAST FILL <span className="font-bold" style={{ color: BRAND }}>BTC LONG +0.42%</span></span>
          <span style={{ color: TXT_25 }}>·</span>
          <span>NEXT SCAN <span className="font-bold text-white tabular-nums">3s</span></span>
          <span className="ml-auto" style={{ color: TXT_40 }}>v2.1 · personal terminal</span>
        </div>
      </div>
    </div>
  );
}
