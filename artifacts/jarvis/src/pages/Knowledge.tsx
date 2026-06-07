import { RegistryView, StatusBadge } from "@/components/RegistryView";
import { Badge } from "@/components/ui/badge";
import {
  useAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useCategories,
  useBusinesses,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

const ASSET_TYPES = [
  { label: "Document", value: "document" },
  { label: "Note", value: "note" },
  { label: "Link", value: "link" },
  { label: "Reference", value: "reference" },
  { label: "File", value: "file" },
];

export default function Knowledge() {
  const { data, isLoading, isError } = useAssets();
  const { data: categories } = useCategories();
  const { data: businesses } = useBusinesses();
  const create = useCreateAsset();
  const update = useUpdateAsset();
  const remove = useDeleteAsset();

  const catName = (id: string | null) =>
    id ? (categories?.find((c) => c.id === id)?.name ?? "—") : "—";

  const optionsOf = (list: { id: string; name: string }[] | undefined) => [
    { label: "Unassigned", value: NONE },
    ...(list ?? []).map((x) => ({ label: x.name, value: x.id })),
  ];

  const resolveId = (v: string) => (v && v !== NONE ? v : null);
  const parseTags = (v: string) =>
    v
      ? v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : null;

  return (
    <RegistryView
      title="Knowledge Repository"
      description="Documents, notes, links, and references that form the enterprise knowledge base."
      entityLabel="Asset"
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
          key: "assetType",
          label: "Type",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.assetType}
            </Badge>
          ),
        },
        {
          key: "category",
          label: "Category",
          render: (r) => (
            <span className="text-muted-foreground">{catName(r.categoryId)}</span>
          ),
        },
        {
          key: "tags",
          label: "Tags",
          render: (r) =>
            r.tags && r.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {r.tags.slice(0, 3).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. 2026 Investor Brief" },
        { name: "summary", label: "Summary", type: "textarea" },
        { name: "content", label: "Content", type: "textarea" },
        {
          name: "assetType",
          label: "Type",
          type: "select",
          defaultValue: "document",
          options: ASSET_TYPES,
        },
        { name: "sourceUrl", label: "Source URL", placeholder: "https://…" },
        {
          name: "categoryId",
          label: "Category",
          type: "select",
          defaultValue: NONE,
          options: optionsOf(categories),
        },
        {
          name: "businessId",
          label: "Business",
          type: "select",
          defaultValue: NONE,
          options: optionsOf(businesses),
        },
        { name: "tags", label: "Tags", placeholder: "comma, separated, tags" },
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
        title: r.title,
        summary: r.summary ?? "",
        content: r.content ?? "",
        assetType: r.assetType,
        sourceUrl: r.sourceUrl ?? "",
        categoryId: r.categoryId ?? NONE,
        businessId: r.businessId ?? NONE,
        tags: (r.tags ?? []).join(", "),
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          summary: v.summary || null,
          content: v.content || null,
          assetType: v.assetType,
          sourceUrl: v.sourceUrl || null,
          categoryId: resolveId(v.categoryId),
          businessId: resolveId(v.businessId),
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          title: v.title,
          summary: v.summary || null,
          content: v.content || null,
          assetType: v.assetType,
          sourceUrl: v.sourceUrl || null,
          categoryId: resolveId(v.categoryId),
          businessId: resolveId(v.businessId),
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
