import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  Bot,
  Workflow,
  ScrollText,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Businesses", path: "/businesses", icon: Building2 },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Agents", path: "/agents", icon: Bot },
  { label: "Workflows", path: "/workflows", icon: Workflow },
  { label: "Audit Log", path: "/audit", icon: ScrollText },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/50 md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Jarvis</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Command Center
            </span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active =
              item.path === "/" ? location === "/" : location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <a
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border px-6">
          <div className="flex items-center gap-2 overflow-x-auto md:hidden">
            {NAV_ITEMS.map((item) => {
              const active =
                item.path === "/" ? location === "/" : location.startsWith(item.path);
              const Icon = item.icon;
              return (
                <Link key={item.path} href={item.path}>
                  <a
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                </Link>
              );
            })}
          </div>
          <div className="ml-auto">
            <UserButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
