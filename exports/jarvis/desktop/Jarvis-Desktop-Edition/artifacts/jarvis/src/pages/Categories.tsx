import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

export default function Categories() {
  const { data, isLoading, isError } = useCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const nameOf = (id: string | null) =>
    id ? (data?.find((c) => c.id === id)?.name ?? "—") : "—";

  const parentOptions = [
    { label: "None (top level)", value: NONE },
    ...(data ?? []).map((c) => ({ label: c.name, value: c.id })),
  ];

  const resolveId = (v: string) => (v && v !== NONE ? v : null);

  return (
    <RegistryView
      title="Knowledge Categories"
      description="A hierarchical taxonomy that organizes memories and knowledge assets."
      entityLabel="Category"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        {
          key: "name",
          label: "Name",
          render: (r) => (
            <span className="flex items-center gap-2 font-medium">
              {r.color ? (
                <span
                  className="inline-block h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: r.color }}
                />
              ) : null}
              {r.name}
            </span>
          ),
        },
        {
          key: "parent",
          label: "Parent",
          render: (r) => (
            <span className="text-muted-foreground">{nameOf(r.parentId)}</span>
          ),
        },
        {
          key: "description",
          label: "Description",
          render: (r) => (
            <span className="text-muted-foreground line-clamp-1">
              {r.description ?? "—"}
            </span>
          ),
        },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. Finance" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "color", label: "Color", placeholder: "#6366f1" },
        {
          name: "parentId",
          label: "Parent Category",
          type: "select",
          defaultValue: NONE,
          options: parentOptions,
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "Archived", value: "archived" },
          ],
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        description: r.description ?? "",
        color: r.color ?? "",
        parentId: r.parentId ?? NONE,
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          name: v.name,
          description: v.description || null,
          color: v.color || null,
          parentId: resolveId(v.parentId),
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          name: v.name,
          description: v.description || null,
          color: v.color || null,
          parentId: resolveId(v.parentId),
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
