import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useExecutiveBriefing } from "@/hooks/useJarvisApi";
import AicandlezPanel from "@/components/core/AicandlezPanel";
import { AlertTriangle, Folders, Bot, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ExecutiveBriefing() {
  const { data: briefing, isLoading } = useExecutiveBriefing();

  const totalRevenue = briefing?.businesses.reduce((acc, b) => acc + (b.monthlyRevenue ?? 0), 0) ?? 0;
  const hasRevenue = briefing?.businesses.some(b => b.monthlyRevenue !== null);

  const fmtCurrency = (val: number) => `$${val.toLocaleString()}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4">
      {/* Header Greeting */}
      <div className="border-b border-border/40 pb-6 mb-8">
        <h1 className="text-4xl font-light tracking-tight mb-2">Good morning, <span className="font-semibold text-primary">Jules</span>.</h1>
        <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-8">
          <div className="grid grid-cols-4 gap-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      ) : !briefing ? (
        <div className="text-center text-muted-foreground font-mono">Briefing data unavailable.</div>
      ) : (
        <>
          {/* Top KPI row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-5 border-border/30 bg-card/40 backdrop-blur-md">
              <div className="text-[10px] uppercase font-mono text-muted-foreground mb-3">Portfolio Revenue</div>
              <div className="text-3xl font-light font-mono">{hasRevenue ? fmtCurrency(totalRevenue) : "—"}</div>
            </Card>
            <Card className="p-5 border-border/30 bg-card/40 backdrop-blur-md">
              <div className="text-[10px] uppercase font-mono text-muted-foreground flex items-center gap-1.5 mb-3">
                <Folders className="h-3 w-3" /> Active Projects
              </div>
              <div className="text-3xl font-light font-mono">{briefing.counts.projects}</div>
            </Card>
            <Card className="p-5 border-border/30 bg-card/40 backdrop-blur-md">
              <div className="text-[10px] uppercase font-mono text-destructive flex items-center gap-1.5 mb-3">
                <AlertTriangle className="h-3 w-3" /> Critical Alerts
              </div>
              <div className="text-3xl font-light font-mono text-destructive">
                {briefing.criticalItems.openEscalations.length + briefing.criticalItems.openFindings.length}
              </div>
            </Card>
            <Card className="p-5 border-border/30 bg-card/40 backdrop-blur-md">
              <div className="text-[10px] uppercase font-mono text-primary flex items-center gap-1.5 mb-3">
                <Bot className="h-3 w-3" /> Active Agents
              </div>
              <div className="text-3xl font-light font-mono text-primary">{briefing.counts.activeAgents}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content col */}
            <div className="lg:col-span-2 space-y-6">
              {/* Priorities */}
              <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-md">
                <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Upcoming Priorities
                </h2>
                <div className="space-y-4">
                  {briefing.upcomingPriorities.decisions.length === 0 && briefing.upcomingPriorities.tasks.length === 0 ? (
                    <div className="text-sm font-mono text-muted-foreground">No immediate priorities.</div>
                  ) : (
                    <>
                      {briefing.upcomingPriorities.decisions.map(d => (
                        <div key={d.id} className="flex flex-col gap-1 border-b border-border/30 pb-3 last:border-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-500 bg-amber-500/10">DECISION</Badge>
                            <span className="font-medium text-sm">{d.title}</span>
                          </div>
                          {d.context && <p className="text-xs text-muted-foreground line-clamp-1">{d.context}</p>}
                        </div>
                      ))}
                      {briefing.upcomingPriorities.tasks.map(t => (
                        <div key={t.id} className="flex flex-col gap-1 border-b border-border/30 pb-3 last:border-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary bg-primary/10">TASK</Badge>
                            <span className="font-medium text-sm">{t.title}</span>
                          </div>
                          {t.description && <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </Card>

              {/* Businesses Snapshot */}
              <Card className="p-6 border-border/40 bg-card/40 backdrop-blur-md">
                <h2 className="text-lg font-semibold tracking-tight mb-4">Portfolio Status</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {briefing.businesses.map(b => (
                    <div key={b.id} className="p-4 border border-border/40 rounded-md bg-background/30">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm">{b.name}</span>
                        <Badge variant="outline" className={cn(
                          "text-[9px] font-mono",
                          b.healthStatus === "healthy" ? "border-emerald-500/30 text-emerald-500" :
                          b.healthStatus === "watch" ? "border-amber-500/30 text-amber-500" :
                          b.healthStatus === "critical" ? "border-destructive/30 text-destructive" : "text-muted-foreground"
                        )}>{b.healthStatus?.toUpperCase() ?? "UNKNOWN"}</Badge>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        Rev: {b.monthlyRevenue !== null ? fmtCurrency(b.monthlyRevenue) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Sidebar content */}
            <div className="space-y-6">
              <AicandlezPanel />
              
              <Card className="p-5 border-border/40 bg-card/40 backdrop-blur-md">
                <h3 className="text-xs font-mono uppercase tracking-widest text-destructive mb-4">Action Items</h3>
                <div className="space-y-3">
                  {briefing.criticalItems.openEscalations.length === 0 && briefing.criticalItems.pendingApprovals.length === 0 ? (
                    <div className="text-xs font-mono text-muted-foreground">All clear.</div>
                  ) : (
                    <>
                      {briefing.criticalItems.openEscalations.map(e => (
                        <div key={e.id} className="text-xs border-l-2 border-destructive pl-2 py-1">
                          <span className="font-medium block">{e.title}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">Escalation</span>
                        </div>
                      ))}
                      {briefing.criticalItems.pendingApprovals.map(a => (
                        <div key={a.id} className="text-xs border-l-2 border-amber-500 pl-2 py-1">
                          <span className="font-medium block">{a.title}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">Approval needed</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
