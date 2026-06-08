import { Brain, Gauge, Coins, Activity, Layers, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserRole } from "@/hooks/useUserRole";
import {
  useCognitionOverview,
  useCognitionEnabled,
  useSetCognitionEnabled,
  useSemanticStatus,
  useSetSemanticEnabled,
  useSetIndexerTickEnabled,
  useRunSemanticBackfill,
  type CognitionRunStatus,
} from "@/hooks/useJarvisApi";

function statusTone(status: CognitionRunStatus): string {
  switch (status) {
    case "ok":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
    case "degraded":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    case "budget_exceeded":
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </Card>
  );
}

function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function coveragePct(embedded: number, corpus: number): number {
  if (corpus <= 0) return 0;
  return Math.min(100, Math.round((embedded / corpus) * 100));
}

function SemanticRetrievalCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, isError } = useSemanticStatus();
  const setSemantic = useSetSemanticEnabled();
  const setTick = useSetIndexerTickEnabled();
  const backfill = useRunSemanticBackfill();

  async function onToggleSemantic(next: boolean) {
    try {
      await setSemantic.mutateAsync(next);
      toast.success(next ? "Semantic retrieval enabled." : "Semantic retrieval disabled.");
    } catch {
      toast.error("Toggle failed — you may lack the required role.");
    }
  }

  async function onToggleTick(next: boolean) {
    try {
      await setTick.mutateAsync(next);
      toast.success(next ? "Indexer tick pass enabled." : "Indexer tick pass disabled.");
    } catch {
      toast.error("Toggle failed — you may lack the required role.");
    }
  }

  async function onBackfill() {
    try {
      const res = await backfill.mutateAsync(undefined);
      if (res.budgetExceeded) {
        toast.warning(`Backfill stopped — budget exceeded (${res.upserted} embedded).`);
      } else if (res.errored) {
        toast.error(`Backfill error: ${res.error ?? "unknown"}`);
      } else {
        toast.success(`Backfill complete — ${res.upserted} embedded, ${res.skipped} unchanged.`);
      }
    } catch {
      toast.error("Backfill failed — you may lack the required role.");
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Semantic Retrieval</h2>
          {data ? (
            <Badge
              variant="outline"
              className={
                data.enabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {data.enabled ? "Hybrid" : "Lexical-only"}
            </Badge>
          ) : null}
        </div>
        {isAdmin && data ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="sem-toggle" className="text-xs text-muted-foreground">
                Semantic
              </Label>
              <Switch
                id="sem-toggle"
                checked={data.enabled}
                disabled={setSemantic.isPending}
                onCheckedChange={onToggleSemantic}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="tick-toggle" className="text-xs text-muted-foreground">
                Tick index
              </Label>
              <Switch
                id="tick-toggle"
                checked={data.indexerTickEnabled}
                disabled={setTick.isPending}
                onCheckedChange={onToggleTick}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={backfill.isPending}
              onClick={onBackfill}
            >
              {backfill.isPending ? "Backfilling…" : "Backfill"}
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="p-5">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError || !data ? (
        <p className="p-8 text-center text-sm text-destructive">
          Failed to load semantic status.
        </p>
      ) : (
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Embedding Coverage"
              value={`${coveragePct(data.totals.embedded, data.totals.corpus)}%`}
              hint={`${data.totals.embedded} / ${data.totals.corpus} indexed`}
              icon={Layers}
            />
            <StatCard
              label="Model"
              value={data.hasApiKey ? "Ready" : "No key"}
              hint={data.model}
              icon={Brain}
            />
            <StatCard
              label="Last Index Run"
              value={data.lastRun ? data.lastRun.status : "—"}
              hint={
                data.lastRun
                  ? new Date(data.lastRun.createdAt).toLocaleString()
                  : "never run"
              }
              icon={Activity}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Embedded</TableHead>
                <TableHead>Corpus</TableHead>
                <TableHead>Coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.perType).map(([type, c]) => (
                <TableRow key={type}>
                  <TableCell className="font-medium capitalize">{type}</TableCell>
                  <TableCell className="text-muted-foreground">{c.embedded}</TableCell>
                  <TableCell className="text-muted-foreground">{c.corpus}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {coveragePct(c.embedded, c.corpus)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

export default function Cognition() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { data: enabled } = useCognitionEnabled();
  const setEnabled = useSetCognitionEnabled();
  const { data, isLoading, isError } = useCognitionOverview();

  async function onToggle(next: boolean) {
    try {
      await setEnabled.mutateAsync(next);
      toast.success(next ? "Cognition enabled." : "Cognition disabled.");
    } catch {
      toast.error("Toggle failed — you may lack the required role.");
    }
  }

  const avgGrounding =
    data?.avgGroundingScore != null ? `${data.avgGroundingScore}` : "—";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cognition</h1>
          <p className="text-sm text-muted-foreground">
            Advisory-only LLM plane — proposes grounded drafts, never acts. Every
            run is logged for audit.
          </p>
        </div>
        {!roleLoading && isAdmin ? (
          <div className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2">
            <Label htmlFor="cog-toggle" className="text-sm">
              {enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="cog-toggle"
              checked={Boolean(enabled)}
              disabled={setEnabled.isPending}
              onCheckedChange={onToggle}
            />
          </div>
        ) : (
          <Badge variant="outline" className="capitalize">
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError || !data ? (
        <Card className="p-8 text-center text-sm text-destructive">
          Failed to load cognition overview.
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Runs"
              value={String(data.counts.totalRuns)}
              hint="advisory invocations"
              icon={Activity}
            />
            <StatCard
              label="Avg Grounding"
              value={avgGrounding}
              hint="citation-backed score"
              icon={Gauge}
            />
            <StatCard
              label="Total Cost"
              value={formatUsd(data.totalCostMicros)}
              hint="charged to cognition budget"
              icon={Coins}
            />
            <StatCard
              label="Budget"
              value={
                data.budget
                  ? `${formatUsd(data.budget.consumedMicros)} / ${formatUsd(
                      data.budget.limitMicros,
                    )}`
                  : "—"
              }
              hint={
                data.budget?.exceeded ? "exceeded — blocked" : "consumed / limit"
              }
              icon={Brain}
            />
          </div>

          <Card>
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Recent Runs</h2>
            </div>
            {data.recentRuns.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No cognition runs yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Grounding</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium capitalize">
                        {run.kind.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${statusTone(
                            run.status,
                          )}`}
                        >
                          {run.status.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell>
                        {run.groundingScore === null ? "—" : run.groundingScore}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {run.inputTokens + run.outputTokens}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatUsd(run.costMicros)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {run.latencyMs === null ? "—" : `${run.latencyMs}ms`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <SemanticRetrievalCard isAdmin={!roleLoading && isAdmin} />
        </>
      )}
    </div>
  );
}
