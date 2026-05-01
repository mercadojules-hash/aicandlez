import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
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
  Zap,
  ClipboardCheck,
  Bug,
  Download,
  X,
} from "lucide-react";

export const MODULE_LIST = [
  { id:  1, path: "/",          icon: LayoutDashboard,   label: "Dashboard",           sublabel: "System shell & status",               status: "active" },
  { id:  2, path: "/market",    icon: Radio,             label: "Market Data",         sublabel: "Live feed engine",                    status: "active" },
  { id:  3, path: "/indicators",icon: BarChart3,         label: "Indicators",          sublabel: "Candle & indicator engine",           status: "active" },
  { id:  4, path: "/ai",        icon: Brain,             label: "AI Reasoning",        sublabel: "Signal & decision engine",            status: "active" },
  { id:  5, path: "/risk",      icon: Shield,            label: "Risk Management",     sublabel: "Position sizing & limits",            status: "active" },
  { id:  6, path: "/simulation",icon: FlaskConical,      label: "Simulation",          sublabel: "Paper trading engine",                status: "active" },
  { id:  7, path: "/backtest",  icon: BarChart2,         label: "Backtesting",         sublabel: "Strategy optimizer",                  status: "active" },
  { id:  8, path: "/optimizer", icon: SlidersHorizontal, label: "Strategy Optimizer",  sublabel: "Parameter grid search",               status: "active" },
  { id:  9, path: "/scanner",   icon: Scan,              label: "Asset Scanner",       sublabel: "Multi-asset opportunity rank",        status: "active" },
  { id: 10, path: "/portfolio", icon: Layers,            label: "Portfolio",           sublabel: "Allocation & exposure tracking",      status: "active" },
  { id: 11, path: "/correlation",icon: TrendingUp,       label: "Correlation",         sublabel: "Correlation matrix & trailing stops", status: "active" },
  { id: 12, path: "/journal",   icon: BookOpen,          label: "Trade Journal",       sublabel: "Learning & trade scoring",            status: "active" },
  { id: 13, path: "/validation",icon: ShieldCheck,       label: "Validation",          sublabel: "Walk-forward & OOS testing",          status: "active" },
  { id: 14, path: "/sentiment", icon: MessageSquare,     label: "Sentiment AI",        sublabel: "News & confidence scoring",           status: "active" },
  { id: 15, path: "/exchange",  icon: ArrowLeftRight,    label: "Exchange",            sublabel: "Kraken live & sim trading",           status: "active" },
  { id: 16, path: "/syscheck",  icon: ClipboardCheck,    label: "System Verification", sublabel: "Full engine health & proof",          status: "active" },
  { id: 17, path: "/debug",     icon: Bug,               label: "Signal Debug",        sublabel: "Why no trades? Full breakdown",       status: "active" },
  { id: 18, path: "/charts",    icon: BarChart2,         label: "Multi-Asset Chart",   sublabel: "BTC, ETH, SOL + custom assets",       status: "active" },
  { id: 19, path: "/command",   icon: Cpu,               label: "Command Center",      sublabel: "Unified view · all markets",          status: "active" },
];

// ── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  mod, active, collapsed, onNavigate,
}: {
  mod: typeof MODULE_LIST[number];
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon      = mod.icon;
  const isPending = mod.status === "pending";
  return (
    <Link
      href={isPending ? "#" : mod.path}
      className={`flex items-center gap-2.5 px-2 py-2.5 rounded-lg transition-colors group min-h-[44px] touch-manipulation
        ${active
          ? "bg-primary/10 text-primary"
          : isPending
            ? "text-muted-foreground/30 cursor-not-allowed"
            : "text-muted-foreground hover:text-foreground hover:bg-card"
        }`}
      title={collapsed ? mod.label : undefined}
      onClick={(e: React.MouseEvent) => {
        if (isPending) { e.preventDefault(); return; }
        onNavigate?.();
      }}
    >
      <span className={`w-5 text-[9px] font-bold font-mono flex items-center justify-center shrink-0 ${
        active ? "text-primary" : "text-muted-foreground/40"
      }`}>
        {String(mod.id).padStart(2, "0")}
      </span>
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && (
        <span className="text-[11px] font-medium leading-none truncate flex-1">{mod.label}</span>
      )}
      {!collapsed && active && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
      )}
    </Link>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  // Desktop: collapsible sidebar
  const [collapsed, setCollapsed] = useState(false);

  // Mobile: drawer overlay sidebar
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar when navigating
  const handleNavigate = () => setMobileOpen(false);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const activeModuleId = MODULE_LIST.find(
    (m) => m.status === "active" && (location === m.path || (m.path !== "/" && location.startsWith(m.path)))
  )?.id ?? 1;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">

      {/* ── Top bar ── */}
      <header className="h-12 shrink-0 border-b border-border/40 bg-card/60 backdrop-blur flex items-center px-3 sm:px-4 justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors touch-manipulation min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <div className="flex items-center gap-2 font-bold text-sm tracking-widest select-none">
            <Cpu className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground">APEX</span>
            <span className="text-primary">TRADER</span>
            <span className="hidden sm:inline ml-1 text-[10px] font-mono font-normal text-muted-foreground/60 tracking-normal">
              v1.0 · MODULE {String(activeModuleId).padStart(2, "0")}
            </span>
          </div>
        </div>

        <SystemStatusBar />
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Desktop sidebar — inline */}
        <aside className={`hidden md:flex ${collapsed ? "w-14" : "w-56"} shrink-0 border-r border-border/40 bg-card/30 flex-col transition-all duration-200 overflow-y-auto`}>
          <nav className="flex flex-col gap-0.5 p-2">
            {MODULE_LIST.map((mod) => (
              <NavItem
                key={mod.id}
                mod={mod}
                active={location === mod.path || (mod.path !== "/" && location.startsWith(mod.path))}
                collapsed={collapsed}
              />
            ))}
          </nav>
          {/* Download export link */}
          {!collapsed && (
            <div className="p-2 border-t border-border/30 shrink-0">
              <a
                href="/apex-trader-final-export-v1.zip"
                download
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                <Download className="w-3 h-3 shrink-0" />
                <span>Download Export</span>
              </a>
            </div>
          )}
        </aside>

        {/* Mobile sidebar — overlay drawer */}
        <aside className={`md:hidden fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border/40 flex flex-col transition-transform duration-250 ease-out overflow-y-auto
          ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
          {/* Drawer header */}
          <div className="h-12 flex items-center gap-2 px-4 border-b border-border/40 shrink-0">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm tracking-widest">APEX<span className="text-primary ml-1">TRADER</span></span>
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto p-1.5 rounded text-muted-foreground hover:text-foreground touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
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
          {/* Download export link (mobile) */}
          <div className="p-3 border-t border-border/30 shrink-0">
            <a
              href="/apex-trader-final-export-v1.zip"
              download
              className="flex items-center gap-2 px-3 py-2 rounded text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20 transition-colors"
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

// ── System Status Bar ─────────────────────────────────────────────────────────

function SystemStatusBar() {
  const [ws] = useState<"connected" | "disconnected">("disconnected");

  return (
    <div className="flex items-center gap-1.5 sm:gap-3 font-mono text-[10px]">
      <StatusPill label="API" ok={true} />
      <span className="hidden sm:inline"><StatusPill label="WS" ok={ws === "connected"} /></span>
      <span className="hidden sm:inline"><StatusPill label="ENGINE" ok={false} /></span>
      <KillSwitchButton />
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded bg-card border border-border/50">
      <span className="text-muted-foreground">{label}:</span>
      <span className={ok ? "text-green-400" : "text-muted-foreground/40"}>{ok ? "OK" : "—"}</span>
    </div>
  );
}

function KillSwitchButton() {
  return (
    <button
      disabled
      title="Available in Module 5 (Risk Management)"
      className="hidden sm:flex px-2 py-1 rounded bg-card border border-border/30 text-muted-foreground/30 items-center gap-1.5 cursor-not-allowed"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
      KILL SWITCH
    </button>
  );
}
