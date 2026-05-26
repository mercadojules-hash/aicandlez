import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Brain,
  Cpu,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  LineChart,
  Newspaper,
  Power,
  Radio,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

const BRAND = "#66FF66";
const LIME = "#7CFF00";
const RED = "#FF3B3B";
const AMBER = "#FFD23F";
const BG_0 = "#000000";
const BG_1 = "#050A07";
const BG_2 = "#0A1410";
const BG_3 = "#0F1F18";
const HAIR_10 = "rgba(124,255,0,0.10)";
const HAIR_18 = "rgba(124,255,0,0.18)";
const TXT_65 = "rgba(255,255,255,0.65)";
const TXT_40 = "rgba(255,255,255,0.40)";

type Dir = "LONG" | "SHORT";
type Signal = {
  sym: string;
  dir: Dir;
  reason: string;
  price: string;
  last5m: string;
  changePct: number;
  conf: number;
  spark: number[];
};

const LONGS: Signal[] = [
  { sym: "BTC",  dir: "LONG", reason: "TREND",     price: "$67,284.10", last5m: "$66,910.22", changePct:  1.37, conf: 94, spark: [10,12,11,14,15,14,18,17,20,22,24,26,27,29] },
  { sym: "ETH",  dir: "LONG", reason: "MOMENTUM",  price: "$3,128.44",  last5m: "$3,084.10",  changePct:  2.18, conf: 91, spark: [5,6,5,7,8,7,9,10,12,11,14,15,17,18] },
  { sym: "SOL",  dir: "LONG", reason: "BREAKOUT",  price: "$172.65",    last5m: "$168.81",    changePct:  2.27, conf: 89, spark: [9,10,11,10,12,13,14,13,15,16,18,19,20,22] },
  { sym: "AVAX", dir: "LONG", reason: "TREND",     price: "$39.27",     last5m: "$37.12",     changePct:  1.89, conf: 87, spark: [8,8.4,8.6,9,9.2,9.5,9.7,10,10.4,10.8,11,11.4,11.8,12.2] },
  { sym: "LINK", dir: "LONG", reason: "MOMENTUM",  price: "$19.74",     last5m: "$18.18",     changePct:  1.71, conf: 85, spark: [11,11.3,11.2,11.6,11.5,11.9,11.8,12.2,12.1,12.5,12.4,12.8,12.7,13.1] },
  { sym: "INJ",  dir: "LONG", reason: "BREAKOUT",  price: "$28.41",     last5m: "$27.10",     changePct:  2.42, conf: 84, spark: [6,6.4,6.6,7,7.2,7.5,7.7,8,8.4,8.8,9,9.4,9.8,10.2] },
  { sym: "TIA",  dir: "LONG", reason: "REVERSAL",  price: "$8.92",      last5m: "$8.41",      changePct:  1.94, conf: 82, spark: [4,4.2,4.1,4.4,4.3,4.6,4.5,4.8,4.7,5.0,4.9,5.2,5.1,5.4] },
  { sym: "SUI",  dir: "LONG", reason: "MOMENTUM",  price: "$1.847",     last5m: "$1.792",     changePct:  1.42, conf: 81, spark: [7,7.2,7.4,7.7,7.9,8.2,8.4,8.7,8.9,9.2,9.4,9.7,9.9,10.2] },
  { sym: "APT",  dir: "LONG", reason: "TREND",     price: "$7.95",      last5m: "$7.61",      changePct:  1.23, conf: 79, spark: [9,9.1,9.3,9.5,9.6,9.8,9.9,10.1,10.2,10.4,10.5,10.7,10.8,11.0] },
  { sym: "ARB",  dir: "LONG", reason: "BREAKOUT",  price: "$1.184",     last5m: "$1.142",     changePct:  1.66, conf: 78, spark: [5,5.2,5.4,5.6,5.7,5.9,6.0,6.2,6.3,6.5,6.6,6.8,6.9,7.1] },
  { sym: "FET",  dir: "LONG", reason: "MOMENTUM",  price: "$2.041",     last5m: "$1.974",     changePct:  1.81, conf: 77, spark: [6,6.1,6.2,6.4,6.5,6.7,6.8,7.0,7.1,7.3,7.4,7.6,7.7,7.9] },
  { sym: "JUP",  dir: "LONG", reason: "TREND",     price: "$1.082",     last5m: "$1.045",     changePct:  1.34, conf: 76, spark: [4,4.1,4.2,4.4,4.5,4.7,4.8,5.0,5.1,5.3,5.4,5.6,5.7,5.9] },
  { sym: "RNDR", dir: "LONG", reason: "BREAKOUT",  price: "$7.84",      last5m: "$7.52",      changePct:  1.92, conf: 75, spark: [5,5.1,5.3,5.5,5.6,5.8,5.9,6.1,6.2,6.4,6.5,6.7,6.8,7.0] },
  { sym: "TAO",  dir: "LONG", reason: "MOMENTUM",  price: "$478.12",    last5m: "$464.20",    changePct:  1.55, conf: 73, spark: [8,8.1,8.2,8.4,8.5,8.7,8.8,9.0,9.1,9.3,9.4,9.6,9.7,9.9] },
  { sym: "ATOM", dir: "LONG", reason: "REVERSAL",  price: "$8.41",      last5m: "$8.12",      changePct:  1.12, conf: 71, spark: [6,6.1,6.0,6.3,6.2,6.5,6.4,6.7,6.6,6.9,6.8,7.1,7.0,7.3] },
];

const SHORTS: Signal[] = [
  { sym: "WIF",   dir: "SHORT", reason: "TREND",    price: "$2.0840",     last5m: "$2.1920",    changePct: -2.41, conf: 92, spark: [22,21,21.6,20.5,20.2,20.8,19.6,19.2,19.8,18.4,18.0,18.6,17.2,16.8] },
  { sym: "PEPE",  dir: "SHORT", reason: "MOMENTUM", price: "$0.00001124", last5m: "$0.00001182",changePct: -2.18, conf: 89, spark: [18,17.6,17.8,17.2,17.0,17.4,16.6,16.2,16.4,15.6,15.2,15.4,14.6,14.2] },
  { sym: "SHIB",  dir: "SHORT", reason: "TREND",    price: "$0.0000241",  last5m: "$0.0000252", changePct: -2.04, conf: 87, spark: [16,15.6,15.8,15.0,14.6,14.8,14.0,13.6,13.8,13.0,12.6,12.8,12.0,11.6] },
  { sym: "BONK",  dir: "SHORT", reason: "REVERSAL", price: "$0.00001921", last5m: "$0.00002168",changePct: -2.91, conf: 85, spark: [21,20.5,20.7,19.9,19.5,19.7,18.9,18.4,18.6,17.7,17.2,17.4,16.4,16.0] },
  { sym: "DOGE",  dir: "SHORT", reason: "TREND",    price: "$0.1382",     last5m: "$0.1421",    changePct: -1.84, conf: 84, spark: [17,16.6,16.8,16.2,16.0,16.2,15.6,15.2,15.4,14.6,14.2,14.4,13.6,13.2] },
  { sym: "FLOKI", dir: "SHORT", reason: "MOMENTUM", price: "$0.000148",   last5m: "$0.000154",  changePct: -2.18, conf: 83, spark: [19,18.5,18.7,18.0,17.6,17.8,17.0,16.6,16.8,16.0,15.6,15.8,15.0,14.6] },
  { sym: "ORDI",  dir: "SHORT", reason: "TREND",    price: "$32.41",      last5m: "$33.62",     changePct: -1.97, conf: 81, spark: [15,14.7,14.8,14.3,14.1,14.3,13.7,13.4,13.6,13.0,12.7,12.9,12.3,11.9] },
  { sym: "NEAR",  dir: "SHORT", reason: "MOMENTUM", price: "$6.28",       last5m: "$6.412",     changePct: -1.74, conf: 80, spark: [14,13.7,13.8,13.3,13.1,13.3,12.7,12.4,12.6,12.0,11.7,11.9,11.3,10.9] },
  { sym: "OP",    dir: "SHORT", reason: "TREND",    price: "$1.2747",     last5m: "$1.3148",    changePct: -1.63, conf: 78, spark: [16,15.6,15.8,15.0,14.6,14.8,14.0,13.6,13.8,13.0,12.6,12.8,12.0,11.6] },
  { sym: "XRP",   dir: "SHORT", reason: "REVERSAL", price: "$0.5212",     last5m: "$0.5341",    changePct: -1.42, conf: 77, spark: [13,12.8,12.9,12.5,12.3,12.5,11.9,11.7,11.9,11.3,11.1,11.3,10.7,10.3] },
  { sym: "ADA",   dir: "SHORT", reason: "TREND",    price: "$0.3841",     last5m: "$0.3922",    changePct: -1.28, conf: 76, spark: [12,11.8,11.9,11.5,11.3,11.5,10.9,10.7,10.9,10.3,10.1,10.3,9.7,9.3] },
  { sym: "JTO",   dir: "SHORT", reason: "MOMENTUM", price: "$2.812",      last5m: "$2.891",     changePct: -1.51, conf: 75, spark: [11,10.7,10.8,10.3,10.1,10.3,9.7,9.4,9.6,9.0,8.7,8.9,8.3,7.9] },
  { sym: "SEI",   dir: "SHORT", reason: "TREND",    price: "$0.482",      last5m: "$0.493",     changePct: -1.19, conf: 73, spark: [10,9.8,9.9,9.5,9.3,9.5,8.9,8.7,8.9,8.3,8.1,8.3,7.7,7.3] },
  { sym: "POL",   dir: "SHORT", reason: "REVERSAL", price: "$0.4124",     last5m: "$0.4218",    changePct: -1.04, conf: 71, spark: [9,8.8,8.9,8.5,8.3,8.5,7.9,7.7,7.9,7.3,7.1,7.3,6.7,6.3] },
  { sym: "FIL",   dir: "SHORT", reason: "MOMENTUM", price: "$4.182",      last5m: "$4.271",     changePct: -1.08, conf: 70, spark: [8,7.8,7.9,7.5,7.3,7.5,6.9,6.7,6.9,6.3,6.1,6.3,5.7,5.3] },
];

const FILLS = [
  { t: "14:22:01", sym: "BTC",  dir: "LONG"  as Dir, pnl: +0.42, status: "EXECUTED" },
  { t: "14:19:48", sym: "ETH",  dir: "LONG"  as Dir, pnl: +0.71, status: "EXECUTED" },
  { t: "14:14:22", sym: "WIF",  dir: "SHORT" as Dir, pnl: +1.14, status: "EXECUTED" },
  { t: "14:08:11", sym: "TAO",  dir: "LONG"  as Dir, pnl: -0.12, status: "REJECTED" },
  { t: "13:54:30", sym: "SOL",  dir: "LONG"  as Dir, pnl: +0.88, status: "EXECUTED" },
];

const RISK_GRID: { sym: string; score: number }[] = [
  { sym: "BTC", score: 28 }, { sym: "ETH", score: 32 }, { sym: "SOL", score: 41 }, { sym: "AVAX", score: 55 },
  { sym: "LINK",score: 38 }, { sym: "ARB", score: 47 }, { sym: "INJ", score: 62 }, { sym: "TIA",  score: 58 },
  { sym: "WIF", score: 78 }, { sym: "PEPE",score: 84 }, { sym: "BONK",score: 91 }, { sym: "DOGE", score: 66 },
];

const EXCHANGES = [
  { name: "Kraken",   ws: "WS",   lat:  84, fills: 142, ok: true  },
  { name: "Coinbase", ws: "WS",   lat: 112, fills:  98, ok: true  },
  { name: "Binance",  ws: "WS",   lat:  68, fills: 214, ok: true  },
  { name: "Bybit",    ws: "WS",   lat:  91, fills:  76, ok: true  },
  { name: "OKX",      ws: "REST", lat: 168, fills:  41, ok: false },
];

const REASONING = [
  { t: "14:22:09", msg: "BTC funding flipped negative on Binance perps — LONG bias confirmed" },
  { t: "14:21:42", msg: "ETH/BTC ratio breaking 0.0466 resistance — rotation into alts forming" },
  { t: "14:20:18", msg: "WIF order book imbalance 3.2x asks — SHORT entry validated @ 2.084" },
  { t: "14:19:01", msg: "SOL absorbing $14M sell wall at 172 — accumulation pattern detected" },
];

function Sparkline({ data, color, w = 130, h = 30 }: { data: number[]; color: string; w?: number; h?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  const gid = `g-${color.replace("#", "")}-${Math.round(data[0] * 1000)}-${Math.round(data[data.length - 1] * 1000)}`;
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

      <div className="flex w-[72px] flex-col">
        <div className="text-[13px] font-bold leading-none tracking-[-0.01em] text-white">{s.sym}</div>
        <div className="mt-1 text-[8.5px] font-semibold tracking-[0.16em]" style={{ color: TXT_40 }}>
          {s.reason}
        </div>
      </div>

      <div className="flex w-[104px] flex-col">
        <div className="text-[11px] font-semibold tabular-nums text-white leading-none">{s.price}</div>
        <div className="mt-1 text-[9px] tabular-nums" style={{ color: TXT_40 }}>5m {s.last5m}</div>
      </div>

      <div className="flex-1 min-w-0">
        <Sparkline data={s.spark} color={color} w={110} h={26} />
      </div>

      <div className="flex w-[52px] flex-col items-end">
        <div className="text-[9px] tracking-[0.14em]" style={{ color: TXT_40 }}>5M</div>
        <div className="text-[11px] font-semibold tabular-nums" style={{ color }}>
          {s.changePct > 0 ? "+" : ""}{s.changePct.toFixed(2)}%
        </div>
      </div>

      <button
        className="px-2 py-1 text-[9.5px] font-bold tracking-[0.16em]"
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

function NavItem({ icon: Icon, label, active, badge }: { icon: any; label: string; active?: boolean; badge?: string }) {
  return (
    <button
      className="relative flex items-center gap-2 px-3 py-[7px] text-[10.5px] font-semibold tracking-[0.10em]"
      style={{
        color: active ? BRAND : TXT_65,
        background: active ? "rgba(102,255,102,0.07)" : "transparent",
        borderLeft: `2px solid ${active ? BRAND : "transparent"}`,
        boxShadow: active ? `inset 0 0 22px rgba(102,255,102,0.08)` : undefined,
      }}
    >
      <Icon size={12} />
      <span>{label.toUpperCase()}</span>
      {badge && (
        <span className="ml-auto text-[8.5px] font-bold tabular-nums" style={{ color: BRAND }}>{badge}</span>
      )}
    </button>
  );
}

function PanelHeader({ icon: Icon, title, right }: { icon: any; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
      <div className="flex items-center gap-2">
        <Icon size={11} style={{ color: BRAND }} />
        <div className="text-[10px] font-bold tracking-[0.18em] text-white">{title}</div>
      </div>
      {right}
    </div>
  );
}

function KpiChip({ label, value, color = "white", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
      <span className="text-[9px] tracking-[0.16em]" style={{ color: TXT_40 }}>{label}</span>
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{value}</span>
      {sub && <span className="text-[9px] font-semibold tabular-nums" style={{ color: BRAND }}>{sub}</span>}
    </div>
  );
}

function riskColor(score: number) {
  if (score < 35) return BRAND;
  if (score < 55) return LIME;
  if (score < 75) return AMBER;
  return RED;
}

export default function Operator() {
  const [now, setNow] = useState(new Date());
  const [armed, setArmed] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = now.toISOString().split("T")[1].split(".")[0] + " UTC";

  const nav = [
    { label: "Dashboard",          icon: LayoutDashboard },
    { label: "Live Trading",       icon: Radio },
    { label: "AI Engine",          icon: Cpu },
    { label: "Top Opportunities",  icon: Target, active: true, badge: "30" },
    { label: "Watchlist",          icon: Star },
    { label: "Positions",          icon: Wallet },
    { label: "Orders",             icon: TrendingUp },
    { label: "Paper Trading",      icon: FlaskConical },
    { label: "Risk Management",    icon: ShieldAlert },
    { label: "AI Analytics",       icon: Brain },
    { label: "Market Intel",       icon: LineChart },
    { label: "News & Sentiment",   icon: Newspaper },
    { label: "Alerts",             icon: Bell },
    { label: "Performance",        icon: BarChart3 },
    { label: "Settings",           icon: Settings },
  ];

  return (
    <div
      className="flex min-h-screen w-full"
      style={{
        background: `radial-gradient(1200px 600px at 30% -10%, rgba(102,255,102,0.06), transparent 60%), ${BG_0}`,
        color: "white",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
        fontFeatureSettings: '"tnum"',
      }}
    >
      {/* LEFT SIDEBAR */}
      <aside
        className="flex w-[228px] shrink-0 flex-col"
        style={{ background: BG_1, borderRight: `1px solid ${HAIR_10}` }}
      >
        <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
          <div className="grid h-6 w-6 place-items-center" style={{ background: BRAND, color: BG_0 }}>
            <Zap size={13} strokeWidth={3} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[13px] font-bold tracking-[-0.02em] text-white">AICandlez</span>
            <span className="mt-1 text-[8.5px] font-bold tracking-[0.24em]" style={{ color: BRAND }}>OPERATOR · v2.14.7</span>
          </div>
        </div>

        <div className="flex flex-col py-2">
          {nav.map((n) => (
            <NavItem key={n.label} icon={n.icon} label={n.label} active={n.active} badge={n.badge} />
          ))}
        </div>

        <div className="mt-auto px-3 pb-3">
          <div className="flex flex-col gap-2 px-3 py-3" style={{ background: BG_2, border: `1px solid ${HAIR_18}` }}>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: BRAND, opacity: 0.6 }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: BRAND, boxShadow: `0 0 8px ${BRAND}` }} />
              </span>
              <span className="text-[9.5px] font-bold tracking-[0.18em]" style={{ color: BRAND }}>ENGINE ACTIVE</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-[9.5px] tabular-nums">
              <span style={{ color: TXT_40 }}>UPTIME</span><span className="text-right text-white">42d 11h</span>
              <span style={{ color: TXT_40 }}>SYM/SEC</span><span className="text-right text-white">187</span>
              <span style={{ color: TXT_40 }}>LAST TICK</span><span className="text-right text-white">14:22:09</span>
              <span style={{ color: TXT_40 }}>MODE</span><span className="text-right font-bold" style={{ color: BRAND }}>LIVE</span>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT SIDE */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TOP BAR */}
        <div
          className="flex h-[44px] items-center gap-2 px-3"
          style={{ background: BG_1, borderBottom: `1px solid ${HAIR_10}` }}
        >
          <div className="flex items-center gap-1.5 px-2 py-1" style={{ background: "rgba(102,255,102,0.08)", border: `1px solid ${BRAND}55` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
            <span className="text-[9.5px] font-bold tracking-[0.18em]" style={{ color: BRAND }}>ENGINE ACTIVE</span>
          </div>
          <KpiChip label="OPEN LIVE" value="3 / 3" color={BRAND} />
          <KpiChip label="SIG/MIN" value="4.2" />
          <KpiChip label="BTC" value="$67,284" sub="+1.92%" />
          <KpiChip label="ETH" value="$3,128" sub="+1.37%" />
          <KpiChip label="VOL 24H" value="$84.2B" />
          <KpiChip label="GLOBAL P&L" value="+$12,481.20" color={BRAND} />

          <div className="ml-auto flex items-center gap-3">
            <div className="text-[10px] tabular-nums" style={{ color: TXT_65 }}>
              <span style={{ color: TXT_40 }}>◷ </span>{clock}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1" style={{ border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
              <span className="text-[9.5px] font-bold tracking-[0.18em]" style={{ color: BRAND }}>LIVE</span>
            </div>
            <Bell size={13} style={{ color: TXT_65 }} />
            <div className="grid h-7 w-7 place-items-center text-[10px] font-bold" style={{ background: BG_3, color: BRAND, border: `1px solid ${HAIR_18}` }}>
              OP
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="grid flex-1 gap-3 px-3 py-3" style={{ gridTemplateColumns: "1fr 1fr 340px" }}>
          {/* LONG COLUMN */}
          <div className="flex min-w-0 flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
            <PanelHeader
              icon={Activity}
              title="TOP 15 LONG CRYPTO SIGNALS"
              right={
                <div className="flex items-center gap-2 text-[9px]" style={{ color: TXT_40 }}>
                  <span>AVG CONF <span className="font-bold text-white">81%</span></span>
                  <button className="px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.14em]" style={{ color: BRAND, border: `1px solid ${BRAND}55`, background: "rgba(102,255,102,0.06)" }}>EXECUTE ALL</button>
                </div>
              }
            />
            <div className="flex flex-col gap-1.5 p-2">
              {LONGS.map((s) => <SignalRow key={s.sym} s={s} />)}
            </div>
          </div>

          {/* SHORT COLUMN */}
          <div className="flex min-w-0 flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
            <PanelHeader
              icon={Activity}
              title="TOP 15 SHORT CRYPTO SIGNALS"
              right={
                <div className="flex items-center gap-2 text-[9px]" style={{ color: TXT_40 }}>
                  <span>AVG CONF <span className="font-bold text-white">79%</span></span>
                  <button className="px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.14em]" style={{ color: RED, border: `1px solid ${RED}66`, background: "rgba(255,59,59,0.06)" }}>EXECUTE ALL</button>
                </div>
              }
            />
            <div className="flex flex-col gap-1.5 p-2">
              {SHORTS.map((s) => <SignalRow key={s.sym} s={s} />)}
            </div>
          </div>

          {/* OPERATOR RAIL */}
          <div className="flex flex-col gap-3">
            {/* OPERATOR CONTROLS */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_18}` }}>
              <PanelHeader
                icon={Power}
                title="OPERATOR CONTROLS"
                right={<span className="text-[8.5px] font-bold tracking-[0.18em]" style={{ color: BRAND }}>ARMED</span>}
              />
              <div className="flex flex-col gap-2.5 px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-[0.14em]" style={{ color: TXT_65 }}>ARM LIVE</span>
                  <button
                    onClick={() => setArmed((v) => !v)}
                    className="relative h-[18px] w-[36px]"
                    style={{
                      background: armed ? "rgba(102,255,102,0.18)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${armed ? BRAND : "rgba(255,255,255,0.18)"}`,
                    }}
                  >
                    <span
                      className="absolute top-[1px] h-[14px] w-[14px] transition-all"
                      style={{
                        left: armed ? 19 : 1,
                        background: armed ? BRAND : "rgba(255,255,255,0.4)",
                        boxShadow: armed ? `0 0 8px ${BRAND}` : "none",
                      }}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button className="px-2 py-1.5 text-[9.5px] font-bold tracking-[0.14em]" style={{ color: AMBER, border: `1px solid ${AMBER}55`, background: "rgba(255,210,63,0.04)" }}>
                    PAUSE ENGINE
                  </button>
                  <button className="px-2 py-1.5 text-[9.5px] font-bold tracking-[0.14em]" style={{ color: RED, border: `1px solid ${RED}55`, background: "rgba(255,59,59,0.04)" }}>
                    KILL SWITCH
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[9.5px] tracking-[0.14em]">
                    <span style={{ color: TXT_65 }}>MIN CONFIDENCE</span>
                    <span className="font-bold tabular-nums" style={{ color: BRAND }}>60</span>
                  </div>
                  <div className="relative h-[4px]" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="absolute h-full" style={{ width: "60%", background: BRAND }} />
                    <div className="absolute h-[10px] w-[10px] -top-[3px]" style={{ left: "calc(60% - 5px)", background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[9.5px] tracking-[0.14em]">
                  <span style={{ color: TXT_65 }}>CONCURRENT CAP</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className="grid h-[16px] w-[16px] place-items-center text-[9px] font-bold tabular-nums"
                        style={{
                          color: n <= 3 ? BG_0 : TXT_40,
                          background: n <= 3 ? BRAND : "transparent",
                          border: `1px solid ${n <= 3 ? BRAND : HAIR_18}`,
                        }}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* AI EXECUTION OVERVIEW */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <PanelHeader icon={Cpu} title="AI EXECUTION OVERVIEW" right={<span className="text-[9px]" style={{ color: TXT_40 }}>LAST 5</span>} />
              <div className="flex flex-col">
                {FILLS.map((f, i) => {
                  const c = f.dir === "LONG" ? BRAND : RED;
                  const ok = f.status === "EXECUTED";
                  return (
                    <div key={i} className="grid grid-cols-[52px_auto_auto_1fr_auto] items-center gap-2 px-3 py-1.5 text-[10px]" style={{ borderTop: `1px solid ${HAIR_10}` }}>
                      <span className="tabular-nums" style={{ color: TXT_40 }}>{f.t}</span>
                      <span className="font-bold text-white">{f.sym}</span>
                      <span className="text-[9px] font-semibold tracking-[0.10em]" style={{ color: c }}>{f.dir}</span>
                      <span className="text-right font-semibold tabular-nums" style={{ color: f.pnl >= 0 ? BRAND : RED }}>
                        {f.pnl >= 0 ? "+" : ""}{f.pnl.toFixed(2)}%
                      </span>
                      <span className="text-[8.5px] font-bold tracking-[0.14em]" style={{ color: ok ? BRAND : RED }}>{f.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RISK TELEMETRY */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <PanelHeader
                icon={Gauge}
                title="RISK TELEMETRY"
                right={<span className="text-[9px] tabular-nums" style={{ color: TXT_40 }}>VAR 24H <span className="font-semibold text-white">$2,418</span></span>}
              />
              <div className="grid grid-cols-4 gap-1 p-2">
                {RISK_GRID.map((r) => {
                  const c = riskColor(r.score);
                  return (
                    <div
                      key={r.sym}
                      className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5"
                      style={{ background: `${c}12`, border: `1px solid ${c}55` }}
                    >
                      <span className="text-[9.5px] font-bold text-white">{r.sym}</span>
                      <span className="text-[9px] font-semibold tabular-nums" style={{ color: c }}>{r.score}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-1 px-3 py-2" style={{ borderTop: `1px solid ${HAIR_10}` }}>
                <div className="flex items-center justify-between text-[9.5px] tracking-[0.14em]">
                  <span style={{ color: TXT_65 }}>RISK BUDGET</span>
                  <span className="font-bold tabular-nums text-white">62% / 100%</span>
                </div>
                <div className="h-[5px]" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full" style={{ width: "62%", background: `linear-gradient(90deg, ${BRAND}, ${AMBER})` }} />
                </div>
              </div>
            </div>

            {/* ENGINE STATE */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <PanelHeader icon={Sparkles} title="ENGINE STATE" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[9.5px] tabular-nums">
                <span style={{ color: TXT_65 }}>tradingLoop tick</span><span className="text-right text-white">218ms</span>
                <span style={{ color: TXT_65 }}>MTF funnel pass</span><span className="text-right" style={{ color: BRAND }}>71%</span>
                <span style={{ color: TXT_65 }}>volume confirm</span><span className="text-right" style={{ color: BRAND }}>88%</span>
                <span style={{ color: TXT_65 }}>sideways block</span><span className="text-right text-white">24</span>
                <span style={{ color: TXT_65 }}>signals/min</span><span className="text-right text-white">4.2</span>
                <span style={{ color: TXT_65 }}>queue depth</span><span className="text-right text-white">0 / 32</span>
              </div>
            </div>

            {/* EXCHANGE TOPOLOGY */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <PanelHeader icon={Radio} title="EXCHANGE TOPOLOGY" right={<span className="text-[9px]" style={{ color: TXT_40 }}>5 VENUES</span>} />
              <div className="flex flex-col">
                {EXCHANGES.map((x) => (
                  <div key={x.name} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-3 py-1.5 text-[10px]" style={{ borderTop: `1px solid ${HAIR_10}` }}>
                    <span className="font-semibold text-white">{x.name}</span>
                    <span className="text-[8.5px] font-bold tracking-[0.14em]" style={{ color: x.ws === "WS" ? BRAND : AMBER }}>{x.ws}</span>
                    <span className="tabular-nums" style={{ color: TXT_65 }}>{x.lat}ms</span>
                    <span className="text-[9px] tabular-nums" style={{ color: TXT_40 }}>{x.fills}f</span>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.ok ? BRAND : RED, boxShadow: `0 0 6px ${x.ok ? BRAND : RED}` }} />
                  </div>
                ))}
              </div>
            </div>

            {/* AI REASONING */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <PanelHeader
                icon={Brain}
                title="AI REASONING STREAM"
                right={
                  <div className="flex items-center gap-1 text-[8.5px] font-bold tracking-[0.18em]" style={{ color: BRAND }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
                    LIVE
                  </div>
                }
              />
              <div className="flex flex-col">
                {REASONING.map((r, i) => (
                  <div key={i} className="flex flex-col gap-1 px-3 py-2" style={{ borderTop: `1px solid ${HAIR_10}` }}>
                    <div className="text-[9px] tabular-nums tracking-[0.12em]" style={{ color: TXT_40 }}>{r.t}</div>
                    <div className="text-[10.5px] leading-snug" style={{ color: "rgba(255,255,255,0.86)" }}>{r.msg}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM AI EXECUTOR BAR */}
        <div
          className="flex h-[32px] items-center gap-4 px-3 text-[10px] tracking-[0.14em]"
          style={{ background: BG_1, borderTop: `1px solid ${HAIR_10}`, color: TXT_65 }}
        >
          <div className="flex items-center gap-1.5 font-bold" style={{ color: BRAND }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}` }} />
            AI EXECUTOR · LIVE
          </div>
          <span>OPEN <span className="font-bold text-white tabular-nums">3</span></span>
          <span>LAST FILL <span className="font-bold text-white">BTC LONG</span> <span style={{ color: BRAND }} className="font-bold tabular-nums">+0.42%</span></span>
          <span>QUEUE <span className="font-bold text-white tabular-nums">0</span></span>
          <span>LATENCY <span className="font-bold text-white tabular-nums">142ms</span></span>
          <span>SLIPPAGE <span className="font-bold text-white tabular-nums">0.04%</span></span>
          <span>FEES 24H <span className="font-bold text-white tabular-nums">$184.20</span></span>
          <span>RISK BUDGET <span className="font-bold tabular-nums" style={{ color: BRAND }}>62%</span></span>
          <div className="ml-auto flex items-center gap-3">
            <span style={{ color: TXT_40 }}>BUILD 2.14.7</span>
            <span style={{ color: TXT_40 }}>region us-east-1</span>
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} style={{ color: BRAND }} />
              <span style={{ color: BRAND }} className="font-bold">STABLE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
