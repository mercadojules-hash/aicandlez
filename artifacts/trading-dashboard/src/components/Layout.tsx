import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
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
  ChevronUp,
  ClipboardCheck,
  Cpu,
  Download,
  DollarSign,
  FlaskConical,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Radio,
  Scan,
  Settings,
  Shield,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  User,
  Users,
  Wallet,
  X,
  Monitor,
  Zap,
} from "lucide-react";

export const MODULE_LIST = [
  { id:  1, path: "/dashboard",   icon: LayoutDashboard,   label: "Dashboard",           group: "CORE",  status: "active",  sublabel: "System shell & roadmap"             },
  { id:  2, path: "/market",      icon: Radio,             label: "Market Data",         group: "CORE",  status: "active",  sublabel: "Live market candle feed"            },
  { id:  3, path: "/indicators",  icon: BarChart3,         label: "Indicators",          group: "CORE",  status: "active",  sublabel: "EMA, RSI, candlestick rendering"    },
  { id:  4, path: "/ai",          icon: Brain,             label: "AI Reasoning",        group: "AI",    status: "active",  sublabel: "EMA+RSI signal engine, BUY/SELL"   },
  { id:  5, path: "/risk",        icon: Shield,            label: "Risk Management",     group: "RISK",  status: "active",  sublabel: "Kill switch, daily loss limit"      },
  { id:  6, path: "/simulation",  icon: FlaskConical,      label: "Simulation",          group: "TRADE", status: "active",  sublabel: "Paper trading, risk-gate enforced"  },
  { id:  7, path: "/backtest",    icon: BarChart2,         label: "Backtesting",         group: "TRADE", status: "active",  sublabel: "Historical walk-forward simulation" },
  { id:  8, path: "/optimizer",   icon: SlidersHorizontal, label: "Strategy Optimizer",  group: "AI",    status: "active",  sublabel: "Grid search EMA/RSI parameters"    },
  { id:  9, path: "/scanner",     icon: Scan,              label: "Asset Scanner",       group: "TRADE", status: "active",  sublabel: "Multi-symbol opportunity ranking"   },
  { id: 10, path: "/portfolio",   icon: Layers,            label: "Portfolio",           group: "TRADE", status: "active",  sublabel: "Allocation & exposure tracking"     },
  { id: 11, path: "/correlation", icon: TrendingUp,        label: "Correlation",         group: "TRADE", status: "active",  sublabel: "BTC/ETH/SOL correlation matrix"     },
  { id: 12, path: "/journal",     icon: BookOpen,          label: "Trade Journal",       group: "TRADE", status: "active",  sublabel: "Scored trade feedback, win rate"    },
  { id: 13, path: "/validation",  icon: ShieldCheck,       label: "Validation",          group: "RISK",  status: "active",  sublabel: "Walk-forward OOS, overfitting grade"},
  { id: 14, path: "/sentiment",   icon: MessageSquare,     label: "Sentiment AI",        group: "AI",    status: "active",  sublabel: "News scoring, Fear & Greed index"  },
  { id: 15, path: "/exchange",    icon: ArrowLeftRight,    label: "Exchange",            group: "CORE",  status: "active",  sublabel: "Alpaca, paper/live, kill switch"    },
  { id: 16, path: "/syscheck",    icon: ClipboardCheck,    label: "System Verification", group: "SYS",   status: "active",  sublabel: "Full engine health check, 10 systems"},
  { id: 17, path: "/debug",       icon: Bug,               label: "Signal Debug",        group: "SYS",   status: "active",  sublabel: "MTF funnel, signal quality filters" },
  { id: 18, path: "/charts",      icon: BarChart2,         label: "Multi-Asset Chart",   group: "TRADE", status: "active",  sublabel: "BTC/ETH/SOL side-by-side, EMA9/21"  },
  { id: 19, path: "/command",     icon: Cpu,               label: "Command Center",      group: "SYS",   status: "active",  sublabel: "Unified one-screen trading view"    },
  { id: 20, path: "/desktop",     icon: Monitor,           label: "Desktop Terminal",    group: "SYS",   status: "active",  sublabel: "Power-user multi-panel trading view"},
];

/* Group accent colors */
const GROUP_ACCENT: Record<string, string> = {
  CORE:  "#00aaff",
  AI:    "#cc55ff",
  RISK:  "#ff8844",
  TRADE: "#00ff8a",
  SYS:   "#00eeff",
};

// ── Nav Item ──────────────────────────────────────────────────────────────────

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
      <span className="w-5 text-[8px] font-bold font-mono text-center shrink-0"
        style={{ color: active ? `${accent}80` : "#2a4050" }}>
        {String(mod.id).padStart(2, "0")}
      </span>
      <Icon className="w-3.5 h-3.5 shrink-0"
        style={active
          ? { color: accent, filter: `drop-shadow(0 0 5px ${accent}90)` }
          : { color: "#3a6070" }
        }
      />
      {!collapsed && (
        <span className="text-[11px] font-mono font-medium leading-none truncate flex-1"
          style={{ color: active ? "#EAF2FF" : "#7a9eb8" }}>
          {mod.label}
        </span>
      )}
      {!collapsed && active && (
        <span className="live-dot live-dot-cyan shrink-0" style={{ width: 4, height: 4 }} />
      )}
    </Link>
  );
}

// ── Section Divider ───────────────────────────────────────────────────────────

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

// ── Platform Nav Link (clickable) ─────────────────────────────────────────────

function PlatformNavLink({
  icon: Icon, label, badge, badgeColor = "#00aaff", href, collapsed, active = false,
}: {
  icon: React.ElementType;
  label: string;
  badge?: string;
  badgeColor?: string;
  href: string;
  collapsed: boolean;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded border transition-all"
      title={collapsed ? label : undefined}
      style={active
        ? { background: `${badgeColor}0c`, borderColor: `${badgeColor}28`, boxShadow: `inset 2px 0 0 ${badgeColor}60` }
        : { borderColor: "transparent" }
      }
    >
      <Icon className="w-3.5 h-3.5 shrink-0"
        style={{ color: active ? badgeColor : "#2e4a60", filter: active ? `drop-shadow(0 0 4px ${badgeColor}80)` : undefined }} />
      {!collapsed && (
        <>
          <span className="text-[10px] font-mono font-medium truncate flex-1"
            style={{ color: active ? "#C7D4E2" : "#4a6a80" }}>
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
    </Link>
  );
}

// ── Enhanced UserBlock with Avatar + Dropdown ─────────────────────────────────

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { user, isLoaded } = useUser();
  const { signOut }        = useClerk();
  const [open, setOpen]    = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isLoaded || !user) return null;

  const initials    = (user.firstName?.[0] ?? user.emailAddresses[0]?.emailAddress?.[0] ?? "U").toUpperCase();
  const displayName = user.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user.emailAddresses[0]?.emailAddress ?? "User";
  const email    = user.emailAddresses[0]?.emailAddress ?? "";
  const avatarUrl = user.imageUrl;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const MENU = [
    { icon: User,         label: "My Account",       href: "/account"  },
    { icon: History,      label: "Trade History",     href: "/journal"  },
    { icon: Wallet,       label: "Billing",           href: "/billing"  },
    { icon: ArrowLeftRight, label: "API Connections", href: "/settings" },
    { icon: Settings,     label: "Settings",          href: "/settings" },
    { icon: ShieldAlert,  label: "Admin Console",     href: "/admin",   admin: true },
  ];

  // Avatar bubble reused in collapsed + expanded modes
  const AvatarBubble = () => (
    <div className="relative flex-shrink-0">
      <div
        className="w-8 h-8 rounded-full overflow-hidden"
        style={{
          border:    "1.5px solid #00aaff50",
          boxShadow: open
            ? "0 0 16px #00aaff50, 0 0 32px #00aaff18"
            : "0 0 10px #00aaff28, 0 0 0 3px #00aaff08",
          transition: "box-shadow 0.2s",
        }}
      >
        {avatarUrl && !imgErr ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover"
            onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold font-mono"
            style={{ background: "linear-gradient(135deg, #00aaff20, #7b68ee20)", color: "#00aaff" }}>
            {initials}
          </div>
        )}
      </div>
      {/* Online pulse */}
      <span
        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 live-dot"
        style={{ background: "#00ff8a", borderColor: "#000508", boxShadow: "0 0 6px #00ff8a80" }}
      />
    </div>
  );

  if (collapsed) {
    return (
      <div className="px-2 pb-2 pt-1 border-t flex justify-center relative" style={{ borderTopColor: "#0E2030" }}
        ref={ref}>
        <button onClick={() => setOpen(o => !o)} title={displayName}>
          <AvatarBubble />
        </button>
        {open && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded border overflow-hidden z-50 w-48"
            style={{ background: "#010C18", borderColor: "#0d2035", boxShadow: "0 -8px 32px #000000c0" }}
          >
            <div className="px-3 py-2.5 border-b" style={{ borderColor: "#0d1e2e", background: "#000000" }}>
              <div className="text-[10px] font-bold font-mono truncate" style={{ color: "#EAF2FF" }}>{displayName}</div>
              <div className="text-[8px] font-mono truncate" style={{ color: "#3a5a70" }}>{email}</div>
            </div>
            {MENU.map(item => (
              <Link key={item.href + item.label} href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 transition-all border-b"
                style={{ borderColor: "#0a1520", color: (item as { admin?: boolean }).admin ? "#cc55ff" : "#7a9eb8" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#0a1e2e")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <item.icon className="w-3 h-3 shrink-0" />
                <span className="text-[9px] font-mono">{item.label}</span>
                {(item as { admin?: boolean }).admin && (
                  <span className="ml-auto text-[6px] font-bold px-1 py-0.5 rounded font-mono"
                    style={{ background: "#cc55ff14", color: "#cc55ff", border: "1px solid #cc55ff30" }}>
                    ADMIN
                  </span>
                )}
              </Link>
            ))}
            <button
              onClick={() => { setOpen(false); void signOut({ redirectUrl: basePath || "/" }); }}
              className="flex items-center gap-2.5 px-3 py-2 w-full transition-all"
              style={{ color: "#ff4455" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#ff44550a")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <LogOut className="w-3 h-3 shrink-0" />
              <span className="text-[9px] font-mono">Sign Out</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 pt-1 border-t relative" style={{ borderTopColor: "#0E2030" }} ref={ref}>

      {/* Dropdown panel — floats above */}
      {open && (
        <div
          className="absolute bottom-full left-2 right-2 mb-1 rounded border overflow-hidden z-50"
          style={{
            background: "#010C18",
            borderColor: "#0d2035",
            boxShadow: "0 -8px 32px #000000c0, 0 0 0 1px #00aaff08",
          }}
        >
          {/* Profile header in dropdown */}
          <div className="flex items-center gap-3 px-3 py-3 border-b" style={{ borderColor: "#0d1e2e", background: "#000000" }}>
            <AvatarBubble />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold font-mono truncate" style={{ color: "#EAF2FF" }}>
                  {displayName}
                </span>
                <span className="text-[6px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0"
                  style={{ background: "#00aaff14", color: "#00aaff", border: "1px solid #00aaff30" }}>
                  PRO
                </span>
              </div>
              <div className="text-[8px] font-mono truncate" style={{ color: "#3a5a70" }}>{email}</div>
            </div>
          </div>

          {/* Menu items */}
          {MENU.map(item => {
            const isAdmin = (item as { admin?: boolean }).admin;
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 border-b transition-all"
                style={{ borderColor: "#0a1520", color: isAdmin ? "#cc55ff80" : "#7a9eb8" }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = isAdmin ? "#cc55ff08" : "#0a1e2e";
                  e.currentTarget.style.color      = isAdmin ? "#cc55ff" : "#C7D4E2";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color      = isAdmin ? "#cc55ff80" : "#7a9eb8";
                }}
              >
                <item.icon className="w-3 h-3 shrink-0" />
                <span className="text-[10px] font-mono flex-1">{item.label}</span>
                {isAdmin && (
                  <span className="text-[6px] font-bold px-1.5 py-0.5 rounded font-mono"
                    style={{ background: "#cc55ff10", color: "#cc55ff80", border: "1px solid #cc55ff25" }}>
                    ADMIN
                  </span>
                )}
              </Link>
            );
          })}

          {/* Sign out */}
          <button
            onClick={() => { setOpen(false); void signOut({ redirectUrl: basePath || "/" }); }}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full transition-all"
            style={{ color: "#ff445560" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#ff44550a"; e.currentTarget.style.color = "#ff4455"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#ff445560"; }}
          >
            <LogOut className="w-3 h-3 shrink-0" />
            <span className="text-[10px] font-mono">Sign Out</span>
          </button>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded transition-all border"
        style={{
          background:  open ? "#020e1c" : "#010C18",
          borderColor: open ? "#00aaff30" : "#0d1e2c",
          boxShadow:   open ? "0 0 12px #00aaff14" : "none",
        }}
      >
        <AvatarBubble />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <div className="text-[10px] font-bold font-mono truncate" style={{ color: "#7ab8cc" }}>
              {displayName}
            </div>
            <span className="text-[6px] font-bold px-1 py-0.5 rounded font-mono shrink-0"
              style={{ background: "#00aaff12", color: "#00aaff", border: "1px solid #00aaff28" }}>
              PRO
            </span>
          </div>
          <div className="text-[8px] font-mono truncate" style={{ color: "#3a5a70" }}>{email}</div>
        </div>
        <ChevronUp
          className="w-3 h-3 shrink-0 transition-transform duration-200"
          style={{ color: "#3a5a70", transform: open ? "rotate(0deg)" : "rotate(180deg)" }}
        />
      </button>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

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
    m => location === m.path || (m.path !== "/dashboard" && location.startsWith(m.path))
  )?.id ?? 1;
  const isActive = (m: typeof MODULE_LIST[number]) =>
    location === m.path || (m.path !== "/dashboard" && location.startsWith(m.path));

  const platformLinks = [
    { icon: User,         label: "My Account",   href: "/account",     badgeColor: "#00aaff"                    },
    { icon: ShieldAlert,  label: "Admin Console", href: "/admin",       badgeColor: "#cc55ff", badge: "OPERATOR" },
    { icon: Trophy,       label: "Leaderboard",   href: "/leaderboard", badgeColor: "#ffaa00"                    },
    { icon: Bell,         label: "Alerts",        href: "/alerts",      badgeColor: "#ff6600"                    },
    { icon: Zap,          label: "AI Models",     href: "/ai",          badgeColor: "#cc55ff"                    },
    { icon: DollarSign,   label: "Revenue",       href: "/admin",       badgeColor: "#ffaa00"                    },
    { icon: AlertTriangle,label: "Risk Monitor",  href: "/risk",        badgeColor: "#ff8844"                    },
  ];

  const SidebarContent = ({ onNavigate, collap }: { onNavigate?: () => void; collap: boolean }) => (
    <>
      <nav className="flex flex-col gap-px px-1.5 py-2 flex-1 overflow-y-auto">
        {MODULE_LIST.map(mod => (
          <NavItem key={mod.id} mod={mod} active={isActive(mod)} collapsed={collap} onNavigate={onNavigate} />
        ))}

        <SectionDivider label="PLATFORM" collapsed={collap} />

        {platformLinks.map(item => (
          <PlatformNavLink
            key={item.label}
            icon={item.icon}
            label={item.label}
            href={item.href}
            badge={item.badge}
            badgeColor={item.badgeColor}
            collapsed={collap}
            active={location === item.href}
          />
        ))}
      </nav>

      {!collap && (
        <div className="px-2 py-1.5 border-t shrink-0" style={{ borderTopColor: "#0E2030" }}>
          <a
            href="/aicandlez-operator-console-v5.zip"
            download
            className="flex items-center gap-2 px-2 py-1.5 rounded text-[9px] font-mono font-medium border border-transparent transition-colors"
            style={{ color: "#3a5a70" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#7a9eb8")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3a5a70")}
          >
            <Download className="w-3 h-3 shrink-0" />
            <span>Export v2</span>
          </a>
        </div>
      )}

      <UserBlock collapsed={collap} />
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#000508] text-foreground dark">

      {/* Top bar */}
      <header
        className="h-10 shrink-0 border-b flex items-center px-3 justify-between sticky top-0 z-50"
        style={{
          background:      "linear-gradient(180deg, #020e1c 0%, #000a14 100%)",
          borderBottomColor: "#0D2035",
          boxShadow:       "0 1px 0 #00eeff06, 0 2px 10px #00000070",
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
            <img src={`${import.meta.env.BASE_URL}aicandlez-logo.png`} alt="AICandlez"
              style={{ height: 24, width: 24, objectFit: "contain", borderRadius: 4,
                filter: "drop-shadow(0 0 8px rgba(0,229,255,0.35))" }}/>
            <div className="font-mono text-[12px] font-bold tracking-[0.22em]">
              <span style={{ color: "#4a7a90" }}>AI</span>
              <span style={{ color: "#00eeff", textShadow: "0 0 16px #00eeff70" }}>CANDLEZ</span>
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
            <img src={`${import.meta.env.BASE_URL}aicandlez-logo.png`} alt="AICandlez"
              style={{ height: 22, width: 22, objectFit: "contain", borderRadius: 3 }}/>
            <span className="font-mono text-[11px] font-bold tracking-[0.18em]">
              AI<span style={{ color: "#00eeff" }}>CANDLEZ</span>
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

// ── System Status Bar ─────────────────────────────────────────────────────────

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
