import React from "react";
import { Telescope, AlertTriangle, Lightbulb, FolderKanban, CheckSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  useEscalations, 
  useProjects, 
  useApprovals,
  useFindings
} from "@/hooks/useJarvisApi";
import { cn } from "@/lib/utils";

export default function IntelligencePanel({ className }: { className?: string }) {
  const { data: escalations, isLoading: escLoading } = useEscalations();
  const { data: projects, isLoading: projLoading } = useProjects();
  const { data: approvals, isLoading: appLoading } = useApprovals();
  const { data: findings, isLoading: findLoading } = useFindings();

  const openEscalations = escalations?.filter(e => e.status === "open") ?? [];
  const pendingApprovals = approvals?.filter(a => a.status === "pending") ?? [];
  const activeProjects = projects?.filter(p => p.status === "active") ?? [];
  const recentFindings = findings?.slice(0, 3) ?? [];

  const isLoading = escLoading || projLoading || appLoading || findLoading;

  return (
    <Card className={cn("flex flex-col border-border/40 bg-card/40 backdrop-blur-md overflow-hidden", className)}>
      <div className="flex h-10 items-center justify-between border-b border-border/40 bg-muted/20 px-4">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          <Telescope className="h-3.5 w-3.5" />
          Intelligence
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))
        ) : (
          <>
            {/* Critical Escalations */}
            {openEscalations.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] text-destructive uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> Action Required
                </div>
                <div className="space-y-2">
                  {openEscalations.slice(0, 2).map((e) => (
                    <div key={e.id} className="p-3 border border-destructive/30 bg-destructive/5 rounded-md">
                      <div className="text-xs font-medium text-destructive-foreground">{e.title}</div>
                      {e.description && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{e.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Approvals */}
            {pendingApprovals.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] text-amber-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <CheckSquare className="h-3 w-3" /> Pending Approvals
                </div>
                <div className="space-y-2">
                  {pendingApprovals.slice(0, 2).map((a) => (
                    <div key={a.id} className="p-3 border border-amber-500/20 bg-amber-500/5 rounded-md">
                      <div className="text-xs font-medium text-amber-500/90">{a.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Projects */}
            <div className="space-y-3">
              <div className="text-[10px] text-primary uppercase tracking-widest font-mono flex items-center gap-1.5">
                <FolderKanban className="h-3 w-3" /> Active Projects
              </div>
              <div className="space-y-2">
                {activeProjects.slice(0, 3).map((p) => (
                  <div key={p.id} className="p-3 border border-border/50 bg-background/30 rounded-md">
                    <div className="text-xs font-medium text-foreground">{p.name}</div>
                  </div>
                ))}
                {activeProjects.length === 0 && (
                  <div className="text-xs text-muted-foreground font-mono">No active projects</div>
                )}
              </div>
            </div>

            {/* Recent Findings */}
            {recentFindings.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] text-emerald-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <Lightbulb className="h-3 w-3" /> Latest Findings
                </div>
                <div className="space-y-2">
                  {recentFindings.map((f) => (
                    <div key={f.id} className="p-3 border border-emerald-500/20 bg-emerald-500/5 rounded-md">
                      <div className="text-xs font-medium text-emerald-500/90">{f.title}</div>
                      <Badge variant="outline" className="mt-2 text-[9px] font-mono bg-emerald-500/10 border-emerald-500/30 text-emerald-500">
                        {f.category ?? "Insight"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
