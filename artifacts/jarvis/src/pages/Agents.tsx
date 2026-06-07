import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useAgents,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useRunAgent,
  type JarvisAgent,
} from "@/hooks/useJarvisApi";

const AGENT_TYPE_OPTIONS = [
  { label: "Custom", value: "custom" },
  { label: "Chief of Staff", value: "chief_of_staff" },
  { label: "Operations", value: "operations" },
  { label: "Risk", value: "risk" },
  { label: "Memory", value: "memory" },
  { label: "QA", value: "qa" },
];

function RunButton({ agent }: { agent: JarvisAgent }) {
  const run = useRunAgent();
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8"
      disabled={run.isPending || agent.runtimeStatus === "running"}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          const { outcome } = await run.mutateAsync(agent.id);
          if (outcome.ok) {
            toast.success(`${agent.name}: ${outcome.summary ?? "run complete"}`);
          } else {
            toast.error(`${agent.name} failed: ${outcome.error ?? "unknown error"}`);
          }
        } catch {
          toast.error(`Could not run ${agent.name}`);
        }
      }}
    >
      <Play className="mr-1 h-3.5 w-3.5" />
      Run
    </Button>
  );
}

export default function Agents() {
  const { data, isLoading, isError } = useAgents();
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const remove = useDeleteAgent();

  return (
    <RegistryView
      title="Agents"
      description="The autonomous operators in your command structure."
      entityLabel="Agent"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        {
          key: "name",
          label: "Name",
          render: (r) => <span className="font-medium">{r.name}</span>,
        },
        {
          key: "agentType",
          label: "Type",
          render: (r) => (
            <Badge variant="outline" className="font-mono text-[11px]">
              {r.agentType}
            </Badge>
          ),
        },
        {
          key: "enabled",
          label: "Scheduler",
          render: (r) =>
            r.enabled ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              >
                {r.scheduleSeconds ? `every ${r.scheduleSeconds}s` : "enabled"}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">disabled</span>
            ),
        },
        {
          key: "runtimeStatus",
          label: "Runtime",
          render: (r) => <StatusBadge status={r.runtimeStatus} />,
        },
        {
          key: "lastRun",
          label: "Last Run",
          render: (r) =>
            r.lastRunAt ? (
              <span
                className={
                  r.lastRunStatus === "failed"
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {new Date(r.lastRunAt).toLocaleString()}
                {r.lastRunStatus ? ` · ${r.lastRunStatus}` : ""}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">never</span>
            ),
        },
        {
          key: "run",
          label: "",
          render: (r) => <RunButton agent={r} />,
        },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. Chief of Staff" },
        {
          name: "agentType",
          label: "Agent Type",
          type: "select",
          defaultValue: "custom",
          options: AGENT_TYPE_OPTIONS,
        },
        { name: "role", label: "Role", placeholder: "e.g. Orchestration" },
        { name: "description", label: "Description", type: "textarea" },
        {
          name: "enabled",
          label: "Scheduler Enabled",
          type: "select",
          defaultValue: "false",
          options: [
            { label: "Disabled", value: "false" },
            { label: "Enabled", value: "true" },
          ],
        },
        {
          name: "scheduleSeconds",
          label: "Schedule (seconds, blank = manual only)",
          placeholder: "e.g. 300",
        },
        {
          name: "priority",
          label: "Priority (lower runs first)",
          placeholder: "100",
          defaultValue: "100",
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "Paused", value: "paused" },
            { label: "Offline", value: "offline" },
          ],
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        agentType: r.agentType,
        role: r.role ?? "",
        description: r.description ?? "",
        enabled: r.enabled ? "true" : "false",
        scheduleSeconds: r.scheduleSeconds != null ? String(r.scheduleSeconds) : "",
        priority: String(r.priority),
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          name: v.name,
          agentType: v.agentType || "custom",
          role: v.role || null,
          description: v.description || null,
          enabled: v.enabled === "true",
          scheduleSeconds: parseScheduleSeconds(v.scheduleSeconds),
          priority: parsePriority(v.priority),
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          name: v.name,
          agentType: v.agentType || "custom",
          role: v.role || null,
          description: v.description || null,
          enabled: v.enabled === "true",
          scheduleSeconds: parseScheduleSeconds(v.scheduleSeconds),
          priority: parsePriority(v.priority),
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}

function parseScheduleSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 5 ? Math.floor(n) : null;
}

function parsePriority(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? Math.floor(n) : 100;
}
