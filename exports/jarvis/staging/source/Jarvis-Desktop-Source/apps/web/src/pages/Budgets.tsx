import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from "@/hooks/useJarvisApi";

const SCOPE_TYPES = [
  { label: "Global", value: "global" },
  { label: "Agent Type", value: "agent_type" },
  { label: "Action", value: "action" },
  { label: "Verb", value: "verb" },
];

function fmtWindow(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export default function Budgets() {
  const { data, isLoading, isError } = useBudgets();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();

  return (
    <RegistryView
      title="Budgets & Quotas"
      description="Rate-limit orchestration actions per rolling window. Exceeding a budget downgrades the action to require-approval."
      entityLabel="Budget"
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
          key: "scope",
          label: "Scope",
          render: (r) => (
            <span className="font-mono text-xs text-muted-foreground">
              {r.scopeType}
              {r.scopeValue ? `: ${r.scopeValue}` : ""}
            </span>
          ),
        },
        {
          key: "usage",
          label: "Usage",
          render: (r) => (
            <span className="font-mono text-xs">
              {r.consumed}/{r.limitCount} · {fmtWindow(r.windowSeconds)}
            </span>
          ),
        },
        {
          key: "enabled",
          label: "Status",
          render: (r) => (
            <StatusBadge status={r.enabled ? "active" : "disabled"} />
          ),
        },
      ]}
      fields={[
        {
          name: "name",
          label: "Name",
          required: true,
          placeholder: "e.g. Risk delegations / hour",
        },
        {
          name: "scopeType",
          label: "Scope Type",
          type: "select",
          defaultValue: "global",
          options: SCOPE_TYPES,
        },
        {
          name: "scopeValue",
          label: "Scope Value",
          placeholder: "e.g. risk (blank for global)",
        },
        {
          name: "limitCount",
          label: "Limit (count)",
          placeholder: "100",
          defaultValue: "100",
        },
        {
          name: "windowSeconds",
          label: "Window (seconds)",
          placeholder: "3600",
          defaultValue: "3600",
        },
        {
          name: "enabled",
          label: "Enabled",
          type: "select",
          defaultValue: "true",
          options: [
            { label: "Enabled", value: "true" },
            { label: "Disabled", value: "false" },
          ],
        },
        { name: "description", label: "Description", type: "textarea" },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        scopeType: r.scopeType,
        scopeValue: r.scopeValue ?? "",
        limitCount: String(r.limitCount),
        windowSeconds: String(r.windowSeconds),
        enabled: r.enabled ? "true" : "false",
        description: r.description ?? "",
      })}
      onCreate={(v) =>
        create.mutateAsync({
          name: v.name,
          scopeType: (v.scopeType || "global") as never,
          scopeValue: v.scopeValue || null,
          limitCount: Number(v.limitCount) || 100,
          windowSeconds: Number(v.windowSeconds) || 3600,
          enabled: v.enabled !== "false",
          description: v.description || null,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          name: v.name,
          scopeType: (v.scopeType || "global") as never,
          scopeValue: v.scopeValue || null,
          limitCount: Number(v.limitCount) || 100,
          windowSeconds: Number(v.windowSeconds) || 3600,
          enabled: v.enabled !== "false",
          description: v.description || null,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
