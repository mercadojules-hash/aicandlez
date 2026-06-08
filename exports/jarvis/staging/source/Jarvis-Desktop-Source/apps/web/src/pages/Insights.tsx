import { RegistryView } from "@/components/RegistryView";
import { Badge } from "@/components/ui/badge";
import {
  useInsights,
  useCreateInsight,
  useUpdateInsight,
  useDeleteInsight,
  useFindings,
  useBusinesses,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

const INSIGHT_TYPES = [
  { label: "Trend", value: "trend" },
  { label: "Pattern", value: "pattern" },
  { label: "Anomaly", value: "anomaly" },
  { label: "Forecast", value: "forecast" },
  { label: "Correlation", value: "correlation" },
  { label: "Benchmark", value: "benchmark" },
];

const STATUSES = [
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

export default function Insights() {
  const { data, isLoading, isError } = useInsights();
  const { data: findings } = useFindings();
  const { data: businesses } = useBusinesses();
  const create = useCreateInsight();
  const update = useUpdateInsight();
  const remove = useDeleteInsight();

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
  const parseConfidence = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : undefined;
  };

  return (
    <RegistryView
      title="Insights"
      description="Generated intelligence — trends, patterns, and forecasts distilled from the corpus."
      entityLabel="Insight"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "title", label: "Insight", render: (r) => <span className="font-medium">{r.title}</span> },
        {
          key: "insightType",
          label: "Type",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.insightType}
            </Badge>
          ),
        },
        {
          key: "confidence",
          label: "Confidence",
          render: (r) => <span className="text-muted-foreground">{r.confidence}%</span>,
        },
        {
          key: "source",
          label: "Source",
          render: (r) => <span className="text-muted-foreground">{r.source ?? "—"}</span>,
        },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span className="text-muted-foreground capitalize">{r.status}</span>
          ),
        },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Weekend signups outperform weekdays 2:1" },
        { name: "content", label: "Content", type: "textarea" },
        { name: "insightType", label: "Type", type: "select", defaultValue: "trend", options: INSIGHT_TYPES },
        { name: "confidence", label: "Confidence (0-100)", defaultValue: "50", placeholder: "50" },
        { name: "source", label: "Source", placeholder: "e.g. cohort analysis" },
        { name: "findingId", label: "Linked Finding", type: "select", defaultValue: NONE, options: findingOptions },
        { name: "businessId", label: "Business", type: "select", defaultValue: NONE, options: businessOptions },
        { name: "tags", label: "Tags", placeholder: "comma, separated, tags" },
        { name: "status", label: "Status", type: "select", defaultValue: "active", options: STATUSES },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        content: r.content ?? "",
        insightType: r.insightType,
        confidence: String(r.confidence),
        source: r.source ?? "",
        findingId: r.findingId ?? NONE,
        businessId: r.businessId ?? NONE,
        tags: (r.tags ?? []).join(", "),
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          content: v.content || null,
          insightType: v.insightType,
          confidence: parseConfidence(v.confidence),
          source: v.source || null,
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
          content: v.content || null,
          insightType: v.insightType,
          confidence: parseConfidence(v.confidence),
          source: v.source || null,
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
