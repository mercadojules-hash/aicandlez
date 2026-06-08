import {
  Building2,
  FolderKanban,
  Bot,
  Workflow,
  Activity,
  Server,
  Database,
  Clock,
  Terminal,
  Cpu,
  AlertTriangle
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useJarvisDashboard, type JarvisAuditLog } from "@/hooks/useJarvisApi";
import { motion } from "framer-motion";

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
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusIndicator({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? "";
  const isOnline = s === "online" || s === "healthy" || s === "up";
  const isDegraded = s === "degraded" || s === "warning";
  
  if (!status || status === "—") return <span className="h-2 w-2 rounded-full bg-muted" />;
  
  return (
    <span className="relative flex h-2 w-2">
      <span
        className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
          isOnline ? "bg-primary animate-ping" : isDegraded ? "bg-amber-500 animate-pulse" : "bg-destructive"
        }`}
      />
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          isOnline ? "bg-primary" : isDegraded ? "bg-amber-500" : "bg-destructive"
        }`}
      />
    </span>
  );
}

function ActivityLine({ log }: { log: JarvisAuditLog }) {
  const name =
    log.metadata && typeof log.metadata.name === "string"
      ? (log.metadata.name as string)
      : log.entityId ?? "";

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="group relative flex items-center justify-between gap-4 border-b border-border/30 py-3 pl-4 pr-4 transition-colors hover:bg-white/[0.02] last:border-0"
    >
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary/0 transition-colors group-hover:bg-primary/50" />

      <div className="flex min-w-0 items-center gap-4">
        <Badge
          variant="outline"
          className="shrink-0 border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-[10px] uppercase text-primary/80"
        >
          {log.action}
        </Badge>
        <div className="flex flex-col">
          <span className="truncate text-sm font-medium text-foreground/90">
            {name ? name : <span className="italic text-muted-foreground">System Target</span>}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
            {log.entityType}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-[10px] text-muted-foreground/60">
        <span>{relativeTime(log.createdAt)}</span>
        <span className="hidden opacity-50 sm:inline">{log.userEmail ?? "SYSTEM"}</span>
      </div>
    </motion.div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export default function Dashboard() {
  const { data, isLoading, isError } = useJarvisDashboard();

  const stats = [
    { label: "Businesses", value: data?.counts.businesses, icon: Building2 },
    { label: "Projects", value: data?.counts.projects, icon: FolderKanban },
    { label: "AI Agents", value: data?.counts.agents, icon: Bot },
    { label: "Workflows", value: data?.counts.workflows, icon: Workflow },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-6xl space-y-8 pb-10"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold uppercase tracking-[0.2em] text-foreground">
            Command Center
          </h1>
          <div className="h-1.5 w-1.5 animate-pulse bg-primary shadow-[0_0_8px_var(--color-primary)]" />
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground/60">
          Executive Operations Overview &bull; Live Telemetry Active
        </p>
      </motion.div>

      {/* KPI Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card
              key={s.label}
              className="group relative overflow-hidden border-border/50 bg-card/40 p-5 transition-all duration-300 hover:border-primary/30 hover:bg-card/60 hover:shadow-[0_8px_30px_-15px_rgba(0,255,255,0.15)]"
            >
              <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-primary/5 blur-2xl transition-opacity group-hover:bg-primary/10" />
              <div className="relative flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  {s.label}
                </span>
                <Icon className="h-4 w-4 text-primary/40 transition-colors group-hover:text-primary/80" />
              </div>
              <div className="relative mt-4 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-semibold tracking-tight text-foreground/90">
                  {isLoading ? <Skeleton className="h-8 w-12" /> : (s.value ?? "—")}
                </span>
              </div>
            </Card>
          );
        })}
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="flex h-[420px] flex-col overflow-hidden border-border/50 bg-card/40 backdrop-blur-sm">
            <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-black/20 px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground/80">
                  Audit Feed
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary/80" />
                </span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-primary/60">
                  Live
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col gap-0 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-sm bg-white/5" />
                  ))}
                </div>
              ) : isError ? (
                <div className="flex h-full items-center justify-center gap-2 text-destructive/80">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider">
                    Telemetry Sync Failure
                  </span>
                </div>
              ) : data && data.recentActivity.length > 0 ? (
                <div className="flex flex-col">
                  {data.recentActivity.map((log) => (
                    <ActivityLine key={log.id} log={log} />
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground/50">
                    No recent events
                  </p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* System Health */}
        <motion.div variants={itemVariants} className="flex flex-col gap-6">
          <Card className="relative overflow-hidden border-primary/20 bg-card/60 p-5 shadow-[0_0_40px_-15px_rgba(0,255,255,0.05)] backdrop-blur-md">
            {/* Cinematic background lines */}
            <div className="pointer-events-none absolute right-0 top-0 h-px w-32 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent" />

            <div className="mb-6 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground/80">
                System Core
              </h2>
            </div>

            <dl className="space-y-5">
              <div className="group flex items-center justify-between">
                <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Server className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
                  API Gateway
                </dt>
                <dd className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-wider text-foreground/90">
                  {isLoading ? (
                    <Skeleton className="h-4 w-16 bg-white/5" />
                  ) : (
                    <>
                      {data?.systemHealth.apiStatus ?? "—"}
                      <StatusIndicator status={data?.systemHealth.apiStatus} />
                    </>
                  )}
                </dd>
              </div>

              <div className="group flex items-center justify-between">
                <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Database className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
                  Database
                </dt>
                <dd className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-wider text-foreground/90">
                  {isLoading ? (
                    <Skeleton className="h-4 w-16 bg-white/5" />
                  ) : (
                    <>
                      {data?.systemHealth.databaseStatus ?? "—"}
                      <StatusIndicator status={data?.systemHealth.databaseStatus} />
                    </>
                  )}
                </dd>
              </div>

              <div className="group flex items-center justify-between">
                <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Bot className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
                  Active Agents
                </dt>
                <dd className="font-mono text-sm font-medium text-primary shadow-primary drop-shadow-[0_0_8px_rgba(0,255,255,0.4)]">
                  {isLoading ? <Skeleton className="h-4 w-8 bg-white/5" /> : (data?.systemHealth.activeAgents ?? "—")}
                </dd>
              </div>

              <div className="group flex items-center justify-between">
                <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Workflow className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
                  Active Workflows
                </dt>
                <dd className="font-mono text-sm font-medium text-primary shadow-primary drop-shadow-[0_0_8px_rgba(0,255,255,0.4)]">
                  {isLoading ? <Skeleton className="h-4 w-8 bg-white/5" /> : (data?.systemHealth.activeWorkflows ?? "—")}
                </dd>
              </div>

              <div className="pt-4">
                <div className="h-px w-full bg-border/40" />
                <div className="mt-4 flex items-center justify-between">
                  <dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                    <Clock className="h-3 w-3" /> Uptime
                  </dt>
                  <dd className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
                    {isLoading ? <Skeleton className="h-3 w-12 bg-white/5" /> : (data ? formatUptime(data.systemHealth.uptimeSeconds) : "—")}
                  </dd>
                </div>
              </div>
            </dl>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
