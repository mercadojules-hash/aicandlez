import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ListTodo,
  GitBranch,
  AlertTriangle,
  CheckSquare,
} from "lucide-react";
import { useOperations, type JarvisOperations } from "@/hooks/useJarvisApi";

function StatCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  alert,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  alert?: boolean;
}) {
  return (
    <Link href={href}>
      <a className="block">
        <Card className="flex items-start gap-4 p-5 transition-colors hover:bg-muted/40">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
              alert
                ? "bg-destructive/15 text-destructive"
                : "bg-primary/15 text-primary"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
        </Card>
      </a>
    </Link>
  );
}

function QueuePanel({
  title,
  href,
  rows,
}: {
  title: string;
  href: string;
  rows: { id: string; title: string; meta: string }[];
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={href}>
          <a className="text-xs text-primary hover:underline">View all</a>
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing pending.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="truncate text-sm font-medium">{r.title}</span>
              <span className="ml-auto shrink-0 text-xs capitalize text-muted-foreground">
                {r.meta}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}

function Content({ ops }: { ops: JarvisOperations }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="text-sm text-muted-foreground">
          A live view of open work, decisions, escalations, and approvals.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open Tasks"
          value={ops.tasks.total - (ops.tasks.byStatus.done ?? 0)}
          hint={`${ops.tasks.overdue} overdue · ${ops.tasks.total} total`}
          href="/tasks"
          icon={ListTodo}
          alert={ops.tasks.overdue > 0}
        />
        <StatCard
          label="Pending Decisions"
          value={ops.decisions.pending}
          hint={`${ops.decisions.total} total`}
          href="/decisions"
          icon={GitBranch}
        />
        <StatCard
          label="Open Escalations"
          value={ops.escalations.open}
          hint={`${ops.escalations.criticalOpen} critical`}
          href="/escalations"
          icon={AlertTriangle}
          alert={ops.escalations.criticalOpen > 0}
        />
        <StatCard
          label="Pending Approvals"
          value={ops.approvals.pending}
          hint={`${ops.approvals.total} total`}
          href="/approvals"
          icon={CheckSquare}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <QueuePanel
          title="Open Tasks"
          href="/tasks"
          rows={ops.queues.openTasks.map((t) => ({
            id: t.id,
            title: t.title,
            meta: t.priority,
          }))}
        />
        <QueuePanel
          title="Open Escalations"
          href="/escalations"
          rows={ops.queues.openEscalations.map((e) => ({
            id: e.id,
            title: e.title,
            meta: e.severity,
          }))}
        />
        <QueuePanel
          title="Pending Approvals"
          href="/approvals"
          rows={ops.queues.pendingApprovals.map((a) => ({
            id: a.id,
            title: a.title,
            meta: a.requestedBy ?? "—",
          }))}
        />
        <QueuePanel
          title="Recent Decisions"
          href="/decisions"
          rows={ops.queues.recentDecisions.map((d) => ({
            id: d.id,
            title: d.title,
            meta: d.status,
          }))}
        />
      </div>
    </div>
  );
}

export default function Operations() {
  const { data, isLoading, isError } = useOperations();

  if (isLoading) return <LoadingState />;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <p className="p-12 text-center text-sm text-destructive">
            Failed to load operations.
          </p>
        </Card>
      </div>
    );
  }
  return <Content ops={data} />;
}
