import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAgentTrust, type JarvisAgentTrust } from "@/hooks/useJarvisApi";

function scoreTone(score: number): string {
  if (score >= 70) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  if (score >= 40) return "border-amber-500/30 bg-amber-500/10 text-amber-500";
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

function successRate(t: JarvisAgentTrust): string {
  if (t.totalRuns === 0) return "—";
  return `${Math.round((t.successfulRuns / t.totalRuns) * 100)}%`;
}

export default function AgentTrust() {
  const { data, isLoading, isError } = useAgentTrust();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Trust</h1>
        <p className="text-sm text-muted-foreground">
          Deterministic trust scorecards derived from run outcomes and governance
          decisions. Read-only — recomputed on the governance maintenance pass.
        </p>
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            Failed to load agent trust scores.
          </p>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Trust</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Success</TableHead>
                <TableHead>Denied</TableHead>
                <TableHead>Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {t.agentName ?? t.agentType ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={scoreTone(t.score)}>
                      {t.score}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.totalRuns}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {successRate(t)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.deniedActions}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.approvedActions}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="p-12 text-center text-sm text-muted-foreground">
            No trust scores computed yet. Scores populate once agents run under
            governance.
          </p>
        )}
      </Card>
    </div>
  );
}
