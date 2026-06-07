import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useBusinesses,
  useCreateBusiness,
  useUpdateBusiness,
  useDeleteBusiness,
  type JarvisBusiness,
} from "@/hooks/useJarvisApi";

export default function Businesses() {
  const { data, isLoading, isError } = useBusinesses();
  const create = useCreateBusiness();
  const update = useUpdateBusiness();
  const remove = useDeleteBusiness();

  return (
    <RegistryView
      title="Businesses"
      description="The portfolio of companies under management."
      entityLabel="Business"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "slug", label: "Slug", render: (r) => <span className="text-muted-foreground">{r.slug}</span> },
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
        { name: "name", label: "Name", required: true, placeholder: "e.g. AICandlez" },
        { name: "description", label: "Description", type: "textarea", placeholder: "What does this business do?" },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "Paused", value: "paused" },
            { label: "Archived", value: "archived" },
          ],
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        description: r.description ?? "",
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({ name: v.name, description: v.description || null, status: v.status })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({ id, name: v.name, description: v.description || null, status: v.status })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
