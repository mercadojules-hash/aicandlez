import {
  Network,
  Workflow as WorkflowIcon,
  GitBranch,
  AlertTriangle,
  Terminal,
  MessageSquare,
  Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useOrchestrationOverview,
  type JarvisWorkflowRun,
  type JarvisDelegation,
  type JarvisCommand,
  type JarvisAgentMessage,
} from "@/hooks/useJarvisApi";

function tone(status: string): string {
  switch (status) {
    case "completed":
    case "succeeded":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
    case "running":
    case "dispatched":
    case "in_progress":
      return "border-sky-500/30 bg-sky-500/10 text-sky-500";
    case "queued":
    case "pending":
    case "received":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    case "failed":
    case "rejected":
    case "expired":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function fmt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString();
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

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function RunRow({ run }: { run: JarvisWorkflowRun }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", tone(run.status))}>
        {run.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{run.workflowName ?? "—"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {run.stepsCompleted}/{run.stepsTotal} steps · {run.trigger}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">
        {fmt(run.startedAt)}
      </div>
    </div>
  );
}

function DelegationRow({ d }: { d: JarvisDelegation }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", tone(d.status))}>
        {d.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{d.objective}</div>
        <div className="truncate text-xs text-muted-foreground">
          {d.fromAgentName ?? "system"} → {d.toAgentName ?? "—"}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">{fmt(d.createdAt)}</div>
    </div>
  );
}

function CommandRow({ c }: { c: JarvisCommand }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", tone(c.status))}>
        {c.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium font-mono">{c.verb ?? "?"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {c.routedAgentType ?? "unrouted"}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">{fmt(c.createdAt)}</div>
    </div>
  );
}

function MessageRow({ m }: { m: JarvisAgentMessage }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
        {m.messageType}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{m.subject}</div>
        <div className="truncate text-xs text-muted-foreground">
          {m.fromAgentName ?? "system"} → {m.toAgentName ?? "broadcast"}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">{fmt(m.createdAt)}</div>
    </div>
  );
}

export default function Collaboration() {
  const { data, isLoading, isError } = useOrchestrationOverview();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <p className="p-12 text-center text-sm text-destructive">
            Failed to load orchestration overview.
          </p>
        </Card>
      </div>
    );
  }

  const activeRuns =
    data.runsByStatus.find((r) => r.status === "running")?.c ?? 0;
  const openDelegations =
    data.delegationsByStatus
      .filter((d) => d.status !== "completed" && d.status !== "expired")
      .reduce((a, b) => a + b.c, 0);
  const pendingCommands =
    data.commandsByStatus
      .filter((c) => c.status === "received" || c.status === "dispatched")
      .reduce((a, b) => a + b.c, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Collaboration</h1>
        <p className="text-sm text-muted-foreground">
          Multi-agent orchestration overview — workflows, delegations, commands, and
          agent-to-agent messaging.
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            data.runtime.running
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Activity className={cn("h-5 w-5", data.runtime.running && "animate-pulse")} />
        </span>
        <div>
          <div className="text-sm font-semibold">
            Orchestrator {data.runtime.running ? "Running" : "Stopped"}
          </div>
          <div className="text-xs text-muted-foreground">
            {data.runtime.running
              ? `tick #${data.runtime.tickCount} · pumped from the runtime loop`
              : "The runtime loop is off. Start it from Agent Activity."}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Workflows"
          value={data.totals.workflows}
          hint={`${data.totals.enabledWorkflows} enabled · ${activeRuns} running`}
          icon={WorkflowIcon}
        />
        <StatCard
          label="Open Delegations"
          value={openDelegations}
          hint="awaiting completion"
          icon={GitBranch}
        />
        <StatCard
          label="Routing Rules"
          value={data.totals.routingRules}
          hint={`${data.totals.escalationChains} escalation chains`}
          icon={Network}
        />
        <StatCard
          label="Pending Commands"
          value={pendingCommands}
          hint="received or dispatched"
          icon={Terminal}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workflow Runs" icon={WorkflowIcon} count={data.recentRuns.length}>
          {data.recentRuns.length === 0 ? (
            <Empty text="No workflow runs yet." />
          ) : (
            <div className="divide-y divide-border">
              {data.recentRuns.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Delegations"
          icon={GitBranch}
          count={data.recentDelegations.length}
        >
          {data.recentDelegations.length === 0 ? (
            <Empty text="No delegations yet." />
          ) : (
            <div className="divide-y divide-border">
              {data.recentDelegations.map((d) => (
                <DelegationRow key={d.id} d={d} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Commands" icon={Terminal} count={data.recentCommands.length}>
          {data.recentCommands.length === 0 ? (
            <Empty text="No commands issued yet." />
          ) : (
            <div className="divide-y divide-border">
              {data.recentCommands.map((c) => (
                <CommandRow key={c.id} c={c} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="A2A Messages"
          icon={MessageSquare}
          count={data.recentMessages.length}
        >
          {data.recentMessages.length === 0 ? (
            <Empty text="No agent-to-agent messages yet." />
          ) : (
            <div className="divide-y divide-border">
              {data.recentMessages.map((m) => (
                <MessageRow key={m.id} m={m} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
