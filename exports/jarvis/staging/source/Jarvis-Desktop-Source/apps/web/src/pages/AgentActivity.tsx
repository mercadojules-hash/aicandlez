import { useState } from "react";
import {
  Play,
  Square,
  Bot,
  Activity,
  MessageSquare,
  ListChecks,
  Sparkles,
  CircleDot,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useRuntimeOverview,
  useRuntimeActivity,
  useStartRuntime,
  useStopRuntime,
  useRunAgent,
  useSeedDefaultAgents,
  type JarvisRuntimeOverview,
  type JarvisRuntimeActivityEvent,
  type JarvisAgentRun,
  type JarvisAgentMessage,
} from "@/hooks/useJarvisApi";

function runStatusTone(status: string): string {
  switch (status) {
    case "succeeded":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
    case "running":
      return "border-sky-500/30 bg-sky-500/10 text-sky-500";
    case "failed":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "skipped":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function severityTone(severity: string): string {
  switch (severity) {
    case "error":
      return "text-destructive";
    case "warn":
      return "text-amber-500";
    case "success":
      return "text-emerald-500";
    default:
      return "text-muted-foreground";
  }
}

function fmtTime(value: string | number | null): string {
  if (value == null) return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  return d.toLocaleTimeString();
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number | string;
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

function RuntimeControl({ overview }: { overview: JarvisRuntimeOverview }) {
  const start = useStartRuntime();
  const stop = useStopRuntime();
  const seed = useSeedDefaultAgents();
  const running = overview.runtime.running;

  return (
    <Card className="flex flex-wrap items-center gap-4 p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            running
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-muted text-muted-foreground",
          )}
        >
          <CircleDot className={cn("h-5 w-5", running && "animate-pulse")} />
        </span>
        <div>
          <div className="text-sm font-semibold">
            Runtime {running ? "Running" : "Stopped"}
          </div>
          <div className="text-xs text-muted-foreground">
            {running
              ? `tick #${overview.runtime.tickCount} · every ${Math.round(
                  overview.runtime.tickIntervalMs / 1000,
                )}s · last ${fmtTime(overview.runtime.lastTickAt)}`
              : "The agent loop is off. Start it to schedule due agents."}
          </div>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={seed.isPending}
          onClick={async () => {
            try {
              const r = await seed.mutateAsync();
              toast.success(
                r.created.length
                  ? `Seeded ${r.created.length} agent(s)`
                  : "All default agents already exist",
              );
            } catch {
              toast.error("Could not seed default agents");
            }
          }}
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          Seed Defaults
        </Button>
        {running ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={stop.isPending}
            onClick={async () => {
              try {
                await stop.mutateAsync();
                toast.success("Runtime stopped");
              } catch {
                toast.error("Could not stop runtime");
              }
            }}
          >
            <Square className="mr-1.5 h-4 w-4" />
            Stop Runtime
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={start.isPending}
            onClick={async () => {
              try {
                await start.mutateAsync({});
                toast.success("Runtime started");
              } catch {
                toast.error("Could not start runtime");
              }
            }}
          >
            <Play className="mr-1.5 h-4 w-4" />
            Start Runtime
          </Button>
        )}
      </div>
    </Card>
  );
}

function FleetCard({
  agent,
}: {
  agent: JarvisRuntimeOverview["fleet"][number];
}) {
  const run = useRunAgent();
  const inFlight = agent.runtimeStatus === "running";
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            agent.enabled
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{agent.name}</span>
            {!agent.hasHandler && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-500"
              >
                no handler
              </Badge>
            )}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {agent.agentType}
          </div>
        </div>
        <Badge variant="outline" className={runStatusTone(agent.runtimeStatus)}>
          {agent.runtimeStatus}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div>
          Scheduler:{" "}
          <span className="text-foreground">
            {agent.enabled
              ? agent.scheduleSeconds
                ? `every ${agent.scheduleSeconds}s`
                : "enabled"
              : "disabled"}
          </span>
        </div>
        <div>
          Priority: <span className="text-foreground">{agent.priority}</span>
        </div>
        <div className="col-span-2">
          Last run:{" "}
          <span
            className={cn(
              agent.lastRunStatus === "failed"
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {agent.lastRunAt
              ? `${new Date(agent.lastRunAt).toLocaleString()}${
                  agent.lastRunStatus ? ` · ${agent.lastRunStatus}` : ""
                }`
              : "never"}
          </span>
        </div>
      </div>

      {agent.lastError && (
        <div className="flex items-start gap-1.5 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{agent.lastError}</span>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={run.isPending || inFlight || !agent.hasHandler}
        onClick={async () => {
          try {
            const { outcome } = await run.mutateAsync(agent.id);
            if (outcome.ok) {
              toast.success(`${agent.name}: ${outcome.summary ?? "run complete"}`);
            } else {
              toast.error(
                `${agent.name} failed: ${outcome.error ?? "unknown error"}`,
              );
            }
          } catch {
            toast.error(`Could not run ${agent.name}`);
          }
        }}
      >
        <Play className="mr-1 h-3.5 w-3.5" />
        Run now
      </Button>
    </Card>
  );
}

function RunRow({ run }: { run: JarvisAgentRun }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", runStatusTone(run.status))}>
        {run.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {run.agentName ?? "—"}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {run.trigger}
          </span>
        </div>
        {run.summary && (
          <div className="truncate text-xs text-muted-foreground">{run.summary}</div>
        )}
        {run.error && (
          <div className="truncate text-xs text-destructive">{run.error}</div>
        )}
      </div>
      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
        <div>{fmtTime(run.startedAt)}</div>
        <div>
          {run.itemsProcessed} items · {fmtDuration(run.durationMs)}
        </div>
      </div>
    </div>
  );
}

function MessageRow({ msg }: { msg: JarvisAgentMessage }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
        {msg.messageType}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{msg.subject}</div>
        <div className="truncate text-xs text-muted-foreground">
          {msg.fromAgentName ?? "system"} → {msg.toAgentName ?? "broadcast"}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">
        {fmtTime(msg.createdAt)}
      </div>
    </div>
  );
}

function ActivityRow({ event }: { event: JarvisRuntimeActivityEvent }) {
  return (
    <div className="flex items-start gap-2 px-4 py-2 font-mono text-[11px]">
      <span className="shrink-0 text-muted-foreground">{fmtTime(event.ts)}</span>
      <span className={cn("shrink-0 uppercase", severityTone(event.severity))}>
        {event.type}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {event.agentName ? `[${event.agentName}] ` : ""}
        {event.message}
      </span>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            {count}
          </Badge>
        )}
      </div>
      <div className="max-h-[22rem] overflow-y-auto">{children}</div>
    </Card>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function AgentActivity() {
  const { data, isLoading, isError } = useRuntimeOverview();
  const { data: activity } = useRuntimeActivity(200);
  const [tab, setTab] = useState<"runs" | "messages" | "log">("runs");

  if (isLoading) return <LoadingState />;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <p className="p-12 text-center text-sm text-destructive">
            Failed to load agent runtime.
          </p>
        </Card>
      </div>
    );
  }

  const succeeded =
    data.runsByStatus.find((r) => r.status === "succeeded")?.c ?? 0;
  const failed = data.runsByStatus.find((r) => r.status === "failed")?.c ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Activity</h1>
        <p className="text-sm text-muted-foreground">
          Runtime control, agent fleet health, and the live coordination feed.
        </p>
      </div>

      <RuntimeControl overview={data} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Agents"
          value={data.totals.agents}
          hint={`${data.totals.enabled} scheduler-enabled`}
          icon={Bot}
        />
        <StatCard
          label="Total Runs"
          value={data.totals.runs}
          hint={`${succeeded} ok · ${failed} failed`}
          icon={ListChecks}
        />
        <StatCard
          label="Messages"
          value={data.totals.messages}
          hint="coordination protocol"
          icon={MessageSquare}
        />
        <StatCard
          label="In Flight"
          value={data.runtime.inFlight.length}
          hint={data.runtime.running ? "runtime running" : "runtime stopped"}
          icon={Activity}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Agent Fleet
        </h2>
        {data.fleet.length === 0 ? (
          <Card>
            <EmptyRow text="No agents yet. Use “Seed Defaults” to install the governed fleet." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.fleet.map((agent) => (
              <FleetCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>

      <Card className="flex flex-col">
        <div className="flex items-center gap-1 border-b border-border px-2 py-2">
          {(
            [
              { key: "runs", label: "Run Feed", icon: ListChecks },
              { key: "messages", label: "Coordination", icon: MessageSquare },
              { key: "log", label: "Live Log", icon: Activity },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  tab === t.key
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="max-h-[26rem] overflow-y-auto">
          {tab === "runs" &&
            (data.recentRuns.length === 0 ? (
              <EmptyRow text="No runs yet." />
            ) : (
              <div className="divide-y divide-border">
                {data.recentRuns.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </div>
            ))}
          {tab === "messages" &&
            (data.recentMessages.length === 0 ? (
              <EmptyRow text="No coordination messages yet." />
            ) : (
              <div className="divide-y divide-border">
                {data.recentMessages.map((m) => (
                  <MessageRow key={m.id} msg={m} />
                ))}
              </div>
            ))}
          {tab === "log" &&
            (!activity || activity.events.length === 0 ? (
              <EmptyRow text="No runtime events captured yet." />
            ) : (
              <div className="divide-y divide-border/50">
                {[...activity.events].reverse().map((e) => (
                  <ActivityRow key={e.id} event={e} />
                ))}
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
