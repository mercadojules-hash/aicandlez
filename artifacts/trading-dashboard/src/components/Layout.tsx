import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeftRight,
  BarChart2,
  BarChart3,
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Radio,
  Shield,
  ShieldCheck,
  Scan,
  SlidersHorizontal,
  TrendingUp,
  ClipboardCheck,
  Bug,
  Download,
  X,
  Activity,
} from "lucide-react";

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
      className={`flex items-center gap-2 px-1.5 py-1.5 rounded transition-all group min-h-[36px] touch-manipulation border
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

      <Icon
        className="w-3.5 h-3.5 shrink-0"
        style={active
          ? { color: "#00eeff", filter: "drop-shadow(0 0 4px #00eeff80)" }
          : {}}
      />

      {!collapsed && (
        <span className={`text-[10px] font-mono leading-none truncate flex-1 ${
          active ? "text-[#00eeff]" : ""
        }`}>
          {mod.label}
        </span>
      )}

      {!collapsed && active && (
        <span className="live-dot live-dot-cyan shrink-0" style={{ width: 4, height: 4 }} />
      )}
    </Link>
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

  const sidebarClass = `flex flex-col overflow-y-auto`;
  const sidebarStyle = { background: "#000508", borderRightColor: "#0A1E2E" };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#000508] text-foreground dark">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header
        className="h-11 shrink-0 border-b flex items-center px-3 sm:px-4 justify-between sticky top-0 z-50"
        style={{
          background: "linear-gradient(180deg, #010D1C 0%, #000810 100%)",
          borderBottomColor: "#0D2035",
          boxShadow: "0 1px 0 #00eeff06, 0 2px 8px #00000060",
        }}
      >
        <div className="flex items-center gap-2">
          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-1.5 rounded border border-[#0E2235] text-[#1e4060] hover:text-[#00eeff] hover:border-[#00eeff25] transition-colors touch-manipulation min-w-[32px] min-h-[32px] flex items-center justify-center"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
          </button>

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex p-1.5 rounded border border-[#0E2235] text-[#1e4060] hover:text-[#00eeff] hover:border-[#00eeff25] transition-colors"
          >
            {collapsed
              ? <ChevronRight className="w-3.5 h-3.5" />
              : <ChevronLeft  className="w-3.5 h-3.5" />}
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2 select-none">
            <Cpu
              className="w-4 h-4 shrink-0"
              style={{ color: "#00eeff", filter: "drop-shadow(0 0 6px #00eeff90)" }}
            />
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

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Desktop sidebar */}
        <aside
          className={`hidden md:flex ${collapsed ? "w-12" : "w-52"} shrink-0 border-r flex-col transition-all duration-200 overflow-y-auto`}
          style={sidebarStyle}
        >
          <nav className={`${sidebarClass} gap-0.5 p-1.5 flex-1`}>
            {MODULE_LIST.map((mod) => (
              <NavItem
                key={mod.id}
                mod={mod}
                active={location === mod.path || (mod.path !== "/" && location.startsWith(mod.path))}
                collapsed={collapsed}
              />
            ))}
          </nav>

          {!collapsed && (
            <div className="p-2 border-t shrink-0" style={{ borderTopColor: "#0A1E2E" }}>
              <a
                href="/apex-trader-final-export-v1.zip"
                download
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[9px] font-mono border border-transparent text-[#0E2235] hover:text-[#1e4060] hover:border-[#0E2235] transition-colors"
              >
                <Download className="w-3 h-3 shrink-0" />
                <span>Export ZIP</span>
              </a>
            </div>
          )}
        </aside>

        {/* Mobile sidebar drawer */}
        <aside
          className={`md:hidden fixed inset-y-0 left-0 z-40 w-60 flex-col transition-transform duration-200 ease-out overflow-y-auto flex
            ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
          style={{ background: "#000810", borderRight: "1px solid #0A1E2E" }}
        >
          <div
            className="h-11 flex items-center gap-2 px-3 border-b shrink-0"
            style={{ borderBottomColor: "#0A1E2E" }}
          >
            <Cpu className="w-4 h-4" style={{ color: "#00eeff" }} />
            <span className="font-mono text-sm font-bold tracking-[0.15em]">
              APEX<span style={{ color: "#00eeff" }}>TRADER</span>
            </span>
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto p-1 rounded text-[#0E2235] hover:text-[#00eeff] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex flex-col gap-0.5 p-1.5 flex-1 overflow-y-auto">
            {MODULE_LIST.map((mod) => (
              <NavItem
                key={mod.id}
                mod={mod}
                active={location === mod.path || (mod.path !== "/" && location.startsWith(mod.path))}
                collapsed={false}
                onNavigate={handleNavigate}
              />
            ))}
          </nav>

          <div className="p-2 border-t shrink-0" style={{ borderTopColor: "#0A1E2E" }}>
            <a
              href="/apex-trader-final-export-v1.zip"
              download
              className="flex items-center gap-2 px-2 py-2 rounded text-[9px] font-mono text-[#0E2235] hover:text-[#1e4060] transition-colors"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Download Export ZIP</span>
            </a>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── System Status Bar ───────────────────────────────────────────────────── */

function SystemStatusBar() {
  const [apiOk, setApiOk] = useState(false);

  useEffect(() => {
    const ping = async () => {
      try {
        const r = await fetch("/api/healthz", { signal: AbortSignal.timeout(3000) });
        setApiOk(r.ok);
      } catch { setApiOk(false); }
    };
    ping();
    const t = setInterval(ping, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-[9px]">
      <StatusPill label="API"    ok={apiOk} />
      <span className="hidden sm:inline"><StatusPill label="WS"     ok={false} /></span>
      <span className="hidden sm:inline"><StatusPill label="ENGINE" ok={false} /></span>
      <KillSwitchButton />
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
      style={{ background: "#010C18", borderColor: "#0E2235" }}
    >
      <span className="text-[#1e4060]">{label}:</span>
      <span style={{ color: ok ? "#00ff88" : "#0E2235" }}>{ok ? "OK" : "—"}</span>
    </div>
  );
}

function KillSwitchButton() {
  return (
    <button
      disabled
      title="Available in Module 5 (Risk Management)"
      className="hidden sm:flex px-2 py-0.5 rounded border items-center gap-1.5 cursor-not-allowed"
      style={{ background: "#010C18", borderColor: "#0E2235", color: "#0E2235" }}
    >
      <Activity className="w-3 h-3" />
      KILL
    </button>
  );
}
