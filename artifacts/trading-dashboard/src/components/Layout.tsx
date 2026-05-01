import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
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
  LineChart,
  MessageSquare,
  Radio,
  Settings,
  Shield,
  Scan,
  SlidersHorizontal,
  TrendingUp,
  Zap,
} from "lucide-react";

export const MODULE_LIST = [
  { id: 1,  path: "/",           icon: LayoutDashboard, label: "Dashboard",          sublabel: "System shell & status",          status: "active"   },
  { id: 2,  path: "/market",     icon: Radio,           label: "Market Data",        sublabel: "Live feed engine",               status: "active"   },
  { id: 3,  path: "/indicators", icon: BarChart3,       label: "Indicators",         sublabel: "Candle & indicator engine",      status: "active"   },
  { id: 4,  path: "/ai",         icon: Brain,           label: "AI Reasoning",       sublabel: "Signal & decision engine",       status: "active"   },
  { id: 5,  path: "/risk",       icon: Shield,          label: "Risk Management",    sublabel: "Position sizing & limits",       status: "active"   },
  { id: 6,  path: "/simulation", icon: FlaskConical,    label: "Simulation",         sublabel: "Paper trading engine",           status: "active"   },
  { id: 7,  path: "/backtest",   icon: BarChart2,       label: "Backtesting",        sublabel: "Strategy optimizer",            status: "active"   },
  { id: 8,  path: "/optimizer",  icon: SlidersHorizontal, label: "Strategy Optimizer", sublabel: "Parameter grid search",         status: "active"   },
  { id: 9,  path: "/scanner",    icon: Scan,            label: "Asset Scanner",      sublabel: "Multi-asset opportunity rank",   status: "active"   },
  { id: 10, path: "/portfolio",  icon: Layers,          label: "Portfolio",          sublabel: "Allocation & exposure tracking", status: "active"   },
  { id: 11, path: "/correlation", icon: TrendingUp,      label: "Correlation",        sublabel: "Correlation matrix & trailing stops", status: "active" },
  { id: 12, path: "/sentiment",  icon: MessageSquare,   label: "Sentiment AI",       sublabel: "News & social signals",         status: "pending"  },
  { id: 13, path: "/live",       icon: Zap,             label: "Live Trading",       sublabel: "Exchange integration",          status: "pending"  },
  { id: 14, path: "/settings",   icon: Settings,        label: "Settings",           sublabel: "System configuration",          status: "pending"  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">

      {/* ── Top bar ── */}
      <header className="h-12 shrink-0 border-b border-border/40 bg-card/60 backdrop-blur flex items-center px-4 justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2 font-bold text-sm tracking-widest select-none">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-foreground">APEX</span><span className="text-primary">TRADER</span>
            <span className="ml-1 text-[10px] font-mono font-normal text-muted-foreground/60 tracking-normal">
              v1.0 · MODULE {String(Math.max(...MODULE_LIST.filter(m => m.status === "active").map(m => m.id))).padStart(2, "0")}
            </span>
          </div>
        </div>

        <SystemStatusBar />
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar */}
        <aside className={`${collapsed ? "w-14" : "w-56"} shrink-0 border-r border-border/40 bg-card/30 flex flex-col transition-all duration-200 overflow-y-auto`}>
          <nav className="flex flex-col gap-0.5 p-2">
            {MODULE_LIST.map((mod) => {
              const Icon = mod.icon;
              const active = location === mod.path || (mod.path !== "/" && location.startsWith(mod.path));
              const isPending = mod.status === "pending";
              return (
                <Link key={mod.id} href={isPending ? "#" : mod.path}
                  className={`flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors group relative
                    ${active ? "bg-primary/10 text-primary" : isPending ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-card"}`}
                  title={collapsed ? mod.label : undefined}
                  onClick={(e: React.MouseEvent) => { if (isPending) e.preventDefault(); }}
                >
                    {/* Module number */}
                    <span className={`w-4 h-4 text-[9px] font-bold font-mono flex items-center justify-center rounded shrink-0 
                      ${active ? "text-primary" : "text-muted-foreground/50"}`}>
                      {String(mod.id).padStart(2, "0")}
                    </span>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {!collapsed && (
                      <span className="text-[11px] font-medium leading-none truncate">{mod.label}</span>
                    )}
                    {!collapsed && isPending && (
                      <span className="ml-auto text-[9px] font-mono text-muted-foreground/30">—</span>
                    )}
                    {!collapsed && active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── System Status Bar (top right) ─────────────────────────────────────────────
function SystemStatusBar() {
  const [ws] = useState<"connected" | "disconnected">("disconnected");
  const apiOk = true; // will use real query in Module 2

  return (
    <div className="flex items-center gap-3 font-mono text-[10px]">
      <StatusPill label="API" ok={apiOk} />
      <StatusPill label="WS" ok={ws === "connected"} />
      <StatusPill label="ENGINE" ok={false} />
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
      className="px-2 py-1 rounded bg-card border border-border/30 text-muted-foreground/30 flex items-center gap-1.5 cursor-not-allowed"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
      KILL SWITCH
    </button>
  );
}
