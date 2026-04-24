import { Link, useLocation } from "wouter";
import { Activity, BarChart2, LayoutDashboard, Settings, TerminalSquare } from "lucide-react";
import { useGetDashboardSummary, useToggleKillSwitch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDashboardSummaryQueryKey, getGetSettingsQueryKey } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const { data: summary } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: 10000,
    }
  });

  const toggleKillSwitch = useToggleKillSwitch();

  const handleKillSwitch = () => {
    const newActive = !summary?.killSwitchActive;
    toggleKillSwitch.mutate(
      { data: { active: newActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark selection:bg-primary/30">
      <header className="h-14 border-b border-border/40 bg-card/50 backdrop-blur flex items-center px-4 justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <Activity className="w-5 h-5 text-primary" />
            <span>APEX<span className="text-primary">TRADER</span></span>
          </div>
          
          <nav className="hidden md:flex items-center gap-1 ml-4">
            <NavItem href="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active={location === "/"} />
            <NavItem href="/backtest" icon={<BarChart2 className="w-4 h-4" />} label="Backtest" active={location === "/backtest"} />
            <NavItem href="/logs" icon={<TerminalSquare className="w-4 h-4" />} label="Logs" active={location === "/logs"} />
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {summary && (
            <>
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-card border border-border">
                  <span className="text-muted-foreground">AUTO:</span>
                  <span className={summary.autoModeActive ? "text-success" : "text-muted-foreground"}>
                    {summary.autoModeActive ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
              <button
                onClick={handleKillSwitch}
                className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-2 transition-all ${
                  summary.killSwitchActive 
                    ? "bg-destructive/20 text-destructive border border-destructive/50 shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                    : "bg-card border border-border text-muted-foreground hover:bg-card/80"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${summary.killSwitchActive ? "bg-destructive animate-pulse" : "bg-muted-foreground"}`} />
                KILL SWITCH
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {children}
      </main>
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-card'}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}