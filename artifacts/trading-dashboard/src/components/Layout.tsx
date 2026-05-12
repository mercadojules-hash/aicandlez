import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BarChart2,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  Bug,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  Download,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Radio,
  Scan,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";

export const MODULE_LIST = [
  { id:  1, path: "/",           icon: LayoutDashboard,   label: "Dashboard",           group: "CORE" },
  { id:  2, path: "/market",     icon: Radio,             label: "Market Data",         group: "CORE" },
  { id:  3, path: "/indicators", icon: BarChart3,         label: "Indicators",          group: "CORE" },
  { id:  4, path: "/ai",         icon: Brain,             label: "AI Reasoning",        group: "AI"   },
  { id:  5, path: "/risk",       icon: Shield,            label: "Risk Management",     group: "RISK" },
  { id:  6, path: "/simulation", icon: FlaskConical,      label: "Simulation",          group: "TRADE"},
  { id:  7, path: "/backtest",   icon: BarChart2,         label: "Backtesting",         group: "TRADE"},
  { id:  8, path: "/optimizer",  icon: SlidersHorizontal, label: "Strategy Optimizer",  group: "AI"   },
  { id:  9, path: "/scanner",    icon: Scan,              label: "Asset Scanner",       group: "TRADE"},
  { id: 10, path: "/portfolio",  icon: Layers,            label: "Portfolio",           group: "TRADE"},
  { id: 11, path: "/correlation",icon: TrendingUp,        label: "Correlation",         group: "TRADE"},
  { id: 12, path: "/journal",    icon: BookOpen,          label: "Trade Journal",       group: "TRADE"},
  { id: 13, path: "/validation", icon: ShieldCheck,       label: "Validation",          group: "RISK" },
  { id: 14, path: "/sentiment",  icon: MessageSquare,     label: "Sentiment AI",        group: "AI"   },
  { id: 15, path: "/exchange",   icon: ArrowLeftRight,    label: "Exchange",            group: "CORE" },
  { id: 16, path: "/syscheck",   icon: ClipboardCheck,    label: "System Verification", group: "SYS"  },
  { id: 17, path: "/debug",      icon: Bug,               label: "Signal Debug",        group: "SYS"  },
  { id: 18, path: "/charts",     icon: BarChart2,         label: "Multi-Asset Chart",   group: "TRADE"},
  { id: 19, path: "/command",    icon: Cpu,               label: "Command Center",      group: "SYS"  },
];

const PLATFORM_ITEMS: { icon: React.ElementType; label: string; badge?: string; badgeColor?: string }[] = [
  { icon: Users,         label: "Users",       badge: "1,248", badgeColor: "#00aaff" },
  { icon: Zap,           label: "AI Models",   badge: "3",     badgeColor: "#cc55ff" },
  { icon: Trophy,        label: "Leaderboard"                                         },
  { icon: Bell,          label: "Alerts",      badge: "2",     badgeColor: "#ff6600" },
  { icon: BarChart2,     label: "Analytics"                                           },
  { icon: Wallet,        label: "Revenue"                                             },
  { icon: AlertTriangle, label: "Risk Monitor"                                        },
];

/* Group accent colors */
const GROUP_ACCENT: Record<string, string> = {
  CORE:  "#00aaff",
  AI:    "#cc55ff",
  RISK:  "#ff8844",
  TRADE: "#00ff8a",
  SYS:   "#00eeff",
};

function NavItem({
  mod, active, collapsed, onNavigate,
}: {
  mod: typeof MODULE_LIST[number];
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon   = mod.icon;
  const accent = GROUP_ACCENT[mod.group] ?? "#00aaff";
  return (
    <Link
      href={mod.path}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded transition-all group border"
      style={active
        ? {
            background:  `${accent}0c`,
            borderColor: `${accent}28`,
            boxShadow:   `inset 2px 0 0 ${accent}60`,
          }
        : {
            borderColor: "transparent",
          }
      }
      title={collapsed ? mod.label : undefined}
      onClick={onNavigate}
    >
      {/* Module number */}
      <span className="w-5 text-[8px] font-bold font-mono text-center shrink-0"
        style={{ color: active ? `${accent}80` : "#2a4050" }}>
        {String(mod.id).padStart(2, "0")}
      </span>

      {/* Icon */}
      <Icon className="w-3.5 h-3.5 shrink-0"
        style={active
          ? { color: accent, filter: `drop-shadow(0 0 5px ${accent}90)` }
          : { color: "#3a6070" }
        }
      />

      {/* Label */}
      {!collapsed && (
        <span className="text-[11px] font-mono font-medium leading-none truncate flex-1"
          style={{ color: active ? "#EAF2FF" : "#7a9eb8" }}>
          {mod.label}
        </span>
      )}

      {/* Active dot */}
      {!collapsed && active && (
        <span className="live-dot live-dot-cyan shrink-0" style={{ width: 4, height: 4 }} />
      )}
    </Link>
  );
}

function PlatformNavItem({
  icon: Icon, label, badge, badgeColor = "#00aaff", collapsed,
}: { icon: React.ElementType; label: string; badge?: string; badgeColor?: string; collapsed: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-default border border-transparent"
      title={collapsed ? label : undefined}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: "#2e4a60" }} />
      {!collapsed && (
        <>
          <span className="text-[10px] font-mono font-medium truncate flex-1" style={{ color: "#4a6a80" }}>
            {label}
          </span>
          {badge && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0"
              style={{ background: `${badgeColor}12`, color: badgeColor, border: `1px solid ${badgeColor}28` }}>
              {badge}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function SectionDivider({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px mx-1" style={{ background: "#0E2030" }} />;
  return (
    <div className="flex items-center gap-2 px-2 pt-3 pb-1">
      <div className="h-px flex-1" style={{ background: "#0E2030" }} />
      <span className="text-[8px] font-bold font-mono tracking-[0.25em]" style={{ color: "#3a5a70" }}>
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: "#0E2030" }} />
    </div>
  );
}

function AdminBlock({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="px-2 pb-2 pt-1 border-t" style={{ borderTopColor: "#0E2030" }}>
      <div className="flex items-center gap-2 px-2 py-2 rounded"
        style={{ background: "#010C18", border: "1px solid #0d1e2c" }}>
        <div className="w-7 h-7 rounded flex items-center justify-center shrink-0 text-[10px] font-bold font-mono"
          style={{
            background: "linear-gradient(135deg, #00aaff20, #7b68ee20)",
            color: "#00aaff",
            border: "1px solid #00aaff30",
            boxShadow: "0 0 8px #00aaff18",
          }}>
          A
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold font-mono truncate" style={{ color: "#7ab8cc" }}>Admin</div>
          <div className="text-[8px] font-mono truncate" style={{ color: "#3a5a70" }}>Super Admin · LIVE</div>
        </div>
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#00ff8a", boxShadow: "0 0 5px #00ff8a" }} />
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location]   = useLocation();
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const handleNavigate = () => setMobileOpen(false);

  useEffect(() => {
    const h = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const activeModuleId = MODULE_LIST.find(
    m => location === m.path || (m.path !== "/" && location.startsWith(m.path))
  )?.id ?? 1;
  const isActive = (m: typeof MODULE_LIST[number]) =>
    location === m.path || (m.path !== "/" && location.startsWith(m.path));

  const SidebarContent = ({ onNavigate, collap }: { onNavigate?: () => void; collap: boolean }) => (
    <>
      <nav className="flex flex-col gap-px px-1.5 py-2 flex-1 overflow-y-auto">
        {MODULE_LIST.map(mod => (
          <NavItem key={mod.id} mod={mod} active={isActive(mod)} collapsed={collap} onNavigate={onNavigate} />
        ))}

        <SectionDivider label="PLATFORM" collapsed={collap} />

        {PLATFORM_ITEMS.map(item => (
          <PlatformNavItem key={item.label} {...item} collapsed={collap} />
        ))}
      </nav>

      {!collap && (
        <div className="px-2 py-1.5 border-t shrink-0" style={{ borderTopColor: "#0E2030" }}>
          <a
            href="/apex-trader-v7-full.tar.gz"
            download
            className="flex items-center gap-2 px-2 py-1.5 rounded text-[9px] font-mono font-medium border border-transparent transition-colors"
            style={{ color: "#3a5a70" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#7a9eb8")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3a5a70")}
          >
            <Download className="w-3 h-3 shrink-0" />
            <span>Export v7</span>
          </a>
        </div>
      )}

      <AdminBlock collapsed={collap} />
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#000508] text-foreground dark">

      {/* Top bar */}
      <header
        className="h-10 shrink-0 border-b flex items-center px-3 justify-between sticky top-0 z-50"
        style={{
          background: "linear-gradient(180deg, #020e1c 0%, #000a14 100%)",
          borderBottomColor: "#0D2035",
          boxShadow: "0 1px 0 #00eeff06, 0 2px 10px #00000070",
        }}
      >
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileOpen(o => !o)}
            className="md:hidden p-1.5 rounded border border-[#0E2235] touch-manipulation min-w-[28px] min-h-[28px] flex items-center justify-center"
            style={{ color: "#4a6a80" }}>
            {mobileOpen ? <X className="w-3 h-3" /> : <Menu className="w-3 h-3" />}
          </button>
          <button onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex p-1 rounded border border-[#0E2235] transition-colors"
            style={{ color: "#4a6a80" }}>
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>

          <div className="flex items-center gap-2 select-none">
            <Cpu className="w-3.5 h-3.5 shrink-0" style={{ color: "#00eeff", filter: "drop-shadow(0 0 6px #00eeff)" }} />
            <div className="font-mono text-[12px] font-bold tracking-[0.22em]">
              <span style={{ color: "#4a7a90" }}>APEX</span>
              <span style={{ color: "#00eeff", textShadow: "0 0 16px #00eeff70" }}> TRADER</span>
            </div>
            <span className="hidden sm:inline text-[8px] font-mono tracking-widest font-medium"
              style={{ color: "#3a5a70" }}>
              v1.0 · MOD {String(activeModuleId).padStart(2, "0")}
            </span>
          </div>
        </div>

        <SystemStatusBar />
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-black/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        )}

        {/* Desktop sidebar */}
        <aside
          className={`hidden md:flex ${collapsed ? "w-12" : "w-52"} shrink-0 border-r flex-col transition-all duration-200 overflow-hidden`}
          style={{ background: "#000508", borderRightColor: "#0a1820" }}
        >
          <SidebarContent collap={collapsed} />
        </aside>

        {/* Mobile sidebar */}
        <aside
          className={`md:hidden fixed inset-y-0 left-0 z-40 w-60 flex-col transition-transform duration-200 ease-out overflow-y-auto flex
            ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
          style={{ background: "#000810", borderRight: "1px solid #0A1E2E" }}
        >
          <div className="h-10 flex items-center gap-2 px-3 border-b shrink-0" style={{ borderBottomColor: "#0A1E2E" }}>
            <Cpu className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
            <span className="font-mono text-[11px] font-bold tracking-[0.18em]">
              APEX<span style={{ color: "#00eeff" }}>TRADER</span>
            </span>
            <button onClick={() => setMobileOpen(false)} className="ml-auto p-1 rounded" style={{ color: "#4a6a80" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <SidebarContent collap={false} onNavigate={handleNavigate} />
        </aside>

        <main className="flex-1 overflow-auto min-w-0">{children}</main>
      </div>
    </div>
  );
}

/* ── System Status Bar ─────────────────────────────────────────────────────── */
function SystemStatusBar() {
  const [apiOk, setApiOk] = useState(false);
  useEffect(() => {
    const ping = async () => {
      try { const r = await fetch("/api/healthz", { signal: AbortSignal.timeout(3000) }); setApiOk(r.ok); }
      catch { setApiOk(false); }
    };
    ping();
    const t = setInterval(ping, 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-1.5 font-mono text-[8px]">
      <Pill label="API"    ok={apiOk}  />
      <span className="hidden sm:inline"><Pill label="WS"     ok={false} /></span>
      <span className="hidden sm:inline"><Pill label="ENGINE" ok={false} /></span>
      <button disabled
        className="hidden sm:flex px-1.5 py-0.5 rounded border items-center gap-1 cursor-not-allowed"
        style={{ background: "#010C18", borderColor: "#0E2235", color: "#3a5a70" }}>
        <Activity className="w-2.5 h-2.5" />
        KILL
      </button>
    </div>
  );
}

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
      style={{ background: "#010C18", borderColor: "#0E2235" }}>
      <span style={{ color: "#4a6a80" }}>{label}:</span>
      <span style={{ color: ok ? "#00ff88" : "#1e3a50" }}>{ok ? "OK" : "—"}</span>
    </div>
  );
}
