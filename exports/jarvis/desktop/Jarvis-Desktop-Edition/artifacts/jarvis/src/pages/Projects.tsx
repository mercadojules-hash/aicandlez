import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useBusinesses,
  type JarvisProject,
} from "@/hooks/useJarvisApi";

const UNASSIGNED = "__none__";

export default function Projects() {
  const { data, isLoading, isError } = useProjects();
  const { data: businesses } = useBusinesses();
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();

  const businessName = (id: string | null) =>
    id ? businesses?.find((b) => b.id === id)?.name ?? "—" : "—";

  const businessOptions = [
    { label: "Unassigned", value: UNASSIGNED },
    ...(businesses ?? []).map((b) => ({ label: b.name, value: b.id })),
  ];

  const resolveBusinessId = (v: string) => (v && v !== UNASSIGNED ? v : null);

  return (
    <RegistryView
      title="Projects"
      description="Initiatives in flight across the portfolio."
      entityLabel="Project"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        {
          key: "business",
          label: "Business",
          render: (r) => <span className="text-muted-foreground">{businessName(r.businessId)}</span>,
        },
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
        { name: "name", label: "Name", required: true, placeholder: "e.g. Q3 Launch" },
        {
          name: "businessId",
          label: "Business",
          type: "select",
          defaultValue: UNASSIGNED,
          options: businessOptions,
        },
        { name: "description", label: "Description", type: "textarea" },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "Paused", value: "paused" },
            { label: "Completed", value: "completed" },
            { label: "Archived", value: "archived" },
          ],
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        businessId: r.businessId ?? UNASSIGNED,
        description: r.description ?? "",
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          name: v.name,
          businessId: resolveBusinessId(v.businessId),
          description: v.description || null,
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          name: v.name,
          businessId: resolveBusinessId(v.businessId),
          description: v.description || null,
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
