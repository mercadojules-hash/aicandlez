import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useEscalations,
  useCreateEscalation,
  useUpdateEscalation,
  useDeleteEscalation,
  useBusinesses,
  useAgents,
} from "@/hooks/useJarvisApi";

const UNASSIGNED = "__none__";

function SeverityBadge({ severity }: { severity: string }) {
  const tone =
    severity === "critical"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : severity === "high"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : severity === "low"
          ? "border-border bg-muted text-muted-foreground"
          : "border-blue-500/30 bg-blue-500/10 text-blue-500";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${tone}`}>
      {severity}
    </span>
  );
}

export default function Escalations() {
  const { data, isLoading, isError } = useEscalations();
  const { data: businesses } = useBusinesses();
  const { data: agents } = useAgents();
  const create = useCreateEscalation();
  const update = useUpdateEscalation();
  const remove = useDeleteEscalation();

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
      title="Escalations"
      description="Issues raised for executive attention and resolution."
      entityLabel="Escalation"
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
        {
          key: "severity",
          label: "Severity",
          render: (r) => <SeverityBadge severity={r.severity} />,
        },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
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
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Vendor SLA breach" },
        { name: "description", label: "Description", type: "textarea" },
        {
          name: "severity",
          label: "Severity",
          type: "select",
          defaultValue: "medium",
          options: [
            { label: "Low", value: "low" },
            { label: "Medium", value: "medium" },
            { label: "High", value: "high" },
            { label: "Critical", value: "critical" },
          ],
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "open",
          options: [
            { label: "Open", value: "open" },
            { label: "Acknowledged", value: "acknowledged" },
            { label: "Resolved", value: "resolved" },
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
          name: "assigneeAgentId",
          label: "Assignee",
          type: "select",
          defaultValue: UNASSIGNED,
          options: optionsOf(agents),
        },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        description: r.description ?? "",
        severity: r.severity,
        status: r.status,
        businessId: r.businessId ?? UNASSIGNED,
        assigneeAgentId: r.assigneeAgentId ?? UNASSIGNED,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          description: v.description || null,
          severity: v.severity,
          status: v.status,
          businessId: resolveId(v.businessId),
          assigneeAgentId: resolveId(v.assigneeAgentId),
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          title: v.title,
          description: v.description || null,
          severity: v.severity,
          status: v.status,
          businessId: resolveId(v.businessId),
          assigneeAgentId: resolveId(v.assigneeAgentId),
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
