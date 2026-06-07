import React from "react";
import { Building2, Activity, ArrowUpRight, ArrowDownRight, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinesses } from "@/hooks/useJarvisApi";
import { cn } from "@/lib/utils";

export default function BusinessRegistry({ className }: { className?: string }) {
  const { data: businesses, isLoading } = useBusinesses();

  return (
    <Card className={cn("flex flex-col border-border/40 bg-card/40 backdrop-blur-md overflow-hidden", className)}>
      <div className="flex h-10 items-center justify-between border-b border-border/40 bg-muted/20 px-4">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          <Building2 className="h-3.5 w-3.5" />
          Business Registry
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))
        ) : !businesses || businesses.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground font-mono">
            No active operations.
          </div>
        ) : (
          businesses.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-3 p-3 rounded-md border border-border/50 bg-background/30 hover:bg-background/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm tracking-tight">{b.name}</div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-mono",
                    b.status === "active" ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" : "text-muted-foreground"
                  )}
                >
                  {b.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Revenue</span>
                  <span className="font-mono">
                    {b.monthlyRevenue !== null ? `$${b.monthlyRevenue.toLocaleString()}` : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Health</span>
                  <div className="flex items-center gap-1.5 font-medium">
                    {b.healthStatus === "healthy" ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    ) : b.healthStatus === "watch" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    ) : b.healthStatus === "critical" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    ) : null}
                    <span className={cn(
                      b.healthStatus === "critical" && "text-destructive",
                      b.healthStatus === "watch" && "text-amber-500",
                      b.healthStatus === "healthy" && "text-emerald-500"
                    )}>
                      {b.healthStatus ? b.healthStatus.toUpperCase() : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
