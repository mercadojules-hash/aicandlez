import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  Bot,
  Radar,
  Workflow,
  ShieldAlert,
  Terminal,
  Activity,
  ListTodo,
  GitBranch,
  AlertTriangle,
  CheckSquare,
  History,
  ScrollText,
  Settings as SettingsIcon,
  Gauge,
  Brain,
  BookOpen,
  FolderTree,
  Network,
  Search as SearchIcon,
  Compass,
  Lightbulb,
  Sparkles,
  FileText,
  Telescope,
  ShieldCheck,
  Scale,
  Radio,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

export interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Briefing", path: "/executive-briefing", icon: FileText },
  { label: "Executive Query", path: "/executive-query", icon: Sparkles },
  { label: "Command Center", path: "/", icon: Command },
  { label: "Intelligence", path: "/intelligence", icon: Telescope },
  { label: "Businesses", path: "/businesses", icon: Building2 },
  { label: "Agents", path: "/agents", icon: Bot },
  { label: "Knowledge Graph", path: "/knowledge-graph", icon: Network },
  { label: "Knowledge", path: "/knowledge", icon: BookOpen },
  { label: "Voice", path: "/voice", icon: Radio },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      <aside className="hidden w-16 md:w-64 shrink-0 flex-col border-r border-border bg-card/30 backdrop-blur-xl md:flex group transition-all duration-300">
        <div className="flex h-16 items-center gap-3 border-b border-border px-4 md:px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(0,255,255,0.1)]">
            <Command className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight overflow-hidden opacity-0 md:opacity-100 transition-opacity">
            <span className="text-sm font-bold tracking-widest text-primary uppercase">Jarvis</span>
            <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              Core OS
            </span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-2 md:p-3 overflow-hidden hover:overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map((item) => {
            const active = item.path === "/" ? location === "/" : location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <a
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 md:px-3 py-2.5 text-xs md:text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_var(--color-primary)]"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline whitespace-nowrap">{item.label}</span>
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border flex justify-center md:justify-start">
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8 border border-border" } }} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col relative z-0">
        <header className="flex h-14 md:h-16 items-center justify-between gap-4 border-b border-border px-4 md:px-6 bg-background/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2 md:hidden overflow-x-auto no-scrollbar py-2">
            {NAV_ITEMS.map((item) => {
              const active = item.path === "/" ? location === "/" : location.startsWith(item.path);
              const Icon = item.icon;
              return (
                <Link key={item.path} href={item.path}>
                  <a
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors",
                      active ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground bg-muted/30",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                </Link>
              );
            })}
          </div>
          <div className="hidden md:flex flex-1 items-center gap-4 text-xs font-mono tracking-wider text-muted-foreground/50">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary/50 shadow-[0_0_5px_var(--color-primary)]"></div> SYSTEM ONLINE</span>
            <span>|</span>
            <span>{new Date().toISOString().split('T')[0]}</span>
            <span>|</span>
            <span className="uppercase">Jules</span>
          </div>
          <div className="md:hidden ml-auto">
            <UserButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background min-h-0 relative">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] mix-blend-overlay pointer-events-none"></div>
          {children}
        </main>
      </div>
    </div>
  );
}
