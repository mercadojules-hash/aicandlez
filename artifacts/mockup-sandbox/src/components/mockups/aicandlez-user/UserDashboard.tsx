import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  ChevronRight,
  Cpu,
  Home as HomeIcon,
  LineChart,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  User as UserIcon,
  Wallet,
  Zap,
} from "lucide-react";

const BRAND = "#66FF66";
const LIME = "#7CFF00";
const EMERALD = "#00C853";
const RED = "#FF3B3B";
const RED_SOFT = "#FF6B6B";
const BG_0 = "#000000";
const BG_1 = "#050A07";
const BG_2 = "#0A1410";
const BG_3 = "#0F1F18";
const HAIR_10 = "rgba(124,255,0,0.10)";
const HAIR_18 = "rgba(124,255,0,0.18)";
const TXT_65 = "rgba(255,255,255,0.65)";
const TXT_40 = "rgba(255,255,255,0.40)";
const TXT_25 = "rgba(255,255,255,0.22)";

type Dir = "LONG" | "SHORT";
type Signal = {
  sym: string;
  name: string;
  dir: Dir;
  reason: string;
  price: string;
  last5m: string;
  changePct: number;
  vol: string;
  conf: number;
  spark: number[];
};

const LONG_CRYPTO: Signal[] = [
  { sym: "BTC",   name: "Bitcoin",     dir: "LONG", reason: "TREND",    price: "$67,284.10", last5m: "$66,910.22", changePct: 1.37, vol: "$48.7M", conf: 92, spark: [10,12,11,14,15,14,18,17,20,22,24,26,27,29] },
  { sym: "ETH",   name: "Ethereum",    dir: "LONG", reason: "MOMENTUM", price: "$3,128.44",  last5m: "$3,084.10",  changePct: 2.18, vol: "$22.4M", conf: 88, spark: [5,6,5,7,8,7,9,10,12,11,14,15,17,18] },
  { sym: "SOL",   name: "Solana",      dir: "LONG", reason: "BREAKOUT", price: "$172.65",    last5m: "$168.81",    changePct: 2.27, vol: "$14.1M", conf: 86, spark: [9,10,11,10,12,13,14,13,15,16,18,19,20,22] },
  { sym: "AVAX",  name: "Avalanche",   dir: "LONG", reason: "TREND",    price: "$39.27",     last5m: "$38.54",     changePct: 1.89, vol: "$8.2M",  conf: 84, spark: [8,8.4,8.6,9,9.2,9.5,9.7,10,10.4,10.8,11,11.4,11.8,12.2] },
  { sym: "LINK",  name: "Chainlink",   dir: "LONG", reason: "MOMENTUM", price: "$19.74",     last5m: "$19.33",     changePct: 2.12, vol: "$5.1M",  conf: 82, spark: [11,11.3,11.2,11.6,11.5,11.9,11.8,12.2,12.1,12.5,12.4,12.8,12.7,13.1] },
  { sym: "INJ",   name: "Injective",   dir: "LONG", reason: "BREAKOUT", price: "$28.40",     last5m: "$27.65",     changePct: 2.71, vol: "$3.9M",  conf: 81, spark: [9,9.4,9.6,10,10.3,10.7,11.0,11.5,11.7,12.1,12.4,12.8,13.2,13.7] },
  { sym: "TIA",   name: "Celestia",    dir: "LONG", reason: "TRENDING", price: "$7.82",      last5m: "$7.61",      changePct: 2.76, vol: "$2.6M",  conf: 80, spark: [6,6.2,6.4,6.7,6.9,7.1,7.3,7.5,7.7,7.9,8.0,8.2,8.4,8.6] },
  { sym: "RNDR",  name: "Render",      dir: "LONG", reason: "MOMENTUM", price: "$8.91",      last5m: "$8.62",      changePct: 3.36, vol: "$4.4M",  conf: 79, spark: [5,5.2,5.5,5.8,6.0,6.3,6.6,6.9,7.1,7.4,7.7,8.0,8.3,8.6] },
  { sym: "SUI",   name: "Sui",         dir: "LONG", reason: "TREND",    price: "$2.16",      last5m: "$2.11",      changePct: 2.37, vol: "$3.1M",  conf: 78, spark: [7,7.2,7.3,7.5,7.6,7.8,8.0,8.2,8.3,8.5,8.7,8.9,9.1,9.3] },
  { sym: "APT",   name: "Aptos",       dir: "LONG", reason: "REVERSAL", price: "$7.95",      last5m: "$7.74",      changePct: 2.71, vol: "$4.6M",  conf: 77, spark: [4,4.2,4.1,4.4,4.3,4.6,4.5,4.8,4.7,5.0,4.9,5.2,5.1,5.4] },
  { sym: "FET",   name: "Fetch.ai",    dir: "LONG", reason: "BREAKOUT", price: "$1.348",     last5m: "$1.298",     changePct: 3.85, vol: "$2.8M",  conf: 76, spark: [6,6.3,6.5,6.8,7.0,7.3,7.5,7.8,8.0,8.3,8.5,8.8,9.0,9.3] },
  { sym: "ARB",   name: "Arbitrum",    dir: "LONG", reason: "MOMENTUM", price: "$1.072",     last5m: "$1.048",     changePct: 2.29, vol: "$3.7M",  conf: 75, spark: [5,5.1,5.3,5.4,5.6,5.7,5.9,6.0,6.2,6.3,6.5,6.6,6.8,6.9] },
  { sym: "DOGE",  name: "Dogecoin",    dir: "LONG", reason: "TREND",    price: "$0.1842",    last5m: "$0.1808",    changePct: 1.88, vol: "$6.2M",  conf: 74, spark: [8,8.1,8.3,8.4,8.6,8.7,8.9,9.0,9.2,9.3,9.5,9.6,9.8,9.9] },
  { sym: "JUP",   name: "Jupiter",     dir: "LONG", reason: "SCALP",    price: "$1.024",     last5m: "$0.998",     changePct: 2.60, vol: "$2.2M",  conf: 73, spark: [4.5,4.6,4.8,4.9,5.1,5.2,5.4,5.5,5.7,5.8,6.0,6.1,6.3,6.4] },
  { sym: "POL",   name: "Polygon",     dir: "LONG", reason: "REVERSAL", price: "$0.5240",    last5m: "$0.5128",    changePct: 2.18, vol: "$2.0M",  conf: 71, spark: [3,3.1,3.2,3.3,3.4,3.5,3.6,3.7,3.8,3.9,4.0,4.1,4.2,4.3] },
];

const SHORT_CRYPTO: Signal[] = [
  { sym: "WIF",   name: "Dogwifhat",   dir: "SHORT", reason: "TREND",    price: "$2.0840",    last5m: "$2.1920",     changePct: -4.93, vol: "$3.4M",  conf: 89, spark: [22,21,21.6,20.5,20.2,20.8,19.6,19.2,19.8,18.4,18.0,18.6,17.2,16.8] },
  { sym: "PEPE",  name: "Pepe",        dir: "SHORT", reason: "MOMENTUM", price: "$0.00000814",last5m: "$0.00000862", changePct: -5.57, vol: "$4.1M",  conf: 87, spark: [24,23.4,23.6,22.7,22.3,22.5,21.4,20.9,21.0,20.0,19.5,19.7,18.6,18.0] },
  { sym: "BONK",  name: "Bonk",        dir: "SHORT", reason: "REVERSAL", price: "$0.00001921",last5m: "$0.00002068", changePct: -7.11, vol: "$1.8M",  conf: 84, spark: [21,20.5,20.7,19.9,19.5,19.7,18.9,18.4,18.6,17.7,17.2,17.4,16.4,16.0] },
  { sym: "SHIB",  name: "Shiba Inu",   dir: "SHORT", reason: "TREND",    price: "$0.00001784",last5m: "$0.00001846", changePct: -3.36, vol: "$2.5M",  conf: 83, spark: [19,18.6,18.7,18.0,17.6,17.8,17.1,16.7,16.8,16.0,15.6,15.7,14.9,14.4] },
  { sym: "FLOKI", name: "Floki",       dir: "SHORT", reason: "MOMENTUM", price: "$0.0001624", last5m: "$0.0001712",  changePct: -5.14, vol: "$1.6M",  conf: 81, spark: [20,19.4,19.6,18.7,18.3,18.5,17.5,17.1,17.3,16.3,15.8,16.0,15.0,14.5] },
  { sym: "NEAR",  name: "Near",        dir: "SHORT", reason: "MOMENTUM", price: "$6.28",      last5m: "$6.412",      changePct: -2.06, vol: "$2.9M",  conf: 79, spark: [18,17.6,17.8,17.2,17.0,17.4,16.6,16.2,16.4,15.6,15.2,15.4,14.6,14.2] },
  { sym: "OP",    name: "Optimism",    dir: "SHORT", reason: "TREND",    price: "$1.2747",    last5m: "$1.3148",     changePct: -3.05, vol: "$2.1M",  conf: 78, spark: [16,15.6,15.8,15.0,14.6,14.8,14.0,13.6,13.8,13.0,12.6,12.8,12.0,11.6] },
  { sym: "ORDI",  name: "Ordinals",    dir: "SHORT", reason: "REVERSAL", price: "$34.18",     last5m: "$35.62",      changePct: -4.04, vol: "$2.4M",  conf: 77, spark: [17,16.6,16.8,16.0,15.7,15.9,15.1,14.7,14.9,14.1,13.7,13.9,13.1,12.6] },
  { sym: "TAO",   name: "Bittensor",   dir: "SHORT", reason: "TREND",    price: "$418.72",    last5m: "$434.10",     changePct: -3.54, vol: "$3.0M",  conf: 76, spark: [15,14.7,14.8,14.2,13.9,14.1,13.4,13.1,13.2,12.5,12.2,12.3,11.6,11.2] },
  { sym: "SEI",   name: "Sei",         dir: "SHORT", reason: "MOMENTUM", price: "$0.412",     last5m: "$0.428",      changePct: -3.74, vol: "$1.4M",  conf: 75, spark: [14,13.7,13.8,13.2,12.9,13.1,12.4,12.1,12.2,11.5,11.2,11.3,10.6,10.2] },
  { sym: "JTO",   name: "Jito",        dir: "SHORT", reason: "SCALP",    price: "$2.84",      last5m: "$2.96",       changePct: -4.05, vol: "$1.2M",  conf: 74, spark: [13,12.7,12.8,12.2,11.9,12.1,11.4,11.1,11.2,10.5,10.2,10.3,9.6,9.2] },
  { sym: "ATOM",  name: "Cosmos",      dir: "SHORT", reason: "TREND",    price: "$6.48",      last5m: "$6.62",       changePct: -2.11, vol: "$1.8M",  conf: 73, spark: [12,11.8,11.9,11.4,11.1,11.3,10.7,10.4,10.5,9.9,9.6,9.7,9.1,8.7] },
  { sym: "ADA",   name: "Cardano",     dir: "SHORT", reason: "REVERSAL", price: "$0.3624",    last5m: "$0.3712",     changePct: -2.37, vol: "$3.1M",  conf: 72, spark: [11,10.8,10.9,10.4,10.2,10.4,9.8,9.5,9.6,9.0,8.7,8.8,8.2,7.8] },
  { sym: "XRP",   name: "Ripple",      dir: "SHORT", reason: "TREND",    price: "$0.5184",    last5m: "$0.5286",     changePct: -1.93, vol: "$4.0M",  conf: 71, spark: [10,9.8,9.9,9.4,9.2,9.4,8.8,8.5,8.6,8.0,7.7,7.8,7.2,6.8] },
  { sym: "FIL",   name: "Filecoin",    dir: "SHORT", reason: "MOMENTUM", price: "$3.74",      last5m: "$3.86",       changePct: -3.11, vol: "$1.1M",  conf: 70, spark: [9,8.8,8.9,8.4,8.2,8.4,7.8,7.5,7.6,7.0,6.7,6.8,6.2,5.8] },
];

const OPEN_TRADES = [
  { sym: "BTC",  dir: "LONG"  as Dir, entry: "$66,810.22", pnl: +1.42 },
  { sym: "SOL",  dir: "LONG"  as Dir, entry: "$168.40",    pnl: +2.51 },
  { sym: "WIF",  dir: "SHORT" as Dir, entry: "$2.1820",    pnl: +4.49 },
];

const EXECUTIONS = [
  { t: "14:22:01", sym: "BTC",  dir: "LONG"  as Dir, msg: "filled @ 67,287",   ok: true },
  { t: "14:19:48", sym: "SOL",  dir: "LONG"  as Dir, msg: "filled @ 171.62",   ok: true },
  { t: "14:14:22", sym: "WIF",  dir: "SHORT" as Dir, msg: "filled @ 2.1820",   ok: true },
  { t: "14:08:11", sym: "ETH",  dir: "LONG"  as Dir, msg: "stop moved 3,080",  ok: true },
  { t: "13:54:30", sym: "RNDR", dir: "LONG"  as Dir, msg: "partial @ 8.74",    ok: true },
];

const ACTIVITY = [
  { t: "14:18:42", msg: "AI raised BTC conviction 79 → 88" },
  { t: "14:09:14", msg: "Risk gate tripped on AVAX (vol spike)" },
  { t: "13:50:08", msg: "Auto-rebalance committed · 4 legs" },
  { t: "13:32:51", msg: "Regime shift detected · TRENDING ↑" },
];

function Sparkline({ data, color, w = 130, h = 30 }: { data: number[]; color: string; w?: number; h?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  const gid = `g-${color.replace("#", "")}-${Math.round(data[0] * 1000)}`;
  return (
    <svg width={w} height={h} className="block overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfRing({ value, color, size = 38 }: { value: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="2.4" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[10px] font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function SignalRow({ s }: { s: Signal }) {
  const isLong = s.dir === "LONG";
  const color = isLong ? BRAND : RED;
  const tint = isLong ? "rgba(102,255,102,0.05)" : "rgba(255,59,59,0.04)";
  return (
    <div
      className="relative flex items-center gap-3 px-3 py-2.5"
      style={{
        background: tint,
        border: `1px solid ${isLong ? "rgba(102,255,102,0.18)" : "rgba(255,59,59,0.22)"}`,
      }}
    >
      <div
        className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em]"
        style={{
          color,
          background: isLong ? "rgba(102,255,102,0.08)" : "rgba(255,59,59,0.08)",
          border: `1px solid ${color}55`,
        }}
      >
        {s.dir}
      </div>

      <div className="flex w-[88px] flex-col">
        <div className="text-[13px] font-bold leading-none tracking-[-0.01em] text-white">{s.sym}</div>
        <div className="mt-1 text-[8.5px] font-semibold tracking-[0.16em]" style={{ color: TXT_40 }}>
          {s.reason}
        </div>
      </div>

      <div className="flex w-[112px] flex-col">
        <div className="text-[11px] font-semibold tabular-nums text-white leading-none">{s.price}</div>
        <div className="mt-1 text-[9px] tabular-nums" style={{ color: TXT_40 }}>
          5m {s.last5m}
        </div>
      </div>

      <div className="flex-1">
        <Sparkline data={s.spark} color={color} w={130} h={28} />
      </div>

      <div className="flex w-[60px] flex-col items-end">
        <div className="text-[10px] tracking-[0.14em]" style={{ color: TXT_40 }}>LAST 5M</div>
        <div className="text-[11px] font-semibold tabular-nums" style={{ color }}>
          {s.changePct > 0 ? "+" : ""}{s.changePct.toFixed(2)}%
        </div>
      </div>

      <button
        className="px-2.5 py-1 text-[10px] font-bold tracking-[0.16em]"
        style={{
          color,
          border: `1px solid ${color}66`,
          background: isLong ? "rgba(102,255,102,0.06)" : "rgba(255,59,59,0.06)",
        }}
      >
        {isLong ? "BUY" : "SELL"}
      </button>

      <ConfRing value={s.conf} color={color} />
    </div>
  );
}

function KpiCard({
  label,
  children,
  right,
}: {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-2 px-3 py-2.5"
      style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>
          {label}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Bar({ label, value, total, color = BRAND }: { label: string; value: number | string; total?: number; color?: string }) {
  const pct = typeof value === "number" && total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[64px_1fr_36px] items-center gap-2">
      <div className="text-[9.5px] tracking-[0.12em]" style={{ color: TXT_65 }}>{label}</div>
      <div className="h-[5px]" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-right text-[10px] font-semibold tabular-nums" style={{ color }}>
        {typeof value === "number" ? value : value}
      </div>
    </div>
  );
}

export default function UserDashboard() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = now.toISOString().split("T")[1].split(".")[0] + " UTC";

  const navItems = [
    { label: "Home", icon: HomeIcon, active: true },
    { label: "Signals", icon: Radio },
    { label: "Trade", icon: TrendingUp },
    { label: "Portfolio", icon: Wallet },
    { label: "Profile", icon: UserIcon },
  ];

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: `radial-gradient(1200px 600px at 50% -10%, rgba(102,255,102,0.06), transparent 60%), ${BG_0}`,
        color: "white",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
        fontFeatureSettings: '"tnum"',
      }}
    >
      {/* TOP BRAND STRIP */}
      <div
        className="flex h-[34px] items-center gap-4 px-4 text-[10px] tracking-[0.16em]"
        style={{ background: BG_1, borderBottom: `1px solid ${HAIR_10}`, color: TXT_65 }}
      >
        <div className="flex items-center gap-2 font-bold">
          <div
            className="grid h-5 w-5 place-items-center"
            style={{ background: BRAND, color: BG_0 }}
          >
            <Zap size={12} strokeWidth={3} />
          </div>
          <span className="text-white tracking-[-0.02em] text-[13px] font-bold">AICandlez</span>
          <span className="text-[9px]" style={{ color: TXT_40 }}>v2.1 · CUSTOMER</span>
        </div>
        <div className="ml-4 flex items-center gap-1.5 text-[10px]" style={{ color: TXT_65 }}>
          <span style={{ color: TXT_40 }}>◷</span> {clock}
        </div>
        <div className="ml-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
          <span style={{ color: BRAND }}>ENGINE ONLINE</span>
        </div>
        <div className="ml-2" style={{ color: TXT_65 }}>AI INTEL <span className="font-bold text-white">8.2</span></div>
        <div className="ml-2" style={{ color: TXT_65 }}>L/S <span className="font-bold text-white">63/37</span></div>
        <div className="ml-2" style={{ color: TXT_65 }}>AVG CONF <span className="font-bold text-white">72%</span></div>

        <div className="ml-auto flex items-center gap-3">
          <div
            className="px-2 py-[3px] text-[9px] font-bold tracking-[0.18em]"
            style={{ color: BRAND, border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}
          >
            PAPER TRADING
          </div>
          <div className="text-[10px]" style={{ color: TXT_65 }}>
            EQUITY <span className="font-bold text-white tabular-nums">$108,420.16</span>
          </div>
          <div className="text-[10px]" style={{ color: TXT_65 }}>
            DAY <span className="font-bold tabular-nums" style={{ color: BRAND }}>+$1,284.50</span>
          </div>
          <Bell size={13} style={{ color: TXT_65 }} />
          <div
            className="grid h-6 w-6 place-items-center text-[10px] font-bold"
            style={{ background: BG_3, color: BRAND, border: `1px solid ${HAIR_18}` }}
          >
            JM
          </div>
        </div>
      </div>

      {/* HORIZONTAL NAV */}
      <div
        className="flex h-[36px] items-center gap-1 px-4"
        style={{ background: BG_1, borderBottom: `1px solid ${HAIR_10}` }}
      >
        {navItems.map((n) => (
          <button
            key={n.label}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-[0.10em]"
            style={{
              color: n.active ? BG_0 : TXT_65,
              background: n.active ? BRAND : "transparent",
              border: `1px solid ${n.active ? BRAND : "transparent"}`,
            }}
          >
            <n.icon size={12} />
            {n.label.toUpperCase()}
          </button>
        ))}

        <div className="mx-3 h-4 w-px" style={{ background: HAIR_18 }} />
        <div className="flex items-center gap-2 text-[10px]" style={{ color: TXT_40 }}>
          <Star size={11} /> Watchlist
          <ChevronRight size={10} />
          <span className="text-white">BTC · ETH · SOL · NVDA</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-2 py-1 text-[10px]"
            style={{ background: BG_2, border: `1px solid ${HAIR_10}`, color: TXT_65, width: 320 }}
          >
            <Search size={11} />
            <span>Search asset or AI opportunity… (BTC · ETH · SOL · DOGE · WIF)</span>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-[0.14em]"
            style={{ color: BG_0, background: BRAND }}
          >
            <Zap size={11} strokeWidth={3} />
            ENABLE LIVE AI TRADING
          </button>
        </div>
      </div>

      {/* MAIN GRID */}
      <div
        className="grid gap-3 px-3 py-3"
        style={{ gridTemplateColumns: "1fr 360px" }}
      >
        {/* CENTER COLUMN */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* TOP KPI ROW */}
          <div className="grid grid-cols-5 gap-3">
            <KpiCard label="AI CONFIDENCE">
              <div className="flex items-center gap-3">
                <ConfRing value={73} color={BRAND} size={56} />
                <div className="flex flex-col">
                  <div className="text-[10px] tracking-[0.14em]" style={{ color: BRAND }}>BULLISH</div>
                  <div className="text-[9px]" style={{ color: TXT_40 }}>Composite score</div>
                </div>
              </div>
            </KpiCard>
            <KpiCard label="MARKET REGIME">
              <div>
                <div className="text-[15px] font-bold tracking-[-0.02em]" style={{ color: BRAND }}>TRENDING</div>
                <div className="mt-1 text-[9px]" style={{ color: TXT_40 }}>Bull market · low chop</div>
              </div>
              <Sparkline data={[3,4,4,5,5,6,7,7,8,9,10,11,12,13]} color={BRAND} w={180} h={22} />
            </KpiCard>
            <KpiCard label="SIGNAL QUALITY">
              <div className="flex flex-col gap-1">
                <Bar label="EXCEL" value={12} total={20} color={BRAND} />
                <Bar label="GOOD"  value={27} total={40} color={LIME} />
                <Bar label="FAIR"  value={16} total={40} color="#FFD23F" />
                <Bar label="WEAK"  value={3}  total={40} color={RED_SOFT} />
              </div>
            </KpiCard>
            <KpiCard label="VOLUME ANALYSIS">
              <div className="flex flex-col gap-1">
                <Bar label="HIGH"   value={"42%"} total={100} color={BRAND} />
                <Bar label="NORMAL" value={"38%"} total={100} color={LIME} />
                <Bar label="LOW"    value={"18%"} total={100} color="#FFD23F" />
                <Bar label="QUIET"  value={"2%"}  total={100} color={RED_SOFT} />
              </div>
            </KpiCard>
            <KpiCard label="AI THROUGHPUT">
              <div className="grid grid-cols-2 gap-y-1 text-[10px] tabular-nums">
                <span style={{ color: TXT_65 }}>SIGS/HR</span><span className="text-right text-white">812</span>
                <span style={{ color: TXT_65 }}>LATENCY</span><span className="text-right text-white">14ms</span>
                <span style={{ color: TXT_65 }}>UPTIME</span><span className="text-right" style={{ color: BRAND }}>99.8%</span>
                <span style={{ color: TXT_65 }}>MODELS</span><span className="text-right text-white">12 / 12</span>
                <span style={{ color: TXT_65 }}>QUEUE</span><span className="text-right text-white">0 / 19</span>
              </div>
            </KpiCard>
          </div>

          {/* FILTER STRIP */}
          <div
            className="flex items-center gap-1 px-2 py-1.5"
            style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}
          >
            {[
              { label: "ALL", on: true },
              { label: "MAJORS" },
              { label: "MEME" },
              { label: "HIGH CONF ≥75" },
              { label: "READY" },
              { label: "BREAKOUT" },
              { label: "MOMENTUM" },
              { label: "TRENDING" },
              { label: "SCALP" },
            ].map((f) => (
              <button
                key={f.label}
                className="px-2 py-1 text-[9.5px] font-semibold tracking-[0.12em]"
                style={{
                  color: f.on ? BG_0 : TXT_65,
                  background: f.on ? BRAND : "transparent",
                  border: `1px solid ${f.on ? BRAND : HAIR_10}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 2-COLUMN SIGNAL GRID */}
          <div className="grid grid-cols-2 gap-3">
            {/* LONG CRYPTO */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: `1px solid ${HAIR_10}` }}
              >
                <div className="flex items-center gap-2">
                  <Activity size={12} style={{ color: BRAND }} />
                  <div className="text-[11px] font-bold tracking-[0.18em] text-white">TOP 15 LONG CRYPTO SIGNALS</div>
                  <span className="text-[9px]" style={{ color: TXT_40 }}>long bias · unlimited AI execution</span>
                </div>
                <div className="flex items-center gap-1 text-[9px]" style={{ color: TXT_40 }}>
                  <span>L <span className="font-semibold" style={{ color: BRAND }}>{LONG_CRYPTO.length}</span></span>
                  <button className="ml-2 px-1.5 py-0.5" style={{ color: BRAND, border: `1px solid ${BRAND}55` }}>ALL</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>MAJ</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>ALT</button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {LONG_CRYPTO.map((s) => <SignalRow key={s.sym} s={s} />)}
              </div>
              <div
                className="px-3 py-2 text-center text-[10px] font-semibold tracking-[0.16em]"
                style={{ borderTop: `1px solid ${HAIR_10}`, color: BRAND }}
              >
                VIEW ALL LONG OPPORTUNITIES
              </div>
            </div>

            {/* SHORT CRYPTO */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: `1px solid ${HAIR_10}` }}
              >
                <div className="flex items-center gap-2">
                  <LineChart size={12} style={{ color: RED }} />
                  <div className="text-[11px] font-bold tracking-[0.18em] text-white">TOP 15 SHORT CRYPTO SIGNALS</div>
                  <span className="text-[9px]" style={{ color: TXT_40 }}>short bias · unlimited AI execution</span>
                </div>
                <div className="flex items-center gap-1 text-[9px]" style={{ color: TXT_40 }}>
                  <span>S <span className="font-semibold" style={{ color: RED }}>{SHORT_CRYPTO.length}</span></span>
                  <button className="ml-2 px-1.5 py-0.5" style={{ color: RED, border: `1px solid ${RED}55` }}>ALL</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>MAJ</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>MEME</button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {SHORT_CRYPTO.map((s) => <SignalRow key={s.sym} s={s} />)}
              </div>
              <div
                className="px-3 py-2 text-center text-[10px] font-semibold tracking-[0.16em]"
                style={{ borderTop: `1px solid ${HAIR_10}`, color: RED }}
              >
                VIEW ALL SHORT OPPORTUNITIES
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — USER ACTIVITY CENTER */}
        <div className="flex flex-col gap-3">
          {/* PAPER MODE + activity header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}
          >
            <div className="text-[10px] font-bold tracking-[0.18em] text-white">USER ACTIVITY CENTER</div>
            <div
              className="px-1.5 py-[2px] text-[8.5px] font-bold tracking-[0.18em]"
              style={{ color: BRAND, border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}
            >
              PAPER MODE
            </div>
          </div>

          {/* CONNECTED EXCHANGE */}
          <div
            className="flex items-center gap-3 px-3 py-2.5"
            style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}
          >
            <div
              className="grid h-8 w-8 place-items-center text-[11px] font-black tracking-[-0.04em]"
              style={{ background: "#0B0E14", color: "#7F5CFF", border: `1px solid rgba(127,92,255,0.35)` }}
            >
              ₭
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
                <span className="text-[11px] font-bold tracking-[0.14em] text-white">KRAKEN · CONNECTED</span>
              </div>
              <div className="mt-0.5 text-[9px] tracking-[0.10em]" style={{ color: TXT_40 }}>
                Read-only API · No withdrawals
              </div>
            </div>
            <div
              className="px-1.5 py-[2px] text-[8.5px] font-bold tracking-[0.16em]"
              style={{ color: BRAND, border: `1px solid ${BRAND}55`, background: "rgba(102,255,102,0.05)" }}
            >
              LIVE
            </div>
          </div>

          {/* EQUITY CARD */}
          <div
            className="flex flex-col gap-2 px-3 py-3"
            style={{ background: BG_2, border: `1px solid ${HAIR_18}` }}
          >
            <div className="flex items-center justify-between">
              <div className="text-[9.5px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>ACCOUNT EQUITY</div>
              <div className="flex items-center gap-2">
                <div
                  className="px-1.5 py-[2px] text-[8px] font-bold tracking-[0.18em]"
                  style={{ color: BRAND, border: `1px solid ${BRAND}55`, background: "rgba(102,255,102,0.05)" }}
                >
                  AI MANAGED
                </div>
                <div className="text-[9px] tracking-[0.12em]" style={{ color: TXT_40 }}>USD</div>
              </div>
            </div>
            <div className="text-[28px] font-bold tabular-nums tracking-[-0.04em] leading-none text-white">
              $108,420.16
            </div>
            <div className="flex items-center justify-between text-[10px] tabular-nums">
              <div style={{ color: BRAND }} className="font-semibold">+8.42% MTD</div>
              <div style={{ color: TXT_65 }}>+$8,418.04</div>
            </div>
            <Sparkline data={[40,41,40,42,43,42,45,46,48,47,50,52,54,56,58,61]} color={BRAND} w={320} h={36} />
          </div>

          {/* PNL ROW 1 — TODAY / TOTAL */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>TODAY P&L</div>
              <div className="text-[16px] font-bold tabular-nums tracking-[-0.03em]" style={{ color: BRAND }}>
                +$1,284.50
              </div>
              <div className="text-[9px] tabular-nums" style={{ color: TXT_65 }}>+1.20% · 7 trades</div>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>TOTAL P&L</div>
              <div className="text-[16px] font-bold tabular-nums tracking-[-0.03em]" style={{ color: BRAND }}>
                +$8,420.16
              </div>
              <div className="text-[9px] tabular-nums" style={{ color: TXT_65 }}>+8.42% · all-time</div>
            </div>
          </div>

          {/* PNL ROW 2 — REALIZED / UNREALIZED */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>REALIZED P&L</div>
              <div className="text-[14px] font-bold tabular-nums tracking-[-0.02em]" style={{ color: BRAND }}>
                +$6,310.42
              </div>
              <div className="text-[9px] tabular-nums" style={{ color: TXT_65 }}>closed positions</div>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>UNREALIZED P&L</div>
              <div className="text-[14px] font-bold tabular-nums tracking-[-0.02em]" style={{ color: BRAND }}>
                +$2,109.74
              </div>
              <div className="text-[9px] tabular-nums" style={{ color: TXT_65 }}>open positions</div>
            </div>
          </div>

          {/* WIN RATE / TRADES */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <ConfRing value={68} color={BRAND} size={48} />
              <div className="flex flex-col">
                <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>WIN RATE</div>
                <div className="text-[14px] font-bold tabular-nums tracking-[-0.02em] text-white">68%</div>
                <div className="text-[9px] tabular-nums" style={{ color: TXT_65 }}>34W / 16L · 30d</div>
              </div>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>TRADES</div>
              <div className="text-[18px] font-bold tabular-nums tracking-[-0.03em] text-white">50</div>
              <div className="text-[9px] tabular-nums" style={{ color: TXT_65 }}>30d window</div>
            </div>
          </div>

          {/* OPEN TRADES */}
          <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center gap-2">
                <ShieldCheck size={11} style={{ color: BRAND }} />
                <div className="text-[10px] font-bold tracking-[0.18em] text-white">OPEN TRADES</div>
              </div>
              <div className="text-[9px]" style={{ color: TXT_40 }}>3 ACTIVE</div>
            </div>
            <div className="flex flex-col">
              {OPEN_TRADES.map((t) => {
                const c = t.dir === "LONG" ? BRAND : RED;
                return (
                  <div key={t.sym} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2" style={{ borderTop: `1px solid ${HAIR_10}` }}>
                    <div
                      className="px-1.5 py-[2px] text-[8.5px] font-bold tracking-[0.14em]"
                      style={{ color: c, border: `1px solid ${c}66`, background: `${c}10` }}
                    >
                      {t.dir}
                    </div>
                    <div className="flex flex-col">
                      <div className="text-[12px] font-bold leading-none text-white">{t.sym}</div>
                      <div className="text-[9px] tabular-nums" style={{ color: TXT_40 }}>entry {t.entry}</div>
                    </div>
                    <div className="text-[12px] font-bold tabular-nums" style={{ color: c }}>
                      {t.pnl > 0 ? "+" : ""}{t.pnl.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RECENT EXECUTIONS */}
          <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center gap-2">
                <Cpu size={11} style={{ color: BRAND }} />
                <div className="text-[10px] font-bold tracking-[0.18em] text-white">RECENT EXECUTIONS</div>
              </div>
              <div className="text-[9px]" style={{ color: TXT_40 }}>LIVE</div>
            </div>
            <div className="flex flex-col">
              {EXECUTIONS.map((e, i) => {
                const c = e.dir === "LONG" ? BRAND : RED;
                return (
                  <div key={i} className="grid grid-cols-[58px_auto_1fr_auto] items-center gap-2 px-3 py-1.5 text-[10px]" style={{ borderTop: `1px solid ${HAIR_10}` }}>
                    <span className="tabular-nums" style={{ color: TXT_40 }}>{e.t}</span>
                    <span className="font-bold text-white">{e.sym}</span>
                    <span style={{ color: c }} className="font-semibold tracking-[0.10em]">
                      {e.dir}
                      <span className="ml-1.5 font-normal tabular-nums" style={{ color: TXT_65 }}>{e.msg}</span>
                    </span>
                    <span className="text-[9px] font-semibold tracking-[0.14em]" style={{ color: BRAND }}>EXECUTED</span>
                  </div>
                );
              })}
            </div>
            <div className="px-3 py-2 text-center text-[10px] font-semibold tracking-[0.16em]" style={{ borderTop: `1px solid ${HAIR_10}`, color: BRAND }}>
              VIEW FULL FEED
            </div>
          </div>

          {/* RECENT ACTIVITY */}
          <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center gap-2">
                <Radio size={11} style={{ color: BRAND }} />
                <div className="text-[10px] font-bold tracking-[0.18em] text-white">RECENT ACTIVITY</div>
              </div>
              <div className="flex items-center gap-1.5 text-[9px]" style={{ color: TXT_40 }}>
                <span className="h-1 w-1 rounded-full" style={{ background: BRAND, boxShadow: `0 0 5px ${BRAND}` }} />
                AI EVENTS
              </div>
            </div>
            <div className="flex flex-col">
              {ACTIVITY.map((a, i) => (
                <div key={i} className="grid grid-cols-[58px_1fr] items-start gap-2 px-3 py-1.5 text-[10px]" style={{ borderTop: `1px solid ${HAIR_10}` }}>
                  <span className="tabular-nums" style={{ color: TXT_40 }}>{a.t}</span>
                  <span style={{ color: TXT_65 }} className="leading-snug">{a.msg}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PLAN / UPGRADE */}
          <div className="flex items-center justify-between px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
            <div className="flex flex-col">
              <div className="text-[9px] tracking-[0.18em]" style={{ color: TXT_40 }}>PLAN</div>
              <div className="text-[12px] font-bold tracking-[-0.01em] text-white">STARTER · PAPER</div>
            </div>
            <button className="px-2.5 py-1 text-[10px] font-bold tracking-[0.14em]" style={{ color: BG_0, background: BRAND }}>
              UPGRADE TO PRO
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM STATUS */}
      <div
        className="flex h-[30px] items-center gap-4 px-4 text-[10px] tracking-[0.14em]"
        style={{ background: BG_1, borderTop: `1px solid ${HAIR_10}`, color: TXT_65 }}
      >
        <div className="flex items-center gap-1.5 font-semibold" style={{ color: BRAND }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
          MARKET PULSE
        </div>
        <div>19 symbols</div>
        <div>Signals/min <span className="font-bold text-white tabular-nums">4.2</span></div>
        <div>Next scan <span className="font-bold text-white tabular-nums">3s</span></div>
        <div className="ml-2 hidden md:flex items-center gap-4">
          <span>BTC <span className="text-white tabular-nums">$67,284.10</span> <span style={{ color: BRAND }}>+1.92%</span></span>
          <span>ETH <span className="text-white tabular-nums">$3,128.44</span> <span style={{ color: BRAND }}>+1.37%</span></span>
          <span>SOL <span className="text-white tabular-nums">$172.65</span> <span style={{ color: BRAND }}>+2.18%</span></span>
          <span>NVDA <span className="text-white tabular-nums">$949.45</span> <span style={{ color: BRAND }}>+8.85%</span></span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Settings size={11} />
          <span style={{ color: BRAND }}>PAPER MODE · NO REAL ORDERS</span>
        </div>
      </div>
    </div>
  );
}
