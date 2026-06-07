import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  type JarvisWorkflow,
} from "@/hooks/useJarvisApi";

export default function Workflows() {
  const { data, isLoading, isError } = useWorkflows();
  const create = useCreateWorkflow();
  const update = useUpdateWorkflow();
  const remove = useDeleteWorkflow();

  return (
    <RegistryView
      title="Workflows"
      description="Automated routines orchestrated across your agents."
      entityLabel="Workflow"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "trigger", label: "Trigger", render: (r) => <span className="text-muted-foreground capitalize">{r.trigger}</span> },
        {
          key: "description",
          label: "Description",
          render: (r) => (
            <span className="line-clamp-1 text-muted-foreground">{r.description ?? "—"}</span>
          ),
        },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. Daily Standup Digest" },
        {
          name: "trigger",
          label: "Trigger",
          type: "select",
          defaultValue: "manual",
          options: [
            { label: "Manual", value: "manual" },
            { label: "Scheduled", value: "scheduled" },
            { label: "Event", value: "event" },
            { label: "Webhook", value: "webhook" },
          ],
        },
        { name: "description", label: "Description", type: "textarea" },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "Idle", value: "idle" },
            { label: "Disabled", value: "disabled" },
          ],
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        trigger: r.trigger,
        description: r.description ?? "",
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          name: v.name,
          trigger: v.trigger || "manual",
          description: v.description || null,
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          name: v.name,
          trigger: v.trigger || "manual",
          description: v.description || null,
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
