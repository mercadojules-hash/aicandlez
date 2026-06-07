import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useBusinesses,
  useProjects,
  useAgents,
} from "@/hooks/useJarvisApi";

const UNASSIGNED = "__none__";

function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "urgent"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : priority === "high"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : priority === "low"
          ? "border-border bg-muted text-muted-foreground"
          : "border-blue-500/30 bg-blue-500/10 text-blue-500";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${tone}`}>
      {priority}
    </span>
  );
}

export default function Tasks() {
  const { data, isLoading, isError } = useTasks();
  const { data: businesses } = useBusinesses();
  const { data: projects } = useProjects();
  const { data: agents } = useAgents();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const nameOf = (
    list: { id: string; name: string }[] | undefined,
    id: string | null,
  ) => (id ? (list?.find((x) => x.id === id)?.name ?? "—") : "—");

  const optionsOf = (list: { id: string; name: string }[] | undefined) => [
    { label: "Unassigned", value: UNASSIGNED },
    ...(list ?? []).map((x) => ({ label: x.name, value: x.id })),
  ];

  const resolveId = (v: string) => (v && v !== UNASSIGNED ? v : null);

  return (
    <RegistryView
      title="Tasks"
      description="Operational work items tracked across the portfolio."
      entityLabel="Task"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        {
          key: "title",
          label: "Title",
          render: (r) => <span className="font-medium">{r.title}</span>,
        },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        {
          key: "priority",
          label: "Priority",
          render: (r) => <PriorityBadge priority={r.priority} />,
        },
        {
          key: "business",
          label: "Business",
          render: (r) => (
            <span className="text-muted-foreground">{nameOf(businesses, r.businessId)}</span>
          ),
        },
        {
          key: "assignee",
          label: "Assignee",
          render: (r) => (
            <span className="text-muted-foreground">{nameOf(agents, r.assigneeAgentId)}</span>
          ),
        },
        {
          key: "due",
          label: "Due",
          render: (r) => (
            <span className="text-muted-foreground">
              {r.dueAt ? new Date(r.dueAt).toLocaleDateString() : "—"}
            </span>
          ),
        },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Finalize Q3 budget" },
        { name: "description", label: "Description", type: "textarea" },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "todo",
          options: [
            { label: "To Do", value: "todo" },
            { label: "In Progress", value: "in_progress" },
            { label: "Blocked", value: "blocked" },
            { label: "Done", value: "done" },
          ],
        },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          defaultValue: "medium",
          options: [
            { label: "Low", value: "low" },
            { label: "Medium", value: "medium" },
            { label: "High", value: "high" },
            { label: "Urgent", value: "urgent" },
          ],
        },
        {
          name: "businessId",
          label: "Business",
          type: "select",
          defaultValue: UNASSIGNED,
          options: optionsOf(businesses),
        },
        {
          name: "projectId",
          label: "Project",
          type: "select",
          defaultValue: UNASSIGNED,
          options: optionsOf(projects),
        },
        {
          name: "assigneeAgentId",
          label: "Assignee",
          type: "select",
          defaultValue: UNASSIGNED,
          options: optionsOf(agents),
        },
        { name: "dueAt", label: "Due Date", type: "date" },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        description: r.description ?? "",
        status: r.status,
        priority: r.priority,
        businessId: r.businessId ?? UNASSIGNED,
        projectId: r.projectId ?? UNASSIGNED,
        assigneeAgentId: r.assigneeAgentId ?? UNASSIGNED,
        dueAt: r.dueAt ? r.dueAt.slice(0, 10) : "",
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          description: v.description || null,
          status: v.status,
          priority: v.priority,
          businessId: resolveId(v.businessId),
          projectId: resolveId(v.projectId),
          assigneeAgentId: resolveId(v.assigneeAgentId),
          dueAt: v.dueAt || null,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          title: v.title,
          description: v.description || null,
          status: v.status,
          priority: v.priority,
          businessId: resolveId(v.businessId),
          projectId: resolveId(v.projectId),
          assigneeAgentId: resolveId(v.assigneeAgentId),
          dueAt: v.dueAt || null,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
