import { RegistryView } from "@/components/RegistryView";
import { Badge } from "@/components/ui/badge";
import {
  useRecommendations,
  useCreateRecommendation,
  useUpdateRecommendation,
  useDeleteRecommendation,
  useFindings,
  useBusinesses,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

const LEVELS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const STATUSES = [
  { label: "Proposed", value: "proposed" },
  { label: "Accepted", value: "accepted" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
  { label: "Rejected", value: "rejected" },
];

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
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${tone}`}
    >
      {priority}
    </span>
  );
}

export default function Recommendations() {
  const { data, isLoading, isError } = useRecommendations();
  const { data: findings } = useFindings();
  const { data: businesses } = useBusinesses();
  const create = useCreateRecommendation();
  const update = useUpdateRecommendation();
  const remove = useDeleteRecommendation();

  const businessOptions = [
    { label: "Unassigned", value: NONE },
    ...(businesses ?? []).map((x) => ({ label: x.name, value: x.id })),
  ];
  const findingOptions = [
    { label: "None", value: NONE },
    ...(findings ?? []).map((f) => ({ label: f.title, value: f.id })),
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
      title="Recommendations"
      description="Decision-ready actions derived from findings — prioritized by impact and effort."
      entityLabel="Recommendation"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "title", label: "Recommendation", render: (r) => <span className="font-medium">{r.title}</span> },
        { key: "priority", label: "Priority", render: (r) => <PriorityBadge priority={r.priority} /> },
        {
          key: "impact",
          label: "Impact",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.impact}
            </Badge>
          ),
        },
        {
          key: "effort",
          label: "Effort",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.effort}
            </Badge>
          ),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span className="text-muted-foreground capitalize">
              {r.status.replace(/_/g, " ")}
            </span>
          ),
        },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Launch EMEA retention campaign" },
        { name: "rationale", label: "Rationale", type: "textarea" },
        { name: "action", label: "Action", type: "textarea", placeholder: "Concrete next step" },
        { name: "priority", label: "Priority", type: "select", defaultValue: "medium", options: PRIORITIES },
        { name: "impact", label: "Impact", type: "select", defaultValue: "medium", options: LEVELS },
        { name: "effort", label: "Effort", type: "select", defaultValue: "medium", options: LEVELS },
        { name: "findingId", label: "Linked Finding", type: "select", defaultValue: NONE, options: findingOptions },
        { name: "businessId", label: "Business", type: "select", defaultValue: NONE, options: businessOptions },
        { name: "tags", label: "Tags", placeholder: "comma, separated, tags" },
        { name: "status", label: "Status", type: "select", defaultValue: "proposed", options: STATUSES },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        rationale: r.rationale ?? "",
        action: r.action ?? "",
        priority: r.priority,
        impact: r.impact,
        effort: r.effort,
        findingId: r.findingId ?? NONE,
        businessId: r.businessId ?? NONE,
        tags: (r.tags ?? []).join(", "),
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          rationale: v.rationale || null,
          action: v.action || null,
          priority: v.priority,
          impact: v.impact,
          effort: v.effort,
          findingId: resolveId(v.findingId),
          businessId: resolveId(v.businessId),
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          title: v.title,
          rationale: v.rationale || null,
          action: v.action || null,
          priority: v.priority,
          impact: v.impact,
          effort: v.effort,
          findingId: resolveId(v.findingId),
          businessId: resolveId(v.businessId),
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
