import { RegistryView } from "@/components/RegistryView";
import { Badge } from "@/components/ui/badge";
import { Pin } from "lucide-react";
import {
  useMemories,
  useCreateMemory,
  useUpdateMemory,
  useDeleteMemory,
  useCategories,
  useBusinesses,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

const MEMORY_TYPES = [
  { label: "Fact", value: "fact" },
  { label: "Decision", value: "decision" },
  { label: "Preference", value: "preference" },
  { label: "Lesson", value: "lesson" },
  { label: "Context", value: "context" },
  { label: "Directive", value: "directive" },
];

function ImportanceBadge({ importance }: { importance: string }) {
  const tone =
    importance === "critical"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : importance === "high"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : importance === "low"
          ? "border-border bg-muted text-muted-foreground"
          : "border-blue-500/30 bg-blue-500/10 text-blue-500";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${tone}`}>
      {importance}
    </span>
  );
}

export default function Memories() {
  const { data, isLoading, isError } = useMemories();
  const { data: categories } = useCategories();
  const { data: businesses } = useBusinesses();
  const create = useCreateMemory();
  const update = useUpdateMemory();
  const remove = useDeleteMemory();

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
      title="Executive Memory"
      description="Atomic, typed memories — facts, decisions, preferences, lessons, context, and directives."
      entityLabel="Memory"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        {
          key: "title",
          label: "Memory",
          render: (r) => (
            <span className="flex items-center gap-2 font-medium">
              {r.pinned ? <Pin className="h-3.5 w-3.5 text-primary" /> : null}
              {r.title}
            </span>
          ),
        },
        {
          key: "memoryType",
          label: "Type",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.memoryType}
            </Badge>
          ),
        },
        {
          key: "importance",
          label: "Importance",
          render: (r) => <ImportanceBadge importance={r.importance} />,
        },
        {
          key: "category",
          label: "Category",
          render: (r) => (
            <span className="text-muted-foreground">{catName(r.categoryId)}</span>
          ),
        },
        {
          key: "source",
          label: "Source",
          render: (r) => (
            <span className="text-muted-foreground">{r.sourceType ?? "—"}</span>
          ),
        },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Prefers async standups" },
        { name: "content", label: "Content", type: "textarea" },
        {
          name: "memoryType",
          label: "Type",
          type: "select",
          defaultValue: "fact",
          options: MEMORY_TYPES,
        },
        {
          name: "importance",
          label: "Importance",
          type: "select",
          defaultValue: "normal",
          options: [
            { label: "Low", value: "low" },
            { label: "Normal", value: "normal" },
            { label: "High", value: "high" },
            { label: "Critical", value: "critical" },
          ],
        },
        {
          name: "pinned",
          label: "Pinned",
          type: "select",
          defaultValue: "false",
          options: [
            { label: "No", value: "false" },
            { label: "Yes", value: "true" },
          ],
        },
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
        { name: "sourceType", label: "Source Type", placeholder: "e.g. meeting, decision" },
        { name: "sourceId", label: "Source ID", placeholder: "optional reference" },
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
        content: r.content ?? "",
        memoryType: r.memoryType,
        importance: r.importance,
        pinned: r.pinned ? "true" : "false",
        categoryId: r.categoryId ?? NONE,
        businessId: r.businessId ?? NONE,
        sourceType: r.sourceType ?? "",
        sourceId: r.sourceId ?? "",
        tags: (r.tags ?? []).join(", "),
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          content: v.content || null,
          memoryType: v.memoryType,
          importance: v.importance,
          pinned: v.pinned === "true",
          categoryId: resolveId(v.categoryId),
          businessId: resolveId(v.businessId),
          sourceType: v.sourceType || null,
          sourceId: v.sourceId || null,
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          title: v.title,
          content: v.content || null,
          memoryType: v.memoryType,
          importance: v.importance,
          pinned: v.pinned === "true",
          categoryId: resolveId(v.categoryId),
          businessId: resolveId(v.businessId),
          sourceType: v.sourceType || null,
          sourceId: v.sourceId || null,
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
