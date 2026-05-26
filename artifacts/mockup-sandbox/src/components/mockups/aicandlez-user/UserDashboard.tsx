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

const CRYPTO: Signal[] = [
  { sym: "BTC",  name: "Bitcoin",  dir: "LONG",  reason: "TREND",      price: "$67,284.10", last5m: "$66,910.22", changePct:  1.37, vol: "$48.7M", conf: 92, spark: [10,12,11,14,15,14,18,17,20,22,24,26,27,29] },
  { sym: "ETH",  name: "Ethereum", dir: "LONG",  reason: "MOMENTUM",   price: "$3,128.44",  last5m: "$3,084.10",  changePct:  2.18, vol: "$22.4M", conf: 88, spark: [5,6,5,7,8,7,9,10,12,11,14,15,17,18] },
  { sym: "SOL",  name: "Solana",   dir: "LONG",  reason: "BREAKOUT",   price: "$172.65",    last5m: "$168.81",    changePct:  2.18, vol: "$14.1M", conf: 86, spark: [9,10,11,10,12,13,14,13,15,16,18,19,20,22] },
  { sym: "AVAX", name: "Avalanche",dir: "LONG",  reason: "TREND",      price: "$39.27",     last5m: "$37.12",     changePct:  1.89, vol: "$8.2M",  conf: 82, spark: [8,8.4,8.6,9,9.2,9.5,9.7,10,10.4,10.8,11,11.4,11.8,12.2] },
  { sym: "APT",  name: "Aptos",    dir: "LONG",  reason: "REVERSAL",   price: "$7.95",      last5m: "$6.91",      changePct:  1.23, vol: "$4.6M",  conf: 78, spark: [4,4.2,4.1,4.4,4.3,4.6,4.5,4.8,4.7,5.0,4.9,5.2,5.1,5.4] },
  { sym: "LINK", name: "Chainlink",dir: "LONG",  reason: "MOMENTUM",   price: "$19.74",     last5m: "$18.18",     changePct:  1.07, vol: "$5.1M",  conf: 76, spark: [11,11.3,11.2,11.6,11.5,11.9,11.8,12.2,12.1,12.5,12.4,12.8,12.7,13.1] },
  { sym: "WIF",  name: "Dogwifhat",dir: "SHORT", reason: "TREND",      price: "$2.0840",    last5m: "$2.1920",    changePct: -2.18, vol: "$3.4M",  conf: 81, spark: [22,21,21.6,20.5,20.2,20.8,19.6,19.2,19.8,18.4,18.0,18.6,17.2,16.8] },
  { sym: "NEAR", name: "Near",     dir: "SHORT", reason: "MOMENTUM",   price: "$6.28",      last5m: "$6.412",     changePct: -1.97, vol: "$2.9M",  conf: 77, spark: [18,17.6,17.8,17.2,17.0,17.4,16.6,16.2,16.4,15.6,15.2,15.4,14.6,14.2] },
  { sym: "OP",   name: "Optimism", dir: "SHORT", reason: "TREND",      price: "$1.2747",    last5m: "$1.3148",    changePct: -1.63, vol: "$2.1M",  conf: 74, spark: [16,15.6,15.8,15.0,14.6,14.8,14.0,13.6,13.8,13.0,12.6,12.8,12.0,11.6] },
  { sym: "BONK", name: "Bonk",     dir: "SHORT", reason: "REVERSAL",   price: "$0.00001921",last5m: "$0.00002168",changePct: -2.21, vol: "$1.8M",  conf: 72, spark: [21,20.5,20.7,19.9,19.5,19.7,18.9,18.4,18.6,17.7,17.2,17.4,16.4,16.0] },
];

const EQUITY: Signal[] = [
  { sym: "TSLA", name: "Tesla",    dir: "LONG",  reason: "MOMENTUM",   price: "$248.80",  last5m: "$255.85",  changePct:  8.19, vol: "$1.2B", conf: 94, spark: [12,12.5,12.8,13.4,13.8,14.2,14.8,15.2,15.9,16.4,17.0,17.6,18.2,18.8] },
  { sym: "NVDA", name: "Nvidia",   dir: "LONG",  reason: "MOMENTUM",   price: "$949.45",  last5m: "$966.72",  changePct:  8.85, vol: "$2.4B", conf: 92, spark: [10,10.4,10.8,11.2,11.6,12.0,12.5,13.0,13.6,14.2,14.8,15.4,16.0,16.6] },
  { sym: "AMD",  name: "AMD",      dir: "LONG",  reason: "BREAKOUT",   price: "$165.82",  last5m: "$173.20",  changePct:  0.45, vol: "$890M", conf: 89, spark: [9,9.2,9.4,9.7,9.9,10.2,10.4,10.7,10.9,11.2,11.4,11.7,11.9,12.2] },
  { sym: "AAPL", name: "Apple",    dir: "SHORT", reason: "TREND",      price: "$229.10",  last5m: "$214.50",  changePct: -1.56, vol: "$1.6B", conf: 83, spark: [15,14.8,14.9,14.4,14.2,14.4,13.8,13.6,13.8,13.2,13.0,13.2,12.6,12.2] },
  { sym: "MSFT", name: "Microsoft",dir: "SHORT", reason: "TREND",      price: "$428.18",  last5m: "$412.36",  changePct: -1.83, vol: "$980M", conf: 80, spark: [14,13.8,13.9,13.5,13.2,13.4,12.8,12.6,12.8,12.2,12.0,12.2,11.6,11.2] },
];

const OPEN_TRADES = [
  { sym: "BTC",  dir: "LONG"  as Dir, entry: "$66,810.22", pnl: +1.42 },
  { sym: "TSLA", dir: "LONG"  as Dir, entry: "$244.18",    pnl: +3.81 },
  { sym: "WIF",  dir: "SHORT" as Dir, entry: "$2.1820",    pnl: +2.04 },
];

const EXECUTIONS = [
  { t: "14:22:01", sym: "BTC",  dir: "LONG"  as Dir, msg: "filled @ 67,287",   ok: true },
  { t: "14:19:48", sym: "TSLA", dir: "LONG"  as Dir, msg: "filled @ 244.18",   ok: true },
  { t: "14:14:22", sym: "WIF",  dir: "SHORT" as Dir, msg: "filled @ 2.1820",   ok: true },
  { t: "14:08:11", sym: "ETH",  dir: "LONG"  as Dir, msg: "stop moved 3,080",  ok: true },
  { t: "13:54:30", sym: "SOL",  dir: "LONG"  as Dir, msg: "partial @ 171.40",  ok: true },
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
              { label: "AI PICKS" },
              { label: "HIGH CONFIDENCE ≥75" },
              { label: "READY TO EXECUTE" },
              { label: "LONG BIAS" },
              { label: "SHORT BIAS" },
              { label: "WATCHLIST" },
              { label: "LOW VOL" },
              { label: "TRENDING" },
              { label: "BREAKOUT" },
              { label: "MOMENTUM" },
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
            {/* CRYPTO */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: `1px solid ${HAIR_10}` }}
              >
                <div className="flex items-center gap-2">
                  <Activity size={12} style={{ color: BRAND }} />
                  <div className="text-[11px] font-bold tracking-[0.18em] text-white">TOP 10 CRYPTO SIGNALS</div>
                  <span className="text-[9px]" style={{ color: TXT_40 }}>LONG · SHORT · UNLIMITED AI EXECUTION</span>
                </div>
                <div className="flex items-center gap-1 text-[9px]" style={{ color: TXT_40 }}>
                  <span>L <span className="text-white font-semibold">12</span></span>
                  <span>S <span className="text-white font-semibold">8</span></span>
                  <button className="ml-2 px-1.5 py-0.5" style={{ color: BRAND, border: `1px solid ${BRAND}55` }}>ALL</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>LONG</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>SHORT</button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {CRYPTO.map((s) => <SignalRow key={s.sym} s={s} />)}
              </div>
              <div
                className="px-3 py-2 text-center text-[10px] font-semibold tracking-[0.16em]"
                style={{ borderTop: `1px solid ${HAIR_10}`, color: BRAND }}
              >
                VIEW ALL CRYPTO OPPORTUNITIES
              </div>
            </div>

            {/* EQUITY */}
            <div className="flex flex-col" style={{ background: BG_1, border: `1px solid ${HAIR_10}` }}>
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: `1px solid ${HAIR_10}` }}
              >
                <div className="flex items-center gap-2">
                  <LineChart size={12} style={{ color: BRAND }} />
                  <div className="text-[11px] font-bold tracking-[0.18em] text-white">TOP 10 EQUITY SIGNALS</div>
                  <span className="text-[9px]" style={{ color: TXT_40 }}>LONG · SHORT · UNLIMITED AI EXECUTION</span>
                </div>
                <div className="flex items-center gap-1 text-[9px]" style={{ color: TXT_40 }}>
                  <span>L <span className="text-white font-semibold">12</span></span>
                  <span>S <span className="text-white font-semibold">8</span></span>
                  <button className="ml-2 px-1.5 py-0.5" style={{ color: BRAND, border: `1px solid ${BRAND}55` }}>ALL</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>LONG</button>
                  <button className="px-1.5 py-0.5" style={{ color: TXT_65, border: `1px solid ${HAIR_18}` }}>SHORT</button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {EQUITY.map((s) => <SignalRow key={s.sym} s={s} />)}
                {/* fillers to match crypto height */}
                {[
                  { sym: "GOOGL", name: "Alphabet",  dir: "LONG"  as Dir, reason: "REVERSAL", price: "$174.73", last5m: "$182.50", changePct:  0.71, vol: "$680M", conf: 87, spark: [10,10.2,10.4,10.7,10.9,11.2,11.4,11.7,11.9,12.2,12.4,12.7,12.9,13.2] },
                  { sym: "PLTR",  name: "Palantir",  dir: "LONG"  as Dir, reason: "TREND",    price: "$24.15",  last5m: "$25.48",  changePct:  1.17, vol: "$420M", conf: 86, spark: [11,11.3,11.2,11.6,11.5,11.9,11.8,12.2,12.1,12.5,12.4,12.8,12.7,13.1] },
                  { sym: "AMZN",  name: "Amazon",    dir: "SHORT" as Dir, reason: "MOMENTUM", price: "$189.32", last5m: "$186.41", changePct: -1.25, vol: "$910M", conf: 76, spark: [15,14.8,14.9,14.4,14.2,14.4,13.8,13.6,13.8,13.2,13.0,13.2,12.6,12.2] },
                  { sym: "META",  name: "Meta",      dir: "SHORT" as Dir, reason: "TREND",    price: "$504.23", last5m: "$498.13", changePct: -2.23, vol: "$540M", conf: 74, spark: [14,13.8,13.9,13.5,13.2,13.4,12.8,12.6,12.8,12.2,12.0,12.2,11.6,11.2] },
                  { sym: "NFLX",  name: "Netflix",   dir: "SHORT" as Dir, reason: "MOMENTUM", price: "$561.22", last5m: "$553.10", changePct: -1.83, vol: "$310M", conf: 72, spark: [13,12.9,13.0,12.6,12.4,12.6,12.0,11.8,12.0,11.4,11.2,11.4,10.8,10.4] },
                ].map((s) => <SignalRow key={s.sym} s={s} />)}
              </div>
              <div
                className="px-3 py-2 text-center text-[10px] font-semibold tracking-[0.16em]"
                style={{ borderTop: `1px solid ${HAIR_10}`, color: BRAND }}
              >
                VIEW ALL EQUITY OPPORTUNITIES
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

          {/* EQUITY CARD */}
          <div
            className="flex flex-col gap-2 px-3 py-3"
            style={{ background: BG_2, border: `1px solid ${HAIR_18}` }}
          >
            <div className="flex items-center justify-between">
              <div className="text-[9.5px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>ACCOUNT EQUITY</div>
              <div className="text-[9px] tracking-[0.12em]" style={{ color: TXT_40 }}>USD</div>
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

          {/* Today PNL + Win Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>TODAY P&L</div>
              <div className="text-[18px] font-bold tabular-nums tracking-[-0.03em]" style={{ color: BRAND }}>
                +$1,284.50
              </div>
              <div className="text-[9.5px] tabular-nums" style={{ color: TXT_65 }}>
                +1.20% · 7 trades
              </div>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <ConfRing value={68} color={BRAND} size={48} />
              <div className="flex flex-col">
                <div className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>WIN RATE</div>
                <div className="text-[14px] font-bold tabular-nums tracking-[-0.02em] text-white">68%</div>
                <div className="text-[9px] tabular-nums" style={{ color: TXT_65 }}>34W / 16L · 30d</div>
              </div>
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
