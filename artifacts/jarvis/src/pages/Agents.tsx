import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useAgents,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  type JarvisAgent,
} from "@/hooks/useJarvisApi";

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
        { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "role", label: "Role", render: (r) => <span className="text-muted-foreground">{r.role || "—"}</span> },
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
        { name: "name", label: "Name", required: true, placeholder: "e.g. Chief of Staff" },
        { name: "role", label: "Role", placeholder: "e.g. Orchestration" },
        { name: "description", label: "Description", type: "textarea" },
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
        role: r.role ?? "",
        description: r.description ?? "",
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          name: v.name,
          role: v.role || null,
          description: v.description || null,
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          name: v.name,
          role: v.role || null,
          description: v.description || null,
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
