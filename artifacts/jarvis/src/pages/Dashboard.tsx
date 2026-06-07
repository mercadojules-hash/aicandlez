import {
  Building2,
  FolderKanban,
  Bot,
  Workflow,
  Activity,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useJarvisDashboard, type JarvisAuditLog } from "@/hooks/useJarvisApi";

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ActivityLine({ log }: { log: JarvisAuditLog }) {
  const name =
    log.metadata && typeof log.metadata.name === "string"
      ? (log.metadata.name as string)
      : log.entityId ?? "";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <Badge variant="outline" className="shrink-0 capitalize">
          {log.action}
        </Badge>
        <span className="truncate text-sm">
          <span className="capitalize text-muted-foreground">{log.entityType}</span>
          {name ? <span className="ml-1 font-medium">{name}</span> : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden sm:inline">{log.userEmail ?? "system"}</span>
        <span>{relativeTime(log.createdAt)}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, isError } = useJarvisDashboard();

  const stats = [
    { label: "Businesses", value: data?.counts.businesses, icon: Building2 },
    { label: "Projects", value: data?.counts.projects, icon: FolderKanban },
    { label: "Agents", value: data?.counts.agents, icon: Bot },
    { label: "Workflows", value: data?.counts.workflows, icon: Workflow },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executive Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Operational overview across your portfolio.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums">
                {isLoading ? <Skeleton className="h-8 w-12" /> : (s.value ?? 0)}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              Failed to load activity.
            </p>
          ) : data && data.recentActivity.length > 0 ? (
            <div>
              {data.recentActivity.map((log) => (
                <ActivityLine key={log.id} log={log} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">System Health</h2>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">API</dt>
              <dd className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="capitalize">{data?.systemHealth.apiStatus ?? "—"}</span>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Database</dt>
              <dd className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="capitalize">
                  {data?.systemHealth.databaseStatus ?? "—"}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Active Agents</dt>
              <dd className="tabular-nums">{data?.systemHealth.activeAgents ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Active Workflows</dt>
              <dd className="tabular-nums">
                {data?.systemHealth.activeWorkflows ?? "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Uptime
              </dt>
              <dd className="tabular-nums">
                {data ? formatUptime(data.systemHealth.uptimeSeconds) : "—"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
