import { RegistryView } from "@/components/RegistryView";
import { Badge } from "@/components/ui/badge";
import {
  useBriefings,
  useCreateBriefing,
  useUpdateBriefing,
  useDeleteBriefing,
  useBusinesses,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

const PERIODS = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Ad Hoc", value: "ad_hoc" },
];

const AUDIENCES = [
  { label: "Executive", value: "executive" },
  { label: "Board", value: "board" },
  { label: "Operations", value: "operations" },
  { label: "Investors", value: "investors" },
];

const STATUSES = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
];

export default function Briefings() {
  const { data, isLoading, isError } = useBriefings();
  const { data: businesses } = useBusinesses();
  const create = useCreateBriefing();
  const update = useUpdateBriefing();
  const remove = useDeleteBriefing();

  const businessOptions = [
    { label: "Unassigned", value: NONE },
    ...(businesses ?? []).map((x) => ({ label: x.name, value: x.id })),
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
      title="Executive Briefings"
      description="Periodic executive summaries — synthesized findings, insights, and recommendations."
      entityLabel="Briefing"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "title", label: "Briefing", render: (r) => <span className="font-medium">{r.title}</span> },
        {
          key: "period",
          label: "Period",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.period.replace(/_/g, " ")}
            </Badge>
          ),
        },
        {
          key: "audience",
          label: "Audience",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.audience}
            </Badge>
          ),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${
                r.status === "published"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {r.status}
            </span>
          ),
        },
        {
          key: "publishedAt",
          label: "Published",
          render: (r) => (
            <span className="text-muted-foreground">
              {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : "—"}
            </span>
          ),
        },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Q2 Executive Briefing" },
        { name: "summary", label: "Summary", type: "textarea", placeholder: "Headline takeaways" },
        { name: "content", label: "Content", type: "textarea" },
        { name: "period", label: "Period", type: "select", defaultValue: "weekly", options: PERIODS },
        { name: "audience", label: "Audience", type: "select", defaultValue: "executive", options: AUDIENCES },
        { name: "businessId", label: "Business", type: "select", defaultValue: NONE, options: businessOptions },
        { name: "tags", label: "Tags", placeholder: "comma, separated, tags" },
        { name: "status", label: "Status", type: "select", defaultValue: "draft", options: STATUSES },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        summary: r.summary ?? "",
        content: r.content ?? "",
        period: r.period,
        audience: r.audience,
        businessId: r.businessId ?? NONE,
        tags: (r.tags ?? []).join(", "),
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          summary: v.summary || null,
          content: v.content || null,
          period: v.period,
          audience: v.audience,
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
          period: v.period,
          audience: v.audience,
          businessId: resolveId(v.businessId),
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
