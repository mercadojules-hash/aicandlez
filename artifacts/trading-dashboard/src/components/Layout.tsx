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

/* ── Primary trading modules ─────────────────────────────────────────────── */
export const MODULE_LIST = [
  { id:  1, path: "/",           icon: LayoutDashboard,   label: "Dashboard",           status: "active" },
  { id:  2, path: "/market",     icon: Radio,             label: "Market Data",         status: "active" },
  { id:  3, path: "/indicators", icon: BarChart3,         label: "Indicators",          status: "active" },
  { id:  4, path: "/ai",         icon: Brain,             label: "AI Reasoning",        status: "active" },
  { id:  5, path: "/risk",       icon: Shield,            label: "Risk Management",     status: "active" },
  { id:  6, path: "/simulation", icon: FlaskConical,      label: "Simulation",          status: "active" },
  { id:  7, path: "/backtest",   icon: BarChart2,         label: "Backtesting",         status: "active" },
  { id:  8, path: "/optimizer",  icon: SlidersHorizontal, label: "Strategy Optimizer",  status: "active" },
  { id:  9, path: "/scanner",    icon: Scan,              label: "Asset Scanner",       status: "active" },
  { id: 10, path: "/portfolio",  icon: Layers,            label: "Portfolio",           status: "active" },
  { id: 11, path: "/correlation",icon: TrendingUp,        label: "Correlation",         status: "active" },
  { id: 12, path: "/journal",    icon: BookOpen,          label: "Trade Journal",       status: "active" },
  { id: 13, path: "/validation", icon: ShieldCheck,       label: "Validation",          status: "active" },
  { id: 14, path: "/sentiment",  icon: MessageSquare,     label: "Sentiment AI",        status: "active" },
  { id: 15, path: "/exchange",   icon: ArrowLeftRight,    label: "Exchange",            status: "active" },
  { id: 16, path: "/syscheck",   icon: ClipboardCheck,    label: "System Verification", status: "active" },
  { id: 17, path: "/debug",      icon: Bug,               label: "Signal Debug",        status: "active" },
  { id: 18, path: "/charts",     icon: BarChart2,         label: "Multi-Asset Chart",   status: "active" },
  { id: 19, path: "/command",    icon: Cpu,               label: "Command Center",      status: "active" },
];

/* ── Platform admin modules (future pages, shown as coming soon) ─────────── */
const PLATFORM_ITEMS = [
  { icon: Users,         label: "Users",         badge: "1,248" },
  { icon: Zap,           label: "AI Models",     badge: "3"     },
  { icon: Trophy,        label: "Leaderboard",   badge: null    },
  { icon: Bell,          label: "Alerts",        badge: "2"     },
  { icon: BarChart2,     label: "Analytics",     badge: null    },
  { icon: Wallet,        label: "Revenue",       badge: null    },
  { icon: AlertTriangle, label: "Risk Monitor",  badge: null    },
];

function NavItem({
  mod, active, collapsed, onNavigate,
}: {
  mod: typeof MODULE_LIST[number];
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = mod.icon;
  return (
    <Link
      href={mod.path}
      className={`flex items-center gap-2 px-1.5 py-1.5 rounded transition-all group min-h-[34px] touch-manipulation border
        ${active
          ? "border-[#00eeff18] bg-[#00eeff08]"
          : "border-transparent text-[#1a3a50] hover:text-[#4a8fa8] hover:bg-[#010C18]"
        }`}
      style={active ? { boxShadow: "0 0 12px #00eeff06, inset 0 0 12px #00eeff04" } : {}}
      title={collapsed ? mod.label : undefined}
      onClick={onNavigate}
    >
      <span className={`w-5 text-[8px] font-bold font-mono text-center shrink-0 ${
        active ? "text-[#00eeff70]" : "text-[#0E2235]"
      }`}>
        {String(mod.id).padStart(2, "0")}
      </span>
      <Icon className="w-3.5 h-3.5 shrink-0"
        style={active ? { color: "#00eeff", filter: "drop-shadow(0 0 4px #00eeff80)" } : {}} />
      {!collapsed && (
        <span className={`text-[10px] font-mono leading-none truncate flex-1 ${active ? "text-[#00eeff]" : ""}`}>
          {mod.label}
        </span>
      )}
      {!collapsed && active && (
        <span className="live-dot live-dot-cyan shrink-0" style={{ width: 4, height: 4 }} />
      )}
    </Link>
  );
}

function PlatformNavItem({
  icon: Icon, label, badge, collapsed,
}: { icon: React.ElementType; label: string; badge: string | null; collapsed: boolean }) {
  return (
    <div
      className="flex items-center gap-2 px-1.5 py-1.5 rounded border border-transparent cursor-default opacity-60 hover:opacity-80 transition-opacity min-h-[30px]"
      title={collapsed ? label : undefined}
    >
      <Icon className="w-3 h-3 shrink-0" style={{ color: "#1e4060" }} />
      {!collapsed && (
        <>
          <span className="text-[10px] font-mono truncate flex-1" style={{ color: "#1e4060" }}>{label}</span>
          {badge && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0"
              style={{ background: "#00aaff08", color: "#00aaff40", border: "1px solid #00aaff14" }}>
              {badge}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/* ── Admin profile block ─────────────────────────────────────────────────── */
function AdminBlock({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="px-2 py-2.5 border-t" style={{ borderTopColor: "#0A1E2E" }}>
      <div className="flex items-center gap-2 px-2 py-2 rounded"
        style={{ background: "#010C18", border: "1px solid #0A1E2E" }}>
        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold font-mono"
          style={{ background: "#00aaff18", color: "#00aaff", border: "1px solid #00aaff22" }}>
          A
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold font-mono truncate" style={{ color: "#4a8fa8" }}>Admin</div>
          <div className="text-[7px] font-mono truncate" style={{ color: "#1e3040" }}>Super Admin</div>
        </div>
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#00ff8a", boxShadow: "0 0 4px #00ff8a80" }} />
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
    (m) => location === m.path || (m.path !== "/" && location.startsWith(m.path))
  )?.id ?? 1;

  const isActive = (m: typeof MODULE_LIST[number]) =>
    location === m.path || (m.path !== "/" && location.startsWith(m.path));

  const sidebarStyle = { background: "#000508", borderRightColor: "#0A1E2E" };

  const SidebarContent = ({ onNavigate, collap }: { onNavigate?: () => void; collap: boolean }) => (
    <>
      {/* Trading modules */}
      <nav className="flex flex-col gap-0.5 p-1.5 flex-1">
        {MODULE_LIST.map((mod) => (
          <NavItem key={mod.id} mod={mod} active={isActive(mod)} collapsed={collap} onNavigate={onNavigate} />
        ))}

        {/* Platform section divider */}
        {!collap && (
          <div className="flex items-center gap-2 px-1.5 pt-3 pb-1">
            <div className="flex-1 h-px" style={{ background: "#0A1E2E" }} />
            <span className="text-[7px] font-bold font-mono tracking-[0.2em]" style={{ color: "#0E2235" }}>
              PLATFORM
            </span>
            <div className="flex-1 h-px" style={{ background: "#0A1E2E" }} />
          </div>
        )}
        {collap && <div className="my-1 h-px mx-1.5" style={{ background: "#0A1E2E" }} />}

        {PLATFORM_ITEMS.map((item) => (
          <PlatformNavItem key={item.label} {...item} collapsed={collap} />
        ))}
      </nav>

      {/* Export + Admin */}
      {!collap && (
        <div className="p-2 border-t shrink-0" style={{ borderTopColor: "#0A1E2E" }}>
          <a
            href="/apex-trader-v7-full.tar.gz"
            download
            className="flex items-center gap-2 px-2 py-1.5 rounded text-[9px] font-mono border border-transparent text-[#0E2235] hover:text-[#1e4060] hover:border-[#0E2235] transition-colors"
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
        className="h-11 shrink-0 border-b flex items-center px-3 sm:px-4 justify-between sticky top-0 z-50"
        style={{
          background: "linear-gradient(180deg, #010D1C 0%, #000810 100%)",
          borderBottomColor: "#0D2035",
          boxShadow: "0 1px 0 #00eeff06, 0 2px 8px #00000060",
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-1.5 rounded border border-[#0E2235] text-[#1e4060] hover:text-[#00eeff] hover:border-[#00eeff25] transition-colors touch-manipulation min-w-[32px] min-h-[32px] flex items-center justify-center"
          >
            {mobileOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex p-1.5 rounded border border-[#0E2235] text-[#1e4060] hover:text-[#00eeff] hover:border-[#00eeff25] transition-colors"
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
          <div className="flex items-center gap-2 select-none">
            <Cpu className="w-4 h-4 shrink-0" style={{ color: "#00eeff", filter: "drop-shadow(0 0 6px #00eeff90)" }} />
            <div className="flex items-center font-mono text-[13px] font-bold tracking-[0.2em]">
              <span className="text-foreground/70">APEX</span>
              <span style={{ color: "#00eeff", textShadow: "0 0 14px #00eeff70" }}> TRADER</span>
            </div>
            <span className="hidden sm:inline text-[8px] font-mono text-[#0E2235] tracking-widest ml-1">
              v1.0 · MOD {String(activeModuleId).padStart(2, "0")}
            </span>
          </div>
        </div>
        <SystemStatusBar />
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-black/75 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        )}

        {/* Desktop sidebar */}
        <aside
          className={`hidden md:flex ${collapsed ? "w-12" : "w-52"} shrink-0 border-r flex-col transition-all duration-200 overflow-y-auto`}
          style={sidebarStyle}
        >
          <SidebarContent collap={collapsed} />
        </aside>

        {/* Mobile sidebar */}
        <aside
          className={`md:hidden fixed inset-y-0 left-0 z-40 w-60 flex-col transition-transform duration-200 ease-out overflow-y-auto flex
            ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
          style={{ background: "#000810", borderRight: "1px solid #0A1E2E" }}
        >
          <div className="h-11 flex items-center gap-2 px-3 border-b shrink-0" style={{ borderBottomColor: "#0A1E2E" }}>
            <Cpu className="w-4 h-4" style={{ color: "#00eeff" }} />
            <span className="font-mono text-sm font-bold tracking-[0.15em]">
              APEX<span style={{ color: "#00eeff" }}>TRADER</span>
            </span>
            <button onClick={() => setMobileOpen(false)} className="ml-auto p-1 rounded text-[#0E2235] hover:text-[#00eeff]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <SidebarContent collap={false} onNavigate={handleNavigate} />
        </aside>

        <main className="flex-1 overflow-auto min-w-0">{children}</main>
      </div>
    </div>
  );
}

/* ── System Status Bar ───────────────────────────────────────────────────── */
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
    <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-[9px]">
      <StatusPill label="API"    ok={apiOk}  />
      <span className="hidden sm:inline"><StatusPill label="WS"     ok={false} /></span>
      <span className="hidden sm:inline"><StatusPill label="ENGINE" ok={false} /></span>
      <KillSwitchButton />
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
      style={{ background: "#010C18", borderColor: "#0E2235" }}>
      <span style={{ color: "#1e4060" }}>{label}:</span>
      <span style={{ color: ok ? "#00ff88" : "#0E2235" }}>{ok ? "OK" : "—"}</span>
    </div>
  );
}

function KillSwitchButton() {
  return (
    <button disabled
      className="hidden sm:flex px-2 py-0.5 rounded border items-center gap-1.5 cursor-not-allowed"
      style={{ background: "#010C18", borderColor: "#0E2235", color: "#0E2235" }}>
      <Activity className="w-3 h-3" />
      KILL
    </button>
  );
}
