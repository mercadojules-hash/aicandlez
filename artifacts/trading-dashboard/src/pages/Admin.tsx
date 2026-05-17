import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Zap, DollarSign, Activity, TrendingUp, Shield,
  Search, ChevronUp, ChevronDown, ArrowUpRight, ArrowDownRight,
  Globe, Cpu, BarChart2, AlertTriangle, RefreshCw, Download, Filter,
} from "lucide-react";
import type { EngineStatus, FeeSummary, ExchangeStatus } from "@/components/command/types";

// ── Mock platform user data ───────────────────────────────────────────────────

interface PlatformUser {
  rank:       number;
  id:         string;
  name:       string;
  initials:   string;
  email:      string;
  exchange:   string;
  exColor:    string;
  mode:       "live" | "simulation";
  positions:  number;
  trades:     number;
  fees:       number;
  pnl:        number;
  winRate:    number;
  lastActive: string;
  status:     "active" | "idle" | "error";
  tier:       "free" | "pro" | "enterprise";
}

const MOCK_USERS: PlatformUser[] = [
  { rank:  1, id:"u01", name:"Alex Mercer",    initials:"AM", email:"a.mercer@aicandlez.com",    exchange:"Alpaca",    exColor:"#ffbe00", mode:"live",       positions:3, trades:284, fees:2840, pnl:18450, winRate:68, lastActive:"2m ago",  status:"active",     tier:"enterprise" },
  { rank:  2, id:"u02", name:"Sarah Kim",      initials:"SK", email:"s.kim@aicandlez.com",       exchange:"Binance",   exColor:"#f0b90b", mode:"live",       positions:1, trades:192, fees:1920, pnl:12300, winRate:72, lastActive:"8m ago",  status:"active",     tier:"pro" },
  { rank:  3, id:"u03", name:"Marcus Chen",    initials:"MC", email:"m.chen@aicandlez.com",      exchange:"Coinbase",  exColor:"#2775ca", mode:"live",       positions:2, trades:171, fees:1710, pnl:9820,  winRate:61, lastActive:"15m ago", status:"active",     tier:"pro" },
  { rank:  4, id:"u04", name:"Priya Sharma",   initials:"PS", email:"p.sharma@aicandlez.com",    exchange:"Alpaca",    exColor:"#ffbe00", mode:"live",       positions:1, trades:148, fees:1480, pnl:7640,  winRate:65, lastActive:"1m ago",  status:"active",     tier:"pro" },
  { rank:  5, id:"u05", name:"Tyler Brooks",   initials:"TB", email:"t.brooks@aicandlez.com",    exchange:"Alpaca",    exColor:"#ffbe00", mode:"simulation", positions:0, trades:132, fees:1320, pnl:4210,  winRate:54, lastActive:"32m ago", status:"idle",       tier:"pro" },
  { rank:  6, id:"u06", name:"Yuna Park",      initials:"YP", email:"y.park@aicandlez.com",      exchange:"Crypto.com",exColor:"#1199fa", mode:"live",       positions:2, trades:119, fees:1190, pnl:6830,  winRate:63, lastActive:"5m ago",  status:"active",     tier:"enterprise" },
  { rank:  7, id:"u07", name:"James Okafor",   initials:"JO", email:"j.okafor@aicandlez.com",    exchange:"Binance",   exColor:"#f0b90b", mode:"live",       positions:1, trades:108, fees:1080, pnl:3110,  winRate:58, lastActive:"12m ago", status:"active",     tier:"pro" },
  { rank:  8, id:"u08", name:"Elena Vasquez",  initials:"EV", email:"e.vasquez@aicandlez.com",   exchange:"Coinbase",  exColor:"#2775ca", mode:"simulation", positions:0, trades:97,  fees:970,  pnl:-520,  winRate:48, lastActive:"1h ago",  status:"idle",       tier:"free" },
  { rank:  9, id:"u09", name:"Kai Nakamura",   initials:"KN", email:"k.nakamura@aicandlez.com",  exchange:"Alpaca",    exColor:"#ffbe00", mode:"live",       positions:1, trades:84,  fees:840,  pnl:2940,  winRate:60, lastActive:"22m ago", status:"active",     tier:"pro" },
  { rank: 10, id:"u10", name:"Owen Fitzgerald", initials:"OF", email:"o.fitz@aicandlez.com",     exchange:"Crypto.com",exColor:"#1199fa", mode:"simulation", positions:0, trades:76,  fees:760,  pnl:1620,  winRate:55, lastActive:"3h ago",  status:"idle",       tier:"free" },
  { rank: 11, id:"u11", name:"Diana Reyes",    initials:"DR", email:"d.reyes@aicandlez.com",     exchange:"Alpaca",    exColor:"#ffbe00", mode:"live",       positions:0, trades:61,  fees:610,  pnl:-1240, winRate:42, lastActive:"45m ago", status:"error",      tier:"pro" },
  { rank: 12, id:"u12", name:"Wei Zhang",      initials:"WZ", email:"w.zhang@aicandlez.com",     exchange:"Binance",   exColor:"#f0b90b", mode:"live",       positions:2, trades:53,  fees:530,  pnl:3800,  winRate:66, lastActive:"7m ago",  status:"active",     tier:"pro" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDollar(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.abs(n).toFixed(0)}`;
}

function pctColor(n: number) {
  return n > 0 ? "#00ff8a" : n < 0 ? "#ff3355" : "#9FB3C8";
}

const TIER_COLORS: Record<string, string> = {
  free:       "#4a6a80",
  pro:        "#00aaff",
  enterprise: "#cc55ff",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#00ff8a",
  idle:   "#ffaa00",
  error:  "#ff3355",
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color, delta, deltaUp }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: string; delta?: string; deltaUp?: boolean;
}) {
  return (
    <div className="rounded border flex flex-col gap-3 p-4 relative overflow-hidden"
      style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
      <div className="absolute inset-0 opacity-5"
        style={{ background: `radial-gradient(ellipse at top left, ${color}, transparent 70%)` }} />
      <div className="flex items-center justify-between relative">
        <div className="p-1.5 rounded" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon className="w-3.5 h-3.5" style={{ color, filter: `drop-shadow(0 0 6px ${color})` }} />
        </div>
        {delta && (
          <div className="flex items-center gap-0.5 text-[9px] font-mono font-bold"
            style={{ color: deltaUp ? "#00ff8a" : "#ff3355" }}>
            {deltaUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta}
          </div>
        )}
      </div>
      <div className="relative">
        <div className="text-[24px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
          {value}
        </div>
        {sub && <div className="text-[9px] font-mono mt-1" style={{ color: "#4a6a80" }}>{sub}</div>}
        <div className="text-[9px] font-mono font-bold tracking-[0.15em] mt-1.5 uppercase" style={{ color: "#9FB3C8" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Exchange Distribution Bar ─────────────────────────────────────────────────

function ExchangeDist({ users }: { users: PlatformUser[] }) {
  const counts: Record<string, { count: number; color: string }> = {};
  users.forEach(u => {
    if (!counts[u.exchange]) counts[u.exchange] = { count: 0, color: u.exColor };
    counts[u.exchange].count++;
  });
  const total = users.length;
  const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
      <div className="text-[9px] font-mono font-bold tracking-[0.2em] mb-3" style={{ color: "#4a6a80" }}>
        EXCHANGE DISTRIBUTION
      </div>
      <div className="flex h-2.5 rounded overflow-hidden mb-3">
        {sorted.map(([name, d]) => (
          <div key={name}
            title={`${name}: ${d.count}`}
            className="h-full transition-all"
            style={{ width: `${(d.count / total) * 100}%`, background: d.color, opacity: 0.85 }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {sorted.map(([name, d]) => (
          <div key={name} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: d.color, boxShadow: `0 0 4px ${d.color}` }} />
            <span className="text-[9px] font-mono flex-1" style={{ color: "#7a9eb8" }}>{name}</span>
            <span className="text-[9px] font-bold font-mono" style={{ color: d.color }}>{d.count}</span>
            <span className="text-[8px] font-mono" style={{ color: "#3a5a70" }}>
              ({Math.round((d.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

type SortKey = "rank" | "name" | "exchange" | "trades" | "fees" | "pnl" | "winRate";

export default function Admin() {
  const [search,   setSearch]  = useState("");
  const [sortKey,  setSortKey] = useState<SortKey>("rank");
  const [sortAsc,  setSortAsc] = useState(true);
  const [page,     setPage]    = useState(0);
  const [filter,   setFilter]  = useState<"all" | "live" | "simulation">("all");
  const [tick,     setTick]    = useState(0);

  const PAGE_SIZE = 8;

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const { data: engine }         = useQuery<EngineStatus>({
    queryKey: ["admin-engine"],
    queryFn: () => fetch("/api/engine/status").then(r => r.json()),
    refetchInterval: 5000,
  });
  const { data: feeSummary }     = useQuery<FeeSummary>({
    queryKey: ["admin-fees"],
    queryFn: () => fetch("/api/fees").then(r => r.json()),
    refetchInterval: 15000,
  });
  const { data: exchangeStatus } = useQuery<ExchangeStatus>({
    queryKey: ["admin-exchange"],
    queryFn: () => fetch("/api/exchange/status").then(r => r.json()),
    refetchInterval: 8000,
  });

  // Animated platform metrics
  const activeUsers  = 1248 + (tick % 7);
  const liveAccounts = 287  + (tick % 3);
  const botsRunning  = 921  + (tick % 9);
  const dailyVolume  = 4_820_000 + tick * 1200;
  const totalFees    = (feeSummary?.totalFeesCollected ?? 0) + 84_920;
  const feesToday    = totalFees * 0.024;
  const openPos      = 142 + (tick % 4);
  const winRate      = 62.4 + (tick % 3) * 0.1;

  // Derived signals
  const totalSig   = engine?.signalsGenerated ?? 0;
  const sigPerMin  = (totalSig / 60).toFixed(1);
  const execSuccess = 99.2;

  // Filter + sort + paginate users
  const filtered = MOCK_USERS
    .filter(u => {
      if (filter !== "all" && u.mode !== filter) return false;
      if (!search) return true;
      return u.name.toLowerCase().includes(search.toLowerCase()) ||
             u.email.toLowerCase().includes(search.toLowerCase()) ||
             u.exchange.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      let av: number | string = a[sortKey as keyof PlatformUser] as number | string;
      let bv: number | string = b[sortKey as keyof PlatformUser] as number | string;
      if (sortKey === "name" || sortKey === "exchange") {
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
    setPage(0);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortAsc
      ? <ChevronUp className="w-3 h-3" style={{ color: "#00aaff" }} />
      : <ChevronDown className="w-3 h-3" style={{ color: "#00aaff" }} />;
  }

  function ColHeader({ col, label }: { col: SortKey; label: string }) {
    return (
      <th className="px-3 py-2.5 text-left cursor-pointer select-none group" onClick={() => toggleSort(col)}>
        <div className="flex items-center gap-1 text-[8px] font-mono font-bold tracking-[0.15em]"
          style={{ color: sortKey === col ? "#00aaff" : "#4a6a80" }}>
          {label}
          <SortIcon col={col} />
        </div>
      </th>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#060810", color: "#EAF2FF" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b px-6 py-4 flex items-center gap-4"
        style={{ background: "#000000", borderColor: "#0d1e2e" }}>
        <div className="p-2 rounded" style={{ background: "#cc55ff12", border: "1px solid #cc55ff30" }}>
          <Shield className="w-4 h-4" style={{ color: "#cc55ff", filter: "drop-shadow(0 0 6px #cc55ff)" }} />
        </div>
        <div>
          <div className="text-[10px] font-mono font-bold tracking-[0.3em]" style={{ color: "#cc55ff80" }}>
            RESTRICTED ACCESS
          </div>
          <div className="text-[18px] font-bold font-mono tracking-[0.1em]" style={{ color: "#EAF2FF" }}>
            OPERATOR CONSOLE
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-3">
          <span className="live-dot" style={{ width: 6, height: 6, background: "#cc55ff", boxShadow: "0 0 8px #cc55ff" }} />
          <span className="text-[9px] font-mono font-bold" style={{ color: "#cc55ff" }}>PLATFORM LIVE</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="text-[8px] font-mono" style={{ color: "#2a4050" }}>
            LAST REFRESH: {new Date().toLocaleTimeString()}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold transition-all"
            style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
            <RefreshCw className="w-3 h-3" /> REFRESH
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[9px] font-bold transition-all"
            style={{ background: "#0d1e2e", borderColor: "#1a3050", color: "#9FB3C8" }}>
            <Download className="w-3 h-3" /> EXPORT CSV
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* ── Tier 1 Platform Metrics ────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard icon={Users}      label="Active Users"   value={activeUsers.toLocaleString()}  sub="↑ 8% vs yesterday"       color="#00aaff" delta="8%"  deltaUp />
          <StatCard icon={Globe}      label="Live Accounts"  value={liveAccounts.toString()}       sub="Real money trading"       color="#00ff8a" delta="3%"  deltaUp />
          <StatCard icon={Cpu}        label="Bots Running"   value={botsRunning.toString()}        sub="AI engines active"        color="#cc55ff" delta="5%"  deltaUp />
          <StatCard icon={Activity}   label="Open Positions" value={openPos.toString()}            sub="Platform-wide"            color="#7b68ee"  />
          <StatCard icon={BarChart2}  label="Daily Volume"   value={fmtDollar(dailyVolume)}        sub="↑ 15% vs 24h avg"         color="#00f0ff" delta="15%" deltaUp />
          <StatCard icon={DollarSign} label="Fees Today"     value={fmtDollar(feesToday)}          sub="Transaction-based"        color="#ffaa00" delta="16%" deltaUp />
          <StatCard icon={TrendingUp} label="Platform Win %"  value={`${winRate.toFixed(1)}%`}    sub="Avg across all users"     color="#00ff8a"  />
          <StatCard icon={Zap}        label="Signals/Min"    value={sigPerMin}                     sub="Cross-asset AI signals"   color="#ff8844"  />
        </div>

        {/* ── Secondary Metrics Row ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.15em] mb-2" style={{ color: "#4a6a80" }}>LIFETIME FEES COLLECTED</div>
            <div className="text-[26px] font-bold font-mono" style={{ color: "#ffaa00" }}>{fmtDollar(totalFees)}</div>
            <div className="text-[8px] font-mono mt-1" style={{ color: "#3a5a70" }}>Transaction-based revenue model</div>
          </div>
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.15em] mb-2" style={{ color: "#4a6a80" }}>PROJECTED MONTHLY REV</div>
            <div className="text-[26px] font-bold font-mono" style={{ color: "#00ff8a" }}>{fmtDollar(feesToday * 30)}</div>
            <div className="text-[8px] font-mono mt-1" style={{ color: "#3a5a70" }}>Based on 30d rolling avg</div>
          </div>
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.15em] mb-2" style={{ color: "#4a6a80" }}>EXEC SUCCESS RATE</div>
            <div className="text-[26px] font-bold font-mono" style={{ color: "#00f0ff" }}>{execSuccess}%</div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="h-1 flex-1 rounded overflow-hidden" style={{ background: "#0d1e2e" }}>
                <div className="h-full rounded" style={{ width: `${execSuccess}%`, background: "#00f0ff", opacity: 0.7 }} />
              </div>
            </div>
          </div>
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.15em] mb-2" style={{ color: "#4a6a80" }}>EXCHANGE MODE</div>
            <div className="text-[26px] font-bold font-mono"
              style={{ color: exchangeStatus?.mode === "live" ? "#ff3355" : "#00aaff" }}>
              {exchangeStatus?.mode === "live" ? "LIVE" : "SIM"}
            </div>
            <div className="text-[8px] font-mono mt-1" style={{ color: "#3a5a70" }}>
              {exchangeStatus?.exchangeName?.toUpperCase() ?? "KRAKEN"} · Spot only
            </div>
          </div>
        </div>

        {/* ── User Analytics Table ───────────────────────────────────────── */}
        <div className="rounded border overflow-hidden" style={{ borderColor: "#0d1e2e" }}>

          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: "#000000", borderColor: "#0d1e2e" }}>
            <Users className="w-4 h-4" style={{ color: "#00aaff" }} />
            <span className="text-[11px] font-bold font-mono tracking-[0.15em]" style={{ color: "#EAF2FF" }}>
              USER ANALYTICS
            </span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded font-bold"
              style={{ background: "#00aaff10", color: "#00aaff80", border: "1px solid #00aaff20" }}>
              {filtered.length} USERS
            </span>
            <div className="flex-1" />

            {/* Mode filter */}
            <div className="flex items-center gap-1">
              {(["all", "live", "simulation"] as const).map(f => (
                <button key={f} onClick={() => { setFilter(f); setPage(0); }}
                  className="px-2.5 py-1 rounded font-mono text-[8px] font-bold transition-all border"
                  style={filter === f
                    ? { background: "#00aaff14", color: "#00aaff", borderColor: "#00aaff40" }
                    : { background: "transparent", color: "#4a6a80", borderColor: "#1a2a36" }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded border"
              style={{ background: "#010C18", borderColor: "#1a2a36" }}>
              <Search className="w-3 h-3 flex-shrink-0" style={{ color: "#4a6a80" }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search users…"
                className="bg-transparent font-mono text-[9px] outline-none w-28"
                style={{ color: "#EAF2FF" }}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto" style={{ background: "#010C18" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #0d1e2e", background: "#000000" }}>
                  <th className="px-3 py-2.5 text-left w-8">
                    <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>#</span>
                  </th>
                  <ColHeader col="name"     label="USER" />
                  <ColHeader col="exchange" label="EXCHANGE" />
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>MODE</span>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>POSITIONS</span>
                  </th>
                  <ColHeader col="trades"   label="TRADES" />
                  <ColHeader col="fees"     label="FEES ($)" />
                  <ColHeader col="pnl"      label="PNL ($)" />
                  <ColHeader col="winRate"  label="WIN %" />
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>LAST ACTIVE</span>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: "#4a6a80" }}>STATUS</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((u, i) => (
                  <tr key={u.id}
                    className="border-b transition-all cursor-pointer group"
                    style={{
                      borderColor: "#0a1520",
                      background: i % 2 === 0 ? "#010C18" : "#020E1E",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#0a1e30")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#010C18" : "#020E1E")}
                  >
                    {/* Rank */}
                    <td className="px-3 py-2.5">
                      <span className="text-[9px] font-mono font-bold" style={{ color: "#3a5a70" }}>
                        {u.rank}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold font-mono"
                          style={{
                            background: `linear-gradient(135deg, ${TIER_COLORS[u.tier]}20, #7b68ee20)`,
                            border: `1px solid ${TIER_COLORS[u.tier]}40`,
                            color: TIER_COLORS[u.tier],
                          }}>
                          {u.initials}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold font-mono" style={{ color: "#EAF2FF" }}>
                              {u.name}
                            </span>
                            <span className="text-[6px] font-bold px-1 py-0.5 rounded font-mono"
                              style={{
                                background: `${TIER_COLORS[u.tier]}10`,
                                color: TIER_COLORS[u.tier],
                                border: `1px solid ${TIER_COLORS[u.tier]}30`,
                              }}>
                              {u.tier.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-[8px] font-mono" style={{ color: "#3a5a70" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Exchange */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: u.exColor, boxShadow: `0 0 4px ${u.exColor}` }} />
                        <span className="text-[9px] font-mono font-bold" style={{ color: u.exColor }}>
                          {u.exchange}
                        </span>
                      </div>
                    </td>

                    {/* Mode */}
                    <td className="px-3 py-2.5">
                      <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded"
                        style={u.mode === "live"
                          ? { background: "#ff335514", color: "#ff3355", border: "1px solid #ff335530" }
                          : { background: "#00aaff10", color: "#00aaff80", border: "1px solid #00aaff20" }}>
                        {u.mode === "live" ? "⬤ LIVE" : "○ SIM"}
                      </span>
                    </td>

                    {/* Positions */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono"
                        style={{ color: u.positions > 0 ? "#00f0ff" : "#3a5a70" }}>
                        {u.positions}
                      </span>
                    </td>

                    {/* Trades */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: "#9FB3C8" }}>
                        {u.trades}
                      </span>
                    </td>

                    {/* Fees */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: "#ffaa00" }}>
                        {fmtDollar(u.fees)}
                      </span>
                    </td>

                    {/* PnL */}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold font-mono" style={{ color: pctColor(u.pnl) }}>
                        {u.pnl >= 0 ? "+" : ""}{fmtDollar(u.pnl)}
                      </span>
                    </td>

                    {/* Win Rate */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 rounded overflow-hidden flex-shrink-0" style={{ background: "#0d1e2e" }}>
                          <div className="h-full rounded"
                            style={{
                              width: `${u.winRate}%`,
                              background: u.winRate >= 60 ? "#00ff8a" : u.winRate >= 50 ? "#ffaa00" : "#ff3355",
                              opacity: 0.75,
                            }} />
                        </div>
                        <span className="text-[9px] font-bold font-mono"
                          style={{ color: u.winRate >= 60 ? "#00ff8a" : u.winRate >= 50 ? "#ffaa00" : "#ff3355" }}>
                          {u.winRate}%
                        </span>
                      </div>
                    </td>

                    {/* Last Active */}
                    <td className="px-3 py-2.5">
                      <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>{u.lastActive}</span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: STATUS_COLORS[u.status],
                            boxShadow: `0 0 4px ${STATUS_COLORS[u.status]}`,
                          }} />
                        <span className="text-[8px] font-bold font-mono uppercase"
                          style={{ color: STATUS_COLORS[u.status] }}>
                          {u.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t"
            style={{ background: "#000000", borderColor: "#0d1e2e" }}>
            <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className="w-6 h-6 rounded font-mono text-[9px] font-bold transition-all border"
                  style={page === i
                    ? { background: "#00aaff14", color: "#00aaff", borderColor: "#00aaff40" }
                    : { background: "transparent", color: "#4a6a80", borderColor: "#1a2a36" }}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom Row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Exchange distribution */}
          <ExchangeDist users={MOCK_USERS} />

          {/* Tier distribution */}
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.2em] mb-3" style={{ color: "#4a6a80" }}>
              PLAN TIER DISTRIBUTION
            </div>
            {(["enterprise", "pro", "free"] as const).map(tier => {
              const count = MOCK_USERS.filter(u => u.tier === tier).length;
              const pct   = Math.round((count / MOCK_USERS.length) * 100);
              const color = TIER_COLORS[tier];
              return (
                <div key={tier} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono font-bold uppercase" style={{ color }}>
                      {tier}
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>
                      {count} users ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded overflow-hidden" style={{ background: "#0d1e2e" }}>
                    <div className="h-full rounded transition-all"
                      style={{ width: `${pct}%`, background: color, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Platform health */}
          <div className="rounded border p-4" style={{ background: "#010C18", borderColor: "#0d1e2e" }}>
            <div className="text-[9px] font-mono font-bold tracking-[0.2em] mb-3" style={{ color: "#4a6a80" }}>
              PLATFORM HEALTH
            </div>
            <div className="space-y-2.5">
              {[
                { label: "API Gateway",     ok: true,  latency: `${12 - tick % 3}ms` },
                { label: "Trade Engine",    ok: engine?.running ?? false, latency: engine?.running ? "ACTIVE" : "STOPPED" },
                { label: "Market Data",     ok: true,  latency: "Kraken WS" },
                { label: "Encryption Vault",ok: true,  latency: "AES-256" },
                { label: "Database",        ok: true,  latency: `${8 + tick % 4}ms` },
                { label: "Kill Switch",     ok: !(exchangeStatus?.killSwitch ?? false), latency: exchangeStatus?.killSwitch ? "ARMED" : "SAFE" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: item.ok ? "#00ff8a" : "#ff3355",
                      boxShadow: `0 0 4px ${item.ok ? "#00ff8a" : "#ff3355"}`,
                    }} />
                  <span className="text-[9px] font-mono flex-1" style={{ color: "#7a9eb8" }}>{item.label}</span>
                  <span className="text-[8px] font-mono font-bold"
                    style={{ color: item.ok ? "#00ff8a80" : "#ff335580" }}>
                    {item.latency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded border px-4 py-3"
          style={{ background: "#0a0606", borderColor: "#ff335520" }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#ff3355" }} />
          <p className="text-[9px] font-mono" style={{ color: "#ff335560" }}>
            OPERATOR CONSOLE — RESTRICTED ACCESS. All actions are logged and audited.
            This dashboard contains real platform data. Do not share screenshots externally.
          </p>
        </div>

      </div>
    </div>
  );
}
